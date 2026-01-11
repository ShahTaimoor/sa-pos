/**
 * Inventory Model - Enhanced Costing
 * 
 * Adds LIFO batch tracking
 */

// Add to Inventory schema

// Enhance cost schema
const costSchema = {
  average: {
    type: Number,
    min: 0,
    default: 0
  },
  lastPurchase: {
    type: Number,
    min: 0,
    default: 0
  },
  fifo: [{
    quantity: {
      type: Number,
      required: true,
      min: 0
    },
    cost: {
      type: Number,
      required: true,
      min: 0
    },
    date: {
      type: Date,
      required: true,
      default: Date.now
    },
    purchaseOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder'
    },
    batchNumber: {
      type: String,
      trim: true
    }
  }],
  lifo: [{
    quantity: {
      type: Number,
      required: true,
      min: 0
    },
    cost: {
      type: Number,
      required: true,
      min: 0
    },
    date: {
      type: Date,
      required: true,
      default: Date.now
    },
    purchaseOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder'
    },
    batchNumber: {
      type: String,
      trim: true
    }
  }]
};

// Update inventorySchema.cost
// (This would be done in the main Inventory.js file)

// METHOD: Add FIFO batch
inventorySchema.methods.addFIFOBatch = function(quantity, cost, date = new Date(), purchaseOrderId = null, batchNumber = null) {
  if (!this.cost) {
    this.cost = {};
  }
  if (!this.cost.fifo) {
    this.cost.fifo = [];
  }
  
  this.cost.fifo.push({
    quantity: quantity,
    cost: cost,
    date: date,
    purchaseOrder: purchaseOrderId,
    batchNumber: batchNumber
  });
  
  return this;
};

// METHOD: Add LIFO batch
inventorySchema.methods.addLIFOBatch = function(quantity, cost, date = new Date(), purchaseOrderId = null, batchNumber = null) {
  if (!this.cost) {
    this.cost = {};
  }
  if (!this.cost.lifo) {
    this.cost.lifo = [];
  }
  
  this.cost.lifo.push({
    quantity: quantity,
    cost: cost,
    date: date,
    purchaseOrder: purchaseOrderId,
    batchNumber: batchNumber
  });
  
  return this;
};

// METHOD: Consume FIFO batches
inventorySchema.methods.consumeFIFOBatches = function(quantity) {
  if (!this.cost?.fifo) {
    throw new Error('FIFO batches not available');
  }
  
  const batches = this.cost.fifo
    .filter(b => b.quantity > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  let remainingQty = quantity;
  let totalCost = 0;
  const consumedBatches = [];
  
  for (const batch of batches) {
    if (remainingQty <= 0) break;
    
    const qtyToConsume = Math.min(remainingQty, batch.quantity);
    totalCost += qtyToConsume * batch.cost;
    batch.quantity -= qtyToConsume;
    remainingQty -= qtyToConsume;
    
    consumedBatches.push({
      batchId: batch._id,
      quantity: qtyToConsume,
      unitCost: batch.cost,
      date: batch.date
    });
  }
  
  // Remove empty batches
  this.cost.fifo = this.cost.fifo.filter(b => b.quantity > 0);
  
  return {
    totalCost,
    batches: consumedBatches,
    remainingQty
  };
};

// METHOD: Consume LIFO batches
inventorySchema.methods.consumeLIFOBatches = function(quantity) {
  if (!this.cost?.lifo) {
    throw new Error('LIFO batches not available');
  }
  
  const batches = this.cost.lifo
    .filter(b => b.quantity > 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  
  let remainingQty = quantity;
  let totalCost = 0;
  const consumedBatches = [];
  
  for (const batch of batches) {
    if (remainingQty <= 0) break;
    
    const qtyToConsume = Math.min(remainingQty, batch.quantity);
    totalCost += qtyToConsume * batch.cost;
    batch.quantity -= qtyToConsume;
    remainingQty -= qtyToConsume;
    
    consumedBatches.push({
      batchId: batch._id,
      quantity: qtyToConsume,
      unitCost: batch.cost,
      date: batch.date
    });
  }
  
  // Remove empty batches
  this.cost.lifo = this.cost.lifo.filter(b => b.quantity > 0);
  
  return {
    totalCost,
    batches: consumedBatches,
    remainingQty
  };
};

