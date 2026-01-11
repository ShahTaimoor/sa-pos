/**
 * Journal Entry Model
 * 
 * Single source of truth for all accounting transactions.
 * Every sale, purchase, payment, expense, and inventory movement
 * must create journal entries that satisfy: Total Debit = Total Credit
 */

const mongoose = require('mongoose');

const journalEntryLineSchema = new mongoose.Schema({
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChartOfAccounts',
    required: true
  },
  accountCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true
  },
  accountName: {
    type: String,
    required: true,
    trim: true
  },
  debit: {
    type: Number,
    default: 0,
    min: 0
  },
  credit: {
    type: Number,
    default: 0,
    min: 0
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, { _id: false });

const journalEntrySchema = new mongoose.Schema({
  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  // Entry identification
  entryNumber: {
    type: String,
    required: true,
    trim: true
  },
  entryDate: {
    type: Date,
    required: true,
    index: true
  },
  
  // Transaction reference
  referenceType: {
    type: String,
    required: true,
    enum: ['sale', 'purchase', 'payment', 'expense', 'inventory', 'adjustment', 'manual', 'opening_balance', 'period_closing'],
    index: true
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  referenceNumber: {
    type: String,
    trim: true
  },
  
  // Journal entries (must balance: totalDebit = totalCredit)
  entries: {
    type: [journalEntryLineSchema],
    required: true,
    validate: {
      validator: function(entries) {
        if (!Array.isArray(entries) || entries.length < 2) {
          return false;
        }
        // Each entry must have either debit or credit, not both
        for (const entry of entries) {
          if (entry.debit > 0 && entry.credit > 0) {
            return false;
          }
          if (entry.debit === 0 && entry.credit === 0) {
            return false;
          }
        }
        return true;
      },
      message: 'Journal entry must have at least 2 lines, and each line must have either debit or credit (not both)'
    }
  },
  
  // Calculated totals (for validation)
  totalDebit: {
    type: Number,
    required: true,
    min: 0
  },
  totalCredit: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'posted', 'reversed', 'cancelled'],
    default: 'posted',
    index: true
  },
  
  // Reversal reference (if this entry reverses another)
  reversedEntry: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JournalEntry'
  },
  
  // Description
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Special entry flags
  isOpeningEntry: {
    type: Boolean,
    default: false
  },
  isClosingEntry: {
    type: Boolean,
    default: false
  },
  
  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Pre-save validation: Ensure Debit = Credit
journalEntrySchema.pre('validate', function(next) {
  if (Array.isArray(this.entries)) {
    let totalDebit = 0;
    let totalCredit = 0;
    
    this.entries.forEach(entry => {
      totalDebit += entry.debit || 0;
      totalCredit += entry.credit || 0;
    });
    
    // Round to 2 decimal places to avoid floating point issues
    this.totalDebit = Math.round((totalDebit + Number.EPSILON) * 100) / 100;
    this.totalCredit = Math.round((totalCredit + Number.EPSILON) * 100) / 100;
    
    // Validate that debits equal credits (with small tolerance for floating point)
    if (Math.abs(this.totalDebit - this.totalCredit) > 0.01) {
      return next(new Error(
        `Journal entry does not balance. Debit: ${this.totalDebit}, Credit: ${this.totalCredit}`
      ));
    }
    
    if (this.totalDebit <= 0 || this.totalCredit <= 0) {
      return next(new Error('Total debit and credit must be greater than zero'));
    }
  }
  
  next();
});

// Compound indexes for performance
journalEntrySchema.index({ tenantId: 1, entryDate: -1 });
journalEntrySchema.index({ tenantId: 1, referenceType: 1, referenceId: 1 });
journalEntrySchema.index({ tenantId: 1, status: 1, entryDate: -1 });
journalEntrySchema.index({ tenantId: 1, accountCode: 1, entryDate: -1 });
journalEntrySchema.index({ tenantId: 1, 'entries.accountCode': 1, entryDate: -1 });

// Static method to generate entry number
journalEntrySchema.statics.generateEntryNumber = async function(tenantId, referenceType) {
  const Counter = mongoose.model('Counter');
  const prefix = referenceType.toUpperCase().substring(0, 3);
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  
  const counterKey = `journalEntry_${tenantId}_${year}${month}${day}`;
  
  const counter = await Counter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  
  return `${prefix}-${year}${month}${day}-${String(counter.seq).padStart(6, '0')}`;
};

module.exports = mongoose.model('JournalEntry', journalEntrySchema);

