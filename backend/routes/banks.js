const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const bankService = require('../services/bankService');
const logger = require('../utils/logger');

// @route   GET /api/banks
// @desc    Get all banks
// @access  Private
router.get('/', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports'),
  query('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.tenantId || req.user?.tenantId;
    const banks = await bankService.getBanks({
      isActive: req.query.isActive
    }, tenantId);

    res.json({
      success: true,
      data: { banks }
    });
  } catch (error) {
    logger.error('Get banks error:', { error: error });
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/banks/:id
// @desc    Get single bank
// @access  Private
router.get('/:id', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports')
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const bank = await bankService.getBankById(req.params.id, tenantId);

    res.json({
      success: true,
      data: bank
    });
  } catch (error) {
    if (error.message === 'Bank not found') {
      return res.status(404).json({ 
        success: false,
        message: 'Bank not found' 
      });
    }
    logger.error('Get bank error:', { error: error });
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/banks
// @desc    Create new bank
// @access  Private
router.post('/', [
  auth,
  tenantMiddleware,
  requirePermission('create_orders'),
  body('accountName').isString().trim().isLength({ min: 1, max: 200 }).withMessage('Account name is required'),
  body('accountNumber').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Account number is required'),
  body('bankName').isString().trim().isLength({ min: 1, max: 200 }).withMessage('Bank name is required'),
  body('branchName').optional().isString().trim().isLength({ max: 200 }),
  body('accountType').optional().isIn(['checking', 'savings', 'current', 'other']),
  body('routingNumber').optional().isString().trim().isLength({ max: 50 }),
  body('swiftCode').optional().isString().trim().isLength({ max: 50 }),
  body('iban').optional().isString().trim().isLength({ max: 50 }),
  body('openingBalance').optional().isFloat(),
  body('isActive').optional().isBoolean(),
  body('notes').optional().isString().trim().isLength({ max: 1000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      accountName,
      accountNumber,
      bankName,
      branchName,
      branchAddress,
      accountType = 'checking',
      routingNumber,
      swiftCode,
      iban,
      openingBalance = 0,
      isActive = true,
      notes
    } = req.body;

    const tenantId = req.tenantId || req.user?.tenantId;
    const bank = await bankService.createBank({
      accountName,
      accountNumber,
      bankName,
      branchName,
      branchAddress,
      accountType,
      routingNumber,
      swiftCode,
      iban,
      openingBalance,
      isActive,
      notes
    }, req.user._id, { tenantId });

    res.status(201).json({
      success: true,
      message: 'Bank account created successfully',
      data: bank
    });
  } catch (error) {
    logger.error('Create bank error:', { error: error });
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/banks/:id
// @desc    Update bank
// @access  Private
router.put('/:id', [
  auth,
  tenantMiddleware,
  requirePermission('edit_orders'),
  body('accountName').optional().isString().trim().isLength({ min: 1, max: 200 }),
  body('accountNumber').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('bankName').optional().isString().trim().isLength({ min: 1, max: 200 }),
  body('branchName').optional().isString().trim().isLength({ max: 200 }),
  body('accountType').optional().isIn(['checking', 'savings', 'current', 'other']),
  body('routingNumber').optional().isString().trim().isLength({ max: 50 }),
  body('swiftCode').optional().isString().trim().isLength({ max: 50 }),
  body('iban').optional().isString().trim().isLength({ max: 50 }),
  body('openingBalance').optional().isFloat(),
  body('isActive').optional().isBoolean(),
  body('notes').optional().isString().trim().isLength({ max: 1000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.tenantId || req.user?.tenantId;
    const bank = await bankService.updateBank(req.params.id, req.body, req.user._id, { tenantId });

    res.json({
      success: true,
      message: 'Bank account updated successfully',
      data: bank
    });
  } catch (error) {
    if (error.message === 'Bank not found') {
      return res.status(404).json({ 
        success: false,
        message: 'Bank not found' 
      });
    }
    logger.error('Update bank error:', { error: error });
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   DELETE /api/banks/:id
// @desc    Delete bank
// @access  Private
router.delete('/:id', [
  auth,
  tenantMiddleware,
  requirePermission('delete_orders')
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const result = await bankService.deleteBank(req.params.id, { tenantId });

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    if (error.message === 'Bank not found') {
      return res.status(404).json({ 
        success: false,
        message: 'Bank not found' 
      });
    }
    logger.error('Delete bank error:', { error: error });
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

