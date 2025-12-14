const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const { query } = require('express-validator');
const Transaction = require('../models/Transaction');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const CashReceipt = require('../models/CashReceipt');
const CashPayment = require('../models/CashPayment');
const BankReceipt = require('../models/BankReceipt');
const BankPayment = require('../models/BankPayment');
const exportService = require('../services/exportService');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Helpers
const clampDateRange = (start, end, maxDays = 93, defaultDays = 30) => {
  let s = start ? new Date(start) : null;
  let e = end ? new Date(end) : null;
  if (!s && !e) {
    e = new Date();
    s = new Date(e);
    s.setDate(e.getDate() - defaultDays);
  } else if (s && !e) {
    e = new Date(s);
    e.setDate(s.getDate() + defaultDays);
  } else if (!s && e) {
    s = new Date(e);
    s.setDate(e.getDate() - defaultDays);
  }
  const maxMs = maxDays * 24 * 60 * 60 * 1000;
  if (e - s > maxMs) {
    e = new Date(s.getTime() + maxMs);
  }
  return { start: s, end: e };
};

const resolveCashBankCodes = async () => {
  try {
    const accounts = await ChartOfAccounts.find({ accountType: 'asset' })
      .select('accountCode accountName')
      .lean();
    let cash = accounts.find(a => /cash/i.test(a.accountName))?.accountCode || '1001';
    let bank = accounts.find(a => /bank/i.test(a.accountName))?.accountCode || '1002';
    return { cashCode: cash, bankCode: bank };
  } catch (_) {
    return { cashCode: '1001', bankCode: '1002' };
  }
};

/**
 * @route   GET /api/account-ledger
 * @desc    Get account ledger with all transactions for all accounts
 * @access  Private
 */
router.get('/', [
  auth,
  requirePermission('view_reports'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('accountCode').optional().isString().withMessage('Invalid account code'),
  query('accountName').optional().isString().withMessage('Invalid account name'),
  query('search').optional().isString().withMessage('Invalid search text'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1'),
  query('export').optional().isIn(['csv', 'excel', 'xlsx', 'pdf', 'json']).withMessage('Export format must be csv, excel, pdf, or json')
], async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      accountCode,
      accountName,
      search,
      supplierName,
      summary,
      export: exportFormat,
      limit = 100,
      page = 1
    } = req.query;

    // Date range guardrails
    const { start, end } = clampDateRange(startDate, endDate);

    // Build query filter
    const filter = {};
    
    if (accountCode) {
      filter.accountCode = accountCode;
    }

    if (start || end) {
      filter.createdAt = {};
      if (start) filter.createdAt.$gte = start;
      if (end) filter.createdAt.$lte = end;
    }

    // Account name → map to matching account codes
    if (accountName && !accountCode) {
      const matchingAccounts = await ChartOfAccounts.find({
        accountName: { $regex: accountName, $options: 'i' }
      }).select('accountCode');
      if (matchingAccounts.length > 0) {
        filter.accountCode = { $in: matchingAccounts.map(a => a.accountCode) };
      } else {
        // No accounts match the name; return empty page quickly
        return res.json({
          success: true,
          data: { account: null, entries: [], pagination: { currentPage: parseInt(page), totalPages: 0, totalEntries: 0, entriesPerPage: parseInt(limit) }, summary: { openingBalance: 0, closingBalance: 0, totalDebits: 0, totalCredits: 0 } }
        });
      }
    }

    // Text search across key fields
    if (search) {
      filter.$or = [
        { description: { $regex: search, $options: 'i' } },
        { reference: { $regex: search, $options: 'i' } },
        { transactionId: { $regex: search, $options: 'i' } }
      ];
    }

    // Get total count AFTER applying all filters
    const totalTransactions = await Transaction.countDocuments(filter);

    // Get transactions; for summary mode skip heavy populates
    const baseQuery = Transaction.find(filter).sort({ createdAt: 1 });
    if (!summary) {
      baseQuery
        .populate('customer.id', 'firstName lastName email')
        .populate('supplier', 'companyName')
        .populate('createdBy', 'firstName lastName');
    }
    const transactions = await baseQuery
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    // Results are already filtered; no extra in-memory filtering needed
    let filteredTransactions = transactions;
    // Optional supplier name filter (case-insensitive) when populated
    if (supplierName) {
      const q = String(supplierName).toLowerCase();
      filteredTransactions = filteredTransactions.filter(t =>
        (t.supplier && (t.supplier.companyName || '').toLowerCase().includes(q))
      );
    }

    // Get account info if specific account
    let accountInfo = null;
    if (accountCode) {
      accountInfo = await ChartOfAccounts.findOne({ accountCode });
    }

    // Calculate running balance only when specific account is selected
    let runningBalance = accountInfo ? accountInfo.openingBalance || 0 : null;
    const ledgerEntries = filteredTransactions.map(transaction => {
      const debit = transaction.debitAmount || 0;
      const credit = transaction.creditAmount || 0;
      
      if (accountInfo && runningBalance !== null) {
        if (accountInfo.normalBalance === 'debit') {
          runningBalance = runningBalance + debit - credit;
        } else {
          runningBalance = runningBalance + credit - debit;
        }
      }

      return {
        ...transaction,
        accountCode: transaction.accountCode || accountInfo?.accountCode,
        accountName: accountInfo?.accountName || '',
        debitAmount: debit,
        creditAmount: credit,
        balance: accountInfo && runningBalance !== null ? runningBalance : undefined,
        source: 'Transaction'
      };
    });

    // Export functionality (CSV, Excel, PDF, JSON)
    if (exportFormat) {
      try {
        const headers = ['Date', 'Account Code', 'Account Name', 'Description', 'Reference', 'Debit', 'Credit', 'Balance', 'Source'];
        const rows = ledgerEntries.map(e => [
          exportService.formatDate(e.createdAt || e.date, 'datetime'),
          e.accountCode || accountInfo?.accountCode || '',
          e.accountName || accountInfo?.accountName || '',
          e.description || '',
          e.reference || '',
          e.debitAmount || 0,
          e.creditAmount || 0,
          accountInfo ? (e.balance || 0) : '',
          e.source || 'Transaction'
        ]);

        const accountLabel = accountInfo ? `${accountInfo.accountCode}-${accountInfo.accountName}` : 'all-accounts';
        const dateRange = start && end 
          ? `${exportService.formatDate(start)}_to_${exportService.formatDate(end)}`
          : 'all-time';

        if (exportFormat === 'csv') {
          const filename = exportService.generateFilename(`account-ledger-${accountLabel}`, 'csv');
          const filepath = await exportService.exportToCSV(rows, headers, filename);
          
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.sendFile(path.resolve(filepath));
          
          // Clean up file after sending (optional, or use cron job)
          setTimeout(() => {
            if (fs.existsSync(filepath)) {
              fs.unlinkSync(filepath);
            }
          }, 60000); // Delete after 1 minute
          return;
        }

        if (exportFormat === 'excel' || exportFormat === 'xlsx') {
          const filename = exportService.generateFilename(`account-ledger-${accountLabel}`, 'xlsx');
          const title = `Account Ledger - ${accountInfo ? `${accountInfo.accountCode} ${accountInfo.accountName}` : 'All Accounts'}`;
          const subtitle = start && end 
            ? `Period: ${exportService.formatDate(start)} to ${exportService.formatDate(end)}`
            : null;

          await exportService.exportToExcel(rows, {
            headers,
            sheetName: 'Account Ledger',
            filename,
            title,
            subtitle
          });

          const filepath = path.join(exportService.exportDir, filename);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.sendFile(path.resolve(filepath));

          setTimeout(() => {
            if (fs.existsSync(filepath)) {
              fs.unlinkSync(filepath);
            }
          }, 60000);
          return;
        }

        if (exportFormat === 'pdf') {
          const filename = exportService.generateFilename(`account-ledger-${accountLabel}`, 'pdf');
          const title = `Account Ledger - ${accountInfo ? `${accountInfo.accountCode} ${accountInfo.accountName}` : 'All Accounts'}`;
          const subtitle = start && end 
            ? `Period: ${exportService.formatDate(start)} to ${exportService.formatDate(end)}`
            : null;

          await exportService.exportToPDF(rows, {
            headers,
            filename,
            title,
            subtitle
          });

          const filepath = path.join(exportService.exportDir, filename);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.sendFile(path.resolve(filepath));

          setTimeout(() => {
            if (fs.existsSync(filepath)) {
              fs.unlinkSync(filepath);
            }
          }, 60000);
          return;
        }

        if (exportFormat === 'json') {
          const exportData = {
            account: accountInfo,
            period: {
              startDate: start,
              endDate: end
            },
            summary: {
              openingBalance: accountInfo ? (accountInfo.openingBalance || 0) : 0,
              closingBalance: accountInfo && runningBalance !== null ? runningBalance : (ledgerEntries.reduce((sum, e) => sum + (e.debitAmount - e.creditAmount), 0)),
              totalDebits: ledgerEntries.reduce((sum, entry) => sum + (entry.debitAmount || 0), 0),
              totalCredits: ledgerEntries.reduce((sum, entry) => sum + (entry.creditAmount || 0), 0),
              totalEntries: ledgerEntries.length
            },
            entries: ledgerEntries.map(e => ({
              date: e.createdAt || e.date,
              accountCode: e.accountCode || accountInfo?.accountCode,
              accountName: e.accountName || accountInfo?.accountName,
              description: e.description,
              reference: e.reference,
              debitAmount: e.debitAmount || 0,
              creditAmount: e.creditAmount || 0,
              balance: e.balance,
              source: e.source
            }))
          };

          const filename = exportService.generateFilename(`account-ledger-${accountLabel}`, 'json');
          const filepath = await exportService.exportToJSON(exportData, { filename, pretty: true });

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.sendFile(path.resolve(filepath));

          setTimeout(() => {
            if (fs.existsSync(filepath)) {
              fs.unlinkSync(filepath);
            }
          }, 60000);
          return;
        }
      } catch (error) {
        console.error('Export error:', error);
        return res.status(500).json({
          success: false,
          message: 'Export failed',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    }

    // Summary mode: return totals only
    if (summary) {
      return res.json({
        success: true,
        data: {
          account: accountInfo,
          entries: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalTransactions / parseInt(limit)),
            totalEntries: totalTransactions,
            entriesPerPage: parseInt(limit)
          },
          summary: {
            openingBalance: accountInfo ? accountInfo.openingBalance : 0,
            closingBalance: accountInfo ? runningBalance : (filteredTransactions.reduce((sum, t) => sum + ((t.debitAmount||0) - (t.creditAmount||0)), 0)),
            totalDebits: filteredTransactions.reduce((sum, t) => sum + (t.debitAmount||0), 0),
            totalCredits: filteredTransactions.reduce((sum, t) => sum + (t.creditAmount||0), 0)
          }
        }
      });
    }

    res.json({
      success: true,
      data: {
        account: accountInfo,
        entries: ledgerEntries,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalTransactions / parseInt(limit)),
          totalEntries: totalTransactions,
          entriesPerPage: parseInt(limit)
        },
        summary: {
          openingBalance: accountInfo ? accountInfo.openingBalance : 0,
          closingBalance: accountInfo ? runningBalance : (ledgerEntries.reduce((sum, e) => sum + (e.debitAmount - e.creditAmount), 0)),
          totalDebits: ledgerEntries.reduce((sum, entry) => sum + entry.debitAmount, 0),
          totalCredits: ledgerEntries.reduce((sum, entry) => sum + entry.creditAmount, 0)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching account ledger:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/account-ledger/accounts
 * @desc    Get list of all accounts with balances
 * @access  Private
 */
router.get('/accounts', [
  auth,
  requirePermission('view_reports'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date')
], async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build date filter for transactions
    const dateFilter = {};
    if (startDate || endDate) {
      const { start, end } = clampDateRange(startDate, endDate);
      if (start || end) {
        dateFilter.createdAt = {};
        if (start) dateFilter.createdAt.$gte = start;
        if (end) dateFilter.createdAt.$lte = end;
      }
    }

    // Get all accounts
    const accounts = await ChartOfAccounts.find({ isActive: true })
      .sort({ accountCode: 1 })
      .lean();

    // Use aggregation to get transaction summary for all accounts at once (fixes N+1 problem)
    const transactionSummary = await Transaction.aggregate([
      ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
      {
        $group: {
          _id: '$accountCode',
          totalDebits: { $sum: { $ifNull: ['$debitAmount', 0] } },
          totalCredits: { $sum: { $ifNull: ['$creditAmount', 0] } },
          transactionCount: { $sum: 1 },
          lastActivity: { $max: '$createdAt' }
        }
      }
    ]);

    // Create a map for quick lookup
    const summaryMap = {};
    transactionSummary.forEach(summary => {
      summaryMap[summary._id] = summary;
    });

    // Calculate balances for each account
    const accountsWithBalances = accounts.map(account => {
      const summary = summaryMap[account.accountCode] || {
        totalDebits: 0,
        totalCredits: 0,
        transactionCount: 0,
        lastActivity: null
      };

      // Calculate balance based on normal balance type
      let balance = account.openingBalance || 0;
      if (account.normalBalance === 'debit') {
        balance = balance + summary.totalDebits - summary.totalCredits;
      } else {
        balance = balance + summary.totalCredits - summary.totalDebits;
      }

      return {
        ...account,
        currentBalance: balance,
        totalDebits: summary.totalDebits,
        totalCredits: summary.totalCredits,
        transactionCount: summary.transactionCount,
        lastActivity: summary.lastActivity
      };
    });

    // Group by account type
    const groupedAccounts = accountsWithBalances.reduce((acc, account) => {
      if (!acc[account.accountType]) {
        acc[account.accountType] = [];
      }
      acc[account.accountType].push(account);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        accounts: accountsWithBalances,
        groupedAccounts,
        summary: {
          totalAccounts: accountsWithBalances.length,
          assetAccounts: accountsWithBalances.filter(a => a.accountType === 'asset').length,
          liabilityAccounts: accountsWithBalances.filter(a => a.accountType === 'liability').length,
          equityAccounts: accountsWithBalances.filter(a => a.accountType === 'equity').length,
          revenueAccounts: accountsWithBalances.filter(a => a.accountType === 'revenue').length,
          expenseAccounts: accountsWithBalances.filter(a => a.accountType === 'expense').length
        }
      }
    });

  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/account-ledger/all-entries
 * @desc    Get all accounting entries from all sources (comprehensive ledger)
 * @access  Private
 */
router.get('/all-entries', [
  auth,
  requirePermission('view_reports'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('accountCode').optional().isString().withMessage('Invalid account code'),
  query('accountName').optional().isString().withMessage('Invalid account name'),
  query('export').optional().isIn(['csv', 'excel', 'xlsx', 'pdf', 'json']).withMessage('Export format must be csv, excel, pdf, or json')
], async (req, res) => {
  try {
    const { startDate, endDate, accountCode, accountName, export: exportFormat } = req.query;
    
    console.log('Account Ledger Search - Parameters:', { startDate, endDate, accountCode, accountName });

    const { start, end } = clampDateRange(startDate, endDate);
    const dateFilter = {};
    if (start) dateFilter.$gte = start;
    if (end) dateFilter.$lte = end;

    // Resolve cash/bank codes dynamically
    const { cashCode, bankCode } = await resolveCashBankCodes();

    // Get all entries from different sources
    const allEntries = [];

    // 1. Get Cash Receipts
    const cashReceiptFilter = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};
    const cashReceipts = await CashReceipt.find(cashReceiptFilter)
      .populate('customer', 'firstName lastName')
      .populate('createdBy', 'firstName lastName')
      .lean();

    cashReceipts.forEach(receipt => {
      if (!accountCode || accountCode === cashCode) {
        allEntries.push({
          date: receipt.createdAt,
          accountCode: cashCode,
          accountName: 'Cash',
          description: `Cash Receipt: ${receipt.particular}`,
          reference: receipt.voucherCode,
          debitAmount: receipt.amount,
          creditAmount: 0,
          source: 'Cash Receipt',
          sourceId: receipt._id,
          customer: receipt.customer ? `${receipt.customer.firstName} ${receipt.customer.lastName}` : '',
          createdBy: receipt.createdBy ? `${receipt.createdBy.firstName} ${receipt.createdBy.lastName}` : ''
        });
      }
    });

    // 2. Get Cash Payments
    const cashPayments = await CashPayment.find(cashReceiptFilter)
      .populate('supplier', 'name')
      .populate('createdBy', 'firstName lastName')
      .lean();

    cashPayments.forEach(payment => {
      if (!accountCode || accountCode === cashCode) {
        allEntries.push({
          date: payment.createdAt,
          accountCode: cashCode,
          accountName: 'Cash',
          description: `Cash Payment: ${payment.particular}`,
          reference: payment.voucherCode,
          debitAmount: 0,
          creditAmount: payment.amount,
          source: 'Cash Payment',
          sourceId: payment._id,
          supplier: payment.supplier ? payment.supplier.name : '',
          createdBy: payment.createdBy ? `${payment.createdBy.firstName} ${payment.createdBy.lastName}` : ''
        });
      }
    });

    // 3. Get Bank Receipts
    const bankReceipts = await BankReceipt.find(cashReceiptFilter)
      .populate('customer', 'firstName lastName')
      .populate('createdBy', 'firstName lastName')
      .lean();

    bankReceipts.forEach(receipt => {
      if (!accountCode || accountCode === bankCode) {
        allEntries.push({
          date: receipt.createdAt,
          accountCode: bankCode,
          accountName: 'Bank',
          description: `Bank Receipt: ${receipt.particular}`,
          reference: receipt.transactionReference,
          debitAmount: receipt.amount,
          creditAmount: 0,
          source: 'Bank Receipt',
          sourceId: receipt._id,
          customer: receipt.customer ? `${receipt.customer.firstName} ${receipt.customer.lastName}` : '',
          createdBy: receipt.createdBy ? `${receipt.createdBy.firstName} ${receipt.createdBy.lastName}` : ''
        });
      }
    });

    // 4. Get Bank Payments
    const bankPayments = await BankPayment.find(cashReceiptFilter)
      .populate('supplier', 'name')
      .populate('createdBy', 'firstName lastName')
      .lean();

    bankPayments.forEach(payment => {
      if (!accountCode || accountCode === bankCode) {
        allEntries.push({
          date: payment.createdAt,
          accountCode: bankCode,
          accountName: 'Bank',
          description: `Bank Payment: ${payment.particular}`,
          reference: payment.transactionReference,
          debitAmount: 0,
          creditAmount: payment.amount,
          source: 'Bank Payment',
          sourceId: payment._id,
          supplier: payment.supplier ? payment.supplier.name : '',
          createdBy: payment.createdBy ? `${payment.createdBy.firstName} ${payment.createdBy.lastName}` : ''
        });
      }
    });

    // 5. Get Transaction model entries (main accounting entries)
    const transactionFilter = {};
    if (Object.keys(dateFilter).length > 0) {
      transactionFilter.createdAt = dateFilter;
    }
    if (accountCode) {
      transactionFilter.accountCode = accountCode;
    }
    
    const transactions = await Transaction.find(transactionFilter)
      .populate('customer.id', 'firstName lastName businessName')
      .populate('supplier', 'companyName contactPerson')
      .populate('createdBy', 'firstName lastName')
      .lean();

    // Get account names for transaction entries
    const transactionAccountCodes = [...new Set(transactions.map(t => t.accountCode).filter(Boolean))];
    const accountMap = {};
    if (transactionAccountCodes.length > 0) {
      const accounts = await ChartOfAccounts.find({
        accountCode: { $in: transactionAccountCodes }
      }).select('accountCode accountName').lean();
      accounts.forEach(acc => {
        accountMap[acc.accountCode] = acc.accountName;
      });
    }

    transactions.forEach(transaction => {
      if (transaction.accountCode && transaction.debitAmount >= 0 && transaction.creditAmount >= 0) {
        const customerName = transaction.customer?.id
          ? (transaction.customer.id.businessName || `${transaction.customer.id.firstName || ''} ${transaction.customer.id.lastName || ''}`.trim())
          : '';
        const supplierName = transaction.supplier
          ? (transaction.supplier.companyName || transaction.supplier.contactPerson?.name || '')
          : '';
        const createdByName = transaction.createdBy
          ? `${transaction.createdBy.firstName || ''} ${transaction.createdBy.lastName || ''}`.trim()
          : '';

        allEntries.push({
          date: transaction.createdAt || transaction.date,
          accountCode: transaction.accountCode,
          accountName: accountMap[transaction.accountCode] || transaction.accountCode,
          description: transaction.description || `${transaction.type || 'Transaction'}: ${transaction.transactionId || ''}`,
          reference: transaction.reference || transaction.transactionId || '',
          debitAmount: transaction.debitAmount || 0,
          creditAmount: transaction.creditAmount || 0,
          source: 'Transaction',
          sourceId: transaction._id,
          customer: customerName,
          supplier: supplierName,
          createdBy: createdByName
        });
      }
    });

    // Sort all entries by date
    allEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Filter entries by account name if provided
    let filteredEntries = allEntries;
    
    console.log('Total entries before filtering:', allEntries.length);
    
    if (accountName) {
      console.log('Filtering by account name:', accountName);
      filteredEntries = filteredEntries.filter(entry => {
        const accountMatch = entry.accountName && entry.accountName.toLowerCase().includes(accountName.toLowerCase());
        const customerMatch = entry.customer && entry.customer.toLowerCase().includes(accountName.toLowerCase());
        const supplierMatch = entry.supplier && entry.supplier.toLowerCase().includes(accountName.toLowerCase());
        const descriptionMatch = entry.description && entry.description.toLowerCase().includes(accountName.toLowerCase());
        
        const matches = accountMatch || customerMatch || supplierMatch || descriptionMatch;
        if (matches) {
          console.log('Match found:', { 
            accountName: entry.accountName, 
            customer: entry.customer, 
            supplier: entry.supplier, 
            description: entry.description 
          });
        }
        
        return matches;
      });
      console.log('Entries after filtering:', filteredEntries.length);
    }

    // Get account info and calculate opening balance if specific account
    let accountInfo = null;
    let openingBalance = 0;
    
    if (accountCode) {
      accountInfo = await ChartOfAccounts.findOne({ accountCode });
      if (accountInfo) {
        openingBalance = accountInfo.openingBalance || 0;
        
        // Calculate opening balance up to start date if date range is provided
        if (start) {
          const openingTransactions = await Transaction.aggregate([
            {
              $match: {
                accountCode: accountCode,
                createdAt: { $lt: start }
              }
            },
            {
              $group: {
                _id: null,
                totalDebits: { $sum: { $ifNull: ['$debitAmount', 0] } },
                totalCredits: { $sum: { $ifNull: ['$creditAmount', 0] } }
              }
            }
          ]);
          
          if (openingTransactions.length > 0) {
            const opening = openingTransactions[0];
            if (accountInfo.normalBalance === 'debit') {
              openingBalance = openingBalance + opening.totalDebits - opening.totalCredits;
            } else {
              openingBalance = openingBalance + opening.totalCredits - opening.totalDebits;
            }
          }
        }
      }
    }

    // Calculate running balance based on account normal balance
    let runningBalance = openingBalance;
    const entriesWithBalance = filteredEntries.map(entry => {
      if (accountInfo && accountInfo.normalBalance === 'credit') {
        // Credit normal balance: balance increases with credits, decreases with debits
        runningBalance = runningBalance + entry.creditAmount - entry.debitAmount;
      } else {
        // Debit normal balance (default): balance increases with debits, decreases with credits
        runningBalance = runningBalance + entry.debitAmount - entry.creditAmount;
      }
      return {
        ...entry,
        balance: runningBalance
      };
    });

    // Export functionality (CSV, Excel, PDF, JSON)
    if (exportFormat) {
      try {
        const headers = ['Date', 'Account Code', 'Account Name', 'Description', 'Reference', 'Debit', 'Credit', 'Balance', 'Source', 'Customer', 'Supplier'];
        const rows = entriesWithBalance.map(e => [
          exportService.formatDate(e.date, 'datetime'),
          e.accountCode || '',
          e.accountName || '',
          e.description || '',
          e.reference || '',
          e.debitAmount || 0,
          e.creditAmount || 0,
          e.balance || 0,
          e.source || '',
          e.customer || '',
          e.supplier || ''
        ]);

        const accountLabel = accountInfo ? `${accountInfo.accountCode}-${accountInfo.accountName}` : 'all-accounts';
        const dateLabel = start && end 
          ? `${exportService.formatDate(start)}_to_${exportService.formatDate(end)}`
          : 'all-time';

        if (exportFormat === 'csv') {
          const filename = exportService.generateFilename(`account-ledger-${accountLabel}-${dateLabel}`, 'csv');
          const filepath = await exportService.exportToCSV(rows, headers, filename);
          
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.sendFile(path.resolve(filepath));
          
          setTimeout(() => {
            if (fs.existsSync(filepath)) {
              fs.unlinkSync(filepath);
            }
          }, 60000);
          return;
        }

        if (exportFormat === 'excel' || exportFormat === 'xlsx') {
          const filename = exportService.generateFilename(`account-ledger-${accountLabel}-${dateLabel}`, 'xlsx');
          const title = `Account Ledger - ${accountInfo ? `${accountInfo.accountCode} ${accountInfo.accountName}` : 'All Accounts'}`;
          const subtitle = start && end 
            ? `Period: ${exportService.formatDate(start)} to ${exportService.formatDate(end)}`
            : null;

          await exportService.exportToExcel(rows, {
            headers,
            sheetName: 'Account Ledger',
            filename,
            title,
            subtitle
          });

          const filepath = path.join(exportService.exportDir, filename);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.sendFile(path.resolve(filepath));

          setTimeout(() => {
            if (fs.existsSync(filepath)) {
              fs.unlinkSync(filepath);
            }
          }, 60000);
          return;
        }

        if (exportFormat === 'pdf') {
          const filename = exportService.generateFilename(`account-ledger-${accountLabel}-${dateLabel}`, 'pdf');
          const title = `Account Ledger - ${accountInfo ? `${accountInfo.accountCode} ${accountInfo.accountName}` : 'All Accounts'}`;
          const subtitle = start && end 
            ? `Period: ${exportService.formatDate(start)} to ${exportService.formatDate(end)}`
            : null;

          await exportService.exportToPDF(rows, {
            headers,
            filename,
            title,
            subtitle,
            pageSize: 'A4',
            margin: 30
          });

          const filepath = path.join(exportService.exportDir, filename);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.sendFile(path.resolve(filepath));

          setTimeout(() => {
            if (fs.existsSync(filepath)) {
              fs.unlinkSync(filepath);
            }
          }, 60000);
          return;
        }

        if (exportFormat === 'json') {
          const exportData = {
            account: accountInfo,
            period: {
              startDate: start,
              endDate: end
            },
            summary: {
              openingBalance: openingBalance,
              closingBalance: runningBalance,
              totalDebits: entriesWithBalance.reduce((sum, entry) => sum + entry.debitAmount, 0),
              totalCredits: entriesWithBalance.reduce((sum, entry) => sum + entry.creditAmount, 0),
              totalEntries: entriesWithBalance.length
            },
            entries: entriesWithBalance.map(e => ({
              date: e.date,
              accountCode: e.accountCode,
              accountName: e.accountName,
              description: e.description,
              reference: e.reference,
              debitAmount: e.debitAmount || 0,
              creditAmount: e.creditAmount || 0,
              balance: e.balance,
              source: e.source,
              customer: e.customer,
              supplier: e.supplier,
              createdBy: e.createdBy
            }))
          };

          const filename = exportService.generateFilename(`account-ledger-${accountLabel}-${dateLabel}`, 'json');
          const filepath = await exportService.exportToJSON(exportData, { filename, pretty: true });

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.sendFile(path.resolve(filepath));

          setTimeout(() => {
            if (fs.existsSync(filepath)) {
              fs.unlinkSync(filepath);
            }
          }, 60000);
          return;
        }
      } catch (error) {
        console.error('Export error:', error);
        return res.status(500).json({
          success: false,
          message: 'Export failed',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    }

    res.json({
      success: true,
      data: {
        account: accountInfo,
        entries: entriesWithBalance,
        summary: {
          openingBalance: openingBalance,
          totalEntries: entriesWithBalance.length,
          totalDebits: entriesWithBalance.reduce((sum, entry) => sum + entry.debitAmount, 0),
          totalCredits: entriesWithBalance.reduce((sum, entry) => sum + entry.creditAmount, 0),
          closingBalance: runningBalance
        }
      }
    });

  } catch (error) {
    console.error('Error fetching all ledger entries:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

