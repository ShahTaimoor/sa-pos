const transactionRepository = require('../repositories/TransactionRepository');
const chartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');

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
   * @returns {Promise<object>} - MongoDB filter object
   */
  async buildFilter(queryParams) {
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
      const accountCodes = await chartOfAccountsRepository.getAccountCodesByName(queryParams.accountName);
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
   * @returns {Promise<object>}
   */
  async getAccountLedger(queryParams) {
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 100;
    const summary = queryParams.summary === 'true';

    const filter = await this.buildFilter(queryParams);

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
      accountInfo = await chartOfAccountsRepository.findByAccountCode(queryParams.accountCode);
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
}

module.exports = new AccountLedgerService();

