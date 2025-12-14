const mongoose = require('mongoose');

const productTransformationSchema = new mongoose.Schema({
  // Transformation Details
  transformationNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
    // Auto-generated: TRANS-YYYYMMDD-XXXX
  },
  
  // Base Product (source)
  baseProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  baseProductName: {
    type: String,
    required: true,
    trim: true
  },
  
  // Target Variant (destination)
  targetVariant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductVariant',
    required: true,
    index: true
  },
  targetVariantName: {
    type: String,
    required: true,
    trim: true
  },
  
  // Transformation Details
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  
  // Cost Information
  unitTransformationCost: {
    type: Number,
    required: true,
    min: 0
    // Cost per unit to transform
  },
  totalTransformationCost: {
    type: Number,
    required: true,
    min: 0
    // quantity * unitTransformationCost
  },
  
  // Stock Levels Before Transformation
  baseProductStockBefore: {
    type: Number,
    required: true,
    min: 0
  },
  baseProductStockAfter: {
    type: Number,
    required: true,
    min: 0
  },
  variantStockBefore: {
    type: Number,
    required: true,
    min: 0
  },
  variantStockAfter: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Transformation Type
  transformationType: {
    type: String,
    required: true,
    enum: ['color', 'warranty', 'size', 'finish', 'custom'],
    index: true
  },
  
  // Notes
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  // Employee/User who performed transformation
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Date Information
  transformationDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
productTransformationSchema.index({ transformationNumber: 1 });
productTransformationSchema.index({ baseProduct: 1, status: 1 });
productTransformationSchema.index({ targetVariant: 1, status: 1 });
productTransformationSchema.index({ transformationDate: -1 });
productTransformationSchema.index({ performedBy: 1, transformationDate: -1 });

// Pre-save middleware to generate transformation number
productTransformationSchema.pre('save', async function(next) {
  if (!this.transformationNumber) {
    const count = await mongoose.model('ProductTransformation').countDocuments();
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const sequence = String(count + 1).padStart(4, '0');
    this.transformationNumber = `TRANS-${year}${month}${day}-${sequence}`;
  }
  next();
});

// Method to calculate total cost
productTransformationSchema.methods.calculateTotalCost = function() {
  this.totalTransformationCost = this.quantity * this.unitTransformationCost;
  return this.totalTransformationCost;
};

module.exports = mongoose.model('ProductTransformation', productTransformationSchema);

