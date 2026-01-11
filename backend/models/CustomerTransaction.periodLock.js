/**
 * CustomerTransaction Period Lock Integration
 * 
 * Add this to CustomerTransaction model to enforce period locks
 * with admin override support
 */

// Add to CustomerTransaction schema pre-save hook
customerTransactionSchema.pre('save', async function(next) {
  // Skip validation if document is being deleted
  if (this.isDeleted) {
    return next();
  }
  
  // Check if transaction date is being set/modified
  if (this.isNew || this.isModified('transactionDate')) {
    const AccountingPeriod = require('./AccountingPeriod');
    const PeriodOverride = require('./PeriodOverride');
    
    const period = await AccountingPeriod.findOne({
      periodStart: { $lte: this.transactionDate },
      periodEnd: { $gte: this.transactionDate },
      status: { $in: ['closed', 'locked'] }
    });
    
    if (period) {
      // Check for admin override
      const overrideId = this.__periodOverrideId || this.__periodOverride?.overrideId;
      
      if (overrideId) {
        // Validate override
        const override = await PeriodOverride.findById(overrideId)
          .populate('period');
        
        if (!override) {
          return next(new Error('Period override not found'));
        }
        
        // Check if override is valid
        const canUse = override.canBeUsed();
        if (!canUse.canUse) {
          return next(new Error(`Period override is invalid: ${canUse.reason}`));
        }
        
        // Check if override is for correct period
        if (override.period._id.toString() !== period._id.toString()) {
          return next(new Error('Period override is for different period'));
        }
        
        // Mark override as used
        override.usedAt = new Date();
        override.usedBy = this.createdBy || this.__overrideUser;
        override.status = 'used';
        await override.save();
        
        // Log override usage
        this.__periodOverrideLog = {
          periodId: period._id,
          periodName: period.periodName,
          overrideId: override._id,
          overrideReason: override.reason,
          usedAt: new Date()
        };
        
        // Update period override count
        await AccountingPeriod.findByIdAndUpdate(
          period._id,
          {
            $inc: { overrideCount: 1 },
            $set: {
              lastOverrideAt: new Date(),
              lastOverrideBy: this.createdBy || this.__overrideUser
            }
          }
        );
      } else {
        // No override - block transaction
        return next(new Error(
          `PERIOD_LOCKED: Cannot create transaction in ${period.status} period. ` +
          `Period: ${period.periodName} (${period.periodStart.toISOString()} to ${period.periodEnd.toISOString()}). ` +
          `Status: ${period.status}. ` +
          `Transaction date: ${this.transactionDate.toISOString()}. ` +
          `Use admin override if necessary.`
        ));
      }
    }
  }
  
  // Existing validation (aging, etc.)
  // ... existing code ...
  
  next();
});

// Add to CustomerTransaction schema pre-findOneAndUpdate hook
customerTransactionSchema.pre('findOneAndUpdate', async function(next) {
  const update = this.getUpdate();
  
  // Get existing transaction
  const transaction = await this.model.findOne(this.getQuery());
  if (!transaction) {
    return next();
  }
  
  // Check if updating transaction date
  const newDate = update.transactionDate || (update.$set && update.$set.transactionDate);
  if (newDate) {
    const AccountingPeriod = require('./AccountingPeriod');
    const PeriodOverride = require('./PeriodOverride');
    
    const period = await AccountingPeriod.findOne({
      periodStart: { $lte: newDate },
      periodEnd: { $gte: newDate },
      status: { $in: ['closed', 'locked'] }
    });
    
    if (period) {
      const overrideId = update.__periodOverrideId || 
                        (update.$set && update.$set.__periodOverrideId);
      
      if (!overrideId) {
        return next(new Error(
          `PERIOD_LOCKED: Cannot update transaction date to ${period.status} period. ` +
          `Period: ${period.periodName}. Use admin override if necessary.`
        ));
      }
      
      // Validate override (same as pre-save)
      const override = await PeriodOverride.findById(overrideId);
      if (!override || !override.canBeUsed().canUse) {
        return next(new Error('Invalid period override'));
      }
    }
  }
  
  // Check if updating financial fields in closed period
  const period = await AccountingPeriod.findOne({
    periodStart: { $lte: transaction.transactionDate },
    periodEnd: { $gte: transaction.transactionDate },
    status: { $in: ['closed', 'locked'] }
  });
  
  if (period) {
    // Check if updating financial fields
    const financialFields = [
      'netAmount', 'grossAmount', 'discountAmount', 'taxAmount',
      'paidAmount', 'remainingAmount'
    ];
    
    const isUpdatingFinancial = financialFields.some(field => 
      update[field] !== undefined ||
      (update.$set && update.$set[field] !== undefined) ||
      (update.$inc && update.$inc[field] !== undefined)
    );
    
    if (isUpdatingFinancial) {
      const overrideId = update.__periodOverrideId || 
                        (update.$set && update.$set.__periodOverrideId);
      
      if (!overrideId) {
        return next(new Error(
          `PERIOD_LOCKED: Cannot modify transaction in ${period.status} period. ` +
          `Period: ${period.periodName}. Use admin override if necessary.`
        ));
      }
    }
  }
  
  next();
});

