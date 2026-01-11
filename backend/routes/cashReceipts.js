const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const cashReceiptService = require('../services/cashReceiptService');
const CashReceipt = require('../models/CashReceipt'); // Still needed for create/update operations
const Sales = require('../models/Sales');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const logger = require('../utils/logger');

// @route   GET /api/cash-receipts
// @desc    Get all cash receipts with filtering and pagination
// @access  Private
router.get('/', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('fromDate').optional().isISO8601().withMessage('From date must be a valid date'),
  query('toDate').optional().isISO8601().withMessage('To date must be a valid date'),
  query('dateFrom').optional().isISO8601().withMessage('DateFrom must be a valid date'),
  query('dateTo').optional().isISO8601().withMessage('DateTo must be a valid date'),
  query('voucherCode').optional().isString().trim().withMessage('Voucher code must be a string'),
  query('amount')
    .optional()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) {
        return true; // Allow empty values for optional query params
      }
      const numValue = parseFloat(value);
      return !isNaN(numValue) && numValue >= 0;
    })
    .withMessage('Amount must be a positive number'),
  query('particular').optional().isString().trim().withMessage('Particular must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      page = 1,
      limit = 50,
      fromDate: fromDateParam,
      toDate: toDateParam,
      dateFrom,
      dateTo,
      voucherCode,
      amount,
      particular
    } = req.query;
    
    // Support both fromDate/toDate and dateFrom/dateTo (from Dashboard)
    const fromDate = fromDateParam || dateFrom;
    const toDate = toDateParam || dateTo;

    // Build filter object
    const filter = {};

    // Date range filter
    if (fromDate || toDate) {
      filter.date = {};
      if (fromDate) {
        // Set to start of day (00:00:00) in local timezone
        const startOfDay = new Date(fromDate);
        startOfDay.setHours(0, 0, 0, 0);
        filter.date.$gte = startOfDay;
      }
      if (toDate) {
        // Set to end of day (23:59:59.999) - add 1 day and use $lt to include entire toDate
        const endOfDay = new Date(toDate);
        endOfDay.setDate(endOfDay.getDate() + 1);
        endOfDay.setHours(0, 0, 0, 0);
        filter.date.$lt = endOfDay;
      }
    }

    // Voucher code filter
    if (voucherCode) {
      filter.voucherCode = { $regex: voucherCode, $options: 'i' };
    }

    // Amount filter
    if (amount) {
      filter.amount = parseFloat(amount);
    }

    // Particular filter
    if (particular) {
      filter.particular = { $regex: particular, $options: 'i' };
    }

    const tenantId = req.tenantId || req.user?.tenantId;
    const result = await cashReceiptService.getCashReceipts({
      page,
      limit,
      fromDate,
      toDate,
      dateFrom,
      dateTo,
      voucherCode,
      amount,
      particular
    }, tenantId);

    res.json({
      success: true,
      data: {
        cashReceipts: result.cashReceipts,
        pagination: result.pagination
      }
    });
  } catch (error) {
    logger.error('Get cash receipts error:', { error: error });
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/cash-receipts/:id
// @desc    Get single cash receipt
// @access  Private
router.get('/:id', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports')
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const cashReceipt = await cashReceiptService.getCashReceiptById(req.params.id, tenantId);

    res.json({
      success: true,
      data: cashReceipt
    });
  } catch (error) {
    if (error.message === 'Cash receipt not found') {
      return res.status(404).json({ 
        success: false,
        message: 'Cash receipt not found' 
      });
    }
    logger.error('Get cash receipt error:', { error: error });
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/cash-receipts
// @desc    Create new cash receipt
// @access  Private
router.post('/', [
  auth,
  tenantMiddleware,
  requirePermission('create_orders'),
  body('date').optional().isISO8601().withMessage('Date must be a valid date'),
  body('amount')
    .custom((value) => {
      if (value === '' || value === null || value === undefined) {
        return false;
      }
      const numValue = parseFloat(value);
      return !isNaN(numValue) && numValue >= 0;
    })
    .withMessage('Amount must be a positive number'),
  body('particular').optional().isString().trim().isLength({ max: 500 }).withMessage('Particular must be less than 500 characters'),
  body('order').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid order ID'),
  body('customer').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid customer ID'),
  body('supplier').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid supplier ID'),
  body('paymentMethod').optional().isIn(['cash', 'check', 'bank_transfer', 'other']).withMessage('Invalid payment method'),
  body('notes').optional().isString().trim().isLength({ max: 1000 }).withMessage('Notes must be less than 1000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      date,
      amount,
      particular,
      order,
      customer,
      supplier,
      paymentMethod = 'cash',
      notes
    } = req.body;

    const tenantId = req.tenantId || req.user?.tenantId;
    
    // Validate order exists if provided (with tenant filtering)
    if (order) {
      const orderQuery = { _id: order };
      if (tenantId) {
        orderQuery.tenantId = tenantId;
      }
      const orderExists = await Sales.findOne(orderQuery);
      if (!orderExists) {
        return res.status(400).json({ 
          success: false,
          message: 'Order not found' 
        });
      }
    }

    // Validate customer exists if provided (with tenant filtering)
    if (customer) {
      const customerQuery = { _id: customer };
      if (tenantId) {
        customerQuery.tenantId = tenantId;
      }
      const customerExists = await Customer.findOne(customerQuery);
      if (!customerExists) {
        return res.status(400).json({ 
          success: false,
          message: 'Customer not found' 
        });
      }
    }

    // Validate supplier exists if provided (with tenant filtering)
    if (supplier) {
      const supplierQuery = { _id: supplier };
      if (tenantId) {
        supplierQuery.tenantId = tenantId;
      }
      const supplierExists = await Supplier.findOne(supplierQuery);
      if (!supplierExists) {
        return res.status(400).json({ 
          success: false,
          message: 'Supplier not found' 
        });
      }
    }

    // Create cash receipt (voucher code auto-generated in model pre-save)
    const cashReceiptData = {
      tenantId: req.tenantId || req.user.tenantId,
      date: date ? new Date(date) : new Date(),
      amount: parseFloat(amount),
      particular: particular ? particular.trim() : 'Cash Receipt',
      order: order || null,
      customer: customer || null,
      supplier: supplier || null,
      paymentMethod,
      notes: notes ? notes.trim() : null,
      createdBy: req.user._id
    };

    const cashReceipt = new CashReceipt(cashReceiptData);
    await cashReceipt.save();

    // Update customer balance if customer is provided
    if (customer && amount > 0) {
      try {
        const CustomerBalanceService = require('../services/customerBalanceService');
        await CustomerBalanceService.recordPayment(customer, amount, order);
      } catch (error) {
        logger.error('Error updating customer balance for cash receipt:', error);
        // Don't fail the cash receipt creation if balance update fails
      }
    }

    // Update supplier balance if supplier is provided
    // When we receive cash from a supplier, they're paying us (reduces our payables)
    if (supplier && amount > 0) {
      try {
        const SupplierBalanceService = require('../services/supplierBalanceService');
        await SupplierBalanceService.recordPayment(supplier, amount, order);
      } catch (error) {
        logger.error('Error updating supplier balance for cash receipt:', error);
        // Don't fail the cash receipt creation if balance update fails
      }
    }

    // Create accounting entries
    try {
      const AccountingService = require('../services/accountingService');
      await AccountingService.recordCashReceipt(cashReceipt);
    } catch (error) {
      logger.error('Error creating accounting entries for cash receipt:', error);
      // Don't fail the cash receipt creation if accounting fails
    }

    // Populate the created receipt
    await cashReceipt.populate([
      { path: 'order', select: 'orderNumber' },
      { path: 'customer', select: 'name businessName' },
      { path: 'supplier', select: 'name businessName' },
      { path: 'createdBy', select: 'firstName lastName' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Cash receipt created successfully',
      data: cashReceipt
    });
  } catch (error) {
    logger.error('Create cash receipt error:', { error: error });
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/cash-receipts/:id
// @desc    Update cash receipt
// @access  Private
router.put('/:id', [
  auth,
  tenantMiddleware,
  requirePermission('edit_orders'),
  body('date').optional().isISO8601().withMessage('Date must be a valid date'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('particular').optional().isString().trim().isLength({ min: 1, max: 500 }).withMessage('Particular must be between 1 and 500 characters'),
  body('order').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid order ID'),
  body('customer').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid customer ID'),
  body('supplier').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid supplier ID'),
  body('paymentMethod').optional().isIn(['cash', 'check', 'bank_transfer', 'other']).withMessage('Invalid payment method'),
  body('notes').optional().isString().trim().isLength({ max: 1000 }).withMessage('Notes must be less than 1000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.tenantId || req.user?.tenantId;
    
    // Build query with tenant filter
    const query = { _id: req.params.id };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    
    const cashReceipt = await CashReceipt.findOne(query);
    if (!cashReceipt) {
      return res.status(404).json({ 
        success: false,
        message: 'Cash receipt not found' 
      });
    }

    // Check if receipt can be updated (not cancelled)
    if (cashReceipt.status === 'cancelled') {
      return res.status(400).json({ 
        success: false,
        message: 'Cannot update cancelled cash receipt' 
      });
    }

    const {
      date,
      amount,
      particular,
      order,
      customer,
      supplier,
      paymentMethod,
      notes
    } = req.body;

    // Update fields
    if (date !== undefined) cashReceipt.date = new Date(date);
    if (amount !== undefined) cashReceipt.amount = parseFloat(amount);
    if (particular !== undefined) cashReceipt.particular = particular.trim();
    if (order !== undefined) cashReceipt.order = order || null;
    if (customer !== undefined) cashReceipt.customer = customer || null;
    if (supplier !== undefined) cashReceipt.supplier = supplier || null;
    if (paymentMethod !== undefined) cashReceipt.paymentMethod = paymentMethod;
    if (notes !== undefined) cashReceipt.notes = notes ? notes.trim() : null;
    
    cashReceipt.updatedBy = req.user._id;

    await cashReceipt.save();

    // Populate the updated receipt
    await cashReceipt.populate([
      { path: 'order', select: 'orderNumber' },
      { path: 'customer', select: 'name businessName' },
      { path: 'supplier', select: 'name businessName' },
      { path: 'createdBy', select: 'firstName lastName' }
    ]);

    res.json({
      success: true,
      message: 'Cash receipt updated successfully',
      data: cashReceipt
    });
  } catch (error) {
    logger.error('Update cash receipt error:', { error: error });
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   DELETE /api/cash-receipts/:id
// @desc    Delete cash receipt
// @access  Private
router.delete('/:id', [
  auth,
  tenantMiddleware,
  requirePermission('delete_orders')
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    
    // Build query with tenant filter
    const query = { _id: req.params.id };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    
    const cashReceipt = await CashReceipt.findOne(query);
    if (!cashReceipt) {
      return res.status(404).json({ 
        success: false,
        message: 'Cash receipt not found' 
      });
    }

    await CashReceipt.findOneAndDelete(query);

    res.json({
      success: true,
      message: 'Cash receipt deleted successfully'
    });
  } catch (error) {
    logger.error('Delete cash receipt error:', { error: error });
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/cash-receipts/summary/date-range
// @desc    Get cash receipts summary for date range
// @access  Private
router.get('/summary/date-range', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports'),
  query('fromDate').isISO8601().withMessage('From date is required and must be a valid date'),
  query('toDate').isISO8601().withMessage('To date is required and must be a valid date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { fromDate, toDate } = req.query;

    const summary = await cashReceiptService.getSummary(fromDate, toDate);

    res.json({
      success: true,
      data: {
        fromDate,
        toDate,
        totalAmount: summary.totalAmount || 0,
        totalCount: summary.totalReceipts || 0,
        averageAmount: summary.averageAmount || 0
      }
    });
  } catch (error) {
    logger.error('Get cash receipts summary error:', { error: error });
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/cash-receipts/batch
// @desc    Create multiple cash receipts in a batch (for voucher-based cash receiving)
// @access  Private
router.post('/batch', [
  auth,
  tenantMiddleware,
  requirePermission('create_orders'),
  body('voucherDate').isISO8601().withMessage('Voucher date must be a valid date'),
  body('cashAccount').optional().isString().trim().withMessage('Cash account must be a string'),
  body('paymentType').optional().isString().trim().withMessage('Payment type must be a string'),
  body('receipts').isArray().withMessage('Receipts must be an array'),
  body('receipts.*.customer').isMongoId().withMessage('Invalid customer ID'),
  body('receipts.*.amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('receipts.*.particular').optional().isString().trim().isLength({ max: 500 }).withMessage('Particular must be less than 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      voucherDate,
      cashAccount,
      paymentType = 'cash',
      receipts
    } = req.body;

    if (!receipts || receipts.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'At least one receipt entry is required' 
      });
    }

    const tenantId = req.tenantId || req.user?.tenantId;
    
    // Validate all customers exist (with tenant filtering)
    const customerIds = receipts.map(r => r.customer).filter(Boolean);
    const customers = await cashReceiptService.getCustomersByIds(customerIds, tenantId);
    
    if (customers.length !== customerIds.length) {
      return res.status(400).json({ 
        success: false,
        message: 'One or more customers not found' 
      });
    }

    // Validate that at least one receipt has a valid amount
    const validReceipts = receipts.filter(r => r.amount && parseFloat(r.amount) > 0);
    if (validReceipts.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'At least one receipt with a positive amount is required' 
      });
    }

    // Create cash receipts
    const createdReceipts = [];
    const CustomerBalanceService = require('../services/customerBalanceService');
    const AccountingService = require('../services/accountingService');

    for (const receiptData of receipts) {
      if (!receiptData.amount || receiptData.amount <= 0) {
        continue; // Skip zero amounts
      }

      const cashReceiptData = {
        tenantId: tenantId,
        date: new Date(voucherDate),
        amount: parseFloat(receiptData.amount),
        particular: receiptData.particular ? receiptData.particular.trim() : 'Cash Receipt',
        customer: receiptData.customer,
        paymentMethod: paymentType.toLowerCase(),
        notes: cashAccount ? `Cash Account: ${cashAccount}` : null,
        createdBy: req.user._id
      };

      const cashReceipt = new CashReceipt(cashReceiptData);
      await cashReceipt.save();

      // Update customer balance
      if (receiptData.customer && receiptData.amount > 0) {
        try {
          await CustomerBalanceService.recordPayment(receiptData.customer, receiptData.amount, null);
        } catch (error) {
          logger.error(`Error updating customer ${receiptData.customer} balance:`, error);
        }
      }

      // Create accounting entries
      try {
        await AccountingService.recordCashReceipt(cashReceipt);
      } catch (error) {
        logger.error(`Error creating accounting entries for cash receipt ${cashReceipt._id}:`, error);
      }

      await cashReceipt.populate([
        { path: 'customer', select: 'name businessName' },
        { path: 'createdBy', select: 'firstName lastName' }
      ]);

      createdReceipts.push(cashReceipt);
    }

    const totalAmount = createdReceipts.reduce((sum, r) => sum + r.amount, 0);

    res.status(201).json({
      success: true,
      message: `Successfully created ${createdReceipts.length} cash receipt(s)`,
      data: {
        receipts: createdReceipts,
        count: createdReceipts.length,
        totalAmount
      }
    });
  } catch (error) {
    logger.error('Batch create cash receipts error:', { error: error });
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
