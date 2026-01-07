const mongoose = require('mongoose');
const ChartOfAccountsRepository = require('../repositories/ChartOfAccountsRepository');
const CustomerRepository = require('../repositories/CustomerRepository');
const SupplierRepository = require('../repositories/SupplierRepository');
const AccountingService = require('./accountingService');
const Counter = require('../models/Counter'); // Keep for findOneAndUpdate with upsert
const ChartOfAccounts = require('../models/ChartOfAccounts'); // Keep for instance creation

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
      console.log('Duplicate accountCode, fetching existing account:', accountCode);
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
      { accountCode: upperCode, isActive: true }
    );
    if (accountsReceivableAccount) break;
    
    // If not found without session, try with session
    if (!accountsReceivableAccount && session) {
      accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
        { accountCode: upperCode, isActive: true },
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
          accountName: { $regex: pattern },
          accountType: 'asset',
          accountCategory: 'current_assets',
          isActive: true
        }
      );
      if (accountsReceivableAccount) break;
      
      // If not found, try without isActive filter (might be inactive)
      if (!accountsReceivableAccount) {
        accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
          {
            accountName: { $regex: pattern },
            accountType: 'asset',
            accountCategory: 'current_assets'
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
            accountName: { $regex: pattern },
            accountType: 'asset',
            accountCategory: 'current_assets',
            isActive: true
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
        accountName: { $regex: /receivable/i },
        accountType: 'asset',
        isActive: true
      }
    );
    
    // Try with session if not found
    if (!accountsReceivableAccount && session) {
      accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
        {
          accountName: { $regex: /receivable/i },
          accountType: 'asset',
          isActive: true
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
        { accountCode: code.toUpperCase() }
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
          { accountCode: code }
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
        console.log('Successfully created Accounts Receivable account:', accountCode);
      } catch (createError) {
        // If creation fails due to duplicate, try fetching
        if (createError.code === 11000 || createError.name === 'MongoServerError') {
          console.log('Account already exists, fetching:', accountCode);
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
          console.log('Trying upsert as fallback:', createError.message);
          const updateOptions = session ? { session } : {};
          const result = await ChartOfAccounts.updateOne(
            { accountCode: accountCode },
            { $setOnInsert: accountData },
            { upsert: true, ...updateOptions }
          );
          
          // Fetch after upsert
          accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
            { accountCode: accountCode },
            { session }
          );
          
          // If still null, try without session
          if (!accountsReceivableAccount) {
            accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
              { accountCode: accountCode }
            );
          }
        }
      }
    } catch (error) {
      console.error('Error creating/finding Accounts Receivable account:', {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack
      });
      
      // Last resort: try to find any active Accounts Receivable account (without session)
      accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
        {
          accountName: { $regex: /receivable/i },
          accountType: 'asset',
          isActive: true
        }
      );
      
      // If still not found, try with session
      if (!accountsReceivableAccount) {
        accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
          {
            accountName: { $regex: /receivable/i },
            accountType: 'asset',
            isActive: true
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
      console.log('Last resort: attempting to create Accounts Receivable account without session');
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
        { accountCode: '1130' }
      );
      
      if (!accountsReceivableAccount) {
        const newAccount = new ChartOfAccounts(minimalAccountData);
        await newAccount.save();
        accountsReceivableAccount = newAccount;
        console.log('Successfully created Accounts Receivable account as last resort');
      }
    } catch (lastResortError) {
      console.error('Last resort account creation failed:', {
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
    const existingAccount = await ChartOfAccountsRepository.findById(
      customer.ledgerAccount,
      { session }
    );
    if (existingAccount && existingAccount.accountName?.startsWith('Customer -')) {
      // This is an individual customer account - we should migrate to the general account
      // Deactivate the individual account
      await ChartOfAccountsRepository.updateById(
        customer.ledgerAccount,
        {
          isActive: false,
          updatedBy: userId || undefined
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
      session
    });

    supplier.ledgerAccount = account._id;
  } else {
    account = await ChartOfAccountsRepository.updateById(
      supplier.ledgerAccount,
      {
        accountName,
        isActive: isStatusActive(supplier.status),
        updatedBy: userId || undefined
      },
      { new: true, session }
    );
    if (account) {
      const existingTags = Array.isArray(account.tags) ? account.tags : [];
      const mergedTags = Array.from(new Set([...existingTags, 'supplier', supplier._id.toString()]));
      if (mergedTags.length !== existingTags.length) {
        account.tags = mergedTags;
        await account.save({ session, validateBeforeSave: false });
      }
    }
  }

  await supplier.save({ session, validateBeforeSave: false });
  return account;
};

const deactivateLedgerAccount = async (accountId, { session, userId } = {}) => {
  if (!accountId) return;
  await ChartOfAccountsRepository.updateById(
    accountId,
    {
      isActive: false,
      updatedBy: userId || undefined
    },
    { session }
  );
};

const ensureCustomerLedgerAccounts = async ({ userId } = {}) => {
  // Find all customers that need ledger accounts or have individual accounts
  const customers = await CustomerRepository.findAll({
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
        console.error('Failed to migrate ledger account for customer', customer._id, error.message);
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
      console.error('Failed to create ledger account for customer', customer._id, error.message);
    } finally {
      session.endSession();
    }
  }
};

const ensureSupplierLedgerAccounts = async ({ userId } = {}) => {
  const suppliers = await SupplierRepository.findAll({
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
      console.error('Failed to create ledger account for supplier', supplier._id, error.message);
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

