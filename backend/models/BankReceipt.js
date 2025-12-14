const mongoose = require('mongoose');

const bankReceiptSchema = new mongoose.Schema({
  // Receipt Information
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  voucherCode: {
    type: String,
    required: false,  // Auto-generated in pre-save middleware
    trim: true,
    // Internal sequential voucher number for accounting records (e.g., BR-20251101001)
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
    default: 'Bank Receipt'
  },
  
  // Bank Information
  bank: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bank',
    required: true
  },
  // Legacy fields (for backward compatibility - will be populated from bank reference)
  bankAccount: {
    type: String,
    required: false,  // Deprecated - use bank reference
    trim: true
  },
  bankName: {
    type: String,
    required: false,  // Deprecated - use bank reference
    trim: true
  },
  transactionReference: {
    type: String,
    trim: true,
    // Bank's transaction reference number from statement (e.g., bank confirmation/check number)
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

// Generate voucher code and transaction reference before saving
bankReceiptSchema.pre('save', async function(next) {
  if (this.isNew && !this.voucherCode) {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Find the last bank receipt for today
    const lastReceipt = await this.constructor.findOne({
      voucherCode: new RegExp(`^BR-${dateStr}`)
    }).sort({ voucherCode: -1 });
    
    let sequence = 1;
    if (lastReceipt) {
      // Extract sequence number from voucher code (format: BR-YYYYMMDDXXX...)
      // Split by '-' to get ["BR", "YYYYMMDDXXX..."], then extract sequence after 8-char date
      const parts = lastReceipt.voucherCode.split('-');
      if (parts.length >= 2) {
        const dateAndSequence = parts[1]; // "YYYYMMDDXXX..." (sequence can be 3+ digits)
        if (dateAndSequence.length > 8) {
          // Extract all digits after the 8-character date (YYYYMMDD)
          const lastSequenceStr = dateAndSequence.substring(8);
          const lastSequence = parseInt(lastSequenceStr, 10);
          if (!isNaN(lastSequence) && lastSequence > 0) {
            sequence = lastSequence + 1;
          }
        }
      }
    }
    
    // Format sequence with minimum 3 digits (padStart only adds padding if needed)
    // Sequences > 999 will naturally be 4+ digits without padding
    const sequenceStr = sequence.toString().padStart(3, '0');
    this.voucherCode = `BR-${dateStr}${sequenceStr}`;
  }
  
  // Auto-generate transaction reference if not provided
  if (this.isNew && !this.transactionReference) {
    this.transactionReference = `${this.voucherCode || 'BR'}-${Date.now().toString().slice(-6)}`;
  }
  
  // Populate legacy fields from bank reference for backward compatibility
  if (this.bank) {
    // Check if bank is populated (has accountNumber property)
    // When populated, this.bank will be an object with accountNumber/bankName
    // When not populated, this.bank will be an ObjectId, and accessing .accountNumber returns undefined
    const isPopulated = this.bank.accountNumber !== undefined && this.bank.bankName !== undefined;
    
    if (isPopulated) {
      // Bank is already populated (from populate())
      this.bankAccount = this.bank.accountNumber;
      this.bankName = this.bank.bankName;
    } else {
      // Bank reference is set but not populated (it's an ObjectId), fetch it
      try {
        const Bank = mongoose.model('Bank');
        const bankDoc = await Bank.findById(this.bank);
        if (bankDoc) {
          this.bankAccount = bankDoc.accountNumber;
          this.bankName = bankDoc.bankName;
        }
      } catch (error) {
        // If Bank model not found or fetch fails, silently continue
        // Legacy fields will remain unset
        console.error('Error fetching bank details:', error);
      }
    }
  }
  
  next();
});

// Index for better query performance
bankReceiptSchema.index({ date: -1 });
bankReceiptSchema.index({ voucherCode: 1 }, { unique: true, sparse: true }); // Sparse allows multiple null values
bankReceiptSchema.index({ createdBy: 1 });

module.exports = mongoose.model('BankReceipt', bankReceiptSchema);
