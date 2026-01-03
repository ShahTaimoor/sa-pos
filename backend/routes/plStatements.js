const express = require('express');
const { body, param, query } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { handleValidationErrors, sanitizeRequest } = require('../middleware/validation');
const plCalculationService = require('../services/plCalculationService');
const plExportService = require('../services/plExportService');
const plStatementService = require('../services/plStatementService');
const path = require('path');

const router = express.Router();

// @route   POST /api/pl-statements/generate
// @desc    Generate P&L statement for a period
// @access  Private (requires 'view_reports' permission)
router.post('/generate', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  body('startDate').isISO8601().toDate().withMessage('Valid start date is required'),
  body('endDate').isISO8601().toDate().withMessage('Valid end date is required'),
  body('periodType').optional().isIn(['monthly', 'quarterly', 'yearly', 'custom']),
  body('companyInfo').optional().isObject(),
  body('includeDetails').optional().isBoolean(),
  body('calculateComparisons').optional().isBoolean(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      periodType = 'custom',
      companyInfo = {},
      includeDetails = true,
      calculateComparisons = true,
    } = req.body;

    // Validate date range
    if (startDate >= endDate) {
      return res.status(400).json({ message: 'Start date must be before end date' });
    }

    const period = {
      startDate,
      endDate,
      type: periodType,
    };

    // Check if statement already exists for this period
    const existingStatement = await plStatementService.findExistingStatement(startDate, endDate);

    if (existingStatement && existingStatement.status === 'published') {
      return res.status(400).json({ 
        message: 'P&L statement already exists for this period',
        statementId: existingStatement.statementId 
      });
    }

    // Generate new statement
    const statement = await plStatementService.generateStatement(period, {
      companyInfo,
      includeDetails,
      calculateComparisons,
      userId: req.user._id,
    });

    res.status(201).json({
      message: 'P&L statement generated successfully',
      statement: {
        statementId: statement.statementId,
        period: statement.period,
        totalRevenue: statement.revenue.totalRevenue.amount,
        grossProfit: statement.grossProfit.amount,
        operatingIncome: statement.operatingIncome.amount,
        netIncome: statement.netIncome.amount,
        status: statement.status,
        createdAt: statement.createdAt,
      },
    });
  } catch (error) {
    console.error('Error generating P&L statement:', error);
    res.status(500).json({ message: 'Server error generating P&L statement', error: error.message });
  }
});

// @route   GET /api/pl-statements
// @desc    Get list of P&L statements with filters
// @access  Private (requires 'view_reports' permission)
router.get('/', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  query('page').optional({ checkFalsy: true }).isInt({ min: 1 }),
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }),
  query('startDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  query('endDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  query('periodType').optional({ checkFalsy: true }).isIn(['monthly', 'quarterly', 'yearly', 'custom']),
  query('status').optional({ checkFalsy: true }).isIn(['draft', 'review', 'approved', 'published']),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      startDate, 
      endDate, 
      periodType, 
      status 
    } = req.query;
    const skip = (page - 1) * limit;

    const result = await plStatementService.getStatements({
      page,
      limit,
      startDate,
      endDate,
      periodType,
      status
    });

    res.json({
      statements: result.statements,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error fetching P&L statements:', error);
    res.status(500).json({ message: 'Server error fetching P&L statements', error: error.message });
  }
});

// @route   GET /api/pl-statements/:statementId
// @desc    Get detailed P&L statement
// @access  Private (requires 'view_reports' permission)
router.get('/:statementId', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  param('statementId').isMongoId().withMessage('Valid Statement ID is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { statementId } = req.params;
    
    const statement = await plStatementService.getStatementById(statementId);

    res.json(statement);
  } catch (error) {
    if (error.message === 'P&L statement not found') {
      return res.status(404).json({ message: 'P&L statement not found' });
    }
    console.error('Error fetching P&L statement:', error);
    res.status(500).json({ message: 'Server error fetching P&L statement', error: error.message });
  }
});

// @route   PUT /api/pl-statements/:statementId
// @desc    Update editable fields on a P&L statement (metadata/company/notes)
// @access  Private (requires 'view_reports' permission)
router.put('/:statementId', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  param('statementId').isMongoId().withMessage('Valid Statement ID is required'),
  // Optional fields
  body('company').optional().isObject(),
  body('metadata').optional().isObject(),
  body('notes').optional().isArray(),
  body('title').optional().isString().isLength({ max: 200 }),
  body('description').optional().isString().isLength({ max: 1000 }),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { statementId } = req.params;
    const updates = req.body || {};

    const statement = await plStatementService.updateStatement(statementId, updates);

    res.json({
      message: 'P&L statement updated successfully',
      statement
    });
  } catch (error) {
    if (error.message === 'P&L statement not found') {
      return res.status(404).json({ message: 'P&L statement not found' });
    }
    console.error('Error updating P&L statement:', error);
    res.status(500).json({ message: 'Server error updating P&L statement', error: error.message });
  }
});

// @route   PUT /api/pl-statements/:statementId/status
// @desc    Update P&L statement status
// @access  Private (requires 'view_reports' permission)
router.put('/:statementId/status', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  param('statementId').isMongoId().withMessage('Valid Statement ID is required'),
  body('status').isIn(['draft', 'review', 'approved', 'published']).withMessage('Valid status is required'),
  body('notes').optional().trim(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { statementId } = req.params;
    const { status, notes } = req.body;
    
    const statement = await plStatementService.updateStatementStatus(statementId, status, req.user._id, notes);

    res.json({
      message: 'P&L statement status updated successfully',
      statement
    });
  } catch (error) {
    if (error.message === 'P&L statement not found') {
      return res.status(404).json({ message: 'P&L statement not found' });
    }
    console.error('Error updating P&L statement status:', error);
    res.status(500).json({ message: 'Server error updating P&L statement status', error: error.message });
  }
});

// @route   DELETE /api/pl-statements/:statementId
// @desc    Delete P&L statement
// @access  Private (requires 'view_reports' permission)
router.delete('/:statementId', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  param('statementId').isMongoId().withMessage('Valid Statement ID is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { statementId } = req.params;
    
    const result = await plStatementService.deleteStatement(statementId);

    res.json({ message: result.message });
  } catch (error) {
    if (error.message === 'P&L statement not found') {
      return res.status(404).json({ message: 'P&L statement not found' });
    }
    if (error.message === 'Only draft statements can be deleted') {
      return res.status(400).json({ message: error.message });
    }
    console.error('Error deleting P&L statement:', error);
    res.status(500).json({ message: 'Server error deleting P&L statement', error: error.message });
  }
});

// @route   GET /api/pl-statements/summary
// @desc    Get P&L summary for a period
// @access  Private (requires 'view_reports' permission)
router.get('/summary', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  query('startDate').isISO8601().toDate().withMessage('Valid start date is required'),
  query('endDate').isISO8601().toDate().withMessage('Valid end date is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const period = { startDate, endDate };
    const summary = await plCalculationService.getPLSummary(period);

    res.json(summary);
  } catch (error) {
    console.error('Error fetching P&L summary:', error);
    res.status(500).json({ message: 'Server error fetching P&L summary', error: error.message });
  }
});

// @route   GET /api/pl-statements/trends
// @desc    Get P&L trends over multiple periods
// @access  Private (requires 'view_reports' permission)
router.get('/trends', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  query('periods').isInt({ min: 1, max: 24 }).withMessage('Valid number of periods is required'),
  query('periodType').optional().isIn(['monthly', 'quarterly', 'yearly']),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { periods = 12, periodType = 'monthly' } = req.query;
    
    // Generate periods array
    const periodsArray = [];
    const now = new Date();
    
    for (let i = 0; i < parseInt(periods); i++) {
      const periodStart = new Date(now);
      const periodEnd = new Date(now);
      
      if (periodType === 'monthly') {
        periodStart.setMonth(now.getMonth() - i - 1);
        periodEnd.setMonth(now.getMonth() - i);
        periodEnd.setDate(0); // Last day of previous month
      } else if (periodType === 'quarterly') {
        periodStart.setMonth(now.getMonth() - (i + 1) * 3);
        periodEnd.setMonth(now.getMonth() - i * 3);
        periodEnd.setDate(0);
      } else if (periodType === 'yearly') {
        periodStart.setFullYear(now.getFullYear() - i - 1);
        periodEnd.setFullYear(now.getFullYear() - i);
        periodEnd.setMonth(11, 31);
      }
      
      periodsArray.push({
        startDate: periodStart,
        endDate: periodEnd,
      });
    }
    
    const trends = await plCalculationService.getPLTrends(periodsArray);

    res.json({
      trends,
      periodType,
      totalPeriods: trends.length,
    });
  } catch (error) {
    console.error('Error fetching P&L trends:', error);
    res.status(500).json({ message: 'Server error fetching P&L trends', error: error.message });
  }
});

// @route   GET /api/pl-statements/:statementId/comparison
// @desc    Get P&L statement comparison
// @access  Private (requires 'view_reports' permission)
router.get('/:statementId/comparison', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  param('statementId').isMongoId().withMessage('Valid Statement ID is required'),
  query('type').optional().isIn(['previous', 'budget']),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { statementId } = req.params;
    const { type = 'previous' } = req.query;
    
    const comparison = await plStatementService.getStatementComparison(statementId, type);

    res.json(comparison);
  } catch (error) {
    console.error('Error fetching P&L comparison:', error);
    res.status(500).json({ message: 'Server error fetching P&L comparison', error: error.message });
  }
});

// @route   POST /api/pl-statements/:statementId/export
// @desc    Export P&L statement
// @access  Private (requires 'view_reports' permission)
router.post('/:statementId/export', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  param('statementId').isMongoId().withMessage('Valid Statement ID is required'),
  body('format').optional().isIn(['pdf', 'excel', 'csv']),
  body('includeDetails').optional().isBoolean(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { statementId } = req.params;
    const { format = 'pdf', includeDetails = true } = req.body;
    
    const statement = await plStatementService.getStatementById(statementId);
    if (!statement) {
      return res.status(404).json({ message: 'P&L statement not found' });
    }

    let exportResult;
    
    switch (format.toLowerCase()) {
      case 'excel':
        exportResult = await plExportService.exportToExcel(statementId, { includeDetails });
        break;
      case 'csv':
        exportResult = await plExportService.exportToCSV(statementId, { includeDetails });
        break;
      case 'pdf':
      default:
        exportResult = await plExportService.exportToPDF(statementId, { includeDetails });
        break;
    }

    res.json({
      message: 'P&L statement exported successfully',
      export: {
        filename: exportResult.filename,
        format: exportResult.format,
        size: exportResult.size,
        downloadUrl: `/api/pl-statements/${statementId}/download?format=${format}`,
      },
    });
  } catch (error) {
    if (error.message === 'P&L statement not found') {
      return res.status(404).json({ message: 'P&L statement not found' });
    }
    console.error('Error exporting P&L statement:', error);
    res.status(500).json({ message: 'Server error exporting P&L statement', error: error.message });
  }
});

// @route   GET /api/pl-statements/latest
// @desc    Get latest P&L statement
// @access  Private (requires 'view_reports' permission)
router.get('/latest', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  query('periodType').optional().isIn(['monthly', 'quarterly', 'yearly', 'custom']),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { periodType = 'monthly' } = req.query;
    
    const statement = await plStatementService.getLatestStatement(periodType);

    if (!statement) {
      return res.status(404).json({ message: 'No P&L statements found' });
    }

    res.json(statement);
  } catch (error) {
    console.error('Error fetching latest P&L statement:', error);
    res.status(500).json({ message: 'Server error fetching latest P&L statement', error: error.message });
  }
});

// @route   GET /api/pl-statements/:statementId/download
// @desc    Download exported P&L statement file
// @access  Private (requires 'view_reports' permission)
router.get('/:statementId/download', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  param('statementId').isMongoId().withMessage('Valid Statement ID is required'),
  query('format').optional().isIn(['pdf', 'excel', 'csv']),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { statementId } = req.params;
    const { format = 'pdf' } = req.query;
    
    const statement = await plStatementService.getStatementById(statementId);
    if (!statement) {
      return res.status(404).json({ message: 'P&L statement not found' });
    }

    // Generate filename based on statement period
    const startDate = new Date(statement.period.startDate).toLocaleDateString('en-US').replace(/\//g, '-');
    const endDate = new Date(statement.period.endDate).toLocaleDateString('en-US').replace(/\//g, '-');
    const filename = `PL_Statement_${startDate}_to_${endDate}.${format}`;
    
    // Construct file path
    const filepath = path.join(__dirname, '../exports', filename);
    
    // Check if file exists
    const fs = require('fs');
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: 'Export file not found. Please generate the export first.' });
    }

    // Set appropriate headers
    const mimeTypes = {
      pdf: 'application/pdf',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv',
    };

    res.setHeader('Content-Type', mimeTypes[format] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(filepath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      res.status(500).json({ message: 'Error downloading file' });
    });

  } catch (error) {
    if (error.message === 'P&L statement not found') {
      return res.status(404).json({ message: 'P&L statement not found' });
    }
    console.error('Error downloading P&L statement:', error);
    res.status(500).json({ message: 'Server error downloading P&L statement', error: error.message });
  }
});

module.exports = router;
