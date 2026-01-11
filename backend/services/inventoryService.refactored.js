/**
 * Inventory Service - Refactored
 * 
 * Inventory is the SINGLE SOURCE OF TRUTH
 * Never syncs to Product stock fields
 * Only updates Inventory
 */

const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const logger = require('../utils/logger');

/**
 * Update stock levels (Inventory only - no Product sync)
 * @param {Object} params - Update parameters
 * @returns {Promise<Inventory>} Updated inventory
 */
const updateStock = async ({ productId, type, quantity, reason, reference, referenceId, referenceModel, cost, performedBy, notes }) => {
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

    // Update Inventory ONLY (single source of truth)
    const updatedInventory = await Inventory.updateStock(productId, movement);
    
    // REMOVED: Product stock sync
    // Product.inventory.currentStock is now read-only
    // Stock is always read from Inventory
    
    // Optional: Update Product cost (if purchase)
    if (cost !== undefined && cost !== null && (type === 'in' || type === 'return')) {
      const inventory = await Inventory.findOne({ product: productId });
      if (inventory && inventory.cost && inventory.cost.average) {
        // Update Product pricing.cost (cost is not stock, so it's allowed)
        await Product.findByIdAndUpdate(productId, {
          $set: {
            'pricing.cost': inventory.cost.average
          }
        });
      }
    }
    
    return updatedInventory;
  } catch (error) {
    logger.error('Error updating stock:', error);
    throw error;
  }
};

/**
 * Reserve stock (Inventory only)
 * @param {Object} params - Reservation parameters
 * @returns {Promise<Inventory>} Updated inventory
 */
const reserveStock = async ({ productId, quantity }) => {
  try {
    const inventory = await Inventory.reserveStock(productId, quantity);
    return inventory;
  } catch (error) {
    logger.error('Error reserving stock:', error);
    throw error;
  }
};

/**
 * Release reserved stock (Inventory only)
 * @param {Object} params - Release parameters
 * @returns {Promise<Inventory>} Updated inventory
 */
const releaseStock = async ({ productId, quantity }) => {
  try {
    const inventory = await Inventory.releaseStock(productId, quantity);
    return inventory;
  } catch (error) {
    logger.error('Error releasing stock:', error);
    throw error;
  }
};

/**
 * Process stock adjustment (Inventory only)
 * @param {Object} params - Adjustment parameters
 * @returns {Promise<Object>} Adjustment result
 */
const processStockAdjustment = async ({ adjustments, type, reason, requestedBy, warehouse, notes }) => {
  try {
    const StockAdjustment = require('../models/StockAdjustment');
    
    const adjustment = new StockAdjustment({
      type,
      reason,
      adjustments,
      requestedBy,
      warehouse,
      notes,
    });

    await adjustment.save();
    
    // Apply adjustments to Inventory (not Product)
    for (const adj of adjustments) {
      await updateStock({
        productId: adj.productId,
        type: 'adjustment',
        quantity: adj.newQuantity,
        reason: reason,
        reference: 'StockAdjustment',
        referenceId: adjustment._id,
        referenceModel: 'StockAdjustment',
        performedBy: requestedBy,
        notes: notes
      });
    }
    
    return adjustment;
  } catch (error) {
    logger.error('Error processing stock adjustment:', error);
    throw error;
  }
};

/**
 * Get inventory status (from Inventory only)
 * @param {String} productId - Product ID
 * @returns {Promise<Object>} Inventory status
 */
const getInventoryStatus = async (productId) => {
  try {
    const inventory = await Inventory.findOne({ product: productId })
      .populate('product', 'name description pricing')
      .populate('movements.performedBy', 'firstName lastName')
      .sort({ 'movements.date': -1 });

    if (!inventory) {
      // Create inventory record if it doesn't exist
      const product = await Product.findById(productId);
      if (!product) {
        throw new Error('Product not found');
      }

      const newInventory = new Inventory({
        product: productId,
        currentStock: 0, // Start with 0, not from Product
        reorderPoint: product.inventory?.reorderPoint || 10,
        reorderQuantity: product.inventory?.reorderQuantity || 50,
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

/**
 * Get low stock items (from Inventory only)
 * @returns {Promise<Array>} Low stock items
 */
const getLowStockItems = async () => {
  try {
    const lowStockItems = await Inventory.getLowStockItems();
    return lowStockItems;
  } catch (error) {
    logger.error('Error getting low stock items:', error);
    throw error;
  }
};

/**
 * Get inventory history (from Inventory only)
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Inventory history
 */
const getInventoryHistory = async ({ productId, limit = 50, offset = 0, type, startDate, endDate }) => {
  try {
    const inventory = await Inventory.findOne({ product: productId });
    
    if (!inventory) {
      return {
        movements: [],
        total: 0,
        hasMore: false
      };
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

/**
 * Get inventory summary (from Inventory only)
 * @returns {Promise<Object>} Inventory summary
 */
const getInventorySummary = async () => {
  try {
    const totalProducts = await Inventory.countDocuments({ status: 'active' });
    const outOfStock = await Inventory.countDocuments({ status: 'out_of_stock' });
    const lowStock = await Inventory.countDocuments({
      $expr: { $lte: ['$currentStock', '$reorderPoint'] },
      status: 'active',
    });

    const totalValue = await Inventory.aggregate([
      { $match: { status: 'active' } },
      { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
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

/**
 * Bulk update stock levels (Inventory only)
 * @param {Array} updates - Update array
 * @returns {Promise<Array>} Update results
 */
const bulkUpdateStock = async (updates) => {
  try {
    logger.info('Bulk update stock called', { count: updates.length });
    const results = [];
    
    for (const update of updates) {
      try {
        const result = await updateStock(update);
        results.push({ success: true, productId: update.productId, inventory: result });
      } catch (error) {
        logger.error('Update failed for product:', update.productId, error.message);
        results.push({ success: false, productId: update.productId, error: error.message });
      }
    }
    
    return results;
  } catch (error) {
    logger.error('Error in bulk update stock:', error);
    throw error;
  }
};

/**
 * Create inventory record for new product
 * @param {String} productId - Product ID
 * @param {Number} initialStock - Initial stock (default 0)
 * @returns {Promise<Inventory>} Created inventory
 */
const createInventoryRecord = async (productId, initialStock = 0) => {
  try {
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    // Check if inventory already exists
    const existing = await Inventory.findOne({ product: productId });
    if (existing) {
      return existing;
    }

    const inventory = new Inventory({
      product: productId,
      currentStock: initialStock,
      reorderPoint: product.inventory?.reorderPoint || 10,
      reorderQuantity: product.inventory?.reorderQuantity || 50,
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

