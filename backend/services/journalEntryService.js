/**
 * Journal Entry Service
 * 
 * Creates and manages journal entries as the single source of truth
 * for all accounting transactions. Ensures Debit = Credit validation.
 */

const mongoose = require('mongoose');
const JournalEntry = require('../models/JournalEntry');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const logger = require('../utils/logger');
const periodValidationService = require('./periodValidationService');
const accountBalanceService = require('./accountBalanceService');

class JournalEntryService {
  /**
   * Create a journal entry with automatic debit=credit validation
   * @param {Object} entryData - Journal entry data
   * @param {Object} options - Options (session for transactions)
   * @returns {Promise<JournalEntry>}
   */
  async createJournalEntry(entryData, options = {}) {
    const { session = null } = options;
    const {
      tenantId,
      entryDate,
      referenceType,
      referenceId,
      referenceNumber,
      entries,
      description,
      createdBy,
      metadata
    } = entryData;

    try {
      // Validate tenantId
      if (!tenantId) {
        throw new Error('tenantId is required');
      }

      // STEP 7: Validate period before posting
      const transactionDate = entryDate || new Date();
      try {
        await periodValidationService.validateTransactionDate(transactionDate, tenantId);
      } catch (error) {
        logger.warn(`Period validation failed for journal entry: ${error.message}`);
        throw error;
      }

      // Validate entries
      if (!Array.isArray(entries) || entries.length < 2) {
        throw new Error('Journal entry must have at least 2 lines');
      }

      // Validate and enrich account information
      const enrichedEntries = await Promise.all(
        entries.map(async (entry) => {
          // First try to find with strict filters
          let account = await ChartOfAccounts.findOne({
            tenantId: tenantId,
            accountCode: entry.accountCode,
            isActive: true,
            isDeleted: false // STEP 6: Exclude deleted accounts
          }).session(session || null);

          // If not found, try without isActive filter (in case account was just created)
          if (!account) {
            account = await ChartOfAccounts.findOne({
              tenantId: tenantId,
              accountCode: entry.accountCode,
              isDeleted: false
            }).session(session || null);
            
            // If found but inactive, activate it (system accounts should be active)
            if (account && !account.isActive && account.isSystemAccount) {
              account.isActive = true;
              if (session) {
                await account.save({ session });
              } else {
                await account.save();
              }
            }
          }

          // If still not found, try without isDeleted filter (in case of soft-deleted account)
          if (!account) {
            account = await ChartOfAccounts.findOne({
              tenantId: tenantId,
              accountCode: entry.accountCode
            }).session(session || null);
            
            // If found but soft-deleted, restore it
            if (account && account.isDeleted) {
              account.isDeleted = false;
              account.deletedAt = null;
              account.deletedBy = null;
              account.isActive = true;
              if (session) {
                await account.save({ session });
              } else {
                await account.save();
              }
            }
          }

          if (!account) {
            throw new Error(`Account ${entry.accountCode} not found, inactive, or deleted`);
          }

          // STEP 3: Validate parent/child rules
          if (!account.allowDirectPosting) {
            throw new Error(`Cannot post to parent account ${entry.accountCode}. Use child accounts for transactions.`);
          }

          // STEP 5: Validate reconciliation date
          try {
            account.validateTransactionDate(transactionDate);
          } catch (error) {
            logger.warn(`Reconciliation validation failed for account ${entry.accountCode}: ${error.message}`);
            throw error;
          }

          return {
            account: account._id,
            accountCode: account.accountCode,
            accountName: account.accountName,
            debit: entry.debit || 0,
            credit: entry.credit || 0,
            description: entry.description || ''
          };
        })
      );

      // Calculate totals
      let totalDebit = 0;
      let totalCredit = 0;
      enrichedEntries.forEach(entry => {
        totalDebit += entry.debit;
        totalCredit += entry.credit;
      });

      // Validate balance
      const difference = Math.abs(totalDebit - totalCredit);
      if (difference > 0.01) {
        throw new Error(
          `Journal entry does not balance. Debit: ${totalDebit}, Credit: ${totalCredit}, Difference: ${difference}`
        );
      }

      // Generate entry number
      const entryNumber = await JournalEntry.generateEntryNumber(tenantId, referenceType);

      // Create journal entry
      const journalEntry = new JournalEntry({
        tenantId,
        entryNumber,
        entryDate: entryDate || new Date(),
        referenceType,
        referenceId,
        referenceNumber,
        entries: enrichedEntries,
        totalDebit,
        totalCredit,
        description,
        status: 'posted',
        createdBy,
        metadata
      });

      if (session) {
        await journalEntry.save({ session });
      } else {
        await journalEntry.save();
      }

      // STEP 2: Invalidate balance cache for affected accounts
      try {
        await accountBalanceService.invalidateBalanceCache(journalEntry, { session });
      } catch (error) {
        logger.warn(`Failed to invalidate balance cache: ${error.message}`);
        // Don't throw - balance cache invalidation is not critical
      }

      logger.info(`Created journal entry ${entryNumber} for ${referenceType} ${referenceId}`, {
        tenantId,
        entryNumber,
        referenceType,
        referenceId
      });

      return journalEntry;
    } catch (error) {
      logger.error('Error creating journal entry:', error);
      throw error;
    }
  }

  /**
   * Create journal entries for a sale
   * @param {Object} sale - Sale object
   * @param {Object} options - Options
   * @returns {Promise<JournalEntry>}
   */
  async createSaleEntries(sale, options = {}) {
    const { session = null, tenantId, createdBy } = options;
    
    if (!tenantId) {
      throw new Error('tenantId is required');
    }

    const saleTotal = sale.pricing?.total || 0;
    const amountPaid = sale.payment?.amountPaid || 0;
    const unpaidAmount = saleTotal - amountPaid;
    const paymentMethod = sale.payment?.method || 'cash';

    // Get account codes (with fallbacks)
    const cashAccount = await this.getOrCreateAccount(tenantId, 'CASH', 'Cash', 'asset', 'current_assets', session);
    const arAccount = await this.getOrCreateAccount(tenantId, 'AR', 'Accounts Receivable', 'asset', 'current_assets', session);
    const salesRevenueAccount = await this.getOrCreateAccount(tenantId, 'SALES_REV', 'Sales Revenue', 'revenue', 'sales_revenue', session);
    const cogsAccount = await this.getOrCreateAccount(tenantId, 'COGS', 'Cost of Goods Sold', 'expense', 'cost_of_goods_sold', session);
    const inventoryAccount = await this.getOrCreateAccount(tenantId, 'INVENTORY', 'Inventory', 'asset', 'inventory', session);

    // Calculate COGS from sale items
    let totalCOGS = 0;
    if (sale.items && Array.isArray(sale.items)) {
      sale.items.forEach(item => {
        const itemCOGS = (item.unitCost || 0) * (item.quantity || 0);
        totalCOGS += itemCOGS;
      });
    }

    const entries = [];

    // Entry 1: Revenue recognition
    if (amountPaid > 0) {
      // Debit Cash (if paid)
      entries.push({
        accountCode: cashAccount.accountCode,
        debit: amountPaid,
        credit: 0,
        description: `Sale payment: ${sale.orderNumber || sale._id}`
      });
    }

    if (unpaidAmount > 0) {
      // Debit Accounts Receivable (if unpaid)
      entries.push({
        accountCode: arAccount.accountCode,
        debit: unpaidAmount,
        credit: 0,
        description: `Sale on account: ${sale.orderNumber || sale._id}`
      });
    }

    // Credit Sales Revenue
    entries.push({
      accountCode: salesRevenueAccount.accountCode,
      debit: 0,
      credit: saleTotal,
      description: `Sale revenue: ${sale.orderNumber || sale._id}`
    });

    // Entry 2: COGS and Inventory
    if (totalCOGS > 0) {
      // Debit COGS
      entries.push({
        accountCode: cogsAccount.accountCode,
        debit: totalCOGS,
        credit: 0,
        description: `COGS for sale: ${sale.orderNumber || sale._id}`
      });

      // Credit Inventory
      entries.push({
        accountCode: inventoryAccount.accountCode,
        debit: 0,
        credit: totalCOGS,
        description: `Inventory reduction for sale: ${sale.orderNumber || sale._id}`
      });
    }

    return await this.createJournalEntry({
      tenantId,
      entryDate: sale.createdAt || new Date(),
      referenceType: 'sale',
      referenceId: sale._id,
      referenceNumber: sale.orderNumber,
      entries,
      description: `Sale transaction: ${sale.orderNumber || sale._id}`,
      createdBy,
      metadata: {
        paymentMethod,
        amountPaid,
        unpaidAmount,
        totalCOGS
      }
    }, { session });
  }

  /**
   * Create journal entries for a purchase
   * @param {Object} purchase - Purchase invoice object
   * @param {Object} options - Options
   * @returns {Promise<JournalEntry>}
   */
  async createPurchaseEntries(purchase, options = {}) {
    const { session = null, tenantId, createdBy } = options;
    
    if (!tenantId) {
      throw new Error('tenantId is required');
    }

    const purchaseTotal = purchase.pricing?.total || 0;
    const amountPaid = purchase.payment?.paidAmount || 0;
    const unpaidAmount = purchaseTotal - amountPaid;
    const paymentMethod = purchase.payment?.method || 'cash';

    // Get account codes
    const cashAccount = await this.getOrCreateAccount(tenantId, 'CASH', 'Cash', 'asset', 'current_assets', session);
    const apAccount = await this.getOrCreateAccount(tenantId, 'AP', 'Accounts Payable', 'liability', 'current_liabilities', session);
    const inventoryAccount = await this.getOrCreateAccount(tenantId, 'INVENTORY', 'Inventory', 'asset', 'inventory', session);

    const entries = [];

    // Debit Inventory
    entries.push({
      accountCode: inventoryAccount.accountCode,
      debit: purchaseTotal,
      credit: 0,
      description: `Purchase inventory: ${purchase.invoiceNumber || purchase._id}`
    });

    // Credit Cash or Accounts Payable
    if (amountPaid > 0) {
      entries.push({
        accountCode: cashAccount.accountCode,
        debit: 0,
        credit: amountPaid,
        description: `Purchase payment: ${purchase.invoiceNumber || purchase._id}`
      });
    }

    if (unpaidAmount > 0) {
      entries.push({
        accountCode: apAccount.accountCode,
        debit: 0,
        credit: unpaidAmount,
        description: `Purchase on account: ${purchase.invoiceNumber || purchase._id}`
      });
    }

    return await this.createJournalEntry({
      tenantId,
      entryDate: purchase.createdAt || new Date(),
      referenceType: 'purchase',
      referenceId: purchase._id,
      referenceNumber: purchase.invoiceNumber,
      entries,
      description: `Purchase transaction: ${purchase.invoiceNumber || purchase._id}`,
      createdBy,
      metadata: {
        paymentMethod,
        amountPaid,
        unpaidAmount
      }
    }, { session });
  }

  /**
   * Get or create an account (helper method)
   * @private
   */
  async getOrCreateAccount(tenantId, accountCode, accountName, accountType, accountCategory, session = null) {
    // First, try to find existing account (including soft-deleted ones to check)
    let account = await ChartOfAccounts.findOne({
      tenantId: tenantId,
      accountCode: accountCode
    }).session(session || null);

    // If account exists but is soft-deleted, restore it instead of creating new
    if (account && account.isDeleted) {
      account.isDeleted = false;
      account.deletedAt = null;
      account.deletedBy = null;
      account.accountName = accountName; // Update name in case it changed
      account.accountType = accountType;
      account.accountCategory = accountCategory;
      account.isActive = true;
      if (session) {
        await account.save({ session });
      } else {
        await account.save();
      }
      return account;
    }

    // If account doesn't exist, try to create it
    if (!account) {
      try {
        account = new ChartOfAccounts({
          tenantId,
          accountCode,
          accountName,
          accountType,
          accountCategory,
          normalBalance: accountType === 'asset' || accountType === 'expense' ? 'debit' : 'credit',
          isActive: true,
          isSystemAccount: true
        });

        if (session) {
          await account.save({ session });
        } else {
          await account.save();
        }
      } catch (err) {
        // Handle duplicate key error (E11000)
        if (err.code === 11000) {
          // Account was created by another request, fetch it
          logger.info(`Duplicate accountCode detected for ${accountCode}, fetching existing account`);
          account = await ChartOfAccounts.findOne({
            tenantId: tenantId,
            accountCode: accountCode,
            isDeleted: false
          }).session(session || null);
          
          if (!account) {
            // If still not found, try one more time without isDeleted filter
            account = await ChartOfAccounts.findOne({
              tenantId: tenantId,
              accountCode: accountCode
            }).session(session || null);
          }
          
          if (!account) {
            throw new Error(`Account ${accountCode} duplicate key error but account not found after retry`);
          }
        } else {
          throw err;
        }
      }
    }

    return account;
  }

  /**
   * Reverse a journal entry
   * Creates a reversal entry that cancels out the original entry
   * @param {String} journalEntryId - Journal entry ID to reverse
   * @param {Object} options - Options (reason, createdBy, session)
   * @returns {Promise<JournalEntry>} Reversal journal entry
   */
  async reverseJournalEntry(journalEntryId, options = {}) {
    const { reason = 'Reversal', createdBy, session = null, tenantId } = options;

    if (!tenantId) {
      throw new Error('tenantId is required for journal entry reversal');
    }

    // Find the original journal entry
    const originalEntry = await JournalEntry.findOne({
      _id: journalEntryId,
      tenantId: tenantId
    }).session(session || null);

    if (!originalEntry) {
      throw new Error(`Journal entry ${journalEntryId} not found`);
    }

    if (originalEntry.status === 'reversed') {
      throw new Error('Journal entry is already reversed');
    }

    if (originalEntry.status !== 'posted') {
      throw new Error(`Cannot reverse journal entry with status: ${originalEntry.status}`);
    }

    // Create reversal entries (swap debit and credit)
    // Enrich entries with account information
    const reversalEntries = await Promise.all(
      originalEntry.entries.map(async (entry) => {
        // Use existing account ID if populated, otherwise look it up
        let accountId = entry.account;
        let accountName = entry.accountName;

        if (!accountId || !accountName) {
          const account = await ChartOfAccounts.findOne({
            tenantId: tenantId,
            accountCode: entry.accountCode,
            isDeleted: false
          }).session(session || null);

          if (!account) {
            throw new Error(`Account ${entry.accountCode} not found for reversal`);
          }

          accountId = account._id;
          accountName = account.accountName;
        }

        return {
          account: accountId,
          accountCode: entry.accountCode,
          accountName: accountName,
          debit: entry.credit, // Swap: original credit becomes debit
          credit: entry.debit,  // Swap: original debit becomes credit
          description: `Reversal: ${entry.description || ''}`
        };
      })
    );

    // Generate reversal entry number
    const reversalEntryNumber = await JournalEntry.generateEntryNumber(tenantId, originalEntry.referenceType);

    // Create reversal journal entry
    const reversalEntry = new JournalEntry({
      tenantId,
      entryNumber: reversalEntryNumber,
      entryDate: new Date(),
      referenceType: originalEntry.referenceType,
      referenceId: originalEntry.referenceId,
      referenceNumber: originalEntry.referenceNumber ? `REV-${originalEntry.referenceNumber}` : null,
      entries: reversalEntries,
      totalDebit: originalEntry.totalCredit, // Swapped
      totalCredit: originalEntry.totalDebit, // Swapped
      description: `Reversal of ${originalEntry.entryNumber}: ${reason}`,
      status: 'posted',
      createdBy: createdBy || originalEntry.createdBy,
      metadata: {
        isReversal: true,
        originalEntryId: originalEntry._id,
        reason: reason
      }
    });

    if (session) {
      await reversalEntry.save({ session });
    } else {
      await reversalEntry.save();
    }

    // Mark original entry as reversed
    originalEntry.status = 'reversed';
    originalEntry.reversedEntry = reversalEntry._id;
    if (session) {
      await originalEntry.save({ session });
    } else {
      await originalEntry.save();
    }

    // Invalidate balance cache for affected accounts
    try {
      await accountBalanceService.invalidateBalanceCache(reversalEntry, { session });
    } catch (error) {
      logger.warn(`Failed to invalidate balance cache for reversal: ${error.message}`);
    }

    logger.info(`Reversed journal entry ${originalEntry.entryNumber} with ${reversalEntryNumber}`, {
      tenantId,
      originalEntryId: originalEntry._id,
      reversalEntryId: reversalEntry._id,
      reason
    });

    return reversalEntry;
  }

  /**
   * Get journal entries for a date range
   * @param {Object} filters - Filter criteria
   * @param {Object} options - Query options
   * @returns {Promise<Object>}
   */
  async getJournalEntries(filters = {}, options = {}) {
    const {
      tenantId,
      startDate,
      endDate,
      accountCode,
      referenceType,
      status = 'posted'
    } = filters;

    const { page = 1, limit = 50, sort = { entryDate: -1 } } = options;

    if (!tenantId) {
      throw new Error('tenantId is required');
    }

    const query = { tenantId, status };

    if (startDate || endDate) {
      query.entryDate = {};
      if (startDate) query.entryDate.$gte = new Date(startDate);
      if (endDate) query.entryDate.$lte = new Date(endDate);
    }

    if (accountCode) {
      query['entries.accountCode'] = accountCode;
    }

    if (referenceType) {
      query.referenceType = referenceType;
    }

    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      JournalEntry.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('entries.account', 'accountCode accountName')
        .populate('createdBy', 'firstName lastName email'),
      JournalEntry.countDocuments(query)
    ]);

    return {
      entries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
}

module.exports = new JournalEntryService();

