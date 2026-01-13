const express = require('express');
const { body, query } = require('express-validator');
const { auth, requireAnyPermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const tillService = require('../services/tillService');

const router = express.Router();

router.post('/open', [
  auth,
  tenantMiddleware, // CRITICAL: Enforce tenant isolation
  requireAnyPermission(['open_till']),
  body('openingAmount').isFloat({ min: 0 }).withMessage('openingAmount must be >= 0'),
  body('storeId').optional().isString(),
  body('deviceId').optional().isString(),
  body('notesOpen').optional().isString(),
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const session = await tillService.openTill({
      openingAmount: req.body.openingAmount,
      storeId: req.body.storeId,
      deviceId: req.body.deviceId,
      notesOpen: req.body.notesOpen
    }, req.user._id, tenantId);
    
    res.json({ success: true, data: session });
  } catch (err) {
    if (err.message === 'Till already open for this user') {
      return res.status(400).json({ message: err.message });
    }
    if (err.message === 'Duplicate entry detected') {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/close', [
  auth,
  tenantMiddleware,
  requireAnyPermission(['close_till']),
  body('closingDeclaredAmount').isFloat({ min: 0 }).withMessage('closingDeclaredAmount must be >= 0'),
  body('expectedAmount').optional().isFloat({ min: 0 }),
  body('notesClose').optional().isString(),
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const session = await tillService.closeTill({
      closingDeclaredAmount: req.body.closingDeclaredAmount,
      expectedAmount: req.body.expectedAmount,
      notesClose: req.body.notesClose
    }, req.user._id, tenantId);
    
    res.json({ success: true, data: session });
  } catch (err) {
    if (err.message === 'No open till to close') {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/variance', [
  auth,
  tenantMiddleware, // CRITICAL: Enforce tenant isolation
  requireAnyPermission(['view_till', 'close_till', 'open_till']),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const limit = parseInt(req.query.limit || '20');
    const sessions = await tillService.getSessionsByUser(req.user._id, tenantId, { limit });
    res.json({ success: true, data: sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;


