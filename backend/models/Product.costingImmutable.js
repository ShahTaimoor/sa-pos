/**
 * Product Model - Immutable Costing Enhancement
 * 
 * Costing method is set at first purchase and cannot be changed
 */

// Add to Product schema

const costingSchema = {
  method: {
    type: String,
    enum: ['fifo', 'lifo', 'average', 'standard'],
    default: null, // null = not set yet
    immutable: true // Once set, cannot change
  },
  methodSetAt: {
    type: Date,
    default: null
  },
  methodSetBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  methodSetOnPurchase: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    default: null
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  lockedAt: {
    type: Date,
    default: null
  }
};

// Add to productSchema
productSchema.add({
  costing: costingSchema,
  standardCost: {
    type: Number,
    min: 0,
    default: 0
  }
});

// PRE-SAVE: Validate costing method immutability
productSchema.pre('save', async function(next) {
  // If costing method is being changed
  if (this.isModified('costing.method')) {
    // Get original document
    if (this._id) {
      const original = await this.constructor.findById(this._id).lean();
      
      // If method was already set and locked
      if (original?.costing?.method && original.costing.isLocked) {
        if (original.costing.method !== this.costing.method) {
          return next(new Error(
            'COSTING_METHOD_IMMUTABLE: Costing method cannot be changed after first purchase. ' +
            `Current method: ${original.costing.method}, Attempted: ${this.costing.method}. ` +
            'Costing method is locked at first purchase and cannot be modified.'
          ));
        }
      }
    }
  }
  
  // If setting method for first time, lock it
  if (this.costing?.method && !this.costing.isLocked) {
    this.costing.isLocked = true;
    this.costing.lockedAt = new Date();
    if (!this.costing.methodSetAt) {
      this.costing.methodSetAt = new Date();
    }
  }
  
  next();
});

// PRE-FINDONEANDUPDATE: Block costing method changes
productSchema.pre('findOneAndUpdate', async function(next) {
  const update = this.getUpdate();
  
  if (!update) {
    return next();
  }
  
  // Check if costing method is being updated
  if (update['costing.method'] !== undefined ||
      (update.$set && update.$set['costing.method'] !== undefined)) {
    
    const productId = this.getQuery()._id || this.getQuery().id;
    if (productId) {
      const product = await this.model.findById(productId);
      
      if (product?.costing?.method && product.costing.isLocked) {
        const newMethod = update['costing.method'] || update.$set?.['costing.method'];
        if (newMethod !== product.costing.method) {
          return next(new Error(
            'COSTING_METHOD_IMMUTABLE: Cannot update costing method. ' +
            `Product uses ${product.costing.method} and is locked.`
          ));
        }
      }
    }
  }
  
  next();
});

// METHOD: Set costing method (only allowed before first purchase)
productSchema.methods.setCostingMethod = async function(method, user, purchaseOrderId = null) {
  if (this.costing?.method && this.costing.isLocked) {
    throw new Error(
      `Costing method is already set to ${this.costing.method} and cannot be changed.`
    );
  }
  
  if (!['fifo', 'lifo', 'average', 'standard'].includes(method)) {
    throw new Error(`Invalid costing method: ${method}`);
  }
  
  this.costing = {
    method: method,
    methodSetAt: new Date(),
    methodSetBy: user._id,
    methodSetOnPurchase: purchaseOrderId,
    isLocked: true,
    lockedAt: new Date()
  };
  
  await this.save();
  
  return this;
};

// METHOD: Get costing method (with validation)
productSchema.methods.getCostingMethod = function() {
  return this.costing?.method || null;
};

// METHOD: Check if costing method is locked
productSchema.methods.isCostingMethodLocked = function() {
  return this.costing?.isLocked === true;
};

