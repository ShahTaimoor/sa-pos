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
  // Try multiple possible account codes/names that might exist
  let accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
    {
      $or: [
        { accountCode: '1130' },
        { accountCode: '1201' },
        { 
          accountName: { $regex: /^Accounts Receivable$/i },
          accountType: 'asset',
          accountCategory: 'current_assets'
        }
      ],
      isActive: true
    },
    { session }
  );

  // If Accounts Receivable doesn't exist, create it using upsert to handle duplicates
  if (!accountsReceivableAccount) {
    const accountData = {
      accountCode: '1130',
      accountName: 'Accounts Receivable',
      accountType: 'asset',
      accountCategory: 'current_assets',
      normalBalance: 'debit',
      allowDirectPosting: true,
      isActive: true,
      isSystemAccount: true,
      description: 'Money owed by customers - General Accounts Receivable account',
      createdBy: userId || undefined
    };
    
    // Use model directly for upsert operation
    const updateOptions = session ? { session } : {};
    await ChartOfAccounts.updateOne(
      { accountCode: '1130' },
      { $setOnInsert: accountData },
      { upsert: true, ...updateOptions }
    );
    
    // Fetch the account after upsert
    accountsReceivableAccount = await ChartOfAccountsRepository.findOne(
      { accountCode: '1130' },
      { session }
    );
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

