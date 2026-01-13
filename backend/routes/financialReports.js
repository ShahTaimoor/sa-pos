/**
 * Financial Reports Routes
 * 
 * Routes for generating Profit & Loss and Balance Sheet reports
 * from journal entries (single source of truth)
 */

const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { tenantMiddleware, validateDateRange } = require('../middleware/tenantMiddleware');
const financialReportingService = require('../services/financialReportingService');
const { requirePermission } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * @route   GET /api/financial-reports/profit-loss
 * @desc    Get Profit & Loss statement
 * @access  Private (requires view_reports permission)
 */
router.get(
  '/profit-loss',
  auth,
  tenantMiddleware,
  validateDateRange,
  requirePermission('view_reports'),
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const tenantId = req.tenantId || req.user?.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          message: 'Tenant ID is required'
        });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({
          message: 'startDate and endDate query parameters are required'
        });
      }

      const pl = await financialReportingService.generateProfitAndLoss({
        tenantId,
        startDate,
        endDate
      });

      res.json(pl);
    } catch (error) {
      logger.error('Error generating Profit & Loss:', error);
      res.status(500).json({
        message: 'Error generating Profit & Loss statement',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/financial-reports/balance-sheet
 * @desc    Get Balance Sheet
 * @access  Private (requires view_reports permission)
 */
router.get(
  '/balance-sheet',
  auth,
  tenantMiddleware,
  requirePermission('view_reports'),
  async (req, res) => {
    try {
      const { asOfDate } = req.query;
      const tenantId = req.tenantId || req.user?.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          message: 'Tenant ID is required'
        });
      }

      const balanceSheet = await financialReportingService.generateBalanceSheet({
        tenantId,
        asOfDate: asOfDate || new Date()
      });

      res.json(balanceSheet);
    } catch (error) {
      logger.error('Error generating Balance Sheet:', error);
      res.status(500).json({
        message: 'Error generating Balance Sheet',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/financial-reports/summary
 * @desc    Get financial summary for dashboard
 * @access  Private (requires view_reports permission)
 */
router.get(
  '/summary',
  auth,
  tenantMiddleware,
  validateDateRange,
  requirePermission('view_reports'),
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const tenantId = req.tenantId || req.user?.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          message: 'Tenant ID is required'
        });
      }

      const summary = await financialReportingService.getAccountSummary({
        tenantId,
        startDate,
        endDate
      });

      res.json(summary);
    } catch (error) {
      logger.error('Error generating financial summary:', error);
      res.status(500).json({
        message: 'Error generating financial summary',
        error: error.message
      });
    }
  }
);

module.exports = router;

