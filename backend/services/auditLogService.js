/**
 * Audit Log Service
 * 
 * Logs deletion and restore actions
 */

const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

class AuditLogService {
  /**
   * Log deletion
   * @param {Object} data - Deletion data
   * @returns {Promise<AuditLog>} Created audit log
   */
  async logDeletion(data) {
    try {
      const {
        entityType,
        entityId,
        entityName,
        deletedBy,
        deletedAt,
        deletionReason,
        metadata = {}
      } = data;
      
      const auditLog = new AuditLog({
        action: 'DELETE',
        entityType,
        entityId,
        entityName,
        performedBy: deletedBy,
        performedAt: deletedAt || new Date(),
        details: {
          reason: deletionReason,
          metadata: metadata
        },
        changes: {
          before: {
            isDeleted: false
          },
          after: {
            isDeleted: true,
            deletedAt: deletedAt || new Date()
          }
        }
      });
      
      await auditLog.save();
      
      logger.info(`Audit log created for deletion: ${entityType} ${entityId}`);
      
      return auditLog;
    } catch (error) {
      logger.error('Error logging deletion:', error);
      // Don't throw - audit logging failure shouldn't break deletion
      return null;
    }
  }

  /**
   * Log restore
   * @param {Object} data - Restore data
   * @returns {Promise<AuditLog>} Created audit log
   */
  async logRestore(data) {
    try {
      const {
        entityType,
        entityId,
        entityName,
        restoredBy,
        restoredAt,
        restoreReason,
        originalDeletion = {}
      } = data;
      
      const auditLog = new AuditLog({
        action: 'RESTORE',
        entityType,
        entityId,
        entityName,
        performedBy: restoredBy,
        performedAt: restoredAt || new Date(),
        details: {
          reason: restoreReason,
          originalDeletion: originalDeletion
        },
        changes: {
          before: {
            isDeleted: true,
            deletedAt: originalDeletion.deletedAt,
            deletedBy: originalDeletion.deletedBy
          },
          after: {
            isDeleted: false,
            restoredAt: restoredAt || new Date()
          }
        }
      });
      
      await auditLog.save();
      
      logger.info(`Audit log created for restore: ${entityType} ${entityId}`);
      
      return auditLog;
    } catch (error) {
      logger.error('Error logging restore:', error);
      // Don't throw - audit logging failure shouldn't break restore
      return null;
    }
  }

  /**
   * Get deletion history for an entity
   * @param {String} entityType - Entity type
   * @param {String} entityId - Entity ID
   * @returns {Promise<Array>} Audit logs
   */
  async getDeletionHistory(entityType, entityId) {
    try {
      return await AuditLog.find({
        entityType,
        entityId,
        action: { $in: ['DELETE', 'RESTORE'] }
      })
        .sort({ performedAt: -1 })
        .populate('performedBy', 'name email')
        .lean();
    } catch (error) {
      logger.error('Error getting deletion history:', error);
      throw error;
    }
  }
}

module.exports = new AuditLogService();
