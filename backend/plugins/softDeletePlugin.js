/**
 * Soft Delete Plugin
 * 
 * Adds comprehensive soft delete functionality to Mongoose schemas
 */

const mongoose = require('mongoose');

/**
 * Soft delete plugin
 * @param {Object} schema - Mongoose schema
 * @param {Object} options - Plugin options
 */
function softDeletePlugin(schema, options = {}) {
  const {
    indexDeletedAt = true,
    indexDeletedBy = true
  } = options;
  
  // Add soft delete fields
  schema.add({
    // Deletion Status
    isDeleted: {
      type: Boolean,
      default: false,
      required: true,
      index: true
    },
    
    // Deletion Timestamp
    deletedAt: {
      type: Date,
      default: null
    },
    
    // Who Deleted
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    
    // Why Deleted
    deletionReason: {
      type: String,
      maxlength: 500,
      trim: true
    },
    
    // Restore Information
    restoredAt: {
      type: Date,
      default: null
    },
    restoredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    restoreReason: {
      type: String,
      maxlength: 500,
      trim: true
    },
    
    // Deletion Metadata
    deletionMetadata: {
      ipAddress: String,
      userAgent: String,
      sessionId: String
    }
  });
  
  // Index deletedAt if requested
  if (indexDeletedAt) {
    schema.index({ deletedAt: 1 });
  }
  
  // Index deletedBy if requested
  if (indexDeletedBy) {
    schema.index({ deletedBy: 1 });
  }
  
  // Compound index for common queries
  schema.index({ isDeleted: 1, deletedAt: -1 });
  
  // Pre-save: Set deletedAt when isDeleted becomes true
  schema.pre('save', function(next) {
    if (this.isModified('isDeleted')) {
      if (this.isDeleted && !this.deletedAt) {
        this.deletedAt = new Date();
      } else if (!this.isDeleted && this.deletedAt) {
        // Restore
        this.restoredAt = new Date();
        this.deletedAt = null;
      }
    }
    next();
  });
  
  // Static method: Find non-deleted documents
  schema.statics.findActive = function(conditions = {}) {
    return this.find({ ...conditions, isDeleted: false });
  };
  
  // Static method: Find deleted documents
  schema.statics.findDeleted = function(conditions = {}) {
    return this.find({ ...conditions, isDeleted: true });
  };
  
  // Static method: Find all (including deleted)
  schema.statics.findAll = function(conditions = {}) {
    return this.find(conditions);
  };
  
  // Static method: Soft delete
  schema.statics.softDeleteById = async function(id, options = {}) {
    const {
      userId = null,
      reason = null,
      metadata = {}
    } = options;
    
    return await this.findByIdAndUpdate(
      id,
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: userId,
          deletionReason: reason,
          deletionMetadata: metadata
        }
      },
      { new: true }
    );
  };
  
  // Static method: Restore
  schema.statics.restoreById = async function(id, options = {}) {
    const {
      userId = null,
      reason = null
    } = options;
    
    return await this.findByIdAndUpdate(
      id,
      {
        $set: {
          isDeleted: false,
          restoredAt: new Date(),
          restoredBy: userId,
          restoreReason: reason
        },
        $unset: {
          deletedAt: '',
          deletedBy: '',
          deletionReason: ''
        }
      },
      { new: true }
    );
  };
  
  // Instance method: Soft delete
  schema.methods.softDelete = async function(options = {}) {
    const {
      userId = null,
      reason = null,
      metadata = {}
    } = options;
    
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.deletedBy = userId;
    this.deletionReason = reason;
    this.deletionMetadata = metadata;
    
    return await this.save();
  };
  
  // Instance method: Restore
  schema.methods.restore = async function(options = {}) {
    const {
      userId = null,
      reason = null
    } = options;
    
    this.isDeleted = false;
    this.restoredAt = new Date();
    this.restoredBy = userId;
    this.restoreReason = reason;
    this.deletedAt = null;
    this.deletedBy = null;
    this.deletionReason = null;
    
    return await this.save();
  };
  
  // Query helper: Exclude deleted by default
  schema.query.notDeleted = function() {
    return this.where({ isDeleted: false });
  };
  
  // Query helper: Include deleted
  schema.query.includeDeleted = function() {
    return this;
  };
  
  // Query helper: Only deleted
  schema.query.onlyDeleted = function() {
    return this.where({ isDeleted: true });
  };
}

module.exports = softDeletePlugin;

