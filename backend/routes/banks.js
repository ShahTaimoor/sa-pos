const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const Bank = require('../models/Bank');

// @route   GET /api/banks
// @desc    Get all banks
// @access  Private
router.get('/', [
  auth,
  requirePermission('view_reports'),
  query('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { isActive } = req.query;
    const filter = {};
    
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const banks = await Bank.find(filter)
      .sort({ bankName: 1, accountNumber: 1 });

    res.json({
      success: true,
      data: { banks }
    });
  } catch (error) {
    console.error('Get banks error:', error);
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
  requirePermission('view_reports')
], async (req, res) => {
  try {
    const bank = await Bank.findById(req.params.id);

    if (!bank) {
      return res.status(404).json({ 
        success: false,
        message: 'Bank not found' 
      });
    }

    res.json({
      success: true,
      data: bank
    });
  } catch (error) {
    console.error('Get bank error:', error);
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

    const bankData = {
      accountName: accountName.trim(),
      accountNumber: accountNumber.trim(),
      bankName: bankName.trim(),
      branchName: branchName ? branchName.trim() : null,
      branchAddress: branchAddress || null,
      accountType,
      routingNumber: routingNumber ? routingNumber.trim() : null,
      swiftCode: swiftCode ? swiftCode.trim() : null,
      iban: iban ? iban.trim() : null,
      openingBalance: parseFloat(openingBalance),
      currentBalance: parseFloat(openingBalance),
      isActive,
      notes: notes ? notes.trim() : null,
      createdBy: req.user._id
    };

    const bank = new Bank(bankData);
    await bank.save();

    res.status(201).json({
      success: true,
      message: 'Bank account created successfully',
      data: bank
    });
  } catch (error) {
    console.error('Create bank error:', error);
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

    const bank = await Bank.findById(req.params.id);
    if (!bank) {
      return res.status(404).json({ 
        success: false,
        message: 'Bank not found' 
      });
    }

    const {
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
    } = req.body;

    // Update fields
    if (accountName !== undefined) bank.accountName = accountName.trim();
    if (accountNumber !== undefined) bank.accountNumber = accountNumber.trim();
    if (bankName !== undefined) bank.bankName = bankName.trim();
    if (branchName !== undefined) bank.branchName = branchName ? branchName.trim() : null;
    if (branchAddress !== undefined) bank.branchAddress = branchAddress || null;
    if (accountType !== undefined) bank.accountType = accountType;
    if (routingNumber !== undefined) bank.routingNumber = routingNumber ? routingNumber.trim() : null;
    if (swiftCode !== undefined) bank.swiftCode = swiftCode ? swiftCode.trim() : null;
    if (iban !== undefined) bank.iban = iban ? iban.trim() : null;
    if (openingBalance !== undefined) {
      const newOpeningBalance = parseFloat(openingBalance);
      const balanceDifference = newOpeningBalance - bank.openingBalance;
      bank.openingBalance = newOpeningBalance;
      bank.currentBalance += balanceDifference;
    }
    if (isActive !== undefined) bank.isActive = isActive;
    if (notes !== undefined) bank.notes = notes ? notes.trim() : null;
    
    bank.updatedBy = req.user._id;

    await bank.save();

    res.json({
      success: true,
      message: 'Bank account updated successfully',
      data: bank
    });
  } catch (error) {
    console.error('Update bank error:', error);
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
  requirePermission('delete_orders')
], async (req, res) => {
  try {
    const bank = await Bank.findById(req.params.id);
    if (!bank) {
      return res.status(404).json({ 
        success: false,
        message: 'Bank not found' 
      });
    }

    // Check if bank is being used in any transactions
    const BankPayment = require('../models/BankPayment');
    const BankReceipt = require('../models/BankReceipt');
    
    const paymentCount = await BankPayment.countDocuments({ bank: bank._id });
    const receiptCount = await BankReceipt.countDocuments({ bank: bank._id });
    
    if (paymentCount > 0 || receiptCount > 0) {
      return res.status(400).json({ 
        success: false,
        message: `Cannot delete bank account. It is being used in ${paymentCount + receiptCount} transaction(s). Consider deactivating it instead.`
      });
    }

    await Bank.deleteOne({ _id: bank._id });

    res.json({
      success: true,
      message: 'Bank account deleted successfully'
    });
  } catch (error) {
    console.error('Delete bank error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

