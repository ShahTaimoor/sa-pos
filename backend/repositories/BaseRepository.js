/**
 * Base Repository
 * Provides common database operations for all repositories
 * Implements soft delete pattern (isDeleted flag)
 * Enforces tenant isolation by automatically adding tenantId to queries
 */
class BaseRepository {
  constructor(Model) {
    this.Model = Model;
  }

  /**
   * Enforce tenantId in query
   * This is a security-critical method that ensures tenant isolation
   * @param {object} query - Query object
   * @param {string|ObjectId} tenantId - Tenant ID (required for multi-tenant models)
   * @param {boolean} allowNoTenantId - Allow queries without tenantId (only for system models)
   * @returns {object} - Query with tenantId enforced
   */
  _enforceTenantId(query = {}, tenantId = null, allowNoTenantId = false) {
    // Check if model has tenantId field
    const hasTenantIdField = this.Model.schema.paths.tenantId;
    
    if (!hasTenantIdField) {
      // Model doesn't support multi-tenancy, return query as-is
      return query;
    }
    
    // If tenantId is provided, always enforce it (security: never trust frontend)
    if (tenantId) {
      query.tenantId = tenantId;
      return query;
    }
    
    // If no tenantId provided and model requires it, throw error
    if (!allowNoTenantId) {
      throw new Error(
        `Tenant ID is required for ${this.Model.modelName}. ` +
        `All queries must be scoped to a tenant for security.`
      );
    }
    
    return query;
  }

  /**
   * Find all documents matching the query
   * Automatically filters out soft-deleted documents (if isDeleted field exists)
   * Automatically enforces tenantId for multi-tenant isolation
   */
  async findAll(query = {}, options = {}) {
    const { 
      skip, 
      limit, 
      sort, 
      populate, 
      select, 
      lean, 
      includeDeleted = false,
      tenantId = null,
      allowNoTenantId = false // Only set to true for system-level queries
    } = options;
    
    // Enforce tenantId (security: prevents cross-tenant data access)
    const finalQuery = this._enforceTenantId(query, tenantId, allowNoTenantId);
    
    // Add soft delete filter (only if model supports soft delete)
    if (!includeDeleted && this.Model.schema.paths.isDeleted) {
      finalQuery.isDeleted = { $ne: true };
    }
    
    let queryBuilder = this.Model.find(finalQuery);
    
    if (populate) {
      if (Array.isArray(populate)) {
        populate.forEach(pop => queryBuilder = queryBuilder.populate(pop));
      } else {
        queryBuilder = queryBuilder.populate(populate);
      }
    }
    
    if (select) {
      queryBuilder = queryBuilder.select(select);
    }
    
    if (sort && (typeof sort === 'object' || typeof sort === 'string') && !Array.isArray(sort)) {
      queryBuilder = queryBuilder.sort(sort);
    }
    
    if (skip !== undefined) {
      queryBuilder = queryBuilder.skip(skip);
    }
    
    if (limit !== undefined) {
      queryBuilder = queryBuilder.limit(limit);
    }
    
    if (lean) {
      queryBuilder = queryBuilder.lean();
    }
    
    return await queryBuilder.exec();
  }

  /**
   * Find one document matching the query
   * Automatically filters out soft-deleted documents (if isDeleted field exists)
   * Automatically enforces tenantId for multi-tenant isolation
   */
  async findOne(query = {}, options = {}) {
    const { 
      populate, 
      select, 
      lean, 
      includeDeleted = false,
      tenantId = null,
      allowNoTenantId = false
    } = options;
    
    // Enforce tenantId (security: prevents cross-tenant data access)
    const finalQuery = this._enforceTenantId(query, tenantId, allowNoTenantId);
    
    // Add soft delete filter (only if model supports soft delete)
    if (!includeDeleted && this.Model.schema.paths.isDeleted) {
      finalQuery.isDeleted = { $ne: true };
    }
    
    let queryBuilder = this.Model.findOne(finalQuery);
    
    if (populate) {
      if (Array.isArray(populate)) {
        populate.forEach(pop => queryBuilder = queryBuilder.populate(pop));
      } else {
        queryBuilder = queryBuilder.populate(populate);
      }
    }
    
    if (select) {
      queryBuilder = queryBuilder.select(select);
    }
    
    if (lean) {
      queryBuilder = queryBuilder.lean();
    }
    
    return await queryBuilder.exec();
  }

  /**
   * Find document by ID
   * Automatically filters out soft-deleted documents (if isDeleted field exists)
   * Automatically enforces tenantId for multi-tenant isolation
   */
  async findById(id, options = {}) {
    if (!id) return null;
    
    // tenantId should be passed in options
    return await this.findOne({ _id: id }, options);
  }

  /**
   * Count documents matching the query
   * Automatically filters out soft-deleted documents (if isDeleted field exists)
   * Automatically enforces tenantId for multi-tenant isolation
   */
  async count(query = {}, options = {}) {
    const { 
      includeDeleted = false,
      tenantId = null,
      allowNoTenantId = false
    } = options;
    
    // Enforce tenantId (security: prevents cross-tenant data access)
    const finalQuery = this._enforceTenantId(query, tenantId, allowNoTenantId);
    
    if (!includeDeleted && this.Model.schema.paths.isDeleted) {
      finalQuery.isDeleted = { $ne: true };
    }
    return await this.Model.countDocuments(finalQuery);
  }

  /**
   * Create a new document
   * Automatically enforces tenantId if model supports it
   */
  async create(data, options = {}) {
    const { tenantId = null } = options;
    
    // If model has tenantId field and tenantId is provided, ensure it's set
    if (this.Model.schema.paths.tenantId && tenantId) {
      data.tenantId = tenantId;
    }
    
    // If model requires tenantId but it's missing, throw error
    if (this.Model.schema.paths.tenantId && !data.tenantId) {
      throw new Error(
        `tenantId is required when creating ${this.Model.modelName}. ` +
        `All documents must be associated with a tenant.`
      );
    }
    
    const document = new this.Model(data);
    return await document.save();
  }

  /**
   * Create multiple documents
   */
  async createMany(dataArray) {
    return await this.Model.insertMany(dataArray);
  }

  /**
   * Update a document by ID
   * Automatically filters out soft-deleted documents (if isDeleted field exists)
   * Automatically enforces tenantId for multi-tenant isolation
   */
  async updateById(id, updateData, options = {}) {
    const { 
      new: returnNew = true, 
      runValidators = true, 
      includeDeleted = false,
      tenantId = null,
      allowNoTenantId = false
    } = options;
    
    // Prevent tenantId from being changed via update (security)
    if (updateData.tenantId) {
      delete updateData.tenantId;
    }
    
    const query = { _id: id };
    
    // Enforce tenantId (security: prevents cross-tenant updates)
    if (this.Model.schema.paths.tenantId) {
      if (tenantId) {
        query.tenantId = tenantId;
      } else if (!allowNoTenantId) {
        throw new Error(
          `Tenant ID is required when updating ${this.Model.modelName}. ` +
          `All updates must be scoped to a tenant for security.`
        );
      }
    }
    
    if (!includeDeleted && this.Model.schema.paths.isDeleted) {
      query.isDeleted = { $ne: true };
    }
    
    return await this.Model.findOneAndUpdate(
      query,
      updateData,
      { new: returnNew, runValidators }
    );
  }

  /**
   * Update multiple documents
   * Automatically filters out soft-deleted documents
   * Automatically enforces tenantId for multi-tenant isolation
   */
  async updateMany(query, updateData, options = {}) {
    const { 
      tenantId = null,
      allowNoTenantId = false
    } = options;
    
    // Prevent tenantId from being changed via update (security)
    if (updateData.$set && updateData.$set.tenantId) {
      delete updateData.$set.tenantId;
    }
    if (updateData.tenantId) {
      delete updateData.tenantId;
    }
    
    // Enforce tenantId (security: prevents cross-tenant updates)
    const finalQuery = this._enforceTenantId(query, tenantId, allowNoTenantId);
    
    if (this.Model.schema.paths.isDeleted) {
      finalQuery.isDeleted = { $ne: true };
    }
    
    return await this.Model.updateMany(finalQuery, updateData, options);
  }

  /**
   * Soft delete a document (set isDeleted flag)
   * Automatically enforces tenantId for multi-tenant isolation
   */
  async softDelete(id, options = {}) {
    const { tenantId = null } = options;
    return await this.updateById(id, { 
      isDeleted: true, 
      deletedAt: new Date() 
    }, { tenantId, ...options });
  }

  /**
   * Hard delete a document (permanent removal)
   * Automatically enforces tenantId for multi-tenant isolation
   * WARNING: This is permanent and should be used with extreme caution
   */
  async hardDelete(id, options = {}) {
    const { tenantId = null, allowNoTenantId = false } = options;
    
    const query = { _id: id };
    if (this.Model.schema.paths.tenantId) {
      if (tenantId) {
        query.tenantId = tenantId;
      } else if (!allowNoTenantId) {
        throw new Error(
          `Tenant ID is required when deleting ${this.Model.modelName}. ` +
          `All deletions must be scoped to a tenant for security.`
        );
      }
    }
    
    return await this.Model.findOneAndDelete(query);
  }

  /**
   * Restore a soft-deleted document
   * Automatically enforces tenantId for multi-tenant isolation
   */
  async restore(id, options = {}) {
    const { tenantId = null } = options;
    return await this.updateById(id, { 
      isDeleted: false, 
      deletedAt: null 
    }, { includeDeleted: true, tenantId, ...options });
  }

  /**
   * Delete a document (defaults to soft delete)
   * For backward compatibility - use softDelete() explicitly for clarity
   */
  async delete(id) {
    return await this.softDelete(id);
  }

  /**
   * Find all deleted documents
   */
  async findDeleted(query = {}, options = {}) {
    const finalQuery = { ...query, isDeleted: true };
    return await this.findAll(finalQuery, { ...options, includeDeleted: true });
  }

  /**
   * Find one deleted document
   */
  async findOneDeleted(query = {}, options = {}) {
    const finalQuery = { ...query, isDeleted: true };
    return await this.findOne(finalQuery, { ...options, includeDeleted: true });
  }

  /**
   * Find deleted document by ID
   */
  async findDeletedById(id, options = {}) {
    if (!id) return null;
    return await this.findOneDeleted({ _id: id }, options);
  }

  /**
   * Count deleted documents
   */
  async countDeleted(query = {}) {
    const finalQuery = { ...query, isDeleted: true };
    return await this.Model.countDocuments(finalQuery);
  }

  /**
   * Bulk soft delete documents
   */
  async bulkSoftDelete(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return { deletedCount: 0 };
    }
    
    const result = await this.Model.updateMany(
      { _id: { $in: ids } },
      { 
        isDeleted: true, 
        deletedAt: new Date() 
      }
    );
    
    return { deletedCount: result.modifiedCount };
  }

  /**
   * Bulk restore documents
   */
  async bulkRestore(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return { restoredCount: 0 };
    }
    
    const result = await this.Model.updateMany(
      { _id: { $in: ids }, isDeleted: true },
      { 
        isDeleted: false, 
        deletedAt: null 
      }
    );
    
    return { restoredCount: result.modifiedCount };
  }

  /**
   * Permanently delete all soft-deleted documents older than specified days
   * WARNING: This is irreversible!
   */
  async purgeOldDeleted(olderThanDays = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const result = await this.Model.deleteMany({
      isDeleted: true,
      deletedAt: { $lt: cutoffDate }
    });
    
    return { deletedCount: result.deletedCount };
  }

  /**
   * Get statistics about deleted items
   */
  async getDeletedStats() {
    const totalDeleted = await this.Model.countDocuments({ isDeleted: true });
    const recentlyDeleted = await this.Model.countDocuments({
      isDeleted: true,
      deletedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    });
    
    return {
      totalDeleted,
      recentlyDeleted,
      olderThan30Days: await this.Model.countDocuments({
        isDeleted: true,
        deletedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      })
    };
  }

  /**
   * Execute aggregation pipeline
   * Automatically filters out soft-deleted documents
   * Automatically enforces tenantId for multi-tenant isolation
   */
  async aggregate(pipeline, options = {}) {
    const { tenantId = null, allowNoTenantId = false } = options;
    
    // Build match filter with tenantId and soft delete
    const matchConditions = {};
    
    // Enforce tenantId
    if (this.Model.schema.paths.tenantId) {
      if (tenantId) {
        matchConditions.tenantId = tenantId;
      } else if (!allowNoTenantId) {
        throw new Error(
          `Tenant ID is required for aggregation on ${this.Model.modelName}. ` +
          `All aggregations must be scoped to a tenant for security.`
        );
      }
    }
    
    // Add soft delete filter
    if (this.Model.schema.paths.isDeleted) {
      matchConditions.isDeleted = { $ne: true };
    }
    
    // If we have match conditions, add them to the pipeline
    if (Object.keys(matchConditions).length > 0) {
      const matchFilter = { $match: matchConditions };
      
      // If pipeline already starts with $match, merge the conditions
      if (pipeline.length > 0 && pipeline[0].$match) {
        pipeline[0].$match = {
          ...pipeline[0].$match,
          ...matchConditions
        };
      } else {
        pipeline.unshift(matchFilter);
      }
    }
    
    return await this.Model.aggregate(pipeline);
  }

  /**
   * Check if document exists
   * Automatically enforces tenantId for multi-tenant isolation
   */
  async exists(query = {}, options = {}) {
    const { 
      includeDeleted = false,
      tenantId = null,
      allowNoTenantId = false
    } = options;
    
    // Enforce tenantId (security: prevents cross-tenant checks)
    const finalQuery = this._enforceTenantId(query, tenantId, allowNoTenantId);
    
    if (!includeDeleted && this.Model.schema.paths.isDeleted) {
      finalQuery.isDeleted = { $ne: true };
    }
    const count = await this.Model.countDocuments(finalQuery);
    return count > 0;
  }
}

module.exports = BaseRepository;

