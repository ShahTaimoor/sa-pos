const express = require('express');
const router = express.Router();
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const dataIntegrityService = require('../services/dataIntegrityService');
const { handleValidationErrors } = require('../middleware/validation');
const logger = require('../utils/logger');

/**
 * @route   GET /api/data-integrity/validate
 * @desc    Run all data integrity validations
 * @access  Private (requires 'manage_financials' permission)
 */
router.get('/validate', [
  auth,
  tenantMiddleware,
  requirePermission('manage_financials'),
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
    
    const results = await dataIntegrityService.runAllValidations(tenantId);
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error('Data integrity validation error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error running data integrity validations',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/data-integrity/double-entry
 * @desc    Validate double-entry bookkeeping
 * @access  Private
 */
router.get('/double-entry', [
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
    
    const discrepancies = await dataIntegrityService.validateDoubleEntry(tenantId);
    
    res.json({
      success: true,
      data: {
        discrepancies,
        totalIssues: discrepancies.length
      }
    });
  } catch (error) {
    logger.error('Double-entry validation error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error validating double-entry bookkeeping',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/data-integrity/referential
 * @desc    Validate referential integrity
 * @access  Private
 */
router.get('/referential', [
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
    const issues = await dataIntegrityService.validateReferentialIntegrity(tenantId);
    
    res.json({
      success: true,
      data: {
        issues,
        totalIssues: issues.length
      }
    });
  } catch (error) {
    logger.error('Referential integrity validation error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error validating referential integrity',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/data-integrity/duplicates
 * @desc    Detect duplicate transactions
 * @access  Private
 */
router.get('/duplicates', [
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
    const duplicates = await dataIntegrityService.detectDuplicates(tenantId);
    
    res.json({
      success: true,
      data: {
        duplicates,
        totalDuplicates: duplicates.length
      }
    });
  } catch (error) {
    logger.error('Duplicate detection error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error detecting duplicates',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/data-integrity/inventory
 * @desc    Validate inventory consistency
 * @access  Private
 */
router.get('/inventory', [
  auth,
  tenantMiddleware,
  requirePermission('view_inventory'),
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
    const issues = await dataIntegrityService.validateInventoryConsistency(tenantId);
    
    res.json({
      success: true,
      data: {
        issues,
        totalIssues: issues.length
      }
    });
  } catch (error) {
    logger.error('Inventory validation error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error validating inventory consistency',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/data-integrity/customer-balances
 * @desc    Validate customer balance consistency
 * @access  Private
 */
router.get('/customer-balances', [
  auth,
  tenantMiddleware,
  requirePermission('view_customers'),
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
    const issues = await dataIntegrityService.validateCustomerBalances(tenantId);
    
    res.json({
      success: true,
      data: {
        issues,
        totalIssues: issues.length
      }
    });
  } catch (error) {
    logger.error('Customer balance validation error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error validating customer balances',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/data-integrity/fix
 * @desc    Fix detected issues (where possible)
 * @access  Private (requires 'manage_financials' permission)
 */
router.post('/fix', [
  auth,
  tenantMiddleware,
  requirePermission('manage_financials'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { issues } = req.body;
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    if (!issues || !Array.isArray(issues)) {
      return res.status(400).json({
        success: false,
        message: 'Issues array is required'
      });
    }
    
    const fixes = await dataIntegrityService.fixIssues(issues, tenantId);
    
    res.json({
      success: true,
      data: {
        fixes,
        totalFixed: fixes.filter(f => f.fixed).length,
        totalFailed: fixes.filter(f => !f.fixed).length
      }
    });
  } catch (error) {
    logger.error('Fix issues error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error fixing issues',
      error: error.message
    });
  }
});

module.exports = router;

