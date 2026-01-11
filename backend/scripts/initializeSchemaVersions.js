/**
 * Initialize Schema Versions
 * 
 * Adds schemaVersion field to all existing documents
 */

const mongoose = require('mongoose');
const schemaVersionService = require('../services/schemaVersionService');
require('dotenv').config();

// Import all models
const Product = require('../models/Product');
const Sales = require('../models/Sales');
const Customer = require('../models/Customer');
const Inventory = require('../models/Inventory');
const CustomerTransaction = require('../models/CustomerTransaction');
const PurchaseOrder = require('../models/PurchaseOrder');
const Payment = require('../models/Payment');
const Return = require('../models/Return');

const MODELS = {
  Product,
  Sales,
  Customer,
  Inventory,
  CustomerTransaction,
  PurchaseOrder,
  Payment,
  Return
};

async function initializeSchemaVersions() {
  try {
    const connectionString = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/sa-pos';
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(connectionString, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB\n');
    
    const results = {};
    
    for (const [modelName, Model] of Object.entries(MODELS)) {
      try {
        console.log(`Processing ${modelName}...`);
        
        // Count documents without schemaVersion
        const count = await Model.countDocuments({
          $or: [
            { schemaVersion: { $exists: false } },
            { schemaVersion: null }
          ]
        });
        
        if (count === 0) {
          console.log(`  ✓ All ${modelName} documents already have schemaVersion`);
          results[modelName] = { updated: 0, skipped: count };
          continue;
        }
        
        console.log(`  Found ${count} documents without schemaVersion`);
        
        // Get current version for this model
        const currentVersion = schemaVersionService.getCurrentVersion(modelName);
        
        // Update documents
        const updateResult = await Model.updateMany(
          {
            $or: [
              { schemaVersion: { $exists: false } },
              { schemaVersion: null }
            ]
          },
          {
            $set: { schemaVersion: currentVersion }
          }
        );
        
        console.log(`  ✓ Updated ${updateResult.modifiedCount} documents to version ${currentVersion}`);
        
        results[modelName] = {
          updated: updateResult.modifiedCount,
          version: currentVersion
        };
      } catch (error) {
        console.error(`  ✗ Error processing ${modelName}:`, error.message);
        results[modelName] = {
          error: error.message
        };
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary');
    console.log('='.repeat(50));
    
    let totalUpdated = 0;
    for (const [modelName, result] of Object.entries(results)) {
      if (result.updated !== undefined) {
        console.log(`${modelName}: ${result.updated} documents updated to ${result.version}`);
        totalUpdated += result.updated;
      } else if (result.error) {
        console.log(`${modelName}: Error - ${result.error}`);
      }
    }
    
    console.log(`\nTotal documents updated: ${totalUpdated}`);
    console.log('\n✅ Schema version initialization completed!');
    
  } catch (error) {
    console.error('\n❌ Initialization error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run if executed directly
if (require.main === module) {
  initializeSchemaVersions();
}

module.exports = { initializeSchemaVersions };

