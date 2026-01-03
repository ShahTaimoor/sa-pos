const express = require('express');
const { body, param, query } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { handleValidationErrors, sanitizeRequest } = require('../middleware/validation');
const balanceSheetService = require('../services/balanceSheetService');

const router = express.Router();

// @route   POST /api/balance-sheets/generate
// @desc    Generate a new balance sheet
// @access  Private (requires 'view_reports' permission)
router.post('/generate', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  body('statementDate').isISO8601().toDate().withMessage('Valid statement date is required'),
  body('periodType').optional().isIn(['monthly', 'quarterly', 'yearly']).withMessage('Valid period type is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { statementDate, periodType = 'monthly' } = req.body;

    const balanceSheet = await balanceSheetService.generateBalanceSheet(
      statementDate,
      periodType,
      req.user._id
    );

    res.status(201).json({
      message: 'Balance sheet generated successfully',
      balanceSheet
    });
  } catch (error) {
    console.error('Error generating balance sheet:', error);
    res.status(400).json({ message: error.message });
  }
});

// @route   GET /api/balance-sheets
// @desc    Get list of balance sheets with filters
// @access  Private (requires 'view_reports' permission)
router.get('/', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional({ checkFalsy: true }).isIn(['draft', 'review', 'approved', 'final']),
  query('periodType').optional({ checkFalsy: true }).isIn(['monthly', 'quarterly', 'yearly']),
  query('startDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  query('endDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  query('search').optional({ checkFalsy: true }).trim(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      periodType,
      startDate,
      endDate,
      search
    } = req.query;

    const result = await balanceSheetService.getBalanceSheets({
      page,
      limit,
      status,
      periodType,
      startDate,
      endDate,
      search
    });

    res.json({
      balanceSheets: result.balanceSheets,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error fetching balance sheets:', error);
    res.status(500).json({ message: 'Server error fetching balance sheets', error: error.message });
  }
});

// @route   GET /api/balance-sheets/:balanceSheetId
// @desc    Get detailed balance sheet information
// @access  Private (requires 'view_reports' permission)
router.get('/:balanceSheetId', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  param('balanceSheetId').isMongoId().withMessage('Valid Balance Sheet ID is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { balanceSheetId } = req.params;
    
    const balanceSheet = await balanceSheetService.getBalanceSheetById(balanceSheetId);

    res.json(balanceSheet);
  } catch (error) {
    if (error.message === 'Balance sheet not found') {
      return res.status(404).json({ message: 'Balance sheet not found' });
    }
    console.error('Error fetching balance sheet:', error);
    res.status(500).json({ message: 'Server error fetching balance sheet', error: error.message });
  }
});

// @route   PUT /api/balance-sheets/:balanceSheetId/status
// @desc    Update balance sheet status
// @access  Private (requires 'view_reports' permission)
router.put('/:balanceSheetId/status', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  param('balanceSheetId').isMongoId().withMessage('Valid Balance Sheet ID is required'),
  body('status').isIn(['draft', 'review', 'approved', 'final']).withMessage('Valid status is required'),
  body('notes').optional().trim(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { balanceSheetId } = req.params;
    const { status, notes } = req.body;
    
    const balanceSheet = await balanceSheetService.updateStatus(balanceSheetId, status, req.user._id, notes);

    res.json({
      message: 'Balance sheet status updated successfully',
      balanceSheet: {
        statementNumber: balanceSheet.statementNumber,
        status: balanceSheet.status,
        approvedBy: balanceSheet.approvedBy,
        approvedAt: balanceSheet.approvedAt
      }
    });
  } catch (error) {
    if (error.message === 'Balance sheet not found') {
      return res.status(404).json({ message: 'Balance sheet not found' });
    }
    console.error('Error updating balance sheet status:', error);
    res.status(500).json({ message: 'Server error updating balance sheet status', error: error.message });
  }
});

// @route   PUT /api/balance-sheets/:balanceSheetId
// @desc    Update balance sheet data
// @access  Private (requires 'view_reports' permission)
router.put('/:balanceSheetId', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  param('balanceSheetId').isMongoId().withMessage('Valid Balance Sheet ID is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { balanceSheetId } = req.params;
    
    const balanceSheet = await balanceSheetService.updateBalanceSheet(balanceSheetId, req.body, req.user._id);

    res.json({
      message: 'Balance sheet updated successfully',
      balanceSheet
    });
  } catch (error) {
    if (error.message === 'Balance sheet not found') {
      return res.status(404).json({ message: 'Balance sheet not found' });
    }
    if (error.message === 'Only draft balance sheets can be updated') {
      return res.status(400).json({ message: error.message });
    }
    console.error('Error updating balance sheet:', error);
    res.status(500).json({ message: 'Server error updating balance sheet', error: error.message });
  }
});

// @route   DELETE /api/balance-sheets/:balanceSheetId
// @desc    Delete balance sheet
// @access  Private (requires 'view_reports' permission)
router.delete('/:balanceSheetId', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  param('balanceSheetId').isMongoId().withMessage('Valid Balance Sheet ID is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { balanceSheetId } = req.params;
    
    const result = await balanceSheetService.deleteBalanceSheet(balanceSheetId);

    res.json({ message: result.message });
  } catch (error) {
    if (error.message === 'Balance sheet not found') {
      return res.status(404).json({ message: 'Balance sheet not found' });
    }
    if (error.message === 'Only draft balance sheets can be deleted') {
      return res.status(400).json({ message: error.message });
    }
    console.error('Error deleting balance sheet:', error);
    res.status(500).json({ message: 'Server error deleting balance sheet', error: error.message });
  }
});

// @route   GET /api/balance-sheets/:balanceSheetId/comparison
// @desc    Get balance sheet comparison data
// @access  Private (requires 'view_reports' permission)
router.get('/:balanceSheetId/comparison', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  param('balanceSheetId').isMongoId().withMessage('Valid Balance Sheet ID is required'),
  query('type').optional().isIn(['previous', 'year_ago']).withMessage('Valid comparison type is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { balanceSheetId } = req.params;
    const { type = 'previous' } = req.query;

    const comparisonData = await balanceSheetCalculationService.getComparisonData(
      balanceSheetId,
      type
    );

    if (!comparisonData) {
      return res.status(404).json({ 
        message: 'No comparison data available for this balance sheet' 
      });
    }

    res.json(comparisonData);
  } catch (error) {
    console.error('Error fetching comparison data:', error);
    res.status(500).json({ message: 'Server error fetching comparison data', error: error.message });
  }
});

// @route   GET /api/balance-sheets/stats
// @desc    Get balance sheet statistics
// @access  Private (requires 'view_reports' permission)
router.get('/stats', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  query('startDate').optional().isISO8601().toDate(),
  query('endDate').optional().isISO8601().toDate(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const period = startDate && endDate ? { startDate, endDate } : {};
    const stats = await balanceSheetCalculationService.getStats(period);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching balance sheet stats:', error);
    res.status(500).json({ message: 'Server error fetching balance sheet stats', error: error.message });
  }
});

// @route   GET /api/balance-sheets/latest
// @desc    Get latest balance sheet
// @access  Private (requires 'view_reports' permission)
router.get('/latest', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  query('periodType').optional().isIn(['monthly', 'quarterly', 'yearly']).withMessage('Valid period type is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { periodType = 'monthly' } = req.query;
    
    const balanceSheet = await balanceSheetService.getLatestByPeriodType(periodType);

    if (!balanceSheet) {
      return res.status(404).json({ message: 'No balance sheet found' });
    }

    res.json(balanceSheet);
  } catch (error) {
    console.error('Error fetching latest balance sheet:', error);
    res.status(500).json({ message: 'Server error fetching latest balance sheet', error: error.message });
  }
});

// @route   POST /api/balance-sheets/:balanceSheetId/audit
// @desc    Add audit trail entry
// @access  Private (requires 'view_reports' permission)
router.post('/:balanceSheetId/audit', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  param('balanceSheetId').isMongoId().withMessage('Valid Balance Sheet ID is required'),
  body('action').isIn(['created', 'updated', 'approved', 'rejected', 'exported', 'viewed']).withMessage('Valid action is required'),
  body('details').optional().trim(),
  body('changes').optional(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { balanceSheetId } = req.params;
    const { action, details, changes } = req.body;
    
    const balanceSheet = await balanceSheetService.getBalanceSheetById(balanceSheetId);
    
    // Use the model's addAuditEntry method (it saves internally)
    await balanceSheet.addAuditEntry(action, req.user._id, details, changes);

    res.json({
      message: 'Audit entry added successfully',
      balanceSheet
    });
  } catch (error) {
    console.error('Error adding audit entry:', error);
    res.status(500).json({ message: 'Server error adding audit entry', error: error.message });
  }
});

module.exports = router;
