/**
 * Period Override Model
 * 
 * Tracks admin overrides for closed/locked periods
 * Provides audit trail and approval workflow
 */

const mongoose = require('mongoose');

const periodOverrideSchema = new mongoose.Schema({
  // Period Reference
  period: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AccountingPeriod',
    required: true,
    index: true
  },
  
  // User requesting override
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Operation being performed
  operation: {
    type: String,
    required: true,
    enum: ['create', 'update', 'delete', 'adjustment', 'reversal', 'other'],
    index: true
  },
  
  // Override Details
  reason: {
    type: String,
    required: true,
    maxlength: 1000
  },
  documentType: {
    type: String,
    enum: ['transaction', 'journal_entry', 'adjustment', 'reversal', 'other']
  },
  documentId: {
    type: mongoose.Schema.Types.ObjectId
  },
  
  // Approval Workflow
  status: {
    type: String,
    enum: ['pending_approval', 'approved', 'rejected', 'used', 'expired', 'cancelled'],
    default: 'pending_approval',
    index: true
  },
  approvalRequired: {
    type: Number,
    default: 1,
    min: 0,
    max: 3
  },
  approvals: [{
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    approvedAt: {
      type: Date,
      default: Date.now
    },
    notes: String
  }],
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: Date,
  rejectionReason: String,
  
  // Usage Tracking
  usedAt: Date,
  usedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  expiresAt: {
    type: Date,
    index: true
  },
  
  // Audit
  createdAt: {
    type: Date,
    default: Date.now
  },
  approvedAt: Date,
  cancelledAt: Date,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
periodOverrideSchema.index({ period: 1, status: 1 });
periodOverrideSchema.index({ user: 1, status: 1 });
periodOverrideSchema.index({ status: 1, expiresAt: 1 });
periodOverrideSchema.index({ documentType: 1, documentId: 1 });

// Virtual: Is approved
periodOverrideSchema.virtual('isApproved').get(function() {
  return this.status === 'approved' && 
         this.approvals.length >= this.approvalRequired;
});

// Virtual: Is expired
periodOverrideSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

// Method: Check if override can be used
periodOverrideSchema.methods.canBeUsed = function() {
  if (this.status !== 'approved') {
    return { canUse: false, reason: `Override is ${this.status}` };
  }
  
  if (this.isExpired) {
    return { canUse: false, reason: 'Override has expired' };
  }
  
  if (this.usedAt) {
    return { canUse: false, reason: 'Override has already been used' };
  }
  
  return { canUse: true };
};

// Pre-save: Set expiration if approved
periodOverrideSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'approved' && !this.expiresAt) {
    // Default expiration: 24 hours from approval
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  next();
});

module.exports = mongoose.model('PeriodOverride', periodOverrideSchema);

