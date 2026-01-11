/**
 * Migration Script: Product Stock to Inventory
 * 
 * Migrates all Product stock values to Inventory
 * Creates Inventory records for products without them
 * Syncs stock values
 */

const mongoose = require('mongoose');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const logger = require('../utils/logger');

/**
 * Main migration function
 */
async function migrateProductStockToInventory() {
  try {
    logger.info('Starting Product to Inventory stock migration...');
    
    // Find all products with stock
    const products = await Product.find({
      $or: [
        { 'inventory.currentStock': { $exists: true, $ne: null } },
        { 'inventory.currentStock': { $gt: 0 } }
      ]
    });
    
    logger.info(`Found ${products.length} products to migrate`);
    
    const results = {
      total: products.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };
    
    for (const product of products) {
      try {
        const productStock = product.inventory?.currentStock || 0;
        
        // Check if Inventory record exists
        let inventory = await Inventory.findOne({ product: product._id });
        
        if (!inventory) {
          // Create new Inventory record
          inventory = await Inventory.create({
            product: product._id,
            productModel: 'Product',
            currentStock: productStock,
            reorderPoint: product.inventory?.reorderPoint || 10,
            reorderQuantity: product.inventory?.reorderQuantity || 50,
            reservedStock: 0,
            availableStock: productStock,
            status: productStock > 0 ? 'active' : 'out_of_stock',
            cost: {
              average: product.pricing?.cost || 0,
              lastPurchase: product.pricing?.cost || 0
            }
          });
          
          results.created++;
          logger.info(`Created Inventory for product ${product.name}`, {
            productId: product._id,
            stock: productStock
          });
        } else {
          // Update existing Inventory if stock is 0 or different
          if (inventory.currentStock === 0 && productStock > 0) {
            inventory.currentStock = productStock;
            inventory.availableStock = productStock;
            inventory.status = 'active';
            await inventory.save();
            
            results.updated++;
            logger.info(`Updated Inventory for product ${product.name}`, {
              productId: product._id,
              oldStock: 0,
              newStock: productStock
            });
          } else if (Math.abs(inventory.currentStock - productStock) > 0.01) {
            // Log discrepancy but don't auto-fix (requires manual review)
            logger.warn(`Stock discrepancy for product ${product.name}`, {
              productId: product._id,
              inventoryStock: inventory.currentStock,
              productStock: productStock,
              difference: Math.abs(inventory.currentStock - productStock)
            });
            results.skipped++;
          } else {
            results.skipped++;
          }
        }
      } catch (error) {
        results.errors.push({
          productId: product._id,
          productName: product.name,
          error: error.message
        });
        logger.error(`Error migrating product ${product.name}:`, error);
      }
    }
    
    logger.info('Migration completed', results);
    
    // Verify migration
    const verification = await verifyMigration();
    logger.info('Migration verification', verification);
    
    return {
      ...results,
      verification
    };
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
}

/**
 * Verify migration results
 */
async function verifyMigration() {
  const totalProducts = await Product.countDocuments({});
  const productsWithInventory = await Inventory.countDocuments({});
  
  const productsWithoutInventory = totalProducts - productsWithInventory;
  
  // Check for products with stock but no inventory
  const productsWithStock = await Product.find({
    'inventory.currentStock': { $gt: 0 }
  });
  
  const missingInventories = [];
  for (const product of productsWithStock) {
    const inventory = await Inventory.findOne({ product: product._id });
    if (!inventory) {
      missingInventories.push({
        productId: product._id,
        productName: product.name,
        stock: product.inventory.currentStock
      });
    }
  }
  
  return {
    totalProducts,
    productsWithInventory,
    productsWithoutInventory,
    productsWithStock: productsWithStock.length,
    missingInventories: missingInventories.length,
    missingInventoryDetails: missingInventories
  };
}

/**
 * Rollback migration (if needed)
 */
async function rollbackMigration() {
  logger.warn('Rollback not implemented. Manual rollback required.');
  // Rollback would require restoring from backup
}

// Run migration if called directly
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pos', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
    .then(() => {
      logger.info('Connected to MongoDB');
      return migrateProductStockToInventory();
    })
    .then((results) => {
      logger.info('Migration completed successfully', results);
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = {
  migrateProductStockToInventory,
  verifyMigration,
  rollbackMigration
};

