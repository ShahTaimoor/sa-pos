const express = require('express');
const { body, validationResult, query } = require('express-validator');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const Sales = require('../models/Sales'); // Still needed for new Sales() and static methods
const Product = require('../models/Product'); // Still needed for validation
const Customer = require('../models/Customer'); // Still needed for validation
const CashReceipt = require('../models/CashReceipt');
const BankReceipt = require('../models/BankReceipt');
const Inventory = require('../models/Inventory');
const StockMovementService = require('../services/stockMovementService');
const salesService = require('../services/salesService');
const salesRepository = require('../repositories/SalesRepository');
const productRepository = require('../repositories/ProductRepository');
const customerRepository = require('../repositories/CustomerRepository');
const { auth, requirePermission } = require('../middleware/auth');
const { preventPOSDuplicates } = require('../middleware/duplicatePrevention');
const { tenantMiddleware, validateDateRange } = require('../middleware/tenantMiddleware');
const journalEntryService = require('../services/journalEntryService');
const logger = require('../utils/logger');

const router = express.Router();

// Helper functions to transform names to uppercase
const transformCustomerToUppercase = (customer) => {
  if (!customer) return customer;
  if (customer.toObject) customer = customer.toObject();
  if (customer.name) customer.name = customer.name.toUpperCase();
  if (customer.businessName) customer.businessName = customer.businessName.toUpperCase();
  if (customer.firstName) customer.firstName = customer.firstName.toUpperCase();
  if (customer.lastName) customer.lastName = customer.lastName.toUpperCase();
  return customer;
};

const transformProductToUppercase = (product) => {
  if (!product) return product;
  if (product.toObject) product = product.toObject();
  if (product.name) product.name = product.name.toUpperCase();
  if (product.description) product.description = product.description.toUpperCase();
  return product;
};

// @route   GET /api/orders
// @desc    Get all orders with filtering and pagination
// @access  Private
router.get('/', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 999999 }),
  query('all').optional({ checkFalsy: true }).isBoolean(),
  query('search').optional().trim(),
  query('productSearch').optional().trim(),
  query('status').optional({ checkFalsy: true }).isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned']),
  query('paymentStatus').optional({ checkFalsy: true }).isIn(['pending', 'paid', 'partial', 'refunded']),
  query('orderType').optional({ checkFalsy: true }).isIn(['retail', 'wholesale', 'return', 'exchange']),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    // Call service to get sales orders (tenantId automatically included from middleware)
    const result = await salesService.getSalesOrders(req.query, req.tenantId);
    
    res.json({
      orders: result.orders,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('Get orders error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/sales/period-summary
// @desc    Get period summary for comparisons (alternative route with hyphen)
// @access  Private
router.get('/period-summary', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  validateDateRange, // Validate date range (max 2 years)
  query('dateFrom').isISO8601().withMessage('Invalid start date'),
  query('dateTo').isISO8601().withMessage('Invalid end date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const dateFrom = new Date(req.query.dateFrom);
    dateFrom.setHours(0, 0, 0, 0);
    const dateTo = new Date(req.query.dateTo);
    dateTo.setDate(dateTo.getDate() + 1);
    dateTo.setHours(0, 0, 0, 0);
    
    // Use service method with tenantId for proper isolation
    const summary = await salesService.getPeriodSummary(dateFrom, dateTo, req.tenantId);
    
    res.json({ data: summary });
  } catch (error) {
    logger.error('Get period summary error:', { error: error });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/orders/:id
// @desc    Get single order
// @access  Private
router.get('/:id', auth, tenantMiddleware, async (req, res) => {
  try {
    const order = await salesService.getSalesOrderById(req.params.id, req.tenantId);
    
    // Transform names to uppercase
    if (order.customer) {
      order.customer = transformCustomerToUppercase(order.customer);
    }
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach(item => {
        if (item.product) {
          item.product = transformProductToUppercase(item.product);
        }
      });
    }
    
    res.json({ order });
  } catch (error) {
    logger.error('Get order error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/orders/customer/:customerId/last-prices
// @desc    Get last order prices for a customer (product prices from most recent order)
// @access  Private
router.get('/customer/:customerId/last-prices', [auth, tenantMiddleware], async (req, res) => {
  try {
    const { customerId } = req.params;
    const tenantId = req.tenantId;
    
    // Find the most recent order for this customer (scoped to tenant)
    const lastOrder = await salesRepository.findByCustomer(customerId, {
      sort: { createdAt: -1 },
      limit: 1,
      populate: [{ path: 'items.product', select: 'name _id' }],
      filter: { tenantId }
    });
    
    const lastOrderDoc = lastOrder && lastOrder.length > 0 ? lastOrder[0] : null;
    
    if (!lastOrderDoc) {
      return res.json({ 
        success: true,
        message: 'No previous orders found for this customer',
        prices: {}
      });
    }
    
    // Extract product prices from last order
    const prices = {};
    lastOrderDoc.items.forEach(item => {
      if (item.product && item.product._id) {
        prices[item.product._id.toString()] = {
          productId: item.product._id.toString(),
          productName: item.product.name,
          unitPrice: item.unitPrice,
          quantity: item.quantity
        };
      }
    });
    
    res.json({
      success: true,
      message: 'Last order prices retrieved successfully',
      orderNumber: lastOrderDoc.orderNumber,
      orderDate: lastOrderDoc.createdAt,
      prices: prices
    });
  } catch (error) {
    logger.error('Get last prices error:', { error: error });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/orders
// @desc    Create new order
// @access  Private
router.post('/', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('create_orders'),
  preventPOSDuplicates, // Backend safety net for duplicate prevention
  body('orderType').isIn(['retail', 'wholesale', 'return', 'exchange']).withMessage('Invalid order type'),
  body('customer').optional().isMongoId().withMessage('Invalid customer ID'),
  body('items').isArray({ min: 1 }).withMessage('Order must have at least one item'),
  body('items.*.product').isMongoId().withMessage('Invalid product ID'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('payment.method').isIn(['cash', 'credit_card', 'debit_card', 'check', 'account', 'split', 'bank']).withMessage('Invalid payment method'),
  body('payment.amount').optional().isFloat({ min: 0 }).withMessage('Payment amount must be a positive number'),
  body('payment.remainingBalance').optional().isFloat().withMessage('Remaining balance must be a valid number'),
  body('payment.isPartialPayment').optional().isBoolean().withMessage('Partial payment must be a boolean'),
  body('payment.isAdvancePayment').optional().isBoolean().withMessage('Advance payment must be a boolean'),
  body('payment.advanceAmount').optional().isFloat({ min: 0 }).withMessage('Advance amount must be a positive number'),
  body('isTaxExempt').optional().isBoolean().withMessage('Tax exempt must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.error('Validation failed for sales order creation:', errors.array());
      logger.error('Request body:', JSON.stringify(req.body, null, 2));
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array().map(error => ({
          field: error.path || error.param,
          message: error.msg,
          value: error.value
        }))
      });
    }
    
    const { customer, items, orderType, payment, notes, isTaxExempt } = req.body;
    
    // Validate customer if provided
    let customerData = null;
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    if (customer) {
      customerData = await customerRepository.findById(customer, { tenantId });
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
      const product = await productRepository.findById(item.product, { tenantId });
      if (!product) {
        return res.status(400).json({ message: `Product ${item.product} not found` });
      }
      
      // Check actual inventory from Inventory model (source of truth) instead of Product model cache
      let inventoryRecord = await Inventory.findOne({ product: item.product, tenantId });
      let availableStock = 0;
      const productStock = Number(product.inventory?.currentStock || 0);
      
      // If Inventory record doesn't exist, create it from Product's stock
      if (!inventoryRecord) {
        // Create Inventory record with Product's stock value
        try {
          inventoryRecord = await Inventory.create({
            product: item.product,
            productModel: 'Product',
            currentStock: productStock,
            reorderPoint: product.inventory?.reorderPoint || 10,
            reorderQuantity: product.inventory?.reorderQuantity || 50,
            reservedStock: 0,
            availableStock: productStock,
            status: productStock > 0 ? 'active' : 'out_of_stock',
            tenantId: tenantId
          });
          availableStock = productStock;
        } catch (inventoryError) {
          // If creation fails, use Product stock as fallback
          logger.error('Error creating inventory record:', inventoryError);
          availableStock = productStock;
        }
      } else {
        // Use availableStock from Inventory model (currentStock - reservedStock)
        // This is the actual available stock accounting for reservations
        const inventoryAvailableStock = Number(inventoryRecord.availableStock || 0);
        const inventoryCurrentStock = Number(inventoryRecord.currentStock || 0);
        const inventoryReservedStock = Number(inventoryRecord.reservedStock || 0);
        
        // Calculate available stock: currentStock - reservedStock
        const calculatedAvailableStock = Math.max(0, inventoryCurrentStock - inventoryReservedStock);
        
        // Use the calculated value or the stored availableStock field
        availableStock = inventoryAvailableStock > 0 ? inventoryAvailableStock : calculatedAvailableStock;
        
        // Check if Product has more stock than Inventory (sync issue)
        if (productStock > inventoryCurrentStock) {
          // Product has more stock, use Product stock as available (Inventory might be outdated)
          // But still account for reserved stock
          availableStock = Math.max(0, productStock - inventoryReservedStock);
        }
      }
      
      const requestedQuantity = Number(item.quantity);
      
      if (availableStock < requestedQuantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${product.name}. Available: ${availableStock}, Requested: ${requestedQuantity}`,
          product: product.name,
          availableStock: availableStock,
          requestedQuantity: requestedQuantity
        });
      }
      
      // Use custom unitPrice if provided, otherwise calculate based on customer type
      let unitPrice;
      if (item.unitPrice !== undefined && item.unitPrice !== null) {
        // Use the custom unitPrice from the request
        unitPrice = item.unitPrice;
      } else {
        // Determine customer type for pricing and calculate default price
        const customerType = customerData ? customerData.businessType : 'retail';
        unitPrice = product.getPriceForCustomerType(customerType, item.quantity);
      }
      
      // Apply customer discount if applicable
      const customerDiscount = customerData ? customerData.getEffectiveDiscount() : 0;
      const itemDiscountPercent = Math.max(item.discountPercent || 0, customerDiscount);
      
      const itemSubtotal = item.quantity * unitPrice;
      const itemDiscount = itemSubtotal * (itemDiscountPercent / 100);
      const itemTaxable = itemSubtotal - itemDiscount;
      const itemTax = isTaxExempt ? 0 : itemTaxable * (product.taxSettings.taxRate || 0);
      
      // Get unit cost from multiple sources (priority: Inventory > Product)
      let unitCost = 0;
      
      // First try to get from Inventory (most accurate - reflects actual purchase cost)
      try {
        const Inventory = require('../models/Inventory');
        const inventory = await Inventory.findOne({ product: product._id, tenantId });
        if (inventory && inventory.cost) {
          // Use average cost if available, otherwise last purchase cost
          unitCost = inventory.cost.average || inventory.cost.lastPurchase || 0;
        }
      } catch (inventoryError) {
        // If inventory lookup fails, continue with product cost
        logger.warn('Could not fetch inventory cost:', inventoryError.message);
      }
      
      // Fallback to product pricing.cost if inventory cost not available
      if (unitCost === 0) {
        unitCost = product.pricing?.cost || 0;
      }

      orderItems.push({
        product: product._id,
        quantity: item.quantity,
        unitCost,
        unitPrice,
        discountPercent: itemDiscountPercent,
        taxRate: product.taxSettings.taxRate || 0,
        subtotal: itemSubtotal,
        discountAmount: itemDiscount,
        taxAmount: itemTax,
        total: itemSubtotal - itemDiscount + itemTax
      });
      
      subtotal += itemSubtotal;
      totalDiscount += itemDiscount;
      totalTax += itemTax;
    }
    
    // Generate order number
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    // Order number will be auto-generated by the model's pre-save hook with SI- prefix
    // No need to manually generate it here

    // Calculate order total
    const orderTotal = subtotal - totalDiscount + totalTax;
    
    // Check credit limit for credit sales (account payment or partial payment)
    if (customerData && customerData.creditLimit > 0) {
      // Determine unpaid amount
      const paymentMethod = payment?.method || 'cash';
      const amountPaid = payment?.amountPaid || payment?.amount || 0;
      const unpaidAmount = orderTotal - amountPaid;
      
      // For account payments or partial payments, check credit limit
      if (paymentMethod === 'account' || unpaidAmount > 0) {
        const currentBalance = customerData.currentBalance || 0;
        const pendingBalance = customerData.pendingBalance || 0;
        const totalOutstanding = currentBalance + pendingBalance;
        const newBalanceAfterOrder = totalOutstanding + unpaidAmount;
        
        if (newBalanceAfterOrder > customerData.creditLimit) {
          return res.status(400).json({ 
            message: `Credit limit exceeded for customer ${customerData.displayName || customerData.name}`,
            error: 'CREDIT_LIMIT_EXCEEDED',
            details: {
              currentBalance: currentBalance,
              pendingBalance: pendingBalance,
              totalOutstanding: totalOutstanding,
              orderAmount: orderTotal,
              unpaidAmount: unpaidAmount,
              creditLimit: customerData.creditLimit,
              newBalance: newBalanceAfterOrder,
              availableCredit: customerData.creditLimit - totalOutstanding
            }
          });
        }
      }
    }

    // Update inventory BEFORE order save to prevent creating orders with insufficient stock
    const inventoryService = require('../services/inventoryService');
    const inventoryUpdates = [];
    
    for (const item of items) {
      try {
        const product = await productRepository.findById(item.product, { tenantId });
        if (!product) {
          return res.status(400).json({ message: `Product ${item.product} not found during inventory update` });
        }
        
        // Check actual inventory from Inventory model (source of truth) instead of Product model cache
        let inventoryRecord = await Inventory.findOne({ product: item.product, tenantId });
        let availableStock = 0;
        const productStock = Number(product.inventory?.currentStock || 0);
        
        // If Inventory record doesn't exist, create it from Product's stock
        if (!inventoryRecord) {
          // Create Inventory record with Product's stock value
          inventoryRecord = await Inventory.create({
            product: item.product,
            productModel: 'Product',
            currentStock: productStock,
            reorderPoint: product.inventory?.reorderPoint || 10,
            reorderQuantity: 50,
            reservedStock: 0,
            availableStock: productStock,
            status: productStock > 0 ? 'active' : 'out_of_stock',
            tenantId: tenantId
          });
          availableStock = productStock;
        } else {
          // Use availableStock from Inventory model (currentStock - reservedStock)
          const inventoryCurrentStock = Number(inventoryRecord.currentStock || 0);
          const inventoryReservedStock = Number(inventoryRecord.reservedStock || 0);
          const inventoryAvailableStock = Number(inventoryRecord.availableStock || 0);
          
          // Calculate available stock: currentStock - reservedStock
          const calculatedAvailableStock = Math.max(0, inventoryCurrentStock - inventoryReservedStock);
          
          // Use the calculated value or the stored availableStock field
          availableStock = inventoryAvailableStock > 0 ? inventoryAvailableStock : calculatedAvailableStock;
          
          // Check if Product has more stock than Inventory (sync issue)
          if (productStock > inventoryCurrentStock) {
            // Sync Inventory to match Product stock
            await inventoryService.updateStock({
              productId: item.product,
              type: 'adjustment',
              quantity: productStock,
              reason: 'Auto-sync from Product model',
              reference: 'Stock Sync',
              referenceId: null,
              referenceModel: 'StockAdjustment',
              performedBy: req.user._id,
              notes: `Syncing Inventory model to match Product model stock (${inventoryCurrentStock} -> ${productStock})`,
              tenantId: tenantId
            });
            // Refresh inventory record
            inventoryRecord = await Inventory.findOne({ product: item.product, tenantId });
            // Recalculate available stock after sync
            const refreshedReservedStock = Number(inventoryRecord.reservedStock || 0);
            availableStock = Math.max(0, productStock - refreshedReservedStock);
          }
        }
        
        const requestedQuantity = Number(item.quantity);
        
        // Re-check stock availability right before updating (race condition protection)
        if (availableStock < requestedQuantity) {
          return res.status(400).json({ 
            message: `Insufficient stock for ${product.name}. Available: ${availableStock}, Requested: ${requestedQuantity}`,
            product: product.name,
            availableStock: availableStock,
            requestedQuantity: requestedQuantity
          });
        }
        
        // Use inventoryService for proper audit trail
        const inventoryUpdate = await inventoryService.updateStock({
          productId: item.product,
          type: 'out',
          quantity: item.quantity,
          reason: 'Sales Order Creation',
          reference: 'Sales Order',
          referenceId: null, // Will be updated after order save
          referenceModel: 'SalesOrder',
          performedBy: req.user._id,
          notes: `Stock reduced due to sales order creation`,
          tenantId: tenantId
        });
        
        inventoryUpdates.push({
          productId: item.product,
          quantity: item.quantity,
          newStock: inventoryUpdate.currentStock,
          success: true
        });
        
      } catch (error) {
        logger.error(`Error updating inventory for product ${item.product}:`, error);
        
        // Get product name and actual stock for better error message
        let productName = 'Unknown Product';
        let availableStock = 0;
        try {
          const productForError = await Product.findById(item.product);
          if (productForError) {
            productName = productForError.name;
            // Get actual stock from Inventory model (source of truth)
            const inventoryRecord = await Inventory.findOne({ product: item.product });
            availableStock = Number(inventoryRecord ? inventoryRecord.currentStock : (productForError.inventory?.currentStock || 0));
          }
        } catch (productError) {
          logger.error('Error fetching product for error message:', productError);
        }
        
        // Check if this is an insufficient stock error
        const isInsufficientStock = error.message && error.message.includes('Insufficient stock');
        const statusCode = isInsufficientStock ? 400 : 500;
        
        // Rollback successful inventory updates
        for (const successUpdate of inventoryUpdates) {
          try {
            await inventoryService.updateStock({
              productId: successUpdate.productId,
              type: 'in',
              quantity: successUpdate.quantity,
              reason: 'Rollback - Sales Order Creation Failed',
              reference: 'Sales Order',
              referenceId: null,
              referenceModel: 'SalesOrder',
              performedBy: req.user._id,
              notes: `Rollback: Sales order creation failed`,
              tenantId: tenantId
            });
          } catch (rollbackError) {
            logger.error(`Failed to rollback inventory for product ${successUpdate.productId}:`, rollbackError);
          }
        }
        
        return res.status(statusCode).json({ 
          message: isInsufficientStock 
            ? `Insufficient stock for ${productName}. Available: ${availableStock}, Requested: ${item.quantity}`
            : `Failed to update inventory for product ${productName}`,
          error: error.message,
          product: productName,
          productId: item.product,
          availableStock: availableStock,
          requestedQuantity: item.quantity
        });
      }
    }

    // Create order
    // Note: orderNumber will be auto-generated by Order model's pre-save hook with SI- prefix
    // Sales page orders are automatically confirmed since they directly impact stock
    const orderData = {
      tenantId: req.tenantId, // Add tenantId from middleware
      orderType,
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
        total: subtotal - totalDiscount + totalTax
      },
      payment: {
        method: payment.method,
        status: payment.isPartialPayment ? 'partial' : (payment.method === 'cash' ? 'paid' : 'pending'),
        amountPaid: payment.amount || 0,
        remainingBalance: payment.remainingBalance || 0,
        isPartialPayment: payment.isPartialPayment || false,
        isAdvancePayment: payment.isAdvancePayment || false,
        advanceAmount: payment.advanceAmount || 0
      },
      status: 'confirmed', // Sales page orders are automatically confirmed since they directly impact stock
      notes,
      createdBy: req.user._id
    };
    
    
    // Use MongoDB transaction for atomicity across Sales, CustomerTransaction, and Customer
    const mongoose = require('mongoose');
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Create sales order
      const order = new Sales(orderData);
      await order.save({ session });

      // 2. Track stock movements
      try {
        await StockMovementService.trackSalesOrder(order, req.user);
      } catch (movementError) {
        logger.error('Error recording stock movements for sales order:', movementError);
        // Log but don't fail - stock movements are tracked separately
      }

      // 3. Distribute profit for investor-linked products
      if (order.status === 'confirmed' || order.payment?.status === 'paid') {
        try {
          const profitDistributionService = require('../services/profitDistributionService');
          await profitDistributionService.distributeProfitForOrder(order, req.user);
        } catch (profitError) {
          logger.error('Error distributing profit for order:', profitError);
        }
      }

      // 4. Create CustomerTransaction invoice and update balance (if customer account payment)
      if (customer && orderData.pricing.total > 0) {
        const customerTransactionService = require('../services/customerTransactionService');
        const Customer = require('../models/Customer');
        const customerExists = await Customer.findById(customer).session(session);
        
        if (customerExists) {
          const amountPaid = payment.amount || 0;
          const isAccountPayment = payment.method === 'account' || amountPaid < orderData.pricing.total;

          // Create invoice transaction if account payment or partial payment
          if (isAccountPayment) {
            // Fetch product names for line items
            const productIds = orderItems.map(item => item.product);
            const products = await Product.find({ _id: { $in: productIds } }).select('name').lean();
            const productMap = new Map(products.map(p => [p._id.toString(), p.name]));
            
            // Prepare line items for invoice
            const lineItems = orderItems.map(item => ({
              product: item.product,
              description: productMap.get(item.product.toString()) || 'Product',
              quantity: item.quantity,
              unitPrice: item.unitPrice || 0, // Use unitPrice, not price
              discountAmount: item.discountAmount || 0,
              taxAmount: item.taxAmount || 0,
              totalPrice: item.total || 0
            }));

            // Create CustomerTransaction invoice
            await customerTransactionService.createTransaction({
              customerId: customer,
              transactionType: 'invoice',
              netAmount: orderData.pricing.total,
              grossAmount: subtotal,
              discountAmount: totalDiscount,
              taxAmount: totalTax,
              referenceType: 'sales_order',
              referenceId: order._id,
              referenceNumber: order.orderNumber,
              lineItems: lineItems,
              notes: `Invoice for sales order ${order.orderNumber}`
            }, req.user);
          }

          // Record payment if any amount paid
          if (amountPaid > 0) {
            const CustomerBalanceService = require('../services/customerBalanceService');
            await CustomerBalanceService.recordPayment(
              customer,
              amountPaid,
              order._id,
              req.user,
              {
                paymentMethod: payment.method,
                paymentReference: order.orderNumber
              }
            );
          }
        }
      }

      // 5. Create journal entries (double-entry accounting - single source of truth)
      try {
        await journalEntryService.createSaleEntries(order, {
          session,
          tenantId: req.tenantId,
          createdBy: req.user._id
        });
      } catch (error) {
        logger.error('Error creating journal entries for sales order:', error);
        // This is critical - journal entries must be created, so we should fail the transaction
        throw new Error(`Failed to create journal entries: ${error.message}`);
      }

      // Commit transaction
      await session.commitTransaction();
      
      // Order is now saved and all related records created atomically
      // Store order ID for later retrieval
      const orderId = order._id;
      
      // Reload order after transaction (since it was saved in session)
      const savedOrder = await Sales.findById(orderId);
      
      // Populate order for response
      await savedOrder.populate([
        { path: 'customer', select: 'firstName lastName businessName email' },
        { path: 'items.product', select: 'name description' },
        { path: 'createdBy', select: 'firstName lastName' }
      ]);

      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        order: savedOrder
      });
    } catch (error) {
      // Rollback transaction on error
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    logger.error('Create order error:', { error: error });
    logger.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      message: 'Server error. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/orders/:id/status
// @desc    Update order status
// @access  Private
router.put('/:id/status', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('edit_orders'),
  body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const tenantId = req.tenantId;
    const order = await Sales.findOne({ _id: req.params.id, tenantId });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Check if status change is allowed
    if (req.body.status === 'cancelled' && !order.canBeCancelled()) {
      return res.status(400).json({ 
        message: 'Order cannot be cancelled in its current status' 
      });
    }
    
    const oldStatus = order.status;
    order.status = req.body.status;
    order.processedBy = req.user._id;
    
    // Handle balance updates based on status change
    if (req.body.status === 'confirmed' && oldStatus !== 'confirmed' && order.customer) {
      // Move unpaid amount from pendingBalance to currentBalance when confirming
      try {
        const customerExists = await Customer.findById(order.customer);
        if (customerExists) {
          const unpaidAmount = order.pricing.total - order.payment.amountPaid;
          
          if (unpaidAmount > 0) {
            const updateResult = await Customer.findByIdAndUpdate(
              order.customer,
              { 
                $inc: { 
                  pendingBalance: -unpaidAmount,  // Remove from pending
                  currentBalance: unpaidAmount    // Add to current (outstanding)
                }
              },
              { new: true }
            );
          }
        } else {
        }
      } catch (error) {
        logger.error('Error updating customer balance on order confirmation:', error);
        // Don't fail the status update if customer update fails
      }
    }
    
    // If cancelling, restore inventory and reverse customer balance
    if (req.body.status === 'cancelled') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(
          item.product,
          { $inc: { 'inventory.currentStock': item.quantity } }
        );
      }
      
      // Reverse customer balance for cancelled orders
      if (order.customer) {
        try {
          const customerExists = await Customer.findById(order.customer);
          if (customerExists) {
            const unpaidAmount = order.pricing.total - order.payment.amountPaid;
            
            if (unpaidAmount > 0) {
              let balanceUpdate = {};
              
              if (oldStatus === 'confirmed') {
                // If order was confirmed, it was moved to currentBalance, so reverse it back to pendingBalance
                balanceUpdate = {
                  pendingBalance: unpaidAmount,  // Add back to pending
                  currentBalance: -unpaidAmount  // Remove from current
                };
              } else {
                // If order was not confirmed, it was still in pendingBalance, so just remove it
                balanceUpdate = { pendingBalance: -unpaidAmount };
              }
              
              const updateResult = await Customer.findByIdAndUpdate(
                order.customer,
                { $inc: balanceUpdate },
                { new: true }
              );
            }
          } else {
          }
        } catch (error) {
          logger.error('Error reversing customer balance on cancellation:', error);
          // Don't fail the cancellation if customer update fails
        }
      }
    }
    
    await order.save();
    
    res.json({
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    logger.error('Update order status error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/orders/:id
// @desc    Update order details
// @access  Private
router.put('/:id', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('edit_orders'),
  preventPOSDuplicates, // Backend safety net for duplicate prevention
  body('customer').optional().isMongoId().withMessage('Valid customer is required'),
  body('orderType').optional().isIn(['retail', 'wholesale', 'return', 'exchange']).withMessage('Invalid order type'),
  body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes too long'),
  body('items').optional().isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').optional().isMongoId().withMessage('Valid product is required'),
  body('items.*.quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.unitPrice').optional().isFloat({ min: 0 }).withMessage('Unit price must be positive')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const tenantId = req.tenantId;
    const order = await Sales.findOne({ _id: req.params.id, tenantId });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // CRITICAL: Block edits if journal entries are posted
    const JournalEntry = require('../models/JournalEntry');
    const hasJournalEntries = await JournalEntry.exists({
      tenantId,
      referenceType: 'sale',
      referenceId: order._id,
      status: 'posted'
    });

    if (hasJournalEntries) {
      return res.status(403).json({
        message: 'Cannot edit sale with posted journal entries. Use return/adjustment to correct errors.',
        error: 'JOURNAL_ENTRIES_POSTED'
      });
    }
    
    // Get customer data if customer is being updated
    let customerData = null;
    if (req.body.customer) {
      customerData = await Customer.findById(req.body.customer);
      if (!customerData) {
        return res.status(400).json({ message: 'Customer not found' });
      }
    }
    
    // Store old items and old total for comparison
    const oldItems = JSON.parse(JSON.stringify(order.items));
    const oldTotal = order.pricing.total;
    const oldCustomer = order.customer;
    
    // Update order fields
    if (req.body.customer !== undefined) {
      order.customer = req.body.customer || null;
      order.customerInfo = customerData ? {
        name: customerData.displayName,
        email: customerData.email,
        phone: customerData.phone,
        businessName: customerData.businessName
      } : null;
    }
    
    if (req.body.orderType !== undefined) {
      order.orderType = req.body.orderType;
    }
    
    if (req.body.notes !== undefined) {
      order.notes = req.body.notes;
    }
    
    // Update items if provided and recalculate pricing
    if (req.body.items && req.body.items.length > 0) {
      // Validate products and stock availability
      for (const item of req.body.items) {
        const product = await productRepository.findById(item.product);
        if (!product) {
          return res.status(400).json({ message: `Product ${item.product} not found` });
        }
        
        // Find old quantity for this product
        const oldItem = oldItems.find(oi => {
          const oldProductId = oi.product?._id ? oi.product._id.toString() : oi.product?.toString() || oi.product;
          const newProductId = item.product?.toString() || item.product;
          return oldProductId === newProductId;
        });
        const oldQuantity = oldItem ? oldItem.quantity : 0;
        const quantityChange = item.quantity - oldQuantity;
        
        // Check if increasing quantity - need to verify stock availability
        if (quantityChange > 0) {
          const currentStock = product.inventory.currentStock;
          if (currentStock < quantityChange) {
            return res.status(400).json({
              message: `Insufficient stock for ${product.name}. Available: ${currentStock}, Additional needed: ${quantityChange}`
            });
          }
        }
      }
      
      // Recalculate pricing for new items
      let newSubtotal = 0;
      let newTotalDiscount = 0;
      let newTotalTax = 0;
      const newOrderItems = [];
      
      for (const item of req.body.items) {
        const product = await productRepository.findById(item.product);
        const itemSubtotal = item.quantity * item.unitPrice;
        const itemDiscount = itemSubtotal * ((item.discountPercent || 0) / 100);
        const itemTaxable = itemSubtotal - itemDiscount;
        const itemTax = order.pricing.isTaxExempt ? 0 : itemTaxable * (item.taxRate || 0);
        
        newOrderItems.push({
          product: item.product,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent || 0,
          taxRate: item.taxRate || 0,
          subtotal: itemSubtotal,
          discountAmount: itemDiscount,
          taxAmount: itemTax,
          total: itemSubtotal - itemDiscount + itemTax
        });
        
        newSubtotal += itemSubtotal;
        newTotalDiscount += itemDiscount;
        newTotalTax += itemTax;
      }
      
      // Update order items and pricing
      order.items = newOrderItems;
      order.pricing.subtotal = newSubtotal;
      order.pricing.discountAmount = newTotalDiscount;
      order.pricing.taxAmount = newTotalTax;
      order.pricing.total = newSubtotal - newTotalDiscount + newTotalTax;
      
      // Check credit limit for credit sales when order total increases
      const finalCustomer = customerData || (order.customer ? await Customer.findOne({ _id: order.customer, tenantId: req.tenantId || req.user?.tenantId }) : null);
      if (finalCustomer && finalCustomer.creditLimit > 0) {
        const newTotal = order.pricing.total;
        const paymentMethod = order.payment?.method || 'cash';
        const amountPaid = order.payment?.amountPaid || 0;
        const unpaidAmount = newTotal - amountPaid;
        
        // For account payments or partial payments, check credit limit
        if (paymentMethod === 'account' || unpaidAmount > 0) {
          const currentBalance = finalCustomer.currentBalance || 0;
          const pendingBalance = finalCustomer.pendingBalance || 0;
          
          // Calculate what the balance would be after this update
          // First, remove the old order's unpaid amount, then add the new unpaid amount
          const wasConfirmed = order.status === 'confirmed' || order.status === 'processing' || order.status === 'shipped' || order.status === 'delivered';
          let oldUnpaidAmount = 0;
          
          if (order.payment.isPartialPayment && order.payment.remainingBalance > 0) {
            oldUnpaidAmount = order.payment.remainingBalance;
          } else if (order.payment.method === 'account' || order.payment.status === 'pending') {
            oldUnpaidAmount = oldTotal;
          } else if (order.payment.status === 'partial') {
            oldUnpaidAmount = oldTotal - order.payment.amountPaid;
          }
          
          // Calculate effective outstanding balance (after removing old order's contribution)
          const effectiveOutstanding = wasConfirmed 
            ? (currentBalance - oldUnpaidAmount + pendingBalance)
            : (currentBalance + pendingBalance - oldUnpaidAmount);
          
          const newBalanceAfterUpdate = effectiveOutstanding + unpaidAmount;
          
          if (newBalanceAfterUpdate > finalCustomer.creditLimit) {
            return res.status(400).json({ 
              message: `Credit limit exceeded for customer ${finalCustomer.displayName || finalCustomer.name}`,
              error: 'CREDIT_LIMIT_EXCEEDED',
              details: {
                currentBalance: currentBalance,
                pendingBalance: pendingBalance,
                totalOutstanding: currentBalance + pendingBalance,
                oldOrderUnpaid: oldUnpaidAmount,
                newOrderTotal: newTotal,
                unpaidAmount: unpaidAmount,
                creditLimit: finalCustomer.creditLimit,
                newBalance: newBalanceAfterUpdate,
                availableCredit: finalCustomer.creditLimit - (currentBalance + pendingBalance)
              }
            });
          }
        }
      }
    }
    
    await order.save();
    
    // Adjust inventory based on item changes
    if (req.body.items && req.body.items.length > 0) {
      try {
        const inventoryService = require('../services/inventoryService');
        
        for (const newItem of req.body.items) {
          const oldItem = oldItems.find(oi => {
            const oldProductId = oi.product?._id ? oi.product._id.toString() : oi.product?.toString() || oi.product;
            const newProductId = newItem.product?.toString() || newItem.product;
            return oldProductId === newProductId;
          });
          const oldQuantity = oldItem ? oldItem.quantity : 0;
          const quantityChange = newItem.quantity - oldQuantity;
          
          if (quantityChange !== 0) {
            if (quantityChange > 0) {
              // Quantity increased - reduce inventory
              await inventoryService.updateStock({
                productId: newItem.product,
                type: 'out',
                quantity: quantityChange,
                reason: 'Order Update - Quantity Increased',
                reference: 'Sales Order',
                referenceId: order._id,
                referenceModel: 'SalesOrder',
                performedBy: req.user._id,
                notes: `Inventory reduced due to order ${order.orderNumber} update - quantity increased by ${quantityChange}`
              });
            } else {
              // Quantity decreased - restore inventory
              await inventoryService.updateStock({
                productId: newItem.product,
                type: 'in',
                quantity: Math.abs(quantityChange),
                reason: 'Order Update - Quantity Decreased',
                reference: 'Sales Order',
                referenceId: order._id,
                referenceModel: 'SalesOrder',
                performedBy: req.user._id,
                notes: `Inventory restored due to order ${order.orderNumber} update - quantity decreased by ${Math.abs(quantityChange)}`
              });
            }
          }
        }
        
        // Handle removed items (items that were in old but not in new)
        for (const oldItem of oldItems) {
          const oldProductId = oldItem.product?._id ? oldItem.product._id.toString() : oldItem.product?.toString() || oldItem.product;
          const stillExists = req.body.items.find(newItem => {
            const newProductId = newItem.product?.toString() || newItem.product;
            return oldProductId === newProductId;
          });
          if (!stillExists) {
            // Item was removed - restore inventory
            await inventoryService.updateStock({
              productId: oldItem.product?._id || oldItem.product,
              type: 'in',
              quantity: oldItem.quantity,
              reason: 'Order Update - Item Removed',
              reference: 'Sales Order',
              referenceId: order._id,
              referenceModel: 'SalesOrder',
              performedBy: req.user._id,
              notes: `Inventory restored due to order ${order.orderNumber} update - item removed`,
              tenantId: req.tenantId || req.user?.tenantId
            });
          }
        }
      } catch (error) {
        logger.error('Error adjusting inventory on order update:', error);
        // Don't fail update if inventory adjustment fails
      }
    }
    
    // Adjust customer balance if total changed or customer changed
    if (order.customer && (order.pricing.total !== oldTotal || oldCustomer !== order.customer)) {
      try {
        const customer = await Customer.findById(order.customer);
        if (customer) {
          // Check if order was confirmed - balance may be in currentBalance instead of pendingBalance
          const wasConfirmed = order.status === 'confirmed' || order.status === 'processing' || order.status === 'shipped' || order.status === 'delivered';
          
          // Calculate old balance that was added
          let oldBalanceAdded = 0;
          if (order.payment.isPartialPayment && order.payment.remainingBalance > 0) {
            oldBalanceAdded = order.payment.remainingBalance;
          } else if (order.payment.method === 'account' || order.payment.status === 'pending') {
            oldBalanceAdded = oldTotal;
          } else if (order.payment.status === 'partial') {
            oldBalanceAdded = oldTotal - order.payment.amountPaid;
          }
          
          // Calculate new balance that should be added
          let newBalanceToAdd = 0;
          if (order.payment.isPartialPayment && order.payment.remainingBalance > 0) {
            newBalanceToAdd = order.payment.remainingBalance;
          } else if (order.payment.method === 'account' || order.payment.status === 'pending') {
            newBalanceToAdd = order.pricing.total;
          } else if (order.payment.status === 'partial') {
            newBalanceToAdd = order.pricing.total - order.payment.amountPaid;
          }
          
          // Calculate difference
          const balanceDifference = newBalanceToAdd - oldBalanceAdded;
          
          if (balanceDifference !== 0) {
            let balanceUpdate = {};
            
            if (wasConfirmed) {
              // Order was confirmed - balance is in currentBalance
              balanceUpdate = { currentBalance: balanceDifference };
            } else {
              // Order not confirmed - balance is in pendingBalance
              balanceUpdate = { pendingBalance: balanceDifference };
            }
            
            const updateResult = await Customer.findByIdAndUpdate(
              order.customer,
              { $inc: balanceUpdate },
              { new: true }
            );
          }
          
          // If customer changed, remove balance from old customer
          if (oldCustomer && oldCustomer.toString() !== order.customer.toString()) {
            if (oldBalanceAdded > 0) {
              // Need to check if old order was confirmed to know which balance field to adjust
              // For simplicity, we'll check current order status (assuming status wasn't changed)
              const oldWasConfirmed = wasConfirmed; // Same status assumption
              let oldBalanceUpdate = {};
              if (oldWasConfirmed) {
                oldBalanceUpdate = { currentBalance: -oldBalanceAdded };
              } else {
                oldBalanceUpdate = { pendingBalance: -oldBalanceAdded };
              }
              
              await Customer.findByIdAndUpdate(
                oldCustomer,
                { $inc: oldBalanceUpdate },
                { new: true }
              );
            }
          }
        }
      } catch (error) {
        logger.error('Error adjusting customer balance on order update:', error);
        // Don't fail update if balance adjustment fails
      }
    }
    
    // Populate order for response
    await order.populate([
      { path: 'customer', select: 'firstName lastName businessName email phone' },
      { path: 'items.product', select: 'name description pricing' },
      { path: 'createdBy', select: 'firstName lastName' }
    ]);
    
    res.json({
      message: 'Order updated successfully',
      order
    });
  } catch (error) {
    logger.error('Update order error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/orders/:id/payment
// @desc    Process payment for order
// @access  Private
router.post('/:id/payment', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('edit_orders'),
  body('method').isIn(['cash', 'credit_card', 'debit_card', 'check', 'account']).withMessage('Invalid payment method'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('reference').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const tenantId = req.tenantId;
    const order = await Sales.findOne({ _id: req.params.id, tenantId });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    const { method, amount, reference } = req.body;
    const remainingBalance = order.pricing.total - order.payment.amountPaid;
    
    // Allow overpayments - excess will be tracked in advanceBalance
    // Removed the check that prevented overpayments
    
    // Add transaction
    order.payment.transactions.push({
      method,
      amount,
      reference,
      timestamp: new Date()
    });
    
    // Update payment status
    const previousPaidAmount = order.payment.amountPaid;
    order.payment.amountPaid += amount;
    const newRemainingBalance = order.pricing.total - order.payment.amountPaid;
    
    if (order.payment.amountPaid >= order.pricing.total) {
      order.payment.status = 'paid';
    } else {
      order.payment.status = 'partial';
    }
    
    await order.save();
    
    // Update customer balance: record payment using CustomerBalanceService
    // This properly handles overpayments by adding excess to advanceBalance
    if (order.customer && amount > 0) {
      try {
        const CustomerBalanceService = require('../services/customerBalanceService');
        await CustomerBalanceService.recordPayment(order.customer, amount, order._id);
        
        const Customer = require('../models/Customer');
        const updatedCustomer = await Customer.findById(order.customer);
      } catch (error) {
        logger.error('Error updating customer balance on payment:', error);
        // Don't fail the payment if customer update fails
      }
    }
    
    res.json({
      message: 'Payment processed successfully',
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        payment: order.payment
      }
    });
  } catch (error) {
    logger.error('Process payment error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/orders/:id
// @desc    Delete order
// @access  Private
router.delete('/:id', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('delete_orders')
], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const order = await Sales.findOne({ _id: req.params.id, tenantId });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // CRITICAL: Check if journal entries exist - if posted, block deletion
    const JournalEntry = require('../models/JournalEntry');
    const journalEntry = await JournalEntry.findOne({
      tenantId,
      referenceType: 'sale',
      referenceId: order._id,
      status: 'posted'
    });

    if (journalEntry) {
      return res.status(403).json({
        message: 'Cannot delete sale with posted journal entries. Use return/adjustment instead.',
        error: 'JOURNAL_ENTRIES_EXIST',
        journalEntryId: journalEntry._id,
        journalEntryNumber: journalEntry.entryNumber
      });
    }

    // Check if order can be deleted (allow deletion of orders that haven't been delivered)
    // Business rule: Can delete orders until they're shipped/delivered
    const nonDeletableStatuses = ['shipped', 'delivered'];
    if (nonDeletableStatuses.includes(order.status)) {
      return res.status(400).json({ 
        message: `Cannot delete order with status: ${order.status}. Orders that have been shipped or delivered cannot be deleted.` 
      });
    }
    
    // Update customer balance - reverse invoice total and payment
    // This matches the new logic in sales order creation
    if (order.customer && order.pricing && order.pricing.total > 0) {
      try {
        const CustomerBalanceService = require('../services/customerBalanceService');
        const Customer = require('../models/Customer');
        const customerExists = await Customer.findById(order.customer);
        
        if (customerExists) {
          const amountPaid = order.payment?.amountPaid || 0;
          
          // Reverse payment first: restore pendingBalance, remove from advanceBalance
          if (amountPaid > 0) {
            const pendingRestored = Math.min(amountPaid, order.pricing.total);
            const advanceToRemove = Math.max(0, amountPaid - order.pricing.total);
            
            await Customer.findByIdAndUpdate(
              order.customer,
              {
                $inc: {
                  pendingBalance: pendingRestored,
                  advanceBalance: -advanceToRemove
                }
              },
              { new: true }
            );
          }
          
          // Remove invoice total from pendingBalance
          const updateResult = await Customer.findByIdAndUpdate(
            order.customer,
            { $inc: { pendingBalance: -order.pricing.total } },
            { new: true }
          );
        } else {
        }
      } catch (error) {
        logger.error('Error rolling back customer balance:', error);
        // Continue with deletion even if customer update fails
      }
    }
    
    // CRITICAL: Reverse journal entries if they exist (draft or reversed status)
    const journalEntryService = require('../services/journalEntryService');
    const existingJournalEntry = await JournalEntry.findOne({
      referenceType: 'sale',
      referenceId: order._id,
      status: { $in: ['posted', 'draft'] }
    });

    if (existingJournalEntry && existingJournalEntry.status === 'posted') {
      try {
        await journalEntryService.reverseJournalEntry(existingJournalEntry._id, {
          reason: `Sale deletion: ${order.orderNumber || order._id}`,
          createdBy: req.user._id,
          tenantId: req.tenantId || order.tenantId
        });
      } catch (error) {
        logger.error('Error reversing journal entry on sale deletion:', error);
        return res.status(500).json({
          message: 'Failed to reverse journal entries. Cannot delete sale.',
          error: error.message
        });
      }
    }

    // Restore inventory for items in the order using inventoryService for audit trail
    try {
      const inventoryService = require('../services/inventoryService');
      for (const item of order.items) {
        try {
          await inventoryService.updateStock({
            productId: item.product,
            type: 'in',
            quantity: item.quantity,
            reason: 'Order Deletion',
            reference: 'Sales Order',
            referenceId: order._id,
            referenceModel: 'SalesOrder',
            performedBy: req.user._id,
            notes: `Inventory restored due to deletion of order ${order.orderNumber}`
          });
        } catch (error) {
          logger.error(`Failed to restore inventory for product ${item.product}:`, error);
          // Continue with other items
        }
      }
    } catch (error) {
      logger.error('Error restoring inventory on order deletion:', error);
      // Don't fail deletion if inventory update fails
    }
    
    await Sales.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    logger.error('Delete order error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/orders/today/summary
// @desc    Get today's order summary
// @access  Private
router.get('/today/summary', [
  auth,
  tenantMiddleware // Enforce tenant isolation
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ 
        message: 'Tenant ID is required',
        summary: {
          totalOrders: 0,
          totalRevenue: 0,
          totalItems: 0,
          averageOrderValue: 0,
          orderTypes: {},
          paymentMethods: {}
        }
      });
    }

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    endOfDay.setHours(0, 0, 0, 0);
    
    const orders = await salesRepository.findByDateRange(startOfDay, endOfDay, { 
      lean: true,
      filter: { tenantId: tenantId }
    });
    
    const summary = {
      totalOrders: orders.length,
      totalRevenue: orders.reduce((sum, order) => sum + (order.pricing?.total || 0), 0),
      totalItems: orders.reduce((sum, order) => 
        sum + (order.items || []).reduce((itemSum, item) => itemSum + (item.quantity || 0), 0), 0),
      averageOrderValue: orders.length > 0 ? 
        orders.reduce((sum, order) => sum + (order.pricing?.total || 0), 0) / orders.length : 0,
      orderTypes: {
        retail: orders.filter(o => o.orderType === 'retail').length,
        wholesale: orders.filter(o => o.orderType === 'wholesale').length,
        return: orders.filter(o => o.orderType === 'return').length,
        exchange: orders.filter(o => o.orderType === 'exchange').length
      },
      paymentMethods: orders.reduce((acc, order) => {
        const method = order.payment?.method || 'unknown';
        acc[method] = (acc[method] || 0) + 1;
        return acc;
      }, {})
    };
    
    res.json({ data: { summary } });
  } catch (error) {
    logger.error('Get today summary error:', { error: error });
    res.status(500).json({ 
      message: 'Server error',
      error: error.message,
      summary: {
        totalOrders: 0,
        totalRevenue: 0,
        totalItems: 0,
        averageOrderValue: 0,
        orderTypes: {},
        paymentMethods: {}
      }
    });
  }
});

// @route   GET /api/orders/period/summary
// @desc    Get period summary for comparisons
// @access  Private
router.get('/period/summary', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  validateDateRange, // Validate date range (max 2 years)
  query('dateFrom').isISO8601().withMessage('Invalid start date'),
  query('dateTo').isISO8601().withMessage('Invalid end date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.tenantId;
    const dateFrom = new Date(req.query.dateFrom);
    dateFrom.setHours(0, 0, 0, 0);
    const dateTo = new Date(req.query.dateTo);
    dateTo.setDate(dateTo.getDate() + 1);
    dateTo.setHours(0, 0, 0, 0);
    
    const result = await salesService.getPeriodSummary(dateFrom, dateTo, tenantId);
    
    const summary = {
      total: result.totalRevenue,
      totalRevenue: result.totalRevenue,
      totalOrders: result.totalOrders,
      totalItems: result.totalItems,
      averageOrderValue: result.averageOrderValue,
      totalDiscounts: result.totalDiscounts,
      netRevenue: result.totalRevenue - result.totalDiscounts,
      revenueByType: result.revenueByType,
      period: {
        start: req.query.dateFrom,
        end: req.query.dateTo
      }
    };
    
    res.json({ data: summary });
  } catch (error) {
    logger.error('Get period summary error:', { error: error });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/orders/export/excel
// @desc    Export orders to Excel
// @access  Private
router.post('/export/excel', [auth, tenantMiddleware, requirePermission('view_orders')], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { filters = {} } = req.body;
    
    // Build query based on filters
    const filter = { tenantId }; // Always include tenantId for isolation
    
    if (filters.search) {
      filter.$or = [
        { orderNumber: { $regex: filters.search, $options: 'i' } }
      ];
    }
    
    if (filters.status) {
      filter.status = filters.status;
    }
    
    if (filters.paymentStatus) {
      filter['payment.status'] = filters.paymentStatus;
    }
    
    if (filters.orderType) {
      filter.orderType = filters.orderType;
    }
    
    if (filters.customer) {
      filter.customer = filters.customer;
    }
    
    if (filters.dateFrom || filters.dateTo) {
      filter.createdAt = {};
      if (filters.dateFrom) {
        const dateFrom = new Date(filters.dateFrom);
        dateFrom.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = dateFrom;
      }
      if (filters.dateTo) {
        const dateTo = new Date(filters.dateTo);
        dateTo.setDate(dateTo.getDate() + 1);
        dateTo.setHours(0, 0, 0, 0);
        filter.createdAt.$lt = dateTo;
      }
    }
    
    const orders = await Sales.find(filter)
      .populate('customer', 'businessName name firstName lastName email phone')
      .populate('items.product', 'name')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();
    
    // Prepare Excel data
    const excelData = orders.map(order => {
      const customerName = order.customer?.businessName || 
                          order.customer?.name || 
                          `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim() || 
                          'Walk-in Customer';
      
      const itemsSummary = order.items?.map(item => 
        `${item.product?.name || 'Unknown'}: ${item.quantity} x $${item.unitPrice}`
      ).join('; ') || 'No items';
      
      return {
        'Order Number': order.orderNumber || '',
        'Customer': customerName,
        'Customer Email': order.customer?.email || '',
        'Customer Phone': order.customer?.phone || '',
        'Order Type': order.orderType || '',
        'Status': order.status || '',
        'Payment Status': order.payment?.status || '',
        'Payment Method': order.payment?.method || '',
        'Order Date': order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : '',
        'Subtotal': order.pricing?.subtotal || 0,
        'Discount': order.pricing?.discountAmount || 0,
        'Tax': order.pricing?.taxAmount || 0,
        'Total': order.pricing?.total || 0,
        'Amount Paid': order.payment?.amountPaid || 0,
        'Remaining Balance': order.payment?.remainingBalance || 0,
        'Items Count': order.items?.length || 0,
        'Items Summary': itemsSummary,
        'Tax Exempt': order.pricing?.isTaxExempt ? 'Yes' : 'No',
        'Notes': order.notes || '',
        'Created By': order.createdBy ? `${order.createdBy.firstName || ''} ${order.createdBy.lastName || ''}`.trim() : '',
        'Created Date': order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : ''
      };
    });
    
    // Create Excel workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    
    // Set column widths
    const columnWidths = [
      { wch: 15 }, // Order Number
      { wch: 25 }, // Customer
      { wch: 25 }, // Customer Email
      { wch: 15 }, // Customer Phone
      { wch: 12 }, // Order Type
      { wch: 15 }, // Status
      { wch: 15 }, // Payment Status
      { wch: 15 }, // Payment Method
      { wch: 12 }, // Order Date
      { wch: 12 }, // Subtotal
      { wch: 12 }, // Discount
      { wch: 10 }, // Tax
      { wch: 12 }, // Total
      { wch: 12 }, // Amount Paid
      { wch: 15 }, // Remaining Balance
      { wch: 10 }, // Items Count
      { wch: 50 }, // Items Summary
      { wch: 10 }, // Tax Exempt
      { wch: 30 }, // Notes
      { wch: 20 }, // Created By
      { wch: 12 }  // Created Date
    ];
    worksheet['!cols'] = columnWidths;
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Orders');
    
    // Ensure exports directory exists
    const exportsDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }
    
    // Generate unique filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `sales_${timestamp}.xlsx`;
    const filepath = path.join(exportsDir, filename);
    
    XLSX.writeFile(workbook, filepath);
    
    res.json({
      message: 'Orders exported successfully',
      filename: filename,
      recordCount: excelData.length,
      downloadUrl: `/api/orders/download/${filename}`
    });
    
  } catch (error) {
    logger.error('Excel export error:', { error: error });
    logger.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Export failed', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   POST /api/orders/export/csv
// @desc    Export orders to CSV
// @access  Private
router.post('/export/csv', [auth, tenantMiddleware, requirePermission('view_orders')], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { filters = {} } = req.body;
    
    // Build query based on filters (same as Excel export)
    const filter = { tenantId }; // Always include tenantId for isolation
    
    if (filters.search) {
      filter.$or = [
        { orderNumber: { $regex: filters.search, $options: 'i' } }
      ];
    }
    
    if (filters.status) {
      filter.status = filters.status;
    }
    
    if (filters.paymentStatus) {
      filter['payment.status'] = filters.paymentStatus;
    }
    
    if (filters.orderType) {
      filter.orderType = filters.orderType;
    }
    
    if (filters.customer) {
      filter.customer = filters.customer;
    }
    
    if (filters.dateFrom || filters.dateTo) {
      filter.createdAt = {};
      if (filters.dateFrom) {
        const dateFrom = new Date(filters.dateFrom);
        dateFrom.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = dateFrom;
      }
      if (filters.dateTo) {
        const dateTo = new Date(filters.dateTo);
        dateTo.setDate(dateTo.getDate() + 1);
        dateTo.setHours(0, 0, 0, 0);
        filter.createdAt.$lt = dateTo;
      }
    }
    
    const orders = await Sales.find(filter)
      .populate('customer', 'businessName name firstName lastName email phone')
      .populate('items.product', 'name')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();
    
    // Prepare CSV data
    const csvData = orders.map(order => {
      const customerName = order.customer?.businessName || 
                          order.customer?.name || 
                          `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim() || 
                          'Walk-in Customer';
      
      const itemsSummary = order.items?.map(item => 
        `${item.product?.name || 'Unknown'}: ${item.quantity} x $${item.unitPrice}`
      ).join('; ') || 'No items';
      
      return {
        'Order Number': order.orderNumber || '',
        'Customer': customerName,
        'Customer Email': order.customer?.email || '',
        'Customer Phone': order.customer?.phone || '',
        'Order Type': order.orderType || '',
        'Status': order.status || '',
        'Payment Status': order.payment?.status || '',
        'Payment Method': order.payment?.method || '',
        'Order Date': order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : '',
        'Subtotal': order.pricing?.subtotal || 0,
        'Discount': order.pricing?.discountAmount || 0,
        'Tax': order.pricing?.taxAmount || 0,
        'Total': order.pricing?.total || 0,
        'Amount Paid': order.payment?.amountPaid || 0,
        'Remaining Balance': order.payment?.remainingBalance || 0,
        'Items Count': order.items?.length || 0,
        'Items Summary': itemsSummary,
        'Tax Exempt': order.pricing?.isTaxExempt ? 'Yes' : 'No',
        'Notes': order.notes || '',
        'Created By': order.createdBy ? `${order.createdBy.firstName || ''} ${order.createdBy.lastName || ''}`.trim() : '',
        'Created Date': order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : ''
      };
    });
    
    // Create CSV workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(csvData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Orders');
    
    // Ensure exports directory exists
    const exportsDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }
    
    // Generate unique filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `sales_${timestamp}.csv`;
    const filepath = path.join(exportsDir, filename);
    
    // Write CSV file
    XLSX.writeFile(workbook, filepath);
    
    res.json({
      message: 'Orders exported successfully',
      filename: filename,
      recordCount: csvData.length,
      downloadUrl: `/api/orders/download/${filename}`
    });
    
  } catch (error) {
    logger.error('CSV export error:', { error: error });
    res.status(500).json({ message: 'Export failed', error: error.message });
  }
});

// @route   POST /api/orders/export/pdf
// @desc    Export orders to PDF
// @access  Private
router.post('/export/pdf', [auth, tenantMiddleware, requirePermission('view_orders')], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { filters = {} } = req.body;
    
    // Build query based on filters (same as Excel export)
    const filter = { tenantId }; // Always include tenantId for isolation
    
    if (filters.search) {
      filter.$or = [
        { orderNumber: { $regex: filters.search, $options: 'i' } }
      ];
    }
    
    if (filters.status) {
      filter.status = filters.status;
    }
    
    if (filters.paymentStatus) {
      filter['payment.status'] = filters.paymentStatus;
    }
    
    if (filters.orderType) {
      filter.orderType = filters.orderType;
    }
    
    if (filters.customer) {
      filter.customer = filters.customer;
    }
    
    if (filters.dateFrom || filters.dateTo) {
      filter.createdAt = {};
      if (filters.dateFrom) {
        const dateFrom = new Date(filters.dateFrom);
        dateFrom.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = dateFrom;
      }
      if (filters.dateTo) {
        const dateTo = new Date(filters.dateTo);
        dateTo.setDate(dateTo.getDate() + 1);
        dateTo.setHours(0, 0, 0, 0);
        filter.createdAt.$lt = dateTo;
      }
    }
    
    // Fetch customer name if customer filter is applied
    let customerName = null;
    if (filters.customer) {
      const customer = await Customer.findById(filters.customer).lean();
      if (customer) {
        customerName = customer.businessName || 
                      customer.name || 
                      `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 
                      'Unknown Customer';
      }
    }
    
    const orders = await Sales.find(filter)
      .populate('customer', 'businessName name firstName lastName email phone pendingBalance currentBalance')
      .populate('items.product', 'name')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();
    
    // Get all customer IDs and order IDs for receipt lookup
    const customerIds = [...new Set(orders.map(o => o.customer?._id).filter(Boolean))];
    const orderIds = orders.map(o => o._id);
    
    // Build date filter for receipts (use same date range as orders if provided)
    const receiptDateFilter = {};
    if (filters.dateFrom || filters.dateTo) {
      receiptDateFilter.date = {};
      if (filters.dateFrom) {
        const dateFrom = new Date(filters.dateFrom);
        dateFrom.setHours(0, 0, 0, 0);
        receiptDateFilter.date.$gte = dateFrom;
      }
      if (filters.dateTo) {
        const dateTo = new Date(filters.dateTo);
        dateTo.setDate(dateTo.getDate() + 1);
        dateTo.setHours(0, 0, 0, 0);
        receiptDateFilter.date.$lt = dateTo;
      }
    }
    
    // Fetch cash receipts linked to orders or customers in the date range
    const cashReceiptFilter = {
      ...receiptDateFilter,
      status: 'confirmed',
      $or: [
        { order: { $in: orderIds } },
        ...(customerIds.length > 0 ? [{ customer: { $in: customerIds } }] : [])
      ]
    };
    const cashReceipts = await CashReceipt.find(cashReceiptFilter)
      .select('order customer voucherCode amount date paymentMethod')
      .lean();
    
    // Fetch bank receipts linked to orders or customers in the date range
    const bankReceiptFilter = {
      ...receiptDateFilter,
      status: 'confirmed',
      $or: [
        { order: { $in: orderIds } },
        ...(customerIds.length > 0 ? [{ customer: { $in: customerIds } }] : [])
      ]
    };
    const bankReceipts = await BankReceipt.find(bankReceiptFilter)
      .select('order customer voucherCode amount date transactionReference')
      .lean();
    
    // Create maps for quick lookup: orderId -> receipts, customerId -> receipts
    const receiptsByOrder = {};
    const receiptsByCustomer = {};
    
    [...cashReceipts, ...bankReceipts].forEach(receipt => {
      const receiptInfo = {
        type: receipt.voucherCode?.startsWith('CR-') ? 'Cash' : 'Bank',
        voucherCode: receipt.voucherCode || 'N/A',
        amount: receipt.amount || 0,
        date: receipt.date,
        method: receipt.paymentMethod || (receipt.transactionReference ? 'Bank Transfer' : 'N/A')
      };
      
      if (receipt.order) {
        const orderId = receipt.order.toString();
        if (!receiptsByOrder[orderId]) {
          receiptsByOrder[orderId] = [];
        }
        receiptsByOrder[orderId].push(receiptInfo);
      }
      
      if (receipt.customer) {
        const customerId = receipt.customer.toString();
        if (!receiptsByCustomer[customerId]) {
          receiptsByCustomer[customerId] = [];
        }
        receiptsByCustomer[customerId].push(receiptInfo);
      }
    });
    
    // Ensure exports directory exists
    const exportsDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }
    
    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `sales_${timestamp}.pdf`;
    const filepath = path.join(exportsDir, filename);
    
    // Create PDF document
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);
    
    // Helper function to format currency
    const formatCurrency = (amount) => {
      return `$${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    
    // Helper function to format date as DD/MM/YYYY
    const formatDate = (date) => {
      if (!date) return 'N/A';
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    };
    
    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('SALES REPORT', { align: 'center' });
    doc.moveDown(0.5);
    
    // Customer name (if filtered by customer)
    if (customerName) {
      doc.fontSize(14).font('Helvetica-Bold').text(`Customer: ${customerName}`, { align: 'center' });
      doc.moveDown(0.5);
    }
    
    // Report date range (only show if date filters are applied)
    if (filters.dateFrom || filters.dateTo) {
      const dateRange = `Period: ${filters.dateFrom ? formatDate(filters.dateFrom) : 'All'} - ${filters.dateTo ? formatDate(filters.dateTo) : 'All'}`;
      doc.fontSize(12).font('Helvetica').text(dateRange, { align: 'center' });
      doc.moveDown(0.5);
    }
    
    doc.moveDown(1);
    
    // Summary section
    const totalOrders = orders.length;
    const totalAmount = orders.reduce((sum, order) => sum + (order.pricing?.total || 0), 0);
    const statusCounts = {};
    const paymentStatusCounts = {};
    const orderTypeCounts = {};
    let totalItems = 0;
    let earliestDate = null;
    let latestDate = null;
    
    orders.forEach(order => {
      // Status breakdown
      statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
      
      // Payment status breakdown
      const paymentStatus = order.payment?.status || 'pending';
      paymentStatusCounts[paymentStatus] = (paymentStatusCounts[paymentStatus] || 0) + 1;
      
      // Order type breakdown
      if (order.orderType) {
        orderTypeCounts[order.orderType] = (orderTypeCounts[order.orderType] || 0) + 1;
      }
      
      // Total items
      if (order.items && Array.isArray(order.items)) {
        totalItems += order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      }
      
      // Date range
      if (order.createdAt) {
        const orderDate = new Date(order.createdAt);
        if (!earliestDate || orderDate < earliestDate) {
          earliestDate = orderDate;
        }
        if (!latestDate || orderDate > latestDate) {
          latestDate = orderDate;
        }
      }
    });
    
    const averageOrderValue = totalOrders > 0 ? totalAmount / totalOrders : 0;
    
    // Summary section with three columns (similar to invoice format)
    const leftColumnX = 50;
    const middleColumnX = 220;
    const rightColumnX = 390;
    const columnWidth = 160; // Width for each column
    const lineHeight = 16; // Consistent line height
    const headerLineYOffset = 12; // Offset for header separator line
    
    doc.fontSize(11).font('Helvetica-Bold').text('Summary', { underline: true });
    doc.moveDown(0.5);
    
    // Start all columns at the same Y position
    const startY = doc.y;
    let leftY = startY;
    let middleY = startY;
    let rightY = startY;
    
    // Left column - Order Summary
    doc.fontSize(10).font('Helvetica-Bold').text('Order Summary:', leftColumnX, leftY);
    // Draw separator line under header
    doc.moveTo(leftColumnX, leftY + headerLineYOffset).lineTo(leftColumnX + columnWidth, leftY + headerLineYOffset).stroke({ color: '#cccccc', width: 0.5 });
    leftY += lineHeight + 3;
    
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Amount: ${formatCurrency(totalAmount)}`, leftColumnX, leftY);
    leftY += lineHeight;
    doc.text(`Total Items: ${totalItems}`, leftColumnX, leftY);
    leftY += lineHeight;
    doc.text(`Avg Order Value: ${formatCurrency(averageOrderValue)}`, leftColumnX, leftY);
    leftY += lineHeight;
    
    // Middle column - Status Details
    doc.fontSize(10).font('Helvetica-Bold').text('Status Details:', middleColumnX, middleY);
    // Draw separator line under header
    doc.moveTo(middleColumnX, middleY + headerLineYOffset).lineTo(middleColumnX + columnWidth, middleY + headerLineYOffset).stroke({ color: '#cccccc', width: 0.5 });
    middleY += lineHeight + 3;
    
    doc.fontSize(10).font('Helvetica');
    if (Object.keys(statusCounts).length > 0) {
      Object.entries(statusCounts).forEach(([status, count]) => {
        doc.text(`${status.charAt(0).toUpperCase() + status.slice(1)}: ${count}`, middleColumnX, middleY);
        middleY += lineHeight;
      });
    }
    
    // Right column - Payment & Types
    doc.fontSize(10).font('Helvetica-Bold').text('Payment & Types:', rightColumnX, rightY);
    // Draw separator line under header
    doc.moveTo(rightColumnX, rightY + headerLineYOffset).lineTo(rightColumnX + columnWidth, rightY + headerLineYOffset).stroke({ color: '#cccccc', width: 0.5 });
    rightY += lineHeight + 3;
    
    doc.fontSize(10).font('Helvetica');
    if (Object.keys(paymentStatusCounts).length > 0) {
      Object.entries(paymentStatusCounts).forEach(([status, count]) => {
        doc.text(`${status.charAt(0).toUpperCase() + status.slice(1)}: ${count}`, rightColumnX, rightY);
        rightY += lineHeight;
      });
    }
    
    if (Object.keys(orderTypeCounts).length > 0) {
      rightY += 3;
      Object.entries(orderTypeCounts).forEach(([type, count]) => {
        doc.text(`${type.charAt(0).toUpperCase() + type.slice(1)}: ${count}`, rightColumnX, rightY);
        rightY += lineHeight;
      });
    }
    
    // Move to the lower of all three columns
    const finalY = Math.max(leftY, Math.max(middleY, rightY));
    doc.y = finalY;
    doc.moveDown(1);
    
    // Table setup
    const tableTop = doc.y;
    const leftMargin = 50;
    const pageWidth = 550;
    
    // Adjust column widths based on whether customer filter is applied
    const showCustomerColumn = !customerName; // Only show customer column if no customer filter
    const availableWidth = pageWidth - leftMargin; // Total available width for columns
    
    const colWidths = showCustomerColumn ? {
      sno: 25,           // Serial number column
      orderNumber: 85,
      customer: 95,
      date: 60,
      status: 50,
      total: 60,
      items: 40,
      balance: 65,       // Customer Balance column
      receipts: 90       // Receipts column
    } : {
      sno: 25,           // Serial number column
      orderNumber: 95,   // Adjusted to fit within page
      date: 65,          // Adjusted to fit within page
      status: 50,        // Adjusted to fit within page
      total: 65,         // Adjusted to fit within page
      items: 45,         // Adjusted to fit within page, right-aligned
      balance: 65,       // Customer Balance column
      receipts: 105      // Receipts column
    };
    
    // Verify total width doesn't exceed available space
    const totalWidth = Object.values(colWidths).reduce((sum, width) => sum + width, 0);
    if (totalWidth > availableWidth) {
      // Scale down proportionally if needed
      const scale = availableWidth / totalWidth;
      Object.keys(colWidths).forEach(key => {
        colWidths[key] = Math.floor(colWidths[key] * scale);
      });
    }
    
    // Table headers
    doc.fontSize(10).font('Helvetica-Bold');
    let xPos = leftMargin;
    doc.text('SNO', xPos, tableTop, { width: colWidths.sno, align: 'center' });
    xPos += colWidths.sno;
    doc.text('Date', xPos, tableTop);
    xPos += colWidths.date;
    doc.text('Order #', xPos, tableTop);
    xPos += colWidths.orderNumber;
    if (showCustomerColumn) {
      doc.text('Customer', xPos, tableTop);
      xPos += colWidths.customer;
    }
    doc.text('Status', xPos, tableTop);
    xPos += colWidths.status;
    // Total header - right-aligned to match data
    doc.text('Total', xPos, tableTop, { width: colWidths.total, align: 'right' });
    xPos += colWidths.total;
    // Items header - right-aligned to match data
    doc.text('Items', xPos, tableTop, { width: colWidths.items, align: 'right' });
    xPos += colWidths.items;
    // Customer Balance header - right-aligned
    doc.text('Balance', xPos, tableTop, { width: colWidths.balance, align: 'right' });
    xPos += colWidths.balance;
    // Add larger gap between Balance and Receipts columns to use available space
    xPos += 20;
    // Receipts header
    doc.text('Receipts', xPos, tableTop, { width: colWidths.receipts });
    
    // Draw header line
    doc.moveTo(leftMargin, tableTop + 15).lineTo(pageWidth, tableTop + 15).stroke();
    
    let currentY = tableTop + 25;
    const rowHeight = 20;
    const pageHeight = 750;
    let serialNumber = 1; // Track serial number across pages
    
    // Table rows
    orders.forEach((order, index) => {
      // Check if we need a new page
      if (currentY > pageHeight - 50) {
        doc.addPage();
        currentY = 50;
        
        // Redraw headers on new page
        doc.fontSize(10).font('Helvetica-Bold');
        xPos = leftMargin;
        doc.text('SNO', xPos, currentY, { width: colWidths.sno, align: 'center' });
        xPos += colWidths.sno;
        doc.text('Date', xPos, currentY);
        xPos += colWidths.date;
        doc.text('Order #', xPos, currentY);
        xPos += colWidths.orderNumber;
        if (showCustomerColumn) {
          doc.text('Customer', xPos, currentY);
          xPos += colWidths.customer;
        }
        doc.text('Status', xPos, currentY);
        xPos += colWidths.status;
        // Total header - right-aligned to match data
        doc.text('Total', xPos, currentY, { width: colWidths.total, align: 'right' });
        xPos += colWidths.total;
        // Items header - right-aligned to match data
        doc.text('Items', xPos, currentY, { width: colWidths.items, align: 'right' });
        xPos += colWidths.items;
        // Customer Balance header - right-aligned
        doc.text('Balance', xPos, currentY, { width: colWidths.balance, align: 'right' });
        xPos += colWidths.balance;
        // Add larger gap between Balance and Receipts columns to use available space
        xPos += 20;
        // Receipts header
        doc.text('Receipts', xPos, currentY, { width: colWidths.receipts });
        
        doc.moveTo(leftMargin, currentY + 15).lineTo(pageWidth, currentY + 15).stroke();
        currentY += 25;
      }
      
      const statusText = order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'N/A';
      const itemsCount = order.items?.length || 0;
      
      // Get customer balance
      const customerBalance = order.customer 
        ? ((order.customer.pendingBalance || 0) + (order.customer.currentBalance || 0))
        : 0;
      
      // Get receipts for this order
      const orderIdStr = order._id.toString();
      const orderReceipts = receiptsByOrder[orderIdStr] || [];
      
      // Also get receipts for customer if no order-specific receipts
      let customerReceipts = [];
      if (orderReceipts.length === 0 && order.customer) {
        const customerIdStr = order.customer._id.toString();
        customerReceipts = receiptsByCustomer[customerIdStr] || [];
      }
      
      // Also include direct payment from invoice
      const directPayment = order.payment?.amountPaid || 0;
      const allReceipts = [...orderReceipts, ...customerReceipts];
      if (directPayment > 0) {
        allReceipts.push({
          type: 'Invoice',
          voucherCode: order.orderNumber || 'N/A',
          amount: directPayment,
          date: order.createdAt,
          method: order.payment?.method || 'N/A'
        });
      }
      
      // Format receipts text - very compact format to avoid overflow
      let receiptsText = '-';
      if (allReceipts.length > 0) {
        // Calculate total receipt amount
        const totalReceiptAmount = allReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);
        
        // Show summary: count and total amount
        const receiptCount = allReceipts.length;
        const receiptTypes = [...new Set(allReceipts.map(r => r.type === 'Cash' ? 'C' : r.type === 'Bank' ? 'B' : 'I'))];
        const typeSummary = receiptTypes.join('/');
        
        // Format: TypeCount:TotalAmount (e.g., "C2/B1: $1,500.00")
        receiptsText = `${typeSummary}${receiptCount}: ${formatCurrency(totalReceiptAmount)}`;
        
        // If text is still too long, truncate further
        if (receiptsText.length > 25) {
          receiptsText = `${receiptCount} rec: ${formatCurrency(totalReceiptAmount)}`;
        }
      }
      
      doc.fontSize(9).font('Helvetica');
      xPos = leftMargin;
      // Serial number - centered
      doc.text(serialNumber.toString(), xPos, currentY, { 
        width: colWidths.sno,
        align: 'center'
      });
      xPos += colWidths.sno;
      serialNumber++; // Increment for next row
      // Date - before Order #
      doc.text(formatDate(order.createdAt), xPos, currentY, { 
        width: colWidths.date
      });
      xPos += colWidths.date;
      // Order number - prevent wrapping, use ellipsis if too long
      const orderNum = order.orderNumber || 'N/A';
      doc.text(orderNum, xPos, currentY, { 
        width: colWidths.orderNumber,
        ellipsis: true
      });
      xPos += colWidths.orderNumber;
      // Customer name - only show if no customer filter is applied
      if (showCustomerColumn) {
        const orderCustomerName = order.customer?.businessName || 
                                order.customer?.name || 
                                `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim() || 
                                'Walk-in Customer';
        doc.text(orderCustomerName.substring(0, 20), xPos, currentY, { 
          width: colWidths.customer,
          ellipsis: true
        });
        xPos += colWidths.customer;
      }
      doc.text(statusText, xPos, currentY, { 
        width: colWidths.status
      });
      xPos += colWidths.status;
      doc.text(formatCurrency(order.pricing?.total || 0), xPos, currentY, { 
        width: colWidths.total, 
        align: 'right'
      });
      xPos += colWidths.total;
      doc.text(itemsCount.toString(), xPos, currentY, { 
        width: colWidths.items, 
        align: 'right'
      });
      xPos += colWidths.items;
      // Customer Balance - right-aligned
      doc.text(formatCurrency(customerBalance), xPos, currentY, { 
        width: colWidths.balance, 
        align: 'right'
      });
      xPos += colWidths.balance;
      // Add larger gap between Balance and Receipts columns to use available space
      xPos += 20;
      // Receipts - use smaller font and compact format
      doc.fontSize(8).text(receiptsText, xPos, currentY, { 
        width: colWidths.receipts,
        ellipsis: true
      });
      doc.fontSize(9); // Reset font size
      
      // Draw row line
      doc.moveTo(leftMargin, currentY + 12).lineTo(pageWidth, currentY + 12).stroke({ color: '#cccccc', width: 0.5 });
      
      currentY += rowHeight;
    });
    
    // Footer - Center aligned (same line format like invoice)
    currentY += 20;
    if (currentY > pageHeight - 50) {
      doc.addPage();
      currentY = 50;
    }
    
    doc.moveDown(2);
    let footerText = `Generated on: ${formatDate(new Date())}`;
    if (req.user) {
      const userName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim();
      if (userName) {
        footerText += ` | Generated by: ${userName}`;
      }
    }
    // Center the footer text by using the full page width
    const footerX = leftMargin;
    const footerWidth = pageWidth - leftMargin;
    doc.fontSize(9).font('Helvetica').text(footerText, footerX, doc.y, { 
      width: footerWidth,
      align: 'center' 
    });
    
    // Add date range below if available
    if (earliestDate && latestDate) {
      doc.moveDown(0.3);
      const dateRangeText = `Date Range: ${formatDate(earliestDate)} ${formatDate(latestDate)}`;
      doc.fontSize(9).font('Helvetica').text(dateRangeText, footerX, doc.y, { 
        width: footerWidth,
        align: 'center' 
      });
    }
    
    // Finalize PDF
    doc.end();
    
    // Wait for stream to finish
    await new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve();
      });
      stream.on('error', reject);
    });
    
    res.json({
      message: 'Orders exported successfully',
      filename: filename,
      recordCount: orders.length,
      downloadUrl: `/api/orders/download/${filename}`
    });
    
  } catch (error) {
    logger.error('PDF export error:', { error: error });
    res.status(500).json({ message: 'Export failed', error: error.message });
  }
});

// @route   POST /api/orders/export/json
// @desc    Export orders to JSON
// @access  Private
router.post('/export/json', [auth, tenantMiddleware, requirePermission('view_orders')], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { filters = {} } = req.body;
    
    // Build query based on filters (same as Excel export)
    const filter = { tenantId }; // Always include tenantId for isolation
    
    if (filters.search) {
      filter.$or = [
        { orderNumber: { $regex: filters.search, $options: 'i' } }
      ];
    }
    
    if (filters.status) {
      filter.status = filters.status;
    }
    
    if (filters.paymentStatus) {
      filter['payment.status'] = filters.paymentStatus;
    }
    
    if (filters.orderType) {
      filter.orderType = filters.orderType;
    }
    
    if (filters.customer) {
      filter.customer = filters.customer;
    }
    
    if (filters.dateFrom || filters.dateTo) {
      filter.createdAt = {};
      if (filters.dateFrom) {
        const dateFrom = new Date(filters.dateFrom);
        dateFrom.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = dateFrom;
      }
      if (filters.dateTo) {
        const dateTo = new Date(filters.dateTo);
        dateTo.setDate(dateTo.getDate() + 1);
        dateTo.setHours(0, 0, 0, 0);
        filter.createdAt.$lt = dateTo;
      }
    }
    
    const orders = await Sales.find(filter)
      .populate('customer', 'businessName name firstName lastName email phone')
      .populate('items.product', 'name')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();
    
    // Ensure exports directory exists
    const exportsDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }
    
    // Generate unique filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `sales_${timestamp}.json`;
    const filepath = path.join(exportsDir, filename);
    
    // Write JSON file
    fs.writeFileSync(filepath, JSON.stringify(orders, null, 2), 'utf8');
    
    res.json({
      message: 'Orders exported successfully',
      filename: filename,
      recordCount: orders.length,
      downloadUrl: `/api/orders/download/${filename}`
    });
    
  } catch (error) {
    logger.error('JSON export error:', { error: error });
    res.status(500).json({ message: 'Export failed', error: error.message });
  }
});

// @route   GET /api/orders/download/:filename
// @desc    Download exported file
// @access  Private
router.get('/download/:filename', [auth, tenantMiddleware, requirePermission('view_orders')], async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(__dirname, '../exports', filename);
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    let disposition = 'attachment';
    
    if (ext === '.pdf') {
      contentType = 'application/pdf';
      // For PDF, check if we should show inline
      if (req.query.view === 'inline' || req.headers.accept?.includes('application/pdf')) {
        disposition = 'inline';
      }
    } else if (ext === '.xlsx') {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (ext === '.csv') {
      contentType = 'text/csv';
    } else if (ext === '.json') {
      contentType = 'application/json';
    }
    
    // Set headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    
    // For PDF inline viewing, we need Content-Length
    if (ext === '.pdf' && disposition === 'inline') {
      const stats = fs.statSync(filepath);
      res.setHeader('Content-Length', stats.size);
    }
    
    // Stream the file
    const stream = fs.createReadStream(filepath);
    stream.pipe(res);
    
  } catch (error) {
    logger.error('Download error:', { error: error });
    res.status(500).json({ message: 'Download failed', error: error.message });
  }
});

module.exports = router;
