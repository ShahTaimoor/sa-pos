const express = require('express');
const { body, validationResult, query } = require('express-validator');
const PurchaseOrder = require('../models/PurchaseOrder');
const { auth, requirePermission } = require('../middleware/auth');
const inventoryService = require('../services/inventoryService');

const router = express.Router();

// @route   GET /api/purchase-orders
// @desc    Get all purchase orders with filtering and pagination
// @access  Private
router.get('/', [
  auth,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('status').optional().isIn(['draft', 'confirmed', 'partially_received', 'fully_received', 'cancelled', 'closed']),
  query('supplier').optional().isMongoId(),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    
    if (req.query.search) {
      filter.$or = [
        { poNumber: { $regex: req.query.search, $options: 'i' } },
        { notes: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    if (req.query.supplier) {
      filter.supplier = req.query.supplier;
    }
    
    // Date filtering
    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) {
        // Set to start of day (00:00:00) in local timezone
        const dateFrom = new Date(req.query.dateFrom);
        dateFrom.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = dateFrom;
      }
      if (req.query.dateTo) {
        // Set to end of day (23:59:59.999) - add 1 day and use $lt to include entire toDate
        const dateTo = new Date(req.query.dateTo);
        dateTo.setDate(dateTo.getDate() + 1);
        dateTo.setHours(0, 0, 0, 0);
        filter.createdAt.$lt = dateTo;
      }
    }
    
    const purchaseOrders = await PurchaseOrder.find(filter)
      .populate('supplier', 'companyName contactPerson email phone businessType currentBalance pendingBalance')
      .populate('items.product', 'name description pricing inventory')
      .populate('createdBy', 'firstName lastName email')
      .populate('lastModifiedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await PurchaseOrder.countDocuments(filter);
    
    res.json({
      purchaseOrders,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get purchase orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/purchase-orders/:id
// @desc    Get single purchase order
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id)
      .populate('supplier', 'companyName contactPerson email phone businessType paymentTerms currentBalance pendingBalance')
      .populate('items.product', 'name description pricing inventory')
      .populate('createdBy', 'firstName lastName email')
      .populate('lastModifiedBy', 'firstName lastName email')
      .populate('conversions.convertedBy', 'firstName lastName email');
    
    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    
    res.json({ purchaseOrder });
  } catch (error) {
    console.error('Get purchase order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/purchase-orders
// @desc    Create new purchase order
// @access  Private
router.post('/', [
  auth,
  requirePermission('create_purchase_orders'),
  body('supplier').isMongoId().withMessage('Valid supplier is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').isMongoId().withMessage('Valid product is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.costPerUnit').isFloat({ min: 0 }).withMessage('Cost per unit must be positive'),
  body('expectedDelivery').optional().isISO8601().withMessage('Valid delivery date required'),
  body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes too long'),
  body('isTaxExempt').optional().isBoolean().withMessage('Tax exempt must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const poData = {
      ...req.body,
      poNumber: PurchaseOrder.generatePONumber(),
      createdBy: req.user._id
    };
    
    const purchaseOrder = new PurchaseOrder(poData);
    await purchaseOrder.save();
    
    // Update supplier pending balance for unpaid purchase orders
    // Note: pricing is calculated in the pre-save hook, so we use the saved purchaseOrder.total
    if (purchaseOrder.supplier && purchaseOrder.total > 0) {
      try {
        const Supplier = require('../models/Supplier');
        const supplierExists = await Supplier.findById(purchaseOrder.supplier);
        if (supplierExists) {
          // For purchase orders, we add to pending balance (money we owe to supplier)
          const updateResult = await Supplier.findByIdAndUpdate(
            purchaseOrder.supplier,
            { $inc: { pendingBalance: purchaseOrder.total } },
            { new: true }
          );
          console.log(`Updated supplier ${purchaseOrder.supplier} pending balance by ${purchaseOrder.total}. New balance: ${updateResult.pendingBalance}`);
        } else {
          console.log(`Supplier ${purchaseOrder.supplier} not found, skipping pending balance update`);
        }
      } catch (error) {
        console.error('Error updating supplier pending balance:', error);
        // Don't fail the purchase order creation if supplier update fails
      }
    }
    
    await purchaseOrder.populate([
      { path: 'supplier', select: 'companyName contactPerson email phone businessType' },
      { path: 'items.product', select: 'name description pricing inventory' },
      { path: 'createdBy', select: 'firstName lastName email' }
    ]);
    
    res.status(201).json({
      message: 'Purchase order created successfully',
      purchaseOrder
    });
  } catch (error) {
    console.error('Create purchase order error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      message: 'Server error. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/purchase-orders/:id
// @desc    Update purchase order
// @access  Private
router.put('/:id', [
  auth,
  requirePermission('edit_purchase_orders'),
  body('supplier').optional().isMongoId().withMessage('Valid supplier is required'),
  body('items').optional().isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').optional().isMongoId().withMessage('Valid product is required'),
  body('items.*.quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.costPerUnit').optional().isFloat({ min: 0 }).withMessage('Cost per unit must be positive'),
  body('expectedDelivery').optional().isISO8601().withMessage('Valid delivery date required'),
  body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes too long'),
  body('terms').optional().trim().isLength({ max: 1000 }).withMessage('Terms too long'),
  body('isTaxExempt').optional().isBoolean().withMessage('Tax exempt must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const purchaseOrder = await PurchaseOrder.findById(req.params.id);
    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    
    // Don't allow editing if already confirmed or received
    if (['confirmed', 'partially_received', 'fully_received'].includes(purchaseOrder.status)) {
      return res.status(400).json({ 
        message: 'Cannot edit purchase order that has been confirmed or received' 
      });
    }
    
    // Store old items and old total for comparison
    const oldItems = JSON.parse(JSON.stringify(purchaseOrder.items));
    const oldTotal = purchaseOrder.total;
    const oldSupplier = purchaseOrder.supplier;
    
    const updateData = {
      ...req.body,
      lastModifiedBy: req.user._id
    };
    
    const updatedPO = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    // Note: PurchaseOrder model has a pre-save hook that recalculates total
    // We need to reload to get the updated total
    await updatedPO.populate([
      { path: 'supplier', select: 'companyName contactPerson email phone businessType' },
      { path: 'items.product', select: 'name description pricing inventory' },
      { path: 'createdBy', select: 'firstName lastName email' },
      { path: 'lastModifiedBy', select: 'firstName lastName email' }
    ]);
    
    // Adjust inventory if order was confirmed and items changed
    if (purchaseOrder.status === 'confirmed' && req.body.items && req.body.items.length > 0) {
      try {
        const inventoryService = require('../services/inventoryService');
        
        for (const newItem of req.body.items) {
          const oldItem = oldItems.find(oi => {
            const oldProductId = oi.product?._id ? oi.product._id.toString() : oi.product?.toString() || oi.product;
            const newProductId = newItem.product?.toString() || newItem.product;
            return oldProductId === newProductId;
          });
          const oldQuantity = oldItem ? oldItem.quantity : 0;
          const quantityChange = newItem.quantity - oldQuantity;
          
          if (quantityChange !== 0) {
            if (quantityChange > 0) {
              // Quantity increased - add more inventory
              await inventoryService.updateStock({
                productId: newItem.product,
                type: 'in',
                quantity: quantityChange,
                reason: 'Purchase Order Update - Quantity Increased',
                reference: 'Purchase Order',
                referenceId: updatedPO._id,
                referenceModel: 'PurchaseOrder',
                performedBy: req.user._id,
                notes: `Inventory increased due to purchase order ${updatedPO.poNumber} update - quantity increased by ${quantityChange}`
              });
            } else {
              // Quantity decreased - reduce inventory
              await inventoryService.updateStock({
                productId: newItem.product,
                type: 'out',
                quantity: Math.abs(quantityChange),
                reason: 'Purchase Order Update - Quantity Decreased',
                reference: 'Purchase Order',
                referenceId: updatedPO._id,
                referenceModel: 'PurchaseOrder',
                performedBy: req.user._id,
                notes: `Inventory reduced due to purchase order ${updatedPO.poNumber} update - quantity decreased by ${Math.abs(quantityChange)}`
              });
            }
          }
        }
        
        // Handle removed items (items that were in old but not in new)
        for (const oldItem of oldItems) {
          const oldProductId = oldItem.product?._id ? oldItem.product._id.toString() : oldItem.product?.toString() || oldItem.product;
          const stillExists = req.body.items.find(newItem => {
            const newProductId = newItem.product?.toString() || newItem.product;
            return oldProductId === newProductId;
          });
          
          if (!stillExists) {
            // Item was removed - reduce inventory
            await inventoryService.updateStock({
              productId: oldItem.product?._id || oldItem.product,
              type: 'out',
              quantity: oldItem.quantity,
              reason: 'Purchase Order Update - Item Removed',
              reference: 'Purchase Order',
              referenceId: updatedPO._id,
              referenceModel: 'PurchaseOrder',
              performedBy: req.user._id,
              notes: `Inventory reduced due to purchase order ${updatedPO.poNumber} update - item removed`
            });
          }
        }
      } catch (error) {
        console.error('Error adjusting inventory on purchase order update:', error);
        // Don't fail update if inventory adjustment fails
      }
    }
    
    // Adjust supplier balance if total changed or supplier changed
    // Note: Purchase orders can only be edited if status is 'draft', so balance is always in pendingBalance
    if (updatedPO.supplier && (updatedPO.total !== oldTotal || oldSupplier?.toString() !== updatedPO.supplier?.toString())) {
      try {
        const Supplier = require('../models/Supplier');
        const supplier = await Supplier.findById(updatedPO.supplier);
        
        if (supplier) {
          // Calculate difference (only draft orders can be edited, so balance is in pendingBalance)
          const totalDifference = updatedPO.total - oldTotal;
          
          if (totalDifference !== 0) {
            const updateResult = await Supplier.findByIdAndUpdate(
              updatedPO.supplier,
              { $inc: { pendingBalance: totalDifference } },
              { new: true }
            );
            console.log(`Adjusted supplier ${updatedPO.supplier} balance by ${totalDifference}`);
            console.log(`- Old total: ${oldTotal}, New total: ${updatedPO.total}`);
            console.log(`- New pendingBalance: ${updateResult.pendingBalance}`);
          }
          
          // If supplier changed, remove balance from old supplier
          if (oldSupplier && oldSupplier.toString() !== updatedPO.supplier.toString()) {
            await Supplier.findByIdAndUpdate(
              oldSupplier,
              { $inc: { pendingBalance: -oldTotal } },
              { new: true }
            );
            console.log(`Removed ${oldTotal} from old supplier ${oldSupplier} balance`);
          }
        }
      } catch (error) {
        console.error('Error adjusting supplier balance on purchase order update:', error);
        // Don't fail update if balance adjustment fails
      }
    }
    
    res.json({
      message: 'Purchase order updated successfully',
      purchaseOrder: updatedPO
    });
  } catch (error) {
    console.error('Update purchase order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/purchase-orders/:id/confirm
// @desc    Confirm purchase order and update inventory
// @access  Private
router.put('/:id/confirm', [
  auth,
  requirePermission('confirm_purchase_orders')
], async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id);
    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    
    if (purchaseOrder.status !== 'draft') {
      return res.status(400).json({ 
        message: 'Only draft purchase orders can be confirmed' 
      });
    }
    
    // Update inventory for each item in the purchase order
    const inventoryUpdates = [];
    for (const item of purchaseOrder.items) {
      try {
        const inventoryUpdate = await inventoryService.updateStock({
          productId: item.product,
          type: 'in',
          quantity: item.quantity,
          reason: 'Purchase Order Confirmation',
          reference: 'Purchase Order',
          referenceId: purchaseOrder._id,
          referenceModel: 'PurchaseOrder',
          performedBy: req.user._id,
          notes: `Stock increased due to purchase order confirmation - PO: ${purchaseOrder.poNumber}`
        });
        
        inventoryUpdates.push({
          productId: item.product,
          quantity: item.quantity,
          newStock: inventoryUpdate.currentStock,
          success: true
        });
        
        console.log(`Stock updated for product ${item.product}: +${item.quantity}, new stock: ${inventoryUpdate.currentStock}`);
      } catch (inventoryError) {
        console.error(`Failed to update inventory for product ${item.product}:`, inventoryError.message);
        inventoryUpdates.push({
          productId: item.product,
          quantity: item.quantity,
          success: false,
          error: inventoryError.message
        });
        
        // If inventory update fails, return error but don't rollback (since this is stock increase)
        return res.status(400).json({
          message: `Failed to update inventory for product ${item.product}. Cannot confirm purchase order.`,
          details: inventoryError.message,
          inventoryUpdates: inventoryUpdates
        });
      }
    }
    
    // Update supplier balance: move from pendingBalance to currentBalance
    if (purchaseOrder.supplier && purchaseOrder.pricing && purchaseOrder.pricing.total > 0) {
      try {
        const Supplier = require('../models/Supplier');
        const supplierExists = await Supplier.findById(purchaseOrder.supplier);
        if (supplierExists) {
          // Move amount from pendingBalance to currentBalance (outstanding amount we owe to supplier)
          const updateResult = await Supplier.findByIdAndUpdate(
            purchaseOrder.supplier,
            { 
              $inc: { 
                pendingBalance: -purchaseOrder.pricing.total,  // Remove from pending
                currentBalance: purchaseOrder.pricing.total    // Add to current (outstanding)
              }
            },
            { new: true }
          );
          console.log(`Updated supplier ${purchaseOrder.supplier} balance after PO confirmation:`);
          console.log(`- Moved ${purchaseOrder.pricing.total} from pendingBalance to currentBalance (outstanding)`);
          console.log(`- New pendingBalance: ${updateResult.pendingBalance}`);
          console.log(`- New currentBalance: ${updateResult.currentBalance}`);
        } else {
          console.log(`Supplier ${purchaseOrder.supplier} not found, skipping balance update`);
        }
      } catch (error) {
        console.error('Error updating supplier balance on PO confirmation:', error);
        // Don't fail the confirmation if supplier update fails
      }
    }

    // Update purchase order status only after successful inventory updates
    purchaseOrder.status = 'confirmed';
    purchaseOrder.confirmedDate = new Date();
    purchaseOrder.lastModifiedBy = req.user._id;
    
    await purchaseOrder.save();
    
    // Create accounting entries for confirmed purchase order
    try {
      const AccountingService = require('../services/accountingService');
      await AccountingService.recordPurchase(purchaseOrder);
      console.log(`Created accounting entries for purchase order ${purchaseOrder.poNumber}`);
    } catch (error) {
      console.error('Error creating accounting entries for purchase order:', error);
      // Don't fail the confirmation if accounting fails
    }
    
    await purchaseOrder.populate([
      { path: 'supplier', select: 'companyName contactPerson email phone businessType' },
      { path: 'items.product', select: 'name description pricing inventory' },
      { path: 'createdBy', select: 'firstName lastName email' },
      { path: 'lastModifiedBy', select: 'firstName lastName email' }
    ]);
    
    res.json({
      message: 'Purchase order confirmed successfully and inventory updated',
      purchaseOrder,
      inventoryUpdates: inventoryUpdates
    });
  } catch (error) {
    console.error('Confirm purchase order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/purchase-orders/:id/cancel
// @desc    Cancel purchase order and reduce inventory if previously confirmed
// @access  Private
router.put('/:id/cancel', [
  auth,
  requirePermission('cancel_purchase_orders')
], async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id);
    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    
    if (['fully_received', 'cancelled', 'closed'].includes(purchaseOrder.status)) {
      return res.status(400).json({ 
        message: 'Cannot cancel purchase order in current status' 
      });
    }
    
    // If the purchase order was confirmed, reduce inventory and reverse supplier balance
    const inventoryUpdates = [];
    if (purchaseOrder.status === 'confirmed') {
      for (const item of purchaseOrder.items) {
        try {
          const inventoryUpdate = await inventoryService.updateStock({
            productId: item.product,
            type: 'out',
            quantity: item.quantity,
            reason: 'Purchase Order Cancellation',
            reference: 'Purchase Order',
            referenceId: purchaseOrder._id,
            referenceModel: 'PurchaseOrder',
            performedBy: req.user._id,
            notes: `Stock reduced due to purchase order cancellation - PO: ${purchaseOrder.poNumber}`
          });
          
          inventoryUpdates.push({
            productId: item.product,
            quantity: item.quantity,
            newStock: inventoryUpdate.currentStock,
            success: true
          });
          
          console.log(`Stock reduced for product ${item.product}: -${item.quantity}, new stock: ${inventoryUpdate.currentStock}`);
        } catch (inventoryError) {
          console.error(`Failed to reduce inventory for product ${item.product}:`, inventoryError.message);
          inventoryUpdates.push({
            productId: item.product,
            quantity: item.quantity,
            success: false,
            error: inventoryError.message
          });
          
          // If inventory update fails, check if it's due to insufficient stock
          if (inventoryError.message.includes('Insufficient stock')) {
            return res.status(400).json({
              message: `Insufficient stock to cancel purchase order for product ${item.product}. Stock may have been used in other transactions.`,
              details: inventoryError.message,
              inventoryUpdates: inventoryUpdates
            });
          }
          
          // Continue with cancellation for other errors
          console.warn(`Continuing with purchase order cancellation despite inventory reduction failure for product ${item.product}`);
        }
      }
      
      // Reverse supplier balance: move from currentBalance back to pendingBalance
      if (purchaseOrder.supplier && purchaseOrder.pricing && purchaseOrder.pricing.total > 0) {
        try {
          const Supplier = require('../models/Supplier');
          const supplierExists = await Supplier.findById(purchaseOrder.supplier);
          if (supplierExists) {
            // Move amount from currentBalance back to pendingBalance (reverse the confirmation)
            const updateResult = await Supplier.findByIdAndUpdate(
              purchaseOrder.supplier,
              { 
                $inc: { 
                  pendingBalance: purchaseOrder.pricing.total,  // Add back to pending
                  currentBalance: -purchaseOrder.pricing.total  // Remove from current
                }
              },
              { new: true }
            );
            console.log(`Reversed supplier ${purchaseOrder.supplier} balance after PO cancellation:`);
            console.log(`- Moved ${purchaseOrder.pricing.total} from currentBalance back to pendingBalance`);
            console.log(`- New pendingBalance: ${updateResult.pendingBalance}`);
            console.log(`- New currentBalance: ${updateResult.currentBalance}`);
          } else {
            console.log(`Supplier ${purchaseOrder.supplier} not found, skipping balance reversal`);
          }
        } catch (error) {
          console.error('Error reversing supplier balance on PO cancellation:', error);
          // Don't fail the cancellation if supplier update fails
        }
      }
    }
    
    purchaseOrder.status = 'cancelled';
    purchaseOrder.lastModifiedBy = req.user._id;
    
    await purchaseOrder.save();
    
    res.json({
      message: purchaseOrder.status === 'confirmed' 
        ? 'Purchase order cancelled successfully and inventory reduced'
        : 'Purchase order cancelled successfully',
      purchaseOrder,
      inventoryUpdates: inventoryUpdates.length > 0 ? inventoryUpdates : undefined
    });
  } catch (error) {
    console.error('Cancel purchase order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/purchase-orders/:id/close
// @desc    Close purchase order
// @access  Private
router.put('/:id/close', [
  auth,
  requirePermission('close_purchase_orders')
], async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id);
    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    
    if (purchaseOrder.status === 'fully_received') {
      purchaseOrder.status = 'closed';
      purchaseOrder.lastModifiedBy = req.user._id;
      
      await purchaseOrder.save();
      
      res.json({
        message: 'Purchase order closed successfully',
        purchaseOrder
      });
    } else {
      return res.status(400).json({ 
        message: 'Only fully received purchase orders can be closed' 
      });
    }
  } catch (error) {
    console.error('Close purchase order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/purchase-orders/:id
// @desc    Delete purchase order
// @access  Private
router.delete('/:id', [
  auth,
  requirePermission('delete_purchase_orders')
], async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id);
    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    
    // Only allow deletion of draft orders
    if (purchaseOrder.status !== 'draft') {
      return res.status(400).json({ 
        message: 'Only draft purchase orders can be deleted' 
      });
    }
    
    // Clean up supplier pending balance for draft purchase orders
    // Note: purchaseOrder.total is used (not pricing.total) - see line 130 for creation logic
    if (purchaseOrder.supplier && purchaseOrder.total > 0) {
      try {
        const Supplier = require('../models/Supplier');
        const supplierExists = await Supplier.findById(purchaseOrder.supplier);
        if (supplierExists) {
          // Remove from pending balance since we're deleting the draft PO
          // This reverses the balance addition made during PO creation (line 138)
          const updateResult = await Supplier.findByIdAndUpdate(
            purchaseOrder.supplier,
            { $inc: { pendingBalance: -purchaseOrder.total } },
            { new: true }
          );
          console.log(`Cleaned up supplier ${purchaseOrder.supplier} pending balance after PO deletion:`);
          console.log(`- Removed ${purchaseOrder.total} from pendingBalance`);
          console.log(`- New pendingBalance: ${updateResult.pendingBalance}`);
        } else {
          console.log(`Supplier ${purchaseOrder.supplier} not found, skipping balance cleanup`);
        }
      } catch (error) {
        console.error('Error cleaning up supplier pending balance on PO deletion:', error);
        // Don't fail the deletion if supplier update fails
      }
    }
    
    // Restore inventory if PO was confirmed (but we only allow deletion of draft orders, so this shouldn't run)
    // Keeping this for safety in case the status check is bypassed
    if (purchaseOrder.status === 'confirmed') {
      try {
        const inventoryService = require('../services/inventoryService');
        for (const item of purchaseOrder.items) {
          try {
            await inventoryService.updateStock({
              productId: item.product,
              type: 'out',
              quantity: item.quantity,
              reason: 'Purchase Order Deletion',
              reference: 'Purchase Order',
              referenceId: purchaseOrder._id,
              referenceModel: 'PurchaseOrder',
              performedBy: req.user._id,
              notes: `Inventory rolled back due to deletion of purchase order ${purchaseOrder.poNumber}`
            });
            console.log(`Restored ${item.quantity} units of product ${item.product} to inventory`);
          } catch (error) {
            console.error(`Failed to restore inventory for product ${item.product}:`, error);
          }
        }
      } catch (error) {
        console.error('Error restoring inventory on purchase order deletion:', error);
        // Don't fail deletion if inventory update fails
      }
    }
    
    await PurchaseOrder.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Purchase order deleted successfully' });
  } catch (error) {
    console.error('Delete purchase order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/purchase-orders/:id/convert
// @desc    Get purchase order items available for conversion
// @access  Private
router.get('/:id/convert', auth, async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id)
      .populate('items.product', 'name description pricing inventory')
      .populate('supplier', 'companyName contactPerson email phone businessType');
    
    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    
    // Filter items that have remaining quantities
    const availableItems = purchaseOrder.items.filter(item => item.remainingQuantity > 0);
    
    res.json({
      purchaseOrder: {
        _id: purchaseOrder._id,
        poNumber: purchaseOrder.poNumber,
        supplier: purchaseOrder.supplier,
        status: purchaseOrder.status
      },
      availableItems
    });
  } catch (error) {
    console.error('Get conversion data error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/purchase-orders/:id/convert
// @desc    Convert purchase order to actual purchase (update inventory)
// @access  Private
router.post('/:id/convert', [
  auth,
  requirePermission('manage_inventory'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').isMongoId().withMessage('Valid product is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.costPerUnit').isFloat({ min: 0 }).withMessage('Cost per unit must be positive')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const purchaseOrder = await PurchaseOrder.findById(req.params.id);
    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    if (purchaseOrder.status === 'cancelled' || purchaseOrder.status === 'closed') {
      return res.status(400).json({ message: 'Cannot convert cancelled or closed purchase order' });
    }

    const Inventory = require('../models/Inventory');
    const { items } = req.body;
    const conversionResults = [];

    // Process each item
    for (const item of items) {
      try {
        // Update inventory stock
        await Inventory.updateStock(
          item.product,
          item.quantity,
          'in', // Stock in
          req.user._id,
          `Purchase from PO: ${purchaseOrder.poNumber}`,
          {
            costPerUnit: item.costPerUnit,
            purchaseOrder: purchaseOrder._id
          }
        );

        // Update purchase order item received quantity
        const poItem = purchaseOrder.items.find(poItem => 
          poItem.product.toString() === item.product
        );
        
        if (poItem) {
          poItem.receivedQuantity += item.quantity;
          poItem.remainingQuantity = Math.max(0, poItem.quantity - poItem.receivedQuantity);
        }

        conversionResults.push({
          product: item.product,
          quantity: item.quantity,
          costPerUnit: item.costPerUnit,
          status: 'success'
        });

      } catch (itemError) {
        console.error(`Error processing item ${item.product}:`, itemError);
        conversionResults.push({
          product: item.product,
          quantity: item.quantity,
          costPerUnit: item.costPerUnit,
          status: 'error',
          error: itemError.message
        });
      }
    }

    // Update purchase order status
    const allItemsReceived = purchaseOrder.items.every(item => item.remainingQuantity === 0);
    if (allItemsReceived) {
      purchaseOrder.status = 'fully_received';
      purchaseOrder.lastReceivedDate = new Date();
    } else {
      purchaseOrder.status = 'partially_received';
      purchaseOrder.lastReceivedDate = new Date();
    }

    // Add conversion record
    purchaseOrder.conversions = purchaseOrder.conversions || [];
    purchaseOrder.conversions.push({
      convertedBy: req.user._id,
      convertedAt: new Date(),
      items: conversionResults,
      notes: req.body.notes || `Converted ${items.length} items to purchase`
    });

    await purchaseOrder.save();

    res.json({
      message: 'Purchase order converted successfully',
      conversionResults,
      purchaseOrder: {
        _id: purchaseOrder._id,
        poNumber: purchaseOrder.poNumber,
        status: purchaseOrder.status
      }
    });

  } catch (error) {
    console.error('Convert purchase order error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      message: 'Server error. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
