const mongoose = require('mongoose');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');

// Load environment variables
require('dotenv').config();

// Connect to MongoDB
if (!process.env.MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required.');
  console.error('   Please set it in your .env file or as an environment variable.');
  process.exit(1);
}
mongoose.connect(process.env.MONGODB_URI);

async function createMissingInventoryRecords() {
  try {
    console.log('Starting inventory record creation for existing products...');
    
    // Get all products
    const products = await Product.find({});
    console.log(`Found ${products.length} products`);
    
    let createdCount = 0;
    let skippedCount = 0;
    
    for (const product of products) {
      // Check if inventory record already exists
      const existingInventory = await Inventory.findOne({ product: product._id });
      
      if (existingInventory) {
        console.log(`Inventory record already exists for product: ${product.name}`);
        skippedCount++;
        continue;
      }
      
      // Create inventory record
      const inventoryRecord = new Inventory({
        product: product._id,
        currentStock: product.inventory?.currentStock || 0,
        reorderPoint: product.inventory?.reorderPoint || 10,
        reorderQuantity: product.inventory?.reorderQuantity || 50,
        status: 'active',
        location: {
          warehouse: 'Main Warehouse',
          aisle: 'A1',
          shelf: 'S1'
        },
        movements: [],
        createdBy: product.createdBy || null
      });
      
      await inventoryRecord.save();
      console.log(`Created inventory record for product: ${product.name}`);
      createdCount++;
    }
    
    console.log(`\nSummary:`);
    console.log(`- Created: ${createdCount} inventory records`);
    console.log(`- Skipped: ${skippedCount} products (already had inventory records)`);
    console.log(`- Total products: ${products.length}`);
    
  } catch (error) {
    console.error('Error creating inventory records:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the script
createMissingInventoryRecords();
