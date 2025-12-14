const express = require('express');
const { body, query } = require('express-validator');
const { auth, requireAnyPermission } = require('../middleware/auth');
const TillSession = require('../models/TillSession');

const router = express.Router();

router.post('/open', [
  auth,
  requireAnyPermission(['open_till']),
  body('openingAmount').isFloat({ min: 0 }).withMessage('openingAmount must be >= 0'),
  body('storeId').optional().isString(),
  body('deviceId').optional().isString(),
  body('notesOpen').optional().isString(),
], async (req, res) => {
  try {
    const existing = await TillSession.findOne({ user: req.user._id, status: 'open' });
    if (existing) {
      return res.status(400).json({ message: 'Till already open for this user' });
    }
    const session = await TillSession.create({
      user: req.user._id,
      storeId: req.body.storeId || null,
      deviceId: req.body.deviceId || null,
      openedAt: new Date(),
      openingAmount: Number(req.body.openingAmount),
      notesOpen: req.body.notesOpen || '',
      status: 'open'
    });
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/close', [
  auth,
  requireAnyPermission(['close_till']),
  body('closingDeclaredAmount').isFloat({ min: 0 }).withMessage('closingDeclaredAmount must be >= 0'),
  body('expectedAmount').optional().isFloat({ min: 0 }),
  body('notesClose').optional().isString(),
], async (req, res) => {
  try {
    const session = await TillSession.findOne({ user: req.user._id, status: 'open' });
    if (!session) {
      return res.status(400).json({ message: 'No open till to close' });
    }
    session.closeTill(Number(req.body.closingDeclaredAmount),
      typeof req.body.expectedAmount !== 'undefined' ? Number(req.body.expectedAmount) : undefined,
      req.body.notesClose);
    await session.save();
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/variance', [
  auth,
  requireAnyPermission(['view_till', 'close_till', 'open_till']),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20');
    const sessions = await TillSession.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json({ success: true, data: sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;


