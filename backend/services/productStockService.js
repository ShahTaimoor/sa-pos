/**
 * Product Stock Service
 * 
 * Provides read-only access to stock from Inventory
 * Never writes to Product stock fields
 * Only reads from Inventory (single source of truth)
 */

const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const logger = require('../utils/logger');

class ProductStockService {
  /**
   * Get product with stock populated from Inventory
   * @param {String} productId - Product ID
   * @param {Object} options - Options including tenantId
   * @returns {Promise<Product>} Product with stock
   */
  async getProductWithStock(productId, options = {}) {
    const { populateInventory = true, tenantId } = options;
    
    if (!tenantId) {
      throw new Error('tenantId is required to get product with stock');
    }
    
    const product = await Product.findOne({ _id: productId, tenantId });
    if (!product) {
      return null;
    }
    
    if (populateInventory) {
      // Get stock from Inventory (source of truth)
      const inventory = await Inventory.findOne({ product: productId, tenantId });
      
      if (inventory) {
        // Populate virtual fields via _inventory reference
        product._inventory = inventory;
      } else {
        // No inventory record - stock is 0
        product._inventory = {
          currentStock: 0,
          reservedStock: 0,
          availableStock: 0,
          status: 'out_of_stock'
        };
      }
    }
    
    return product;
  }

  /**
   * Get multiple products with stock populated
   * @param {Object} query - Product query
   * @param {Object} options - Options
   * @returns {Promise<Array>} Products with stock
   */
  async getProductsWithStock(query = {}, options = {}) {
    const { populateInventory = true } = options;
    
    const products = await Product.find(query);
    
    if (!populateInventory || products.length === 0) {
      return products;
    }
    
    // Get all inventories in one query
    const productIds = products.map(p => p._id);
    const inventories = await Inventory.find({
      product: { $in: productIds }
    });
    
    // Create map for O(1) lookup
    const inventoryMap = new Map(
      inventories.map(inv => [inv.product.toString(), inv])
    );
    
    // Populate stock for each product
    for (const product of products) {
      const inventory = inventoryMap.get(product._id.toString());
      if (inventory) {
        product._inventory = inventory;
      } else {
        // No inventory - default to 0 stock
        product._inventory = {
          currentStock: 0,
          reservedStock: 0,
          availableStock: 0,
          status: 'out_of_stock'
        };
      }
    }
    
    return products;
  }

  /**
   * Get stock for product (from Inventory only)
   * @param {String} productId - Product ID
   * @returns {Promise<Object>} Stock information
   */
  async getStock(productId) {
    const inventory = await Inventory.findOne({ product: productId });
    
    if (!inventory) {
      return {
        currentStock: 0,
        reservedStock: 0,
        availableStock: 0,
        status: 'out_of_stock',
        reorderPoint: 0,
        reorderQuantity: 50
      };
    }
    
    return {
      currentStock: inventory.currentStock,
      reservedStock: inventory.reservedStock,
      availableStock: inventory.availableStock,
      status: inventory.status,
      reorderPoint: inventory.reorderPoint,
      reorderQuantity: inventory.reorderQuantity
    };
  }

  /**
   * Check if product has sufficient stock
   * @param {String} productId - Product ID
   * @param {Number} quantity - Required quantity
   * @returns {Promise<Boolean>} Has sufficient stock
   */
  async hasSufficientStock(productId, quantity) {
    const stock = await this.getStock(productId);
    return stock.availableStock >= quantity;
  }

  /**
   * Get available stock for product
   * @param {String} productId - Product ID
   * @returns {Promise<Number>} Available stock
   */
  async getAvailableStock(productId) {
    const stock = await this.getStock(productId);
    return stock.availableStock;
  }

  /**
   * Update Product cache (read-only, for performance)
   * This is the ONLY way to update Product stock cache
   * @param {String} productId - Product ID
   * @returns {Promise<Product>} Product with updated cache
   */
  async updateProductStockCache(productId) {
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }
    
    const inventory = await Inventory.findOne({ product: productId });
    
    if (inventory) {
      // Set flag to allow cache update
      product.__allowCacheUpdate = true;
      
      product.inventory._cachedStock = inventory.currentStock;
      product.inventory._cachedAvailableStock = inventory.availableStock;
      product.inventory._cachedReservedStock = inventory.reservedStock;
      product.inventory._cachedStockLastUpdated = new Date();
      product._inventory = inventory._id;
      
      await product.save();
      
      // Clear flag
      delete product.__allowCacheUpdate;
      
      logger.debug(`Product stock cache updated: ${productId}`, {
        currentStock: inventory.currentStock,
        availableStock: inventory.availableStock
      });
    }
    
    return product;
  }

  /**
   * Batch update Product stock cache (for performance)
   * @param {Array<String>} productIds - Product IDs
   * @returns {Promise<Object>} Update results
   */
  async batchUpdateProductStockCache(productIds) {
    const inventories = await Inventory.find({
      product: { $in: productIds }
    });
    
    const results = {
      updated: 0,
      notFound: 0,
      errors: []
    };
    
    for (const inventory of inventories) {
      try {
        const product = await Product.findById(inventory.product);
        if (!product) {
          results.notFound++;
          continue;
        }
        
        product.__allowCacheUpdate = true;
        product.inventory._cachedStock = inventory.currentStock;
        product.inventory._cachedAvailableStock = inventory.availableStock;
        product.inventory._cachedReservedStock = inventory.reservedStock;
        product.inventory._cachedStockLastUpdated = new Date();
        product._inventory = inventory._id;
        
        await product.save();
        
        delete product.__allowCacheUpdate;
        results.updated++;
      } catch (error) {
        results.errors.push({
          productId: inventory.product,
          error: error.message
        });
        logger.error(`Error updating product stock cache: ${inventory.product}`, error);
      }
    }
    
    return results;
  }
}

module.exports = new ProductStockService();

