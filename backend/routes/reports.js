const express = require('express');
const { query, validationResult } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const reportsService = require('../services/reportsService');
const logger = require('../utils/logger');

const router = express.Router();

// @route   GET /api/reports/sales
// @desc    Get sales report
// @access  Private
router.get('/sales', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports'),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('groupBy').optional().isIn(['day', 'week', 'month', 'year']),
  query('orderType').optional().isIn(['retail', 'wholesale', 'return', 'exchange'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const report = await reportsService.getSalesReport(req.query);
    
    res.json(report);
  } catch (error) {
    logger.error('Sales report error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/products
// @desc    Get product performance report
// @access  Private
router.get('/products', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports'),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const report = await reportsService.getProductReport(req.query);
    
    res.json(report);
  } catch (error) {
    logger.error('Product report error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/customers
// @desc    Get customer performance report
// @access  Private
router.get('/customers', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports'),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('businessType').optional().isIn(['retail', 'wholesale', 'distributor', 'individual'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const report = await reportsService.getCustomerReport(req.query);
    
    res.json(report);
  } catch (error) {
    logger.error('Customer report error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/inventory
// @desc    Get inventory report
// @access  Private
router.get('/inventory', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports'),
  query('lowStock').optional().isBoolean(),
  query('category').optional().isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const report = await reportsService.getInventoryReport(req.query);
    
    res.json(report);
  } catch (error) {
    logger.error('Inventory report error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
