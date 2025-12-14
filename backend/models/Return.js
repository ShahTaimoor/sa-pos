const mongoose = require('mongoose');
const Counter = require('./Counter');

const returnItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  originalOrderItem: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
    // Note: This stores the _id of a subdocument in Sales.items array
    // Cannot use ref for subdocuments - must manually find item in Sales.items array
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  originalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  returnReason: {
    type: String,
    required: true,
    enum: [
      'defective',
      'wrong_item',
      'not_as_described',
      'damaged_shipping',
      'changed_mind',
      'duplicate_order',
      'size_issue',
      'quality_issue',
      'late_delivery',
      'other'
    ]
  },
  returnReasonDetail: {
    type: String,
    trim: true,
    maxlength: 500
  },
  condition: {
    type: String,
    required: true,
    enum: ['new', 'like_new', 'good', 'fair', 'poor', 'damaged'],
    default: 'good'
  },
  action: {
    type: String,
    required: true,
    enum: ['refund', 'exchange', 'store_credit', 'repair', 'replace'],
    default: 'refund'
  },
  refundAmount: {
    type: Number,
    min: 0,
    default: 0
  },
  restockingFee: {
    type: Number,
    min: 0,
    default: 0
  },
  generalNotes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  images: [{
    url: String,
    description: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }]
});

const returnSchema = new mongoose.Schema({
  returnNumber: {
    type: String,
    unique: true,
    required: false  // Auto-generated in pre-save middleware
  },
  originalOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sales',
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  returnType: {
    type: String,
    required: true,
    enum: ['return', 'exchange', 'warranty', 'recall'],
    default: 'return'
  },
  status: {
    type: String,
    required: true,
    enum: [
      'pending',
      'approved',
      'rejected',
      'processing',
      'received',
      'inspected',
      'refunded',
      'exchanged',
      'completed',
      'cancelled'
    ],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  items: [returnItemSchema],
  totalRefundAmount: {
    type: Number,
    min: 0,
    default: 0
  },
  totalRestockingFee: {
    type: Number,
    min: 0,
    default: 0
  },
  netRefundAmount: {
    type: Number,
    min: 0,
    default: 0
  },
  refundMethod: {
    type: String,
    enum: ['original_payment', 'store_credit', 'cash', 'check', 'bank_transfer'],
    default: 'original_payment'
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  receivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  returnDate: {
    type: Date,
    default: Date.now
  },
  approvalDate: Date,
  processingDate: Date,
  receivedDate: Date,
  completionDate: Date,
  expectedReceiveDate: Date,
  returnShipping: {
    method: String,
    trackingNumber: String,
    carrier: String,
    cost: {
      type: Number,
      min: 0,
      default: 0
    },
    paidBy: {
      type: String,
      enum: ['customer', 'store', 'manufacturer'],
      default: 'customer'
    }
  },
  exchangeDetails: {
    exchangeOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sales' // Updated from 'Order' to 'Sales' to match model migration
    },
    exchangeItems: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      },
      quantity: Number,
      price: Number
    }],
    priceDifference: {
      type: Number,
      default: 0
    }
  },
  refundDetails: {
    refundTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
    },
    refundDate: Date,
    refundReference: String,
    refundNotes: String
  },
  inspection: {
    inspectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    inspectionDate: Date,
    inspectionNotes: String,
    conditionVerified: Boolean,
    resellable: Boolean,
    disposalRequired: Boolean
  },
  policy: {
    type: {
      type: String,
      enum: ['standard', 'extended', 'warranty', 'no_return'],
      default: 'standard'
    },
    returnWindow: {
      type: Number,
      default: 30 // days
    },
    restockingFeePercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    exchangeAllowed: {
      type: Boolean,
      default: true
    },
    storeCreditOnly: {
      type: Boolean,
      default: false
    }
  },
  communication: [{
    type: {
      type: String,
      enum: ['email', 'phone', 'in_person', 'system'],
      required: true
    },
    message: String,
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    recipient: String
  }],
  notes: [{
    note: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    isInternal: {
      type: Boolean,
      default: false
    }
  }],
  tags: [String],
  attachments: [{
    filename: String,
    url: String,
    type: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  metadata: {
    source: {
      type: String,
      enum: ['pos', 'online', 'phone', 'email', 'walk_in'],
      default: 'pos'
    },
    originalPurchaseChannel: String,
    returnReasonCategory: String,
    customerSatisfaction: {
      type: Number,
      min: 1,
      max: 5
    },
    followUpRequired: {
      type: Boolean,
      default: false
    },
    followUpDate: Date,
    escalationLevel: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
returnSchema.index({ returnNumber: 1 });
returnSchema.index({ originalOrder: 1 });
returnSchema.index({ customer: 1 });
returnSchema.index({ status: 1 });
returnSchema.index({ returnDate: -1 });
returnSchema.index({ requestedBy: 1 });
returnSchema.index({ 'items.product': 1 });

// Virtual for return age in days
returnSchema.virtual('ageInDays').get(function() {
  return Math.floor((Date.now() - this.returnDate) / (1000 * 60 * 60 * 24));
});

// Virtual for is overdue
returnSchema.virtual('isOverdue').get(function() {
  if (!this.expectedReceiveDate) return false;
  return new Date() > this.expectedReceiveDate && !['completed', 'cancelled'].includes(this.status);
});

// Virtual for can be approved
returnSchema.virtual('canBeApproved').get(function() {
  return this.status === 'pending';
});

// Virtual for can be processed
returnSchema.virtual('canBeProcessed').get(function() {
  return ['approved', 'received'].includes(this.status);
});

// Pre-save middleware to generate return number
returnSchema.pre('save', async function(next) {
  if (!this.returnNumber) {
    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: 'returnNumber' },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      this.returnNumber = `RET-${String(counter.seq).padStart(6, '0')}`;
    } catch (err) {
      return next(err);
    }
  }
  
  // Calculate totals
  this.totalRefundAmount = this.items.reduce((sum, item) => sum + (item.refundAmount || 0), 0);
  this.totalRestockingFee = this.items.reduce((sum, item) => sum + (item.restockingFee || 0), 0);
  this.netRefundAmount = this.totalRefundAmount - this.totalRestockingFee;
  
  next();
});

// Static method to get return statistics
returnSchema.statics.getReturnStats = async function(period = {}) {
  const match = {};
  
  if (period.startDate && period.endDate) {
    match.returnDate = {
      $gte: period.startDate,
      $lte: period.endDate
    };
  }
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalReturns: { $sum: 1 },
        totalRefundAmount: { $sum: '$netRefundAmount' },
        averageRefundAmount: { $avg: '$netRefundAmount' },
        byStatus: {
          $push: '$status'
        },
        byType: {
          $push: '$returnType'
        }
      }
    },
    {
      $project: {
        totalReturns: 1,
        totalRefundAmount: 1,
        averageRefundAmount: { $round: ['$averageRefundAmount', 2] },
        statusBreakdown: {
          $reduce: {
            input: '$byStatus',
            initialValue: {},
            in: {
              $mergeObjects: [
                '$$value',
                {
                  $let: {
                    vars: { status: '$$this' },
                    in: { $arrayToObject: [{ k: '$$status', v: { $add: [{ $ifNull: [{ $getField: { field: '$$status', input: '$$value' } }, 0] }, 1] } }] }
                  }
                }
              ]
            }
          }
        },
        typeBreakdown: {
          $reduce: {
            input: '$byType',
            initialValue: {},
            in: {
              $mergeObjects: [
                '$$value',
                {
                  $let: {
                    vars: { type: '$$this' },
                    in: { $arrayToObject: [{ k: '$$type', v: { $add: [{ $ifNull: [{ $getField: { field: '$$type', input: '$$value' } }, 0] }, 1] } }] }
                  }
                }
              ]
            }
          }
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalReturns: 0,
    totalRefundAmount: 0,
    averageRefundAmount: 0,
    statusBreakdown: {},
    typeBreakdown: {}
  };
};

// Method to add communication log
returnSchema.methods.addCommunication = function(type, message, sentBy, recipient = null) {
  this.communication.push({
    type,
    message,
    sentBy,
    recipient,
    sentAt: new Date()
  });
  return this.save();
};

// Method to add note
returnSchema.methods.addNote = function(note, addedBy, isInternal = false) {
  this.notes.push({
    note,
    addedBy,
    isInternal,
    addedAt: new Date()
  });
  return this.save();
};

// Method to update status with audit trail
returnSchema.methods.updateStatus = function(newStatus, updatedBy, notes = null) {
  const oldStatus = this.status;
  this.status = newStatus;
  
  // Set relevant dates
  const now = new Date();
  switch (newStatus) {
    case 'approved':
      this.approvalDate = now;
      this.approvedBy = updatedBy;
      break;
    case 'processing':
      this.processingDate = now;
      this.processedBy = updatedBy;
      break;
    case 'received':
      this.receivedDate = now;
      this.receivedBy = updatedBy;
      break;
    case 'completed':
      this.completionDate = now;
      break;
  }
  
  // Add note about status change
  if (notes) {
    this.addNote(`Status changed from ${oldStatus} to ${newStatus}. ${notes}`, updatedBy, true);
  }
  
  return this.save();
};

module.exports = mongoose.model('Return', returnSchema);
