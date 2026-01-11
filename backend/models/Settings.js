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
  
  // Singleton pattern - only one settings document should exist
  _id: {
    type: String,
    default: 'company_settings'
  }
}, {
  timestamps: true,
  _id: false // Disable auto _id generation since we're providing our own
});

// Ensure only one settings document exists
settingsSchema.statics.getSettings = async function() {
  let settings = await this.findById('company_settings');
  if (!settings) {
    try {
      settings = await this.create({ _id: 'company_settings' });
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate key - settings already exists, fetch it
        settings = await this.findById('company_settings');
      } else {
        throw err;
      }
    }
  }
  return settings;
};

settingsSchema.statics.updateSettings = async function(updates) {
  const settings = await this.getSettings();
  Object.assign(settings, updates);
  await settings.save();
  return settings;
};

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;

