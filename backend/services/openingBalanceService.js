/**
 * Opening Balance Service
 * 
 * STEP 1: Creates opening balance journal entries using double-entry accounting.
 * Opening balances are NOT set directly on currentBalance field.
 * Instead, they create proper journal entries that can be audited.
 */

const mongoose = require('mongoose');
const JournalEntry = require('../models/JournalEntry');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const ChartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');
const journalEntryService = require('./journalEntryService');
const logger = require('../utils/logger');

class OpeningBalanceService {
  /**
   * Get or create Opening Balance Equity account
   * @param {ObjectId} tenantId - Tenant ID
   * @returns {Promise<ChartOfAccounts>}
   */
  async getOrCreateOpeningBalanceEquity(tenantId) {
    let equityAccount = await ChartOfAccountsRepository.findOne({
      tenantId,
      accountCode: '3000',
      accountName: /opening.*balance.*equity/i,
      isDeleted: false
    });

    if (!equityAccount) {
      // Create Opening Balance Equity account
      equityAccount = await ChartOfAccountsRepository.create({
        tenantId,
        accountCode: '3000',
        accountName: 'Opening Balance Equity',
        accountType: 'equity',
        accountCategory: 'owner_equity',
        normalBalance: 'credit',
        description: 'Equity account for opening balances',
        isSystemAccount: true,
        accountOrigin: 'system',
        isProtected: true,
        allowDirectPosting: true,
        isActive: true
      });
    }

    return equityAccount;
  }

  /**
   * Create opening balance journal entry for a single account
   * @param {Object} params - Parameters
   * @param {ObjectId} params.accountId - Account ID
   * @param {Number} params.amount - Opening balance amount
   * @param {Date} params.entryDate - Entry date (usually fiscal year start)
   * @param {ObjectId} params.tenantId - Tenant ID
   * @param {ObjectId} params.userId - User ID creating the entry
   * @param {Object} options - Options (session for transactions)
   * @returns {Promise<JournalEntry>}
   */
  async createOpeningBalanceEntry(params, options = {}) {
    const { accountId, amount, entryDate, tenantId, userId } = params;
    const { session = null } = options;

    if (!accountId || amount === undefined || !tenantId || !userId) {
      throw new Error('Account ID, amount, tenant ID, and user ID are required');
    }

    if (amount === 0) {
      throw new Error('Opening balance amount cannot be zero');
    }

    // Get the account (with tenantId validation)
    const account = await ChartOfAccountsRepository.findOne({
      _id: accountId,
      tenantId: tenantId
    });
    if (!account) {
      throw new Error('Account not found or does not belong to this tenant');
    }

    // Check if opening balance already exists
    const existingEntry = await JournalEntry.findOne({
      tenantId,
      referenceType: 'opening_balance',
      'entries.account': accountId,
      status: 'posted'
    });

    if (existingEntry) {
      throw new Error(`Opening balance already exists for account ${account.accountCode}. Use adjustment entry to modify.`);
    }

    // Get or create Opening Balance Equity account
    const equityAccount = await this.getOrCreateOpeningBalanceEquity(tenantId);

    // Determine debit/credit based on account normal balance
    const entries = [];
    
    if (account.normalBalance === 'debit') {
      // Asset account: Debit the asset, Credit equity
      entries.push({
        account: account._id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        debit: Math.abs(amount),
        credit: 0,
        description: `Opening balance for ${account.accountName}`
      });
      entries.push({
        account: equityAccount._id,
        accountCode: equityAccount.accountCode,
        accountName: equityAccount.accountName,
        debit: 0,
        credit: Math.abs(amount),
        description: `Opening balance equity for ${account.accountName}`
      });
    } else {
      // Liability/Equity account: Credit the account, Debit equity
      entries.push({
        account: account._id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        debit: 0,
        credit: Math.abs(amount),
        description: `Opening balance for ${account.accountName}`
      });
      entries.push({
        account: equityAccount._id,
        accountCode: equityAccount.accountCode,
        accountName: equityAccount.accountName,
        debit: Math.abs(amount),
        credit: 0,
        description: `Opening balance equity for ${account.accountName}`
      });
    }

    // Create journal entry
    const journalEntryData = {
      tenantId,
      entryDate: entryDate || new Date(),
      referenceType: 'opening_balance',
      referenceId: account._id,
      referenceNumber: `OB-${account.accountCode}`,
      entries,
      description: `Opening balance entry for ${account.accountName} (${account.accountCode})`,
      createdBy: userId,
      metadata: {
        isOpeningEntry: true,
        accountCode: account.accountCode,
        accountName: account.accountName
      }
    };

    const journalEntry = await journalEntryService.createJournalEntry(
      journalEntryData,
      { session }
    );

    // Update account opening balance (for reference only, actual balance from journal entries)
    account.openingBalance = Math.abs(amount);
    if (session) {
      await account.save({ session });
    } else {
      await account.save();
    }

    logger.info(`Created opening balance entry for account ${account.accountCode}`, {
      tenantId,
      accountId: account._id,
      accountCode: account.accountCode,
      amount
    });

    return journalEntry;
  }

  /**
   * Create opening balance entries for multiple accounts
   * @param {Array} accounts - Array of { accountId, amount, entryDate? }
   * @param {ObjectId} tenantId - Tenant ID
   * @param {ObjectId} userId - User ID
   * @param {Object} options - Options
   * @returns {Promise<Array<JournalEntry>>}
   */
  async createBulkOpeningBalances(accounts, tenantId, userId, options = {}) {
    const { session = null } = options;
    const journalEntries = [];

    // Use transaction if not provided
    const useTransaction = !session;
    let transactionSession = session;

    if (useTransaction) {
      transactionSession = await mongoose.startSession();
      transactionSession.startTransaction();
    }

    try {
      for (const accountData of accounts) {
        const entry = await this.createOpeningBalanceEntry(
          {
            accountId: accountData.accountId,
            amount: accountData.amount,
            entryDate: accountData.entryDate,
            tenantId,
            userId
          },
          { session: transactionSession }
        );
        journalEntries.push(entry);
      }

      if (useTransaction) {
        await transactionSession.commitTransaction();
      }

      return journalEntries;
    } catch (error) {
      if (useTransaction) {
        await transactionSession.abortTransaction();
      }
      throw error;
    } finally {
      if (useTransaction && transactionSession) {
        transactionSession.endSession();
      }
    }
  }
}

module.exports = new OpeningBalanceService();
