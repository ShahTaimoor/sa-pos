const mongoose = require('mongoose');
const Counter = require('./Counter');

const journalVoucherEntrySchema = new mongoose.Schema({
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChartOfAccounts',
    required: true
  },
  accountCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  accountName: {
    type: String,
    required: true,
    trim: true
  },
  particulars: {
    type: String,
    trim: true,
    maxlength: 500
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
  }
}, { _id: false });

const journalVoucherSchema = new mongoose.Schema({
  voucherNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  voucherDate: {
    type: Date,
    required: true
  },
  reference: {
    type: String,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  entries: {
    type: [journalVoucherEntrySchema],
    validate: [
      {
        validator(value) {
          return Array.isArray(value) && value.length >= 2;
        },
        message: 'At least two entries are required for a journal voucher.'
      },
      {
        validator(value) {
          return value.every(entry => !(entry.debit > 0 && entry.credit > 0));
        },
        message: 'An entry cannot have both debit and credit amounts.'
      }
    ]
  },
  totalDebit: {
    type: Number,
    default: 0,
    min: 0
  },
  totalCredit: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['draft', 'posted'],
    default: 'posted'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

journalVoucherSchema.pre('validate', function(next) {
  if (Array.isArray(this.entries)) {
    let debit = 0;
    let credit = 0;

    this.entries.forEach(entry => {
      debit += entry.debit || 0;
      credit += entry.credit || 0;
    });

    this.totalDebit = Math.round((debit + Number.EPSILON) * 100) / 100;
    this.totalCredit = Math.round((credit + Number.EPSILON) * 100) / 100;

    if (this.totalDebit <= 0 || this.totalCredit <= 0) {
      return next(new Error('Total debit and credit must be greater than zero.'));
    }

    if (Math.abs(this.totalDebit - this.totalCredit) > 0.0001) {
      return next(new Error('Total debit and credit must be equal.'));
    }
  }

  next();
});

journalVoucherSchema.index({ voucherNumber: 1 }, { unique: true });
journalVoucherSchema.index({ voucherDate: -1 });
journalVoucherSchema.index({ status: 1, voucherDate: -1 });

journalVoucherSchema.pre('save', async function(next) {
  if (!this.voucherNumber) {
    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: 'journalVoucherNumber' },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      this.voucherNumber = `JV-${String(counter.seq).padStart(6, '0')}`;
    } catch (err) {
      return next(err);
    }
  }
  next();
});

module.exports = mongoose.model('JournalVoucher', journalVoucherSchema);

