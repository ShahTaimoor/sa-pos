/**
 * Opening Balance Routes
 * 
 * STEP 1: Routes for creating opening balance journal entries.
 * Opening balances are created using double-entry accounting, not direct balance updates.
 */

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { handleValidationErrors, sanitizeRequest } = require('../middleware/validation');
const openingBalanceService = require('../services/openingBalanceService');
const periodValidationService = require('../services/periodValidationService');
const logger = require('../utils/logger');

/**
 * @route   POST /api/opening-balances
 * @desc    Create opening balance journal entry for a single account
 * @access  Private (requires 'post_opening_balances' permission)
 */
router.post('/', [
  auth,
  requirePermission('post_opening_balances'),
  tenantMiddleware,
  sanitizeRequest,
  body('accountId').isMongoId().withMessage('Valid account ID is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Valid amount greater than 0 is required'),
  body('entryDate').optional().isISO8601().toDate().withMessage('Valid entry date is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { accountId, amount, entryDate } = req.body;
    const tenantId = req.tenantId || req.user?.tenantId;
    const userId = req.user._id;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    // Validate transaction date against fiscal year/period
    const transactionDate = entryDate ? new Date(entryDate) : new Date();
    await periodValidationService.validateTransactionDate(transactionDate, tenantId);

    // Create opening balance entry
    const journalEntry = await openingBalanceService.createOpeningBalanceEntry(
      {
        accountId,
        amount: parseFloat(amount),
        entryDate: transactionDate,
        tenantId,
        userId
      }
    );

    res.status(201).json({
      success: true,
      message: 'Opening balance entry created successfully',
      data: {
        journalEntry: {
          entryNumber: journalEntry.entryNumber,
          entryDate: journalEntry.entryDate,
          totalDebit: journalEntry.totalDebit,
          totalCredit: journalEntry.totalCredit,
          description: journalEntry.description
        }
      }
    });
  } catch (error) {
    logger.error('Error creating opening balance:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.message.includes('fiscal year') || error.message.includes('period')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create opening balance entry',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/opening-balances/bulk
 * @desc    Create opening balance journal entries for multiple accounts
 * @access  Private (requires 'post_opening_balances' permission)
 */
router.post('/bulk', [
  auth,
  requirePermission('post_opening_balances'),
  tenantMiddleware,
  sanitizeRequest,
  body('accounts').isArray({ min: 1 }).withMessage('Accounts array is required'),
  body('accounts.*.accountId').isMongoId().withMessage('Valid account ID is required'),
  body('accounts.*.amount').isFloat({ min: 0.01 }).withMessage('Valid amount greater than 0 is required'),
  body('accounts.*.entryDate').optional().isISO8601().toDate(),
  body('entryDate').optional().isISO8601().toDate().withMessage('Valid entry date is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { accounts, entryDate } = req.body;
    const tenantId = req.tenantId || req.user?.tenantId;
    const userId = req.user._id;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    // Validate transaction date
    const transactionDate = entryDate ? new Date(entryDate) : new Date();
    await periodValidationService.validateTransactionDate(transactionDate, tenantId);

    // Prepare accounts data
    const accountsData = accounts.map(acc => ({
      accountId: acc.accountId,
      amount: parseFloat(acc.amount),
      entryDate: acc.entryDate ? new Date(acc.entryDate) : transactionDate
    }));

    // Create bulk opening balance entries
    const journalEntries = await openingBalanceService.createBulkOpeningBalances(
      accountsData,
      tenantId,
      userId
    );

    res.status(201).json({
      success: true,
      message: `Created ${journalEntries.length} opening balance entries`,
      data: {
        count: journalEntries.length,
        journalEntries: journalEntries.map(je => ({
          entryNumber: je.entryNumber,
          entryDate: je.entryDate,
          description: je.description
        }))
      }
    });
  } catch (error) {
    logger.error('Error creating bulk opening balances:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to create opening balance entries',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
