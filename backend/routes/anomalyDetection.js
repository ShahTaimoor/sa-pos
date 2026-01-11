const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const AnomalyDetectionService = require('../services/anomalyDetectionService');
const { query, validationResult } = require('express-validator');
const logger = require('../utils/logger');

const router = express.Router();

// @route   GET /api/anomaly-detection
// @desc    Get all anomalies
// @access  Private
router.get('/', [
  auth,
  tenantMiddleware,
  requirePermission('view_anomaly_detection'),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('minSeverity').optional().isIn(['low', 'medium', 'high', 'critical']),
  query('type').optional().isString(),
  query('severity').optional().isIn(['low', 'medium', 'high', 'critical'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const options = {
      startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
      minSeverity: req.query.minSeverity || 'low'
    };

    const result = await AnomalyDetectionService.getAllAnomalies(options);

    // Apply filters
    let filteredAnomalies = result.anomalies;

    if (req.query.type) {
      filteredAnomalies = filteredAnomalies.filter(a => a.type === req.query.type);
    }

    if (req.query.severity) {
      filteredAnomalies = filteredAnomalies.filter(a => a.severity === req.query.severity);
    }

    res.json({
      success: true,
      data: {
        ...result,
        anomalies: filteredAnomalies,
        filteredCount: filteredAnomalies.length
      }
    });
  } catch (error) {
    logger.error('Anomaly detection error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error detecting anomalies',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/anomaly-detection/sales
// @desc    Get sales anomalies
// @access  Private
router.get('/sales', [
  auth,
  tenantMiddleware,
  requirePermission('view_anomaly_detection'),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('minSeverity').optional().isIn(['low', 'medium', 'high', 'critical'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const options = {
      startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
      minSeverity: req.query.minSeverity || 'low'
    };

    const anomalies = await AnomalyDetectionService.detectSalesAnomalies(options);

    res.json({
      success: true,
      data: anomalies,
      count: anomalies.length
    });
  } catch (error) {
    logger.error('Sales anomaly detection error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error detecting sales anomalies',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/anomaly-detection/inventory
// @desc    Get inventory anomalies
// @access  Private
router.get('/inventory', [
  auth,
  requirePermission('view_inventory')
], async (req, res) => {
  try {
    const anomalies = await AnomalyDetectionService.detectInventoryAnomalies();

    res.json({
      success: true,
      data: anomalies,
      count: anomalies.length
    });
  } catch (error) {
    logger.error('Inventory anomaly detection error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error detecting inventory anomalies',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/anomaly-detection/payments
// @desc    Get payment anomalies
// @access  Private
router.get('/payments', [
  auth,
  tenantMiddleware,
  requirePermission('view_anomaly_detection'),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const options = {
      startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate) : undefined
    };

    const anomalies = await AnomalyDetectionService.detectPaymentAnomalies(options);

    res.json({
      success: true,
      data: anomalies,
      count: anomalies.length
    });
  } catch (error) {
    logger.error('Payment anomaly detection error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error detecting payment anomalies',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/anomaly-detection/summary
// @desc    Get anomaly summary
// @access  Private
router.get('/summary', [
  auth,
  requirePermission('view_anomaly_detection')
], async (req, res) => {
  try {
    const result = await AnomalyDetectionService.getAllAnomalies({
      minSeverity: 'low'
    });

    res.json({
      success: true,
      data: {
        total: result.total,
        summary: result.summary,
        byType: Object.keys(result.byType).map(type => ({
          type,
          count: result.byType[type].length
        }))
      }
    });
  } catch (error) {
    logger.error('Anomaly summary error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error getting anomaly summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

