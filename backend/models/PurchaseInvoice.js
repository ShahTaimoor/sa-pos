const mongoose = require('mongoose');

const purchaseInvoiceItemSchema = new mongoose.Schema({
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
    required: true,
    min: 0
  },
  totalCost: {
    type: Number,
    required: true,
    min: 0
  }
});

const purchaseInvoiceSchema = new mongoose.Schema({
  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  // Invoice Information
  invoiceNumber: {
    type: String,
    required: true
  },
  invoiceType: {
    type: String,
    enum: ['purchase', 'return', 'adjustment'],
    default: 'purchase'
  },
  
  // Supplier Information
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  },
  supplierInfo: {
    name: String,
    email: String,
    phone: String,
    companyName: String,
    address: String
  },
  
  // Invoice Items
  items: [purchaseInvoiceItemSchema],
  
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
    total: {
      type: Number,
      required: true,
      min: 0
    }
  },
  
  // Payment Information
  payment: {
    status: {
      type: String,
      enum: ['pending', 'paid', 'partial', 'overdue'],
      default: 'pending'
    },
    method: {
      type: String,
      enum: ['cash', 'bank_transfer', 'check', 'credit', 'other'],
      default: 'cash'
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    dueDate: Date,
    paidDate: Date,
    isPartialPayment: {
      type: Boolean,
      default: false
    }
  },
  
  // Additional Information
  expectedDelivery: Date,
  actualDelivery: Date,
  notes: String,
  terms: String,
  
  // Status and Tracking
  status: {
    type: String,
    enum: ['draft', 'confirmed', 'received', 'paid', 'cancelled', 'closed'],
    default: 'draft'
  },
  confirmedDate: Date,
  receivedDate: Date,
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
purchaseInvoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
purchaseInvoiceSchema.index({ tenantId: 1, createdAt: -1 });
purchaseInvoiceSchema.index({ tenantId: 1, supplier: 1, createdAt: -1 });
purchaseInvoiceSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

// Pre-save middleware to generate invoice number
purchaseInvoiceSchema.pre('save', async function(next) {
  if (this.isNew && !this.invoiceNumber) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    // Get count of invoices today
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    
    const count = await this.constructor.countDocuments({
      createdAt: { $gte: startOfDay, $lt: endOfDay }
    });
    
    this.invoiceNumber = `PI-${year}${month}${day}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Static method to generate invoice number
purchaseInvoiceSchema.statics.generateInvoiceNumber = function() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const time = String(now.getTime()).slice(-4);
  
  return `PI-${year}${month}${day}-${time}`;
};

// Method to calculate totals
purchaseInvoiceSchema.methods.calculateTotals = function() {
  let subtotal = 0;
  
  this.items.forEach(item => {
    item.totalCost = item.quantity * item.unitCost;
    subtotal += item.totalCost;
  });
  
  this.pricing.subtotal = subtotal;
  this.pricing.total = subtotal - (this.pricing.discountAmount || 0) + (this.pricing.taxAmount || 0);
  
  return this.pricing;
};

module.exports = mongoose.model('PurchaseInvoice', purchaseInvoiceSchema);
