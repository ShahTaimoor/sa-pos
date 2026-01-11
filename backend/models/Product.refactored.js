/**
 * Product Model - Refactored
 * 
 * Inventory is the SINGLE SOURCE OF TRUTH for stock
 * Product NEVER stores mutable stock values
 * Product only has read-only cached/computed values
 */

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  
  // Pricing Structure
  pricing: {
    cost: {
      type: Number,
      required: true,
      min: 0
    },
    retail: {
      type: Number,
      required: true,
      min: 0
    },
    wholesale: {
      type: Number,
      required: true,
      min: 0
    },
    distributor: {
      type: Number,
      min: 0
    }
  },
  
  // INVENTORY - CONFIGURATION ONLY (NOT STOCK VALUES)
  inventory: {
    // REMOVED: currentStock (mutable) - NEVER store stock in Product
    // REMOVED: availableStock (mutable) - NEVER store stock in Product
    
    // KEEP: Configuration fields (not stock values)
    minStock: {
      type: Number,
      default: 0,
      min: 0
    },
    maxStock: {
      type: Number,
      min: 0
    },
    reorderPoint: {
      type: Number,
      default: 0,
      min: 0
    },
    reorderQuantity: {
      type: Number,
      default: 50,
      min: 1
    },
    
    // READ-ONLY: Cached stock value (computed from Inventory, never directly writable)
    // This is populated by service layer when needed for performance
    _cachedStock: {
      type: Number,
      default: 0,
      select: false, // Hidden by default
      // No setter - cannot be set directly
    },
    _cachedStockLastUpdated: {
      type: Date,
      select: false
    },
    _cachedAvailableStock: {
      type: Number,
      default: 0,
      select: false
    },
    _cachedReservedStock: {
      type: Number,
      default: 0,
      select: false
    }
  },
  
  // Reference to Inventory (for population)
  _inventory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inventory',
    select: false // Hidden by default
  },
  
  // Wholesale Settings
  wholesaleSettings: {
    minOrderQuantity: {
      type: Number,
      default: 1,
      min: 1
    },
    bulkDiscounts: [{
      minQuantity: {
        type: Number,
        required: true,
        min: 1
      },
      discountPercent: {
        type: Number,
        required: true,
        min: 0,
        max: 100
      }
    }]
  },
  
  // Product Details
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  },
  brand: {
    type: String,
    trim: true
  },
  
  // Supplier Information
  suppliers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  }],
  primarySupplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  },
  barcode: {
    type: String,
    trim: true,
    maxlength: 50,
    sparse: true
  },
  sku: {
    type: String,
    trim: true,
    maxlength: 50,
    sparse: true
  },
  weight: {
    type: Number,
    min: 0
  },
  dimensions: {
    length: Number,
    width: Number,
    height: Number
  },
  
  // Expiry Date
  expiryDate: {
    type: Date,
    default: null
  },
  
  // Media
  images: [{
    url: String,
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'discontinued'],
    default: 'active'
  },
  
  // Tax Settings
  taxSettings: {
    taxable: {
      type: Boolean,
      default: true
    },
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    }
  },
  
  // Investor Linking
  investors: [{
    investor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Investor',
      required: true
    },
    sharePercentage: {
      type: Number,
      default: 30,
      min: 0,
      max: 100
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  hasInvestors: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Soft Delete Fields
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ============================================================
// VIRTUAL FIELDS - READ-ONLY COMPUTED STOCK VALUES
// ============================================================

/**
 * Virtual: currentStock (read-only, computed from Inventory)
 * This is populated by service layer when needed
 */
productSchema.virtual('inventory.currentStock').get(function() {
  // If Inventory is populated, use it
  if (this._inventory && typeof this._inventory === 'object' && this._inventory.currentStock !== undefined) {
    return this._inventory.currentStock;
  }
  
  // Otherwise, use cached value (populated by service)
  return this.inventory._cachedStock || 0;
});

/**
 * Virtual: availableStock (read-only, computed from Inventory)
 */
productSchema.virtual('inventory.availableStock').get(function() {
  if (this._inventory && typeof this._inventory === 'object' && this._inventory.availableStock !== undefined) {
    return this._inventory.availableStock;
  }
  
  return this.inventory._cachedAvailableStock || 0;
});

/**
 * Virtual: reservedStock (read-only, computed from Inventory)
 */
productSchema.virtual('inventory.reservedStock').get(function() {
  if (this._inventory && typeof this._inventory === 'object' && this._inventory.reservedStock !== undefined) {
    return this._inventory.reservedStock;
  }
  
  return this.inventory._cachedReservedStock || 0;
});

// ============================================================
// PRE-SAVE HOOKS - BLOCK STOCK UPDATES
// ============================================================

/**
 * Pre-save: Block any attempts to update stock fields
 */
productSchema.pre('save', function(next) {
  // Check if trying to modify stock fields
  if (this.isModified('inventory._cachedStock') ||
      this.isModified('inventory._cachedAvailableStock') ||
      this.isModified('inventory._cachedReservedStock')) {
    
    // Allow if this is a service-level cache update (checked via __allowCacheUpdate flag)
    if (!this.__allowCacheUpdate) {
      return next(new Error(
        'INVENTORY_IS_SINGLE_SOURCE_OF_TRUTH: ' +
        'Cannot update stock fields in Product model. ' +
        'Use Inventory model as single source of truth. ' +
        'Stock values are read-only cached values computed from Inventory.'
      ));
    }
  }
  
  next();
});

/**
 * Pre-findOneAndUpdate: Block stock updates via update queries
 */
productSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  
  if (!update) {
    return next();
  }
  
  // Check for stock field updates in $set
  if (update.$set) {
    const stockFields = [
      'inventory.currentStock',
      'inventory._cachedStock',
      'inventory.availableStock',
      'inventory._cachedAvailableStock',
      'inventory.reservedStock',
      'inventory._cachedReservedStock'
    ];
    
    for (const field of stockFields) {
      if (update.$set[field] !== undefined) {
        return next(new Error(
          `INVENTORY_IS_SINGLE_SOURCE_OF_TRUTH: Cannot update ${field} in Product model. Use Inventory model.`
        ));
      }
    }
  }
  
  // Check for stock field updates in $inc
  if (update.$inc) {
    const stockFields = [
      'inventory.currentStock',
      'inventory._cachedStock',
      'inventory.availableStock',
      'inventory._cachedAvailableStock'
    ];
    
    for (const field of stockFields) {
      if (update.$inc[field] !== undefined) {
        return next(new Error(
          `INVENTORY_IS_SINGLE_SOURCE_OF_TRUTH: Cannot update ${field} in Product model. Use Inventory model.`
        ));
      }
    }
  }
  
  // Check nested inventory object
  if (update.inventory && (
    update.inventory.currentStock !== undefined ||
    update.inventory._cachedStock !== undefined ||
    update.inventory.availableStock !== undefined
  )) {
    return next(new Error(
      'INVENTORY_IS_SINGLE_SOURCE_OF_TRUTH: Cannot update inventory stock in Product model. Use Inventory model.'
    ));
  }
  
  next();
});

// ============================================================
// METHODS - STOCK ACCESS (READ-ONLY)
// ============================================================

/**
 * Get stock from Inventory (source of truth)
 * @returns {Promise<Object>} Stock information
 */
productSchema.methods.getStockFromInventory = async function() {
  const Inventory = require('./Inventory');
  const inventory = await Inventory.findOne({ product: this._id });
  
  if (!inventory) {
    return {
      currentStock: 0,
      reservedStock: 0,
      availableStock: 0,
      status: 'out_of_stock'
    };
  }
  
  return {
    currentStock: inventory.currentStock,
    reservedStock: inventory.reservedStock,
    availableStock: inventory.availableStock,
    status: inventory.status
  };
};

/**
 * Populate stock cache from Inventory (read-only)
 * @returns {Promise<Product>} Product with cached stock
 */
productSchema.methods.populateStockCache = async function() {
  const Inventory = require('./Inventory');
  const inventory = await Inventory.findOne({ product: this._id });
  
  if (inventory) {
    // Set cache flag to allow update
    this.__allowCacheUpdate = true;
    
    this.inventory._cachedStock = inventory.currentStock;
    this.inventory._cachedAvailableStock = inventory.availableStock;
    this.inventory._cachedReservedStock = inventory.reservedStock;
    this.inventory._cachedStockLastUpdated = new Date();
    this._inventory = inventory._id;
    
    await this.save();
    
    // Clear flag
    delete this.__allowCacheUpdate;
  }
  
  return this;
};

// ============================================================
// STATIC METHODS
// ============================================================

/**
 * Find product with stock populated from Inventory
 * @param {ObjectId} productId - Product ID
 * @returns {Promise<Product>} Product with stock
 */
productSchema.statics.findByIdWithStock = async function(productId) {
  const Inventory = require('./Inventory');
  
  const product = await this.findById(productId);
  if (!product) {
    return null;
  }
  
  // Populate Inventory
  const inventory = await Inventory.findOne({ product: productId });
  
  if (inventory) {
    // Set virtual values via population
    product._inventory = inventory;
  }
  
  return product;
};

/**
 * Find products with stock populated
 * @param {Object} query - Query
 * @returns {Promise<Array>} Products with stock
 */
productSchema.statics.findWithStock = async function(query = {}) {
  const Inventory = require('./Inventory');
  
  const products = await this.find(query);
  const productIds = products.map(p => p._id);
  
  // Get all inventories
  const inventories = await Inventory.find({
    product: { $in: productIds }
  });
  
  // Create map
  const inventoryMap = new Map(
    inventories.map(inv => [inv.product.toString(), inv])
  );
  
  // Populate stock
  for (const product of products) {
    const inventory = inventoryMap.get(product._id.toString());
    if (inventory) {
      product._inventory = inventory;
    }
  }
  
  return products;
};

// ============================================================
// INDEXES
// ============================================================

productSchema.index({ name: 1 });
productSchema.index({ status: 1 });
productSchema.index({ category: 1 });
productSchema.index({ 'inventory.reorderPoint': 1 }); // For reorder queries
productSchema.index({ hasInvestors: 1 });
productSchema.index({ isDeleted: 1 });

// REMOVED: Indexes on stock fields (they don't exist anymore)
// productSchema.index({ 'inventory.currentStock': 1 }); // ❌ REMOVED

module.exports = mongoose.model('Product', productSchema);

