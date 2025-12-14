const mongoose = require('mongoose');
const Sales = require('../models/Sales');

// Connect to MongoDB
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('❌ Error: MONGODB_URI environment variable is required.');
      console.error('   Please set it in your .env file or as an environment variable.');
      process.exit(1);
    }
    await mongoose.connect(
      process.env.MONGODB_URI,
      {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      }
    );
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Update invoice prefixes from ORD- to SI-
const updateInvoicePrefixes = async () => {
  try {
    console.log('Starting invoice prefix update...');
    
    // Find all orders with ORD- prefix
    const ordersToUpdate = await Sales.find({
      orderNumber: { $regex: '^ORD-' }
    });
    
    console.log(`Found ${ordersToUpdate.length} orders to update`);
    
    if (ordersToUpdate.length === 0) {
      console.log('No orders found with ORD- prefix. Nothing to update.');
      return;
    }
    
    // Update each order
    let updatedCount = 0;
    for (const order of ordersToUpdate) {
      const oldOrderNumber = order.orderNumber;
      const newOrderNumber = order.orderNumber.replace('ORD-', 'SI-');
      
      // Check if the new order number already exists
      const existingOrder = await Sales.findOne({ orderNumber: newOrderNumber });
      if (existingOrder) {
        console.log(`Warning: Order number ${newOrderNumber} already exists. Skipping ${oldOrderNumber}`);
        continue;
      }
      
      // Update the order number
      await Sales.findByIdAndUpdate(order._id, {
        orderNumber: newOrderNumber
      });
      
      console.log(`Updated: ${oldOrderNumber} → ${newOrderNumber}`);
      updatedCount++;
    }
    
    console.log(`\nUpdate completed! Updated ${updatedCount} out of ${ordersToUpdate.length} orders.`);
    
  } catch (error) {
    console.error('Error updating invoice prefixes:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await updateInvoicePrefixes();
  await mongoose.connection.close();
  console.log('Database connection closed.');
  process.exit(0);
};

// Run the script
if (require.main === module) {
  main();
}

module.exports = { updateInvoicePrefixes };
