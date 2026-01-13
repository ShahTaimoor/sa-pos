const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unitCost: {
    type: Number,
    default: 0,
    min: 0
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  discountPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  taxRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 1
  },
  // Calculated fields
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  }
});

const orderSchema = new mongoose.Schema({
  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  // Order Information
  orderNumber: {
    type: String,
    required: false
  },
  orderType: {
    type: String,
    enum: ['retail', 'wholesale', 'return', 'exchange'],
    default: 'retail'
  },
  
  // Customer Information
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  customerInfo: {
    name: String,
    email: String,
    phone: String,
    businessName: String
  },
  
  // Order Items
  items: [orderItemSchema],
  
  // Pricing Summary
  pricing: {
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    isTaxExempt: {
      type: Boolean,
      default: false
    },
    shippingAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    }
  },
  
  // Payment Information
  payment: {
    method: {
      type: String,
      enum: ['cash', 'credit_card', 'debit_card', 'check', 'account', 'split'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'partial', 'refunded'],
      default: 'pending'
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0
    },
    remainingBalance: {
      type: Number,
      default: 0
      // Note: Negative values indicate overpayment (customer advance)
    },
    isPartialPayment: {
      type: Boolean,
      default: false
    },
    isAdvancePayment: {
      type: Boolean,
      default: false
    },
    advanceAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    transactions: [{
      method: String,
      amount: Number,
      reference: String,
      timestamp: {
        type: Date,
        default: Date.now
      }
    }]
  },
  
  // Order Status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
    default: 'pending'
  },
  
  // Shipping Information
  shipping: {
    method: String,
    trackingNumber: String,
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    },
    estimatedDelivery: Date,
    actualDelivery: Date
  },
  
  // Notes
  notes: {
    type: String,
    maxlength: 1000
  },
  internalNotes: {
    type: String,
    maxlength: 1000
  },
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  processedBy: {
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
  }
}, {
  timestamps: true
});

// Compound indexes for multi-tenant performance
orderSchema.index({ tenantId: 1, orderNumber: 1 }, { unique: true, sparse: true });
orderSchema.index({ tenantId: 1, createdAt: -1 }); // Date-based queries with tenant
orderSchema.index({ tenantId: 1, customer: 1, createdAt: -1 });
orderSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
orderSchema.index({ tenantId: 1, 'payment.status': 1, createdAt: -1 });
orderSchema.index({ tenantId: 1, orderType: 1, status: 1, createdAt: -1 });
orderSchema.index({ tenantId: 1, createdBy: 1, createdAt: -1 });

// Pre-save middleware to generate order number using atomic Counter
orderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderNumber) {
    try {
      const Counter = mongoose.model('Counter');
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      
      // Use atomic counter for date-based order numbers
      // Counter key format: orderNumber_YYYYMMDD
      const counterKey = `orderNumber_${year}${month}${day}`;
      
      // Atomically increment counter using findOneAndUpdate
      const counter = await Counter.findOneAndUpdate(
        { _id: counterKey },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      
      this.orderNumber = `SI-${year}${month}${day}-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      console.error('Error generating order number:', err);
      return next(err);
    }
  }
  next();
});

// Method to calculate totals
orderSchema.methods.calculateTotals = function() {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  
  this.items.forEach(item => {
    const itemSubtotal = item.quantity * item.unitPrice;
    const itemDiscount = itemSubtotal * (item.discountPercent / 100);
    const itemTaxable = itemSubtotal - itemDiscount;
    const itemTax = itemTaxable * item.taxRate;
    
    item.subtotal = itemSubtotal;
    item.discountAmount = itemDiscount;
    item.taxAmount = itemTax;
    item.total = itemSubtotal - itemDiscount + itemTax;
    
    subtotal += itemSubtotal;
    totalDiscount += itemDiscount;
    totalTax += itemTax;
  });
  
  this.pricing.subtotal = subtotal;
  this.pricing.discountAmount = totalDiscount;
  this.pricing.taxAmount = totalTax;
  this.pricing.total = subtotal - totalDiscount + totalTax + this.pricing.shippingAmount;
  
  return this.pricing;
};

// Method to check if order can be cancelled
orderSchema.methods.canBeCancelled = function() {
  return ['pending', 'confirmed'].includes(this.status);
};

// Method to check if order can be returned
orderSchema.methods.canBeReturned = function() {
  return ['delivered', 'shipped'].includes(this.status) && 
         this.payment.status === 'paid';
};

// Post-save hook to handle stock updates, accounting entries, and customer balance
orderSchema.post('save', async function(doc) {
  // Only process new sales (not updates)
  if (!doc.isNew) {
    return;
  }

  const logger = require('../utils/logger');

  // 1. Update inventory stock (decrease for sales)
  if (doc.items && doc.items.length > 0) {
    try {
      const inventoryService = require('../services/inventoryService');
      
      for (const item of doc.items) {
        if (item.product && item.quantity > 0) {
          await inventoryService.updateStock({
            productId: item.product,
            type: 'out',
            quantity: item.quantity,
            reason: 'Sales Order',
            reference: doc.orderNumber || 'Sales',
            referenceId: doc._id,
            referenceModel: 'Sales',
            performedBy: doc.createdBy,
            notes: `Stock reduced due to sales order: ${doc.orderNumber || doc._id}`
          });
        }
      }
      logger.debug(`Stock updated for sales order: ${doc.orderNumber || doc._id}`);
    } catch (error) {
      // Log error but don't fail the save
      logger.error(`Error updating stock for sales order ${doc.orderNumber || doc._id}:`, error);
    }
  }

  // 2. Create accounting entries
  try {
    const accountingService = require('../services/accountingService');
    await accountingService.recordSale(doc);
    logger.debug(`Accounting entries created for sales order: ${doc.orderNumber || doc._id}`);
  } catch (error) {
    // Log error but don't fail the save
    logger.error(`Error creating accounting entries for sales order ${doc.orderNumber || doc._id}:`, error);
  }

  // 3. Update customer balance (if credit sale or account payment)
  if (doc.customer && doc.pricing && doc.pricing.total > 0) {
    const isCreditSale = doc.payment && (doc.payment.status === 'credit' || doc.payment.method === 'account');
    
    if (isCreditSale) {
      try {
        const customerBalanceService = require('../services/customerBalanceService');
        await customerBalanceService.recordInvoice(
          doc.customer,
          doc.pricing.total,
          doc._id,
          doc.createdBy,
          { orderNumber: doc.orderNumber, invoiceDate: doc.createdAt }
        );
        logger.debug(`Customer balance updated for sales order: ${doc.orderNumber || doc._id}`);
      } catch (error) {
        // Log error but don't fail the save
        logger.error(`Error updating customer balance for sales order ${doc.orderNumber || doc._id}:`, error);
      }
    }
  }
});

// Export as 'Sales' model but keep collection name as 'orders' for database compatibility
module.exports = mongoose.model('Sales', orderSchema, 'orders');
