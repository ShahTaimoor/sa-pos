const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, trim: true },
  },
  { _id: false }
);

const ContactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
  },
  { _id: false }
);

const WarehouseSchema = new mongoose.Schema(
  {
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
      maxlength: 150,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      uppercase: true
      // Note: unique constraint is enforced via compound index { tenantId: 1, code: 1 }
      // DO NOT add unique: true here - it creates a global index
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    address: AddressSchema,
    contact: ContactSchema,
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    capacity: {
      type: Number,
      min: 0,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
    }
  },
  {
    timestamps: true,
  }
);

// Compound unique index for tenant-scoped warehouse codes
WarehouseSchema.index({ tenantId: 1, code: 1 }, { unique: true });
WarehouseSchema.index({ tenantId: 1, name: 1 });
WarehouseSchema.index({ tenantId: 1, isActive: 1 });
WarehouseSchema.index({ tenantId: 1, isPrimary: 1 });

WarehouseSchema.pre('save', async function ensureSinglePrimary(next) {
  if (this.isPrimary && this.isModified('isPrimary') && this.tenantId) {
    await this.constructor.updateMany(
      { tenantId: this.tenantId, _id: { $ne: this._id } },
      { $set: { isPrimary: false } }
    );
  }
  next();
});

module.exports = mongoose.model('Warehouse', WarehouseSchema);

