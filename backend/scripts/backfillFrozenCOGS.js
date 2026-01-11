/**
 * Backfill Script: Add Frozen COGS to Historical Sales Orders
 * 
 * Calculates and freezes COGS for existing sales orders
 */

const mongoose = require('mongoose');
const Sales = require('../models/Sales');
const immutableCostingService = require('../services/immutableCostingService');
require('dotenv').config();

async function backfillFrozenCOGSForOrder(orderId) {
  try {
    const order = await Sales.findById(orderId);
    
    if (!order) {
      return { success: false, reason: 'order_not_found' };
    }
    
    let updatedItems = 0;
    let skippedItems = 0;
    let errorItems = 0;
    
    for (const item of order.items) {
      // Skip if already has frozen COGS
      if (item.frozenCOGS && !item.frozenCOGS.isBackfilled) {
        skippedItems++;
        continue;
      }
      
      try {
        const product = await require('../models/Product').findById(item.product);
        
        if (!product) {
          console.warn(`Product ${item.product} not found for item ${item._id}`);
          errorItems++;
          continue;
        }
        
        const costingMethod = product.costing?.method || 'average';
        
        // Calculate COGS as of sale date
        const cogs = await immutableCostingService.calculateAndFreezeCOGS(
          item.product,
          item.quantity,
          order.createdAt || new Date()
        );
        
        // Freeze COGS
        item.frozenCOGS = {
          ...cogs,
          isBackfilled: true,
          backfilledAt: new Date()
        };
        
        // Update unitCost for backward compatibility
        if (!item.unitCost || item.unitCost === 0) {
          item.unitCost = cogs.unitCost;
        }
        
        updatedItems++;
      } catch (error) {
        console.error(`Error backfilling COGS for item ${item._id}:`, error.message);
        
        // Use existing unitCost as fallback
        if (item.unitCost && item.unitCost > 0) {
          item.frozenCOGS = {
            unitCost: item.unitCost,
            totalCost: item.unitCost * item.quantity,
            costingMethod: 'average', // Default
            calculatedAt: order.createdAt || new Date(),
            isBackfilled: true,
            backfilledAt: new Date(),
            isEstimated: true
          };
          updatedItems++;
        } else {
          errorItems++;
        }
      }
    }
    
    if (updatedItems > 0) {
      await order.save();
    }
    
    return {
      success: true,
      orderId,
      updatedItems,
      skippedItems,
      errorItems
    };
  } catch (error) {
    console.error(`Error backfilling order ${orderId}:`, error);
    return {
      success: false,
      orderId,
      error: error.message
    };
  }
}

async function backfillAllOrders(options = {}) {
  const {
    limit = null,
    batchSize = 100,
    startDate = null,
    endDate = null
  } = options;
  
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Build query
    const query = {};
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    // Find orders without frozen COGS
    const orders = await Sales.find(query)
      .limit(limit || undefined)
      .sort({ createdAt: 1 })
      .lean();
    
    console.log(`Found ${orders.length} orders to process`);
    
    const results = {
      total: orders.length,
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };
    
    // Process in batches
    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = orders.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} orders)`);
      
      for (const order of batch) {
        try {
          const result = await backfillFrozenCOGSForOrder(order._id);
          
          results.processed++;
          
          if (result.success) {
            if (result.updatedItems > 0) {
              results.updated++;
            } else {
              results.skipped++;
            }
          } else {
            results.errors.push(result);
          }
        } catch (error) {
          console.error(`Error processing order ${order._id}:`, error);
          results.errors.push({
            orderId: order._id,
            error: error.message
          });
        }
      }
    }
    
    console.log('\n=== Backfill Summary ===');
    console.log(`Total orders: ${results.total}`);
    console.log(`Processed: ${results.processed}`);
    console.log(`Updated: ${results.updated}`);
    console.log(`Skipped: ${results.skipped}`);
    console.log(`Errors: ${results.errors.length}`);
    
    if (results.errors.length > 0) {
      console.log('\nErrors:');
      results.errors.slice(0, 10).forEach(err => {
        console.log(`  - Order ${err.orderId}: ${err.error || 'Unknown error'}`);
      });
      if (results.errors.length > 10) {
        console.log(`  ... and ${results.errors.length - 10} more errors`);
      }
    }
    
    await mongoose.connection.close();
    console.log('\nBackfill completed');
    
  } catch (error) {
    console.error('Backfill error:', error);
    process.exit(1);
  }
}

// Run backfill
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  if (args.includes('--limit')) {
    const limitIndex = args.indexOf('--limit');
    options.limit = parseInt(args[limitIndex + 1]);
  }
  
  if (args.includes('--start-date')) {
    const startIndex = args.indexOf('--start-date');
    options.startDate = args[startIndex + 1];
  }
  
  if (args.includes('--end-date')) {
    const endIndex = args.indexOf('--end-date');
    options.endDate = args[endIndex + 1];
  }
  
  backfillAllOrders(options);
}

module.exports = {
  backfillAllOrders,
  backfillFrozenCOGSForOrder
};

