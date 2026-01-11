/**
 * REFACTORED SALES ROUTE - Enterprise Architecture
 * 
 * MongoDB Transaction contains ONLY:
 * 1. SalesOrder creation
 * 2. Inventory stock deduction
 * 3. Frozen COGS storage
 * 4. Customer ledger (invoice)
 * 5. Accounting journal entries
 * 
 * Moved to async/event-based processing:
 * - Invoice PDF generation
 * - Notifications (email/SMS/WhatsApp)
 * - Sales metrics updates
 * - Investor profit distribution
 * - Stock movement tracking
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const Sales = require('../models/Sales');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const { eventService, EVENTS } = require('../services/eventService');
const dataIntegrityService = require('../services/dataIntegrityEnforcementService');
const enhancedTransactionService = require('../services/enhancedTransactionService');
const customerTransactionService = require('../services/customerTransactionService');
const accountingService = require('../services/accountingService');
const inventoryService = require('../services/inventoryService');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

const router = express.Router();

// @route   POST /api/sales
// @desc    Create sales order (REFACTORED - Event-Driven)
// @access  Private
router.post('/', [
  auth,
  requirePermission('create_orders'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').isMongoId().withMessage('Valid product ID is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('payment.method').isIn(['cash', 'credit_card', 'debit_card', 'account', 'split']).withMessage('Invalid payment method')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { customer, items, orderType, payment, notes, isTaxExempt } = req.body;

    // ============================================================
    // PHASE 1: PRE-VALIDATION (Before Transaction)
    // ============================================================

    // Validate customer if provided
    let customerData = null;
    if (customer) {
      customerData = await Customer.findById(customer);
      if (!customerData) {
        return res.status(400).json({ message: 'Customer not found' });
      }
    }

    // Validate products and calculate pricing
    const orderItems = [];
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(400).json({ message: `Product ${item.product} not found` });
      }

      // Check stock availability (from Inventory model - source of truth)
      const inventoryRecord = await Inventory.findOne({ product: item.product });
      if (!inventoryRecord) {
        return res.status(400).json({ 
          message: `Inventory record not found for product ${product.name}. Inventory is the single source of truth.` 
        });
      }

      const availableStock = inventoryRecord.currentStock - (inventoryRecord.reservedStock || 0);
      const requestedQuantity = Number(item.quantity);

      if (availableStock < requestedQuantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${product.name}. Available: ${availableStock}, Requested: ${requestedQuantity}`,
          product: product.name,
          availableStock,
          requestedQuantity
        });
      }

      // Calculate pricing
      const customerType = customerData ? customerData.businessType : 'retail';
      const unitPrice = item.unitPrice !== undefined 
        ? item.unitPrice 
        : product.getPriceForCustomerType(customerType, item.quantity);

      const customerDiscount = customerData ? customerData.getEffectiveDiscount() : 0;
      const itemDiscountPercent = Math.max(item.discountPercent || 0, customerDiscount);

      const itemSubtotal = item.quantity * unitPrice;
      const itemDiscount = itemSubtotal * (itemDiscountPercent / 100);
      const itemTaxable = itemSubtotal - itemDiscount;
      const itemTax = isTaxExempt ? 0 : itemTaxable * (product.taxSettings?.taxRate || 0);

      // Get unit cost for COGS (will be frozen in transaction)
      let unitCost = 0;
      if (inventoryRecord.cost) {
        unitCost = inventoryRecord.cost.average || inventoryRecord.cost.lastPurchase || 0;
      }
      if (unitCost === 0) {
        unitCost = product.pricing?.cost || 0;
      }

      orderItems.push({
        product: product._id,
        quantity: item.quantity,
        unitCost, // Will be frozen in transaction
        unitPrice,
        discountPercent: itemDiscountPercent,
        taxRate: product.taxSettings?.taxRate || 0,
        subtotal: itemSubtotal,
        discountAmount: itemDiscount,
        taxAmount: itemTax,
        total: itemSubtotal - itemDiscount + itemTax
      });

      subtotal += itemSubtotal;
      totalDiscount += itemDiscount;
      totalTax += itemTax;
    }

    const orderTotal = subtotal - totalDiscount + totalTax;

    // Credit limit check
    if (customerData && customerData.creditLimit > 0) {
      const paymentMethod = payment?.method || 'cash';
      const amountPaid = payment?.amountPaid || payment?.amount || 0;
      const unpaidAmount = orderTotal - amountPaid;

      if (paymentMethod === 'account' || unpaidAmount > 0) {
        await dataIntegrityService.validateCreditLimit(customerData._id, unpaidAmount);
      }
    }

    // Period lock check
    const transactionDate = new Date();
    await dataIntegrityService.validatePeriodNotLocked(transactionDate, 'create');

    // ============================================================
    // PHASE 2: MONGODB TRANSACTION (CRITICAL OPERATIONS ONLY)
    // ============================================================

    const orderData = {
      orderType: orderType || 'retail',
      customer: customer || null,
      customerInfo: customerData ? {
        name: customerData.displayName,
        email: customerData.email,
        phone: customerData.phone,
        businessName: customerData.businessName
      } : null,
      items: orderItems,
      pricing: {
        subtotal,
        discountAmount: totalDiscount,
        taxAmount: totalTax,
        isTaxExempt: isTaxExempt || false,
        shippingAmount: 0,
        total: orderTotal
      },
      payment: {
        method: payment.method,
        status: payment.isPartialPayment ? 'partial' : (payment.method === 'cash' ? 'paid' : 'pending'),
        amountPaid: payment.amount || 0,
        remainingBalance: payment.remainingBalance || 0,
        isPartialPayment: payment.isPartialPayment || false
      },
      status: 'confirmed',
      notes,
      createdBy: req.user._id
    };

    // Execute atomic transaction
    const transactionResult = await enhancedTransactionService.executeWithTransaction(async (session) => {
      // 1. CREATE SALES ORDER
      const order = new Sales(orderData);
      await order.save({ session });

      // 2. FREEZE COGS AT SALE TIME (in transaction)
      // COGS is frozen in order items (unitCost field)
      // This ensures historical P&L never changes
      const frozenCOGS = {
        frozen: true,
        frozenAt: new Date(),
        items: orderItems.map(item => ({
          productId: item.product,
          quantity: item.quantity,
          unitCost: item.unitCost, // Already calculated above
          totalCost: item.unitCost * item.quantity
        })),
        totalCOGS: orderItems.reduce((sum, item) => sum + (item.unitCost * item.quantity), 0)
      };

      // Store frozen COGS in order metadata (optional, for audit)
      order.metadata = order.metadata || {};
      order.metadata.frozenCOGS = frozenCOGS;
      await order.save({ session });

      // 3. UPDATE INVENTORY STOCK (in transaction - atomic)
      for (const item of orderItems) {
        // Validate stock again (within transaction for race condition protection)
        const inventory = await Inventory.findOne({ product: item.product }).session(session);
        if (!inventory) {
          throw new Error(`Inventory record not found for product ${item.product}`);
        }

        const availableStock = inventory.currentStock - (inventory.reservedStock || 0);
        if (availableStock < item.quantity) {
          throw new Error(`Insufficient stock for product ${item.product}. Available: ${availableStock}, Requested: ${item.quantity}`);
        }

        // Atomic stock update using Inventory model's updateStock method
        // This ensures proper validation and prevents negative stock
        const movement = {
          type: 'out',
          quantity: item.quantity,
          reason: 'Sales Order',
          reference: order.orderNumber,
          referenceId: order._id,
          referenceModel: 'Sales',
          performedBy: req.user._id,
          date: new Date()
        };

        // Use Inventory.updateStock which has built-in validation
        // Note: This method doesn't support session directly, so we'll use findOneAndUpdate
        // But we'll validate first to ensure no negative stock
        const newStock = inventory.currentStock - item.quantity;
        if (newStock < 0) {
          throw new Error(`NEGATIVE_STOCK_PREVENTED: Cannot reduce stock below zero. Current: ${inventory.currentStock}, Requested: ${item.quantity}`);
        }

        // Atomic update with session
        const updatedInventory = await Inventory.findOneAndUpdate(
          { product: item.product },
          {
            $inc: { currentStock: -item.quantity },
            $push: { movements: movement },
            $set: { 
              lastUpdated: new Date(),
              availableStock: Math.max(0, newStock - (inventory.reservedStock || 0))
            }
          },
          { session, new: true, runValidators: true }
        );

        // Update status if stock reaches 0
        if (updatedInventory.currentStock === 0) {
          await Inventory.findOneAndUpdate(
            { product: item.product },
            { $set: { status: 'out_of_stock' } },
            { session }
          );
        }

        // Sync Product stock (can be done async, but doing it here for consistency)
        // This is safe since Inventory is source of truth
        await Product.findByIdAndUpdate(
          item.product,
          {
            $set: {
              'inventory.currentStock': updatedInventory.currentStock,
              'inventory.lastUpdated': new Date()
            }
          }
        );
      }

      // 4. CREATE CUSTOMER LEDGER (INVOICE) - if account payment (in transaction)
      let customerTransactionId = null;
      if (customerData && orderData.pricing.total > 0) {
        const amountPaid = payment.amount || 0;
        const isAccountPayment = payment.method === 'account' || amountPaid < orderTotal;

        if (isAccountPayment) {
          // Get customer with session for transaction
          const customerInSession = await Customer.findById(customer).session(session);
          if (!customerInSession) {
            throw new Error('Customer not found in transaction');
          }

          // Get product names for line items
          const productIds = orderItems.map(item => item.product);
          const products = await Product.find({ _id: { $in: productIds } }).select('name').lean();
          const productMap = new Map(products.map(p => [p._id.toString(), p.name]));

          const lineItems = orderItems.map(item => ({
            product: item.product,
            description: productMap.get(item.product.toString()) || 'Product',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount || 0,
            taxAmount: item.taxAmount || 0,
            totalPrice: item.total || 0
          }));

          // Get current balance before update
          const balanceBefore = {
            pendingBalance: customerInSession.pendingBalance || 0,
            advanceBalance: customerInSession.advanceBalance || 0,
            currentBalance: customerInSession.currentBalance || 0
          };

          // Create CustomerTransaction invoice (must support session)
          const CustomerTransaction = require('../models/CustomerTransaction');
          const customerTransaction = new CustomerTransaction({
            customerId: customer,
            transactionType: 'invoice',
            netAmount: orderTotal,
            grossAmount: subtotal,
            discountAmount: totalDiscount,
            taxAmount: totalTax,
            referenceType: 'sales_order',
            referenceId: order._id,
            referenceNumber: order.orderNumber,
            lineItems: lineItems,
            notes: `Invoice for sales order ${order.orderNumber}`,
            transactionDate: new Date(),
            balanceBefore: balanceBefore,
            balanceAfter: {
              pendingBalance: balanceBefore.pendingBalance + orderTotal,
              advanceBalance: balanceBefore.advanceBalance,
              currentBalance: (balanceBefore.pendingBalance + orderTotal) - balanceBefore.advanceBalance
            },
            status: 'posted',
            createdBy: req.user._id
          });
          await customerTransaction.save({ session });
          customerTransactionId = customerTransaction._id;

          // Update customer balance atomically (with version check)
          const updatedCustomer = await Customer.findOneAndUpdate(
            { _id: customer, __v: customerInSession.__v },
            {
              $inc: {
                pendingBalance: orderTotal,
                currentBalance: orderTotal,
                __v: 1
              }
            },
            { session, new: true }
          );

          if (!updatedCustomer) {
            throw new Error('Concurrent customer balance update conflict. Please retry.');
          }

          // Record payment if any amount paid (in transaction)
          if (amountPaid > 0) {
            const CustomerBalanceService = require('../services/customerBalanceService');
            // Note: recordPayment may need to be updated to support session
            // For now, we'll create payment transaction directly
            const paymentTransaction = new CustomerTransaction({
              customerId: customer,
              transactionType: 'payment',
              netAmount: amountPaid,
              referenceType: 'sales_order',
              referenceId: order._id,
              referenceNumber: order.orderNumber,
              transactionDate: new Date(),
              balanceBefore: {
                pendingBalance: updatedCustomer.pendingBalance,
                advanceBalance: updatedCustomer.advanceBalance,
                currentBalance: updatedCustomer.currentBalance
              },
              status: 'posted',
              createdBy: req.user._id
            });
            await paymentTransaction.save({ session });

            // Update customer balance for payment
            const finalBalance = updatedCustomer.pendingBalance - amountPaid;
            const overpayment = finalBalance < 0 ? Math.abs(finalBalance) : 0;
            const newPendingBalance = Math.max(0, finalBalance);
            const newAdvanceBalance = updatedCustomer.advanceBalance + overpayment;

            await Customer.findOneAndUpdate(
              { _id: customer },
              {
                $set: {
                  pendingBalance: newPendingBalance,
                  advanceBalance: newAdvanceBalance,
                  currentBalance: newPendingBalance - newAdvanceBalance
                },
                $inc: { __v: 1 }
              },
              { session }
            );
          }
        }
      }

      // 5. CREATE ACCOUNTING JOURNAL ENTRIES (Double-Entry) - in transaction
      // Prepare journal entries
      const journalEntries = [];
      
      // Entry 1: Revenue
      const amountPaid = payment.amount || 0;
      const unpaidAmount = orderTotal - amountPaid;
      
      if (payment.method === 'account' || unpaidAmount > 0) {
        // Account payment - debit AR
        journalEntries.push({
          accountCode: 'AR', // Accounts Receivable
          debitAmount: unpaidAmount,
          creditAmount: 0,
          description: `Sales invoice ${order.orderNumber}`,
          referenceType: 'sales_order',
          referenceId: order._id
        });
      }
      
      if (amountPaid > 0) {
        // Cash/Card payment - debit Cash/Bank
        journalEntries.push({
          accountCode: payment.method === 'cash' ? 'CASH' : 'BANK',
          debitAmount: amountPaid,
          creditAmount: 0,
          description: `Sales payment ${order.orderNumber}`,
          referenceType: 'sales_order',
          referenceId: order._id
        });
      }

      // Credit Sales Revenue
      journalEntries.push({
        accountCode: 'SALES_REVENUE',
        debitAmount: 0,
        creditAmount: orderTotal,
        description: `Sales revenue ${order.orderNumber}`,
        referenceType: 'sales_order',
        referenceId: order._id
      });

      // Entry 2: COGS (using frozen COGS)
      const totalCOGS = frozenCOGS.totalCOGS;
      if (totalCOGS > 0) {
        // Debit COGS
        journalEntries.push({
          accountCode: 'COGS',
          debitAmount: totalCOGS,
          creditAmount: 0,
          description: `COGS for ${order.orderNumber}`,
          referenceType: 'sales_order',
          referenceId: order._id
        });

        // Credit Inventory
        journalEntries.push({
          accountCode: 'INVENTORY',
          debitAmount: 0,
          creditAmount: totalCOGS,
          description: `Inventory reduction ${order.orderNumber}`,
          referenceType: 'sales_order',
          referenceId: order._id
        });
      }

      // Validate double-entry
      await dataIntegrityService.validateDoubleEntry(journalEntries);

      // Create Transaction records (accounting entries)
      const Transaction = require('../models/Transaction');
      for (const entry of journalEntries) {
        const transaction = new Transaction({
          accountCode: entry.accountCode,
          debitAmount: entry.debitAmount,
          creditAmount: entry.creditAmount,
          description: entry.description,
          referenceType: entry.referenceType,
          referenceId: entry.referenceId,
          transactionDate: new Date(),
          status: 'posted',
          createdBy: req.user._id
        });
        await transaction.save({ session });
      }

      return {
        order,
        frozenCOGS,
        customerTransactionId
      };
    }, {
      maxRetries: 5,
      retryDelay: 100
    });

    const { order, frozenCOGS } = transactionResult.result;

    // ============================================================
    // PHASE 3: ASYNC EVENT PROCESSING (Non-Critical Operations)
    // ============================================================

    // Emit event for post-order processing
    await eventService.emitEvent(EVENTS.SALES_ORDER_CREATED, {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      customerId: customer ? customer.toString() : null,
      orderTotal: orderTotal,
      items: orderItems.map(item => ({
        productId: item.product.toString(),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost
      })),
      userId: req.user._id.toString(),
      paymentMethod: payment.method,
      paymentStatus: order.payment.status,
      frozenCOGS: frozenCOGS
    }, {
      retry: true,
      maxRetries: 3,
      priority: 'normal'
    });

    // ============================================================
    // PHASE 4: RESPONSE
    // ============================================================

    // Reload order for response
    const savedOrder = await Sales.findById(order._id)
      .populate('customer', 'firstName lastName businessName email')
      .populate('items.product', 'name description')
      .populate('createdBy', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: savedOrder,
      metadata: {
        frozenCOGS: frozenCOGS,
        eventsEmitted: true
      }
    });

  } catch (error) {
    logger.error('Create order error:', error);

    // Handle specific errors
    if (error.message.includes('CREDIT_LIMIT_EXCEEDED')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CREDIT_LIMIT_EXCEEDED',
          message: error.message
        }
      });
    }

    if (error.message.includes('PERIOD_LOCKED')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'PERIOD_LOCKED',
          message: error.message
        }
      });
    }

    if (error.message.includes('NEGATIVE_STOCK') || error.message.includes('Insufficient stock')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: error.message
        }
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

