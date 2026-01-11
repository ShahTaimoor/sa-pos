const BaseRepository = require('./BaseRepository');
const ChartOfAccounts = require('../models/ChartOfAccounts');

class ChartOfAccountsRepository extends BaseRepository {
  constructor() {
    super(ChartOfAccounts);
  }

  /**
   * Find account by account code
   * @param {string} accountCode - Account code
   * @param {string} tenantId - Tenant ID (required)
   * @param {object} options - Query options
   * @returns {Promise<ChartOfAccounts|null>}
   */
  async findByAccountCode(accountCode, tenantId, options = {}) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for findByAccountCode');
    }
    return await this.findOne({ accountCode, tenantId }, options);
  }

  /**
   * Find accounts by account type
   * @param {string} accountType - Account type
   * @param {string} tenantId - Tenant ID (required)
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async findByAccountType(accountType, tenantId, options = {}) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for findByAccountType');
    }
    return await this.findAll({ accountType, tenantId }, options);
  }

  /**
   * Find accounts by account name (case-insensitive search)
   * @param {string} accountName - Account name pattern
   * @param {string} tenantId - Tenant ID (required)
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async findByAccountName(accountName, tenantId, options = {}) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for findByAccountName');
    }
    return await this.findAll(
      { accountName: { $regex: accountName, $options: 'i' }, tenantId },
      options
    );
  }

  /**
   * Find accounts matching a pattern in account name
   * @param {string} pattern - Pattern to match
   * @param {string} tenantId - Tenant ID (required)
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async findMatchingAccountName(pattern, tenantId, options = {}) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for findMatchingAccountName');
    }
    return await this.findAll(
      { accountName: { $regex: pattern, $options: 'i' }, tenantId },
      options
    );
  }

  /**
   * Get account codes for matching account names
   * @param {string} accountName - Account name pattern
   * @param {string} tenantId - Tenant ID (required)
   * @returns {Promise<Array<string>>} - Array of account codes
   */
  async getAccountCodesByName(accountName, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for getAccountCodesByName');
    }
    const accounts = await this.Model.find({
      accountName: { $regex: accountName, $options: 'i' },
      tenantId: tenantId,
      isDeleted: false,
      isActive: true
    }).select('accountCode').lean();
    return accounts.map(a => a.accountCode);
  }

  /**
   * Resolve cash and bank account codes
   * @param {string} tenantId - Tenant ID (required)
   * @returns {Promise<{cashCode: string, bankCode: string}>}
   */
  async resolveCashBankCodes(tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for resolving cash/bank codes');
    }
    
    try {
      const accounts = await this.Model.find({ 
        tenantId: tenantId,
        accountType: 'asset',
        isDeleted: false,
        isActive: true
      })
        .select('accountCode accountName')
        .lean();
      const cash = accounts.find(a => /cash/i.test(a.accountName))?.accountCode || '1001';
      const bank = accounts.find(a => /bank/i.test(a.accountName))?.accountCode || '1002';
      return { cashCode: cash, bankCode: bank };
    } catch (_) {
      return { cashCode: '1001', bankCode: '1002' };
    }
  }

  /**
   * Find child accounts by parent account ID
   * @param {string} parentAccountId - Parent account ID
   * @param {string} tenantId - Tenant ID (required)
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async findChildAccounts(parentAccountId, tenantId, options = {}) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for findChildAccounts');
    }
    return await this.findAll({ parentAccount: parentAccountId, tenantId }, options);
  }

  /**
   * Get account hierarchy (uses model static method)
   * @param {string} tenantId - Tenant ID (required)
   * @returns {Promise<Array>}
   */
  async getAccountHierarchy(tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for account hierarchy');
    }
    return await this.Model.getAccountHierarchy(tenantId);
  }

  /**
   * Get account statistics
   * @param {string} tenantId - Tenant ID (required)
   * @returns {Promise<object>}
   */
  async getStats(tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for account statistics');
    }
    
    const [totalAccounts, accountsByType, totalAssets, totalLiabilities, totalEquity] = await Promise.all([
      this.Model.countDocuments({ tenantId: tenantId, isActive: true, isDeleted: false }),
      this.Model.aggregate([
        { $match: { tenantId: tenantId, isActive: true, isDeleted: false } },
        { $group: { _id: '$accountType', count: { $sum: 1 } } }
      ]),
      this.Model.aggregate([
        { $match: { tenantId: tenantId, accountType: 'asset', isActive: true, isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$currentBalance' } } }
      ]),
      this.Model.aggregate([
        { $match: { tenantId: tenantId, accountType: 'liability', isActive: true, isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$currentBalance' } } }
      ]),
      this.Model.aggregate([
        { $match: { tenantId: tenantId, accountType: 'equity', isActive: true, isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$currentBalance' } } }
      ])
    ]);

    return {
      totalAccounts,
      accountsByType,
      totalAssets: totalAssets[0]?.total || 0,
      totalLiabilities: totalLiabilities[0]?.total || 0,
      totalEquity: totalEquity[0]?.total || 0
    };
  }

  /**
   * Update account balance (for transactions with session support)
   * @param {string} accountId - Account ID
   * @param {object} updateData - Update data (e.g., { $inc: { currentBalance: delta } })
   * @param {object} options - Options including session
   * @returns {Promise}
   */
  async updateBalance(accountId, updateData, options = {}) {
    const { session } = options;
    return await this.Model.updateOne(
      { _id: accountId },
      updateData,
      { session, ...options }
    );
  }
}

module.exports = new ChartOfAccountsRepository();

