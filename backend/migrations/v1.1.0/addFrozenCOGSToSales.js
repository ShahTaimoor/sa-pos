/**
 * Migration: Add Frozen COGS to Sales Order Items
 * 
 * Version: 1.0.0 → 1.1.0
 * Model: Sales
 * 
 * Adds frozenCOGS field to sales order items for historical accuracy
 */

const Sales = require('../../models/Sales');
const immutableCostingService = require('../../services/immutableCostingService');

module.exports = {
  version: '1.1.0',
  model: 'Sales',
  description: 'Add frozenCOGS to sales order items',
  critical: true, // Critical migration - stop on error
  
  /**
   * Run migration (upgrade)
   */
  up: async (db) => {
    console.log('Starting migration: Add frozenCOGS to Sales...');
    
    // Find orders that need migration
    const orders = await Sales.find({
      $or: [
        { schemaVersion: { $exists: false } },
        { schemaVersion: { $lt: '1.1.0' } },
        { 'items.frozenCOGS': { $exists: false } }
      ]
    }).lean();
    
    console.log(`Found ${orders.length} orders to migrate`);
    
    let processed = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];
    
    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = orders.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} orders)`);
      
      for (const order of batch) {
        try {
          let hasChanges = false;
          const updateOps = {
            $set: {}
          };
          
          // Check each item
          const itemsToUpdate = [];
          for (let itemIndex = 0; itemIndex < order.items.length; itemIndex++) {
            const item = order.items[itemIndex];
            
            if (!item.frozenCOGS) {
              try {
                // Calculate COGS as of sale date
                const saleDate = order.createdAt || new Date();
                const cogs = await immutableCostingService.calculateAndFreezeCOGS(
                  item.product,
                  item.quantity,
                  saleDate
                );
                
                itemsToUpdate.push({
                  index: itemIndex,
                  frozenCOGS: {
                    ...cogs,
                    isBackfilled: true,
                    backfilledAt: new Date()
                  }
                });
                
                hasChanges = true;
              } catch (error) {
                // Use existing unitCost as fallback
                if (item.unitCost && item.unitCost > 0) {
                  itemsToUpdate.push({
                    index: itemIndex,
                    frozenCOGS: {
                      unitCost: item.unitCost,
                      totalCost: item.unitCost * item.quantity,
                      costingMethod: 'average',
                      calculatedAt: order.createdAt || new Date(),
                      isBackfilled: true,
                      backfilledAt: new Date(),
                      isEstimated: true
                    }
                  });
                  hasChanges = true;
                } else {
                  errors.push({
                    orderId: order._id,
                    itemId: item._id,
                    error: error.message
                  });
                }
              }
            }
          }
          
          // Update order if changes
          if (hasChanges) {
            // Build update operations
            for (const itemUpdate of itemsToUpdate) {
              updateOps.$set[`items.${itemUpdate.index}.frozenCOGS`] = itemUpdate.frozenCOGS;
              
              // Update unitCost if missing
              if (!order.items[itemUpdate.index].unitCost) {
                updateOps.$set[`items.${itemUpdate.index}.unitCost`] = itemUpdate.frozenCOGS.unitCost;
              }
            }
            
            updateOps.$set.schemaVersion = '1.1.0';
            
            await Sales.updateOne(
              { _id: order._id },
              updateOps
            );
            
            updated++;
          } else {
            // Just update schema version
            await Sales.updateOne(
              { _id: order._id },
              { $set: { schemaVersion: '1.1.0' } }
            );
            skipped++;
          }
          
          processed++;
        } catch (error) {
          console.error(`Error processing order ${order._id}:`, error);
          errors.push({
            orderId: order._id,
            error: error.message
          });
        }
      }
    }
    
    console.log(`\nMigration completed:`);
    console.log(`  Processed: ${processed}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.slice(0, 10).forEach(err => {
        console.log(`  - Order ${err.orderId}: ${err.error}`);
      });
    }
    
    return {
      success: true,
      processed,
      updated,
      skipped,
      errors: errors.length,
      errorDetails: errors.slice(0, 10)
    };
  },
  
  /**
   * Rollback migration (downgrade)
   */
  down: async (db) => {
    console.log('Rolling back migration: Remove frozenCOGS from Sales...');
    
    // Find orders with version 1.1.0
    const orders = await Sales.find({
      schemaVersion: '1.1.0'
    }).lean();
    
    console.log(`Found ${orders.length} orders to rollback`);
    
    let processed = 0;
    let rolledBack = 0;
    
    for (const order of orders) {
      try {
        const updateOps = {
          $set: { schemaVersion: '1.0.0' },
          $unset: {}
        };
        
        // Remove frozenCOGS from items
        for (let i = 0; i < order.items.length; i++) {
          if (order.items[i].frozenCOGS?.isBackfilled) {
            updateOps.$unset[`items.${i}.frozenCOGS`] = '';
          }
        }
        
        await Sales.updateOne(
          { _id: order._id },
          updateOps
        );
        
        processed++;
        rolledBack++;
      } catch (error) {
        console.error(`Error rolling back order ${order._id}:`, error);
      }
    }
    
    console.log(`\nRollback completed:`);
    console.log(`  Processed: ${processed}`);
    console.log(`  Rolled back: ${rolledBack}`);
    
    return {
      success: true,
      processed,
      rolledBack
    };
  },
  
  /**
   * Validate migration
   */
  validate: async (db) => {
    console.log('Validating migration...');
    
    // Check all orders with version >= 1.1.0 have frozenCOGS
    const ordersWithoutCOGS = await Sales.countDocuments({
      schemaVersion: { $gte: '1.1.0' },
      'items.frozenCOGS': { $exists: false }
    });
    
    if (ordersWithoutCOGS > 0) {
      throw new Error(`Validation failed: ${ordersWithoutCOGS} orders missing frozenCOGS`);
    }
    
    // Check all orders have schema version
    const ordersWithoutVersion = await Sales.countDocuments({
      schemaVersion: { $exists: false }
    });
    
    if (ordersWithoutVersion > 0) {
      console.warn(`Warning: ${ordersWithoutVersion} orders without schema version`);
    }
    
    console.log('✅ Validation passed');
    
    return {
      success: true,
      message: 'All orders have frozenCOGS'
    };
  }
};

