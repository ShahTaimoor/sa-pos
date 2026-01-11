/**
 * Enhanced Audit Logging Service
 * 
 * Adds comprehensive audit logging with:
 * - Before/after balances
 * - Triggering document ID
 * - User role & timestamp
 * - Field-level changes
 */

const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

class AuditLogEnhancementService {
  /**
   * Log operation with enhanced details
   * @param {Object} options - Log options
   * @returns {Promise<AuditLog>}
   */
  async logOperation(options) {
    const {
      entityType, // 'customer', 'product', 'sales', etc.
      entityId,
      action, // 'create', 'update', 'delete', 'payment', etc.
      user,
      req, // Request object for IP, user agent
      before = {},
      after = {},
      changes = {},
      triggeringDocument = null, // Document that triggered this change
      balanceBefore = null,
      balanceAfter = null,
      metadata = {}
    } = options;

    try {
      const auditLog = new AuditLog({
        entityType,
        entityId,
        action,
        performedBy: user?._id || user,
        userRole: user?.role || metadata.userRole,
        ipAddress: req?.ip || req?.connection?.remoteAddress || metadata.ipAddress,
        userAgent: req?.headers?.['user-agent'] || metadata.userAgent,
        before: before,
        after: after,
        changes: changes,
        triggeringDocument: {
          type: triggeringDocument?.type || metadata.triggeringDocumentType,
          id: triggeringDocument?.id || metadata.triggeringDocumentId,
          number: triggeringDocument?.number || metadata.triggeringDocumentNumber
        },
        balanceBefore: balanceBefore,
        balanceAfter: balanceAfter,
        metadata: {
          ...metadata,
          timestamp: new Date(),
          sessionId: req?.id || metadata.sessionId
        }
      });

      await auditLog.save();
      return auditLog;
    } catch (error) {
      logger.error('Error creating audit log:', error);
      // Don't throw - audit logging failure shouldn't break operations
      return null;
    }
  }

  /**
   * Log customer balance change with before/after
   * @param {String} customerId - Customer ID
   * @param {Object} balanceBefore - Balance before
   * @param {Object} balanceAfter - Balance after
   * @param {Object} user - User
   * @param {Object} req - Request object
   * @param {Object} triggeringDocument - Triggering document
   * @returns {Promise<AuditLog>}
   */
  async logCustomerBalanceChange(customerId, balanceBefore, balanceAfter, user, req, triggeringDocument = null) {
    const changes = {};
    
    if (balanceBefore.pendingBalance !== balanceAfter.pendingBalance) {
      changes.pendingBalance = {
        before: balanceBefore.pendingBalance,
        after: balanceAfter.pendingBalance,
        difference: balanceAfter.pendingBalance - balanceBefore.pendingBalance
      };
    }
    
    if (balanceBefore.advanceBalance !== balanceAfter.advanceBalance) {
      changes.advanceBalance = {
        before: balanceBefore.advanceBalance,
        after: balanceAfter.advanceBalance,
        difference: balanceAfter.advanceBalance - balanceBefore.advanceBalance
      };
    }
    
    if (balanceBefore.currentBalance !== balanceAfter.currentBalance) {
      changes.currentBalance = {
        before: balanceBefore.currentBalance,
        after: balanceAfter.currentBalance,
        difference: balanceAfter.currentBalance - balanceBefore.currentBalance
      };
    }

    return this.logOperation({
      entityType: 'customer',
      entityId: customerId,
      action: 'balance_change',
      user,
      req,
      before: balanceBefore,
      after: balanceAfter,
      changes,
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter,
      triggeringDocument,
      metadata: {
        userRole: user?.role,
        actionType: 'balance_update'
      }
    });
  }

  /**
   * Log inventory stock change
   * @param {String} productId - Product ID
   * @param {Number} stockBefore - Stock before
   * @param {Number} stockAfter - Stock after
   * @param {Object} user - User
   * @param {Object} req - Request object
   * @param {Object} triggeringDocument - Triggering document
   * @returns {Promise<AuditLog>}
   */
  async logInventoryStockChange(productId, stockBefore, stockAfter, user, req, triggeringDocument = null) {
    return this.logOperation({
      entityType: 'inventory',
      entityId: productId,
      action: 'stock_change',
      user,
      req,
      before: { currentStock: stockBefore },
      after: { currentStock: stockAfter },
      changes: {
        currentStock: {
          before: stockBefore,
          after: stockAfter,
          difference: stockAfter - stockBefore
        }
      },
      triggeringDocument,
      metadata: {
        userRole: user?.role,
        actionType: 'stock_update'
      }
    });
  }

  /**
   * Log sales order creation with COGS
   * @param {String} orderId - Order ID
   * @param {Object} orderData - Order data
   * @param {Object} frozenCOGS - Frozen COGS data
   * @param {Object} user - User
   * @param {Object} req - Request object
   * @returns {Promise<AuditLog>}
   */
  async logSalesOrderCreation(orderId, orderData, frozenCOGS, user, req) {
    return this.logOperation({
      entityType: 'sales',
      entityId: orderId,
      action: 'create',
      user,
      req,
      after: {
        orderNumber: orderData.orderNumber,
        total: orderData.pricing?.total,
        status: orderData.status
      },
      metadata: {
        userRole: user?.role,
        actionType: 'order_creation',
        frozenCOGS: frozenCOGS,
        cogsFrozen: true
      }
    });
  }

  /**
   * Log accounting entry creation
   * @param {String} entryId - Entry ID
   * @param {Object} entryData - Entry data
   * @param {Object} user - User
   * @param {Object} req - Request object
   * @returns {Promise<AuditLog>}
   */
  async logAccountingEntry(entryId, entryData, user, req) {
    return this.logOperation({
      entityType: 'accounting',
      entityId: entryId,
      action: 'create_entry',
      user,
      req,
      after: {
        accountCode: entryData.accountCode,
        debitAmount: entryData.debitAmount,
        creditAmount: entryData.creditAmount
      },
      metadata: {
        userRole: user?.role,
        actionType: 'accounting_entry',
        doubleEntryValidated: true
      }
    });
  }
}

module.exports = new AuditLogEnhancementService();

