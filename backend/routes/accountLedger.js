const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const { query } = require('express-validator');
const exportService = require('../services/exportService');
const accountLedgerService = require('../services/accountLedgerService');
const chartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');
const transactionRepository = require('../repositories/TransactionRepository');
const cashReceiptRepository = require('../repositories/CashReceiptRepository');
const cashPaymentRepository = require('../repositories/CashPaymentRepository');
const bankReceiptRepository = require('../repositories/BankReceiptRepository');
const bankPaymentRepository = require('../repositories/BankPaymentRepository');
const path = require('path');
const fs = require('fs');

const router = express.Router();

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

    // Get account ledger data from service
    const result = await accountLedgerService.getAccountLedger({
      startDate,
      endDate,
      accountCode,
      accountName,
      search,
      supplierName,
      summary,
      limit,
      page
    });

    // If export requested, handle it
    if (exportFormat) {
      const { account: accountInfo, entries: ledgerEntries, summary: ledgerSummary } = result.data;
      const { start, end } = accountLedgerService.clampDateRange(startDate, endDate);

      // Export functionality (CSV, Excel, PDF, JSON)
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

    // Return the result from service
    res.json(result);

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
    const accounts = await chartOfAccountsRepository.findAll({ isActive: true }, {
      sort: { accountCode: 1 },
      lean: true
    });

    // Use aggregation to get transaction summary for all accounts at once (fixes N+1 problem)
    const transactionFilter = Object.keys(dateFilter).length > 0 ? dateFilter : {};
    const transactionSummary = await transactionRepository.getSummary(transactionFilter, '$accountCode');

    // Create a map for quick lookup
    const summaryMap = {};
    transactionSummary.forEach(summary => {
      summaryMap[summary._id] = {
        totalDebits: summary.totalDebits || 0,
        totalCredits: summary.totalCredits || 0,
        transactionCount: summary.count || 0,
        lastActivity: summary.lastActivity || null
      };
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
    const cashReceipts = await cashReceiptRepository.findAll(cashReceiptFilter, {
      populate: [
        { path: 'customer', select: 'firstName lastName' },
        { path: 'createdBy', select: 'firstName lastName' }
      ],
      lean: true
    });

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
    const cashPayments = await cashPaymentRepository.findAll(cashReceiptFilter, {
      populate: [
        { path: 'supplier', select: 'name' },
        { path: 'createdBy', select: 'firstName lastName' }
      ],
      lean: true
    });

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
    const bankReceipts = await bankReceiptRepository.findAll(cashReceiptFilter, {
      populate: [
        { path: 'customer', select: 'firstName lastName' },
        { path: 'createdBy', select: 'firstName lastName' }
      ],
      lean: true
    });

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
    const bankPayments = await bankPaymentRepository.findAll(cashReceiptFilter, {
      populate: [
        { path: 'supplier', select: 'name' },
        { path: 'createdBy', select: 'firstName lastName' }
      ],
      lean: true
    });

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
    
    const transactions = await transactionRepository.findAll(transactionFilter, {
      populate: [
        { path: 'customer.id', select: 'firstName lastName businessName' },
        { path: 'supplier', select: 'companyName contactPerson' },
        { path: 'createdBy', select: 'firstName lastName' }
      ],
      lean: true
    });

    // Get account names for transaction entries
    const transactionAccountCodes = [...new Set(transactions.map(t => t.accountCode).filter(Boolean))];
    const accountMap = {};
    if (transactionAccountCodes.length > 0) {
      const accounts = await chartOfAccountsRepository.findAll({
        accountCode: { $in: transactionAccountCodes }
      }, {
        select: 'accountCode accountName',
        lean: true
      });
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
    
    
    if (accountName) {
      filteredEntries = filteredEntries.filter(entry => {
        const accountMatch = entry.accountName && entry.accountName.toLowerCase().includes(accountName.toLowerCase());
        const customerMatch = entry.customer && entry.customer.toLowerCase().includes(accountName.toLowerCase());
        const supplierMatch = entry.supplier && entry.supplier.toLowerCase().includes(accountName.toLowerCase());
        const descriptionMatch = entry.description && entry.description.toLowerCase().includes(accountName.toLowerCase());
        
        const matches = accountMatch || customerMatch || supplierMatch || descriptionMatch;
        return matches;
      });
    }

    // Get account info and calculate opening balance if specific account
    let accountInfo = null;
    let openingBalance = 0;
    
    if (accountCode) {
      accountInfo = await chartOfAccountsRepository.findByAccountCode(accountCode);
      if (accountInfo) {
        openingBalance = accountInfo.openingBalance || 0;
        
        // Calculate opening balance up to start date if date range is provided
        if (start) {
          const openingTransactions = await transactionRepository.getSummary({
            accountCode: accountCode,
            createdAt: { $lt: start }
          }, null);
          
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

