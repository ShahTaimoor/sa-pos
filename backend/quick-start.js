const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

// Quick start script to create admin user
const quickStart = async () => {
  try {
    console.log('🚀 Quick Start - Creating Admin User...');
    
    // MONGODB_URI must be provided via environment variable or .env file
    // Never hardcode credentials in source code
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ Error: MONGODB_URI environment variable is required.');
      console.error('   Please set it in your .env file or as an environment variable.');
      process.exit(1);
    }
    
    // Try to connect to MongoDB
    console.log('🔗 Connecting to MongoDB Atlas...');
    
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connected successfully');
    
    // Check if admin user exists
    const existingAdmin = await User.findOne({ email: 'admin@pos.com' });
    
    if (existingAdmin) {
      console.log('👤 Admin user already exists');
      console.log('📧 Email: admin@pos.com');
      console.log('🔑 Password: admin123');
    } else {
      console.log('👤 Creating admin user...');
      
      // Create admin user
      const adminUser = new User({
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@pos.com',
        password: 'admin123',
        role: 'admin',
        permissions: [
          'view_products', 'create_products', 'edit_products', 'delete_products',
          'view_customers', 'create_customers', 'edit_customers', 'delete_customers',
          'view_orders', 'create_orders', 'edit_orders', 'cancel_orders',
          'view_inventory', 'update_inventory', 'view_reports', 'manage_users',
          'manage_settings', 'view_analytics'
        ]
      });
      
      await adminUser.save();
      console.log('✅ Admin user created successfully!');
      console.log('📧 Email: admin@pos.com');
      console.log('🔑 Password: admin123');
    }
    
    console.log('\n🎉 Setup complete! You can now login with:');
    console.log('   Email: admin@pos.com');
    console.log('   Password: admin123');
    
  } catch (error) {
    console.error('❌ Error during setup:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 MongoDB is not running. Please:');
      console.log('1. Install MongoDB: https://www.mongodb.com/try/download/community');
      console.log('2. Start MongoDB service');
      console.log('3. Run this script again');
      console.log('\n   OR use MongoDB Atlas (cloud):');
      console.log('1. Go to: https://cloud.mongodb.com/');
      console.log('2. Create free account');
      console.log('3. Create cluster');
      console.log('4. Get connection string');
      console.log('5. Update MONGODB_URI in .env file');
    }
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

quickStart();
