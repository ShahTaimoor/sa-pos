/**
 * Middleware: Block Product Stock Updates
 * 
 * Prevents any attempts to update stock in Product model
 * Enforces Inventory as single source of truth
 */

const logger = require('../utils/logger');

/**
 * Block Product stock updates in request body
 */
function blockProductStockUpdates(req, res, next) {
  const updateData = req.body;
  
  if (!updateData) {
    return next();
  }
  
  // List of forbidden stock fields
  const forbiddenFields = [
    'inventory.currentStock',
    'inventory._cachedStock',
    'inventory.availableStock',
    'inventory._cachedAvailableStock',
    'inventory.reservedStock',
    'inventory._cachedReservedStock'
  ];
  
  // Check top-level fields
  for (const field of forbiddenFields) {
    if (updateData[field] !== undefined) {
      logger.warn(`Blocked Product stock update attempt: ${field}`, {
        userId: req.user?._id,
        productId: req.params.id,
        field
      });
      
      return res.status(403).json({
        error: 'STOCK_UPDATE_BLOCKED',
        code: 'INVENTORY_IS_SINGLE_SOURCE_OF_TRUTH',
        message: `Cannot update ${field} in Product model. Use Inventory model as single source of truth.`,
        field: field,
        solution: 'Use POST /api/inventory/update to update stock'
      });
    }
  }
  
  // Check nested inventory object
  if (updateData.inventory) {
    const stockFields = [
      'currentStock',
      '_cachedStock',
      'availableStock',
      '_cachedAvailableStock',
      'reservedStock',
      '_cachedReservedStock'
    ];
    
    for (const field of stockFields) {
      if (updateData.inventory[field] !== undefined) {
        logger.warn(`Blocked Product stock update attempt: inventory.${field}`, {
          userId: req.user?._id,
          productId: req.params.id,
          field: `inventory.${field}`
        });
        
        return res.status(403).json({
          error: 'STOCK_UPDATE_BLOCKED',
          code: 'INVENTORY_IS_SINGLE_SOURCE_OF_TRUTH',
          message: `Cannot update inventory.${field} in Product model. Use Inventory model.`,
          field: `inventory.${field}`,
          solution: 'Use POST /api/inventory/update to update stock'
        });
      }
    }
  }
  
  // Check $set operations (for update queries)
  if (updateData.$set) {
    for (const field of forbiddenFields) {
      if (updateData.$set[field] !== undefined) {
        logger.warn(`Blocked Product stock update attempt: $set.${field}`, {
          userId: req.user?._id,
          productId: req.params.id,
          field: `$set.${field}`
        });
        
        return res.status(403).json({
          error: 'STOCK_UPDATE_BLOCKED',
          code: 'INVENTORY_IS_SINGLE_SOURCE_OF_TRUTH',
          message: `Cannot update ${field} in Product model. Use Inventory model.`,
          field: field,
          solution: 'Use POST /api/inventory/update to update stock'
        });
      }
    }
  }
  
  // Check $inc operations
  if (updateData.$inc) {
    const incForbiddenFields = [
      'inventory.currentStock',
      'inventory._cachedStock',
      'inventory.availableStock',
      'inventory._cachedAvailableStock'
    ];
    
    for (const field of incForbiddenFields) {
      if (updateData.$inc[field] !== undefined) {
        logger.warn(`Blocked Product stock update attempt: $inc.${field}`, {
          userId: req.user?._id,
          productId: req.params.id,
          field: `$inc.${field}`
        });
        
        return res.status(403).json({
          error: 'STOCK_UPDATE_BLOCKED',
          code: 'INVENTORY_IS_SINGLE_SOURCE_OF_TRUTH',
          message: `Cannot increment ${field} in Product model. Use Inventory model.`,
          field: field,
          solution: 'Use POST /api/inventory/update to update stock'
        });
      }
    }
  }
  
  next();
}

/**
 * Validate Product update doesn't include stock fields
 */
function validateProductUpdate(updateData) {
  const errors = [];
  
  const forbiddenFields = [
    'inventory.currentStock',
    'inventory._cachedStock',
    'inventory.availableStock',
    'inventory._cachedAvailableStock',
    'inventory.reservedStock',
    'inventory._cachedReservedStock'
  ];
  
  // Check top-level
  for (const field of forbiddenFields) {
    if (updateData[field] !== undefined) {
      errors.push({
        field: field,
        message: `Cannot update ${field} in Product model. Use Inventory model.`
      });
    }
  }
  
  // Check nested
  if (updateData.inventory) {
    if (updateData.inventory.currentStock !== undefined ||
        updateData.inventory._cachedStock !== undefined ||
        updateData.inventory.availableStock !== undefined) {
      errors.push({
        field: 'inventory',
        message: 'Cannot update stock fields in Product.inventory. Use Inventory model.'
      });
    }
  }
  
  return errors;
}

module.exports = {
  blockProductStockUpdates,
  validateProductUpdate
};

