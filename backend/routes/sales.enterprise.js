/**
 * ENTERPRISE SALES ROUTE - Proper Accounting Flow
 * 
 * Flow:
 * 1. Sales Order → ALWAYS creates Invoice (AR)
 * 2. If payment received → Create Payment Transaction (separate)
 * 3. Apply Payment to Invoice (via PaymentApplication)
 * 
 * This ensures proper double-entry accounting
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const Sales = require('../models/Sales');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const CustomerTransaction = require('../models/CustomerTransaction');
const { eventService, EVENTS } = require('../services/eventService');
const dataIntegrityService = require('../services/dataIntegrityEnforcementService');
const enhancedTransactionService = require('../services/enhancedTransactionService');
const CustomerTransactionService = require('../services/customerTransactionService');
const paymentApplicationService = require('../services/paymentApplicationService');
const invoiceAccountingService = require('../services/invoiceAccountingService');
const accountingService = require('../services/accountingService');
const inventoryService = require('../services/inventoryService');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

const router = express.Router();

// @route   POST /api/sales
// @desc    Create sales order with proper accounting (ENTERPRISE)
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
    // PHASE 1: PRE-VALIDATION
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

      // Check stock availability
      const inventoryRecord = await Inventory.findOne({ product: item.product });
      if (!inventoryRecord) {
        return res.status(400).json({ 
          message: `Inventory record not found for product ${product.name}` 
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

      // Get unit cost for COGS
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
        unitCost,
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
    const amountPaid = payment?.amount || payment?.amountPaid || 0;

    // Credit limit check
    if (customerData && customerData.creditLimit > 0) {
      const unpaidAmount = orderTotal - amountPaid;
      if (payment.method === 'account' || unpaidAmount > 0) {
        await dataIntegrityService.validateCreditLimit(customerData._id, unpaidAmount);
      }
    }

    // Period lock check
    const transactionDate = new Date();
    await dataIntegrityService.validatePeriodNotLocked(transactionDate, 'create');

    // ============================================================
    // PHASE 2: MONGODB TRANSACTION (CRITICAL OPERATIONS)
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
        status: amountPaid >= orderTotal ? 'paid' : (amountPaid > 0 ? 'partial' : 'pending'),
        amountPaid: amountPaid,
        remainingBalance: orderTotal - amountPaid,
        isPartialPayment: amountPaid > 0 && amountPaid < orderTotal
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

      // 2. FREEZE COGS
      const frozenCOGS = {
        frozen: true,
        frozenAt: new Date(),
        items: orderItems.map(item => ({
          productId: item.product,
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalCost: item.unitCost * item.quantity
        })),
        totalCOGS: orderItems.reduce((sum, item) => sum + (item.unitCost * item.quantity), 0)
      };

      order.metadata = order.metadata || {};
      order.metadata.frozenCOGS = frozenCOGS;
      await order.save({ session });

      // 3. UPDATE INVENTORY STOCK
      for (const item of orderItems) {
        const inventory = await Inventory.findOne({ product: item.product }).session(session);
        if (!inventory) {
          throw new Error(`Inventory record not found for product ${item.product}`);
        }

        const availableStock = inventory.currentStock - (inventory.reservedStock || 0);
        if (availableStock < item.quantity) {
          throw new Error(`Insufficient stock for product ${item.product}`);
        }

        const newStock = inventory.currentStock - item.quantity;
        if (newStock < 0) {
          throw new Error(`NEGATIVE_STOCK_PREVENTED: Cannot reduce stock below zero`);
        }

        await Inventory.findOneAndUpdate(
          { product: item.product },
          {
            $inc: { currentStock: -item.quantity },
            $push: {
              movements: {
                type: 'out',
                quantity: item.quantity,
                reason: 'Sales Order',
                reference: order.orderNumber,
                referenceId: order._id,
                referenceModel: 'Sales',
                performedBy: req.user._id,
                date: new Date()
              }
            },
            $set: { 
              lastUpdated: new Date(),
              availableStock: Math.max(0, newStock - (inventory.reservedStock || 0))
            }
          },
          { session, new: true, runValidators: true }
        );

        // Sync Product stock
        await Product.findByIdAndUpdate(
          item.product,
          {
            $set: {
              'inventory.currentStock': newStock,
              'inventory.lastUpdated': new Date()
            }
          }
        );
      }

      // 4. CREATE INVOICE (ALWAYS - even for cash sales)
      let invoice = null;
      if (customerData && orderTotal > 0) {
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

        // Get customer balance before
        const customerInSession = await Customer.findById(customer).session(session);
        const balanceBefore = {
          pendingBalance: customerInSession.pendingBalance || 0,
          advanceBalance: customerInSession.advanceBalance || 0,
          currentBalance: customerInSession.currentBalance || 0
        };

        // Generate invoice number
        const invoiceNumber = await CustomerTransaction.generateTransactionNumber('invoice', customer);

        // Create invoice
        invoice = new CustomerTransaction({
          customer: customer,
          transactionNumber: invoiceNumber,
          transactionType: 'invoice',
          transactionDate: new Date(),
          dueDate: CustomerTransactionService.calculateDueDate(customerData.paymentTerms || 'net30'),
          referenceType: 'sales_order',
          referenceId: order._id,
          referenceNumber: order.orderNumber,
          grossAmount: subtotal,
          discountAmount: totalDiscount,
          taxAmount: totalTax,
          netAmount: orderTotal,
          lineItems: lineItems,
          paidAmount: 0,
          remainingAmount: orderTotal,
          status: 'open',
          balanceBefore: balanceBefore,
          balanceAfter: {
            pendingBalance: balanceBefore.pendingBalance + orderTotal,
            advanceBalance: balanceBefore.advanceBalance,
            currentBalance: balanceBefore.pendingBalance + orderTotal - balanceBefore.advanceBalance
          },
          notes: `Invoice for sales order ${order.orderNumber}`,
          createdBy: req.user._id
        });

        await invoice.save({ session });

        // Update customer balance
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

        // Create accounting entries for invoice
        await invoiceAccountingService.createInvoiceEntries(invoice, { session });
      }

      // 5. CREATE PAYMENT TRANSACTION (if payment received at sale time)
      let paymentTransaction = null;
      if (amountPaid > 0) {
        const customerInSession = await Customer.findById(customer).session(session);
        if (!customerInSession) {
          throw new Error('Customer not found in transaction');
        }

        const balanceBefore = {
          pendingBalance: customerInSession.pendingBalance || 0,
          advanceBalance: customerInSession.advanceBalance || 0,
          currentBalance: customerInSession.currentBalance || 0
        };

        const paymentNumber = await CustomerTransaction.generateTransactionNumber('payment', customer);

        paymentTransaction = new CustomerTransaction({
          customer: customer,
          transactionNumber: paymentNumber,
          transactionType: 'payment',
          transactionDate: new Date(),
          referenceType: 'sales_order',
          referenceId: order._id,
          referenceNumber: order.orderNumber,
          netAmount: amountPaid,
          paymentDetails: {
            paymentMethod: payment.method,
            paymentReference: payment.reference || order.orderNumber,
            paymentDate: new Date()
          },
          balanceBefore: balanceBefore,
          status: 'posted',
          createdBy: req.user._id,
          postedBy: req.user._id,
          postedAt: new Date()
        });

        await paymentTransaction.save({ session });

        // Create accounting entries for payment
        await invoiceAccountingService.createPaymentEntries(paymentTransaction, { session });
      }

      // 6. CREATE COGS ACCOUNTING ENTRIES
      const totalCOGS = frozenCOGS.totalCOGS;
      if (totalCOGS > 0) {
        const cogsAccountCode = await accountingService.getAccountCode('Cost of Goods Sold', 'expense', 'cost_of_sales')
          .catch(() => 'COGS');
        const inventoryAccountCode = await accountingService.getAccountCode('Inventory', 'asset', 'inventory')
          .catch(() => 'INVENTORY');

        // Debit COGS
        const cogsEntry = new Transaction({
          accountCode: cogsAccountCode,
          debitAmount: totalCOGS,
          creditAmount: 0,
          description: `COGS for ${order.orderNumber}`,
          referenceType: 'sales_order',
          referenceId: order._id,
          transactionDate: new Date(),
          status: 'posted',
          createdBy: req.user._id
        });
        await cogsEntry.save({ session });

        // Credit Inventory
        const inventoryEntry = new Transaction({
          accountCode: inventoryAccountCode,
          debitAmount: 0,
          creditAmount: totalCOGS,
          description: `Inventory reduction ${order.orderNumber}`,
          referenceType: 'sales_order',
          referenceId: order._id,
          transactionDate: new Date(),
          status: 'posted',
          createdBy: req.user._id
        });
        await inventoryEntry.save({ session });
      }

      return {
        order,
        invoice,
        paymentTransaction,
        frozenCOGS
      };
    }, {
      maxRetries: 5,
      retryDelay: 100
    });

    const { order, invoice, paymentTransaction, frozenCOGS } = transactionResult.result;

    // ============================================================
    // PHASE 3: PAYMENT APPLICATION (if payment received)
    // ============================================================

    let paymentApplication = null;
    if (paymentTransaction && invoice) {
      // Apply payment to invoice
      paymentApplication = await paymentApplicationService.applyPayment({
        paymentId: paymentTransaction._id,
        customerId: customer,
        applications: [{
          invoiceId: invoice._id,
          amount: amountPaid
        }],
        user: req.user,
        notes: `Payment applied at sale time for order ${order.orderNumber}`
      });
    }

    // ============================================================
    // PHASE 4: ASYNC EVENT PROCESSING
    // ============================================================

    await eventService.emitEvent(EVENTS.SALES_ORDER_CREATED, {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      customerId: customer ? customer.toString() : null,
      orderTotal: orderTotal,
      invoiceId: invoice ? invoice._id.toString() : null,
      invoiceNumber: invoice ? invoice.transactionNumber : null,
      paymentId: paymentTransaction ? paymentTransaction._id.toString() : null,
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
    });

    // ============================================================
    // PHASE 5: RESPONSE
    // ============================================================

    const savedOrder = await Sales.findById(order._id)
      .populate('customer', 'firstName lastName businessName email')
      .populate('items.product', 'name description')
      .populate('createdBy', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: savedOrder,
      invoice: invoice ? {
        id: invoice._id,
        number: invoice.transactionNumber,
        amount: invoice.netAmount,
        status: invoice.status
      } : null,
      payment: paymentTransaction ? {
        id: paymentTransaction._id,
        number: paymentTransaction.transactionNumber,
        amount: paymentTransaction.netAmount,
        applied: paymentApplication ? true : false
      } : null,
      metadata: {
        frozenCOGS: frozenCOGS,
        eventsEmitted: true
      }
    });

  } catch (error) {
    logger.error('Create order error:', error);

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

