const mongoose = require('mongoose');
require('dotenv').config();

const AccountCategory = require('../models/AccountCategory');

const defaultCategories = [
  // ASSETS
  { name: 'Current Assets', code: 'CUR_ASSETS', accountType: 'asset', displayOrder: 1, isSystemCategory: true },
  { name: 'Fixed Assets', code: 'FIX_ASSETS', accountType: 'asset', displayOrder: 2, isSystemCategory: true },
  { name: 'Other Assets', code: 'OTH_ASSETS', accountType: 'asset', displayOrder: 3, isSystemCategory: true },
  
  // LIABILITIES
  { name: 'Current Liabilities', code: 'CUR_LIAB', accountType: 'liability', displayOrder: 1, isSystemCategory: true },
  { name: 'Long-term Liabilities', code: 'LT_LIAB', accountType: 'liability', displayOrder: 2, isSystemCategory: true },
  
  // EQUITY
  { name: 'Owner Equity', code: 'OWN_EQUITY', accountType: 'equity', displayOrder: 1, isSystemCategory: true },
  { name: 'Retained Earnings', code: 'RET_EARN', accountType: 'equity', displayOrder: 2, isSystemCategory: true },
  
  // REVENUE
  { name: 'Sales Revenue', code: 'SALES_REV', accountType: 'revenue', displayOrder: 1, isSystemCategory: true },
  { name: 'Other Revenue', code: 'OTH_REV', accountType: 'revenue', displayOrder: 2, isSystemCategory: true },
  
  // EXPENSES
  { name: 'Cost of Goods Sold', code: 'COGS', accountType: 'expense', displayOrder: 1, isSystemCategory: true },
  { name: 'Operating Expenses', code: 'OP_EXP', accountType: 'expense', displayOrder: 2, isSystemCategory: true },
  { name: 'Other Expenses', code: 'OTH_EXP', accountType: 'expense', displayOrder: 3, isSystemCategory: true }
];

async function initializeAccountCategories() {
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

    // Check if categories already exist
    const existingCount = await AccountCategory.countDocuments();
    
    if (existingCount > 0) {
      console.log(`📋 Account Categories already has ${existingCount} categories`);
      console.log('Skipping initialization...');
    } else {
      console.log('⚠️  No categories found, creating default Account Categories...');
      
      for (const category of defaultCategories) {
        await AccountCategory.create(category);
        console.log(`✓ Created: ${category.code} - ${category.name} (${category.accountType})`);
      }
      
      console.log(`\n✅ Created ${defaultCategories.length} default categories!`);
    }

    console.log('\n🎉 Account Categories initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

initializeAccountCategories();
