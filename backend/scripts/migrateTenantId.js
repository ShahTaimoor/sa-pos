/**
 * Tenant ID Migration Script
 * 
 * This script migrates old data that doesn't have tenantId
 * to assign tenantId based on the user who created the data.
 * 
 * IMPORTANT: Run this script AFTER creating all tenants and Admin users.
 * This script should be run once during migration to production.
 * 
 * Usage:
 *   node backend/scripts/migrateTenantId.js
 * 
 * Options:
 *   --dry-run: Show what would be migrated without making changes
 *   --tenantId: Migrate only for specific tenantId
 *   --model: Migrate only specific model (e.g., Customer, Product)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const logger = require('../utils/logger');

// Import all models that need tenantId
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const Sales = require('../models/Sales');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const JournalEntry = require('../models/JournalEntry');
const Inventory = require('../models/Inventory');
const User = require('../models/User');
const CashReceipt = require('../models/CashReceipt');
const CashPayment = require('../models/CashPayment');
const BankReceipt = require('../models/BankReceipt');
const BankPayment = require('../models/BankPayment');
const JournalVoucher = require('../models/JournalVoucher');
const SalesOrder = require('../models/SalesOrder');
const PurchaseOrder = require('../models/PurchaseOrder');
const Payment = require('../models/Payment');
const Return = require('../models/Return');
const StockMovement = require('../models/StockMovement');
const Warehouse = require('../models/Warehouse');
const Category = require('../models/Category');
const Bank = require('../models/Bank');
const Employee = require('../models/Employee');
const Investor = require('../models/Investor');

// Models that need tenantId migration
const MODELS_TO_MIGRATE = [
  { name: 'Customer', Model: Customer },
  { name: 'Supplier', Model: Supplier },
  { name: 'Product', Model: Product },
  { name: 'Sales', Model: Sales },
  { name: 'PurchaseInvoice', Model: PurchaseInvoice },
  { name: 'ChartOfAccounts', Model: ChartOfAccounts },
  { name: 'JournalEntry', Model: JournalEntry },
  { name: 'Inventory', Model: Inventory },
  { name: 'CashReceipt', Model: CashReceipt },
  { name: 'CashPayment', Model: CashPayment },
  { name: 'BankReceipt', Model: BankReceipt },
  { name: 'BankPayment', Model: BankPayment },
  { name: 'JournalVoucher', Model: JournalVoucher },
  { name: 'SalesOrder', Model: SalesOrder },
  { name: 'PurchaseOrder', Model: PurchaseOrder },
  { name: 'Payment', Model: Payment },
  { name: 'Return', Model: Return },
  { name: 'StockMovement', Model: StockMovement },
  { name: 'Warehouse', Model: Warehouse },
  { name: 'Category', Model: Category },
  { name: 'Bank', Model: Bank },
  { name: 'Employee', Model: Employee },
  { name: 'Investor', Model: Investor }
];

/**
 * Get tenantId from createdBy user
 */
async function getTenantIdFromUser(userId) {
  if (!userId) return null;
  
  try {
    const user = await User.findById(userId).select('tenantId');
    return user?.tenantId || null;
  } catch (error) {
    logger.warn(`Error getting tenantId from user ${userId}:`, error.message);
    return null;
  }
}

/**
 * Get tenantId from related document
 */
async function getTenantIdFromRelated(doc, relatedField, RelatedModel) {
  if (!doc[relatedField]) return null;
  
  try {
    const related = await RelatedModel.findById(doc[relatedField]).select('tenantId');
    return related?.tenantId || null;
  } catch (error) {
    logger.warn(`Error getting tenantId from related ${relatedField}:`, error.message);
    return null;
  }
}

/**
 * Migrate a single model
 */
async function migrateModel({ name, Model }, options = {}) {
  const { dryRun = false, targetTenantId = null, batchSize = 100 } = options;
  
  logger.info(`\n📦 Migrating ${name}...`);
  
  // Check if model has tenantId field
  if (!Model.schema.paths.tenantId) {
    logger.info(`   ⏭️  ${name} doesn't have tenantId field, skipping`);
    return { migrated: 0, skipped: 0, errors: 0 };
  }
  
  // Build query for documents without tenantId
  const query = { tenantId: { $exists: false } };
  if (targetTenantId) {
    // If targetTenantId is specified, we're migrating specific tenant's data
    // This is for cases where tenantId exists but is null/undefined
    query.$or = [
      { tenantId: { $exists: false } },
      { tenantId: null }
    ];
  }
  
  const totalDocs = await Model.countDocuments(query);
  logger.info(`   📊 Found ${totalDocs} documents without tenantId`);
  
  if (totalDocs === 0) {
    return { migrated: 0, skipped: 0, errors: 0 };
  }
  
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  let processed = 0;
  
  // Process in batches
  while (processed < totalDocs) {
    const docs = await Model.find(query)
      .limit(batchSize)
      .lean();
    
    if (docs.length === 0) break;
    
    for (const doc of docs) {
      try {
        let tenantId = null;
        
        // Strategy 1: Get from createdBy user
        if (doc.createdBy) {
          tenantId = await getTenantIdFromUser(doc.createdBy);
        }
        
        // Strategy 2: Get from related customer (for Sales, Payment, etc.)
        if (!tenantId && doc.customer) {
          tenantId = await getTenantIdFromRelated(doc, 'customer', Customer);
        }
        
        // Strategy 3: Get from related supplier (for PurchaseInvoice, etc.)
        if (!tenantId && doc.supplier) {
          tenantId = await getTenantIdFromRelated(doc, 'supplier', Supplier);
        }
        
        // Strategy 4: Get from related product (for Inventory, etc.)
        if (!tenantId && doc.product) {
          tenantId = await getTenantIdFromRelated(doc, 'product', Product);
        }
        
        // Strategy 5: Use targetTenantId if provided
        if (!tenantId && targetTenantId) {
          tenantId = targetTenantId;
        }
        
        if (!tenantId) {
          logger.warn(`   ⚠️  ${name} document ${doc._id} - Cannot determine tenantId, skipping`);
          skipped++;
          continue;
        }
        
        if (dryRun) {
          logger.info(`   🔍 Would migrate ${name} ${doc._id} to tenantId ${tenantId}`);
          migrated++;
        } else {
          await Model.updateOne(
            { _id: doc._id },
            { $set: { tenantId: tenantId } }
          );
          migrated++;
        }
      } catch (error) {
        logger.error(`   ❌ Error migrating ${name} ${doc._id}:`, error.message);
        errors++;
      }
    }
    
    processed += docs.length;
    logger.info(`   📈 Progress: ${processed}/${totalDocs} (${Math.round(processed/totalDocs*100)}%)`);
  }
  
  logger.info(`   ✅ ${name} migration complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
  
  return { migrated, skipped, errors };
}

/**
 * Main migration function
 */
async function migrateTenantIds(options = {}) {
  const { dryRun = false, targetTenantId = null, modelName = null } = options;
  
  logger.info('🚀 Starting Tenant ID Migration...');
  logger.info(`   Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be saved)'}`);
  if (targetTenantId) {
    logger.info(`   Target Tenant ID: ${targetTenantId}`);
  }
  if (modelName) {
    logger.info(`   Target Model: ${modelName}`);
  }
  
  await connectDB();
  
  const modelsToMigrate = modelName
    ? MODELS_TO_MIGRATE.filter(m => m.name === modelName)
    : MODELS_TO_MIGRATE;
  
  if (modelsToMigrate.length === 0) {
    logger.error(`❌ Model "${modelName}" not found`);
    process.exit(1);
  }
  
  const results = {
    total: { migrated: 0, skipped: 0, errors: 0 },
    byModel: {}
  };
  
  for (const model of modelsToMigrate) {
    const result = await migrateModel(model, { dryRun, targetTenantId });
    results.byModel[model.name] = result;
    results.total.migrated += result.migrated;
    results.total.skipped += result.skipped;
    results.total.errors += result.errors;
  }
  
  logger.info('\n📊 Migration Summary:');
  logger.info(`   Total Migrated: ${results.total.migrated}`);
  logger.info(`   Total Skipped: ${results.total.skipped}`);
  logger.info(`   Total Errors: ${results.total.errors}`);
  
  logger.info('\n📋 By Model:');
  for (const [modelName, result] of Object.entries(results.byModel)) {
    logger.info(`   ${modelName}: ${result.migrated} migrated, ${result.skipped} skipped, ${result.errors} errors`);
  }
  
  if (dryRun) {
    logger.info('\n💡 This was a DRY RUN. No changes were made.');
    logger.info('   Run without --dry-run to apply changes.');
  } else {
    logger.info('\n✅ Migration complete!');
  }
  
  await mongoose.connection.close();
  process.exit(0);
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  targetTenantId: args.find(arg => arg.startsWith('--tenantId='))?.split('=')[1] || null,
  modelName: args.find(arg => arg.startsWith('--model='))?.split('=')[1] || null
};

// Run migration
migrateTenantIds(options).catch(error => {
  logger.error('❌ Migration failed:', error);
  process.exit(1);
});
