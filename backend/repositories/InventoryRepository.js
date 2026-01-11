const BaseRepository = require('./BaseRepository');
const Inventory = require('../models/Inventory');

class InventoryRepository extends BaseRepository {
  constructor() {
    super(Inventory);
  }

  /**
   * Find inventory by product ID
   * @param {string} productId - Product ID
   * @param {object} options - Query options
   * @returns {Promise<Inventory|null>}
   */
  async findByProduct(productId, options = {}) {
    return await this.findOne({ product: productId }, options);
  }

  /**
   * Find inventory with aggregation (for complex queries with product joins)
   * @param {Array} pipeline - Aggregation pipeline
   * @returns {Promise<Array>}
   */
  async aggregate(pipeline) {
    return await this.Model.aggregate(pipeline);
  }

  /**
   * Find low stock items
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async findLowStock(options = {}) {
    const filter = {
      $expr: { $lte: ['$currentStock', '$reorderPoint'] },
      status: 'active'
    };
    return await this.findAll(filter, options);
  }

  /**
   * Find inventory by warehouse
   * @param {string} warehouse - Warehouse name
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async findByWarehouse(warehouse, options = {}) {
    return await this.findAll({ 'location.warehouse': warehouse }, options);
  }

  /**
   * Find inventory by status
   * @param {string} status - Inventory status
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async findByStatus(status, options = {}) {
    return await this.findAll({ status }, options);
  }

  /**
   * Update stock level
   * @deprecated DO NOT USE - Use Inventory.updateStock() static method instead
   * This method bypasses proper validation and audit trail
   * @param {string} productId - Product ID
   * @param {number} quantity - Quantity change (positive for increase, negative for decrease)
   * @returns {Promise<Inventory>}
   */
  async updateStock(productId, quantity) {
    throw new Error(
      'DIRECT_INVENTORY_UPDATE_BLOCKED: Cannot update inventory stock directly via repository. ' +
      'Use Inventory.updateStock(productId, movement) static method instead. ' +
      'This ensures proper validation, negative stock prevention, and audit trail. ' +
      'Example: await Inventory.updateStock(productId, { type: "in", quantity: 10, reason: "...", ... })'
    );
  }
}

module.exports = new InventoryRepository();

