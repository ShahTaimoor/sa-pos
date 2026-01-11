/**
 * Immutable Costing Service
 * 
 * Handles costing method immutability and COGS freezing
 */

const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Sales = require('../models/Sales');
const logger = require('../utils/logger');

class ImmutableCostingService {
  /**
   * Set costing method on first purchase
   * @param {String} productId - Product ID
   * @param {String} method - Costing method (fifo, lifo, average, standard)
   * @param {Object} user - User setting the method
   * @param {String} purchaseOrderId - Purchase order ID (optional)
   * @returns {Promise<Product>} Updated product
   */
  async setCostingMethodOnFirstPurchase(productId, method, user, purchaseOrderId = null) {
    try {
      const product = await Product.findById(productId);
      
      if (!product) {
        throw new Error(`Product ${productId} not found`);
      }
      
      // If method already set and locked, return
      if (product.costing?.method && product.costing.isLocked) {
        logger.debug(`Product ${productId} already has locked costing method: ${product.costing.method}`);
        return product;
      }
      
      // Validate method
      if (!['fifo', 'lifo', 'average', 'standard'].includes(method)) {
        throw new Error(`Invalid costing method: ${method}`);
      }
      
      // Set costing method
      product.costing = {
        method: method,
        methodSetAt: new Date(),
        methodSetBy: user._id,
        methodSetOnPurchase: purchaseOrderId,
        isLocked: true,
        lockedAt: new Date()
      };
      
      await product.save();
      
      logger.info(`Costing method set for product ${productId}: ${method}`, {
        productId,
        method,
        userId: user._id,
        purchaseOrderId
      });
      
      return product;
    } catch (error) {
      logger.error('Error setting costing method:', error);
      throw error;
    }
  }

  /**
   * Validate costing method cannot be changed
   * @param {String} productId - Product ID
   * @param {String} requestedMethod - Requested method
   * @returns {Promise<Object>} Validation result
   */
  async validateCostMethod(productId, requestedMethod) {
    try {
      const product = await Product.findById(productId);
      
      if (!product) {
        throw new Error(`Product ${productId} not found`);
      }
      
      // If method not set, allow any method
      if (!product.costing?.method) {
        return {
          valid: true,
          currentMethod: null,
          canSet: true
        };
      }
      
      // If method is locked, validate it matches
      if (product.costing.isLocked) {
        if (product.costing.method !== requestedMethod) {
          return {
            valid: false,
            currentMethod: product.costing.method,
            requestedMethod: requestedMethod,
            error: `Costing method mismatch. Product uses ${product.costing.method}, but ${requestedMethod} was requested.`
          };
        }
      }
      
      return {
        valid: true,
        currentMethod: product.costing.method,
        canSet: !product.costing.isLocked
      };
    } catch (error) {
      logger.error('Error validating cost method:', error);
      throw error;
    }
  }

  /**
   * Calculate and freeze COGS at sale time
   * @param {String} productId - Product ID
   * @param {Number} quantity - Quantity sold
   * @param {Date} saleDate - Sale date (for historical accuracy)
   * @returns {Promise<Object>} Frozen COGS data
   */
  async calculateAndFreezeCOGS(productId, quantity, saleDate = new Date()) {
    try {
      const product = await Product.findById(productId);
      
      if (!product) {
        throw new Error(`Product ${productId} not found`);
      }
      
      const costingMethod = product.costing?.method;
      
      if (!costingMethod) {
        throw new Error(`Costing method not set for product ${productId}`);
      }
      
      // Calculate COGS based on method
      let cogs;
      
      switch (costingMethod) {
        case 'fifo':
          cogs = await this.calculateFIFOCOGS(productId, quantity, saleDate);
          break;
        case 'lifo':
          cogs = await this.calculateLIFOCOGS(productId, quantity, saleDate);
          break;
        case 'average':
          cogs = await this.calculateAverageCOGS(productId, quantity, saleDate);
          break;
        case 'standard':
          cogs = await this.calculateStandardCOGS(productId, quantity);
          break;
        default:
          throw new Error(`Unknown costing method: ${costingMethod}`);
      }
      
      // Return frozen COGS structure
      return {
        unitCost: cogs.unitCost,
        totalCost: cogs.totalCost,
        costingMethod: costingMethod,
        calculatedAt: saleDate,
        batches: cogs.batches || [],
        averageCostAtSale: cogs.averageCostAtSale || null
      };
    } catch (error) {
      logger.error('Error calculating and freezing COGS:', error);
      throw error;
    }
  }

  /**
   * Calculate FIFO COGS
   */
  async calculateFIFOCOGS(productId, quantity, saleDate = new Date()) {
    const inventory = await Inventory.findOne({ product: productId });
    
    if (!inventory || !inventory.cost?.fifo || inventory.cost.fifo.length === 0) {
      // Fallback to average
      const avgCost = inventory?.cost?.average || 0;
      if (avgCost === 0) {
        throw new Error('FIFO batches not available and no average cost');
      }
      return {
        unitCost: avgCost,
        totalCost: avgCost * quantity,
        averageCostAtSale: avgCost,
        method: 'fifo_fallback'
      };
    }
    
    // Filter batches available at sale date
    const availableBatches = inventory.cost.fifo
      .filter(batch => batch.quantity > 0 && new Date(batch.date) <= saleDate)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    let remainingQty = quantity;
    let totalCost = 0;
    const batchesUsed = [];
    
    for (const batch of availableBatches) {
      if (remainingQty <= 0) break;
      
      const qtyToUse = Math.min(remainingQty, batch.quantity);
      const batchCost = qtyToUse * batch.cost;
      
      totalCost += batchCost;
      batchesUsed.push({
        batchId: batch._id,
        quantity: qtyToUse,
        unitCost: batch.cost,
        date: batch.date
      });
      
      remainingQty -= qtyToUse;
    }
    
    if (remainingQty > 0) {
      // Use average cost for remaining
      const avgCost = inventory.cost.average || 0;
      totalCost += remainingQty * avgCost;
      batchesUsed.push({
        quantity: remainingQty,
        unitCost: avgCost,
        note: 'Insufficient FIFO batches, used average cost'
      });
    }
    
    return {
      unitCost: quantity > 0 ? totalCost / quantity : 0,
      totalCost: totalCost,
      batches: batchesUsed,
      method: 'fifo'
    };
  }

  /**
   * Calculate LIFO COGS
   */
  async calculateLIFOCOGS(productId, quantity, saleDate = new Date()) {
    const inventory = await Inventory.findOne({ product: productId });
    
    if (!inventory || !inventory.cost?.lifo || inventory.cost.lifo.length === 0) {
      // Fallback to average
      const avgCost = inventory?.cost?.average || 0;
      if (avgCost === 0) {
        throw new Error('LIFO batches not available and no average cost');
      }
      return {
        unitCost: avgCost,
        totalCost: avgCost * quantity,
        averageCostAtSale: avgCost,
        method: 'lifo_fallback'
      };
    }
    
    // Filter batches available at sale date
    const availableBatches = inventory.cost.lifo
      .filter(batch => batch.quantity > 0 && new Date(batch.date) <= saleDate)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    let remainingQty = quantity;
    let totalCost = 0;
    const batchesUsed = [];
    
    for (const batch of availableBatches) {
      if (remainingQty <= 0) break;
      
      const qtyToUse = Math.min(remainingQty, batch.quantity);
      const batchCost = qtyToUse * batch.cost;
      
      totalCost += batchCost;
      batchesUsed.push({
        batchId: batch._id,
        quantity: qtyToUse,
        unitCost: batch.cost,
        date: batch.date
      });
      
      remainingQty -= qtyToUse;
    }
    
    if (remainingQty > 0) {
      // Use average cost for remaining
      const avgCost = inventory.cost.average || 0;
      totalCost += remainingQty * avgCost;
      batchesUsed.push({
        quantity: remainingQty,
        unitCost: avgCost,
        note: 'Insufficient LIFO batches, used average cost'
      });
    }
    
    return {
      unitCost: quantity > 0 ? totalCost / quantity : 0,
      totalCost: totalCost,
      batches: batchesUsed,
      method: 'lifo'
    };
  }

  /**
   * Calculate Average COGS
   */
  async calculateAverageCOGS(productId, quantity, saleDate = new Date()) {
    const inventory = await Inventory.findOne({ product: productId });
    
    if (!inventory || inventory.cost?.average === undefined) {
      throw new Error('Average cost not available');
    }
    
    const averageCost = inventory.cost.average;
    
    return {
      unitCost: averageCost,
      totalCost: averageCost * quantity,
      averageCostAtSale: averageCost,
      method: 'average'
    };
  }

  /**
   * Calculate Standard COGS
   */
  async calculateStandardCOGS(productId, quantity) {
    const product = await Product.findById(productId);
    
    if (!product || !product.standardCost) {
      throw new Error('Standard cost not set for product');
    }
    
    return {
      unitCost: product.standardCost,
      totalCost: product.standardCost * quantity,
      method: 'standard'
    };
  }

  /**
   * Get frozen COGS from sales order item
   * @param {String} salesOrderId - Sales order ID
   * @param {String} itemId - Item ID
   * @returns {Promise<Object>} Frozen COGS
   */
  async getFrozenCOGS(salesOrderId, itemId) {
    try {
      const order = await Sales.findById(salesOrderId);
      
      if (!order) {
        throw new Error(`Sales order ${salesOrderId} not found`);
      }
      
      const item = order.items.id(itemId);
      
      if (!item) {
        throw new Error(`Item ${itemId} not found in order ${salesOrderId}`);
      }
      
      if (!item.frozenCOGS) {
        throw new Error(`Frozen COGS not found for item ${itemId}`);
      }
      
      return item.frozenCOGS;
    } catch (error) {
      logger.error('Error getting frozen COGS:', error);
      throw error;
    }
  }
}

module.exports = new ImmutableCostingService();

