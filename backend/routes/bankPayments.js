const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const BankPayment = require('../models/BankPayment'); // Still needed for new BankPayment() and static methods
const Bank = require('../models/Bank'); // Still needed for model reference in populate
const Sales = require('../models/Sales'); // Still needed for model reference in populate
const bankPaymentRepository = require('../repositories/BankPaymentRepository');
const bankRepository = require('../repositories/BankRepository');
const supplierRepository = require('../repositories/SupplierRepository');
const customerRepository = require('../repositories/CustomerRepository');
const chartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');
const salesRepository = require('../repositories/SalesRepository');

// @route   GET /api/bank-payments
// @desc    Get all bank payments with filtering and pagination
// @access  Private
router.get('/', [
  auth,
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

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get bank payments with pagination
    const result = await bankPaymentRepository.findWithPagination(filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { date: -1, createdAt: -1 },
      populate: [
        { path: 'bank', select: 'accountName accountNumber bankName' },
        { path: 'order', model: 'Sales', select: 'orderNumber' },
        { path: 'supplier', select: 'name businessName' },
        { path: 'customer', select: 'name email' },
        { path: 'createdBy', select: 'firstName lastName' },
        { path: 'expenseAccount', select: 'accountName accountCode' }
      ]
    });
    
    const bankPayments = result.bankPayments;
    const total = result.total;

    res.json({
      success: true,
      data: {
        bankPayments,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get bank payments error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/bank-payments
// @desc    Create new bank payment
// @access  Private
router.post('/', [
  auth,
  requirePermission('create_orders'),
  body('date').optional().isISO8601().withMessage('Date must be a valid date'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('particular').optional().isString().trim().isLength({ max: 500 }).withMessage('Particular must be less than 500 characters'),
  body('bank').isMongoId().withMessage('Valid bank account is required'),
  body('bankAccount').optional().isString().trim().isLength({ min: 1, max: 100 }).withMessage('Bank account must be a string (deprecated - use bank)'),
  body('bankName').optional().isString().trim().isLength({ min: 1, max: 100 }).withMessage('Bank name must be a string (deprecated - use bank)'),
  body('transactionReference').optional().isString().trim().withMessage('Transaction reference must be a string'),
  body('order').optional().isMongoId().withMessage('Invalid order ID'),
  body('supplier').optional().isMongoId().withMessage('Invalid supplier ID'),
  body('customer').optional().isMongoId().withMessage('Invalid customer ID'),
  body('expenseAccount').optional().isMongoId().withMessage('Invalid expense account ID'),
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
      bank,
      bankAccount,
      bankName,
      transactionReference,
      order,
      supplier,
      customer,
      notes,
      expenseAccount
    } = req.body;

    // Validate order exists if provided
    if (order) {
      const orderExists = await salesRepository.findById(order);
      if (!orderExists) {
        return res.status(400).json({ 
          success: false,
          message: 'Order not found' 
        });
      }
    }

    // Validate supplier exists if provided
    if (supplier) {
      const supplierExists = await supplierRepository.findById(supplier);
      if (!supplierExists) {
        return res.status(400).json({ 
          success: false,
          message: 'Supplier not found' 
        });
      }
    }

    // Validate customer exists if provided
    if (customer) {
      const customerExists = await customerRepository.findById(customer);
      if (!customerExists) {
        return res.status(400).json({ 
          success: false,
          message: 'Customer not found' 
        });
      }
    }

    // Validate bank exists
    const bankExists = await bankRepository.findById(bank);
    if (!bankExists) {
      return res.status(400).json({ 
        success: false,
        message: 'Bank account not found' 
      });
    }

    if (!bankExists.isActive) {
      return res.status(400).json({ 
        success: false,
        message: 'Bank account is inactive' 
      });
    }

    let expenseAccountDoc = null;
    if (expenseAccount) {
      expenseAccountDoc = await chartOfAccountsRepository.findById(expenseAccount);
      if (!expenseAccountDoc) {
        return res.status(400).json({
          success: false,
          message: 'Expense account not found'
        });
      }
    }

    const resolvedParticular = particular
      ? particular.trim()
      : expenseAccountDoc
        ? `Expense - ${expenseAccountDoc.accountName}`
        : 'Bank Payment';

    // Create bank payment
    const bankPaymentData = {
      date: date ? new Date(date) : new Date(),
      amount: parseFloat(amount),
      particular: resolvedParticular,
      bank: bank,
      transactionReference: transactionReference ? transactionReference.trim() : null,
      order: order || null,
      supplier: supplier || null,
      customer: customer || null,
      notes: notes ? notes.trim() : null,
      createdBy: req.user._id,
      expenseAccount: expenseAccountDoc ? expenseAccountDoc._id : null
    };

    const bankPayment = new BankPayment(bankPaymentData);
    await bankPayment.save();

    // Update supplier balance if supplier is provided
    if (supplier && amount > 0) {
      try {
        const SupplierBalanceService = require('../services/supplierBalanceService');
        await SupplierBalanceService.recordPayment(supplier, amount, order);
      } catch (error) {
        console.error('Error updating supplier balance for bank payment:', error);
        // Don't fail the bank payment creation if balance update fails
      }
    }

    // Update customer balance if customer is provided
    // When we pay bank payment to a customer, we're giving them money (refund/advance)
    // This should use recordRefund() which properly handles reducing advanceBalance first,
    // then increasing advanceBalance if we're paying more than their credit
    if (customer && amount > 0) {
      try {
        const CustomerBalanceService = require('../services/customerBalanceService');
        await CustomerBalanceService.recordRefund(customer, amount, order);
      } catch (error) {
        console.error('Error updating customer balance for bank payment:', error);
        // Don't fail the bank payment creation if balance update fails
      }
    }

    // Create accounting entries
    try {
      const AccountingService = require('../services/accountingService');
      await AccountingService.recordBankPayment(bankPayment);
    } catch (error) {
      console.error('Error creating accounting entries for bank payment:', error);
      // Don't fail the bank payment creation if accounting fails
    }

    // Populate the created payment
    await bankPayment.populate([
      { path: 'bank', select: 'accountName accountNumber bankName' },
      { path: 'order', select: 'orderNumber' },
      { path: 'supplier', select: 'name businessName' },
      { path: 'customer', select: 'name email' },
      { path: 'createdBy', select: 'firstName lastName' },
      { path: 'expenseAccount', select: 'accountName accountCode' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Bank payment created successfully',
      data: bankPayment
    });
  } catch (error) {
    console.error('Create bank payment error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/bank-payments/summary/date-range
// @desc    Get bank payments summary for date range
// @access  Private
router.get('/summary/date-range', [
  auth,
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

    const filter = {
      date: {
        $gte: new Date(fromDate),
        $lte: new Date(toDate + 'T23:59:59.999Z')
      }
    };

    // Get summary data
    const summary = await bankPaymentRepository.getSummary(filter);

    const result = summary.length > 0 ? summary[0] : {
      totalAmount: 0,
      totalCount: 0,
      averageAmount: 0
    };

    res.json({
      success: true,
      data: {
        fromDate,
        toDate,
        totalAmount: result.totalAmount,
        totalCount: result.totalCount,
        averageAmount: result.averageAmount
      }
    });
  } catch (error) {
    console.error('Get bank payments summary error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
