const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  // Account Identification
  accountCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  accountName: {
    type: String,
    required: true,
    trim: true
  },
  
  // Account Classification
  accountType: {
    type: String,
    required: true,
    enum: ['asset', 'liability', 'equity', 'revenue', 'expense']
  },
  accountCategory: {
    type: String,
    required: true,
    enum: [
      // Assets
      'current_assets', 'fixed_assets', 'other_assets',
      // Liabilities
      'current_liabilities', 'long_term_liabilities',
      // Equity
      'owner_equity', 'retained_earnings',
      // Revenue
      'sales_revenue', 'other_revenue',
      // Expenses
      'cost_of_goods_sold', 'operating_expenses', 'other_expenses',
      // Additional Categories
      'inventory', 'prepaid_expenses', 'accrued_expenses', 'deferred_revenue',
      'manufacturing_overhead', 'service_delivery', 'quality_control',
      'warehouse_operations', 'shipping_handling', 'security_loss_prevention'
    ]
  },
  
  // Account Hierarchy
  parentAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChartOfAccounts',
    default: null
  },
  level: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  
  // Account Properties
  isActive: {
    type: Boolean,
    default: true
  },
  isSystemAccount: {
    type: Boolean,
    default: false // System accounts cannot be deleted
  },
  allowDirectPosting: {
    type: Boolean,
    default: true // Can transactions be posted directly to this account?
  },
  
  // Account Origin & Protection (STEP 4)
  accountOrigin: {
    type: String,
    enum: ['system', 'auto_generated', 'manual'],
    default: 'manual'
  },
  isProtected: {
    type: Boolean,
    default: false // Additional protection layer for critical accounts
  },
  
  // Soft Delete (STEP 6)
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Balance Information
  normalBalance: {
    type: String,
    required: true,
    enum: ['debit', 'credit']
  },
  currentBalance: {
    type: Number,
    default: 0
    // NOTE: This is now a computed/cached field (STEP 2)
    // Actual balance should be calculated from Journal Entries
  },
  openingBalance: {
    type: Number,
    default: 0
    // NOTE: Opening balance should be set via Opening Balance Journal Entry (STEP 1)
  },
  balanceLastCalculated: {
    type: Date,
    default: null
  },
  
  // Additional Information
  description: {
    type: String,
    trim: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  
  // Tax Information
  isTaxable: {
    type: Boolean,
    default: false
  },
  taxRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Reconciliation
  requiresReconciliation: {
    type: Boolean,
    default: false
  },
  lastReconciliationDate: {
    type: Date
  },
  // Reconciliation Locking (CRITICAL: Prevents changes during reconciliation)
  // Enhanced with date control (STEP 5)
  reconciliationStatus: {
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'reconciled', 'discrepancy'],
      default: 'not_started'
    },
    reconciledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reconciledAt: Date,
    lastReconciliationDate: Date,
    reconciledUpTo: Date, // Date up to which account is reconciled (STEP 5)
    nextReconciliationDate: Date,
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lockedAt: Date,
    lockExpiresAt: Date,
    lockStartDate: Date, // Start date of lock period (STEP 5)
    lockEndDate: Date,   // End date of lock period (STEP 5)
    discrepancyAmount: Number,
    discrepancyReason: String
  },
  
  // Metadata
  notes: {
    type: String
  },
  tags: [{
    type: String,
    trim: true
  }],
  
  // Audit Trail
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

// Compound indexes for multi-tenant performance
accountSchema.index({ tenantId: 1, accountCode: 1 }, { unique: true });
accountSchema.index({ tenantId: 1, accountType: 1 });
accountSchema.index({ tenantId: 1, isActive: 1 });
accountSchema.index({ tenantId: 1, isDeleted: 1, isActive: 1 }); // For soft delete queries
accountSchema.index({ tenantId: 1, accountOrigin: 1 }); // For account origin filtering
accountSchema.index({ tenantId: 1, parentAccount: 1 }); // For hierarchy queries

// Indexes are defined in the schema fields above using 'unique: true' and 'index: true'
// No need for additional index definitions here to avoid duplicate warnings

// Virtual for full account path
accountSchema.virtual('fullAccountPath').get(function() {
  return this.parentAccount 
    ? `${this.parentAccount.accountCode} > ${this.accountCode}` 
    : this.accountCode;
});

// Method to get account hierarchy
accountSchema.statics.getAccountHierarchy = async function(tenantId) {
  if (!tenantId) {
    throw new Error('Tenant ID is required for account hierarchy');
  }
  
  const accounts = await this.find({ 
    tenantId: tenantId,
    isActive: true,
    isDeleted: false // STEP 6: Exclude deleted accounts
  })
    .sort({ accountCode: 1 })
    .populate('parentAccount', 'accountCode accountName');
  
  // Build tree structure
  const accountMap = {};
  const rootAccounts = [];
  
  accounts.forEach(account => {
    accountMap[account._id] = {
      ...account.toObject(),
      children: []
    };
  });
  
  accounts.forEach(account => {
    if (account.parentAccount) {
      const parent = accountMap[account.parentAccount._id];
      if (parent) {
        parent.children.push(accountMap[account._id]);
      }
    } else {
      rootAccounts.push(accountMap[account._id]);
    }
  });
  
  return rootAccounts;
};

// Method to update account balance
accountSchema.methods.updateBalance = function(amount, isDebit) {
  // CRITICAL: Prevent modifications during reconciliation
  if (this.reconciliationStatus && 
      this.reconciliationStatus.status === 'in_progress' &&
      this.reconciliationStatus.lockedBy &&
      this.reconciliationStatus.lockExpiresAt &&
      this.reconciliationStatus.lockExpiresAt > new Date()) {
    throw new Error(
      `Cannot modify account ${this.accountCode} during reconciliation. ` +
      `Account is locked by another user until ${this.reconciliationStatus.lockExpiresAt.toISOString()}`
    );
  }
  
  if (this.normalBalance === 'debit') {
    this.currentBalance += isDebit ? amount : -amount;
  } else {
    this.currentBalance += isDebit ? -amount : amount;
  }
  return this.save();
};

// Method to lock account for reconciliation
accountSchema.methods.lockForReconciliation = function(userId, durationMinutes = 30) {
  if (this.reconciliationStatus.lockedBy && 
      this.reconciliationStatus.lockExpiresAt > new Date()) {
    throw new Error('Account is already locked for reconciliation by another user');
  }
  
  this.reconciliationStatus.status = 'in_progress';
  this.reconciliationStatus.lockedBy = userId;
  this.reconciliationStatus.lockedAt = new Date();
  this.reconciliationStatus.lockExpiresAt = new Date(Date.now() + durationMinutes * 60000);
  
  return this.save();
};

// Method to unlock account after reconciliation
accountSchema.methods.unlockAfterReconciliation = function(userId, reconciled = true, discrepancyAmount = null, discrepancyReason = null, reconciledUpTo = null) {
  if (this.reconciliationStatus.lockedBy && 
      this.reconciliationStatus.lockedBy.toString() !== userId.toString()) {
    throw new Error('Only the user who locked the account can unlock it');
  }
  
  this.reconciliationStatus.status = reconciled ? 'reconciled' : 'discrepancy';
  this.reconciliationStatus.reconciledBy = userId;
  this.reconciliationStatus.reconciledAt = new Date();
  this.reconciliationStatus.lastReconciliationDate = new Date();
  if (reconciledUpTo) {
    this.reconciliationStatus.reconciledUpTo = reconciledUpTo;
  }
  this.reconciliationStatus.lockedBy = null;
  this.reconciliationStatus.lockedAt = null;
  this.reconciliationStatus.lockExpiresAt = null;
  this.reconciliationStatus.lockStartDate = null;
  this.reconciliationStatus.lockEndDate = null;
  
  if (discrepancyAmount !== null) {
    this.reconciliationStatus.discrepancyAmount = discrepancyAmount;
    this.reconciliationStatus.discrepancyReason = discrepancyReason;
  }
  
  return this.save();
};

// STEP 3: Validate parent/child account rules
accountSchema.methods.validateParentChildRules = async function() {
  // If this account has a parent, ensure parent doesn't allow direct posting
  if (this.parentAccount) {
    const parent = await this.constructor.findOne({ 
      _id: this.parentAccount,
      tenantId: this.tenantId // Ensure parent belongs to same tenant
    });
    if (!parent) {
      throw new Error('Parent account not found or does not belong to the same tenant');
    }
    if (parent.allowDirectPosting) {
      throw new Error('Parent account must not allow direct posting. Parent accounts are summary accounts only.');
    }
  }
  
  // If this account is a parent (has children), it must not allow direct posting
  const children = await this.constructor.find({ 
    parentAccount: this._id, 
    tenantId: this.tenantId, // Ensure children belong to same tenant
    isDeleted: false 
  });
  if (children.length > 0 && this.allowDirectPosting) {
    throw new Error('Parent account cannot allow direct posting. Only child accounts can have transactions posted.');
  }
  
  return true;
};

// STEP 4: Check if account can be modified/deleted
accountSchema.methods.canBeModified = function(requireSystemPermission = false) {
  if (this.isSystemAccount && !requireSystemPermission) {
    throw new Error('Cannot modify system accounts without special permission');
  }
  
  if (this.isProtected && !requireSystemPermission) {
    throw new Error('Cannot modify protected accounts without special permission');
  }
  
  if (this.accountOrigin === 'system' && !requireSystemPermission) {
    throw new Error('Cannot modify system accounts without special permission');
  }
  
  return true;
};

accountSchema.methods.canBeDeleted = async function() {
  // Check if system account
  if (this.isSystemAccount || this.accountOrigin === 'system') {
    throw new Error('Cannot delete system accounts');
  }
  
  // Check if protected
  if (this.isProtected) {
    throw new Error('Cannot delete protected accounts');
  }
  
  // Check if has child accounts (same tenant)
  const children = await this.constructor.find({ 
    parentAccount: this._id,
    tenantId: this.tenantId, // Ensure children belong to same tenant
    isDeleted: false 
  });
  if (children.length > 0) {
    throw new Error('Cannot delete account with sub-accounts. Delete sub-accounts first.');
  }
  
  // Check if has balance (should check from journal entries, but for now use currentBalance)
  if (this.currentBalance !== 0) {
    throw new Error('Cannot delete account with non-zero balance');
  }
  
  return true;
};

// STEP 5: Enhanced lock for reconciliation with date range
accountSchema.methods.lockForReconciliationWithDateRange = function(userId, startDate, endDate, durationMinutes = 30) {
  if (this.reconciliationStatus.lockedBy && 
      this.reconciliationStatus.lockExpiresAt > new Date()) {
    throw new Error('Account is already locked for reconciliation by another user');
  }
  
  this.reconciliationStatus.status = 'in_progress';
  this.reconciliationStatus.lockedBy = userId;
  this.reconciliationStatus.lockedAt = new Date();
  this.reconciliationStatus.lockExpiresAt = new Date(Date.now() + durationMinutes * 60000);
  this.reconciliationStatus.lockStartDate = startDate;
  this.reconciliationStatus.lockEndDate = endDate;
  
  return this.save();
};

// STEP 5: Validate transaction date against reconciliation
accountSchema.methods.validateTransactionDate = function(transactionDate) {
  // Check if transaction is before reconciled date
  if (this.reconciliationStatus.reconciledUpTo) {
    if (transactionDate <= this.reconciliationStatus.reconciledUpTo) {
      throw new Error(
        `Cannot post transaction dated ${transactionDate.toISOString().split('T')[0]} ` +
        `before reconciliation date ${this.reconciliationStatus.reconciledUpTo.toISOString().split('T')[0]}`
      );
    }
  }
  
  // Check if transaction is in locked date range
  if (this.reconciliationStatus.status === 'in_progress') {
    const lockStart = this.reconciliationStatus.lockStartDate;
    const lockEnd = this.reconciliationStatus.lockEndDate;
    
    if (lockStart && lockEnd && transactionDate >= lockStart && transactionDate <= lockEnd) {
      throw new Error(
        `Account is locked for reconciliation from ${lockStart.toISOString().split('T')[0]} ` +
        `to ${lockEnd.toISOString().split('T')[0]}. Cannot post transactions in this date range.`
      );
    }
  }
  
  return true;
};

const ChartOfAccounts = mongoose.model('ChartOfAccounts', accountSchema);

module.exports = ChartOfAccounts;

