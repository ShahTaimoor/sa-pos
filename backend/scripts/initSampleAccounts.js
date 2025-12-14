const mongoose = require('mongoose');
require('dotenv').config();

const ChartOfAccounts = require('../models/ChartOfAccounts');

const sampleAccounts = [
  // ASSETS - Current Assets
  { accountCode: '1001', accountName: 'Cash in Hand', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', openingBalance: 0, description: 'Physical cash available in the business' },
  { accountCode: '1002', accountName: 'Bank Account - Main', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', openingBalance: 0, description: 'Primary business bank account' },
  { accountCode: '1003', accountName: 'Bank Account - Savings', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', openingBalance: 0, description: 'Business savings account' },
  { accountCode: '1004', accountName: 'Petty Cash', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', openingBalance: 0, description: 'Small cash fund for minor expenses' },
  { accountCode: '1101', accountName: 'Short-term Investments', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', openingBalance: 0, description: 'Short-term marketable securities' },
  { accountCode: '1201', accountName: 'Accounts Receivable', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', openingBalance: 0, description: 'Money owed by customers' },
  { accountCode: '1202', accountName: 'Notes Receivable', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', openingBalance: 0, description: 'Promissory notes from customers' },
  { accountCode: '1203', accountName: 'Allowance for Doubtful Accounts', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'credit', openingBalance: 0, description: 'Estimated uncollectible accounts' },
  { accountCode: '1301', accountName: 'Inventory - Raw Materials', accountType: 'asset', accountCategory: 'inventory', normalBalance: 'debit', openingBalance: 0, description: 'Raw materials inventory' },
  { accountCode: '1302', accountName: 'Inventory - Finished Goods', accountType: 'asset', accountCategory: 'inventory', normalBalance: 'debit', openingBalance: 0, description: 'Finished products inventory' },
  { accountCode: '1303', accountName: 'Inventory - Work in Progress', accountType: 'asset', accountCategory: 'inventory', normalBalance: 'debit', openingBalance: 0, description: 'Partially completed products' },
  { accountCode: '1401', accountName: 'Prepaid Insurance', accountType: 'asset', accountCategory: 'prepaid_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Insurance premiums paid in advance' },
  { accountCode: '1402', accountName: 'Prepaid Rent', accountType: 'asset', accountCategory: 'prepaid_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Rent payments made in advance' },
  
  // ASSETS - Fixed Assets
  { accountCode: '1501', accountName: 'Equipment', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'debit', openingBalance: 0, description: 'Business equipment and machinery' },
  { accountCode: '1502', accountName: 'Vehicles', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'debit', openingBalance: 0, description: 'Company vehicles' },
  { accountCode: '1503', accountName: 'Furniture & Fixtures', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'debit', openingBalance: 0, description: 'Office furniture and fixtures' },
  { accountCode: '1504', accountName: 'Computer Equipment', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'debit', openingBalance: 0, description: 'Computers, laptops, and IT equipment' },
  { accountCode: '1505', accountName: 'Accumulated Depreciation - Equipment', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'credit', openingBalance: 0, description: 'Accumulated depreciation on equipment' },
  { accountCode: '1506', accountName: 'Accumulated Depreciation - Vehicles', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'credit', openingBalance: 0, description: 'Accumulated depreciation on vehicles' },
  { accountCode: '1601', accountName: 'Land', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'debit', openingBalance: 0, description: 'Business property land' },
  { accountCode: '1602', accountName: 'Buildings', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'debit', openingBalance: 0, description: 'Business buildings and structures' },
  { accountCode: '1603', accountName: 'Accumulated Depreciation - Buildings', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'credit', openingBalance: 0, description: 'Accumulated depreciation on buildings' },
  
  // LIABILITIES - Current Liabilities
  { accountCode: '2001', accountName: 'Accounts Payable', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', openingBalance: 0, description: 'Money owed to suppliers' },
  { accountCode: '2002', accountName: 'Sales Tax Payable', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', openingBalance: 0, description: 'Sales tax collected but not yet paid' },
  { accountCode: '2003', accountName: 'Accrued Expenses', accountType: 'liability', accountCategory: 'accrued_expenses', normalBalance: 'credit', openingBalance: 0, description: 'Expenses incurred but not yet paid' },
  { accountCode: '2004', accountName: 'Accrued Salaries', accountType: 'liability', accountCategory: 'accrued_expenses', normalBalance: 'credit', openingBalance: 0, description: 'Salaries earned but not yet paid' },
  { accountCode: '2005', accountName: 'Accrued Interest', accountType: 'liability', accountCategory: 'accrued_expenses', normalBalance: 'credit', openingBalance: 0, description: 'Interest expense accrued but not paid' },
  { accountCode: '2006', accountName: 'Unearned Revenue', accountType: 'liability', accountCategory: 'deferred_revenue', normalBalance: 'credit', openingBalance: 0, description: 'Revenue received but not yet earned' },
  { accountCode: '2007', accountName: 'Short-term Notes Payable', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', openingBalance: 0, description: 'Short-term promissory notes' },
  
  // LIABILITIES - Long-term Liabilities
  { accountCode: '2501', accountName: 'Long-term Loan', accountType: 'liability', accountCategory: 'long_term_liabilities', normalBalance: 'credit', openingBalance: 0, description: 'Long-term business loan' },
  
  // EQUITY
  { accountCode: '3001', accountName: "Owner's Capital", accountType: 'equity', accountCategory: 'owner_equity', normalBalance: 'credit', openingBalance: 0, description: "Owner's initial investment in the business" },
  { accountCode: '3002', accountName: 'Retained Earnings', accountType: 'equity', accountCategory: 'retained_earnings', normalBalance: 'credit', openingBalance: 0, description: 'Accumulated profits retained in the business' },
  
  // REVENUE
  { accountCode: '4001', accountName: 'Sales Revenue', accountType: 'revenue', accountCategory: 'sales_revenue', normalBalance: 'credit', openingBalance: 0, description: 'Revenue from product sales' },
  { accountCode: '4002', accountName: 'Service Revenue', accountType: 'revenue', accountCategory: 'sales_revenue', normalBalance: 'credit', openingBalance: 0, description: 'Revenue from services provided' },
  { accountCode: '4003', accountName: 'Other Revenue', accountType: 'revenue', accountCategory: 'other_revenue', normalBalance: 'credit', openingBalance: 0, description: 'Other sources of revenue' },
  
  // EXPENSES - Cost of Goods Sold
  { accountCode: '5001', accountName: 'Cost of Goods Sold', accountType: 'expense', accountCategory: 'cost_of_goods_sold', normalBalance: 'debit', openingBalance: 0, description: 'Direct costs of producing goods sold' },
  
  // EXPENSES - Operating Expenses
  { accountCode: '5101', accountName: 'Rent Expense', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Monthly rent payments' },
  { accountCode: '5102', accountName: 'Utilities Expense', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Electricity, water, gas expenses' },
  { accountCode: '5103', accountName: 'Office Supplies', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Office supplies and materials' },
  { accountCode: '5104', accountName: 'Insurance Expense', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Business insurance premiums' },
  { accountCode: '5105', accountName: 'Depreciation Expense', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Depreciation on fixed assets' },
  { accountCode: '5201', accountName: 'Salaries Expense', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Employee salaries and wages' },
  { accountCode: '5202', accountName: 'Marketing Expense', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Advertising and marketing costs' },
  { accountCode: '5203', accountName: 'Travel Expense', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Business travel and transportation' },
  { accountCode: '5204', accountName: 'Telephone Expense', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Phone and communication costs' },
  { accountCode: '5205', accountName: 'Internet Expense', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Internet and data services' },
  
  // EXPENSES - Other Expenses
  { accountCode: '5301', accountName: 'Bank Charges', accountType: 'expense', accountCategory: 'other_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Bank service charges and fees' },
  { accountCode: '5302', accountName: 'Professional Fees', accountType: 'expense', accountCategory: 'other_expenses', normalBalance: 'debit', openingBalance: 0, description: 'Legal, accounting, and consulting fees' }
];

async function initializeSampleAccounts() {
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

    // Check if accounts already exist
    const existingCount = await ChartOfAccounts.countDocuments();
    
    if (existingCount > 0) {
      console.log(`📋 Chart of Accounts already has ${existingCount} accounts`);
      console.log('Skipping initialization...');
    } else {
      console.log('⚠️  No accounts found, creating sample Chart of Accounts...');
      
      for (const account of sampleAccounts) {
        await ChartOfAccounts.create(account);
        console.log(`✓ Created: ${account.accountCode} - ${account.accountName} (${account.accountType}/${account.accountCategory})`);
      }
      
      console.log(`\n✅ Created ${sampleAccounts.length} sample accounts!`);
    }

    console.log('\n🎉 Sample Accounts initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

initializeSampleAccounts();
