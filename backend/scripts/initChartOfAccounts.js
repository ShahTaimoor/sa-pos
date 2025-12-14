const mongoose = require('mongoose');
require('dotenv').config();

const ChartOfAccounts = require('../models/ChartOfAccounts');

const defaultAccounts = [
  // ASSETS
  { accountCode: '1000', accountName: 'Assets', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 0, allowDirectPosting: false, isSystemAccount: true },
  { accountCode: '1100', accountName: 'Current Assets', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 1, allowDirectPosting: false },
  { accountCode: '1110', accountName: 'Cash', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2, isSystemAccount: true, description: 'Cash account for cash receipts and payments - POS System Account' },
  { accountCode: '1120', accountName: 'Bank', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2, isSystemAccount: true, description: 'Bank account for bank receipts and payments - POS System Account' },
  { accountCode: '1130', accountName: 'Accounts Receivable', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2, isSystemAccount: true, description: 'Money owed by customers from sales - POS System Account' },
  { accountCode: '1140', accountName: 'Inventory', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2, isSystemAccount: true, description: 'Product inventory for sales - POS System Account' },
  { accountCode: '1200', accountName: 'Fixed Assets', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'debit', level: 1, allowDirectPosting: false },
  { accountCode: '1210', accountName: 'Equipment', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'debit', level: 2 },
  { accountCode: '1220', accountName: 'Furniture & Fixtures', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'debit', level: 2 },

  // LIABILITIES
  { accountCode: '2000', accountName: 'Liabilities', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 0, allowDirectPosting: false, isSystemAccount: true },
  { accountCode: '2100', accountName: 'Current Liabilities', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 1, allowDirectPosting: false },
  { accountCode: '2110', accountName: 'Accounts Payable', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2, isSystemAccount: true, description: 'Money owed to suppliers from purchases - POS System Account' },
  { accountCode: '2120', accountName: 'Sales Tax Payable', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '2200', accountName: 'Long-term Liabilities', accountType: 'liability', accountCategory: 'long_term_liabilities', normalBalance: 'credit', level: 1, allowDirectPosting: false },
  { accountCode: '2210', accountName: 'Loans Payable', accountType: 'liability', accountCategory: 'long_term_liabilities', normalBalance: 'credit', level: 2 },

  // EQUITY
  { accountCode: '3000', accountName: 'Equity', accountType: 'equity', accountCategory: 'owner_equity', normalBalance: 'credit', level: 0, allowDirectPosting: false, isSystemAccount: true },
  { accountCode: '3100', accountName: 'Owner Capital', accountType: 'equity', accountCategory: 'owner_equity', normalBalance: 'credit', level: 1 },
  { accountCode: '3200', accountName: 'Retained Earnings', accountType: 'equity', accountCategory: 'retained_earnings', normalBalance: 'credit', level: 1, isSystemAccount: true },

  // REVENUE
  { accountCode: '4000', accountName: 'Revenue', accountType: 'revenue', accountCategory: 'sales_revenue', normalBalance: 'credit', level: 0, allowDirectPosting: false, isSystemAccount: true },
  { accountCode: '4100', accountName: 'Sales Revenue', accountType: 'revenue', accountCategory: 'sales_revenue', normalBalance: 'credit', level: 1, isSystemAccount: true, description: 'Revenue from sales transactions - POS System Account' },
  { accountCode: '4110', accountName: 'Retail Sales', accountType: 'revenue', accountCategory: 'sales_revenue', normalBalance: 'credit', level: 2 },
  { accountCode: '4120', accountName: 'Wholesale Sales', accountType: 'revenue', accountCategory: 'sales_revenue', normalBalance: 'credit', level: 2 },
  { accountCode: '4200', accountName: 'Other Revenue', accountType: 'revenue', accountCategory: 'other_revenue', normalBalance: 'credit', level: 1 },

  // EXPENSES
  { accountCode: '5000', accountName: 'Expenses', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 0, allowDirectPosting: false, isSystemAccount: true },
  
  // COST OF GOODS SOLD
  { accountCode: '5100', accountName: 'Cost of Goods Sold', accountType: 'expense', accountCategory: 'cost_of_goods_sold', normalBalance: 'debit', level: 1, isSystemAccount: true, description: 'Cost of products sold - POS System Account' },
  { accountCode: '5110', accountName: 'Purchase Cost', accountType: 'expense', accountCategory: 'cost_of_goods_sold', normalBalance: 'debit', level: 2 },
  { accountCode: '5120', accountName: 'Freight In', accountType: 'expense', accountCategory: 'cost_of_goods_sold', normalBalance: 'debit', level: 2 },
  { accountCode: '5130', accountName: 'Inventory Adjustment', accountType: 'expense', accountCategory: 'cost_of_goods_sold', normalBalance: 'debit', level: 2 },
  
  // OPERATING EXPENSES
  { accountCode: '5200', accountName: 'Operating Expenses', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 1, allowDirectPosting: false },
  
  // Personnel Expenses
  { accountCode: '5210', accountName: 'Salaries & Wages', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5215', accountName: 'Employee Benefits', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5220', accountName: 'Payroll Taxes', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5225', accountName: 'Contractor Fees', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  
  // Facility Expenses
  { accountCode: '5230', accountName: 'Rent', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5235', accountName: 'Utilities', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5240', accountName: 'Internet & Phone', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5245', accountName: 'Insurance', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5250', accountName: 'Maintenance & Repairs', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  
  // Office & Administrative
  { accountCode: '5260', accountName: 'Office Supplies', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5265', accountName: 'Software & Subscriptions', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5270', accountName: 'Professional Services', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5275', accountName: 'Legal & Accounting', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5280', accountName: 'Bank Fees', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  
  // Marketing & Sales
  { accountCode: '5290', accountName: 'Marketing & Advertising', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5295', accountName: 'Website & Hosting', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5300', accountName: 'Social Media Marketing', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5305', accountName: 'Sales Commissions', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  
  // Technology & Equipment
  { accountCode: '5310', accountName: 'Computer Equipment', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5315', accountName: 'Office Equipment', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5320', accountName: 'Equipment Depreciation', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  
  // Travel & Transportation
  { accountCode: '5330', accountName: 'Travel Expenses', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5335', accountName: 'Vehicle Expenses', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5340', accountName: 'Fuel & Transportation', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  
  // OTHER EXPENSES
  { accountCode: '5400', accountName: 'Other Expenses', accountType: 'expense', accountCategory: 'other_expenses', normalBalance: 'debit', level: 1, allowDirectPosting: false },
  { accountCode: '5410', accountName: 'Interest Expense', accountType: 'expense', accountCategory: 'other_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5420', accountName: 'Bad Debts', accountType: 'expense', accountCategory: 'other_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5430', accountName: 'Miscellaneous Expenses', accountType: 'expense', accountCategory: 'other_expenses', normalBalance: 'debit', level: 2 },
  
  // RETAIL SPECIFIC ACCOUNTS
  { accountCode: '1150', accountName: 'Merchandise Inventory', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2, isSystemAccount: true },
  { accountCode: '1160', accountName: 'Prepaid Expenses', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2 },
  { accountCode: '1170', accountName: 'Store Supplies', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2 },
  { accountCode: '1180', accountName: 'Customer Deposits', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '4130', accountName: 'Service Revenue', accountType: 'revenue', accountCategory: 'sales_revenue', normalBalance: 'credit', level: 2 },
  { accountCode: '4140', accountName: 'Gift Card Sales', accountType: 'revenue', accountCategory: 'sales_revenue', normalBalance: 'credit', level: 2 },
  { accountCode: '4150', accountName: 'Layaway Sales', accountType: 'revenue', accountCategory: 'sales_revenue', normalBalance: 'credit', level: 2 },
  { accountCode: '5350', accountName: 'Store Supplies Expense', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5360', accountName: 'Security & Loss Prevention', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5370', accountName: 'Point of Sale System', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  
  // WHOLESALE SPECIFIC ACCOUNTS
  { accountCode: '1190', accountName: 'Raw Materials Inventory', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2 },
  { accountCode: '1195', accountName: 'Work in Progress', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2 },
  { accountCode: '2130', accountName: 'Trade Payables', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '2140', accountName: 'Accrued Purchases', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '4160', accountName: 'Bulk Sales Revenue', accountType: 'revenue', accountCategory: 'sales_revenue', normalBalance: 'credit', level: 2 },
  { accountCode: '4170', accountName: 'Export Sales', accountType: 'revenue', accountCategory: 'sales_revenue', normalBalance: 'credit', level: 2 },
  { accountCode: '4180', accountName: 'Volume Discounts Given', accountType: 'revenue', accountCategory: 'sales_revenue', normalBalance: 'debit', level: 2 },
  { accountCode: '5140', accountName: 'Raw Material Costs', accountType: 'expense', accountCategory: 'cost_of_goods_sold', normalBalance: 'debit', level: 2 },
  { accountCode: '5150', accountName: 'Manufacturing Overhead', accountType: 'expense', accountCategory: 'cost_of_goods_sold', normalBalance: 'debit', level: 2 },
  { accountCode: '5160', accountName: 'Quality Control Costs', accountType: 'expense', accountCategory: 'cost_of_goods_sold', normalBalance: 'debit', level: 2 },
  { accountCode: '5380', accountName: 'Warehouse Expenses', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5390', accountName: 'Shipping & Handling', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  
  // SERVICE BUSINESS ACCOUNTS
  { accountCode: '1230', accountName: 'Service Equipment', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'debit', level: 2 },
  { accountCode: '1240', accountName: 'Intangible Assets', accountType: 'asset', accountCategory: 'other_assets', normalBalance: 'debit', level: 2 },
  { accountCode: '2150', accountName: 'Unearned Revenue', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '2160', accountName: 'Deferred Revenue', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '4190', accountName: 'Consulting Revenue', accountType: 'revenue', accountCategory: 'other_revenue', normalBalance: 'credit', level: 2 },
  { accountCode: '4201', accountName: 'Subscription Revenue', accountType: 'revenue', accountCategory: 'other_revenue', normalBalance: 'credit', level: 2 },
  { accountCode: '4210', accountName: 'Training Revenue', accountType: 'revenue', accountCategory: 'other_revenue', normalBalance: 'credit', level: 2 },
  { accountCode: '5401', accountName: 'Service Delivery Costs', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5411', accountName: 'Certification & Licensing', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  
  // MANUFACTURING ACCOUNTS
  { accountCode: '1250', accountName: 'Manufacturing Equipment', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'debit', level: 2 },
  { accountCode: '1260', accountName: 'Accumulated Depreciation - Equipment', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'credit', level: 2 },
  { accountCode: '1270', accountName: 'Factory Building', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'debit', level: 2 },
  { accountCode: '1280', accountName: 'Accumulated Depreciation - Building', accountType: 'asset', accountCategory: 'fixed_assets', normalBalance: 'credit', level: 2 },
  { accountCode: '2170', accountName: 'Wages Payable', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '2180', accountName: 'Factory Overhead Applied', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '5170', accountName: 'Direct Materials', accountType: 'expense', accountCategory: 'cost_of_goods_sold', normalBalance: 'debit', level: 2 },
  { accountCode: '5180', accountName: 'Direct Labor', accountType: 'expense', accountCategory: 'cost_of_goods_sold', normalBalance: 'debit', level: 2 },
  { accountCode: '5190', accountName: 'Factory Overhead', accountType: 'expense', accountCategory: 'cost_of_goods_sold', normalBalance: 'debit', level: 2 },
  { accountCode: '5421', accountName: 'Factory Utilities', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5431', accountName: 'Factory Maintenance', accountType: 'expense', accountCategory: 'operating_expenses', normalBalance: 'debit', level: 2 },
  
  // ADDITIONAL COMMON ACCOUNTS
  { accountCode: '1290', accountName: 'Petty Cash', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2 },
  { accountCode: '1300', accountName: 'Short-term Investments', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2 },
  { accountCode: '1310', accountName: 'Notes Receivable', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2 },
  { accountCode: '1320', accountName: 'Allowance for Doubtful Accounts', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'credit', level: 2 },
  { accountCode: '1330', accountName: 'Prepaid Insurance', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2 },
  { accountCode: '1340', accountName: 'Prepaid Rent', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2 },
  { accountCode: '2190', accountName: 'Accrued Expenses', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '2200', accountName: 'Accrued Interest', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '2210', accountName: 'Accrued Salaries', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '2220', accountName: 'Income Tax Payable', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '2230', accountName: 'Employee Benefits Payable', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '2240', accountName: 'Customer Advances', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '2250', accountName: 'Gift Cards Outstanding', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '2300', accountName: 'Mortgage Payable', accountType: 'liability', accountCategory: 'long_term_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '2310', accountName: 'Equipment Loans', accountType: 'liability', accountCategory: 'long_term_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '2320', accountName: 'Line of Credit', accountType: 'liability', accountCategory: 'long_term_liabilities', normalBalance: 'credit', level: 2 },
  { accountCode: '3300', accountName: 'Owner Drawings', accountType: 'equity', accountCategory: 'owner_equity', normalBalance: 'debit', level: 2 },
  { accountCode: '3400', accountName: 'Capital Contributions', accountType: 'equity', accountCategory: 'owner_equity', normalBalance: 'credit', level: 2 },
  { accountCode: '4221', accountName: 'Interest Income', accountType: 'revenue', accountCategory: 'other_revenue', normalBalance: 'credit', level: 2 },
  { accountCode: '4231', accountName: 'Rental Income', accountType: 'revenue', accountCategory: 'other_revenue', normalBalance: 'credit', level: 2 },
  { accountCode: '4241', accountName: 'Gain on Sale of Assets', accountType: 'revenue', accountCategory: 'other_revenue', normalBalance: 'credit', level: 2 },
  { accountCode: '4251', accountName: 'Discounts Earned', accountType: 'revenue', accountCategory: 'other_revenue', normalBalance: 'credit', level: 2 },
  { accountCode: '5441', accountName: 'Loss on Sale of Assets', accountType: 'expense', accountCategory: 'other_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5451', accountName: 'Penalties & Fines', accountType: 'expense', accountCategory: 'other_expenses', normalBalance: 'debit', level: 2 },
  { accountCode: '5461', accountName: 'Foreign Exchange Loss', accountType: 'expense', accountCategory: 'other_expenses', normalBalance: 'debit', level: 2 },
];

// Critical POS System Accounts - These must always exist
const criticalPOSAccounts = [
  { accountCode: '1110', accountName: 'Cash', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2, isSystemAccount: true, description: 'Cash account for cash receipts and payments - POS System Account' },
  { accountCode: '1120', accountName: 'Bank', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2, isSystemAccount: true, description: 'Bank account for bank receipts and payments - POS System Account' },
  { accountCode: '1130', accountName: 'Accounts Receivable', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2, isSystemAccount: true, description: 'Money owed by customers from sales - POS System Account' },
  { accountCode: '1140', accountName: 'Inventory', accountType: 'asset', accountCategory: 'current_assets', normalBalance: 'debit', level: 2, isSystemAccount: true, description: 'Product inventory for sales - POS System Account' },
  { accountCode: '2110', accountName: 'Accounts Payable', accountType: 'liability', accountCategory: 'current_liabilities', normalBalance: 'credit', level: 2, isSystemAccount: true, description: 'Money owed to suppliers from purchases - POS System Account' },
  { accountCode: '4100', accountName: 'Sales Revenue', accountType: 'revenue', accountCategory: 'sales_revenue', normalBalance: 'credit', level: 1, isSystemAccount: true, description: 'Revenue from sales transactions - POS System Account' },
  { accountCode: '5100', accountName: 'Cost of Goods Sold', accountType: 'expense', accountCategory: 'cost_of_goods_sold', normalBalance: 'debit', level: 1, isSystemAccount: true, description: 'Cost of products sold - POS System Account' }
];

async function ensureCriticalPOSAccounts() {
  console.log('\n🔧 Ensuring critical POS system accounts exist...');
  let createdCount = 0;
  let updatedCount = 0;

  for (const account of criticalPOSAccounts) {
    try {
      const existingAccount = await ChartOfAccounts.findOne({ accountCode: account.accountCode });
      
      if (!existingAccount) {
        // Create if doesn't exist
        await ChartOfAccounts.create(account);
        console.log(`✓ Created critical account: ${account.accountCode} - ${account.accountName}`);
        createdCount++;
      } else {
        // Update if exists but not marked as system account or missing description
        const needsUpdate = 
          existingAccount.isSystemAccount !== true ||
          !existingAccount.description ||
          existingAccount.accountName !== account.accountName;
        
        if (needsUpdate) {
          await ChartOfAccounts.findByIdAndUpdate(
            existingAccount._id,
            {
              isSystemAccount: true,
              accountName: account.accountName,
              description: account.description || existingAccount.description,
              accountType: account.accountType,
              accountCategory: account.accountCategory,
              normalBalance: account.normalBalance,
              level: account.level,
              isActive: true
            },
            { new: true }
          );
          console.log(`✓ Updated critical account: ${account.accountCode} - ${account.accountName}`);
          updatedCount++;
        }
      }
    } catch (error) {
      console.error(`❌ Error ensuring account ${account.accountCode}:`, error.message);
    }
  }

  if (createdCount > 0 || updatedCount > 0) {
    console.log(`\n✅ Critical POS accounts: ${createdCount} created, ${updatedCount} updated`);
  } else {
    console.log(`\n✅ All critical POS accounts already exist and are properly configured`);
  }
}

async function initializeChartOfAccounts() {
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

    // ALWAYS ensure critical POS accounts exist (even if other accounts exist)
    await ensureCriticalPOSAccounts();

    // Check if accounts already exist
    const existingCount = await ChartOfAccounts.countDocuments();
    
    if (existingCount > criticalPOSAccounts.length) {
      console.log(`\n📋 Chart of Accounts already has ${existingCount} accounts`);
      console.log('Skipping full initialization (only critical accounts were ensured)...');
    } else {
      console.log('\n⚠️  No accounts found, creating default Chart of Accounts...');
      
      for (const account of defaultAccounts) {
        try {
          // Check if account already exists (might have been created by ensureCriticalPOSAccounts)
          const existing = await ChartOfAccounts.findOne({ accountCode: account.accountCode });
          if (!existing) {
            await ChartOfAccounts.create(account);
            console.log(`✓ Created: ${account.accountCode} - ${account.accountName}`);
          } else {
            console.log(`⚠️  Skipped (already exists): ${account.accountCode} - ${account.accountName}`);
          }
        } catch (error) {
          if (error.code === 11000) {
            console.log(`⚠️  Skipped (duplicate): ${account.accountCode} - ${account.accountName}`);
          } else {
            console.error(`❌ Error creating ${account.accountCode}:`, error.message);
          }
        }
      }
      
      console.log(`\n✅ Chart of Accounts initialization complete!`);
    }

    console.log('\n🎉 Chart of Accounts initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

initializeChartOfAccounts();

