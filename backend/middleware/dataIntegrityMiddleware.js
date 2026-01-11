/**
 * Data Integrity Middleware
 * 
 * Enforces non-negotiable production rules at the middleware level
 */

const dataIntegrityService = require('../services/dataIntegrityEnforcementService');
const logger = require('../utils/logger');

/**
 * Block direct product stock edits
 */
const blockDirectProductStockEdit = async (req, res, next) => {
  try {
    // Check if trying to update product with inventory.currentStock
    if (req.body['inventory.currentStock'] !== undefined || 
        req.body.inventory?.currentStock !== undefined) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'DIRECT_STOCK_EDIT_BLOCKED',
          message: 'Cannot directly edit product.inventory.currentStock. Use Inventory model as single source of truth.',
          details: 'Stock must be updated via /api/inventory/update-stock which creates stock movements.'
        }
      });
    }

    next();
  } catch (error) {
    logger.error('Error in blockDirectProductStockEdit middleware:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error' }
    });
  }
};

/**
 * Block manual customer balance edits
 */
const blockManualCustomerBalanceEdit = async (req, res, next) => {
  try {
    // Check if trying to manually edit balance fields
    const balanceFields = ['pendingBalance', 'advanceBalance', 'currentBalance'];
    const hasBalanceFields = balanceFields.some(field => req.body[field] !== undefined);

    if (hasBalanceFields) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'MANUAL_BALANCE_EDIT_BLOCKED',
          message: 'Cannot manually edit customer balances. Balances are ledger-driven only.',
          details: 'Use /api/customer-transactions to create transactions which update balances automatically.'
        }
      });
    }

    next();
  } catch (error) {
    logger.error('Error in blockManualCustomerBalanceEdit middleware:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error' }
    });
  }
};

/**
 * Block manual supplier balance edits
 */
const blockManualSupplierBalanceEdit = async (req, res, next) => {
  try {
    const balanceFields = ['pendingBalance', 'advanceBalance', 'currentBalance'];
    const hasBalanceFields = balanceFields.some(field => req.body[field] !== undefined);

    if (hasBalanceFields) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'MANUAL_BALANCE_EDIT_BLOCKED',
          message: 'Cannot manually edit supplier balances. Balances are ledger-driven only.',
          details: 'Use supplier transaction endpoints to create transactions which update balances automatically.'
        }
      });
    }

    next();
  } catch (error) {
    logger.error('Error in blockManualSupplierBalanceEdit middleware:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error' }
    });
  }
};

/**
 * Validate accounting period is not locked
 */
const validatePeriodNotLocked = async (req, res, next) => {
  try {
    // Get transaction date from request
    const transactionDate = req.body.transactionDate || req.body.date || new Date();
    const date = new Date(transactionDate);

    if (isNaN(date.getTime())) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DATE',
          message: 'Invalid transaction date'
        }
      });
    }

    // Validate period is not locked
    await dataIntegrityService.validatePeriodNotLocked(date, req.method.toLowerCase());

    next();
  } catch (error) {
    if (error.message.includes('PERIOD_LOCKED')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'PERIOD_LOCKED',
          message: error.message
        }
      });
    }

    logger.error('Error in validatePeriodNotLocked middleware:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error' }
    });
  }
};

/**
 * Block destructive actions (delete, edit, backdate)
 */
const blockDestructiveActions = (options = {}) => {
  const {
    allowDelete = false,
    allowEdit = true,
    allowBackdate = false
  } = options;

  return async (req, res, next) => {
    try {
      // Block DELETE requests
      if (req.method === 'DELETE' && !allowDelete) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'DELETE_BLOCKED',
            message: 'Delete operations are blocked. Use soft delete instead.',
            details: 'Set isDeleted=true instead of deleting records to preserve audit trail.'
          }
        });
      }

      // Block backdating
      if (!allowBackdate && req.body.date) {
        const requestDate = new Date(req.body.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        requestDate.setHours(0, 0, 0, 0);

        if (requestDate < today) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'BACKDATE_BLOCKED',
              message: 'Backdating transactions is blocked to prevent historical data mutation.',
              details: 'Contact administrator if backdating is required for corrections.'
            }
          });
        }
      }

      next();
    } catch (error) {
      logger.error('Error in blockDestructiveActions middleware:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  };
};

/**
 * Validate sales order can be edited
 */
const validateSalesOrderEdit = async (req, res, next) => {
  try {
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const salesOrderId = req.params.id;
      if (salesOrderId) {
        await dataIntegrityService.validateSalesOrderEdit(salesOrderId, req.body);
      }
    }

    next();
  } catch (error) {
    if (error.message.includes('SALES_ORDER_LOCKED') || 
        error.message.includes('SALES_ORDER_PARTIALLY_LOCKED')) {
      return res.status(403).json({
        success: false,
        error: {
          code: error.message.includes('LOCKED') ? 'SALES_ORDER_LOCKED' : 'SALES_ORDER_PARTIALLY_LOCKED',
          message: error.message
        }
      });
    }

    logger.error('Error in validateSalesOrderEdit middleware:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error' }
    });
  }
};

module.exports = {
  blockDirectProductStockEdit,
  blockManualCustomerBalanceEdit,
  blockManualSupplierBalanceEdit,
  validatePeriodNotLocked,
  blockDestructiveActions,
  validateSalesOrderEdit
};

