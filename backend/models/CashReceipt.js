const mongoose = require('mongoose');
const Counter = require('./Counter');

const cashReceiptSchema = new mongoose.Schema({
  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  // Receipt Information
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
    default: 'Cash Receipt'
  },
  
  // Reference Information
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sales',
    required: false
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: false
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: false
  },
  
  // Payment Method
  paymentMethod: {
    type: String,
    enum: ['cash', 'check', 'bank_transfer', 'other'],
    default: 'cash'
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

// Pre-save middleware to generate voucher code
cashReceiptSchema.pre('save', async function(next) {
  // Only generate voucher code for new documents to maintain immutability
  if (this.isNew && !this.voucherCode) {
    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: 'cashReceiptVoucherCode' },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      this.voucherCode = `CR-${String(counter.seq).padStart(6, '0')}`;
    } catch (err) {
      return next(err);
    }
  }
  next();
});

// Index for better query performance
// Compound indexes for multi-tenant performance
cashReceiptSchema.index({ tenantId: 1, date: -1 });
cashReceiptSchema.index({ tenantId: 1, voucherCode: 1 }, { unique: true, sparse: true });
cashReceiptSchema.index({ tenantId: 1, createdBy: 1, date: -1 });

// Post-save hook to handle accounting entries and customer balance
cashReceiptSchema.post('save', async function(doc) {
  // Only process new cash receipts (not updates)
  if (!doc.isNew) {
    return;
  }

  const logger = require('../utils/logger');

  // 1. Create accounting entries
  try {
    const accountingService = require('../services/accountingService');
    await accountingService.recordCashReceipt(doc);
    logger.debug(`Accounting entries created for cash receipt: ${doc.voucherCode || doc._id}`);
  } catch (error) {
    // Log error but don't fail the save
    logger.error(`Error creating accounting entries for cash receipt ${doc.voucherCode || doc._id}:`, error);
  }

  // 2. Update customer balance (if customer provided)
  if (doc.customer && doc.amount > 0) {
    try {
      const customerBalanceService = require('../services/customerBalanceService');
      await customerBalanceService.recordPayment(
        doc.customer,
        doc.amount,
        doc.order || null,
        doc.createdBy,
        { voucherCode: doc.voucherCode, paymentMethod: doc.paymentMethod }
      );
      logger.debug(`Customer balance updated for cash receipt: ${doc.voucherCode || doc._id}`);
    } catch (error) {
      // Log error but don't fail the save
      logger.error(`Error updating customer balance for cash receipt ${doc.voucherCode || doc._id}:`, error);
    }
  }
});

module.exports = mongoose.model('CashReceipt', cashReceiptSchema);
