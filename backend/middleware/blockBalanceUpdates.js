/**
 * Middleware: Block Balance Updates
 * 
 * Prevents manual balance edits in Customer model
 * Enforces ledger-driven balances
 */

const logger = require('../utils/logger');

/**
 * Block balance updates in request body
 */
function blockBalanceUpdates(req, res, next) {
  const updateData = req.body;
  
  if (!updateData) {
    return next();
  }
  
  // List of forbidden balance fields
  const balanceFields = [
    'pendingBalance',
    'advanceBalance',
    'currentBalance'
  ];
  
  // Check top-level fields
  for (const field of balanceFields) {
    if (updateData[field] !== undefined) {
      logger.warn(`Blocked balance update attempt: ${field}`, {
        userId: req.user?._id,
        customerId: req.params.id,
        field
      });
      
      return res.status(403).json({
        error: 'BALANCE_UPDATE_BLOCKED',
        code: 'BALANCE_IS_LEDGER_DRIVEN',
        message: `Cannot update ${field} in Customer model. Balance is ledger-driven.`,
        field: field,
        solution: 'Use CustomerTransaction creation to update balances. Balance fields are cached only.'
      });
    }
  }
  
  // Check $set operations
  if (updateData.$set) {
    for (const field of balanceFields) {
      if (updateData.$set[field] !== undefined) {
        logger.warn(`Blocked balance update attempt: $set.${field}`, {
          userId: req.user?._id,
          customerId: req.params.id,
          field: `$set.${field}`
        });
        
        return res.status(403).json({
          error: 'BALANCE_UPDATE_BLOCKED',
          code: 'BALANCE_IS_LEDGER_DRIVEN',
          message: `Cannot update ${field} via $set. Balance is ledger-driven.`,
          field: field,
          solution: 'Use CustomerTransaction creation to update balances.'
        });
      }
    }
  }
  
  // Check $inc operations
  if (updateData.$inc) {
    for (const field of balanceFields) {
      if (updateData.$inc[field] !== undefined) {
        logger.warn(`Blocked balance update attempt: $inc.${field}`, {
          userId: req.user?._id,
          customerId: req.params.id,
          field: `$inc.${field}`
        });
        
        return res.status(403).json({
          error: 'BALANCE_UPDATE_BLOCKED',
          code: 'BALANCE_IS_LEDGER_DRIVEN',
          message: `Cannot increment ${field} directly. Balance is ledger-driven.`,
          field: field,
          solution: 'Use CustomerTransaction creation to update balances.'
        });
      }
    }
  }
  
  next();
}

/**
 * Validate customer update doesn't include balance fields
 */
function validateCustomerUpdate(updateData) {
  const errors = [];
  
  const balanceFields = ['pendingBalance', 'advanceBalance', 'currentBalance'];
  
  // Check top-level
  for (const field of balanceFields) {
    if (updateData[field] !== undefined) {
      errors.push({
        field: field,
        message: `Cannot update ${field} directly. Balance is ledger-driven.`
      });
    }
  }
  
  // Check $set
  if (updateData.$set) {
    for (const field of balanceFields) {
      if (updateData.$set[field] !== undefined) {
        errors.push({
          field: `$set.${field}`,
          message: `Cannot update ${field} via $set. Balance is ledger-driven.`
        });
      }
    }
  }
  
  // Check $inc
  if (updateData.$inc) {
    for (const field of balanceFields) {
      if (updateData.$inc[field] !== undefined) {
        errors.push({
          field: `$inc.${field}`,
          message: `Cannot increment ${field} directly. Balance is ledger-driven.`
        });
      }
    }
  }
  
  return errors;
}

module.exports = {
  blockBalanceUpdates,
  validateCustomerUpdate
};

