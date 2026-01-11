/**
 * Sales Order Model - Frozen COGS Enhancement
 * 
 * COGS is frozen at sale time and never changes
 */

// Add to orderItemSchema

const frozenCOGSSchema = {
  unitCost: {
    type: Number,
    required: true,
    min: 0
  },
  totalCost: {
    type: Number,
    required: true,
    min: 0
  },
  costingMethod: {
    type: String,
    enum: ['fifo', 'lifo', 'average', 'standard'],
    required: true
  },
  calculatedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  batches: [{
    batchId: mongoose.Schema.Types.ObjectId,
    quantity: {
      type: Number,
      min: 0
    },
    unitCost: {
      type: Number,
      min: 0
    },
    date: Date
  }],
  averageCostAtSale: {
    type: Number,
    min: 0
  },
  isBackfilled: {
    type: Boolean,
    default: false
  },
  backfilledAt: Date,
  isEstimated: {
    type: Boolean,
    default: false
  }
};

// Add to orderItemSchema
orderItemSchema.add({
  frozenCOGS: frozenCOGSSchema
});

// PRE-SAVE: Ensure frozenCOGS is set
orderItemSchema.pre('save', async function(next) {
  // If this is a new item and frozenCOGS is not set
  if (this.isNew && !this.frozenCOGS) {
    // Try to calculate COGS
    try {
      const immutableCostingService = require('../services/immutableCostingService');
      const saleDate = this.parent().createdAt || new Date();
      
      this.frozenCOGS = await immutableCostingService.calculateAndFreezeCOGS(
        this.product,
        this.quantity,
        saleDate
      );
      
      // Also set unitCost for backward compatibility
      if (!this.unitCost) {
        this.unitCost = this.frozenCOGS.unitCost;
      }
    } catch (error) {
      // If calculation fails, log but don't block save
      // This allows manual entry if needed
      console.warn(`Could not auto-calculate frozen COGS for item: ${error.message}`);
    }
  }
  
  next();
});

// METHOD: Get frozen COGS (read-only)
orderItemSchema.methods.getFrozenCOGS = function() {
  if (!this.frozenCOGS) {
    throw new Error('Frozen COGS not set for this item');
  }
  return this.frozenCOGS;
};

// METHOD: Check if COGS is frozen
orderItemSchema.methods.hasFrozenCOGS = function() {
  return !!this.frozenCOGS;
};

