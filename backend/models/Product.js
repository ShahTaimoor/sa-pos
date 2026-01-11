const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  // Basic Information
  name: {
    type: String,
    required: true,
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
  
  // Inventory
  inventory: {
    currentStock: {
      type: Number,
      default: 0,
      min: 0
    },
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
    }
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
  // Products can be sourced from multiple suppliers
  suppliers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  }],
  // Primary supplier (optional - for quick reference)
  primarySupplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  },
  barcode: {
    type: String,
    trim: true,
    maxlength: 50,
    sparse: true // Allows multiple null values
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
  deletedAt: {
    type: Date,
    default: null
  },
  
  // Costing Method
  costingMethod: {
    type: String,
    enum: ['fifo', 'lifo', 'average', 'standard'],
    default: 'standard' // Uses pricing.cost directly
  },
  
  // Version for optimistic locking
  version: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  versionKey: '__v', // Enable Mongoose versioning
  optimisticConcurrency: true // Enable optimistic concurrency control
});

// Indexes for better performance
// Compound indexes for multi-tenant performance
productSchema.index({ tenantId: 1, name: 1 }, { unique: true });
productSchema.index({ tenantId: 1, name: 'text', description: 'text' });
productSchema.index({ tenantId: 1, category: 1, status: 1 });
productSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
productSchema.index({ tenantId: 1, 'inventory.currentStock': 1 });
productSchema.index({ tenantId: 1, 'inventory.reorderPoint': 1, 'inventory.currentStock': 1 });
productSchema.index({ tenantId: 1, brand: 1, status: 1 });
productSchema.index({ tenantId: 1, createdAt: -1 });
productSchema.index({ tenantId: 1, hasInvestors: 1, status: 1 });

// Virtual for profit margin
productSchema.virtual('profitMargin').get(function() {
  return ((this.pricing.retail - this.pricing.cost) / this.pricing.retail * 100).toFixed(2);
});

// Method to get price for customer type
productSchema.methods.getPriceForCustomerType = function(customerType, quantity = 1) {
  let basePrice;
  
  switch(customerType) {
    case 'wholesale':
      basePrice = this.pricing.wholesale;
      break;
    case 'distributor':
      basePrice = this.pricing.distributor || this.pricing.wholesale;
      break;
    case 'individual':
    case 'retail':
    default:
      basePrice = this.pricing.retail;
  }
  
  // Apply bulk discounts
  if (this.wholesaleSettings.bulkDiscounts.length > 0) {
    const applicableDiscount = this.wholesaleSettings.bulkDiscounts
      .filter(discount => quantity >= discount.minQuantity)
      .sort((a, b) => b.minQuantity - a.minQuantity)[0];
    
    if (applicableDiscount) {
      basePrice = basePrice * (1 - applicableDiscount.discountPercent / 100);
    }
  }
  
  return Math.round(basePrice * 100) / 100; // Round to 2 decimal places
};

// Method to check if stock is low
productSchema.methods.isLowStock = function() {
  return this.inventory.currentStock <= this.inventory.reorderPoint;
};

module.exports = mongoose.model('Product', productSchema);
