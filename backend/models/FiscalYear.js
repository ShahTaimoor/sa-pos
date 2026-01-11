/**
 * Fiscal Year Model
 * 
 * STEP 7: Manages fiscal years and period locking for accounting.
 * Prevents posting transactions into closed months or years.
 */

const mongoose = require('mongoose');

const periodSchema = new mongoose.Schema({
  period: {
    type: Number,
    required: true,
    min: 1,
    max: 12 // 1-12 for months
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  lockedAt: {
    type: Date
  },
  lockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  closedAt: {
    type: Date
  },
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { _id: false });

const fiscalYearSchema = new mongoose.Schema({
  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  // Fiscal year identification
  year: {
    type: Number,
    required: true,
    min: 2000,
    max: 2100
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  
  // Status
  isClosed: {
    type: Boolean,
    default: false,
    index: true
  },
  closedAt: {
    type: Date
  },
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Periods (typically 12 months)
  periods: {
    type: [periodSchema],
    default: []
  },
  
  // Metadata
  description: {
    type: String,
    trim: true
  },
  notes: {
    type: String
  },
  
  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound indexes
fiscalYearSchema.index({ tenantId: 1, year: 1 }, { unique: true });
fiscalYearSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });
fiscalYearSchema.index({ tenantId: 1, isClosed: 1 });

// Method to get period for a date
fiscalYearSchema.methods.getPeriodForDate = function(date) {
  return this.periods.find(p => 
    p.startDate <= date && p.endDate >= date
  );
};

// Method to lock a period
fiscalYearSchema.methods.lockPeriod = function(periodNumber, userId) {
  const period = this.periods.find(p => p.period === periodNumber);
  if (!period) {
    throw new Error(`Period ${periodNumber} not found`);
  }
  
  if (period.isLocked) {
    throw new Error(`Period ${periodNumber} is already locked`);
  }
  
  period.isLocked = true;
  period.lockedAt = new Date();
  period.lockedBy = userId;
  
  return this.save();
};

// Method to close a period
fiscalYearSchema.methods.closePeriod = function(periodNumber, userId) {
  const period = this.periods.find(p => p.period === periodNumber);
  if (!period) {
    throw new Error(`Period ${periodNumber} not found`);
  }
  
  if (!period.isLocked) {
    throw new Error(`Period ${periodNumber} must be locked before closing`);
  }
  
  period.closedAt = new Date();
  period.closedBy = userId;
  
  return this.save();
};

// Method to close fiscal year
fiscalYearSchema.methods.closeFiscalYear = function(userId) {
  // Check if all periods are closed
  const allPeriodsClosed = this.periods.every(p => p.closedAt !== null);
  if (!allPeriodsClosed) {
    throw new Error('All periods must be closed before closing the fiscal year');
  }
  
  this.isClosed = true;
  this.closedAt = new Date();
  this.closedBy = userId;
  
  return this.save();
};

// Static method to find fiscal year for a date
fiscalYearSchema.statics.findFiscalYearForDate = async function(tenantId, date) {
  return await this.findOne({
    tenantId,
    startDate: { $lte: date },
    endDate: { $gte: date }
  });
};

// Static method to get current fiscal year
fiscalYearSchema.statics.getCurrentFiscalYear = async function(tenantId) {
  const now = new Date();
  return await this.findOne({
    tenantId,
    startDate: { $lte: now },
    endDate: { $gte: now },
    isClosed: false
  });
};

// Static method to create fiscal year with periods
fiscalYearSchema.statics.createFiscalYear = async function(data) {
  const { tenantId, year, startDate, endDate, createdBy } = data;
  
  // Generate 12 monthly periods
  const periods = [];
  const start = new Date(startDate);
  
  for (let i = 1; i <= 12; i++) {
    const periodStart = new Date(start.getFullYear(), start.getMonth() + (i - 1), 1);
    const periodEnd = new Date(start.getFullYear(), start.getMonth() + i, 0, 23, 59, 59, 999);
    
    periods.push({
      period: i,
      startDate: periodStart,
      endDate: periodEnd,
      isLocked: false
    });
  }
  
  const fiscalYear = new this({
    tenantId,
    year,
    startDate,
    endDate,
    periods,
    createdBy,
    isClosed: false
  });
  
  return await fiscalYear.save();
};

const FiscalYear = mongoose.model('FiscalYear', fiscalYearSchema);

module.exports = FiscalYear;
