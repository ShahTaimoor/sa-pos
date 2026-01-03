const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { auth, requirePermission } = require('../middleware/auth');
const JournalVoucher = require('../models/JournalVoucher'); // Still needed for new JournalVoucher() and static methods
const ChartOfAccounts = require('../models/ChartOfAccounts'); // Still needed for model reference
const { runWithTransactionRetry } = require('../services/transactionUtils');
const journalVoucherRepository = require('../repositories/JournalVoucherRepository');
const chartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');

const router = express.Router();

const withValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

router.get('/', [
  auth,
  requirePermission('view_reports'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional({ checkFalsy: true }).isIn(['draft', 'posted']).withMessage('Invalid status filter'),
  query('fromDate').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid from date'),
  query('toDate').optional({ checkFalsy:true }).isISO8601().withMessage('Invalid to date'),
  query('search').optional({ checkFalsy:true }).isString().trim().isLength({ max: 100 }).withMessage('Search must be a string')
], withValidation, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      fromDate,
      toDate,
      search
    } = req.query;

    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (fromDate || toDate) {
      filter.voucherDate = {};
      if (fromDate) {
        const start = new Date(fromDate);
        start.setHours(0, 0, 0, 0);
        filter.voucherDate.$gte = start;
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        filter.voucherDate.$lte = end;
      }
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
        { voucherNumber: regex },
        { reference: regex },
        { description: regex },
        { 'entries.accountName': regex },
        { 'entries.particulars': regex }
      ];
    }

    const result = await journalVoucherRepository.findWithPagination(filter, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort: { voucherDate: -1, createdAt: -1 },
      populate: [
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'approvedBy', select: 'firstName lastName email' }
      ],
      lean: true
    });
    
    const vouchers = result.vouchers;
    const total = result.total;

    res.json({
      success: true,
      data: {
        vouchers,
        pagination: {
          currentPage: parseInt(page, 10),
          itemsPerPage: parseInt(limit, 10),
          totalItems: total,
          totalPages: Math.ceil(total / parseInt(limit, 10)) || 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching journal vouchers:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/:id', [
  auth,
  requirePermission('view_reports'),
  param('id').isMongoId().withMessage('Invalid voucher ID')
], withValidation, async (req, res) => {
  try {
    const voucher = await journalVoucherRepository.findById(req.params.id, {
      populate: [
        { path: 'entries.account', select: 'accountCode accountName accountType' },
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'approvedBy', select: 'firstName lastName email' }
      ]
    });

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Journal voucher not found'
      });
    }

    res.json({
      success: true,
      data: voucher
    });
  } catch (error) {
    console.error('Error fetching journal voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.post('/', [
  auth,
  requirePermission('manage_reports'),
  body('voucherDate').optional().isISO8601().withMessage('Voucher date must be a valid date'),
  body('reference').optional().isString().trim().isLength({ max: 100 }).withMessage('Reference is too long'),
  body('description').optional().isString().trim().isLength({ max: 1000 }).withMessage('Description is too long'),
  body('entries').isArray({ min: 2 }).withMessage('At least two entries are required'),
  body('entries.*.accountId').isMongoId().withMessage('Account ID is required for each entry'),
  body('entries.*.debit').optional().isFloat({ min: 0 }).withMessage('Debit must be a non-negative number'),
  body('entries.*.credit').optional().isFloat({ min: 0 }).withMessage('Credit must be a non-negative number'),
  body('entries.*.particulars').optional().isString().trim().isLength({ max: 500 }).withMessage('Particulars are too long')
], withValidation, async (req, res) => {
  try {
    const { voucherDate, reference, description, entries, notes } = req.body;
    const createdBy = req.user?._id;

    const accountIds = entries.map(entry => entry.accountId);
    const accounts = await chartOfAccountsRepository.findAll({ _id: { $in: accountIds } });

    if (accounts.length !== entries.length) {
      throw new Error('One or more selected accounts were not found.');
    }

    const entriesWithAccount = entries.map(entry => {
      const account = accounts.find(acc => acc._id.toString() === entry.accountId);
      if (!account) {
        throw new Error('Invalid account selected.');
      }

      const debit = Number(entry.debit || 0);
      const credit = Number(entry.credit || 0);

      if (debit <= 0 && credit <= 0) {
        throw new Error('Each entry must have either a debit or credit amount greater than zero.');
      }

      if (debit > 0 && credit > 0) {
        throw new Error('An entry cannot have both debit and credit amounts.');
      }

      return {
        account: account._id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        particulars: entry.particulars || '',
        debit,
        credit
      };
    });

    const totalDebit = entriesWithAccount.reduce((sum, entry) => sum + entry.debit, 0);
    const totalCredit = entriesWithAccount.reduce((sum, entry) => sum + entry.credit, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new Error('Total debit and credit must be equal.');
    }

    if (totalDebit <= 0) {
      throw new Error('Total debit must be greater than zero.');
    }

    const populatedVoucher = await runWithTransactionRetry(async (session) => {
      const journalVoucher = new JournalVoucher({
        voucherDate: voucherDate ? new Date(voucherDate) : new Date(),
        reference,
        description,
        entries: entriesWithAccount,
        notes,
        createdBy,
        status: 'posted'
      });

      await journalVoucher.save({ session });

      // Update account balances
      for (const entry of entriesWithAccount) {
        const account = accounts.find(acc => acc._id.toString() === entry.account.toString());
        if (!account) continue;

        const amount = entry.debit > 0 ? entry.debit : entry.credit;
        const isDebitEntry = entry.debit > 0;

        let delta = amount;
        if (account.normalBalance === 'debit') {
          delta = isDebitEntry ? amount : -amount;
        } else {
          delta = isDebitEntry ? -amount : amount;
        }

        await chartOfAccountsRepository.updateBalance(
          account._id,
          { $inc: { currentBalance: delta } },
          { session }
        );
      }

      return journalVoucherRepository.findByIdWithSession(journalVoucher._id, {
        session,
        populate: [{ path: 'createdBy', select: 'firstName lastName email' }]
      });
    });

    res.status(201).json({
      success: true,
      message: 'Journal voucher created successfully',
      data: populatedVoucher
    });
  } catch (error) {
    console.error('Error creating journal voucher:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create journal voucher'
    });
  }
});

module.exports = router;

