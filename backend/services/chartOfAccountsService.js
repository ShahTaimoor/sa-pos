const chartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');

class ChartOfAccountsService {
  /**
   * Get all accounts with optional filters
   * @param {object} queryParams - Query parameters
   * @returns {Promise<Array>}
   */
  async getAccounts(queryParams) {
    const { accountType, accountCategory, isActive, search, allowDirectPosting, tenantId, includeDeleted } = queryParams;

    if (!tenantId) {
      throw new Error('Tenant ID is required for getAccounts');
    }

    const filter = {};
    // Always filter by tenantId for multi-tenant isolation
    filter.tenantId = tenantId;
    // STEP 6: Always exclude deleted accounts unless explicitly requested
    if (includeDeleted !== 'true') {
      filter.isDeleted = false;
    }
    if (accountType) filter.accountType = accountType;
    if (accountCategory) filter.accountCategory = accountCategory;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (allowDirectPosting !== undefined) filter.allowDirectPosting = allowDirectPosting === 'true';
    if (search) {
      filter.$or = [
        { accountCode: { $regex: search, $options: 'i' } },
        { accountName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const accounts = await chartOfAccountsRepository.findAll(filter, {
      populate: [{ path: 'parentAccount', select: 'accountCode accountName' }],
      sort: { accountCode: 1 }
    });

    return accounts;
  }

  /**
   * Get account hierarchy tree
   * @param {string} tenantId - Tenant ID (required)
   * @returns {Promise<Array>}
   */
  async getAccountHierarchy(tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for account hierarchy');
    }
    return await chartOfAccountsRepository.getAccountHierarchy(tenantId);
  }

  /**
   * Get account by ID
   * @param {string} id - Account ID
   * @param {string} tenantId - Tenant ID (required)
   * @returns {Promise<object>}
   */
  async getAccountById(id, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for getAccountById');
    }
    
    const account = await chartOfAccountsRepository.findOne(
      { _id: id, tenantId: tenantId },
      [{ path: 'parentAccount', select: 'accountCode accountName' }]
    );
    if (!account) {
      throw new Error('Account not found');
    }
    return account;
  }

  /**
   * Create new account
   * @param {object} accountData - Account data
   * @param {string} userId - User ID creating the account
   * @param {string} tenantId - Tenant ID (required for multi-tenant support)
   * @returns {Promise<object>}
   */
  async createAccount(accountData, userId, tenantId) {
    const { accountCode, accountName, accountType, accountCategory, normalBalance, parentAccount } = accountData;

    // Validation
    if (!accountCode || !accountName || !accountType || !accountCategory || !normalBalance) {
      throw new Error('Account code, name, type, category, and normal balance are required');
    }

    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    // Check if account code already exists for this tenant
    const existingAccount = await chartOfAccountsRepository.findOne({ 
      accountCode: accountCode,
      tenantId: tenantId 
    });
    if (existingAccount) {
      throw new Error('Account code already exists');
    }

    const newAccountData = {
      ...accountData,
      tenantId: tenantId, // Add tenantId to account data
      parentAccount: parentAccount || null,
      level: accountData.level || 0,
      openingBalance: 0, // Opening balance should be set via journal entry (STEP 1)
      currentBalance: 0, // Will be calculated from journal entries (STEP 2)
      allowDirectPosting: accountData.allowDirectPosting !== undefined ? accountData.allowDirectPosting : true,
      isTaxable: accountData.isTaxable || false,
      taxRate: accountData.taxRate || 0,
      requiresReconciliation: accountData.requiresReconciliation || false,
      accountOrigin: accountData.accountOrigin || 'manual',
      isProtected: accountData.isProtected || false,
      isDeleted: false,
      createdBy: userId
    };

    try {
      const account = await chartOfAccountsRepository.create(newAccountData);
      
      // STEP 3: Validate parent/child rules
      await account.validateParentChildRules();
      
      return account;
    } catch (err) {
      if (err.code === 11000) {
        throw new Error('Account code already exists');
      }
      throw err;
    }
  }

  /**
   * Update account
   * @param {string} id - Account ID
   * @param {object} updateData - Update data
   * @param {string} userId - User ID updating the account
   * @param {string} tenantId - Tenant ID (required)
   * @param {boolean} requireSystemPermission - Require system permission to modify protected accounts
   * @returns {Promise<object>}
   */
  async updateAccount(id, updateData, userId, tenantId, requireSystemPermission = false) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for updateAccount');
    }
    
    const account = await chartOfAccountsRepository.findOne({ _id: id, tenantId: tenantId });
    
    if (!account) {
      throw new Error('Account not found');
    }

    // STEP 4: Check if account can be modified
    account.canBeModified(requireSystemPermission);

    const allowedFields = [
      'accountName',
      'accountCategory',
      'parentAccount',
      'description',
      'allowDirectPosting',
      'isTaxable',
      'taxRate',
      'requiresReconciliation',
      'isActive'
    ];

    // Prevent changing critical fields for system/protected accounts
    if (account.isSystemAccount || account.isProtected || account.accountOrigin === 'system') {
      // Cannot change accountCode, accountType, normalBalance for system accounts
      if (updateData.accountCode || updateData.accountType || updateData.normalBalance) {
        throw new Error('Cannot change account code, type, or normal balance for system/protected accounts');
      }
    }

    const updateFields = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        updateFields[field] = updateData[field];
      }
    });

    updateFields.updatedBy = userId;

    const updatedAccount = await chartOfAccountsRepository.update(id, updateFields, { tenantId });
    
    // STEP 3: Validate parent/child rules after update
    const reloadedAccount = await chartOfAccountsRepository.findOne({ _id: id, tenantId: tenantId });
    await reloadedAccount.validateParentChildRules();
    
    return reloadedAccount;
  }

  /**
   * Delete account (soft delete)
   * @param {string} id - Account ID
   * @param {string} userId - User ID deleting the account
   * @param {string} tenantId - Tenant ID (required)
   * @returns {Promise<object>}
   */
  async deleteAccount(id, userId, tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for deleteAccount');
    }
    
    const account = await chartOfAccountsRepository.findOne({ _id: id, tenantId: tenantId });
    
    if (!account) {
      throw new Error('Account not found');
    }

    // STEP 4 & 6: Check if account can be deleted
    await account.canBeDeleted();

    // STEP 6: Soft delete (set isDeleted flag)
    account.isDeleted = true;
    account.deletedAt = new Date();
    account.deletedBy = userId;
    account.isActive = false; // Also deactivate
    
    await account.save();
    
    return { message: 'Account deleted successfully' };
  }

  /**
   * Get account statistics summary
   * @param {string} tenantId - Tenant ID (required)
   * @returns {Promise<object>}
   */
  async getStats(tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for account statistics');
    }
    return await chartOfAccountsRepository.getStats(tenantId);
  }
}

module.exports = new ChartOfAccountsService();

