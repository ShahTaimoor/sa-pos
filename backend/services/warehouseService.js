const WarehouseRepository = require('../repositories/WarehouseRepository');
const InventoryRepository = require('../repositories/InventoryRepository');

class WarehouseService {
  /**
   * Get warehouses with filters
   * @param {object} queryParams - Query parameters
   * @returns {Promise<{warehouses: Array, pagination: object}>}
   */
  async getWarehouses(queryParams) {
    const { search, isActive, page = 1, limit = 20 } = queryParams;

    const filter = {};
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true' || isActive === true;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [{ name: searchRegex }, { code: searchRegex }];
    }

    const { warehouses, total, pagination } = await WarehouseRepository.findWithPagination(filter, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      sort: { isPrimary: -1, name: 1 }
    });

    return { warehouses, pagination };
  }

  /**
   * Get single warehouse by ID
   * @param {string} id - Warehouse ID
   * @returns {Promise<object>}
   */
  async getWarehouseById(id) {
    const warehouse = await WarehouseRepository.findById(id);
    if (!warehouse) {
      throw new Error('Warehouse not found');
    }
    return warehouse;
  }

  /**
   * Create warehouse
   * @param {object} warehouseData - Warehouse data
   * @param {string} userId - User ID
   * @param {object} options - Options including tenantId
   * @returns {Promise<object>}
   */
  async createWarehouse(warehouseData, userId, options = {}) {
    const tenantId = options.tenantId || warehouseData.tenantId;
    if (!tenantId) {
      throw new Error('tenantId is required for warehouse creation');
    }

    // Check if code already exists (within tenant)
    const existingWarehouse = await WarehouseRepository.findByCode(warehouseData.code, tenantId);
    if (existingWarehouse) {
      throw new Error('Warehouse code already exists');
    }

    // If this is set as primary, unset all other primary warehouses (within tenant)
    if (warehouseData.isPrimary) {
      // Note: unsetAllPrimary needs to be updated to accept tenantId
      // For now, we'll handle it in the update method
    }

    const processedData = {
      ...warehouseData,
      tenantId: tenantId,
      createdBy: userId
    };

    return await WarehouseRepository.create(processedData);
  }

  /**
   * Update warehouse
   * @param {string} id - Warehouse ID
   * @param {object} updateData - Update data
   * @param {string} userId - User ID
   * @param {object} options - Options including tenantId
   * @returns {Promise<object>}
   */
  async updateWarehouse(id, updateData, userId, options = {}) {
    const warehouse = await WarehouseRepository.findById(id);
    if (!warehouse) {
      throw new Error('Warehouse not found');
    }

    const tenantId = options.tenantId || warehouse.tenantId;

    // Check if code is being changed and if it already exists (within tenant)
    if (updateData.code && updateData.code !== warehouse.code && tenantId) {
      const codeExists = await WarehouseRepository.codeExists(updateData.code, tenantId, id);
      if (codeExists) {
        throw new Error('Warehouse code already exists');
      }
    }

    // If this is being set as primary, unset all other primary warehouses (within tenant)
    // Note: unsetAllPrimary needs tenantId support - handled by model pre-save hook

    const processedData = {
      ...updateData,
      updatedBy: userId
    };

    return await WarehouseRepository.update(id, processedData);
  }

  /**
   * Delete warehouse
   * @param {string} id - Warehouse ID
   * @returns {Promise<object>}
   */
  async deleteWarehouse(id) {
    const warehouse = await WarehouseRepository.findById(id);
    if (!warehouse) {
      throw new Error('Warehouse not found');
    }

    // Check if warehouse has inventory
    const inventoryCount = await InventoryRepository.count({ 'location.warehouse': id });
    if (inventoryCount > 0) {
      throw new Error(`Cannot delete warehouse. It has ${inventoryCount} inventory item(s). Please transfer or remove inventory first.`);
    }

    await WarehouseRepository.softDelete(id);
    return { message: 'Warehouse deleted successfully' };
  }
}

module.exports = new WarehouseService();

