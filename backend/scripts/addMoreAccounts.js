const mongoose = require('mongoose');
require('dotenv').config();

const ChartOfAccounts = require('../models/ChartOfAccounts');

const additionalAccounts = [
  // More ASSETS - Current Assets
  { accountCode: '1005', accountName: 'Cash Register', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', openingBalance: 0, description: 'Cash in register drawer' },
  { accountCode: '1006', accountName: 'Bank Account - Payroll', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', openingBalance: 0, description: 'Payroll processing bank account' },
  { accountCode: '1102', accountName: 'Marketable Securities', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', openingBalance: 0, description: 'Short-term investments in securities' },
  { accountCode: '1204', accountName: 'Customer Deposits', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', openingBalance: 0, description: 'Customer advance payments' },
  
  // More ASSETS - Inventory
  { accountCode: '1304', accountName: 'Inventory - Consumables', accountType: 'asset', accountCategory: 'inventory', normalBalance: 'debit', openingBalance: 0, description: 'Consumable supplies inventory' },
  { accountCode: '1305', accountName: 'Inventory - Packaging', accountType: 'asset', accountCategory: 'inventory', normalBalance: 'debit', openingBalance: 0, description: 'Packaging materials inventory' },
  
  // More ASSETS - Prepaid Expenses
  { accountCode: '1403', accountName: 'Prepaid Advertising', accountType: 'asset', accountCategory: 'prepaid_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Advertising costs paid in advance' },
  { accountCode: '1404', accountName: 'Prepaid Maintenance', accountType: 'asset', accountCategory: 'prepaid_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Maintenance contracts paid in advance' },
  
  // More LIABILITIES - Current Liabilities
  { accountCode: '2008', accountName: 'Wages Payable', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', openingBalance: 0, description: 'Employee wages owed but not paid' },
  { accountCode: '2009', accountName: 'Interest Payable', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', openingBalance: 0, description: 'Interest expense owed but not paid' },
  { accountCode: '2010', accountName: 'Income Tax Payable', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', openingBalance: 0, description: 'Income tax owed to government' },
  
  // More LIABILITIES - Long-term Liabilities
  { accountCode: '2502', accountName: 'Mortgage Payable', accountType: 'liability', accountCategory: 'long_term_liabilities', normalBalance: 'credit', openingBalance: 0, description: 'Long-term mortgage on property' },
  { accountCode: '2503', accountName: 'Equipment Loan', accountType: 'liability', accountCategory: 'long_term_liabilities', normalBalance: 'credit', openingBalance: 0, description: 'Long-term loan for equipment purchase' },
  
  // More EQUITY
  { accountCode: '3003', accountName: 'Additional Paid-in Capital', accountType: 'equity', accountCategory: 'owner_equity', normalBalance: 'credit', openingBalance: 0, description: 'Additional capital contributed by owners' },
  { accountCode: '3004', accountName: 'Drawing Account', accountType: 'equity', accountCategory: 'owner_equity', normalBalance: 'debit', openingBalance: 0, description: 'Owner withdrawals from business' },
  
  // More REVENUE
  { accountCode: '4004', accountName: 'Interest Revenue', accountType: 'revenue', accountCategory: 'other_revenue', normalBalance: 'credit', openingBalance: 0, description: 'Interest earned on investments' },
  { accountCode: '4005', accountName: 'Rental Revenue', accountType: 'revenue', accountCategory: 'other_revenue', normalBalance: 'credit', openingBalance: 0, description: 'Revenue from property rental' },
  { accountCode: '4006', accountName: 'Commission Revenue', accountType: 'revenue', accountCategory: 'other_revenue', normalBalance: 'credit', openingBalance: 0, description: 'Commission income from services' },
  
  // More EXPENSES - Operating Expenses
  { accountCode: '5206', accountName: 'Repairs & Maintenance', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Equipment and facility maintenance' },
  { accountCode: '5207', accountName: 'Training Expense', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Employee training and development' },
  { accountCode: '5208', accountName: 'Software License', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Software licensing and subscriptions' },
  { accountCode: '5209', accountName: 'Security Expense', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Security services and equipment' },
  { accountCode: '5210', accountName: 'Cleaning Expense', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Cleaning and janitorial services' },
  
  // More EXPENSES - Other Expenses
  { accountCode: '5303', accountName: 'Interest Expense', accountType: 'expense', accountCategory: 'other_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Interest paid on loans and credit' },
  { accountCode: '5304', accountName: 'Bad Debt Expense', accountType: 'expense', accountCategory: 'other_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Uncollectible accounts receivable' },
  { accountCode: '5305', accountName: 'Loss on Sale of Assets', accountType: 'expense', accountCategory: 'other_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Loss from disposal of fixed assets' }
];

async function addMoreAccounts() {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('❌ Error: MONGODB_URI environment variable is required.');
      console.error('   Please set it in your .env file or as an environment variable.');
      process.exit(1);
    }
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');

    console.log('📋 Adding additional third-level accounts...');
    
    let addedCount = 0;
    let skippedCount = 0;
    
    for (const account of additionalAccounts) {
      // Check if account already exists
      const existingAccount = await ChartOfAccounts.findOne({ accountCode: account.accountCode });
      
      if (existingAccount) {
        console.log(`⚠️  Skipped: ${account.accountCode} - ${account.accountName} (already exists)`);
        skippedCount++;
      } else {
        await ChartOfAccounts.create(account);
        console.log(`✓ Added: ${account.accountCode} - ${account.accountName} (${account.accountType}/${account.accountCategory})`);
        addedCount++;
      }
    }
    
    console.log(`\n✅ Added ${addedCount} new accounts, skipped ${skippedCount} existing accounts!`);

    console.log('\n🎉 Additional Accounts setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addMoreAccounts();
