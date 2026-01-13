const Inventory = require('../models/Inventory');
const StockAdjustment = require('../models/StockAdjustment');
const Product = require('../models/Product');
const logger = require('../utils/logger');

// Update stock levels
const updateStock = async ({ productId, type, quantity, reason, reference, referenceId, referenceModel, cost, performedBy, notes, tenantId }) => {
  if (!tenantId) {
    throw new Error('tenantId is required to update stock');
  }
  try {
    const movement = {
      type,
      quantity,
      reason,
      reference,
      referenceId,
      referenceModel,
      cost,
      performedBy,
      notes,
      date: new Date(),
    };

    const updatedInventory = await Inventory.updateStock(productId, movement);
    
    // Update product's current stock field for quick access
    const productUpdate = {
      'inventory.currentStock': updatedInventory.currentStock,
      'inventory.lastUpdated': new Date(),
    };
    
    // If cost is provided and inventory cost was updated, sync to product pricing.cost
    if (cost !== undefined && cost !== null && (type === 'in' || type === 'return')) {
      // Get updated inventory to check if cost was set
      const inventory = await Inventory.findOne({ product: productId, tenantId });
      if (inventory && inventory.cost && inventory.cost.average) {
        // Sync average cost to product pricing.cost
        productUpdate['pricing.cost'] = inventory.cost.average;
      }
    }
    
    await Product.findOneAndUpdate({ _id: productId, tenantId }, productUpdate);
    
    return updatedInventory;
  } catch (error) {
    logger.error('Error updating stock:', error);
    throw error;
  }
};

// Reserve stock for an order
const reserveStock = async ({ productId, quantity }) => {
  try {
    const inventory = await Inventory.reserveStock(productId, quantity);
    return inventory;
  } catch (error) {
    logger.error('Error reserving stock:', error);
    throw error;
  }
};

// Release reserved stock
const releaseStock = async ({ productId, quantity }) => {
  try {
    const inventory = await Inventory.releaseStock(productId, quantity);
    return inventory;
  } catch (error) {
    logger.error('Error releasing stock:', error);
    throw error;
  }
};

// Process stock adjustment
const processStockAdjustment = async ({ adjustments, type, reason, requestedBy, warehouse, notes }) => {
  try {
    const adjustment = new StockAdjustment({
      type,
      reason,
      adjustments,
      requestedBy,
      warehouse,
      notes,
    });

    await adjustment.save();
    return adjustment;
  } catch (error) {
    logger.error('Error processing stock adjustment:', error);
    throw error;
  }
};

// Get inventory status for a product
const getInventoryStatus = async (productId, tenantId) => {
  if (!tenantId) {
    throw new Error('tenantId is required to get inventory status');
  }
  try {
    const inventory = await Inventory.findOne({ product: productId, tenantId })
      .populate('product', 'name description pricing')
      .populate('movements.performedBy', 'firstName lastName')
      .sort({ 'movements.date': -1 });

    if (!inventory) {
      // Create inventory record if it doesn't exist
      const product = await Product.findOne({ _id: productId, tenantId });
      if (!product) {
        throw new Error('Product not found');
      }

      const newInventory = new Inventory({
        product: productId,
        currentStock: product.inventory?.currentStock || 0,
        reorderPoint: product.inventory?.reorderPoint || 10,
        reorderQuantity: product.inventory?.reorderQuantity || 50,
        tenantId: tenantId
      });

      await newInventory.save();
      return newInventory;
    }

    return inventory;
  } catch (error) {
    logger.error('Error getting inventory status:', error);
    throw error;
  }
};

// Get low stock items
const getLowStockItems = async (tenantId) => {
  if (!tenantId) {
    throw new Error('tenantId is required to get low stock items');
  }
  try {
    const lowStockItems = await Inventory.getLowStockItems(tenantId);
    return lowStockItems;
  } catch (error) {
    logger.error('Error getting low stock items:', error);
    throw error;
  }
};

// Get inventory movement history
const getInventoryHistory = async ({ productId, limit = 50, offset = 0, type, startDate, endDate, tenantId }) => {
  if (!tenantId) {
    throw new Error('tenantId is required to get inventory history');
  }
  try {
    const inventory = await Inventory.findOne({ product: productId, tenantId });
    
    if (!inventory) {
      return [];
    }

    let movements = inventory.movements;

    // Filter by type
    if (type) {
      movements = movements.filter(movement => movement.type === type);
    }

    // Filter by date range
    if (startDate || endDate) {
      movements = movements.filter(movement => {
        const movementDate = new Date(movement.date);
        if (startDate && movementDate < new Date(startDate)) return false;
        if (endDate && movementDate > new Date(endDate)) return false;
        return true;
      });
    }

    // Sort by date (newest first)
    movements.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Apply pagination
    const paginatedMovements = movements.slice(offset, offset + limit);

    return {
      movements: paginatedMovements,
      total: movements.length,
      hasMore: offset + limit < movements.length,
    };
  } catch (error) {
    logger.error('Error getting inventory history:', error);
    throw error;
  }
};

// Get inventory summary
const getInventorySummary = async (tenantId) => {
  if (!tenantId) {
    throw new Error('tenantId is required to get inventory summary');
  }
  try {
    const matchFilter = { 
      status: 'active',
      tenantId: tenantId
    };
    const totalProducts = await Inventory.countDocuments(matchFilter);
    const outOfStock = await Inventory.countDocuments({ 
      ...matchFilter,
      status: 'out_of_stock' 
    });
    const lowStock = await Inventory.countDocuments({
      ...matchFilter,
      $expr: { $lte: ['$currentStock', '$reorderPoint'] }
    });

    const totalValue = await Inventory.aggregate([
      { $match: matchFilter },
      { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $match: { 'product.tenantId': tenantId } },
      {
        $group: {
          _id: null,
          totalValue: { $sum: { $multiply: ['$currentStock', '$product.pricing.cost'] } },
        },
      },
    ]);

    return {
      totalProducts,
      outOfStock,
      lowStock,
      totalValue: totalValue.length > 0 ? totalValue[0].totalValue : 0,
    };
  } catch (error) {
    logger.error('Error getting inventory summary:', error);
    throw error;
  }
};

// Bulk update stock levels
const bulkUpdateStock = async (updates, tenantId) => {
  if (!tenantId) {
    throw new Error('tenantId is required to bulk update stock');
  }
  try {
    logger.info('Bulk update stock called with:', updates);
    const results = [];
    
    for (const update of updates) {
      try {
        logger.info('Processing update for product:', update.productId, 'type:', update.type, 'quantity:', update.quantity);
        const result = await updateStock({ ...update, tenantId });
        logger.info('Update successful, new stock:', result.currentStock);
        results.push({ success: true, productId: update.productId, inventory: result });
      } catch (error) {
        logger.error('Update failed for product:', { productId: update.productId, error: error.message });
        results.push({ success: false, productId: update.productId, error: error.message });
      }
    }
    
    logger.info('Bulk update results:', results);
    return results;
  } catch (error) {
    logger.error('Error in bulk update stock:', error);
    throw error;
  }
};

// Create inventory record for new product
const createInventoryRecord = async (productId, initialStock = 0, tenantId) => {
  if (!tenantId) {
    throw new Error('tenantId is required to create inventory record');
  }
  try {
    const product = await Product.findOne({ _id: productId, tenantId });
    if (!product) {
      throw new Error('Product not found');
    }

    const inventory = new Inventory({
      product: productId,
      currentStock: initialStock,
      reorderPoint: product.inventory?.reorderPoint || 10,
      reorderQuantity: product.inventory?.reorderQuantity || 50,
      tenantId: tenantId,
      cost: {
        average: product.pricing?.cost || 0,
        lastPurchase: product.pricing?.cost || 0,
      },
    });

    await inventory.save();
    return inventory;
  } catch (error) {
    logger.error('Error creating inventory record:', error);
    throw error;
  }
};

module.exports = {
  updateStock,
  reserveStock,
  releaseStock,
  processStockAdjustment,
  getInventoryStatus,
  getLowStockItems,
  getInventoryHistory,
  getInventorySummary,
  bulkUpdateStock,
  createInventoryRecord,
};
