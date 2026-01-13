const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  // Company Information
  companyName: {
    type: String,
    required: true,
    trim: true,
    default: 'Company Name'
  },
  contactNumber: {
    type: String,
    required: true,
    trim: true,
    default: '+1 (555) 123-4567'
  },
  address: {
    type: String,
    required: true,
    trim: true,
    default: '123 Business Street, City, State, ZIP'
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  
  // Additional Company Details
  website: {
    type: String,
    trim: true
  },
  taxId: {
    type: String,
    trim: true
  },
  registrationNumber: {
    type: String,
    trim: true
  },
  
  // System Settings
  currency: {
    type: String,
    default: 'USD'
  },
  dateFormat: {
    type: String,
    enum: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'],
    default: 'MM/DD/YYYY'
  },
  timeFormat: {
    type: String,
    enum: ['12h', '24h'],
    default: '12h'
  },
  
  // Business Settings
  fiscalYearStart: {
    type: Number,
    min: 1,
    max: 12,
    default: 1 // January
  },
  defaultTaxRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Tenant ID for multi-tenant isolation
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  }
}, {
  timestamps: true
});

// Unique index on tenantId to ensure one settings document per tenant
settingsSchema.index({ tenantId: 1 }, { unique: true });

// Get settings for a tenant (tenant-specific)
settingsSchema.statics.getSettings = async function(tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required to get settings');
  }
  let settings = await this.findOne({ tenantId: tenantId });
  if (!settings) {
    try {
      settings = await this.create({ tenantId: tenantId });
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate key - settings already exists, fetch it
        settings = await this.findOne({ tenantId: tenantId });
      } else {
        throw err;
      }
    }
  }
  return settings;
};

settingsSchema.statics.updateSettings = async function(updates, tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required to update settings');
  }
  const settings = await this.getSettings(tenantId);
  Object.assign(settings, updates);
  await settings.save();
  return settings;
};

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;

