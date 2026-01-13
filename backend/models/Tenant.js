const mongoose = require('mongoose');

/**
 * Tenant Model
 * 
 * Represents a separate business/tenant in the multi-tenant system.
 * Each tenant is completely isolated from others.
 */
const tenantSchema = new mongoose.Schema({
  // Tenant Information
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  businessName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  businessType: {
    type: String,
    enum: ['retail', 'wholesale', 'manufacturing', 'service', 'other'],
    default: 'retail'
  },
  
  // Contact Information
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: {
      type: String,
      default: 'US'
    }
  },
  
  // Tax Information
  taxId: {
    type: String,
    trim: true
  },
  
  // Admin User (the Admin user created for this tenant)
  adminUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Created by Super Admin
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'suspended', 'inactive'],
    default: 'active'
  },
  
  // Subscription/Plan Information (for future use)
  plan: {
    type: String,
    enum: ['basic', 'standard', 'premium', 'enterprise'],
    default: 'basic'
  },
  
  // Settings
  settings: {
    currency: {
      type: String,
      default: 'USD'
    },
    timezone: {
      type: String,
      default: 'America/New_York'
    },
    dateFormat: {
      type: String,
      default: 'MM/DD/YYYY'
    },
    fiscalYearStart: {
      month: {
        type: Number,
        min: 1,
        max: 12,
        default: 1
      },
      day: {
        type: Number,
        min: 1,
        max: 31,
        default: 1
      }
    }
  },
  
  // Metadata
  metadata: {
    totalUsers: {
      type: Number,
      default: 1 // Starts with 1 (the Admin user)
    },
    totalProducts: {
      type: Number,
      default: 0
    },
    totalCustomers: {
      type: Number,
      default: 0
    },
    totalSuppliers: {
      type: Number,
      default: 0
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    lastActivity: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
tenantSchema.index({ adminUserId: 1 }, { unique: true });
tenantSchema.index({ email: 1 });
tenantSchema.index({ status: 1 });
tenantSchema.index({ createdAt: -1 });

// Virtual for display name
tenantSchema.virtual('displayName').get(function() {
  return this.businessName || this.name;
});

// Method to check if tenant is active
tenantSchema.methods.isActive = function() {
  return this.status === 'active';
};

module.exports = mongoose.model('Tenant', tenantSchema);
