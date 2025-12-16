const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
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
    unique: true,
    sparse: true
  },
  phone: {
    type: String,
    trim: true,
    unique: true,
    sparse: true // Allows multiple null/undefined values, but ensures uniqueness for provided values
  },
  
  // Business Information
  businessName: {
    type: String,
    required: true,
    unique: true,
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
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
// businessName and email indexes removed - already have unique: true in field definitions
customerSchema.index({ businessType: 1, status: 1 });
customerSchema.index({ name: 1 });
customerSchema.index({ phone: 1 }); // For phone lookups
customerSchema.index({ status: 1, createdAt: -1 }); // For active customers listing
customerSchema.index({ customerTier: 1, status: 1 }); // For tier-based queries
customerSchema.index({ 'currentBalance': -1 }); // For balance sorting
customerSchema.index({ createdAt: -1 }); // For recent customers

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
