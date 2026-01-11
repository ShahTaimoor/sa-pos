/**
 * Example Route Implementation for Soft Delete
 * 
 * Shows how to integrate soft delete into existing routes
 */

const express = require('express');
const router = express.Router();
const softDeleteService = require('../services/softDeleteService');
const {
  softDeleteMiddleware,
  excludeDeletedMiddleware,
  restoreMiddleware
} = require('../middleware/softDeleteMiddleware');
const auth = require('../middleware/auth');
const Product = require('../models/Product');

/**
 * GET /api/products
 * List products (excludes deleted by default)
 */
router.get('/',
  excludeDeletedMiddleware,
  async (req, res) => {
    try {
      const products = await Product.find(req.query);
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/products/deleted
 * List deleted products only
 */
router.get('/deleted',
  async (req, res) => {
    try {
      const products = await Product.find({ isDeleted: true });
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * DELETE /api/products/:id
 * Soft delete a product
 */
router.delete('/:id',
  auth,
  softDeleteMiddleware('Product'),
  async (req, res) => {
    try {
      const result = await softDeleteService.softDelete('Product', req.params.id, {
        userId: req.user._id,
        reason: req.body.reason || 'Product deleted',
        metadata: {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          sessionId: req.sessionID
        }
      });
      
      res.json({
        success: true,
        message: 'Product deleted successfully',
        ...result
      });
    } catch (error) {
      res.status(500).json({
        error: 'DELETION_FAILED',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/products/:id/restore
 * Restore a soft-deleted product
 */
router.post('/:id/restore',
  auth,
  restoreMiddleware('Product'),
  async (req, res) => {
    try {
      const result = await softDeleteService.restore('Product', req.params.id, {
        userId: req.user._id,
        reason: req.body.reason || 'Product restored'
      });
      
      res.json({
        success: true,
        message: 'Product restored successfully',
        ...result
      });
    } catch (error) {
      res.status(500).json({
        error: 'RESTORE_FAILED',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/products/:id/deletion-history
 * Get deletion history for a product
 */
router.get('/:id/deletion-history',
  auth,
  async (req, res) => {
    try {
      const auditLogService = require('../services/auditLogService');
      const history = await auditLogService.getDeletionHistory('Product', req.params.id);
      
      res.json(history);
    } catch (error) {
      res.status(500).json({
        error: 'HISTORY_FETCH_FAILED',
        message: error.message
      });
    }
  }
);

module.exports = router;

