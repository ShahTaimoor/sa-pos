const express = require('express');
const router = express.Router();
const { query } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const financialValidationService = require('../services/financialValidationService');
const { handleValidationErrors } = require('../middleware/validation');
const logger = require('../utils/logger');

/**
 * @route   GET /api/financial-validation/balance-sheet
 * @desc    Validate balance sheet equation
 * @access  Private (requires 'view_financials' permission)
 */
router.get('/balance-sheet', [
  auth,
  tenantMiddleware,
  requirePermission('view_financials'),
  query('asOfDate').optional().isISO8601().withMessage('Invalid date format'),
  handleValidationErrors
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate) : new Date();
    const result = await financialValidationService.validateBalanceSheetEquation(asOfDate, tenantId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Balance sheet validation error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error validating balance sheet equation',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/financial-validation/account-balances
 * @desc    Validate all account balances
 * @access  Private
 */
router.get('/account-balances', [
  auth,
  tenantMiddleware,
  requirePermission('view_financials'),
  handleValidationErrors
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    const issues = await financialValidationService.validateAllAccountBalances(tenantId);
    
    res.json({
      success: true,
      data: {
        issues,
        totalIssues: issues.length,
        criticalIssues: issues.filter(i => i.severity === 'high').length
      }
    });
  } catch (error) {
    logger.error('Account balance validation error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error validating account balances',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/financial-validation/transaction
 * @desc    Validate transaction before creation
 * @access  Private
 */
router.post('/transaction', [
  auth,
  tenantMiddleware,
  requirePermission('create_transactions'),
  handleValidationErrors
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    const transaction = req.body;
    const issues = await financialValidationService.validateTransaction(transaction, tenantId);
    
    if (issues.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Transaction validation failed',
        issues
      });
    }
    
    res.json({
      success: true,
      message: 'Transaction validation passed'
    });
  } catch (error) {
    logger.error('Transaction validation error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error validating transaction',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/financial-validation/journal-entry
 * @desc    Validate journal entry balances
 * @access  Private
 */
router.post('/journal-entry', [
  auth,
  tenantMiddleware,
  requirePermission('create_journal_entries'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { entries } = req.body;
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    const issues = await financialValidationService.validateJournalEntryBalances(entries, tenantId);
    
    if (issues.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Journal entry validation failed',
        issues
      });
    }
    
    res.json({
      success: true,
      message: 'Journal entry validation passed'
    });
  } catch (error) {
    logger.error('Journal entry validation error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error validating journal entry',
      error: error.message
    });
  }
});

module.exports = router;

