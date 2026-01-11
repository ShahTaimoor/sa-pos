/**
 * Account Balance Service
 * 
 * STEP 2: Calculates account balances from Journal Entries (single source of truth).
 * currentBalance in ChartOfAccounts is a cached/computed field, not directly mutated.
 */

const mongoose = require('mongoose');
const JournalEntry = require('../models/JournalEntry');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const ChartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');
const logger = require('../utils/logger');

class AccountBalanceService {
  /**
   * Calculate account balance from journal entries
   * @param {String} accountCode - Account code
   * @param {ObjectId} tenantId - Tenant ID
   * @param {Date} asOfDate - Calculate balance as of this date (null = current)
   * @returns {Promise<Number>} Account balance
   */
  async calculateAccountBalance(accountCode, tenantId, asOfDate = null) {
    const filter = {
      tenantId,
      'entries.accountCode': accountCode,
      status: 'posted'
    };

    if (asOfDate) {
      filter.entryDate = { $lte: asOfDate };
    }

    // Get all journal entries affecting this account
    const journalEntries = await JournalEntry.find(filter)
      .select('entries entryDate')
      .sort({ entryDate: 1, createdAt: 1 })
      .lean();

    // Get account to determine normal balance
    const account = await ChartOfAccountsRepository.findOne({
      tenantId,
      accountCode
    });

    if (!account) {
      throw new Error(`Account ${accountCode} not found`);
    }

    let balance = 0;

    // Calculate balance from journal entries
    journalEntries.forEach(entry => {
      entry.entries.forEach(line => {
        if (line.accountCode === accountCode) {
          if (account.normalBalance === 'debit') {
            // For debit-normal accounts: debits increase, credits decrease
            balance += (line.debit || 0) - (line.credit || 0);
          } else {
            // For credit-normal accounts: credits increase, debits decrease
            balance += (line.credit || 0) - (line.debit || 0);
          }
        }
      });
    });

    // Round to 2 decimal places
    return Math.round((balance + Number.EPSILON) * 100) / 100;
  }

  /**
   * Calculate parent account balance (sum of all child accounts)
   * @param {ObjectId} parentAccountId - Parent account ID
   * @param {ObjectId} tenantId - Tenant ID
   * @param {Date} asOfDate - Calculate balance as of this date
   * @returns {Promise<Number>} Parent account balance
   */
  async calculateParentAccountBalance(parentAccountId, tenantId, asOfDate = null) {
    const children = await ChartOfAccountsRepository.findAll({
      tenantId,
      parentAccount: parentAccountId,
      isActive: true,
      isDeleted: false
    });

    let totalBalance = 0;

    for (const child of children) {
      const childBalance = await this.calculateAccountBalance(
        child.accountCode,
        tenantId,
        asOfDate
      );
      totalBalance += childBalance;
    }

    return Math.round((totalBalance + Number.EPSILON) * 100) / 100;
  }

  /**
   * Recalculate and cache balance for an account
   * @param {String} accountCode - Account code
   * @param {ObjectId} tenantId - Tenant ID
   * @param {Object} options - Options (session for transactions)
   * @returns {Promise<Number>} Updated balance
   */
  async recalculateAndCacheBalance(accountCode, tenantId, options = {}) {
    const { session = null } = options;

    const balance = await this.calculateAccountBalance(accountCode, tenantId);

    // Update cached balance
    const updateData = {
      currentBalance: balance,
      balanceLastCalculated: new Date()
    };

    if (session) {
      await ChartOfAccounts.updateOne(
        { tenantId, accountCode, isDeleted: false },
        { $set: updateData },
        { session }
      );
    } else {
      await ChartOfAccounts.updateOne(
        { tenantId, accountCode, isDeleted: false },
        { $set: updateData }
      );
    }

    logger.debug(`Recalculated balance for account ${accountCode}: ${balance}`, {
      tenantId,
      accountCode,
      balance
    });

    return balance;
  }

  /**
   * Recalculate balances for multiple accounts
   * @param {Array<String>} accountCodes - Account codes
   * @param {ObjectId} tenantId - Tenant ID
   * @param {Object} options - Options
   * @returns {Promise<Object>} Map of accountCode to balance
   */
  async recalculateBalances(accountCodes, tenantId, options = {}) {
    const balances = {};

    for (const accountCode of accountCodes) {
      try {
        balances[accountCode] = await this.recalculateAndCacheBalance(
          accountCode,
          tenantId,
          options
        );
      } catch (error) {
        logger.error(`Error recalculating balance for ${accountCode}:`, error);
        balances[accountCode] = null;
      }
    }

    return balances;
  }

  /**
   * Recalculate all account balances for a tenant
   * @param {ObjectId} tenantId - Tenant ID
   * @param {Object} options - Options
   * @returns {Promise<Object>} Summary of recalculation
   */
  async recalculateAllBalances(tenantId, options = {}) {
    const accounts = await ChartOfAccountsRepository.findAll({
      tenantId,
      isActive: true,
      isDeleted: false
    });

    const results = {
      total: accounts.length,
      successful: 0,
      failed: 0,
      balances: {}
    };

    for (const account of accounts) {
      try {
        // Skip parent accounts - they're calculated from children
        if (!account.allowDirectPosting && account.parentAccount === null) {
          const balance = await this.calculateParentAccountBalance(
            account._id,
            tenantId
          );
          results.balances[account.accountCode] = balance;
        } else {
          const balance = await this.recalculateAndCacheBalance(
            account.accountCode,
            tenantId,
            options
          );
          results.balances[account.accountCode] = balance;
        }
        results.successful++;
      } catch (error) {
        logger.error(`Error recalculating balance for ${account.accountCode}:`, error);
        results.failed++;
      }
    }

    logger.info(`Recalculated balances for ${results.successful} accounts`, {
      tenantId,
      results
    });

    return results;
  }

  /**
   * Invalidate balance cache for accounts affected by a journal entry
   * @param {JournalEntry} journalEntry - Journal entry
   * @param {Object} options - Options
   * @returns {Promise<void>}
   */
  async invalidateBalanceCache(journalEntry, options = {}) {
    const { session = null } = options;

    // Get unique account codes from journal entry
    const accountCodes = [...new Set(
      journalEntry.entries.map(e => e.accountCode)
    )];

    // Mark balances as needing recalculation
    const updateData = {
      balanceLastCalculated: null
    };

    if (session) {
      await ChartOfAccounts.updateMany(
        {
          tenantId: journalEntry.tenantId,
          accountCode: { $in: accountCodes },
          isDeleted: false
        },
        { $set: updateData },
        { session }
      );
    } else {
      await ChartOfAccounts.updateMany(
        {
          tenantId: journalEntry.tenantId,
          accountCode: { $in: accountCodes },
          isDeleted: false
        },
        { $set: updateData }
      );
    }
  }
}

module.exports = new AccountBalanceService();
