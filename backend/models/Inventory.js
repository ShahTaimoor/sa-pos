const mongoose = require('mongoose');

const InventorySchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'productModel',
    required: true,
  },
  productModel: {
    type: String,
    required: true,
    enum: ['Product', 'ProductVariant'],
    default: 'Product'
  },
  currentStock: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  reservedStock: {
    type: Number,
    default: 0,
    min: 0,
  },
  availableStock: {
    type: Number,
    default: 0,
    min: 0,
  },
  reorderPoint: {
    type: Number,
    required: true,
    min: 0,
    default: 10,
  },
  reorderQuantity: {
    type: Number,
    required: true,
    min: 1,
    default: 50,
  },
  maxStock: {
    type: Number,
    min: 0,
  },
  location: {
    warehouse: {
      type: String,
      trim: true,
      default: 'Main Warehouse',
    },
    aisle: {
      type: String,
      trim: true,
    },
    shelf: {
      type: String,
      trim: true,
    },
    bin: {
      type: String,
      trim: true,
    },
  },
  cost: {
    average: {
      type: Number,
      min: 0,
      default: 0,
    },
    lastPurchase: {
      type: Number,
      min: 0,
      default: 0,
    },
    fifo: [{
      quantity: Number,
      cost: Number,
      date: Date,
      purchaseOrder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PurchaseOrder',
      },
    }],
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'discontinued', 'out_of_stock'],
    default: 'active',
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  lastCount: {
    date: Date,
    count: Number,
    variance: Number,
    countedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  movements: [{
    type: {
      type: String,
      enum: ['in', 'out', 'adjustment', 'transfer', 'return', 'damage', 'theft'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    reference: {
      type: String,
      trim: true, // Order number, adjustment ID, etc.
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'movements.referenceModel',
    },
    referenceModel: {
      type: String,
      enum: ['SalesOrder', 'PurchaseOrder', 'PurchaseInvoice', 'StockAdjustment', 'Transfer'],
    },
    cost: {
      type: Number,
      min: 0,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
      trim: true,
    },
  }],
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
// Unique constraint on product field ensures one inventory record per product ID
// Since MongoDB ObjectIds are globally unique across collections, a unique index
// on 'product' alone is sufficient even with polymorphic references (refPath).
// This prevents duplicate inventory tracking regardless of productModel value.
// Note: If separate inventory tracking is needed for Product vs ProductVariant
// of the same underlying product, use compound unique index: { product: 1, productModel: 1 }
InventorySchema.index({ product: 1 }, { unique: true });
InventorySchema.index({ currentStock: 1 });
InventorySchema.index({ status: 1 });
InventorySchema.index({ 'location.warehouse': 1 });
InventorySchema.index({ 'movements.date': -1 });
InventorySchema.index({ status: 1, currentStock: 1 }); // For low stock queries
InventorySchema.index({ reorderPoint: 1, currentStock: 1 }); // For reorder point queries
InventorySchema.index({ lastUpdated: -1 }); // For recently updated inventory
InventorySchema.index({ 'location.warehouse': 1, status: 1 }); // For warehouse-specific queries

// Virtual for available stock calculation
InventorySchema.virtual('calculatedAvailableStock').get(function() {
  return Math.max(0, this.currentStock - this.reservedStock);
});

// Pre-save middleware to update available stock
InventorySchema.pre('save', function(next) {
  this.availableStock = this.calculatedAvailableStock;
  
  // Update status based on stock levels
  if (this.currentStock === 0) {
    this.status = 'out_of_stock';
  } else if (this.currentStock <= this.reorderPoint && this.status !== 'inactive') {
    this.status = 'active'; // Keep as active but low stock
  }
  
  this.lastUpdated = new Date();
  next();
});

// Static method to update stock
InventorySchema.statics.updateStock = async function(productId, movement) {
  let inventory = await this.findOne({ product: productId });
  
  if (!inventory) {
    // Create inventory record if it doesn't exist
    console.log('Creating inventory record for product:', productId);
    inventory = new this({
      product: productId,
      currentStock: 0,
      reorderPoint: 10,
      reorderQuantity: 50,
      status: 'active'
    });
    await inventory.save();
  }
  
  // Calculate new stock level
  let newStock = inventory.currentStock;
  console.log('Current stock:', newStock, 'Movement type:', movement.type, 'Quantity:', movement.quantity);
  
  switch (movement.type) {
    case 'in':
    case 'return':
      newStock += movement.quantity;
      break;
    case 'out':
    case 'damage':
    case 'theft':
      newStock -= movement.quantity;
      break;
    case 'adjustment':
      newStock = movement.quantity; // Set to exact amount
      break;
    default:
      break;
  }
  
  console.log('New stock calculated:', newStock);
  
  // Ensure stock doesn't go below 0 (unless it's an adjustment)
  if (movement.type !== 'adjustment' && newStock < 0) {
    throw new Error('Insufficient stock for this operation');
  }
  
  // Update inventory
  inventory.currentStock = newStock;
  inventory.movements.push(movement);
  
  console.log('Saving inventory with new stock:', newStock);
  const savedInventory = await inventory.save();
  console.log('Inventory saved successfully, final stock:', savedInventory.currentStock);
  
  return savedInventory;
};

// Static method to reserve stock
InventorySchema.statics.reserveStock = async function(productId, quantity) {
  const inventory = await this.findOne({ product: productId });
  
  if (!inventory) {
    throw new Error('Inventory record not found for product');
  }
  
  if (inventory.availableStock < quantity) {
    throw new Error('Insufficient available stock');
  }
  
  inventory.reservedStock += quantity;
  return await inventory.save();
};

// Static method to release reserved stock
InventorySchema.statics.releaseStock = async function(productId, quantity) {
  const inventory = await this.findOne({ product: productId });
  
  if (!inventory) {
    throw new Error('Inventory record not found for product');
  }
  
  inventory.reservedStock = Math.max(0, inventory.reservedStock - quantity);
  return await inventory.save();
};

// Static method to get low stock items
InventorySchema.statics.getLowStockItems = async function() {
  // Use aggregation pipeline for field comparison
  // Handle polymorphic references: product can reference either 'products' or 'productvariants' collections
  return await this.aggregate([
    {
      $match: {
        status: 'active'
      }
    },
    {
      $addFields: {
        isLowStock: {
          $lte: ['$currentStock', '$reorderPoint']
        }
      }
    },
    {
      $match: {
        isLowStock: true
      }
    },
    // Lookup from products collection
    {
      $lookup: {
        from: 'products',
        localField: 'product',
        foreignField: '_id',
        as: 'productDataFromProducts'
      }
    },
    // Lookup from productvariants collection
    {
      $lookup: {
        from: 'productvariants',
        localField: 'product',
        foreignField: '_id',
        as: 'productDataFromVariants'
      }
    },
    // Combine both lookups - one will be empty, the other will have data
    {
      $addFields: {
        productData: {
          $cond: {
            if: { $gt: [{ $size: '$productDataFromProducts' }, 0] },
            then: { $arrayElemAt: ['$productDataFromProducts', 0] },
            else: { $arrayElemAt: ['$productDataFromVariants', 0] }
          }
        }
      }
    },
    {
      $project: {
        _id: 1,
        product: 1,
        productModel: 1,
        currentStock: 1,
        reorderPoint: 1,
        status: 1,
        'productData.name': 1,
        'productData.description': 1,
        'productData.pricing': 1
      }
    }
  ]);
};

module.exports = mongoose.model('Inventory', InventorySchema);
