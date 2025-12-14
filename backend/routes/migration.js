const express = require('express');
const Sales = require('../models/Sales');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/migration/update-invoice-prefix
// @desc    Update existing ORD- invoices to SI- format
// @access  Private
router.post('/update-invoice-prefix', auth, async (req, res) => {
  try {
    console.log('Starting invoice prefix update...');
    
    // Find all orders with ORD- prefix
    const ordersToUpdate = await Sales.find({
      orderNumber: { $regex: '^ORD-' }
    });
    
    console.log(`Found ${ordersToUpdate.length} orders to update`);
    
    if (ordersToUpdate.length === 0) {
      return res.json({
        success: true,
        message: 'No orders found with ORD- prefix. Nothing to update.',
        updated: 0,
        total: 0
      });
    }
    
    // Update each order
    let updatedCount = 0;
    let skippedCount = 0;
    const updates = [];
    
    for (const order of ordersToUpdate) {
      const oldOrderNumber = order.orderNumber;
      const newOrderNumber = order.orderNumber.replace('ORD-', 'SI-');
      
      // Check if the new order number already exists
      const existingOrder = await Sales.findOne({ orderNumber: newOrderNumber });
      if (existingOrder) {
        console.log(`Warning: Order number ${newOrderNumber} already exists. Skipping ${oldOrderNumber}`);
        updates.push({
          oldNumber: oldOrderNumber,
          newNumber: newOrderNumber,
          status: 'skipped',
          reason: 'Order number already exists'
        });
        skippedCount++;
        continue;
      }
      
      // Update the order number
      await Sales.findByIdAndUpdate(order._id, {
        orderNumber: newOrderNumber
      });
      
      console.log(`Updated: ${oldOrderNumber} → ${newOrderNumber}`);
      updates.push({
        oldNumber: oldOrderNumber,
        newNumber: newOrderNumber,
        status: 'updated'
      });
      updatedCount++;
    }
    
    res.json({
      success: true,
      message: `Update completed! Updated ${updatedCount} out of ${ordersToUpdate.length} orders.`,
      updated: updatedCount,
      skipped: skippedCount,
      total: ordersToUpdate.length,
      updates: updates
    });
    
  } catch (error) {
    console.error('Error updating invoice prefixes:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating invoice prefixes',
      error: error.message
    });
  }
});

module.exports = router;
