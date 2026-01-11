/**
 * Fiscal Year Routes
 * 
 * STEP 7: Routes for managing fiscal years and period locking.
 * Prevents posting transactions into closed months or years.
 */

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { handleValidationErrors, sanitizeRequest } = require('../middleware/validation');
const FiscalYear = require('../models/FiscalYear');
const logger = require('../utils/logger');

/**
 * @route   POST /api/fiscal-years
 * @desc    Create a new fiscal year
 * @access  Private (requires 'manage_accounts' permission)
 */
router.post('/', [
  auth,
  requirePermission('manage_accounts'),
  tenantMiddleware,
  sanitizeRequest,
  body('year').isInt({ min: 2000, max: 2100 }).withMessage('Valid year (2000-2100) is required'),
  body('startDate').isISO8601().toDate().withMessage('Valid start date is required'),
  body('endDate').isISO8601().toDate().withMessage('Valid end date is required'),
  body('description').optional().isString().trim(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { year, startDate, endDate, description } = req.body;
    const tenantId = req.tenantId || req.user?.tenantId;
    const userId = req.user._id;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    // Check if fiscal year already exists
    const existing = await FiscalYear.findOne({ tenantId, year });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Fiscal year ${year} already exists`
      });
    }

    // Validate date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be before end date'
      });
    }

    // Create fiscal year with periods
    const fiscalYear = await FiscalYear.createFiscalYear({
      tenantId,
      year,
      startDate: start,
      endDate: end,
      createdBy: userId,
      description
    });

    res.status(201).json({
      success: true,
      message: `Fiscal year ${year} created successfully`,
      data: fiscalYear
    });
  } catch (error) {
    logger.error('Error creating fiscal year:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create fiscal year',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/fiscal-years
 * @desc    Get all fiscal years for tenant
 * @access  Private
 */
router.get('/', [
  auth,
  tenantMiddleware,
  sanitizeRequest
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { year, isClosed } = req.query;

    const filter = { tenantId };
    if (year) filter.year = parseInt(year);
    if (isClosed !== undefined) filter.isClosed = isClosed === 'true';

    const fiscalYears = await FiscalYear.find(filter)
      .populate('createdBy', 'firstName lastName')
      .populate('closedBy', 'firstName lastName')
      .sort({ year: -1 });

    res.json({
      success: true,
      data: fiscalYears,
      count: fiscalYears.length
    });
  } catch (error) {
    logger.error('Error fetching fiscal years:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch fiscal years',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/fiscal-years/current
 * @desc    Get current active fiscal year
 * @access  Private
 */
router.get('/current', [
  auth,
  tenantMiddleware,
  sanitizeRequest
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const fiscalYear = await FiscalYear.getCurrentFiscalYear(tenantId);

    if (!fiscalYear) {
      return res.status(404).json({
        success: false,
        message: 'No active fiscal year found'
      });
    }

    res.json({
      success: true,
      data: fiscalYear
    });
  } catch (error) {
    logger.error('Error fetching current fiscal year:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch current fiscal year',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/fiscal-years/:id
 * @desc    Get fiscal year by ID
 * @access  Private
 */
router.get('/:id', [
  auth,
  tenantMiddleware,
  sanitizeRequest,
  param('id').isMongoId().withMessage('Valid fiscal year ID is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId || req.user?.tenantId;

    const fiscalYear = await FiscalYear.findOne({ _id: id, tenantId })
      .populate('createdBy', 'firstName lastName')
      .populate('closedBy', 'firstName lastName')
      .populate('periods.lockedBy', 'firstName lastName')
      .populate('periods.closedBy', 'firstName lastName');

    if (!fiscalYear) {
      return res.status(404).json({
        success: false,
        message: 'Fiscal year not found'
      });
    }

    res.json({
      success: true,
      data: fiscalYear
    });
  } catch (error) {
    logger.error('Error fetching fiscal year:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch fiscal year',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   PUT /api/fiscal-years/:id/lock-period/:period
 * @desc    Lock a period (prevent new transactions)
 * @access  Private (requires 'lock_periods' permission)
 */
router.put('/:id/lock-period/:period', [
  auth,
  requirePermission('lock_periods'),
  tenantMiddleware,
  sanitizeRequest,
  param('id').isMongoId().withMessage('Valid fiscal year ID is required'),
  param('period').isInt({ min: 1, max: 12 }).withMessage('Valid period (1-12) is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id, period } = req.params;
    const tenantId = req.tenantId || req.user?.tenantId;
    const userId = req.user._id;

    const fiscalYear = await FiscalYear.findOne({ _id: id, tenantId });
    if (!fiscalYear) {
      return res.status(404).json({
        success: false,
        message: 'Fiscal year not found'
      });
    }

    await fiscalYear.lockPeriod(parseInt(period), userId);

    res.json({
      success: true,
      message: `Period ${period} locked successfully`,
      data: fiscalYear
    });
  } catch (error) {
    logger.error('Error locking period:', error);
    
    if (error.message.includes('already locked') || error.message.includes('not found')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to lock period',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   PUT /api/fiscal-years/:id/close-period/:period
 * @desc    Close a period (permanent lock)
 * @access  Private (requires 'close_periods' permission)
 */
router.put('/:id/close-period/:period', [
  auth,
  requirePermission('close_periods'),
  tenantMiddleware,
  sanitizeRequest,
  param('id').isMongoId().withMessage('Valid fiscal year ID is required'),
  param('period').isInt({ min: 1, max: 12 }).withMessage('Valid period (1-12) is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id, period } = req.params;
    const tenantId = req.tenantId || req.user?.tenantId;
    const userId = req.user._id;

    const fiscalYear = await FiscalYear.findOne({ _id: id, tenantId });
    if (!fiscalYear) {
      return res.status(404).json({
        success: false,
        message: 'Fiscal year not found'
      });
    }

    await fiscalYear.closePeriod(parseInt(period), userId);

    res.json({
      success: true,
      message: `Period ${period} closed successfully`,
      data: fiscalYear
    });
  } catch (error) {
    logger.error('Error closing period:', error);
    
    if (error.message.includes('must be locked') || error.message.includes('not found')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to close period',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   PUT /api/fiscal-years/:id/close
 * @desc    Close fiscal year (all periods must be closed first)
 * @access  Private (requires 'close_fiscal_year' permission)
 */
router.put('/:id/close', [
  auth,
  requirePermission('close_fiscal_year'),
  tenantMiddleware,
  sanitizeRequest,
  param('id').isMongoId().withMessage('Valid fiscal year ID is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId || req.user?.tenantId;
    const userId = req.user._id;

    const fiscalYear = await FiscalYear.findOne({ _id: id, tenantId });
    if (!fiscalYear) {
      return res.status(404).json({
        success: false,
        message: 'Fiscal year not found'
      });
    }

    await fiscalYear.closeFiscalYear(userId);

    res.json({
      success: true,
      message: `Fiscal year ${fiscalYear.year} closed successfully`,
      data: fiscalYear
    });
  } catch (error) {
    logger.error('Error closing fiscal year:', error);
    
    if (error.message.includes('All periods must be closed')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to close fiscal year',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/fiscal-years/:id/period/:date
 * @desc    Get period for a specific date
 * @access  Private
 */
router.get('/:id/period/:date', [
  auth,
  tenantMiddleware,
  sanitizeRequest,
  param('id').isMongoId().withMessage('Valid fiscal year ID is required'),
  param('date').isISO8601().toDate().withMessage('Valid date is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id, date } = req.params;
    const tenantId = req.tenantId || req.user?.tenantId;

    const fiscalYear = await FiscalYear.findOne({ _id: id, tenantId });
    if (!fiscalYear) {
      return res.status(404).json({
        success: false,
        message: 'Fiscal year not found'
      });
    }

    const period = fiscalYear.getPeriodForDate(new Date(date));

    if (!period) {
      return res.status(404).json({
        success: false,
        message: 'No period found for the given date'
      });
    }

    res.json({
      success: true,
      data: period
    });
  } catch (error) {
    logger.error('Error getting period:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get period',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
