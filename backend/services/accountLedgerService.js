const transactionRepository = require('../repositories/TransactionRepository');
const chartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');
const customerRepository = require('../repositories/CustomerRepository');
const supplierRepository = require('../repositories/SupplierRepository');
const cashReceiptRepository = require('../repositories/CashReceiptRepository');
const cashPaymentRepository = require('../repositories/CashPaymentRepository');
const bankReceiptRepository = require('../repositories/BankReceiptRepository');
const bankPaymentRepository = require('../repositories/BankPaymentRepository');
const Sales = require('../models/Sales');
const PurchaseOrder = require('../models/PurchaseOrder');
const logger = require('../utils/logger');

class AccountLedgerService {
  /**
   * Clamp date range to prevent excessive queries
   * @param {Date|string} start - Start date
   * @param {Date|string} end - End date
   * @param {number} maxDays - Maximum days allowed
   * @param {number} defaultDays - Default days if no dates provided
   * @returns {{start: Date, end: Date}}
   */
  clampDateRange(start, end, maxDays = 93, defaultDays = 30) {
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
  }

  /**
   * Build filter query from request parameters
   * @param {object} queryParams - Request query parameters
   * @param {string} tenantId - Tenant ID (required)
   * @returns {Promise<object>} - MongoDB filter object
   */
  async buildFilter(queryParams, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for buildFilter');
    }
    
    const filter = {};

    // Account code filter
    if (queryParams.accountCode) {
      filter.accountCode = queryParams.accountCode;
    }

    // Date range filter
    const { start, end } = this.clampDateRange(queryParams.startDate, queryParams.endDate);
    if (start || end) {
      filter.createdAt = {};
      if (start) filter.createdAt.$gte = start;
      if (end) filter.createdAt.$lte = end;
    }

    // Account name → map to matching account codes
    if (queryParams.accountName && !queryParams.accountCode) {
      const accountCodes = await chartOfAccountsRepository.getAccountCodesByName(queryParams.accountName, tenantId);
      if (accountCodes.length > 0) {
        filter.accountCode = { $in: accountCodes };
      } else {
        // No accounts match the name; return empty result
        filter._id = { $in: [] }; // Empty result filter
      }
    }

    // Text search across key fields
    if (queryParams.search) {
      filter.$or = [
        { description: { $regex: queryParams.search, $options: 'i' } },
        { reference: { $regex: queryParams.search, $options: 'i' } },
        { transactionId: { $regex: queryParams.search, $options: 'i' } }
      ];
    }

    return filter;
  }

  /**
   * Get account ledger entries with filtering and pagination
   * @param {object} queryParams - Query parameters
   * @param {string} tenantId - Tenant ID (required)
   * @returns {Promise<object>}
   */
  async getAccountLedger(queryParams, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for getAccountLedger');
    }
    
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 100;
    const summary = queryParams.summary === 'true';

    const filter = await this.buildFilter(queryParams, tenantId);

    // Check if filter is empty (no matching accounts)
    if (filter._id && filter._id.$in && filter._id.$in.length === 0) {
      return {
        success: true,
        data: {
          account: null,
          entries: [],
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalEntries: 0,
            entriesPerPage: limit
          },
          summary: {
            openingBalance: 0,
            closingBalance: 0,
            totalDebits: 0,
            totalCredits: 0
          }
        }
      };
    }

    // Get transactions
    const populate = summary ? [] : [
      { path: 'customer.id', select: 'firstName lastName email' },
      { path: 'supplier', select: 'companyName' },
      { path: 'createdBy', select: 'firstName lastName' }
    ];

    const result = await transactionRepository.findWithPagination(filter, {
      page,
      limit,
      sort: { createdAt: 1 },
      populate
    });

    // Get account info if specific account
    let accountInfo = null;
    if (queryParams.accountCode) {
      accountInfo = await chartOfAccountsRepository.findByAccountCode(queryParams.accountCode, tenantId);
    }

    // Calculate running balance only when specific account is selected
    let runningBalance = accountInfo ? accountInfo.openingBalance || 0 : null;
    const ledgerEntries = result.transactions.map(transaction => {
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

    // Optional supplier name filter (case-insensitive) when populated
    let filteredEntries = ledgerEntries;
    if (queryParams.supplierName) {
      const q = String(queryParams.supplierName).toLowerCase();
      filteredEntries = filteredEntries.filter(t =>
        (t.supplier && (t.supplier.companyName || '').toLowerCase().includes(q))
      );
    }

    // Calculate summary
    const totalDebits = filteredEntries.reduce((sum, e) => sum + (e.debitAmount || 0), 0);
    const totalCredits = filteredEntries.reduce((sum, e) => sum + (e.creditAmount || 0), 0);
    const openingBalance = accountInfo ? accountInfo.openingBalance || 0 : 0;
    const closingBalance = accountInfo && runningBalance !== null 
      ? runningBalance 
      : openingBalance + totalDebits - totalCredits;

    return {
      success: true,
      data: {
        account: accountInfo,
        entries: filteredEntries,
        pagination: {
          currentPage: page,
          totalPages: result.pagination.pages,
          totalEntries: result.total,
          entriesPerPage: limit
        },
        summary: {
          openingBalance,
          closingBalance,
          totalDebits,
          totalCredits
        }
      }
    };
  }

  /**
   * Get Account Ledger Summary for Customers and Suppliers
   * Separates customers (receivables) and suppliers (payables) with correct accounting formulas
   * @param {object} queryParams - Query parameters (startDate, endDate, search)
   * @param {string} tenantId - Tenant ID (required)
   * @returns {Promise<object>}
   */
  async getLedgerSummary(queryParams = {}, tenantId = null) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for getLedgerSummary');
    }
    try {
      const { startDate, endDate, search, customerId, supplierId } = queryParams;
      
      // Clamp date range
      const { start, end } = this.clampDateRange(startDate, endDate);
    
    // Build date filter for Sales (uses createdAt)
    const salesDateFilter = {};
    if (start || end) {
      salesDateFilter.createdAt = {};
      if (start) salesDateFilter.createdAt.$gte = start;
      if (end) salesDateFilter.createdAt.$lte = end;
    }
    
    // Build date filter for Receipts/Payments (uses date field)
    const receiptDateFilter = {};
    if (start || end) {
      receiptDateFilter.date = {};
      if (start) receiptDateFilter.date.$gte = start;
      if (end) receiptDateFilter.date.$lte = end;
    }

    // Get all active customers (or specific customer if customerId is provided)
    const customerFilter = { status: 'active', isDeleted: { $ne: true }, tenantId: tenantId };
    if (customerId) {
      customerFilter._id = customerId;
    }
    const customers = await customerRepository.findAll(
      customerFilter,
      { lean: true }
    );

    // Get all active suppliers (or specific supplier if supplierId is provided)
    const supplierFilter = { status: 'active', isDeleted: { $ne: true }, tenantId: tenantId };
    if (supplierId) {
      supplierFilter._id = supplierId;
    }
    const suppliers = await supplierRepository.findAll(
      supplierFilter,
      { lean: true }
    );

    // Calculate customer summaries
    const customerSummaries = await Promise.all(
      customers.map(async (customer) => {
        const customerId = customer._id;
        const displayName = customer.businessName || 
                           `${customer.firstName || ''} ${customer.lastName || ''}`.trim() ||
                           customer.displayName ||
                           customer.name ||
                           'Unknown Customer';

        // Apply search filter if provided
        if (search) {
          const searchLower = search.toLowerCase();
          if (!displayName.toLowerCase().includes(searchLower) &&
              !customer.email?.toLowerCase().includes(searchLower) &&
              !customer.phone?.toLowerCase().includes(searchLower)) {
            return null;
          }
        }

        // Get opening balance
        const openingBalance = customer.openingBalance || customer.advanceBalance || 0;

        // Calculate opening balance up to start date (if date range provided)
        let adjustedOpeningBalance = openingBalance;
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
          
          // Get receipts before start date (receipts use 'date' field, not 'createdAt')
          const openingCashReceipts = await cashReceiptRepository.findAll({
            customer: customerId,
            tenantId: tenantId,
            date: { $lt: start }
          }, { lean: true });
          
          const openingCashReceiptsTotal = openingCashReceipts.reduce((sum, receipt) => {
            return sum + (receipt.amount || 0);
          }, 0);
          
          const openingBankReceipts = await bankReceiptRepository.findAll({
            customer: customerId,
            tenantId: tenantId,
            date: { $lt: start }
          }, { lean: true });
          
          const openingBankReceiptsTotal = openingBankReceipts.reduce((sum, receipt) => {
            return sum + (receipt.amount || 0);
          }, 0);
          
          // Opening balance = initial balance + sales (debits) - receipts (credits)
          adjustedOpeningBalance = openingBalance + openingSalesTotal - openingCashReceiptsTotal - openingBankReceiptsTotal;
        }

        // Get period transactions
        // Sales (Debit - increases receivables) - uses createdAt
        const periodSales = await Sales.find({
          customer: customerId,
          tenantId: tenantId,
          ...salesDateFilter,
          isDeleted: { $ne: true }
        }).lean();
        
        const totalDebits = periodSales.reduce((sum, sale) => {
          return sum + (sale.pricing?.total || sale.total || 0);
        }, 0);

        // Cash Receipts (Credit - decreases receivables) - uses date field
        const periodCashReceipts = await cashReceiptRepository.findAll({
          customer: customerId,
          tenantId: tenantId,
          ...receiptDateFilter
        }, { lean: true });
        
        const cashReceiptsTotal = periodCashReceipts.reduce((sum, receipt) => {
          return sum + (receipt.amount || 0);
        }, 0);

        // Bank Receipts (Credit - decreases receivables) - uses date field
        const periodBankReceipts = await bankReceiptRepository.findAll({
          customer: customerId,
          tenantId: tenantId,
          ...receiptDateFilter
        }, { lean: true });
        
        const bankReceiptsTotal = periodBankReceipts.reduce((sum, receipt) => {
          return sum + (receipt.amount || 0);
        }, 0);

        const totalCredits = cashReceiptsTotal + bankReceiptsTotal;

        // Customer Closing Balance = Opening + Debit - Credit (Receivables)
        const closingBalance = adjustedOpeningBalance + totalDebits - totalCredits;

        // Build particular/description with ALL invoice numbers and transaction descriptions
        const particularItems = [];
        
        // Add ALL sale invoices
        periodSales.forEach(sale => {
          const invoiceNo = sale.orderNumber || sale.voucherCode || sale._id.toString().slice(-8);
          particularItems.push(`Sale: ${invoiceNo}`);
        });
        
        // Add ALL cash receipts with voucher codes
        periodCashReceipts.forEach(receipt => {
          const voucherCode = receipt.voucherCode || receipt.transactionReference || receipt._id.toString().slice(-8);
          const particular = receipt.particular || 'Cash Receipt';
          particularItems.push(`${particular}: ${voucherCode}`);
        });
        
        // Add ALL bank receipts with transaction references
        periodBankReceipts.forEach(receipt => {
          const ref = receipt.transactionReference || receipt.voucherCode || receipt._id.toString().slice(-8);
          const particular = receipt.particular || 'Bank Receipt';
          particularItems.push(`${particular}: ${ref}`);
        });
        
        // Show ALL transactions separated by semicolons
        const particular = particularItems.length > 0 
          ? particularItems.join('; ') 
          : 'No transactions';

        return {
          id: customerId,
          accountCode: customer.ledgerAccountCode || `CUST-${customerId.toString()}`,
          name: displayName,
          email: customer.email || '',
          phone: customer.phone || '',
          openingBalance: adjustedOpeningBalance,
          totalDebits,
          totalCredits,
          closingBalance,
          transactionCount: periodSales.length + periodCashReceipts.length + periodBankReceipts.length,
          particular
        };
      })
    );

    // Filter out null entries (from search filter)
    const validCustomerSummaries = customerSummaries.filter(c => c !== null);

    // Calculate supplier summaries
    const supplierSummaries = await Promise.all(
      suppliers.map(async (supplier) => {
        const supplierId = supplier._id;
        const displayName = supplier.companyName || 
                           supplier.contactPerson?.name ||
                           supplier.name ||
                           'Unknown Supplier';

        // Apply search filter if provided
        if (search) {
          const searchLower = search.toLowerCase();
          if (!displayName.toLowerCase().includes(searchLower) &&
              !supplier.email?.toLowerCase().includes(searchLower) &&
              !supplier.phone?.toLowerCase().includes(searchLower)) {
            return null;
          }
        }

        // Get opening balance
        const openingBalance = supplier.openingBalance || 0;

        // Calculate opening balance up to start date (if date range provided)
        let adjustedOpeningBalance = openingBalance;
        if (start) {
          // Get purchases before start date
          const openingPurchases = await PurchaseOrder.find({
            supplier: supplierId,
            tenantId: tenantId,
            createdAt: { $lt: start },
            isDeleted: { $ne: true }
          }).lean();
          
          const openingPurchasesTotal = openingPurchases.reduce((sum, purchase) => {
            return sum + (purchase.total || 0);
          }, 0);
          
          // Get payments before start date (payments use 'date' field, not 'createdAt')
          const openingCashPayments = await cashPaymentRepository.findAll({
            supplier: supplierId,
            tenantId: tenantId,
            date: { $lt: start }
          }, { lean: true });
          
          const openingCashPaymentsTotal = openingCashPayments.reduce((sum, payment) => {
            return sum + (payment.amount || 0);
          }, 0);
          
          const openingBankPayments = await bankPaymentRepository.findAll({
            supplier: supplierId,
            tenantId: tenantId,
            date: { $lt: start }
          }, { lean: true });
          
          const openingBankPaymentsTotal = openingBankPayments.reduce((sum, payment) => {
            return sum + (payment.amount || 0);
          }, 0);
          
          // Opening balance = initial balance + purchases (credits) - payments (debits)
          adjustedOpeningBalance = openingBalance + openingPurchasesTotal - openingCashPaymentsTotal - openingBankPaymentsTotal;
        }

        // Get period transactions
        // Purchases (Credit - increases payables) - uses createdAt
        const periodPurchases = await PurchaseOrder.find({
          supplier: supplierId,
          tenantId: tenantId,
          ...salesDateFilter,
          isDeleted: { $ne: true }
        }).lean();
        
        const totalCredits = periodPurchases.reduce((sum, purchase) => {
          return sum + (purchase.total || 0);
        }, 0);

        // Cash Payments (Debit - decreases payables) - uses date field
        const periodCashPayments = await cashPaymentRepository.findAll({
          supplier: supplierId,
          tenantId: tenantId,
          ...receiptDateFilter
        }, { lean: true });
        
        const cashPaymentsTotal = periodCashPayments.reduce((sum, payment) => {
          return sum + (payment.amount || 0);
        }, 0);

        // Bank Payments (Debit - decreases payables) - uses date field
        const periodBankPayments = await bankPaymentRepository.findAll({
          supplier: supplierId,
          tenantId: tenantId,
          ...receiptDateFilter
        }, { lean: true });
        
        const bankPaymentsTotal = periodBankPayments.reduce((sum, payment) => {
          return sum + (payment.amount || 0);
        }, 0);

        const totalDebits = cashPaymentsTotal + bankPaymentsTotal;

        // Supplier Closing Balance = Opening + Credit - Debit (Payables)
        const closingBalance = adjustedOpeningBalance + totalCredits - totalDebits;

        // Build particular/description with ALL purchase order numbers and transaction descriptions
        const particularItems = [];
        
        // Add ALL purchase orders
        periodPurchases.forEach(purchase => {
          const poNumber = purchase.poNumber || purchase._id.toString().slice(-8);
          particularItems.push(`Purchase: ${poNumber}`);
        });
        
        // Add ALL cash payments with voucher codes
        periodCashPayments.forEach(payment => {
          const voucherCode = payment.voucherCode || payment.transactionReference || payment._id.toString().slice(-8);
          const particular = payment.particular || 'Cash Payment';
          particularItems.push(`${particular}: ${voucherCode}`);
        });
        
        // Add ALL bank payments with transaction references
        periodBankPayments.forEach(payment => {
          const ref = payment.transactionReference || payment.voucherCode || payment._id.toString().slice(-8);
          const particular = payment.particular || 'Bank Payment';
          particularItems.push(`${particular}: ${ref}`);
        });
        
        // Show ALL transactions separated by semicolons
        const particular = particularItems.length > 0 
          ? particularItems.join('; ') 
          : 'No transactions';

        return {
          id: supplierId,
          accountCode: supplier.ledgerAccountCode || `SUP-${supplierId.toString()}`,
          name: displayName,
          email: supplier.email || '',
          phone: supplier.phone || '',
          openingBalance: adjustedOpeningBalance,
          totalDebits,
          totalCredits,
          closingBalance,
          transactionCount: periodPurchases.length + periodCashPayments.length + periodBankPayments.length,
          particular
        };
      })
    );

    // Filter out null entries (from search filter)
    const validSupplierSummaries = supplierSummaries.filter(s => s !== null);

    // Calculate totals
    const customerTotals = validCustomerSummaries.reduce((acc, customer) => {
      acc.openingBalance += customer.openingBalance;
      acc.totalDebits += customer.totalDebits;
      acc.totalCredits += customer.totalCredits;
      acc.closingBalance += customer.closingBalance;
      return acc;
    }, { openingBalance: 0, totalDebits: 0, totalCredits: 0, closingBalance: 0 });

    const supplierTotals = validSupplierSummaries.reduce((acc, supplier) => {
      acc.openingBalance += supplier.openingBalance;
      acc.totalDebits += supplier.totalDebits;
      acc.totalCredits += supplier.totalCredits;
      acc.closingBalance += supplier.closingBalance;
      return acc;
    }, { openingBalance: 0, totalDebits: 0, totalCredits: 0, closingBalance: 0 });

      return {
        success: true,
        data: {
          period: {
            startDate: start,
            endDate: end
          },
          customers: {
            summary: validCustomerSummaries,
            totals: customerTotals,
            count: validCustomerSummaries.length
          },
          suppliers: {
            summary: validSupplierSummaries,
            totals: supplierTotals,
            count: validSupplierSummaries.length
          }
        }
      };
    } catch (error) {
      logger.error('Error in getLedgerSummary:', error);
      throw error;
    }
  }

  /**
   * Get detailed transaction entries for a customer (for ledger view)
   * @param {object} queryParams - Query parameters (customerId, startDate, endDate)
   * @param {string} tenantId - Tenant ID (required)
   * @returns {Promise<object>}
   */
  async getCustomerDetailedTransactions(queryParams = {}, tenantId = null) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for getCustomerDetailedTransactions');
    }
    try {
      const { customerId, startDate, endDate } = queryParams;
      
      if (!customerId) {
        return {
          success: true,
          data: {
            entries: [],
            openingBalance: 0,
            closingBalance: 0
          }
        };
      }

      // Clamp date range
      const { start, end } = this.clampDateRange(startDate, endDate);
      
      // Get customer info
      const customer = await customerRepository.findById(customerId, { tenantId, lean: true });
      if (!customer) {
        return {
          success: true,
          data: {
            entries: [],
            openingBalance: 0,
            closingBalance: 0
          }
        };
      }

      const displayName = customer.businessName || 
                         `${customer.firstName || ''} ${customer.lastName || ''}`.trim() ||
                         customer.displayName ||
                         customer.name ||
                         'Unknown Customer';

      // Get opening balance
      let openingBalance = customer.openingBalance || customer.advanceBalance || 0;

      // Calculate opening balance up to start date
      if (start) {
        const openingSales = await Sales.find({
          customer: customerId,
          tenantId: tenantId,
          createdAt: { $lt: start },
          isDeleted: { $ne: true }
        }).lean();
        
        const openingSalesTotal = openingSales.reduce((sum, sale) => {
          return sum + (sale.pricing?.total || sale.total || 0);
        }, 0);
        
        const openingCashReceipts = await cashReceiptRepository.findAll({
          customer: customerId,
          tenantId: tenantId,
          date: { $lt: start }
        }, { lean: true });
        
        const openingCashReceiptsTotal = openingCashReceipts.reduce((sum, receipt) => {
          return sum + (receipt.amount || 0);
        }, 0);
        
        const openingBankReceipts = await bankReceiptRepository.findAll({
          customer: customerId,
          tenantId: tenantId,
          date: { $lt: start }
        }, { lean: true });
        
        const openingBankReceiptsTotal = openingBankReceipts.reduce((sum, receipt) => {
          return sum + (receipt.amount || 0);
        }, 0);
        
        openingBalance = openingBalance + openingSalesTotal - openingCashReceiptsTotal - openingBankReceiptsTotal;
      }

      const allEntries = [];

      // Build date filters
      const salesDateFilter = {};
      if (start || end) {
        salesDateFilter.createdAt = {};
        if (start) salesDateFilter.createdAt.$gte = start;
        if (end) salesDateFilter.createdAt.$lte = end;
      }

      const receiptDateFilter = {};
      if (start || end) {
        receiptDateFilter.date = {};
        if (start) receiptDateFilter.date.$gte = start;
        if (end) receiptDateFilter.date.$lte = end;
      }

      // Get Sales (Debit) - collect without calculating balance
      const periodSales = await Sales.find({
        customer: customerId,
        tenantId: tenantId,
        ...salesDateFilter,
        isDeleted: { $ne: true }
      }).sort({ createdAt: 1 }).lean();

      periodSales.forEach(sale => {
        const amount = sale.pricing?.total || sale.total || 0;
        
        allEntries.push({
          date: sale.createdAt || sale.date,
          voucherNo: sale.orderNumber || sale.voucherCode || `SL-${sale._id.toString().slice(-8)}`,
          particular: `SALE INVOICE NO: ${sale.orderNumber || sale.voucherCode || sale._id.toString().slice(-8)}`,
          debitAmount: amount,
          creditAmount: 0,
          source: 'Sale',
          sourceId: sale._id
        });
      });

      // Get Cash Receipts (Credit) - collect without calculating balance
      const periodCashReceipts = await cashReceiptRepository.findAll({
        customer: customerId,
        tenantId: tenantId,
        ...receiptDateFilter
      }, { 
        lean: true 
      });

      periodCashReceipts.forEach(receipt => {
        const amount = receipt.amount || 0;
        
        allEntries.push({
          date: receipt.date || receipt.createdAt,
          voucherNo: receipt.voucherCode || `CR-${receipt._id.toString().slice(-8)}`,
          particular: receipt.particular || 'CASH RECEIVED FROM ' + displayName.toUpperCase(),
          debitAmount: 0,
          creditAmount: amount,
          source: 'Cash Receipt',
          sourceId: receipt._id
        });
      });

      // Get Bank Receipts (Credit) - collect without calculating balance
      const periodBankReceipts = await bankReceiptRepository.findAll({
        customer: customerId,
        tenantId: tenantId,
        ...receiptDateFilter
      }, { 
        lean: true 
      });

      periodBankReceipts.forEach(receipt => {
        const amount = receipt.amount || 0;
        const bankName = receipt.bankName || 'BANK';
        
        allEntries.push({
          date: receipt.date || receipt.createdAt,
          voucherNo: receipt.voucherCode || receipt.transactionReference || `BR-${receipt._id.toString().slice(-8)}`,
          particular: receipt.particular || bankName.toUpperCase(),
          debitAmount: 0,
          creditAmount: amount,
          source: 'Bank Receipt',
          sourceId: receipt._id
        });
      });

      // Get Cash Payments (if any - for refunds/returns) - collect without calculating balance
      const periodCashPayments = await cashPaymentRepository.findAll({
        customer: customerId,
        tenantId: tenantId,
        ...receiptDateFilter
      }, { 
        lean: true 
      });

      periodCashPayments.forEach(payment => {
        const amount = payment.amount || 0;
        
        allEntries.push({
          date: payment.date || payment.createdAt,
          voucherNo: payment.voucherCode || `CP-${payment._id.toString().slice(-8)}`,
          particular: payment.particular || 'CASH PAYMENT TO ' + displayName.toUpperCase(),
          debitAmount: amount,
          creditAmount: 0,
          source: 'Cash Payment',
          sourceId: payment._id
        });
      });

      // Get Bank Payments (if any - for refunds/returns) - collect without calculating balance
      const periodBankPayments = await bankPaymentRepository.findAll({
        customer: customerId,
        tenantId: tenantId,
        ...receiptDateFilter
      }, { 
        lean: true 
      });

      periodBankPayments.forEach(payment => {
        const amount = payment.amount || 0;
        const bankName = payment.bankName || 'BANK';
        
        allEntries.push({
          date: payment.date || payment.createdAt,
          voucherNo: payment.voucherCode || payment.transactionReference || `BP-${payment._id.toString().slice(-8)}`,
          particular: payment.particular || 'TRANSFER TO ' + displayName.toUpperCase(),
          debitAmount: amount,
          creditAmount: 0,
          source: 'Bank Payment',
          sourceId: payment._id
        });
      });

      // Sort all entries by date (and time if available) BEFORE calculating balance
      allEntries.sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        // If dates are equal, use sourceId for consistent ordering
        if (dateA.getTime() === dateB.getTime()) {
          return (a.sourceId?.toString() || '').localeCompare(b.sourceId?.toString() || '');
        }
        return dateA - dateB;
      });

      // NOW calculate running balance in the correct sorted order
      let runningBalance = openingBalance;
      allEntries.forEach(entry => {
        // For customer ledger: Debit increases balance, Credit decreases balance
        runningBalance = runningBalance + (entry.debitAmount || 0) - (entry.creditAmount || 0);
        entry.balance = runningBalance;
      });

      return {
        success: true,
        data: {
          customer: {
            id: customerId,
            name: displayName,
            accountCode: customer.ledgerAccountCode || `CUST-${customerId.toString()}`
          },
          entries: allEntries,
          openingBalance,
          closingBalance: runningBalance,
          period: {
            startDate: start,
            endDate: end
          }
        }
      };
    } catch (error) {
      logger.error('Error in getCustomerDetailedTransactions:', error);
      throw error;
    }
  }

  /**
   * Get detailed transaction entries for a supplier (for ledger view)
   * @param {object} queryParams - Query parameters (supplierId, startDate, endDate)
   * @param {string} tenantId - Tenant ID (required)
   * @returns {Promise<object>}
   */
  async getSupplierDetailedTransactions(queryParams = {}, tenantId = null) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for getSupplierDetailedTransactions');
    }
    try {
      const { supplierId, startDate, endDate } = queryParams;
      
      if (!supplierId) {
        return {
          success: true,
          data: {
            entries: [],
            openingBalance: 0,
            closingBalance: 0
          }
        };
      }

      // Clamp date range
      const { start, end } = this.clampDateRange(startDate, endDate);
      
      // Get supplier info
      const supplier = await supplierRepository.findById(supplierId, { tenantId, lean: true });
      if (!supplier) {
        return {
          success: true,
          data: {
            entries: [],
            openingBalance: 0,
            closingBalance: 0
          }
        };
      }

      const displayName = supplier.companyName || 
                         supplier.contactPerson?.name ||
                         supplier.name ||
                         'Unknown Supplier';

      // Get opening balance
      let openingBalance = supplier.openingBalance || 0;

      // Calculate opening balance up to start date
      if (start) {
        const openingPurchases = await PurchaseOrder.find({
          supplier: supplierId,
          tenantId: tenantId,
          createdAt: { $lt: start },
          isDeleted: { $ne: true }
        }).lean();
        
        const openingPurchasesTotal = openingPurchases.reduce((sum, purchase) => {
          return sum + (purchase.total || 0);
        }, 0);
        
        const openingCashPayments = await cashPaymentRepository.findAll({
          supplier: supplierId,
          tenantId: tenantId,
          date: { $lt: start }
        }, { lean: true });
        
        const openingCashPaymentsTotal = openingCashPayments.reduce((sum, payment) => {
          return sum + (payment.amount || 0);
        }, 0);
        
        const openingBankPayments = await bankPaymentRepository.findAll({
          supplier: supplierId,
          tenantId: tenantId,
          date: { $lt: start }
        }, { lean: true });
        
        const openingBankPaymentsTotal = openingBankPayments.reduce((sum, payment) => {
          return sum + (payment.amount || 0);
        }, 0);
        
        // Get opening cash receipts from supplier (refunds/returns)
        const openingCashReceipts = await cashReceiptRepository.findAll({
          supplier: supplierId,
          tenantId: tenantId,
          date: { $lt: start }
        }, { lean: true });
        
        const openingCashReceiptsTotal = openingCashReceipts.reduce((sum, receipt) => {
          return sum + (receipt.amount || 0);
        }, 0);
        
        // Get opening bank receipts from supplier (refunds/returns)
        const openingBankReceipts = await bankReceiptRepository.findAll({
          supplier: supplierId,
          tenantId: tenantId,
          date: { $lt: start }
        }, { lean: true });
        
        const openingBankReceiptsTotal = openingBankReceipts.reduce((sum, receipt) => {
          return sum + (receipt.amount || 0);
        }, 0);
        
        // Opening balance = initial balance + purchases (credits) - payments (debits) - receipts (credits that decrease payables)
        openingBalance = openingBalance + openingPurchasesTotal - openingCashPaymentsTotal - openingBankPaymentsTotal - openingCashReceiptsTotal - openingBankReceiptsTotal;
      }

      const allEntries = [];

      // Build date filters
      const salesDateFilter = {};
      if (start || end) {
        salesDateFilter.createdAt = {};
        if (start) salesDateFilter.createdAt.$gte = start;
        if (end) salesDateFilter.createdAt.$lte = end;
      }

      const receiptDateFilter = {};
      if (start || end) {
        receiptDateFilter.date = {};
        if (start) receiptDateFilter.date.$gte = start;
        if (end) receiptDateFilter.date.$lte = end;
      }

      // Get Purchase Orders (Credit - increases payables) - collect without calculating balance
      const periodPurchases = await PurchaseOrder.find({
        supplier: supplierId,
        tenantId: tenantId,
        ...salesDateFilter,
        isDeleted: { $ne: true }
      }).sort({ createdAt: 1 }).lean();

      periodPurchases.forEach(purchase => {
        const amount = purchase.total || 0;
        
        allEntries.push({
          date: purchase.createdAt || purchase.orderDate,
          voucherNo: purchase.poNumber || `PO-${purchase._id.toString().slice(-8)}`,
          particular: `PURCHASE ORDER: ${purchase.poNumber || purchase._id.toString().slice(-8)}`,
          debitAmount: 0,
          creditAmount: amount,
          source: 'Purchase',
          sourceId: purchase._id
        });
      });

      // Get Cash Payments (Debit - decreases payables) - collect without calculating balance
      const periodCashPayments = await cashPaymentRepository.findAll({
        supplier: supplierId,
        tenantId: tenantId,
        ...receiptDateFilter
      }, { 
        lean: true 
      });

      periodCashPayments.forEach(payment => {
        const amount = payment.amount || 0;
        
        allEntries.push({
          date: payment.date || payment.createdAt,
          voucherNo: payment.voucherCode || `CP-${payment._id.toString().slice(-8)}`,
          particular: payment.particular || 'CASH PAYMENT TO ' + displayName.toUpperCase(),
          debitAmount: amount,
          creditAmount: 0,
          source: 'Cash Payment',
          sourceId: payment._id
        });
      });

      // Get Bank Payments (Debit - decreases payables) - collect without calculating balance
      const periodBankPayments = await bankPaymentRepository.findAll({
        supplier: supplierId,
        tenantId: tenantId,
        ...receiptDateFilter
      }, { 
        lean: true 
      });

      periodBankPayments.forEach(payment => {
        const amount = payment.amount || 0;
        const bankName = payment.bankName || 'BANK';
        
        allEntries.push({
          date: payment.date || payment.createdAt,
          voucherNo: payment.voucherCode || payment.transactionReference || `BP-${payment._id.toString().slice(-8)}`,
          particular: payment.particular || 'TRANSFER TO ' + displayName.toUpperCase(),
          debitAmount: amount,
          creditAmount: 0,
          source: 'Bank Payment',
          sourceId: payment._id
        });
      });

      // Get Cash Receipts from Supplier (Credit - decreases payables, like refunds/returns) - collect without calculating balance
      const periodCashReceipts = await cashReceiptRepository.findAll({
        supplier: supplierId,
        tenantId: tenantId,
        ...receiptDateFilter
      }, { 
        lean: true 
      });

      periodCashReceipts.forEach(receipt => {
        const amount = receipt.amount || 0;
        
        allEntries.push({
          date: receipt.date || receipt.createdAt,
          voucherNo: receipt.voucherCode || `CR-${receipt._id.toString().slice(-8)}`,
          particular: receipt.particular || 'CASH RECEIVED FROM ' + displayName.toUpperCase(),
          debitAmount: 0,
          creditAmount: amount,
          source: 'Cash Receipt',
          sourceId: receipt._id
        });
      });

      // Get Bank Receipts from Supplier (Credit - decreases payables, like refunds/returns) - collect without calculating balance
      const periodBankReceipts = await bankReceiptRepository.findAll({
        supplier: supplierId,
        tenantId: tenantId,
        ...receiptDateFilter
      }, { 
        lean: true 
      });

      periodBankReceipts.forEach(receipt => {
        const amount = receipt.amount || 0;
        const bankName = receipt.bankName || 'BANK';
        
        allEntries.push({
          date: receipt.date || receipt.createdAt,
          voucherNo: receipt.voucherCode || receipt.transactionReference || `BR-${receipt._id.toString().slice(-8)}`,
          particular: receipt.particular || 'BANK RECEIPT FROM ' + displayName.toUpperCase(),
          debitAmount: 0,
          creditAmount: amount,
          source: 'Bank Receipt',
          sourceId: receipt._id
        });
      });

      // Sort all entries by date (and time if available) BEFORE calculating balance
      allEntries.sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        // If dates are equal, use sourceId for consistent ordering
        if (dateA.getTime() === dateB.getTime()) {
          return (a.sourceId?.toString() || '').localeCompare(b.sourceId?.toString() || '');
        }
        return dateA - dateB;
      });

      // NOW calculate running balance in the correct sorted order
      // For supplier ledger: Credit increases balance (payables), Debit decreases balance
      let runningBalance = openingBalance;
      allEntries.forEach(entry => {
        runningBalance = runningBalance + (entry.creditAmount || 0) - (entry.debitAmount || 0);
        entry.balance = runningBalance;
      });

      return {
        success: true,
        data: {
          supplier: {
            id: supplierId,
            name: displayName,
            accountCode: supplier.ledgerAccountCode || `SUP-${supplierId.toString()}`
          },
          entries: allEntries,
          openingBalance,
          closingBalance: runningBalance,
          period: {
            startDate: start,
            endDate: end
          }
        }
      };
    } catch (error) {
      logger.error('Error in getSupplierDetailedTransactions:', error);
      throw error;
    }
  }
}

module.exports = new AccountLedgerService();

