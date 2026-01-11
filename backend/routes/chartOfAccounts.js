const express = require('express');
const router = express.Router();
const AccountingService = require('../services/accountingService');
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { handleValidationErrors, sanitizeRequest } = require('../middleware/validation');
const ledgerAccountService = require('../services/ledgerAccountService');
const chartOfAccountsService = require('../services/chartOfAccountsService');
const accountBalanceService = require('../services/accountBalanceService');
const accountCodeGenerationService = require('../services/accountCodeGenerationService');
const { body, param, query } = require('express-validator');

// @route   GET /api/chart-of-accounts
// @desc    Get all accounts with optional filters
// @access  Private
router.get('/', auth, tenantMiddleware, async (req, res) => {
  try {
    const { accountType, accountCategory, isActive, search, allowDirectPosting, includePartyAccounts } = req.query;
    const tenantId = req.tenantId || req.user?.tenantId;

    if (includePartyAccounts === 'true') {
      await ledgerAccountService.ensureCustomerLedgerAccounts({ userId: req.user?._id, tenantId });
      await ledgerAccountService.ensureSupplierLedgerAccounts({ userId: req.user?._id, tenantId });
    }
    
    const accounts = await chartOfAccountsService.getAccounts({
      accountType,
      accountCategory,
      isActive,
      search,
      allowDirectPosting,
      tenantId
    });
    
    res.json({
      success: true,
      data: accounts,
      count: accounts.length
    });
  } catch (error) {
    logger.error('Get accounts error:', { error: error });
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
router.get('/hierarchy', auth, tenantMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    const hierarchy = await chartOfAccountsService.getAccountHierarchy(tenantId);
    
    res.json({
      success: true,
      data: hierarchy
    });
  } catch (error) {
    logger.error('Get account hierarchy error:', { error: error });
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
router.get('/:id', auth, tenantMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    const account = await chartOfAccountsService.getAccountById(req.params.id, tenantId);
    
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
    logger.error('Get account error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch account',
      error: error.message
    });
  }
});

// @route   POST /api/chart-of-accounts
// @desc    Create new account (with optional auto-generated code - STEP 9)
// @access  Private
router.post('/', [
  auth,
  tenantMiddleware,
  sanitizeRequest,
  body('accountName').notEmpty().withMessage('Account name is required'),
  body('accountType').isIn(['asset', 'liability', 'equity', 'revenue', 'expense']).withMessage('Valid account type is required'),
  body('accountCategory').notEmpty().withMessage('Account category is required'),
  body('normalBalance').isIn(['debit', 'credit']).withMessage('Normal balance must be debit or credit'),
  body('accountCode').optional().isString().trim(),
  body('autoGenerateCode').optional().isBoolean(),
  handleValidationErrors
], async (req, res) => {
  try {
    const {
      accountCode,
      accountName,
      accountType,
      accountCategory,
      parentAccount,
      level,
      normalBalance,
      description,
      allowDirectPosting,
      isTaxable,
      taxRate,
      requiresReconciliation,
      accountOrigin,
      isProtected,
      autoGenerateCode
    } = req.body;

    // Get tenantId from request (set by tenantMiddleware or auth middleware)
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    // STEP 9: Auto-generate account code if requested
    let finalAccountCode = accountCode;
    if (autoGenerateCode && !accountCode) {
      try {
        finalAccountCode = await accountCodeGenerationService.generateAccountCode(
          tenantId,
          accountType
        );
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Failed to generate account code',
          error: error.message
        });
      }
    }

    const accountData = {
      ...req.body,
      accountCode: finalAccountCode
    };

    const account = await chartOfAccountsService.createAccount(accountData, req.user.id, tenantId);

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
    if (error.message.includes('Parent account must not allow direct posting')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    logger.error('Create account error:', { error: error });
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
router.put('/:id', auth, tenantMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    // STEP 4: Check if requires system permission for protected accounts
    const requireSystemPermission = req.body.requireSystemPermission === true;
    
    const account = await chartOfAccountsService.updateAccount(
      req.params.id, 
      req.body, 
      req.user.id,
      tenantId,
      requireSystemPermission
    );

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
    if (error.message.includes('Cannot modify') || error.message.includes('system accounts') || error.message.includes('protected')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }
    if (error.message.includes('Parent account must not allow direct posting')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    logger.error('Update account error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Failed to update account',
      error: error.message
    });
  }
});

// @route   DELETE /api/chart-of-accounts/:id
// @desc    Delete account (soft delete)
// @access  Private
router.delete('/:id', auth, tenantMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    // STEP 6: Soft delete with userId
    const result = await chartOfAccountsService.deleteAccount(req.params.id, req.user.id, tenantId);

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
    if (error.message.includes('Cannot delete') || error.message.includes('system accounts') || error.message.includes('protected')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }
    if (error.message.includes('sub-accounts') || error.message.includes('non-zero balance')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    logger.error('Delete account error:', { error: error });
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
router.get('/stats/summary', auth, tenantMiddleware, async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    const stats = await chartOfAccountsService.getStats(tenantId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Get account stats error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch account statistics',
      error: error.message
    });
  }
});

// @route   POST /api/chart-of-accounts/:id/lock-reconciliation
// @desc    Lock account for reconciliation (with date range - STEP 5)
// @access  Private (requires 'reconcile_accounts' permission)
router.post('/:id/lock-reconciliation', [
  auth,
  tenantMiddleware,
  requirePermission('reconcile_accounts'),
  param('id').isMongoId().withMessage('Valid account ID is required'),
  body('startDate').isISO8601().toDate().withMessage('Valid start date is required'),
  body('endDate').isISO8601().toDate().withMessage('Valid end date is required'),
  body('durationMinutes').optional().isInt({ min: 1, max: 480 }).withMessage('Duration must be between 1 and 480 minutes')
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    const ChartOfAccounts = require('../models/ChartOfAccounts');
    const account = await ChartOfAccounts.findOne({ 
      _id: req.params.id,
      tenantId: tenantId,
      isDeleted: false
    });
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    const { startDate, endDate, durationMinutes = 30 } = req.body;
    
    // Validate date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be before end date'
      });
    }

    // STEP 5: Lock with date range
    await account.lockForReconciliationWithDateRange(req.user._id, start, end, durationMinutes);

    res.json({
      success: true,
      message: 'Account locked for reconciliation',
      data: {
        accountCode: account.accountCode,
        accountName: account.accountName,
        reconciliationStatus: account.reconciliationStatus,
        lockStartDate: account.reconciliationStatus.lockStartDate,
        lockEndDate: account.reconciliationStatus.lockEndDate,
        lockExpiresAt: account.reconciliationStatus.lockExpiresAt
      }
    });
  } catch (error) {
    logger.error('Error locking account for reconciliation:', error);
    if (error.message.includes('already locked')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error locking account',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/chart-of-accounts/:id/unlock-reconciliation
// @desc    Unlock account after reconciliation (with reconciledUpTo date - STEP 5)
// @access  Private (requires 'reconcile_accounts' permission)
router.post('/:id/unlock-reconciliation', [
  auth,
  requirePermission('reconcile_accounts'),
  param('id').isMongoId().withMessage('Valid account ID is required'),
  body('reconciled').optional().isBoolean().withMessage('Reconciled must be a boolean'),
  body('reconciledUpTo').optional().isISO8601().toDate().withMessage('Valid reconciled up to date is required'),
  body('discrepancyAmount').optional().isFloat().withMessage('Discrepancy amount must be a number'),
  body('discrepancyReason').optional().isString().trim().isLength({ max: 500 }).withMessage('Discrepancy reason too long')
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    const ChartOfAccounts = require('../models/ChartOfAccounts');
    const account = await ChartOfAccounts.findOne({ 
      _id: req.params.id,
      tenantId: tenantId,
      isDeleted: false
    });
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    const reconciled = req.body.reconciled !== undefined ? req.body.reconciled : true;
    const reconciledUpTo = req.body.reconciledUpTo ? new Date(req.body.reconciledUpTo) : null;
    const discrepancyAmount = req.body.discrepancyAmount || null;
    const discrepancyReason = req.body.discrepancyReason || null;

    // STEP 5: Unlock with reconciledUpTo date
    await account.unlockAfterReconciliation(
      req.user._id,
      reconciled,
      discrepancyAmount,
      discrepancyReason,
      reconciledUpTo
    );

    res.json({
      success: true,
      message: reconciled ? 'Account reconciled successfully' : 'Account unlocked with discrepancy',
      data: {
        accountCode: account.accountCode,
        accountName: account.accountName,
        reconciliationStatus: account.reconciliationStatus,
        reconciledUpTo: account.reconciliationStatus.reconciledUpTo
      }
    });
  } catch (error) {
    logger.error('Error unlocking account:', error);
    if (error.message.includes('Only the user who locked')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error unlocking account',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/chart-of-accounts/:id/reconciliation-status
// @desc    Get reconciliation status of an account
// @access  Private (requires 'view_reports' permission)
router.get('/:id/reconciliation-status', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports'),
  param('id').isMongoId().withMessage('Valid account ID is required')
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    const ChartOfAccounts = require('../models/ChartOfAccounts');
    const account = await ChartOfAccounts.findOne({ 
      _id: req.params.id,
      tenantId: tenantId,
      isDeleted: false
    })
      .populate('reconciliationStatus.lockedBy', 'firstName lastName email')
      .populate('reconciliationStatus.reconciledBy', 'firstName lastName email');
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    const isLocked = account.reconciliationStatus.lockedBy && 
                     account.reconciliationStatus.lockExpiresAt &&
                     account.reconciliationStatus.lockExpiresAt > new Date();

    res.json({
      success: true,
      data: {
        accountId: account._id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        reconciliationStatus: account.reconciliationStatus,
        isLocked: isLocked,
        canBeLocked: !isLocked || account.reconciliationStatus.lockedBy.toString() === req.user._id.toString(),
        lockExpiresIn: isLocked && account.reconciliationStatus.lockExpiresAt 
          ? Math.max(0, Math.floor((account.reconciliationStatus.lockExpiresAt - new Date()) / 60000))
          : 0
      }
    });
  } catch (error) {
    logger.error('Error getting reconciliation status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting reconciliation status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/chart-of-accounts/:id/recalculate-balance
// @desc    Recalculate and cache account balance from journal entries (STEP 2)
// @access  Private (requires 'view_reports' permission)
router.post('/:id/recalculate-balance', [
  auth,
  requirePermission('view_reports'),
  tenantMiddleware,
  sanitizeRequest,
  param('id').isMongoId().withMessage('Valid account ID is required'),
  query('asOfDate').optional().isISO8601().toDate().withMessage('Valid date is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { asOfDate } = req.query;
    const tenantId = req.tenantId || req.user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const ChartOfAccounts = require('../models/ChartOfAccounts');
    const account = await ChartOfAccounts.findOne({ 
      _id: id,
      tenantId: tenantId,
      isDeleted: false
    });
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Recalculate balance
    const balance = await accountBalanceService.recalculateAndCacheBalance(
      account.accountCode,
      tenantId,
      { session: null }
    );

    res.json({
      success: true,
      message: 'Balance recalculated successfully',
      data: {
        accountCode: account.accountCode,
        accountName: account.accountName,
        balance: balance,
        asOfDate: asOfDate || null
      }
    });
  } catch (error) {
    logger.error('Error recalculating balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to recalculate balance',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/chart-of-accounts/recalculate-all-balances
// @desc    Recalculate all account balances from journal entries (STEP 2)
// @access  Private (requires 'view_reports' permission)
router.post('/recalculate-all-balances', [
  auth,
  requirePermission('view_reports'),
  tenantMiddleware,
  sanitizeRequest
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;

    // Recalculate all balances
    const results = await accountBalanceService.recalculateAllBalances(tenantId);

    res.json({
      success: true,
      message: `Recalculated ${results.successful} account balances`,
      data: {
        total: results.total,
        successful: results.successful,
        failed: results.failed,
        balances: results.balances
      }
    });
  } catch (error) {
    logger.error('Error recalculating all balances:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to recalculate balances',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/chart-of-accounts/:id/balance
// @desc    Get account balance calculated from journal entries (STEP 2)
// @access  Private
router.get('/:id/balance', [
  auth,
  tenantMiddleware,
  sanitizeRequest,
  param('id').isMongoId().withMessage('Valid account ID is required'),
  query('asOfDate').optional().isISO8601().toDate().withMessage('Valid date is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { asOfDate } = req.query;
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    const ChartOfAccounts = require('../models/ChartOfAccounts');
const logger = require('../utils/logger');
    const account = await ChartOfAccounts.findOne({ 
      _id: id,
      tenantId: tenantId,
      isDeleted: false
    });
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Calculate balance from journal entries
    const balance = await accountBalanceService.calculateAccountBalance(
      account.accountCode,
      tenantId,
      asOfDate ? new Date(asOfDate) : null
    );

    res.json({
      success: true,
      data: {
        accountCode: account.accountCode,
        accountName: account.accountName,
        balance: balance,
        asOfDate: asOfDate || null,
        cachedBalance: account.currentBalance,
        balanceLastCalculated: account.balanceLastCalculated
      }
    });
  } catch (error) {
    logger.error('Error calculating balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate balance',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

