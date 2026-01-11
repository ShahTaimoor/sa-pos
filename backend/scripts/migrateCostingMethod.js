/**
 * Migration Script: Set Costing Method for Existing Products
 * 
 * Determines costing method from purchase history and sets it
 */

const mongoose = require('mongoose');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const PurchaseOrder = require('../models/PurchaseOrder');
require('dotenv').config();

async function determineCostMethodFromHistory(productId) {
  // Check if product has purchase history
  const purchases = await PurchaseOrder.find({
    'items.product': productId,
    status: { $in: ['completed', 'received'] }
  }).sort({ createdAt: 1 }).lean();
  
  if (purchases.length === 0) {
    // No purchase history - set default
    return 'average';
  }
  
  // Check inventory for FIFO/LIFO batches
  const inventory = await Inventory.findOne({ product: productId }).lean();
  
  if (inventory?.cost?.fifo && inventory.cost.fifo.length > 0) {
    return 'fifo';
  }
  
  if (inventory?.cost?.lifo && inventory.cost.lifo.length > 0) {
    return 'lifo';
  }
  
  // Check if average cost exists
  if (inventory?.cost?.average && inventory.cost.average > 0) {
    return 'average';
  }
  
  // Default to average
  return 'average';
}

async function migrateProductCostingMethod(productId, method, adminUserId) {
  const product = await Product.findById(productId);
  
  if (!product) {
    console.log(`Product ${productId} not found`);
    return { success: false, reason: 'not_found' };
  }
  
  // Only migrate if method not set
  if (product.costing?.method && product.costing.isLocked) {
    console.log(`Product ${productId} already has locked costing method: ${product.costing.method}`);
    return { 
      success: false, 
      reason: 'already_set',
      currentMethod: product.costing.method
    };
  }
  
  // Set costing method
  product.costing = {
    method: method,
    methodSetAt: new Date(),
    methodSetBy: adminUserId,
    isLocked: true,
    lockedAt: new Date()
  };
  
  await product.save();
  
  console.log(`✓ Migrated product ${productId} (${product.name}) to costing method: ${method}`);
  
  return { 
    success: true, 
    productId, 
    productName: product.name,
    method 
  };
}

async function migrateAllProducts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Get admin user (or create system user)
    const User = require('../models/User');
    let adminUser = await User.findOne({ role: 'admin' });
    
    if (!adminUser) {
      // Create system user for migration
      adminUser = new User({
        name: 'System Migration',
        email: 'migration@system',
        role: 'admin'
      });
      await adminUser.save();
    }
    
    // Find products without costing method
    const products = await Product.find({
      $or: [
        { 'costing.method': { $exists: false } },
        { 'costing.method': null },
        { 'costing.isLocked': { $ne: true } }
      ]
    });
    
    console.log(`Found ${products.length} products to migrate`);
    
    const results = {
      total: products.length,
      migrated: 0,
      skipped: 0,
      errors: []
    };
    
    for (const product of products) {
      try {
        // Determine method from history
        const method = await determineCostMethodFromHistory(product._id);
        
        // Migrate
        const result = await migrateProductCostingMethod(
          product._id,
          method,
          adminUser._id
        );
        
        if (result.success) {
          results.migrated++;
        } else {
          results.skipped++;
        }
      } catch (error) {
        console.error(`Error migrating product ${product._id}:`, error);
        results.errors.push({
          productId: product._id,
          error: error.message
        });
      }
    }
    
    console.log('\n=== Migration Summary ===');
    console.log(`Total products: ${results.total}`);
    console.log(`Migrated: ${results.migrated}`);
    console.log(`Skipped: ${results.skipped}`);
    console.log(`Errors: ${results.errors.length}`);
    
    if (results.errors.length > 0) {
      console.log('\nErrors:');
      results.errors.forEach(err => {
        console.log(`  - Product ${err.productId}: ${err.error}`);
      });
    }
    
    await mongoose.connection.close();
    console.log('\nMigration completed');
    
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  migrateAllProducts();
}

module.exports = {
  migrateAllProducts,
  migrateProductCostingMethod,
  determineCostMethodFromHistory
};

