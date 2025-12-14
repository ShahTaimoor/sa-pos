const express = require('express');
const router = express.Router();
const ChartOfAccounts = require('../models/ChartOfAccounts');
const AccountingService = require('../services/accountingService');
const { auth } = require('../middleware/auth');
const ledgerAccountService = require('../services/ledgerAccountService');

// @route   GET /api/chart-of-accounts
// @desc    Get all accounts with optional filters
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { accountType, accountCategory, isActive, search, allowDirectPosting, includePartyAccounts } = req.query;

    if (includePartyAccounts === 'true') {
      await ledgerAccountService.ensureCustomerLedgerAccounts({ userId: req.user?._id });
      await ledgerAccountService.ensureSupplierLedgerAccounts({ userId: req.user?._id });
    }
    
    const query = {};
    if (accountType) query.accountType = accountType;
    if (accountCategory) query.accountCategory = accountCategory;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (allowDirectPosting !== undefined) query.allowDirectPosting = allowDirectPosting === 'true';
    if (search) {
      query.$or = [
        { accountCode: { $regex: search, $options: 'i' } },
        { accountName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const accounts = await ChartOfAccounts.find(query)
      .populate('parentAccount', 'accountCode accountName')
      .sort({ accountCode: 1 });
    
    res.json({
      success: true,
      data: accounts,
      count: accounts.length
    });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch accounts',
      error: error.message
    });
  }
});

// @route   GET /api/chart-of-accounts/hierarchy
// @desc    Get account hierarchy tree
// @access  Private
router.get('/hierarchy', auth, async (req, res) => {
  try {
    const hierarchy = await ChartOfAccounts.getAccountHierarchy();
    
    res.json({
      success: true,
      data: hierarchy
    });
  } catch (error) {
    console.error('Get account hierarchy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch account hierarchy',
      error: error.message
    });
  }
});

// @route   GET /api/chart-of-accounts/:id
// @desc    Get account by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const account = await ChartOfAccounts.findById(req.params.id)
      .populate('parentAccount', 'accountCode accountName');
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }
    
    res.json({
      success: true,
      data: account
    });
  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch account',
      error: error.message
    });
  }
});

// @route   POST /api/chart-of-accounts
// @desc    Create new account
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const {
      accountCode,
      accountName,
      accountType,
      accountCategory,
      parentAccount,
      level,
      normalBalance,
      openingBalance,
      description,
      allowDirectPosting,
      isTaxable,
      taxRate,
      requiresReconciliation
    } = req.body;

    // Validation
    if (!accountCode || !accountName || !accountType || !accountCategory || !normalBalance) {
      return res.status(400).json({
        success: false,
        message: 'Account code, name, type, category, and normal balance are required'
      });
    }

    // Check if account code already exists
    const existingAccount = await ChartOfAccounts.findOne({ accountCode });
    if (existingAccount) {
      return res.status(400).json({
        success: false,
        message: 'Account code already exists'
      });
    }

    const account = new ChartOfAccounts({
      accountCode,
      accountName,
      accountType,
      accountCategory,
      parentAccount: parentAccount || null,
      level: level || 0,
      normalBalance,
      openingBalance: openingBalance || 0,
      currentBalance: openingBalance || 0,
      description,
      allowDirectPosting: allowDirectPosting !== undefined ? allowDirectPosting : true,
      isTaxable: isTaxable || false,
      taxRate: taxRate || 0,
      requiresReconciliation: requiresReconciliation || false,
      createdBy: req.user.id
    });

    await account.save();

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: account
    });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create account',
      error: error.message
    });
  }
});

// @route   PUT /api/chart-of-accounts/:id
// @desc    Update account
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const account = await ChartOfAccounts.findById(req.params.id);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Prevent updating system accounts
    if (account.isSystemAccount) {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify system accounts'
      });
    }

    const {
      accountName,
      accountCategory,
      parentAccount,
      description,
      allowDirectPosting,
      isTaxable,
      taxRate,
      requiresReconciliation,
      isActive
    } = req.body;

    if (accountName) account.accountName = accountName;
    if (accountCategory) account.accountCategory = accountCategory;
    if (parentAccount !== undefined) account.parentAccount = parentAccount;
    if (description !== undefined) account.description = description;
    if (allowDirectPosting !== undefined) account.allowDirectPosting = allowDirectPosting;
    if (isTaxable !== undefined) account.isTaxable = isTaxable;
    if (taxRate !== undefined) account.taxRate = taxRate;
    if (requiresReconciliation !== undefined) account.requiresReconciliation = requiresReconciliation;
    if (isActive !== undefined) account.isActive = isActive;
    account.updatedBy = req.user.id;

    await account.save();

    res.json({
      success: true,
      message: 'Account updated successfully',
      data: account
    });
  } catch (error) {
    console.error('Update account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update account',
      error: error.message
    });
  }
});

// @route   DELETE /api/chart-of-accounts/:id
// @desc    Delete account
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const account = await ChartOfAccounts.findById(req.params.id);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Prevent deleting system accounts
    if (account.isSystemAccount) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete system accounts'
      });
    }

    // Check if account has children
    const childAccounts = await ChartOfAccounts.find({ parentAccount: account._id });
    if (childAccounts.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete account with sub-accounts. Delete sub-accounts first.'
      });
    }

    // Check if account has balance
    if (account.currentBalance !== 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete account with non-zero balance'
      });
    }

    await account.remove();

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: error.message
    });
  }
});

// @route   GET /api/chart-of-accounts/stats/summary
// @desc    Get account statistics summary
// @access  Private
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const totalAccounts = await ChartOfAccounts.countDocuments({ isActive: true });
    const accountsByType = await ChartOfAccounts.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$accountType', count: { $sum: 1 } } }
    ]);
    
    const totalAssets = await ChartOfAccounts.aggregate([
      { $match: { accountType: 'asset', isActive: true } },
      { $group: { _id: null, total: { $sum: '$currentBalance' } } }
    ]);
    
    const totalLiabilities = await ChartOfAccounts.aggregate([
      { $match: { accountType: 'liability', isActive: true } },
      { $group: { _id: null, total: { $sum: '$currentBalance' } } }
    ]);
    
    const totalEquity = await ChartOfAccounts.aggregate([
      { $match: { accountType: 'equity', isActive: true } },
      { $group: { _id: null, total: { $sum: '$currentBalance' } } }
    ]);

    res.json({
      success: true,
      data: {
        totalAccounts,
        accountsByType,
        totalAssets: totalAssets[0]?.total || 0,
        totalLiabilities: totalLiabilities[0]?.total || 0,
        totalEquity: totalEquity[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Get account stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch account statistics',
      error: error.message
    });
  }
});

module.exports = router;

