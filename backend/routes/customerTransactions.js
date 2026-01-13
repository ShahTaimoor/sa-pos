const express = require('express');
const router = express.Router();
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const customerTransactionService = require('../services/customerTransactionService');
const { body, param, query } = require('express-validator');
const logger = require('../utils/logger');

// @route   POST /api/customer-transactions
// @desc    Create a customer transaction
// @access  Private
router.post('/', [
  auth,
  tenantMiddleware,
  requirePermission('create_customer_transactions'),
  body('customerId').isMongoId().withMessage('Valid customer ID is required'),
  body('transactionType').isIn(['invoice', 'payment', 'refund', 'credit_note', 'debit_note', 'adjustment', 'write_off', 'reversal', 'opening_balance']).withMessage('Valid transaction type is required'),
  body('netAmount').isFloat({ min: 0 }).withMessage('Net amount must be a positive number'),
  body('referenceType').isIn(['sales_order', 'payment', 'refund', 'adjustment', 'manual_entry', 'system_generated', 'opening_balance']).withMessage('Valid reference type is required')
], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const transaction = await customerTransactionService.createTransaction(req.body, req.user, tenantId);
    res.status(201).json({ success: true, data: transaction });
  } catch (error) {
    logger.error('Create transaction error:', { error: error });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/customer-transactions/customer/:customerId
// @desc    Get transactions for a customer
// @access  Private
router.get('/customer/:customerId', [
  auth,
  tenantMiddleware,
  requirePermission('view_customer_transactions'),
  param('customerId').isMongoId().withMessage('Valid customer ID is required')
], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const options = {
      limit: parseInt(req.query.limit) || 50,
      skip: parseInt(req.query.skip) || 0,
      transactionType: req.query.transactionType,
      status: req.query.status,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      includeReversed: req.query.includeReversed === 'true'
    };

    const result = await customerTransactionService.getCustomerTransactions(req.params.customerId, options, tenantId);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Get customer transactions error:', { error: error });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/customer-transactions/apply-payment
// @desc    Apply payment to invoices
// @access  Private
router.post('/apply-payment', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('create_customer_transactions'),
  body('customerId').isMongoId().withMessage('Valid customer ID is required'),
  body('paymentAmount').isFloat({ min: 0.01 }).withMessage('Payment amount must be positive'),
  body('applications').isArray().withMessage('Applications must be an array'),
  body('applications.*.invoiceId').isMongoId().withMessage('Valid invoice ID is required'),
  body('applications.*.amount').isFloat({ min: 0.01 }).withMessage('Application amount must be positive')
], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const paymentApplication = await customerTransactionService.applyPayment(
      req.body.customerId,
      req.body.paymentAmount,
      req.body.applications,
      req.user,
      tenantId
    );
    res.status(201).json({ success: true, data: paymentApplication });
  } catch (error) {
    logger.error('Apply payment error:', { error: error });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/customer-transactions/:id/reverse
// @desc    Reverse a transaction (full reversal)
// @access  Private
router.post('/:id/reverse', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('reverse_customer_transactions'),
  param('id').isMongoId().withMessage('Valid transaction ID is required'),
  body('reason').trim().isLength({ min: 1 }).withMessage('Reason is required')
], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const reversal = await customerTransactionService.reverseTransaction(
      req.params.id,
      req.body.reason,
      req.user,
      tenantId
    );
    res.json({ success: true, data: reversal });
  } catch (error) {
    logger.error('Reverse transaction error:', { error: error });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/customer-transactions/:id/partial-reverse
// @desc    Partially reverse a transaction
// @access  Private
router.post('/:id/partial-reverse', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('reverse_customer_transactions'),
  param('id').isMongoId().withMessage('Valid transaction ID is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('reason').trim().isLength({ min: 1 }).withMessage('Reason is required')
], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const reversal = await customerTransactionService.partialReverseTransaction(
      req.params.id,
      req.body.amount,
      req.body.reason,
      req.user,
      tenantId
    );
    res.json({ success: true, data: reversal });
  } catch (error) {
    logger.error('Partial reverse transaction error:', { error: error });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/customer-transactions/customer/:customerId/overdue
// @desc    Get overdue invoices for a customer
// @access  Private
router.get('/customer/:customerId/overdue', [
  auth,
  tenantMiddleware,
  requirePermission('view_customer_transactions'),
  param('customerId').isMongoId().withMessage('Valid customer ID is required')
], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const overdueInvoices = await customerTransactionService.getOverdueInvoices(req.params.customerId, tenantId);
    res.json({ success: true, data: overdueInvoices });
  } catch (error) {
    logger.error('Get overdue invoices error:', { error: error });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/customer-transactions/customer/:customerId/aging
// @desc    Get customer aging report
// @access  Private
router.get('/customer/:customerId/aging', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('view_customer_reports'),
  param('customerId').isMongoId().withMessage('Valid customer ID is required')
], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const aging = await customerTransactionService.getCustomerAging(req.params.customerId, tenantId);
    res.json({ success: true, data: aging });
  } catch (error) {
    logger.error('Get customer aging error:', { error: error });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;

