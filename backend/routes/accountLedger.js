const express = require('express');
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { query } = require('express-validator');
const exportService = require('../services/exportService');
const accountLedgerService = require('../services/accountLedgerService');
const chartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');
const transactionRepository = require('../repositories/TransactionRepository');
const cashReceiptRepository = require('../repositories/CashReceiptRepository');
const cashPaymentRepository = require('../repositories/CashPaymentRepository');
const bankReceiptRepository = require('../repositories/BankReceiptRepository');
const bankPaymentRepository = require('../repositories/BankPaymentRepository');
const customerRepository = require('../repositories/CustomerRepository');
const supplierRepository = require('../repositories/SupplierRepository');
const salesRepository = require('../repositories/SalesRepository');
const Sales = require('../models/Sales');
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
  tenantMiddleware, // Enforce tenant isolation
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

    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
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
    }, tenantId);

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
        logger.error('Export error:', { error: error });
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
    logger.error('Error fetching account ledger:', error);
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
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('view_reports'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date')
], async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build date filter for transactions
    const dateFilter = {};
    if (startDate || endDate) {
      const { start, end } = accountLedgerService.clampDateRange(startDate, endDate);
      if (start || end) {
        dateFilter.createdAt = {};
        if (start) dateFilter.createdAt.$gte = start;
        if (end) dateFilter.createdAt.$lte = end;
      }
    }

    // Get all accounts
    const tenantId = req.tenantId;
    
    const accounts = await chartOfAccountsRepository.findAll({ 
      tenantId: tenantId,
      isActive: true,
      isDeleted: false 
    }, {
      sort: { accountCode: 1 },
      lean: true
    });

    // Use aggregation to get transaction summary for all accounts at once (fixes N+1 problem)
    const transactionFilter = Object.keys(dateFilter).length > 0 ? dateFilter : {};
    transactionFilter.tenantId = tenantId; // Add tenantId filter
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

    // Get all customers and create customer accounts
    const customers = await customerRepository.findAll({ status: 'active' }, { tenantId: tenantId, lean: true });
    const customerAccounts = customers.map(customer => {
      const displayName = customer.businessName || 
                         `${customer.firstName || ''} ${customer.lastName || ''}`.trim() ||
                         customer.displayName ||
                         customer.name ||
                         'Unknown Customer';
      
      // Calculate customer balance from transactions
      // For customers, we need to get their receivables balance
      const customerSummary = summaryMap[`CUSTOMER-${customer._id}`] || {
        totalDebits: 0,
        totalCredits: 0,
        transactionCount: 0,
        lastActivity: null
      };

      // Customer receivables: debit increases receivable (amount owed to us), credit decreases it
      let customerBalance = customer.openingBalance || customer.advanceBalance || 0;
      customerBalance = customerBalance + customerSummary.totalDebits - customerSummary.totalCredits;

      return {
        _id: `customer-${customer._id}`,
        accountCode: customer.ledgerAccountCode || `CUST-${customer._id.toString()}`,
        accountName: `Customer - ${displayName}`,
        accountType: 'asset',
        accountCategory: 'current_assets',
        normalBalance: 'debit',
        openingBalance: customer.openingBalance || customer.advanceBalance || 0,
        currentBalance: customerBalance,
        totalDebits: customerSummary.totalDebits,
        totalCredits: customerSummary.totalCredits,
        transactionCount: customerSummary.transactionCount,
        lastActivity: customerSummary.lastActivity,
        isCustomerAccount: true,
        customerId: customer._id,
        description: `Customer account for ${displayName}`
      };
    });

    // Get all suppliers and create supplier accounts
    const suppliers = await supplierRepository.findAll({ status: 'active' }, { tenantId: tenantId, lean: true });
    const supplierAccounts = suppliers.map(supplier => {
      const displayName = supplier.companyName || 
                         supplier.contactPerson?.name ||
                         supplier.name ||
                         'Unknown Supplier';
      
      // Calculate supplier balance from transactions
      const supplierSummary = summaryMap[`SUPPLIER-${supplier._id}`] || {
        totalDebits: 0,
        totalCredits: 0,
        transactionCount: 0,
        lastActivity: null
      };

      // Supplier payables: credit increases payable (amount we owe), debit decreases it
      let supplierBalance = supplier.openingBalance || 0;
      supplierBalance = supplierBalance + supplierSummary.totalCredits - supplierSummary.totalDebits;

      return {
        _id: `supplier-${supplier._id}`,
        accountCode: supplier.ledgerAccountCode || `SUP-${supplier._id.toString()}`,
        accountName: `Supplier - ${displayName}`,
        accountType: 'liability',
        accountCategory: 'current_liabilities',
        normalBalance: 'credit',
        openingBalance: supplier.openingBalance || 0,
        currentBalance: supplierBalance,
        totalDebits: supplierSummary.totalDebits,
        totalCredits: supplierSummary.totalCredits,
        transactionCount: supplierSummary.transactionCount,
        lastActivity: supplierSummary.lastActivity,
        isSupplierAccount: true,
        supplierId: supplier._id,
        description: `Supplier account for ${displayName}`
      };
    });

    // Combine all accounts
    const allAccounts = [...accountsWithBalances, ...customerAccounts, ...supplierAccounts];

    // Group by account type
    const groupedAccounts = allAccounts.reduce((acc, account) => {
      if (!acc[account.accountType]) {
        acc[account.accountType] = [];
      }
      acc[account.accountType].push(account);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        accounts: allAccounts,
        groupedAccounts,
        summary: {
          totalAccounts: allAccounts.length,
          assetAccounts: allAccounts.filter(a => a.accountType === 'asset').length,
          liabilityAccounts: allAccounts.filter(a => a.accountType === 'liability').length,
          equityAccounts: allAccounts.filter(a => a.accountType === 'equity').length,
          revenueAccounts: allAccounts.filter(a => a.accountType === 'revenue').length,
          expenseAccounts: allAccounts.filter(a => a.accountType === 'expense').length
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching accounts:', error);
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
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('view_reports'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('accountCode').optional().isString().withMessage('Invalid account code'),
  query('accountName').optional().isString().withMessage('Invalid account name'),
  query('export').optional().isIn(['csv', 'excel', 'xlsx', 'pdf', 'json']).withMessage('Export format must be csv, excel, pdf, or json')
], async (req, res) => {
  try {
    const { startDate, endDate, accountCode, accountName, customerId: queryCustomerId, supplierId: querySupplierId, export: exportFormat } = req.query;
    

    const { start, end } = accountLedgerService.clampDateRange(startDate, endDate);
    const dateFilter = {};
    if (start) dateFilter.$gte = start;
    if (end) dateFilter.$lte = end;

    // Resolve tenantId first for all queries
    const tenantId = req.tenantId;
    
    // Check if accountCode is for a customer or supplier account
    // Also check if customerId/supplierId is passed directly in query (from frontend)
    let customerId = queryCustomerId ? (typeof queryCustomerId === 'string' ? queryCustomerId : queryCustomerId.toString()) : null;
    let supplierId = querySupplierId ? (typeof querySupplierId === 'string' ? querySupplierId : querySupplierId.toString()) : null;
    
    if (accountCode && !customerId && !supplierId) {
      // Check if it's a customer account (starts with CUST- or customer-)
      if (accountCode.startsWith('CUST-') || accountCode.startsWith('customer-')) {
        // Try to find customer by account code or by ID
        const customerCode = accountCode.replace(/^(CUST-|customer-)/i, '');
        let customer = null;
        
        // First try to find by MongoDB ObjectId if customerCode looks like an ObjectId
        if (customerCode.length === 24 && /^[0-9a-fA-F]{24}$/.test(customerCode)) {
          try {
            customer = await customerRepository.findById(customerCode, { tenantId: tenantId, lean: true });
          } catch (e) {
            // Not a valid ObjectId, continue with other methods
          }
        }
        
        // If not found, try other methods
        if (!customer) {
          customer = await customerRepository.findOne({
            $or: [
              { customerCode: customerCode },
              { ledgerAccountCode: accountCode },
              { _id: customerCode }
            ],
            tenantId: tenantId
          }, { tenantId: tenantId, lean: true });
        }
        
        // If still not found, try to find by matching account name pattern
        if (!customer && accountName) {
          const nameMatch = accountName.replace(/^Customer - /i, '').trim();
          customer = await customerRepository.findOne({
            $or: [
              { businessName: { $regex: new RegExp(`^${nameMatch}$`, 'i') } },
              { displayName: { $regex: new RegExp(`^${nameMatch}$`, 'i') } },
              { firstName: { $regex: new RegExp(`^${nameMatch}$`, 'i') } },
              { lastName: { $regex: new RegExp(`^${nameMatch}$`, 'i') } }
            ],
            tenantId: tenantId
          }, { tenantId: tenantId, lean: true });
        }
        
        if (customer) {
          customerId = customer._id;
        }
      }
      
      // Check if it's a supplier account (starts with SUP- or supplier-)
      if (accountCode.startsWith('SUP-') || accountCode.startsWith('supplier-')) {
        const supplierCode = accountCode.replace(/^(SUP-|supplier-)/i, '');
        const supplier = await supplierRepository.findOne({
          $or: [
            { supplierCode: supplierCode },
            { ledgerAccountCode: accountCode },
            { _id: supplierCode }
          ],
          tenantId: tenantId
        }, { tenantId: tenantId, lean: true });
        if (supplier) {
          supplierId = supplier._id;
        }
      }
    }

    // Resolve cash/bank codes dynamically (tenantId already defined above)
    const { cashCode, bankCode } = await chartOfAccountsRepository.resolveCashBankCodes(tenantId);

    // Get all entries from different sources
    const allEntries = [];

    // 1. Get Cash Receipts
    const cashReceiptFilter = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};
    cashReceiptFilter.tenantId = tenantId; // Add tenantId for isolation
    // Add customer filter if customer account is selected
    if (customerId) {
      cashReceiptFilter.customer = customerId;
    }
    const cashReceipts = await cashReceiptRepository.findAll(cashReceiptFilter, {
      tenantId: tenantId,
      populate: [
        { path: 'customer', select: 'firstName lastName businessName displayName' },
        { path: 'createdBy', select: 'firstName lastName' }
      ],
      lean: true
    });

    cashReceipts.forEach(receipt => {
      // For customer accounts, show all receipts. For regular accounts, filter by accountCode
      if (customerId || !accountCode || accountCode === cashCode) {
        const customerName = receipt.customer?.businessName || 
                           receipt.customer?.displayName ||
                           `${receipt.customer?.firstName || ''} ${receipt.customer?.lastName || ''}`.trim() ||
                           '';
        
        allEntries.push({
          date: receipt.createdAt,
          accountCode: cashCode,
          accountName: 'Cash',
          description: `Cash Receipt: ${receipt.particular || ''}`,
          reference: receipt.voucherCode || receipt.transactionReference || '',
          debitAmount: 0, // Receipts reduce receivables (credit to AR)
          creditAmount: receipt.amount || 0, // Credit to reduce customer balance
          source: 'Cash Receipt',
          sourceId: receipt._id,
          customer: customerName,
          createdBy: receipt.createdBy ? `${receipt.createdBy.firstName} ${receipt.createdBy.lastName}` : ''
        });
      }
    });

    // 2. Get Cash Payments
    const cashPayments = await cashPaymentRepository.findAll(cashReceiptFilter, {
      tenantId: tenantId,
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
    const bankReceiptFilter = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};
    bankReceiptFilter.tenantId = tenantId; // Add tenantId for isolation
    // Add customer filter if customer account is selected
    if (customerId) {
      bankReceiptFilter.customer = customerId;
    }
    const bankReceipts = await bankReceiptRepository.findAll(bankReceiptFilter, {
      tenantId: tenantId,
      populate: [
        { path: 'customer', select: 'firstName lastName businessName displayName' },
        { path: 'createdBy', select: 'firstName lastName' }
      ],
      lean: true
    });

    bankReceipts.forEach(receipt => {
      // For customer accounts, show all receipts. For regular accounts, filter by accountCode
      if (customerId || !accountCode || accountCode === bankCode) {
        const customerName = receipt.customer?.businessName || 
                           receipt.customer?.displayName ||
                           `${receipt.customer?.firstName || ''} ${receipt.customer?.lastName || ''}`.trim() ||
                           '';
        
        allEntries.push({
          date: receipt.createdAt,
          accountCode: bankCode,
          accountName: 'Bank',
          description: `Bank Receipt: ${receipt.particular || ''}`,
          reference: receipt.transactionReference || receipt.voucherCode || '',
          debitAmount: 0, // Receipts reduce receivables (credit to AR)
          creditAmount: receipt.amount || 0, // Credit to reduce customer balance
          source: 'Bank Receipt',
          sourceId: receipt._id,
          customer: customerName,
          createdBy: receipt.createdBy ? `${receipt.createdBy.firstName} ${receipt.createdBy.lastName}` : ''
        });
      }
    });

    // 4. Get Bank Payments
    const bankPayments = await bankPaymentRepository.findAll(cashReceiptFilter, {
      tenantId: tenantId,
      populate: [
        { path: 'supplier', select: 'name' },
        { path: 'createdBy', select: 'firstName lastName' }
      ],
      lean: true
    });

    bankPayments.forEach(payment => {
      // Filter by supplier if supplier account is selected
      if (supplierId && payment.supplier?.toString() !== supplierId.toString()) {
        return;
      }
      
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

    // 4.5. Get Sales entries for customer (if customer account is selected)
    if (customerId) {
      try {
        // Convert customerId to ObjectId if it's a string
        const mongoose = require('mongoose');
const logger = require('../utils/logger');
        const customerObjectId = mongoose.Types.ObjectId.isValid(customerId) 
          ? new mongoose.Types.ObjectId(customerId) 
          : customerId;
        
        const salesFilter = {
          customer: customerObjectId,
          tenantId: tenantId,
          isDeleted: { $ne: true }
        };
        if (Object.keys(dateFilter).length > 0) {
          salesFilter.createdAt = dateFilter;
        }
        
        const sales = await Sales.find(salesFilter)
          .populate('customer', 'firstName lastName businessName displayName')
          .sort({ createdAt: 1 })
          .lean();
        
        // Get Accounts Receivable account code
        const arAccount = await chartOfAccountsRepository.findOne({
          tenantId: tenantId,
          $or: [
            { accountCode: '1130' },
            { accountName: /^Accounts Receivable$/i }
          ],
          isActive: true,
          isDeleted: false
        }, { lean: true });
        
        const arAccountCode = arAccount?.accountCode || '1130';
        
        sales.forEach(sale => {
          const customerName = sale.customer?.businessName || 
                             sale.customer?.displayName ||
                             `${sale.customer?.firstName || ''} ${sale.customer?.lastName || ''}`.trim() ||
                             'Unknown Customer';
          
          const totalAmount = sale.pricing?.total || sale.total || 0;
          
          // Sales create receivables (debit to AR, credit to Revenue)
          // For customer ledger, we show the receivable side (debit)
          allEntries.push({
            date: sale.createdAt || sale.date,
            accountCode: arAccountCode,
            accountName: arAccount?.accountName || 'Accounts Receivable',
            description: `Sale: ${sale.orderNumber || sale.voucherCode || sale._id}`,
            reference: sale.orderNumber || sale.voucherCode || sale._id.toString(),
            debitAmount: totalAmount,
            creditAmount: 0,
            source: 'Sales',
            sourceId: sale._id,
            customer: customerName,
            createdBy: ''
          });
        });
      } catch (error) {
        logger.error('Error fetching sales for customer:', error);
        // Continue without sales entries if there's an error
      }
    }

    // 5. Get Transaction model entries (main accounting entries)
    const transactionFilter = {};
    if (Object.keys(dateFilter).length > 0) {
      transactionFilter.createdAt = dateFilter;
    }
    // Only filter by accountCode if it's NOT a customer/supplier account
    if (accountCode && !customerId && !supplierId) {
      transactionFilter.accountCode = accountCode;
    }
    
    const transactions = await transactionRepository.findAll(transactionFilter, {
      tenantId: tenantId,
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
      const tenantId = req.tenantId || req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID is required'
        });
      }
      
      const accounts = await chartOfAccountsRepository.findAll({
        tenantId: tenantId,
        accountCode: { $in: transactionAccountCodes },
        isActive: true,
        isDeleted: false
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
        // Filter by customer if customer account is selected
        if (customerId) {
          const transactionCustomerId = transaction.customer?.id?._id || transaction.customer?.id || transaction.customer;
          if (transactionCustomerId?.toString() !== customerId.toString()) {
            return;
          }
        }
        
        // Filter by supplier if supplier account is selected
        if (supplierId) {
          const transactionSupplierId = transaction.supplier?._id || transaction.supplier;
          if (transactionSupplierId?.toString() !== supplierId.toString()) {
            return;
          }
        }
        
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
    
    if (customerId) {
      // For customer accounts, use customer's opening balance
      const tenantId = req.tenantId;
      const customer = await customerRepository.findById(customerId, { tenantId: tenantId, lean: true });
      if (customer) {
        openingBalance = customer.openingBalance || customer.advanceBalance || 0;
        accountInfo = {
          accountCode: customer.ledgerAccountCode || `CUST-${customer.customerCode || customer._id}`,
          accountName: `Customer - ${customer.businessName || customer.displayName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim()}`,
          accountType: 'asset',
          normalBalance: 'debit'
        };
        
        // Calculate opening balance up to start date if date range is provided
        if (start) {
          // Get sales before start date
          const openingSales = await Sales.find({
            customer: customerId,
            tenantId: tenantId,
            createdAt: { $lt: start },
            isDeleted: { $ne: true }
          }).lean();
          
          const openingSalesTotal = openingSales.reduce((sum, sale) => {
            return sum + (sale.pricing?.total || sale.total || 0);
          }, 0);
          
          // Get receipts before start date
          const openingReceipts = await cashReceiptRepository.findAll({
            customer: customerId,
            tenantId: tenantId,
            createdAt: { $lt: start }
          }, { tenantId: tenantId, lean: true });
          
          const openingReceiptsTotal = openingReceipts.reduce((sum, receipt) => {
            return sum + (receipt.amount || 0);
          }, 0);
          
          // Get bank receipts before start date
          const openingBankReceipts = await bankReceiptRepository.findAll({
            customer: customerId,
            tenantId: tenantId,
            createdAt: { $lt: start }
          }, { tenantId: tenantId, lean: true });
          
          const openingBankReceiptsTotal = openingBankReceipts.reduce((sum, receipt) => {
            return sum + (receipt.amount || 0);
          }, 0);
          
          // Opening balance = initial balance + sales (debits) - receipts (credits)
          openingBalance = openingBalance + openingSalesTotal - openingReceiptsTotal - openingBankReceiptsTotal;
        }
      }
    } else if (supplierId) {
      // For supplier accounts, use supplier's opening balance
      const tenantId = req.tenantId;
      const supplier = await supplierRepository.findById(supplierId, { tenantId: tenantId, lean: true });
      if (supplier) {
        openingBalance = supplier.openingBalance || 0;
        accountInfo = {
          accountCode: supplier.ledgerAccountCode || `SUP-${supplier.supplierCode || supplier._id}`,
          accountName: `Supplier - ${supplier.companyName || supplier.contactPerson?.name || supplier.name}`,
          accountType: 'liability',
          normalBalance: 'credit'
        };
      }
    } else if (accountCode) {
      const tenantId = req.tenantId || req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID is required'
        });
      }
      accountInfo = await chartOfAccountsRepository.findByAccountCode(accountCode, tenantId);
      if (accountInfo) {
        openingBalance = accountInfo.openingBalance || 0;
        
        // Calculate opening balance up to start date if date range is provided
        if (start) {
          const openingTransactions = await transactionRepository.getSummary({
            tenantId: tenantId,
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
        logger.error('Export error:', { error: error });
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
    logger.error('Error fetching all ledger entries:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/account-ledger/summary
 * @desc    Get Account Ledger Summary for Customers and Suppliers separately
 * @access  Private
 */
router.get('/summary', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('view_reports'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('search').optional().isString().withMessage('Invalid search text'),
  query('customerId').optional().isString().withMessage('Invalid customer ID')
], async (req, res) => {
  try {
    const { startDate, endDate, search, customerId, supplierId } = req.query;

    const tenantId = req.tenantId;
    const result = await accountLedgerService.getLedgerSummary({
      tenantId,
      startDate,
      endDate,
      search,
      customerId,
      supplierId
    });

    res.json(result);
  } catch (error) {
    logger.error('Error fetching ledger summary:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/account-ledger/customer-transactions
 * @desc    Get detailed transaction entries for a customer (ledger view)
 * @access  Private
 */
router.get('/customer-transactions', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('view_reports'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('customerId').optional().isString().withMessage('Invalid customer ID')
], async (req, res) => {
  try {
    const { startDate, endDate, customerId } = req.query;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }

    const tenantId = req.tenantId;
    const result = await accountLedgerService.getCustomerDetailedTransactions({
      tenantId,
      customerId,
      startDate,
      endDate
    });

    res.json(result);
  } catch (error) {
    logger.error('Error fetching customer detailed transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/account-ledger/supplier-transactions/:supplierId
 * @desc    Get detailed transaction entries for a supplier (ledger view)
 * @access  Private
 */
router.get('/supplier-transactions/:supplierId', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('view_reports'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date')
], async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { startDate, endDate } = req.query;

    if (!supplierId) {
      return res.status(400).json({
        success: false,
        message: 'Supplier ID is required'
      });
    }

    const tenantId = req.tenantId;
    const result = await accountLedgerService.getSupplierDetailedTransactions({
      tenantId,
      supplierId,
      startDate,
      endDate
    });

    res.json(result);
  } catch (error) {
    logger.error('Error fetching supplier detailed transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

