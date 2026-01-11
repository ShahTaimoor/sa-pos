/**
 * Migration Script: Add tenantId to Existing Data
 * 
 * This script adds tenantId to all existing documents in the database.
 * 
 * IMPORTANT: 
 * - Run this script AFTER setting up tenantId in all models
 * - You need to determine how to assign tenantId to existing data
 * - For users: You may need to create a Tenant model or assign based on business logic
 * - For other models: Derive tenantId from related user/tenant records
 * 
 * Usage:
 * node backend/scripts/migrateAddTenantId.js
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment variables from root .env file
// Try multiple possible locations
const envPaths = [
  path.join(__dirname, '../../.env'),  // Root .env
  path.join(__dirname, '../.env'),     // Backend .env
  path.join(__dirname, '../../backend/.env') // Alternative
];

let envLoaded = false;
const fs = require('fs');

for (const envPath of envPaths) {
  try {
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      if (process.env.MONGODB_URI) {
        envLoaded = true;
        console.log(`✓ Loaded .env from: ${envPath}`);
        break;
      }
    }
  } catch (error) {
    // Continue to next path
  }
}

// If still not loaded, try default location (current working directory)
if (!envLoaded) {
  try {
    require('dotenv').config();
    if (process.env.MONGODB_URI) {
      envLoaded = true;
      console.log(`✓ Loaded .env from default location`);
    }
  } catch (error) {
    // Ignore
  }
}

// Validate MONGODB_URI is set
if (!process.env.MONGODB_URI) {
  console.error('\n❌ ERROR: MONGODB_URI environment variable is required.');
  console.error('Please set it in your .env file or as an environment variable.');
  console.error('\nExample .env file:');
  console.error('MONGODB_URI=mongodb://localhost:27017/pos_system');
  console.error('JWT_SECRET=your-secret-key-here\n');
  process.exit(1);
}

const connectDB = require('../config/db');

// Models
const User = require('../models/User');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const Sales = require('../models/Sales');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const Inventory = require('../models/Inventory');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const JournalEntry = require('../models/JournalEntry');
const JournalVoucher = require('../models/JournalVoucher');
const Payment = require('../models/Payment');
const StockMovement = require('../models/StockMovement');
const CashReceipt = require('../models/CashReceipt');
const CashPayment = require('../models/CashPayment');

// Default tenantId - CHANGE THIS to your actual tenant ID or logic
// For multi-tenant systems, you may need to:
// 1. Create a Tenant model
// 2. Assign tenantId based on user's organization
// 3. Use a default tenantId for existing data
const DEFAULT_TENANT_ID = new mongoose.Types.ObjectId(); // Change this!

async function migrateCollection(Model, modelName, getTenantId) {
  try {
    console.log(`\nMigrating ${modelName}...`);
    
    const documents = await Model.find({ tenantId: { $exists: false } });
    console.log(`Found ${documents.length} documents without tenantId`);
    
    if (documents.length === 0) {
      console.log(`✓ ${modelName}: No documents to migrate`);
      return { migrated: 0, skipped: 0 };
    }
    
    let migrated = 0;
    let skipped = 0;
    
    for (const doc of documents) {
      try {
        const tenantId = await getTenantId(doc);
        
        if (!tenantId) {
          console.warn(`⚠ Skipping ${modelName} ${doc._id}: No tenantId determined`);
          skipped++;
          continue;
        }
        
        await Model.updateOne(
          { _id: doc._id },
          { $set: { tenantId: tenantId } }
        );
        
        migrated++;
      } catch (error) {
        console.error(`✗ Error migrating ${modelName} ${doc._id}:`, error.message);
        skipped++;
      }
    }
    
    console.log(`✓ ${modelName}: Migrated ${migrated}, Skipped ${skipped}`);
    return { migrated, skipped };
  } catch (error) {
    console.error(`✗ Error migrating ${modelName}:`, error.message);
    return { migrated: 0, skipped: 0 };
  }
}

async function getTenantIdForUser(user) {
  // If user already has tenantId, use it
  if (user.tenantId) {
    return user.tenantId;
  }
  
  // TODO: Implement your logic to determine tenantId
  // Examples:
  // - If you have an organization/company field, use that
  // - If you have a default tenant, use that
  // - Create a new tenant for this user
  
  // For now, return default tenantId
  return DEFAULT_TENANT_ID;
}

async function getTenantIdFromCreatedBy(doc) {
  // Try to get tenantId from createdBy user
  if (doc.createdBy) {
    try {
      const user = await User.findById(doc.createdBy);
      if (user && user.tenantId) {
        return user.tenantId;
      }
    } catch (error) {
      // User not found or error
    }
  }
  
  // Fallback to default
  return DEFAULT_TENANT_ID;
}

async function getTenantIdFromCustomer(doc) {
  // Try to get tenantId from customer
  if (doc.customer) {
    try {
      const customer = await Customer.findById(doc.customer);
      if (customer && customer.tenantId) {
        return customer.tenantId;
      }
    } catch (error) {
      // Customer not found or error
    }
  }
  
  // Fallback to createdBy or default
  return await getTenantIdFromCreatedBy(doc);
}

async function getTenantIdFromSupplier(doc) {
  // Try to get tenantId from supplier
  if (doc.supplier) {
    try {
      const supplier = await Supplier.findById(doc.supplier);
      if (supplier && supplier.tenantId) {
        return supplier.tenantId;
      }
    } catch (error) {
      // Supplier not found or error
    }
  }
  
  // Fallback to createdBy or default
  return await getTenantIdFromCreatedBy(doc);
}

async function getTenantIdFromProduct(doc) {
  // Try to get tenantId from product
  if (doc.product) {
    try {
      const product = await Product.findById(doc.product);
      if (product && product.tenantId) {
        return product.tenantId;
      }
    } catch (error) {
      // Product not found or error
    }
  }
  
  // Fallback to createdBy or default
  return await getTenantIdFromCreatedBy(doc);
}

async function runMigration() {
  try {
    console.log('Starting tenantId migration...');
    console.log(`Using default tenantId: ${DEFAULT_TENANT_ID}`);
    console.log('⚠ WARNING: Make sure to update DEFAULT_TENANT_ID or implement proper tenant assignment logic!\n');
    
    await connectDB();
    
    const results = {
      User: await migrateCollection(User, 'User', getTenantIdForUser),
      Product: await migrateCollection(Product, 'Product', getTenantIdFromCreatedBy),
      Customer: await migrateCollection(Customer, 'Customer', getTenantIdFromCreatedBy),
      Supplier: await migrateCollection(Supplier, 'Supplier', getTenantIdFromCreatedBy),
      Sales: await migrateCollection(Sales, 'Sales', getTenantIdFromCustomer),
      PurchaseInvoice: await migrateCollection(PurchaseInvoice, 'PurchaseInvoice', getTenantIdFromSupplier),
      Inventory: await migrateCollection(Inventory, 'Inventory', getTenantIdFromProduct),
      ChartOfAccounts: await migrateCollection(ChartOfAccounts, 'ChartOfAccounts', getTenantIdFromCreatedBy),
      JournalEntry: await migrateCollection(JournalEntry, 'JournalEntry', getTenantIdFromCreatedBy),
      JournalVoucher: await migrateCollection(JournalVoucher, 'JournalVoucher', getTenantIdFromCreatedBy),
      Payment: await migrateCollection(Payment, 'Payment', getTenantIdFromCreatedBy),
      StockMovement: await migrateCollection(StockMovement, 'StockMovement', getTenantIdFromProduct),
      CashReceipt: await migrateCollection(CashReceipt, 'CashReceipt', getTenantIdFromCustomer),
      CashPayment: await migrateCollection(CashPayment, 'CashPayment', getTenantIdFromSupplier)
    };
    
    console.log('\n=== Migration Summary ===');
    let totalMigrated = 0;
    let totalSkipped = 0;
    
    Object.keys(results).forEach(modelName => {
      const result = results[modelName];
      totalMigrated += result.migrated;
      totalSkipped += result.skipped;
      console.log(`${modelName}: ${result.migrated} migrated, ${result.skipped} skipped`);
    });
    
    console.log(`\nTotal: ${totalMigrated} migrated, ${totalSkipped} skipped`);
    console.log('\n✓ Migration completed!');
    
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };

