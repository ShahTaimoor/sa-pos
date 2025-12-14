const ChartOfAccounts = require('../models/ChartOfAccounts');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const CashPayment = require('../models/CashPayment');
const BankPayment = require('../models/BankPayment');
const RecurringExpense = require('../models/RecurringExpense');
const JournalVoucher = require('../models/JournalVoucher');
const { basicAccounts } = require('../config/basicAccounts');

const canonicalAccountCodes = new Set(basicAccounts.map((account) => account.accountCode));

const normalizeAccountName = (name = '') =>
  name.trim().toLowerCase().replace(/\s+/g, ' ');

const pickPrimaryAccount = (candidates = []) => {
  if (!candidates.length) return null;

  const canonical = candidates.find((account) => canonicalAccountCodes.has(account.accountCode));
  if (canonical) return canonical;

  const systemAccount = candidates.find((account) => account.isSystemAccount);
  if (systemAccount) return systemAccount;

  const sorted = [...candidates].sort((a, b) => {
    if (a.accountCode && b.accountCode) {
      return a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true });
    }
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });

  return sorted[0];
};

async function reassignAccountReferences(sourceAccount, targetAccount) {
  const sourceId = sourceAccount._id;
  const targetId = targetAccount._id;

  const directFieldUpdates = [
    { model: Customer, field: 'ledgerAccount' },
    { model: Supplier, field: 'ledgerAccount' },
    { model: CashPayment, field: 'expenseAccount' },
    { model: BankPayment, field: 'expenseAccount' },
    { model: RecurringExpense, field: 'expenseAccount' },
    { model: ChartOfAccounts, field: 'parentAccount' },
  ];

  for (const { model, field } of directFieldUpdates) {
    const result = await model.updateMany(
      { [field]: sourceId },
      { $set: { [field]: targetId } }
    );
    if (result.modifiedCount > 0) {
      console.log(
        `🔄 Updated ${result.modifiedCount} ${model.collection.collectionName} documents referencing duplicate account ${sourceAccount.accountName}`
      );
    }
  }

  const journalVoucherResult = await JournalVoucher.updateMany(
    { 'entries.account': sourceId },
    {
      $set: {
        'entries.$[entry].account': targetId,
        'entries.$[entry].accountCode': targetAccount.accountCode,
        'entries.$[entry].accountName': targetAccount.accountName,
      },
    },
    {
      arrayFilters: [{ 'entry.account': sourceId }],
    }
  );

  if (journalVoucherResult.modifiedCount > 0) {
    console.log(
      `🔄 Updated ${journalVoucherResult.modifiedCount} journal vouchers referencing duplicate account ${sourceAccount.accountName}`
    );
  }
}

async function resolveDuplicateAccounts() {
  try {
    const accounts = await ChartOfAccounts.find().lean();
    const grouped = accounts.reduce((acc, account) => {
      const key = `${account.accountType || 'unknown'}::${normalizeAccountName(account.accountName)}`;
      if (!acc.has(key)) acc.set(key, []);
      acc.get(key).push(account);
      return acc;
    }, new Map());

    for (const [, duplicates] of grouped.entries()) {
      if (!duplicates || duplicates.length <= 1) continue;

      const primary = pickPrimaryAccount(duplicates);
      if (!primary) continue;

      console.log(`⚖️ Resolving duplicates for "${primary.accountName}" (${duplicates.length} entries)`);

      for (const account of duplicates) {
        if (String(account._id) === String(primary._id)) continue;

        await reassignAccountReferences(account, primary);
        await ChartOfAccounts.deleteOne({ _id: account._id });
        console.log(`🗑️ Removed duplicate account ${account.accountCode} - ${account.accountName}`);
      }
    }
  } catch (error) {
    console.error('❌ Failed to resolve duplicate chart-of-accounts entries:', error.message);
  }
}

/**
 * Critical POS System Accounts - These must always exist and be marked as system accounts
 * These accounts are hardcoded in the system and used for sales and purchase transactions
 */
const criticalPOSAccounts = [
  { accountCode: '1110', accountName: 'Cash', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2, isSystemAccount: true, description: 'Cash account for cash receipts and payments - POS System Account' },
  { accountCode: '1120', accountName: 'Bank', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2, isSystemAccount: true, description: 'Bank account for bank receipts and payments - POS System Account' },
  { accountCode: '1130', accountName: 'Accounts Receivable', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2, isSystemAccount: true, description: 'Money owed by customers from sales - POS System Account' },
  { accountCode: '1140', accountName: 'Inventory', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2, isSystemAccount: true, description: 'Product inventory for sales - POS System Account' },
  { accountCode: '2110', accountName: 'Accounts Payable', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2, isSystemAccount: true, description: 'Money owed to suppliers from purchases - POS System Account' },
  { accountCode: '4100', accountName: 'Sales Revenue', accountType: 'revenue', accountCategory: 'sales_revenue', normalBalance: 'credit', level: 1, isSystemAccount: true, description: 'Revenue from sales transactions - POS System Account' },
  { accountCode: '5100', accountName: 'Cost of Goods Sold', accountType: 'expense', accountCategory: 'cost_of_goods_sold', normalBalance: 'debit', level: 1, isSystemAccount: true, description: 'Cost of products sold - POS System Account' }
];

/**
 * Ensure critical POS system accounts exist and are properly configured
 * This function runs on every server startup to guarantee these accounts exist
 */
async function ensureCriticalPOSAccounts() {
  try {
    let createdCount = 0;
    let updatedCount = 0;

    for (const account of criticalPOSAccounts) {
      try {
        const existingAccount = await ChartOfAccounts.findOne({ accountCode: account.accountCode });
        
        if (!existingAccount) {
          // Create if doesn't exist
          await ChartOfAccounts.create(account);
          createdCount++;
        } else {
          // Update if exists but not properly configured as system account
          const needsUpdate = 
            existingAccount.isSystemAccount !== true ||
            existingAccount.accountName !== account.accountName ||
            existingAccount.accountType !== account.accountType ||
            existingAccount.accountCategory !== account.accountCategory ||
            existingAccount.normalBalance !== account.normalBalance ||
            existingAccount.isActive !== true;
          
          if (needsUpdate) {
            await ChartOfAccounts.findByIdAndUpdate(
              existingAccount._id,
              {
                isSystemAccount: true,
                accountName: account.accountName,
                accountType: account.accountType,
                accountCategory: account.accountCategory,
                normalBalance: account.normalBalance,
                level: account.level,
                description: account.description,
                isActive: true,
                allowDirectPosting: true
              },
              { new: true }
            );
            updatedCount++;
          }
        }
      } catch (error) {
        console.error(`❌ Error ensuring critical account ${account.accountCode}:`, error.message);
      }
    }

    if (createdCount > 0 || updatedCount > 0) {
      console.log(`✅ Critical POS accounts ensured: ${createdCount} created, ${updatedCount} updated`);
    }
  } catch (error) {
    console.error('❌ Failed to ensure critical POS accounts:', error.message);
  }
}

/**
 * Ensure the basic POS accounts exist in Chart of Accounts.
 * Accounts are keyed by accountCode, so the seeder can safely run multiple times.
 */
async function seedBasicAccounts() {
  try {
    // ALWAYS ensure critical POS accounts first (these are hardcoded in the system)
    await ensureCriticalPOSAccounts();

    const existingAccounts = await ChartOfAccounts.find(
      { accountCode: { $in: basicAccounts.map((account) => account.accountCode) } },
      '_id accountCode'
    ).lean();

    const accountIdByCode = {};
    existingAccounts.forEach((account) => {
      accountIdByCode[account.accountCode] = account._id;
    });

    for (const account of basicAccounts) {
      // Skip if this account already exists
      if (accountIdByCode[account.accountCode]) {
        continue;
      }

      // Resolve parent reference by code, if provided
      let parentAccountId = null;
      if (account.parentCode) {
        parentAccountId = accountIdByCode[account.parentCode] || null;
      }

      const newAccount = new ChartOfAccounts({
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        accountCategory: account.accountCategory,
        normalBalance: account.normalBalance,
        allowDirectPosting: account.allowDirectPosting !== false,
        isSystemAccount: Boolean(account.isSystemAccount),
        parentAccount: parentAccountId,
        level: account.level ?? 0,
        description: account.description || 'POS default account',
      });

      const saved = await newAccount.save();
      accountIdByCode[account.accountCode] = saved._id;
    }

    if (Object.keys(accountIdByCode).length > existingAccounts.length) {
      console.log('✅ Basic chart-of-accounts entries verified/seeded');
    }

    await resolveDuplicateAccounts();
  } catch (error) {
    console.error('❌ Failed to seed basic chart of accounts:', error.message);
  }
}

module.exports = {
  seedBasicAccounts,
  resolveDuplicateAccounts,
  ensureCriticalPOSAccounts,
};

