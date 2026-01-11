/**
 * Role-Based Permission Matrix Middleware
 * 
 * Defines non-negotiable permission rules for production
 */

const logger = require('../utils/logger');

// Permission matrix: role -> permissions
const PERMISSION_MATRIX = {
  // Admin: Full access
  admin: [
    'all'
  ],

  // Manager: Most operations except destructive actions
  manager: [
    'view_all',
    'create_sales',
    'edit_sales',
    'create_purchases',
    'edit_purchases',
    'view_inventory',
    'adjust_inventory',
    'view_customers',
    'edit_customers',
    'view_financial',
    'generate_reports',
    'close_periods' // Can close but not lock
  ],

  // Accountant: Financial operations
  accountant: [
    'view_all',
    'view_financial',
    'create_accounting_entries',
    'edit_accounting_entries',
    'generate_reports',
    'close_periods',
    'lock_periods',
    'reconcile_balances'
  ],

  // Cashier: Sales operations only
  cashier: [
    'view_products',
    'view_inventory',
    'create_sales',
    'view_customers',
    'process_payments',
    'view_own_sales'
  ],

  // Stock Keeper: Inventory operations
  stock_keeper: [
    'view_products',
    'view_inventory',
    'adjust_inventory',
    'view_purchases',
    'receive_stock'
  ],

  // Read-only: View only
  viewer: [
    'view_all'
  ]
};

// Destructive actions that require special permissions
const DESTRUCTIVE_ACTIONS = [
  'delete',
  'hard_delete',
  'backdate',
  'edit_closed_period',
  'unlock_period',
  'manual_balance_edit',
  'direct_stock_edit'
];

// Blocked actions by role
const BLOCKED_ACTIONS = {
  cashier: ['delete', 'edit_closed_period', 'manual_balance_edit', 'direct_stock_edit'],
  stock_keeper: ['delete', 'edit_closed_period', 'manual_balance_edit', 'create_accounting_entries'],
  viewer: ['create', 'update', 'delete', 'edit']
};

/**
 * Check if user has permission
 * @param {Object} user - User object
 * @param {String} permission - Permission to check
 * @returns {Boolean} Has permission
 */
function hasPermission(user, permission) {
  if (!user || !user.role) {
    return false;
  }

  const role = user.role.toLowerCase();
  const permissions = PERMISSION_MATRIX[role] || [];

  // Admin has all permissions
  if (permissions.includes('all')) {
    return true;
  }

  // Check specific permission
  if (permissions.includes(permission)) {
    return true;
  }

  // Check if action is blocked for this role
  const blocked = BLOCKED_ACTIONS[role] || [];
  if (blocked.includes(permission)) {
    return false;
  }

  return false;
}

/**
 * Check if action is destructive
 * @param {String} action - Action
 * @returns {Boolean} Is destructive
 */
function isDestructiveAction(action) {
  return DESTRUCTIVE_ACTIONS.includes(action);
}

/**
 * Require permission middleware
 * @param {String} permission - Required permission
 * @returns {Function} Middleware
 */
function requirePermission(permission) {
  return (req, res, next) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
      }

      // Check if action is destructive
      if (isDestructiveAction(permission)) {
        // Destructive actions require admin or manager role
        if (user.role !== 'admin' && user.role !== 'manager') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'DESTRUCTIVE_ACTION_BLOCKED',
              message: `Action '${permission}' is destructive and requires admin or manager role.`,
              userRole: user.role
            }
          });
        }
      }

      // Check permission
      if (!hasPermission(user, permission)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'PERMISSION_DENIED',
            message: `Permission '${permission}' required. Your role '${user.role}' does not have this permission.`,
            userRole: user.role,
            requiredPermission: permission
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Error in requirePermission middleware:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  };
}

/**
 * Block destructive actions middleware
 */
function blockDestructiveActions(req, res, next) {
  try {
    const user = req.user;
    const method = req.method;
    const path = req.path;

    // Block DELETE requests for non-admins
    if (method === 'DELETE' && user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'DELETE_BLOCKED',
          message: 'Delete operations are blocked. Use soft delete instead.',
          userRole: user?.role
        }
      });
    }

    // Block backdating
    if (req.body.date || req.body.transactionDate) {
      const requestDate = new Date(req.body.date || req.body.transactionDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      requestDate.setHours(0, 0, 0, 0);

      if (requestDate < today && user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'BACKDATE_BLOCKED',
            message: 'Backdating transactions is blocked. Contact administrator for corrections.',
            userRole: user?.role
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
}

module.exports = {
  hasPermission,
  isDestructiveAction,
  requirePermission,
  blockDestructiveActions,
  PERMISSION_MATRIX,
  DESTRUCTIVE_ACTIONS
};

