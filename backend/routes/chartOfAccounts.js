const express = require('express');
const router = express.Router();
const AccountingService = require('../services/accountingService');
const { auth } = require('../middleware/auth');
const ledgerAccountService = require('../services/ledgerAccountService');
const chartOfAccountsService = require('../services/chartOfAccountsService');

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
    
    const accounts = await chartOfAccountsService.getAccounts({
      accountType,
      accountCategory,
      isActive,
      search,
      allowDirectPosting
    });
    
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
    const hierarchy = await chartOfAccountsService.getAccountHierarchy();
    
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
    const account = await chartOfAccountsService.getAccountById(req.params.id);
    
    res.json({
      success: true,
      data: account
    });
  } catch (error) {
    if (error.message === 'Account not found') {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }
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

    const account = await chartOfAccountsService.createAccount(req.body, req.user.id);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: account
    });
  } catch (error) {
    if (error.message === 'Account code, name, type, category, and normal balance are required' || 
        error.message === 'Account code already exists') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
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
    const account = await chartOfAccountsService.updateAccount(req.params.id, req.body, req.user.id);

    res.json({
      success: true,
      message: 'Account updated successfully',
      data: account
    });
  } catch (error) {
    if (error.message === 'Account not found') {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }
    if (error.message === 'Cannot modify system accounts') {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify system accounts'
      });
    }
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
    const result = await chartOfAccountsService.deleteAccount(req.params.id);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    if (error.message === 'Account not found') {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }
    if (error.message === 'Cannot delete system accounts') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete system accounts'
      });
    }
    if (error.message.includes('sub-accounts') || error.message.includes('non-zero balance')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
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
    const stats = await chartOfAccountsService.getStats();

    res.json({
      success: true,
      data: stats
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

