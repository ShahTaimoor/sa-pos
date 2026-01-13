const BaseRepository = require('./BaseRepository');
const Category = require('../models/Category');

class CategoryRepository extends BaseRepository {
  constructor() {
    super(Category);
  }

  /**
   * Find category by name
   * @param {string} name - Category name
   * @param {string} tenantId - Tenant ID
   * @param {object} options - Query options
   * @returns {Promise<Category|null>}
   */
  async findByName(name, tenantId = null, options = {}) {
    if (!name) return null;
    const query = { name: { $regex: `^${name}$`, $options: 'i' } };
    if (tenantId) query.tenantId = tenantId;
    return await this.findOne(query, options);
  }

  /**
   * Find categories with advanced filtering and pagination
   * @param {object} filter - Filter query
   * @param {object} options - Pagination and sorting options
   * @returns {Promise<{categories: Array, total: number, pagination: object}>}
   */
  async findWithPagination(filter = {}, options = {}) {
    const {
      page = 1,
      limit = 50,
      sort = { sortOrder: 1, name: 1 },
      populate = [{ path: 'parentCategory', select: 'name' }],
      getAll = false
    } = options;

    const skip = getAll ? 0 : (page - 1) * limit;
    const finalLimit = getAll ? 999999 : limit;

    const finalQuery = this.Model.schema.paths.isDeleted 
      ? { ...filter, isDeleted: { $ne: true } } 
      : filter;

    let queryBuilder = this.Model.find(finalQuery);
    
    if (populate) {
      if (Array.isArray(populate)) {
        populate.forEach(pop => queryBuilder = queryBuilder.populate(pop));
      } else {
        queryBuilder = queryBuilder.populate(populate);
      }
    }
    
    if (sort) {
      queryBuilder = queryBuilder.sort(sort);
    }
    
    if (skip !== undefined) {
      queryBuilder = queryBuilder.skip(skip);
    }
    
    if (finalLimit > 0) {
      queryBuilder = queryBuilder.limit(finalLimit);
    }

    const [categories, total] = await Promise.all([
      queryBuilder,
      this.Model.countDocuments(finalQuery)
    ]);

    return {
      categories,
      total,
      pagination: getAll ? {
        current: 1,
        pages: 1,
        total,
        hasNext: false,
        hasPrev: false
      } : {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  }

  /**
   * Find categories by parent
   * @param {string} parentId - Parent category ID
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async findByParent(parentId, options = {}) {
    return await this.findAll({ parentCategory: parentId }, options);
  }

  /**
   * Get category tree
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Array>}
   */
  async getCategoryTree(tenantId = null) {
    return await this.Model.getCategoryTree(tenantId);
  }

  /**
   * Get category statistics
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<object>}
   */
  async getStats(tenantId = null) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for getStats');
    }
    const matchStage = { 
      tenantId: tenantId,
      isDeleted: { $ne: true }
    };
    
    const stats = await this.Model.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalCategories: { $sum: 1 },
          activeCategories: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          inactiveCategories: {
            $sum: { $cond: ['$isActive', 0, 1] }
          }
        }
      }
    ]);

    return stats[0] || {
      totalCategories: 0,
      activeCategories: 0,
      inactiveCategories: 0
    };
  }

  /**
   * Check if category name exists
   * @param {string} name - Category name to check
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @param {string} excludeId - Category ID to exclude from check
   * @returns {Promise<boolean>}
   */
  async nameExists(name, tenantId = null, excludeId = null) {
    if (!name) return false;
    if (!tenantId) {
      throw new Error('Tenant ID is required for nameExists');
    }
    const query = { 
      name: { $regex: `^${name}$`, $options: 'i' },
      tenantId: tenantId,
      isDeleted: { $ne: true }
    };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    const count = await this.Model.countDocuments(query);
    return count > 0;
  }

  /**
   * Count subcategories
   * @param {string} categoryId - Category ID
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<number>}
   */
  async countSubcategories(categoryId, tenantId = null) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for countSubcategories');
    }
    return await this.Model.countDocuments({ 
      parentCategory: categoryId,
      tenantId: tenantId,
      isDeleted: { $ne: true }
    });
  }
}

module.exports = new CategoryRepository();

