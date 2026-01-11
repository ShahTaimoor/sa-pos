/**
 * Account Code Generation Service
 * 
 * STEP 9: Concurrency-safe account code generation per tenant.
 * Uses MongoDB transactions to prevent duplicate account codes.
 */

const mongoose = require('mongoose');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const logger = require('../utils/logger');

// Counter model for account code generation
const AccountCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  accountType: { type: String, required: true },
  lastCode: { type: Number, default: 0 }
}, { timestamps: true });

// Compound unique index
AccountCounterSchema.index({ tenantId: 1, accountType: 1 }, { unique: true });

const AccountCounter = mongoose.models.AccountCounter || 
  mongoose.model('AccountCounter', AccountCounterSchema);

class AccountCodeGenerationService {
  /**
   * Get account type prefix
   * @param {String} accountType - Account type
   * @returns {String} Prefix
   */
  getAccountTypePrefix(accountType) {
    const prefixes = {
      asset: '1',
      liability: '2',
      equity: '3',
      revenue: '4',
      expense: '5'
    };
    return prefixes[accountType] || '9';
  }

  /**
   * Get account code range for type
   * @param {String} accountType - Account type
   * @returns {Object} { start, end }
   */
  getAccountCodeRange(accountType) {
    const ranges = {
      asset: { start: 1000, end: 1999 },
      liability: { start: 2000, end: 2999 },
      equity: { start: 3000, end: 3999 },
      revenue: { start: 4000, end: 4999 },
      expense: { start: 5000, end: 5999 }
    };
    return ranges[accountType] || { start: 9000, end: 9999 };
  }

  /**
   * Generate next account code for a tenant and account type
   * Uses MongoDB transactions for concurrency safety
   * @param {ObjectId} tenantId - Tenant ID
   * @param {String} accountType - Account type
   * @param {Object} options - Options (session for transactions)
   * @returns {Promise<String>} Generated account code
   */
  async generateAccountCode(tenantId, accountType, options = {}) {
    const { session = null } = options;
    const useTransaction = !session;
    let transactionSession = session;

    if (useTransaction) {
      transactionSession = await mongoose.startSession();
      transactionSession.startTransaction();
    }

    try {
      const counterKey = `account_${tenantId}_${accountType}`;
      const range = this.getAccountCodeRange(accountType);

      // Find and increment counter atomically
      const counter = await AccountCounter.findOneAndUpdate(
        { _id: counterKey, tenantId, accountType },
        { $inc: { lastCode: 1 } },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          session: transactionSession
        }
      );

      // Calculate account code
      const codeNumber = range.start + counter.lastCode;
      
      // Check if we've exceeded the range
      if (codeNumber > range.end) {
        throw new Error(
          `Account code range exhausted for ${accountType}. ` +
          `Maximum ${range.end - range.start} accounts allowed.`
        );
      }

      const accountCode = String(codeNumber);

      // Verify uniqueness (double-check) - only check non-deleted accounts
      const exists = await ChartOfAccounts.findOne(
        { tenantId, accountCode, isDeleted: false },
        { session: transactionSession }
      );

      if (exists) {
        // Code collision - try next number
        logger.warn(`Account code collision detected: ${accountCode}, trying next number`, {
          tenantId,
          accountType,
          accountCode
        });

        // Increment again and try
        const nextCounter = await AccountCounter.findOneAndUpdate(
          { _id: counterKey, tenantId, accountType },
          { $inc: { lastCode: 1 } },
          { new: true, session: transactionSession }
        );

        const nextCodeNumber = range.start + nextCounter.lastCode;
        if (nextCodeNumber > range.end) {
          throw new Error('Account code range exhausted after collision resolution');
        }

        const nextAccountCode = String(nextCodeNumber);
        
        // Verify this one doesn't exist - only check non-deleted accounts
        const nextExists = await ChartOfAccounts.findOne(
          { tenantId, accountCode: nextAccountCode, isDeleted: false },
          { session: transactionSession }
        );

        if (nextExists) {
          throw new Error('Multiple account code collisions detected. Manual intervention required.');
        }

        if (useTransaction) {
          await transactionSession.commitTransaction();
        }

        return nextAccountCode;
      }

      if (useTransaction) {
        await transactionSession.commitTransaction();
      }

      return accountCode;
    } catch (error) {
      if (useTransaction) {
        await transactionSession.abortTransaction();
      }
      logger.error('Error generating account code:', error);
      throw error;
    } finally {
      if (useTransaction && transactionSession) {
        transactionSession.endSession();
      }
    }
  }

  /**
   * Reset counter for a tenant and account type (admin only)
   * @param {ObjectId} tenantId - Tenant ID
   * @param {String} accountType - Account type
   * @param {Number} resetTo - Reset counter to this value
   * @returns {Promise<void>}
   */
  async resetCounter(tenantId, accountType, resetTo = 0) {
    const counterKey = `account_${tenantId}_${accountType}`;
    
    await AccountCounter.updateOne(
      { _id: counterKey, tenantId, accountType },
      { $set: { lastCode: resetTo } },
      { upsert: true }
    );

    logger.info(`Reset account code counter for ${accountType}`, {
      tenantId,
      accountType,
      resetTo
    });
  }

  /**
   * Get current counter value
   * @param {ObjectId} tenantId - Tenant ID
   * @param {String} accountType - Account type
   * @returns {Promise<Number>} Current counter value
   */
  async getCurrentCounter(tenantId, accountType) {
    const counterKey = `account_${tenantId}_${accountType}`;
    const counter = await AccountCounter.findOne({ _id: counterKey, tenantId, accountType });
    return counter ? counter.lastCode : 0;
  }
}

module.exports = new AccountCodeGenerationService();
