const mongoose = require('mongoose');

const cashPaymentSchema = new mongoose.Schema({
  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  // Payment Information
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  voucherCode: {
    type: String,
    required: false,  // Auto-generated in pre-save middleware
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  particular: {
    type: String,
    required: false,
    trim: true,
    maxlength: 500,
    default: 'Cash Payment'
  },
  
  // Reference Information
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sales',
    required: false
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: false
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: false
  },
  
  // Payment Method
  paymentMethod: {
    type: String,
    enum: ['cash', 'check', 'other'],
    default: 'cash'
  },
  expenseAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChartOfAccounts'
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'confirmed'
  },
  
  // Additional Information
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  
  // Audit Fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Generate voucher code before saving
const { generateDateBasedVoucherCode } = require('../utils/voucherCodeGenerator');
cashPaymentSchema.pre('save', async function(next) {
  if (this.isNew && !this.voucherCode) {
    try {
      this.voucherCode = await generateDateBasedVoucherCode({
        prefix: 'CP',
        Model: this.constructor
      });
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Index for better query performance
// Compound indexes for multi-tenant performance
cashPaymentSchema.index({ tenantId: 1, date: -1 });
cashPaymentSchema.index({ tenantId: 1, voucherCode: 1 }, { unique: true, sparse: true });
cashPaymentSchema.index({ tenantId: 1, createdBy: 1, date: -1 });

// Post-save hook to handle accounting entries and supplier balance
cashPaymentSchema.post('save', async function(doc) {
  // Only process new cash payments (not updates)
  if (!doc.isNew) {
    return;
  }

  const logger = require('../utils/logger');

  // 1. Create accounting entries
  try {
    const accountingService = require('../services/accountingService');
    await accountingService.recordCashPayment(doc);
    logger.debug(`Accounting entries created for cash payment: ${doc.voucherCode || doc._id}`);
  } catch (error) {
    // Log error but don't fail the save
    logger.error(`Error creating accounting entries for cash payment ${doc.voucherCode || doc._id}:`, error);
  }

  // 2. Update supplier balance (if supplier provided)
  if (doc.supplier && doc.amount > 0) {
    try {
      const supplierBalanceService = require('../services/supplierBalanceService');
      await supplierBalanceService.recordPayment(doc.supplier, doc.amount, doc.order || null);
      logger.debug(`Supplier balance updated for cash payment: ${doc.voucherCode || doc._id}`);
    } catch (error) {
      // Log error but don't fail the save
      logger.error(`Error updating supplier balance for cash payment ${doc.voucherCode || doc._id}:`, error);
    }
  }
});

module.exports = mongoose.model('CashPayment', cashPaymentSchema);
