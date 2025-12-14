const mongoose = require('mongoose');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const AccountingService = require('./accountingService');
const Counter = require('../models/Counter');

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
  const account = new ChartOfAccounts({
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
  });

  await account.save({ session });
  return account;
};

const syncCustomerLedgerAccount = async (customer, { session, userId } = {}) => {
  if (!customer) return null;

  // Find or get the general "Accounts Receivable" account
  // Try multiple possible account codes/names that might exist
  const findQuery = ChartOfAccounts.findOne({
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
  });
  if (session) {
    findQuery.session(session);
  }
  let accountsReceivableAccount = await findQuery;

  // If Accounts Receivable doesn't exist, create it
  if (!accountsReceivableAccount) {
    accountsReceivableAccount = new ChartOfAccounts({
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
    });
    await accountsReceivableAccount.save({ session });
  }

  // If customer has an individual account (like "Customer - NAME"), migrate to general account
  if (customer.ledgerAccount) {
    const findByIdQuery = ChartOfAccounts.findById(customer.ledgerAccount);
    if (session) {
      findByIdQuery.session(session);
    }
    const existingAccount = await findByIdQuery;
    if (existingAccount && existingAccount.accountName?.startsWith('Customer -')) {
      // This is an individual customer account - we should migrate to the general account
      // Deactivate the individual account
      const updateOptions = session ? { session } : {};
      await ChartOfAccounts.findByIdAndUpdate(
        customer.ledgerAccount,
        {
          isActive: false,
          updatedBy: userId || undefined
        },
        updateOptions
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
    account = await ChartOfAccounts.findByIdAndUpdate(
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
  await ChartOfAccounts.findByIdAndUpdate(
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
  const customers = await Customer.find({
    $or: [
      { ledgerAccount: { $exists: false } }, 
      { ledgerAccount: null }
    ]
  });

  // Also find customers with individual accounts to migrate them
  const customersWithIndividualAccounts = await Customer.find({
    ledgerAccount: { $exists: true, $ne: null }
  }).populate('ledgerAccount');

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
  const suppliers = await Supplier.find({
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

