const express = require('express');
const router = express.Router();
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { query, param } = require('express-validator');
const { handleValidationErrors, sanitizeRequest } = require('../middleware/validation');
const trialBalanceService = require('../services/trialBalanceService');
const logger = require('../utils/logger');

/**
 * Trial Balance API Routes
 * CRITICAL: Required for period closing validation and audit compliance
 */

// @route   GET /api/trial-balance
// @desc    Generate trial balance for a specific date
// @access  Private (requires 'view_reports' permission)
router.get('/', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports'),
  sanitizeRequest,
  query('asOfDate').optional().isISO8601().toDate().withMessage('Valid date format required (YYYY-MM-DD)'),
  query('periodId').optional().isMongoId().withMessage('Valid period ID required'),
  handleValidationErrors,
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
    const periodId = req.query.periodId || null;

    const trialBalance = await trialBalanceService.generateTrialBalance(asOfDate, tenantId, periodId);

    res.json({
      success: true,
      data: trialBalance,
      message: trialBalance.isBalanced 
        ? 'Trial balance is balanced' 
        : 'Trial balance is unbalanced - please review'
    });
  } catch (error) {
    logger.error('Error generating trial balance:', error);
    res.status(500).json({
      success: false,
      message: 'Server error generating trial balance',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/trial-balance/validate
// @desc    Validate trial balance before period closing
// @access  Private (requires 'close_accounting_periods' permission)
router.get('/validate', [
  auth,
  requirePermission('close_accounting_periods'),
  sanitizeRequest,
  query('asOfDate').isISO8601().toDate().withMessage('Valid date format required (YYYY-MM-DD)'),
  query('periodId').isMongoId().withMessage('Valid period ID is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const asOfDate = new Date(req.query.asOfDate);
    const periodId = req.query.periodId;

    const validation = await trialBalanceService.validateTrialBalance(asOfDate, periodId);

    res.json({
      success: true,
      data: validation,
      message: validation.valid 
        ? 'Trial balance is valid for period closing' 
        : 'Trial balance validation failed'
    });
  } catch (error) {
    logger.error('Error validating trial balance:', error);
    
    // If validation fails, return 400 (bad request) not 500
    if (error.message.includes('unbalanced')) {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: 'Trial balance validation failed'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error validating trial balance',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/trial-balance/summary
// @desc    Get trial balance summary by account type
// @access  Private (requires 'view_reports' permission)
router.get('/summary', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports'),
  sanitizeRequest,
  query('asOfDate').optional().isISO8601().toDate().withMessage('Valid date format required (YYYY-MM-DD)'),
  handleValidationErrors,
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

    const summary = await trialBalanceService.getTrialBalanceSummary(asOfDate, tenantId);

    res.json({
      success: true,
      data: summary,
      message: 'Trial balance summary generated successfully'
    });
  } catch (error) {
    logger.error('Error generating trial balance summary:', error);
    res.status(500).json({
      success: false,
      message: 'Server error generating trial balance summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

