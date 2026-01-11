const mongoose = require('mongoose');

const citySchema = new mongoose.Schema({
  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
    // Note: unique constraint is enforced via compound index { tenantId: 1, name: 1 }
    // DO NOT add unique: true here - it creates a global index
  },
  state: {
    type: String,
    trim: true,
    maxlength: 100
  },
  country: {
    type: String,
    default: 'US',
    trim: true,
    maxlength: 100
  },
  isActive: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  // Audit Fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for better query performance
// Compound unique index for tenant-scoped city names
citySchema.index({ tenantId: 1, name: 1 }, { unique: true });
citySchema.index({ tenantId: 1, isActive: 1 });
citySchema.index({ tenantId: 1, state: 1 });

module.exports = mongoose.model('City', citySchema);

