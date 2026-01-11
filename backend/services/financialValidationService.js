const ChartOfAccounts = require('../models/ChartOfAccounts');
const Transaction = require('../models/Transaction');
const BalanceSheet = require('../models/BalanceSheet');
const logger = require('../utils/logger');

/**
 * Financial Validation Service
 * Real-time validation of financial data and balance sheet reconciliation
 */
class FinancialValidationService {
  /**
   * Validate balance sheet equation: Assets = Liabilities + Equity
   * @param {Date} asOfDate - Date to validate as of
   * @param {String} tenantId - Tenant ID (required)
   */
  async validateBalanceSheetEquation(asOfDate = new Date(), tenantId = null) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for validateBalanceSheetEquation');
    }
    
    try {
      const assets = await this.calculateTotalAssets(asOfDate, tenantId);
      const liabilities = await this.calculateTotalLiabilities(asOfDate, tenantId);
      const equity = await this.calculateTotalEquity(asOfDate, tenantId);
      
      const totalLiabilitiesAndEquity = liabilities + equity;
      const difference = Math.abs(assets - totalLiabilitiesAndEquity);
      
      const balanced = difference <= 0.01; // Allow small rounding differences
      
      return {
        balanced,
        assets,
        liabilities,
        equity,
        totalLiabilitiesAndEquity,
        difference,
        asOfDate,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Error validating balance sheet equation:', error);
      throw error;
    }
  }
  
  /**
   * Calculate total assets
   * @param {Date} asOfDate - Date to calculate as of
   * @param {String} tenantId - Tenant ID (required)
   */
  async calculateTotalAssets(asOfDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateTotalAssets');
    }
    
    const assetAccounts = await ChartOfAccounts.find({
      tenantId: tenantId,
      accountType: 'asset',
      isActive: true,
      isDeleted: false
    });
    
    let totalAssets = 0;
    
    for (const account of assetAccounts) {
      const balance = await this.calculateAccountBalance(account.accountCode, asOfDate, tenantId);
      totalAssets += balance;
    }
    
    return totalAssets;
  }
  
  /**
   * Calculate total liabilities
   * @param {Date} asOfDate - Date to calculate as of
   * @param {String} tenantId - Tenant ID (required)
   */
  async calculateTotalLiabilities(asOfDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateTotalLiabilities');
    }
    
    const liabilityAccounts = await ChartOfAccounts.find({
      tenantId: tenantId,
      accountType: 'liability',
      isActive: true,
      isDeleted: false
    });
    
    let totalLiabilities = 0;
    
    for (const account of liabilityAccounts) {
      const balance = await this.calculateAccountBalance(account.accountCode, asOfDate, tenantId);
      totalLiabilities += balance;
    }
    
    return totalLiabilities;
  }
  
  /**
   * Calculate total equity
   * @param {Date} asOfDate - Date to calculate as of
   * @param {String} tenantId - Tenant ID (required)
   */
  async calculateTotalEquity(asOfDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateTotalEquity');
    }
    
    const equityAccounts = await ChartOfAccounts.find({
      tenantId: tenantId,
      accountType: 'equity',
      isActive: true,
      isDeleted: false
    });
    
    let totalEquity = 0;
    
    for (const account of equityAccounts) {
      const balance = await this.calculateAccountBalance(account.accountCode, asOfDate, tenantId);
      totalEquity += balance;
    }
    
    return totalEquity;
  }
  
  /**
   * Calculate account balance as of specific date
   * @param {String} accountCode - Account code
   * @param {Date} asOfDate - Date to calculate as of
   * @param {String} tenantId - Tenant ID (required)
   */
  async calculateAccountBalance(accountCode, asOfDate, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for calculateAccountBalance');
    }
    
    const account = await ChartOfAccounts.findOne({ 
      accountCode,
      tenantId: tenantId,
      isDeleted: false
    });
    if (!account) return 0;
    
    const transactions = await Transaction.find({
      accountCode,
      tenantId: tenantId,
      status: 'completed',
      createdAt: { $lte: asOfDate }
    });
    
    let balance = 0;
    
    if (account.accountType === 'asset' || account.accountType === 'expense') {
      // Assets and expenses: Debits increase, Credits decrease
      balance = transactions.reduce((sum, t) => {
        return sum + (t.debitAmount || 0) - (t.creditAmount || 0);
      }, 0);
    } else {
      // Liabilities, equity, revenue: Credits increase, Debits decrease
      balance = transactions.reduce((sum, t) => {
        return sum + (t.creditAmount || 0) - (t.debitAmount || 0);
      }, 0);
    }
    
    return balance;
  }
  
  /**
   * Validate all account balances
   * @param {String} tenantId - Tenant ID (required)
   */
  async validateAllAccountBalances(tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for validateAllAccountBalances');
    }
    
    const accounts = await ChartOfAccounts.find({ 
      tenantId: tenantId,
      isActive: true,
      isDeleted: false 
    });
    const issues = [];
    
    for (const account of accounts) {
      try {
        // Calculate balance from transactions
        const calculatedBalance = await this.calculateAccountBalance(
          account.accountCode,
          new Date(),
          tenantId
        );
        
        const storedBalance = account.currentBalance || 0;
        const difference = Math.abs(calculatedBalance - storedBalance);
        
        if (difference > 0.01) {
          issues.push({
            accountCode: account.accountCode,
            accountName: account.accountName,
            accountType: account.accountType,
            calculatedBalance,
            storedBalance,
            difference,
            severity: difference > 100 ? 'high' : 'medium'
          });
        }
      } catch (error) {
        issues.push({
          accountCode: account.accountCode,
          accountName: account.accountName,
          error: error.message,
          severity: 'high'
        });
      }
    }
    
    return issues;
  }
  
  /**
   * Validate transaction before creation
   * @param {Object} transaction - Transaction to validate
   * @param {String} tenantId - Tenant ID (required)
   */
  async validateTransaction(transaction, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for validateTransaction');
    }
    
    const issues = [];
    
    // Validate account exists and is active
    if (transaction.accountCode) {
      const account = await ChartOfAccounts.findOne({
        accountCode: transaction.accountCode,
        tenantId: tenantId,
        isActive: true,
        isDeleted: false
      });
      
      if (!account) {
        issues.push({
          type: 'invalid_account',
          accountCode: transaction.accountCode,
          severity: 'high'
        });
      } else {
        // Validate account allows direct posting
        if (!account.allowDirectPosting) {
          issues.push({
            type: 'account_not_allows_posting',
            accountCode: transaction.accountCode,
            accountName: account.accountName,
            severity: 'high'
          });
        }
      }
    }
    
    // Validate amounts are non-negative
    if (transaction.debitAmount !== undefined && transaction.debitAmount < 0) {
      issues.push({
        type: 'negative_debit_amount',
        debitAmount: transaction.debitAmount,
        severity: 'high'
      });
    }
    
    if (transaction.creditAmount !== undefined && transaction.creditAmount < 0) {
      issues.push({
        type: 'negative_credit_amount',
        creditAmount: transaction.creditAmount,
        severity: 'high'
      });
    }
    
    // Validate at least one amount is > 0
    const debitAmount = transaction.debitAmount || 0;
    const creditAmount = transaction.creditAmount || 0;
    
    if (debitAmount === 0 && creditAmount === 0) {
      issues.push({
        type: 'zero_amounts',
        transactionId: transaction.transactionId,
        severity: 'high'
      });
    }
    
    // Validate not both > 0
    if (debitAmount > 0 && creditAmount > 0) {
      issues.push({
        type: 'both_amounts_positive',
        debitAmount,
        creditAmount,
        severity: 'high'
      });
    }
    
    return issues;
  }
  
  /**
   * Validate journal entry balances
   */
  async validateJournalEntryBalances(entries) {
    const issues = [];
    
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      issues.push({
        type: 'no_entries',
        severity: 'high'
      });
      return issues;
    }
    
    const totalDebits = entries.reduce((sum, e) => sum + (e.debitAmount || 0), 0);
    const totalCredits = entries.reduce((sum, e) => sum + (e.creditAmount || 0), 0);
    const difference = Math.abs(totalDebits - totalCredits);
    
    if (difference > 0.01) {
      issues.push({
        type: 'unbalanced_entry',
        totalDebits,
        totalCredits,
        difference,
        severity: 'high'
      });
    }
    
    return issues;
  }
  
  /**
   * Schedule real-time validation
   */
  scheduleValidation() {
    const cron = require('node-cron');
    
    // Validate balance sheet equation hourly
    // NOTE: This scheduled job needs tenantId - should be called per tenant
    cron.schedule('0 * * * *', async () => {
      try {
        // This needs to be called per tenant - skipping for now
        // TODO: Implement per-tenant validation by iterating through all tenants
        // const result = await this.validateBalanceSheetEquation(new Date(), tenantId);
        logger.warn('Scheduled balance sheet validation requires tenantId - skipping');
        
        // Note: result is commented out, so we can't check if balanced
        // TODO: When implementing per-tenant validation, uncomment and check result
        // if (!result.balanced) {
        //   // Alert administrators
        //   logger.error('Balance sheet imbalance detected:', result);
        //   
        //   // TODO: Send alert
        //   // await sendAlert({
        //   //   type: 'balance_sheet_imbalance',
        //   //   severity: 'critical',
        //   //   data: result
        //   // });
        // }
      } catch (error) {
        logger.error('Error in scheduled balance sheet validation:', error);
      }
    });
    
    // Validate all account balances daily at 1 AM
    cron.schedule('0 1 * * *', async () => {
      try {
        const issues = await this.validateAllAccountBalances();
        
        if (issues.length > 0) {
          const criticalIssues = issues.filter(i => i.severity === 'high');
          
          if (criticalIssues.length > 0) {
            logger.error('Account balance mismatches detected:', criticalIssues);
            
            // TODO: Send alert
            // await sendAlert({
            //   type: 'account_balance_mismatch',
            //   severity: 'high',
            //   issues: criticalIssues
            // });
          }
        }
      } catch (error) {
        logger.error('Error in scheduled account balance validation:', error);
      }
    });
  }
}

module.exports = new FinancialValidationService();

