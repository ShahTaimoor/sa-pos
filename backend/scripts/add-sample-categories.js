const mongoose = require('mongoose');
const Category = require('../models/Category');

// Connect to MongoDB
if (!process.env.MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required.');
  console.error('   Please set it in your .env file or as an environment variable.');
  process.exit(1);
}
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function addSampleCategories() {
  try {
    console.log('Adding sample categories...');
    
    // Check if categories already exist
    const existingCategories = await Category.find({});
    if (existingCategories.length > 0) {
      console.log('Categories already exist. Current categories:');
      existingCategories.forEach(cat => {
        console.log(`- ${cat.name} (ID: ${cat._id})`);
      });
      return;
    }
    
    // Create parent categories
    const electronics = new Category({
      name: 'Electronics',
      description: 'Electronic devices and components',
      sortOrder: 1,
      isActive: true
    });
    await electronics.save();
    console.log('Created category: Electronics');
    
    const furniture = new Category({
      name: 'Furniture',
      description: 'Furniture and home decor',
      sortOrder: 2,
      isActive: true
    });
    await furniture.save();
    console.log('Created category: Furniture');
    
    const accessories = new Category({
      name: 'Accessories',
      description: 'Various accessories and peripherals',
      sortOrder: 3,
      isActive: true
    });
    await accessories.save();
    console.log('Created category: Accessories');
    
    // Create child categories for Electronics
    const ledLights = new Category({
      name: 'LED Lights',
      description: 'LED lighting products',
      parentCategory: electronics._id,
      sortOrder: 1,
      isActive: true
    });
    await ledLights.save();
    console.log('Created category: LED Lights (child of Electronics)');
    
    const bulbs = new Category({
      name: 'Bulbs',
      description: 'Light bulbs and lamps',
      parentCategory: electronics._id,
      sortOrder: 2,
      isActive: true
    });
    await bulbs.save();
    console.log('Created category: Bulbs (child of Electronics)');
    
    const cables = new Category({
      name: 'Cables',
      description: 'Cables and wires',
      parentCategory: electronics._id,
      sortOrder: 3,
      isActive: true
    });
    await cables.save();
    console.log('Created category: Cables (child of Electronics)');
    
    // Create child categories for Furniture
    const tables = new Category({
      name: 'Tables',
      description: 'Tables and desks',
      parentCategory: furniture._id,
      sortOrder: 1,
      isActive: true
    });
    await tables.save();
    console.log('Created category: Tables (child of Furniture)');
    
    const chairs = new Category({
      name: 'Chairs',
      description: 'Chairs and seating',
      parentCategory: furniture._id,
      sortOrder: 2,
      isActive: true
    });
    await chairs.save();
    console.log('Created category: Chairs (child of Furniture)');
    
    console.log('\n✅ Sample categories created successfully!');
    console.log('\nCategory structure:');
    console.log('📁 Electronics');
    console.log('  ├── 🏷️ LED Lights');
    console.log('  ├── 🏷️ Bulbs');
    console.log('  └── 🏷️ Cables');
    console.log('📁 Furniture');
    console.log('  ├── 🏷️ Tables');
    console.log('  └── 🏷️ Chairs');
    console.log('📁 Accessories (no children)');
    
  } catch (error) {
    console.error('Error creating categories:', error);
  } finally {
    mongoose.connection.close();
  }
}

addSampleCategories();
