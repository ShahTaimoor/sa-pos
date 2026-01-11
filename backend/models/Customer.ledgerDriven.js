/**
 * Customer Model - Ledger-Driven Balance
 * 
 * Balance fields are CACHED ONLY
 * Ledger (CustomerTransaction) is SINGLE SOURCE OF TRUTH
 * No manual balance edits allowed
 */

// Add to Customer schema

// PRE-SAVE: Block direct balance updates
customerSchema.pre('save', function(next) {
  // Block direct balance updates
  if (this.isModified('pendingBalance') || 
      this.isModified('advanceBalance') || 
      this.isModified('currentBalance')) {
    
    // Allow if this is a cache update (flagged)
    if (!this.__allowBalanceCacheUpdate) {
      return next(new Error(
        'BALANCE_IS_LEDGER_DRIVEN: Cannot directly update balance fields. ' +
        'Balances are calculated from CustomerTransaction ledger (single source of truth). ' +
        'Balance fields are cached only. ' +
        'Use transaction creation to update balances. ' +
        'Use ledgerBalanceService.updateBalanceCacheIncremental() to update cache.'
      ));
    }
  }
  
  next();
});

// PRE-FINDONEANDUPDATE: Block balance updates via update queries
customerSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  
  if (!update) {
    return next();
  }
  
  // Check for balance field updates
  const balanceFields = ['pendingBalance', 'advanceBalance', 'currentBalance'];
  
  // Check top-level
  for (const field of balanceFields) {
    if (update[field] !== undefined) {
      if (!update.__allowBalanceCacheUpdate) {
        return next(new Error(
          `BALANCE_IS_LEDGER_DRIVEN: Cannot update ${field} directly. ` +
          `Balance is ledger-driven. Use transaction creation.`
        ));
      }
    }
  }
  
  // Check $set
  if (update.$set) {
    for (const field of balanceFields) {
      if (update.$set[field] !== undefined) {
        if (!update.__allowBalanceCacheUpdate) {
          return next(new Error(
            `BALANCE_IS_LEDGER_DRIVEN: Cannot update ${field} via $set. ` +
            `Balance is ledger-driven. Use transaction creation.`
          ));
        }
      }
    }
  }
  
  // Check $inc
  if (update.$inc) {
    for (const field of balanceFields) {
      if (update.$inc[field] !== undefined) {
        if (!update.__allowBalanceCacheUpdate) {
          return next(new Error(
            `BALANCE_IS_LEDGER_DRIVEN: Cannot increment ${field} directly. ` +
            `Balance is ledger-driven. Use transaction creation.`
          ));
        }
      }
    }
  }
  
  next();
});

// VIRTUAL: Get balance from ledger (read-only)
customerSchema.virtual('ledgerBalance').get(async function() {
  const ledgerBalanceService = require('../services/ledgerBalanceService');
  return await ledgerBalanceService.calculateBalanceFromLedger(this._id);
});

// METHOD: Rebuild balance cache from ledger
customerSchema.methods.rebuildBalanceCache = async function() {
  const ledgerBalanceService = require('../services/ledgerBalanceService');
  return await ledgerBalanceService.rebuildBalanceCache(this._id);
};

// METHOD: Reconcile balance
customerSchema.methods.reconcileBalance = async function(options = {}) {
  const ledgerBalanceService = require('../services/ledgerBalanceService');
  return await ledgerBalanceService.reconcileCustomerBalance(this._id, options);
};

// METHOD: Validate balance cache
customerSchema.methods.validateBalanceCache = async function() {
  const ledgerBalanceService = require('../services/ledgerBalanceService');
  return await ledgerBalanceService.validateBalanceCache(this._id);
};

