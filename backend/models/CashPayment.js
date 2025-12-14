const mongoose = require('mongoose');

const cashPaymentSchema = new mongoose.Schema({
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
cashPaymentSchema.pre('save', async function(next) {
  if (this.isNew && !this.voucherCode) {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Find the last payment for today
    const lastPayment = await this.constructor.findOne({
      voucherCode: new RegExp(`^CP-${dateStr}`)
    }).sort({ voucherCode: -1 });
    
    let sequence = 1;
    if (lastPayment) {
      // Extract sequence number from voucher code (format: CP-YYYYMMDDXXX)
      // Split by '-' to get ["CP", "YYYYMMDDXXX"], then extract sequence after 8-char date
      const parts = lastPayment.voucherCode.split('-');
      if (parts.length >= 2) {
        const dateAndSequence = parts[1]; // "YYYYMMDDXXX"
        if (dateAndSequence.length > 8) {
          // Extract all digits after the 8-character date (YYYYMMDD)
          const lastSequenceStr = dateAndSequence.substring(8);
          const lastSequence = parseInt(lastSequenceStr, 10);
          // Validate that sequence is a valid positive number
          // This prevents issues if somehow 0 or negative values are extracted
          if (!isNaN(lastSequence) && lastSequence > 0) {
            sequence = lastSequence + 1;
          }
        }
      }
    }
    
    // Format sequence with minimum 3 digits, but allow more if needed
    const sequenceStr = sequence.toString().padStart(3, '0');
    this.voucherCode = `CP-${dateStr}${sequenceStr}`;
  }
  next();
});

// Index for better query performance
cashPaymentSchema.index({ date: -1 });
cashPaymentSchema.index({ voucherCode: 1 }, { unique: true, sparse: true }); // Sparse allows multiple null values
cashPaymentSchema.index({ createdBy: 1 });

module.exports = mongoose.model('CashPayment', cashPaymentSchema);
