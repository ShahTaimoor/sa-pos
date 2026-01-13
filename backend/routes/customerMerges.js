const express = require('express');
const router = express.Router();
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const customerMergeService = require('../services/customerMergeService');
const { body, param, query } = require('express-validator');
const logger = require('../utils/logger');

// @route   POST /api/customer-merges
// @desc    Merge two customers
// @access  Private
router.post('/', [
  auth,
  tenantMiddleware,
  requirePermission('merge_customers'),
  body('sourceCustomerId').isMongoId().withMessage('Valid source customer ID is required'),
  body('targetCustomerId').isMongoId().withMessage('Valid target customer ID is required'),
  body('mergeAddresses').optional().isBoolean().withMessage('mergeAddresses must be boolean'),
  body('mergeNotes').optional().isBoolean().withMessage('mergeNotes must be boolean')
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const result = await customerMergeService.mergeCustomers(
      req.body.sourceCustomerId,
      req.body.targetCustomerId,
      req.user,
      {
        mergeAddresses: req.body.mergeAddresses !== false,
        mergeNotes: req.body.mergeNotes !== false,
        tenantId
      }
    );

    res.status(201).json({
      success: true,
      message: 'Customers merged successfully',
      data: result
    });
  } catch (error) {
    logger.error('Merge customers error:', { error: error });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/customer-merges/duplicates
// @desc    Find potential duplicate customers
// @access  Private
router.get('/duplicates', [
  auth,
  tenantMiddleware,
  requirePermission('view_customers'),
  query('threshold').optional().isFloat({ min: 0, max: 1 }).withMessage('threshold must be between 0 and 1'),
  query('minSimilarity').optional().isFloat({ min: 0, max: 1 }).withMessage('minSimilarity must be between 0 and 1')
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const duplicates = await customerMergeService.findPotentialDuplicates({
      threshold: parseFloat(req.query.threshold) || 0.8,
      minSimilarity: parseFloat(req.query.minSimilarity) || 0.7,
      tenantId
    });

    res.json({
      success: true,
      data: duplicates,
      count: duplicates.length
    });
  } catch (error) {
    logger.error('Find duplicates error:', { error: error });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;

