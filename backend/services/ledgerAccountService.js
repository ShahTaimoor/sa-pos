const mongoose = require('mongoose');
const ChartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');
const CustomerRepository = require('../repositories/CustomerRepository');
const SupplierRepository = require('../repositories/SupplierRepository');
const AccountingService = require('./accountingService');
const Counter = require('../models/Counter'); // Keep for findOneAndUpdate with upsert
const ChartOfAccounts = require('../models/ChartOfAccounts');
const logger = require('../utils/logger'); // Keep for instance creation

const isStatusActive = (status) => {
  if (!status) return true;
  return status === 'active';
};

const generateSequentialCode = async (counterKey, prefix, session) => {
  const counter = await Counter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, session }
  );

  return `${prefix}${String(counter.seq).padStart(4, '0')}`;
};

const createLedgerAccount = async ({
  prefix,
  counterKey,
  accountName,
  accountType,
  accountCategory,
  normalBalance,
  tags = [],
  status,
  userId,
  session
}) => {
  const accountCode = await generateSequentialCode(counterKey, prefix, session);
  const accountData = {
    accountCode,
    accountName,
    accountType,
    accountCategory,
    normalBalance,
    tenantId: tenantId,
    allowDirectPosting: true,
    isActive: isStatusActive(status),
    tags,
    description: 'Auto-generated party ledger account',
    createdBy: userId || undefined,
    updatedBy: userId || undefined
  };

  try {
    const account = new ChartOfAccounts(accountData);
    await account.save({ session });
    return account;
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key error - account already exists, fetch and return it
      logger.info('Duplicate accountCode, fetching existing account:', accountCode);
      const existingAccount = await ChartOfAccountsRepository.findOne(
        { accountCode },
        { session }
      );
      if (existingAccount) {
        return existingAccount;
      }
      // If not found, try upsert approach (using model directly for upsert)
      const updateOptions = session ? { session } : {};
      await ChartOfAccounts.updateOne(
        { accountCode },
        { $setOnInsert: accountData },
        { upsert: true, ...updateOptions }
      );
      return await ChartOfAccountsRepository.findOne(
        { accountCode },
        { session }
      );
    }
    throw err;
  }
};

const syncCustomerLedgerAccount = async (customer, { session, userId } = {}) => {
  if (!customer) return null;
  
  const tenantId = customer.tenantId;
  if (!tenantId) {
    throw new Error('Customer must have tenantId');
  }

  // Find or get the general "Accounts Receivable" account
  // Try multiple possible account codes/names that might exist (dynamic lookup)
  const possibleAccountCodes = ['1130', '1201', '1200', '1100'];
  const accountNamePatterns = [
    /^Accounts Receivable$/i,
    /^Account Receivable$/i,
    /^AR$/i,
    /^Receivables$/i
  ];

  let accountsReceivableAccount = null;
  
  // First, try to find by account code (try without session first for better reliability)
  for (const code of possibleAccountCodes) {
    const upperCode = code.toUpperCase();
    accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
      { tenantId: tenantId, accountCode: upperCode, isActive: true, isDeleted: false }
    );
    if (accountsReceivableAccount) break;
    
    // If not found without session, try with session
    if (!accountsReceivableAccount && session) {
      accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
        { tenantId: tenantId, accountCode: upperCode, isActive: true, isDeleted: false },
        { session }
      );
      if (accountsReceivableAccount) break;
    }
  }

  // If not found by code, try to find by name pattern (try without isActive first)
  if (!accountsReceivableAccount) {
    for (const pattern of accountNamePatterns) {
      // Try with isActive: true first
      accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
        {
          tenantId: tenantId,
          accountName: { $regex: pattern },
          accountType: 'asset',
          accountCategory: 'current_assets',
          isActive: true,
          isDeleted: false
        }
      );
      if (accountsReceivableAccount) break;
      
      // If not found, try without isActive filter (might be inactive)
      if (!accountsReceivableAccount) {
        accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
          {
            tenantId: tenantId,
            accountName: { $regex: pattern },
            accountType: 'asset',
            accountCategory: 'current_assets',
            isDeleted: false
          }
        );
        if (accountsReceivableAccount) {
          // Reactivate if found but inactive
          accountsReceivableAccount.isActive = true;
          await accountsReceivableAccount.save(session ? { session } : undefined);
          break;
        }
      }
      
      // Try with session if still not found
      if (!accountsReceivableAccount && session) {
        accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
          {
            tenantId: tenantId,
            accountName: { $regex: pattern },
            accountType: 'asset',
            accountCategory: 'current_assets',
            isActive: true,
            isDeleted: false
          },
          { session }
        );
        if (accountsReceivableAccount) break;
      }
    }
  }

  // If still not found, try broader search (any asset account with receivable in name)
  if (!accountsReceivableAccount) {
    accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
      {
        tenantId: tenantId,
        accountName: { $regex: /receivable/i },
        accountType: 'asset',
        isActive: true,
        isDeleted: false
      }
    );
    
    // Try with session if not found
    if (!accountsReceivableAccount && session) {
      accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
        {
          tenantId: tenantId,
          accountName: { $regex: /receivable/i },
          accountType: 'asset',
          isActive: true,
          isDeleted: false
        },
        { session }
      );
    }
  }

  // If Accounts Receivable doesn't exist, create it dynamically
  if (!accountsReceivableAccount) {
    // Try to find an available account code starting from 1130
    let accountCode = '1130';
    let codeFound = false;
    
    // Check if 1130 is available, if not try other codes (without session first for better reliability)
    for (const code of possibleAccountCodes) {
      const existing = await ChartOfAccountsRepository.findOne(
        { tenantId: tenantId, accountCode: code.toUpperCase(), isDeleted: false }
      );
      if (!existing) {
        accountCode = code.toUpperCase();
        codeFound = true;
        break;
      }
    }
    
    // If all codes are taken, generate a new one in the 1100-1199 range
    if (!codeFound) {
      for (let i = 1100; i <= 1199; i++) {
        const code = String(i).toUpperCase();
        const existing = await ChartOfAccountsRepository.findOne(
          { tenantId: tenantId, accountCode: code, isDeleted: false }
        );
        if (!existing) {
          accountCode = code;
          codeFound = true;
          break;
        }
      }
    }

    const accountData = {
      accountCode: accountCode,
      accountName: 'Accounts Receivable',
      accountType: 'asset',
      accountCategory: 'current_assets',
      normalBalance: 'debit',
      tenantId: tenantId,
      allowDirectPosting: true,
      isActive: true,
      isSystemAccount: true,
      description: 'Money owed by customers - General Accounts Receivable account',
      createdBy: userId || undefined,
      currentBalance: 0,
      openingBalance: 0
    };
    
    try {
      // First, try to create directly using the model (most reliable)
      try {
        const newAccount = new ChartOfAccounts(accountData);
        const saveOptions = session ? { session } : {};
        await newAccount.save(saveOptions);
        accountsReceivableAccount = newAccount;
        logger.info('Successfully created Accounts Receivable account:', accountCode);
      } catch (createError) {
        // If creation fails due to duplicate, try fetching
        if (createError.code === 11000 || createError.name === 'MongoServerError') {
          logger.info('Account already exists, fetching:', accountCode);
          // Try with session first
          accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
            { accountCode: accountCode },
            { session }
          );
          // If not found with session, try without session
          if (!accountsReceivableAccount) {
            accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
              { accountCode: accountCode }
            );
          }
          
          // If still not found, try finding by name
          if (!accountsReceivableAccount) {
            accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
              {
                accountName: { $regex: /^Accounts Receivable$/i },
                accountType: 'asset',
                isActive: true
              },
              { session }
            );
            if (!accountsReceivableAccount) {
              accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
                {
                  accountName: { $regex: /^Accounts Receivable$/i },
                  accountType: 'asset',
                  isActive: true
                }
              );
            }
          }
        } else {
          // For other errors, try upsert as fallback
          logger.info('Trying upsert as fallback:', createError.message);
          const updateOptions = session ? { session } : {};
          const result = await ChartOfAccounts.updateOne(
            { tenantId: tenantId, accountCode: accountCode },
            { $setOnInsert: accountData },
            { upsert: true, ...updateOptions }
          );
          
          // Fetch after upsert
          accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
            { tenantId: tenantId, accountCode: accountCode, isDeleted: false },
            { session }
          );
          
          // If still null, try without session
          if (!accountsReceivableAccount) {
            accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
              { tenantId: tenantId, accountCode: accountCode, isDeleted: false }
            );
          }
        }
      }
    } catch (error) {
      logger.error('Error creating/finding Accounts Receivable account:', {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack
      });
      
      // Last resort: try to find any active Accounts Receivable account (without session)
      accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
        {
          tenantId: tenantId,
          accountName: { $regex: /receivable/i },
          accountType: 'asset',
          isActive: true,
          isDeleted: false
        }
      );
      
      // If still not found, try with session
      if (!accountsReceivableAccount) {
        accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
          {
            tenantId: tenantId,
            accountName: { $regex: /receivable/i },
            accountType: 'asset',
            isActive: true,
            isDeleted: false
          },
          { session }
        );
      }
    }
  }

  // Validate that we have an account
  if (!accountsReceivableAccount || !accountsReceivableAccount._id) {
    // Last resort: try to create a minimal account without session constraints
    try {
      logger.info('Last resort: attempting to create Accounts Receivable account without session');
      const minimalAccountData = {
        accountCode: '1130',
        accountName: 'Accounts Receivable',
        accountType: 'asset',
        accountCategory: 'current_assets',
        normalBalance: 'debit',
        allowDirectPosting: true,
        isActive: true,
        isSystemAccount: true,
        description: 'Money owed by customers - General Accounts Receivable account',
        currentBalance: 0,
        openingBalance: 0
      };
      
      // Try to find or create without session
      accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
        { tenantId: tenantId, accountCode: '1130', isDeleted: false }
      );
      
      if (!accountsReceivableAccount) {
        const newAccount = new ChartOfAccounts(minimalAccountData);
        await newAccount.save();
        accountsReceivableAccount = newAccount;
        logger.info('Successfully created Accounts Receivable account as last resort');
      }
    } catch (lastResortError) {
      logger.error('Last resort account creation failed:', {
        message: lastResortError.message,
        code: lastResortError.code,
        name: lastResortError.name
      });
      
      // If still failing, throw a more helpful error
      throw new Error(
        `Failed to find or create Accounts Receivable account. ` +
        `Please ensure the chart of accounts is properly configured. ` +
        `Error: ${lastResortError.message}`
      );
    }
    
    // Final validation
    if (!accountsReceivableAccount || !accountsReceivableAccount._id) {
      throw new Error(
        'Failed to find or create Accounts Receivable account. ' +
        'Please ensure the chart of accounts is properly configured and try again.'
      );
    }
  }

  // If customer has an individual account (like "Customer - NAME"), migrate to general account
  if (customer.ledgerAccount) {
    const existingAccount = await ChartOfAccountsRepository.findOne(
      { _id: customer.ledgerAccount, tenantId: tenantId, isDeleted: false },
      { session }
    );
    if (existingAccount && existingAccount.accountName?.startsWith('Customer -')) {
      // This is an individual customer account - we should migrate to the general account
      // Deactivate the individual account
      await ChartOfAccounts.updateOne(
        { _id: customer.ledgerAccount, tenantId: tenantId },
        {
          $set: {
            isActive: false,
            updatedBy: userId || undefined
          }
        },
        { session }
      );
    }
  }

  // Link customer to the general Accounts Receivable account
  customer.ledgerAccount = accountsReceivableAccount._id;
  await customer.save({ session, validateBeforeSave: false });
  
  return accountsReceivableAccount;
};

const syncSupplierLedgerAccount = async (supplier, { session, userId } = {}) => {
  if (!supplier) return null;
  
  const tenantId = supplier.tenantId;
  if (!tenantId) {
    throw new Error('Supplier must have tenantId');
  }

  const displayName = supplier.companyName || supplier.contactPerson?.name || 'Unnamed Supplier';
  const accountName = `Supplier - ${displayName}`;

  let account;

  if (!supplier.ledgerAccount) {
    account = await createLedgerAccount({
      prefix: 'AP-SUP-',
      counterKey: 'supplierLedgerAccounts',
      accountName,
      accountType: 'liability',
      accountCategory: 'current_liabilities',
      normalBalance: 'credit',
      tags: ['supplier', supplier._id.toString()],
      status: supplier.status,
      userId,
      tenantId: tenantId,
      session
    });

    supplier.ledgerAccount = account._id;
  } else {
    account = await ChartOfAccountsRepository.findOne(
      { _id: supplier.ledgerAccount, tenantId: tenantId, isDeleted: false },
      { session }
    );
    if (account) {
      account.accountName = accountName;
      account.isActive = isStatusActive(supplier.status);
      account.updatedBy = userId || undefined;
      const existingTags = Array.isArray(account.tags) ? account.tags : [];
      const mergedTags = Array.from(new Set([...existingTags, 'supplier', supplier._id.toString()]));
      if (mergedTags.length !== existingTags.length) {
        account.tags = mergedTags;
      }
      await account.save({ session, validateBeforeSave: false });
    }
  }

  await supplier.save({ session, validateBeforeSave: false });
  return account;
};

const deactivateLedgerAccount = async (accountId, { session, userId, tenantId } = {}) => {
  if (!accountId) return;
  
  // If tenantId provided, use it for security; otherwise fetch account first to get tenantId
  if (tenantId) {
    await ChartOfAccounts.updateOne(
      { _id: accountId, tenantId: tenantId },
      {
        $set: {
          isActive: false,
          updatedBy: userId || undefined
        }
      },
      { session }
    );
  } else {
    // Fallback: find account first to get tenantId (less secure but backward compatible)
    const account = await ChartOfAccountsRepository.findOne(
      { _id: accountId, isDeleted: false },
      { session }
    );
    if (account && account.tenantId) {
      await ChartOfAccounts.updateOne(
        { _id: accountId, tenantId: account.tenantId },
        {
          $set: {
            isActive: false,
            updatedBy: userId || undefined
          }
        },
        { session }
      );
    }
  }
};

const ensureCustomerLedgerAccounts = async ({ userId, tenantId } = {}) => {
  if (!tenantId) {
    throw new Error('Tenant ID is required for ensureCustomerLedgerAccounts');
  }
  
  // Find all customers that need ledger accounts or have individual accounts
  const customers = await CustomerRepository.findAll({
    tenantId: tenantId,
    $or: [
      { ledgerAccount: { $exists: false } }, 
      { ledgerAccount: null }
    ]
  });

  // Also find customers with individual accounts to migrate them
  const customersWithIndividualAccounts = await CustomerRepository.findAll(
    {
      ledgerAccount: { $exists: true, $ne: null }
    },
    {
      populate: [{ path: 'ledgerAccount' }]
    }
  );

  // Migrate customers with individual accounts
  for (const customer of customersWithIndividualAccounts) {
    if (customer.ledgerAccount && customer.ledgerAccount.accountName?.startsWith('Customer -')) {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        await syncCustomerLedgerAccount(customer, { session, userId });
        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        logger.error('Failed to migrate ledger account for customer', customer._id, error.message);
      } finally {
        session.endSession();
      }
    }
  }

  // Create ledger accounts for customers without them
  for (const customer of customers) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await syncCustomerLedgerAccount(customer, { session, userId });
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to create ledger account for customer', customer._id, error.message);
    } finally {
      session.endSession();
    }
  }
};

const ensureSupplierLedgerAccounts = async ({ userId, tenantId } = {}) => {
  if (!tenantId) {
    throw new Error('Tenant ID is required for ensureSupplierLedgerAccounts');
  }
  
  const suppliers = await SupplierRepository.findAll({
    tenantId: tenantId,
    $or: [{ ledgerAccount: { $exists: false } }, { ledgerAccount: null }]
  });

  for (const supplier of suppliers) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await syncSupplierLedgerAccount(supplier, { session, userId });
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to create ledger account for supplier', supplier._id, error.message);
    } finally {
      session.endSession();
    }
  }
};

module.exports = {
  syncCustomerLedgerAccount,
  syncSupplierLedgerAccount,
  deactivateLedgerAccount,
  ensureCustomerLedgerAccounts,
  ensureSupplierLedgerAccounts
};

