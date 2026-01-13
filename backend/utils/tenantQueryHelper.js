/**
 * Tenant Query Helper
 * 
 * Utility functions to ensure tenantId is always included in queries
 * This provides an additional layer of security beyond BaseRepository
 */

/**
 * Enforce tenantId in a query object
 * @param {object} query - MongoDB query object
 * @param {string|ObjectId} tenantId - Tenant ID (required)
 * @returns {object} - Query with tenantId enforced
 */
function enforceTenantId(query = {}, tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required for all queries');
  }
  
  return {
    ...query,
    tenantId: tenantId
  };
}

/**
 * Enforce tenantId in update operations
 * Prevents tenantId from being changed
 * @param {object} updateData - Update data
 * @param {string|ObjectId} tenantId - Tenant ID for verification
 * @returns {object} - Update data with tenantId removed (if present)
 */
function sanitizeUpdateData(updateData, tenantId) {
  // Create a copy to avoid mutating original
  const sanitized = { ...updateData };
  
  // Remove tenantId from update (security: never allow tenantId changes)
  if (sanitized.tenantId) {
    delete sanitized.tenantId;
  }
  
  // Remove from $set if present
  if (sanitized.$set && sanitized.$set.tenantId) {
    delete sanitized.$set.tenantId;
  }
  
  return sanitized;
}

/**
 * Verify tenantId matches between document and request
 * @param {object} document - Document from database
 * @param {string|ObjectId} tenantId - Tenant ID from request
 * @returns {boolean} - True if tenantId matches
 */
function verifyTenantAccess(document, tenantId) {
  if (!document) {
    return false;
  }
  
  if (!document.tenantId) {
    // Document doesn't have tenantId (old data or system model)
    return false;
  }
  
  return document.tenantId.toString() === tenantId.toString();
}

/**
 * Build tenant-scoped query for find operations
 * @param {object} baseQuery - Base query object
 * @param {string|ObjectId} tenantId - Tenant ID
 * @param {object} options - Additional options
 * @returns {object} - Tenant-scoped query
 */
function buildTenantQuery(baseQuery = {}, tenantId, options = {}) {
  const { includeDeleted = false } = options;
  
  const query = enforceTenantId(baseQuery, tenantId);
  
  // Add soft delete filter if needed
  if (!includeDeleted) {
    query.isDeleted = { $ne: true };
  }
  
  return query;
}

/**
 * Build tenant-scoped query for update operations
 * @param {string|ObjectId} id - Document ID
 * @param {string|ObjectId} tenantId - Tenant ID
 * @param {object} options - Additional options
 * @returns {object} - Tenant-scoped query for update
 */
function buildTenantUpdateQuery(id, tenantId, options = {}) {
  const { includeDeleted = false } = options;
  
  const query = {
    _id: id,
    tenantId: tenantId
  };
  
  // Add soft delete filter if needed
  if (!includeDeleted) {
    query.isDeleted = { $ne: true };
  }
  
  return query;
}

/**
 * Build tenant-scoped query for delete operations
 * @param {string|ObjectId} id - Document ID
 * @param {string|ObjectId} tenantId - Tenant ID
 * @returns {object} - Tenant-scoped query for delete
 */
function buildTenantDeleteQuery(id, tenantId) {
  return {
    _id: id,
    tenantId: tenantId
  };
}

/**
 * Validate tenantId format
 * @param {any} tenantId - Tenant ID to validate
 * @returns {boolean} - True if valid
 */
function isValidTenantId(tenantId) {
  if (!tenantId) {
    return false;
  }
  
  // Check if it's a valid MongoDB ObjectId
  const mongoose = require('mongoose');
  return mongoose.Types.ObjectId.isValid(tenantId);
}

module.exports = {
  enforceTenantId,
  sanitizeUpdateData,
  verifyTenantAccess,
  buildTenantQuery,
  buildTenantUpdateQuery,
  buildTenantDeleteQuery,
  isValidTenantId
};
