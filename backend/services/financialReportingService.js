/**
 * Financial Reporting Service
 * 
 * Generates Profit & Loss and Balance Sheet reports
 * strictly from journal entries (single source of truth)
 */

const JournalEntry = require('../models/JournalEntry');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const logger = require('../utils/logger');

class FinancialReportingService {
  /**
   * Generate Profit & Loss Statement from journal entries
   * @param {Object} filters - Filter criteria
   * @returns {Promise<Object>}
   */
  async generateProfitAndLoss(filters = {}) {
    const {
      tenantId,
      startDate,
      endDate
    } = filters;

    if (!tenantId) {
      throw new Error('tenantId is required');
    }

    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    // Validate date range (max 2 years)
    const maxRange = 2 * 365 * 24 * 60 * 60 * 1000;
    const range = new Date(endDate) - new Date(startDate);
    if (range > maxRange) {
      throw new Error('Date range cannot exceed 2 years');
    }

    try {
      // Get all posted journal entries in date range
      const journalEntries = await JournalEntry.find({
        tenantId,
        status: 'posted',
        entryDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }).populate('entries.account', 'accountCode accountName accountType accountCategory');

      // Get chart of accounts for reference
      const accounts = await ChartOfAccounts.find({
        tenantId,
        isActive: true,
        isDeleted: false
      });

      // Initialize account balances
      const accountBalances = {};
      accounts.forEach(account => {
        accountBalances[account.accountCode] = {
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountType: account.accountType,
          accountCategory: account.accountCategory,
          debit: 0,
          credit: 0,
          balance: 0
        };
      });

      // Process journal entries
      journalEntries.forEach(entry => {
        entry.entries.forEach(line => {
          const accountCode = line.accountCode;
          if (accountBalances[accountCode]) {
            accountBalances[accountCode].debit += line.debit || 0;
            accountBalances[accountCode].credit += line.credit || 0;
          }
        });
      });

      // Calculate balances based on account type
      Object.keys(accountBalances).forEach(accountCode => {
        const account = accountBalances[accountCode];
        const accountObj = accounts.find(a => a.accountCode === accountCode);
        
        if (accountObj) {
          // Calculate balance based on normal balance
          if (accountObj.normalBalance === 'debit') {
            account.balance = account.debit - account.credit;
          } else {
            account.balance = account.credit - account.debit;
          }
        }
      });

      // Organize by account type
      const revenue = [];
      const expenses = [];
      const cogs = [];

      Object.values(accountBalances).forEach(account => {
        if (account.accountType === 'revenue' && account.balance !== 0) {
          revenue.push(account);
        } else if (account.accountType === 'expense') {
          if (account.accountCategory === 'cost_of_goods_sold') {
            cogs.push(account);
          } else {
            expenses.push(account);
          }
        }
      });

      // Calculate totals
      const totalRevenue = revenue.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
      const totalCOGS = cogs.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
      const totalExpenses = expenses.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
      const grossProfit = totalRevenue - totalCOGS;
      const netIncome = grossProfit - totalExpenses;

      return {
        period: {
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        },
        revenue: {
          items: revenue.sort((a, b) => b.balance - a.balance),
          total: totalRevenue
        },
        costOfGoodsSold: {
          items: cogs.sort((a, b) => b.balance - a.balance),
          total: totalCOGS
        },
        grossProfit,
        expenses: {
          items: expenses.sort((a, b) => b.balance - a.balance),
          total: totalExpenses
        },
        netIncome,
        generatedAt: new Date()
      };
    } catch (error) {
      logger.error('Error generating Profit & Loss statement:', error);
      throw error;
    }
  }

  /**
   * Generate Balance Sheet from journal entries
   * @param {Object} filters - Filter criteria
   * @returns {Promise<Object>}
   */
  async generateBalanceSheet(filters = {}) {
    const {
      tenantId,
      asOfDate
    } = filters;

    if (!tenantId) {
      throw new Error('tenantId is required');
    }

    const endDate = asOfDate || new Date();

    try {
      // Get all posted journal entries up to asOfDate
      const journalEntries = await JournalEntry.find({
        tenantId,
        status: 'posted',
        entryDate: {
          $lte: new Date(endDate)
        }
      }).populate('entries.account', 'accountCode accountName accountType accountCategory');

      // Get chart of accounts
      const accounts = await ChartOfAccounts.find({
        tenantId,
        isActive: true,
        isDeleted: false
      });

      // Initialize account balances
      const accountBalances = {};
      accounts.forEach(account => {
        accountBalances[account.accountCode] = {
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountType: account.accountType,
          accountCategory: account.accountCategory,
          debit: 0,
          credit: 0,
          balance: 0
        };
      });

      // Process journal entries
      journalEntries.forEach(entry => {
        entry.entries.forEach(line => {
          const accountCode = line.accountCode;
          if (accountBalances[accountCode]) {
            accountBalances[accountCode].debit += line.debit || 0;
            accountBalances[accountCode].credit += line.credit || 0;
          }
        });
      });

      // Calculate balances
      Object.keys(accountBalances).forEach(accountCode => {
        const account = accountBalances[accountCode];
        const accountObj = accounts.find(a => a.accountCode === accountCode);
        
        if (accountObj) {
          if (accountObj.normalBalance === 'debit') {
            account.balance = account.debit - account.credit;
          } else {
            account.balance = account.credit - account.debit;
          }
        }
      });

      // Organize by account type
      const assets = {
        current: [],
        fixed: [],
        other: []
      };
      const liabilities = {
        current: [],
        longTerm: []
      };
      const equity = [];

      Object.values(accountBalances).forEach(account => {
        if (account.accountType === 'asset' && account.balance !== 0) {
          if (account.accountCategory === 'current_assets' || account.accountCategory === 'inventory') {
            assets.current.push(account);
          } else if (account.accountCategory === 'fixed_assets') {
            assets.fixed.push(account);
          } else {
            assets.other.push(account);
          }
        } else if (account.accountType === 'liability' && account.balance !== 0) {
          if (account.accountCategory === 'current_liabilities') {
            liabilities.current.push(account);
          } else {
            liabilities.longTerm.push(account);
          }
        } else if (account.accountType === 'equity' && account.balance !== 0) {
          equity.push(account);
        }
      });

      // Calculate totals
      const totalCurrentAssets = assets.current.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
      const totalFixedAssets = assets.fixed.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
      const totalOtherAssets = assets.other.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
      const totalAssets = totalCurrentAssets + totalFixedAssets + totalOtherAssets;

      const totalCurrentLiabilities = liabilities.current.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
      const totalLongTermLiabilities = liabilities.longTerm.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
      const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;

      const totalEquity = equity.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
      const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

      // Validate: Assets = Liabilities + Equity
      const difference = Math.abs(totalAssets - totalLiabilitiesAndEquity);
      if (difference > 0.01) {
        logger.warn(`Balance sheet does not balance. Difference: ${difference}`, {
          tenantId,
          asOfDate,
          totalAssets,
          totalLiabilitiesAndEquity
        });
      }

      return {
        asOfDate: new Date(endDate),
        assets: {
          current: {
            items: assets.current.sort((a, b) => b.balance - a.balance),
            total: totalCurrentAssets
          },
          fixed: {
            items: assets.fixed.sort((a, b) => b.balance - a.balance),
            total: totalFixedAssets
          },
          other: {
            items: assets.other.sort((a, b) => b.balance - a.balance),
            total: totalOtherAssets
          },
          total: totalAssets
        },
        liabilities: {
          current: {
            items: liabilities.current.sort((a, b) => b.balance - a.balance),
            total: totalCurrentLiabilities
          },
          longTerm: {
            items: liabilities.longTerm.sort((a, b) => b.balance - a.balance),
            total: totalLongTermLiabilities
          },
          total: totalLiabilities
        },
        equity: {
          items: equity.sort((a, b) => b.balance - a.balance),
          total: totalEquity
        },
        totalLiabilitiesAndEquity,
        isBalanced: difference <= 0.01,
        balanceDifference: difference,
        generatedAt: new Date()
      };
    } catch (error) {
      logger.error('Error generating Balance Sheet:', error);
      throw error;
    }
  }

  /**
   * Get account summary for dashboard
   * @param {Object} filters - Filter criteria
   * @returns {Promise<Object>}
   */
  async getAccountSummary(filters = {}) {
    const {
      tenantId,
      startDate,
      endDate
    } = filters;

    if (!tenantId) {
      throw new Error('tenantId is required');
    }

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
    const end = endDate ? new Date(endDate) : new Date();

    try {
      const [pl, balanceSheet] = await Promise.all([
        this.generateProfitAndLoss({ tenantId, startDate: start, endDate: end }),
        this.generateBalanceSheet({ tenantId, asOfDate: end })
      ]);

      return {
        period: {
          startDate: start,
          endDate: end
        },
        profitAndLoss: {
          totalRevenue: pl.revenue.total,
          totalCOGS: pl.costOfGoodsSold.total,
          grossProfit: pl.grossProfit,
          totalExpenses: pl.expenses.total,
          netIncome: pl.netIncome
        },
        balanceSheet: {
          totalAssets: balanceSheet.assets.total,
          totalLiabilities: balanceSheet.liabilities.total,
          totalEquity: balanceSheet.equity.total
        },
        generatedAt: new Date()
      };
    } catch (error) {
      logger.error('Error generating account summary:', error);
      throw error;
    }
  }
}

module.exports = new FinancialReportingService();

