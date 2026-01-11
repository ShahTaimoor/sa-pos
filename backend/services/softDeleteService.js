/**
 * Soft Delete Service
 * 
 * Handles soft deletion with validation and audit logging
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const referenceChecker = require('./referenceChecker');
const auditLogService = require('./auditLogService');
// Period lock service (optional - handle gracefully if not available)
let periodLockService = null;
try {
  periodLockService = require('./periodLockService');
} catch (error) {
  // Period lock service not available
}

// Model registry (with error handling)
const MODELS = {};
try {
  MODELS.Product = require('../models/Product');
  MODELS.Customer = require('../models/Customer');
  MODELS.Supplier = require('../models/Supplier');
  MODELS.Sales = require('../models/Sales');
  MODELS.PurchaseOrder = require('../models/PurchaseOrder');
  MODELS.PurchaseInvoice = require('../models/PurchaseInvoice');
  MODELS.Return = require('../models/Return');
  MODELS.Inventory = require('../models/Inventory');
} catch (error) {
  logger.warn('Some models not available in softDeleteService:', error.message);
}

class SoftDeleteService {
  /**
   * Validate if deletion is allowed
   * @param {String} modelName - Model name
   * @param {String} id - Document ID
   * @param {Object} options - Options
   * @returns {Promise<Object>} Validation result
   */
  async validateDeletion(modelName, id, options = {}) {
    const { force = false, skipPeriodCheck = false } = options;
    
    try {
      const Model = MODELS[modelName];
      if (!Model) {
        throw new Error(`Model ${modelName} not found`);
      }
      
      const document = await Model.findById(id);
      if (!document) {
        return {
          allowed: false,
          reason: 'DOCUMENT_NOT_FOUND',
          message: 'Document not found'
        };
      }
      
      // Already deleted
      if (document.isDeleted) {
        return {
          allowed: false,
          reason: 'ALREADY_DELETED',
          message: 'Document is already deleted'
        };
      }
      
      // Check references
      const referenceCheck = await referenceChecker.checkReferences(modelName, id);
      
      if (referenceCheck.hasActiveReferences && !force) {
        return {
          allowed: false,
          reason: 'HAS_ACTIVE_REFERENCES',
          message: 'Cannot delete document with active references',
          references: referenceCheck.references
        };
      }
      
      // Check period locks (if service available)
      if (!skipPeriodCheck && document.createdAt && periodLockService) {
        try {
          const periodCheck = await periodLockService.checkPeriodLock(document.createdAt);
          if (periodCheck && periodCheck.isLocked && !periodCheck.canOverride) {
            return {
              allowed: false,
              reason: 'PERIOD_LOCKED',
              message: 'Cannot delete document in locked period',
              period: periodCheck.period
            };
          }
        } catch (error) {
          // Period check failed, continue without it
          logger.warn('Period lock check failed:', error);
        }
      }
      
      return {
        allowed: true,
        document,
        references: referenceCheck.references
      };
    } catch (error) {
      logger.error('Error validating deletion:', error);
      throw error;
    }
  }

  /**
   * Soft delete a document
   * @param {String} modelName - Model name
   * @param {String} id - Document ID
   * @param {Object} options - Options
   * @returns {Promise<Object>} Deletion result
   */
  async softDelete(modelName, id, options = {}) {
    const {
      userId = null,
      reason = null,
      metadata = {},
      force = false,
      skipValidation = false
    } = options;
    
    try {
      // Validate deletion
      if (!skipValidation) {
        const validation = await this.validateDeletion(modelName, id, { force });
        
        if (!validation.allowed) {
          throw new Error(validation.message || validation.reason);
        }
      }
      
      const Model = MODELS[modelName];
      const document = await Model.findById(id);
      
      if (!document) {
        throw new Error('Document not found');
      }
      
      // Soft delete
      await document.softDelete({
        userId,
        reason,
        metadata
      });
      
      // Get entity name for audit
      const entityName = this.getEntityName(document, modelName);
      
      // Log audit
      await auditLogService.logDeletion({
        entityType: modelName,
        entityId: id,
        entityName: entityName,
        deletedBy: userId,
        deletedAt: new Date(),
        deletionReason: reason,
        metadata: metadata
      });
      
      logger.info(`Soft deleted ${modelName} ${id}`, {
        modelName,
        id,
        userId,
        reason
      });
      
      return {
        success: true,
        id,
        modelName,
        deletedAt: document.deletedAt
      };
    } catch (error) {
      logger.error('Error soft deleting:', error);
      throw error;
    }
  }

  /**
   * Restore a soft-deleted document
   * @param {String} modelName - Model name
   * @param {String} id - Document ID
   * @param {Object} options - Options
   * @returns {Promise<Object>} Restore result
   */
  async restore(modelName, id, options = {}) {
    const {
      userId = null,
      reason = null
    } = options;
    
    try {
      const Model = MODELS[modelName];
      const document = await Model.findById(id);
      
      if (!document) {
        throw new Error('Document not found');
      }
      
      if (!document.isDeleted) {
        throw new Error('Document is not deleted');
      }
      
      // Store original deletion info
      const originalDeletion = {
        deletedBy: document.deletedBy,
        deletedAt: document.deletedAt,
        deletionReason: document.deletionReason
      };
      
      // Restore
      await document.restore({
        userId,
        reason
      });
      
      // Get entity name for audit
      const entityName = this.getEntityName(document, modelName);
      
      // Log audit
      await auditLogService.logRestore({
        entityType: modelName,
        entityId: id,
        entityName: entityName,
        restoredBy: userId,
        restoredAt: new Date(),
        restoreReason: reason,
        originalDeletion: originalDeletion
      });
      
      logger.info(`Restored ${modelName} ${id}`, {
        modelName,
        id,
        userId,
        reason
      });
      
      return {
        success: true,
        id,
        modelName,
        restoredAt: document.restoredAt
      };
    } catch (error) {
      logger.error('Error restoring:', error);
      throw error;
    }
  }

  /**
   * Get entity name for audit logging
   * @param {Object} document - Document
   * @param {String} modelName - Model name
   * @returns {String} Entity name
   */
  getEntityName(document, modelName) {
    switch (modelName) {
      case 'Product':
        return document.name || document._id.toString();
      case 'Customer':
        return document.name || document.businessName || document._id.toString();
      case 'Supplier':
        return document.name || document.businessName || document._id.toString();
      case 'Sales':
        return document.orderNumber || document._id.toString();
      case 'PurchaseOrder':
        return document.orderNumber || document._id.toString();
      default:
        return document._id.toString();
    }
  }

  /**
   * Batch soft delete
   * @param {String} modelName - Model name
   * @param {Array<String>} ids - Document IDs
   * @param {Object} options - Options
   * @returns {Promise<Object>} Batch deletion result
   */
  async batchSoftDelete(modelName, ids, options = {}) {
    const results = {
      total: ids.length,
      succeeded: 0,
      failed: 0,
      errors: []
    };
    
    for (const id of ids) {
      try {
        await this.softDelete(modelName, id, options);
        results.succeeded++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          id,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Batch restore
   * @param {String} modelName - Model name
   * @param {Array<String>} ids - Document IDs
   * @param {Object} options - Options
   * @returns {Promise<Object>} Batch restore result
   */
  async batchRestore(modelName, ids, options = {}) {
    const results = {
      total: ids.length,
      succeeded: 0,
      failed: 0,
      errors: []
    };
    
    for (const id of ids) {
      try {
        await this.restore(modelName, id, options);
        results.succeeded++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          id,
          error: error.message
        });
      }
    }
    
    return results;
  }
}

module.exports = new SoftDeleteService();

