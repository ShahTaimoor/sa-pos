const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  // Basic Information
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: false,
    lowercase: true,
    trim: true,
    sparse: true
  },
  phone: {
    type: String,
    trim: true,
    sparse: true
  },
  
  // Business Information
  businessName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  businessType: {
    type: String,
    enum: ['retail', 'wholesale', 'distributor', 'individual'],
    default: 'wholesale'
  },
  taxId: {
    type: String,
    trim: true
  },
  
  // Address Information
  addresses: [{
    type: {
      type: String,
      enum: ['billing', 'shipping', 'both'],
      default: 'both'
    },
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: {
      type: String,
      default: 'US'
    },
    isDefault: {
      type: Boolean,
      default: false
    }
  }],
  
  // Customer Classification
  customerTier: {
    type: String,
    enum: ['bronze', 'silver', 'gold', 'platinum'],
    default: 'bronze'
  },
  creditLimit: {
    type: Number,
    default: 0,
    min: 0
  },
  openingBalance: {
    type: Number,
    default: 0
  },
  currentBalance: {
    type: Number,
    default: 0
  },
  pendingBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  advanceBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Payment Terms
  paymentTerms: {
    type: String,
    enum: ['cash', 'net15', 'net30', 'net45', 'net60'],
    default: 'cash'
  },
  discountPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Preferences
  preferences: {
    defaultPaymentMethod: {
      type: String,
      enum: ['cash', 'credit_card', 'check', 'account'],
      default: 'cash'
    },
    receiveEmails: {
      type: Boolean,
      default: true
    },
    receiveSms: {
      type: Boolean,
      default: false
    }
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  
  // Credit Policy
  creditPolicy: {
    gracePeriodDays: {
      type: Number,
      default: 0, // Days after due date before action
      min: 0
    },
    autoSuspendDays: {
      type: Number,
      default: 90, // Days overdue before auto-suspension
      min: 0
    },
    warningThresholds: [{
      daysOverdue: {
        type: Number,
        required: true,
        min: 0
      },
      action: {
        type: String,
        enum: ['email', 'sms', 'letter', 'call'],
        required: true
      },
      message: String
    }]
  },
  
  // Suspension Information
  suspendedAt: Date,
  suspensionReason: String,
  suspendedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Notes
  notes: {
    type: String,
    maxlength: 1000
  },
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  ledgerAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChartOfAccounts'
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
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletionReason: {
    type: String,
    maxlength: 500
  },
  
  // Anonymization (for GDPR)
  isAnonymized: {
    type: Boolean,
    default: false,
    index: true
  },
  anonymizedAt: Date,
  
  // Version for optimistic locking
  version: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: '__v', // Enable Mongoose versioning
  optimisticConcurrency: true // Enable optimistic concurrency control
});

// Indexes for better performance
// businessName and email indexes removed - already have unique: true in field definitions
// Compound indexes for multi-tenant performance
customerSchema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
customerSchema.index({ tenantId: 1, phone: 1 }, { unique: true, sparse: true });
customerSchema.index({ tenantId: 1, businessName: 1 }, { unique: true });
customerSchema.index({ tenantId: 1, businessType: 1, status: 1 });
customerSchema.index({ tenantId: 1, name: 1 });
customerSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
customerSchema.index({ tenantId: 1, customerTier: 1, status: 1 });
customerSchema.index({ tenantId: 1, currentBalance: -1 });
customerSchema.index({ tenantId: 1, createdAt: -1 });
customerSchema.index({ tenantId: 1, isDeleted: 1, status: 1 });
customerSchema.index({ tenantId: 1, isAnonymized: 1 });

// Virtual for display name
customerSchema.virtual('displayName').get(function() {
  return this.businessName || this.name;
});

// Virtual for UI terminology alignment
customerSchema.virtual('outstandingBalance').get(function() {
  return this.pendingBalance;
});

// Method to get default address
customerSchema.methods.getDefaultAddress = function(type = 'both') {
  return this.addresses.find(addr => 
    addr.isDefault && (addr.type === type || addr.type === 'both')
  );
};

// Method to check if customer can make purchase
customerSchema.methods.canMakePurchase = function(amount) {
  if (this.status !== 'active') return false;
  if (this.paymentTerms === 'cash') return true;
  return (this.currentBalance + amount) <= this.creditLimit;
};

// Method to get effective discount
customerSchema.methods.getEffectiveDiscount = function() {
  let discount = this.discountPercent;
  
  // Apply tier-based discounts
  switch(this.customerTier) {
    case 'silver':
      discount = Math.max(discount, 5);
      break;
    case 'gold':
      discount = Math.max(discount, 10);
      break;
    case 'platinum':
      discount = Math.max(discount, 15);
      break;
  }
  
  return discount;
};

// Normalize optional fields before validation/save operations
const normalizeOptionalFields = (doc) => {
  if (!doc) return;

  if (typeof doc.email === 'string') {
    doc.email = doc.email.trim().toLowerCase();
    if (doc.email === '') {
      doc.email = undefined;
    }
  }

  if (typeof doc.phone === 'string' && doc.phone.trim() === '') {
    doc.phone = undefined;
  }

  if (typeof doc.taxId === 'string' && doc.taxId.trim() === '') {
    doc.taxId = undefined;
  }

  if (typeof doc.ledgerAccount === 'string') {
    doc.ledgerAccount = doc.ledgerAccount.trim();
    if (doc.ledgerAccount === '') {
      doc.ledgerAccount = undefined;
    }
  }
};

customerSchema.pre('validate', function(next) {
  normalizeOptionalFields(this);
  next();
});

customerSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (!update) return next();

  const doc = { ...update };

  if (doc.$set) {
    normalizeOptionalFields(doc.$set);
  } else {
    normalizeOptionalFields(doc);
  }

  this.setUpdate(doc);
  next();
});

module.exports = mongoose.model('Customer', customerSchema);
