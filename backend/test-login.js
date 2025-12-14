const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

if (!process.env.MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required.');
  console.error('   Please set it in your .env file or as an environment variable.');
  process.exit(1);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
  console.error('❌ Error: JWT_SECRET environment variable is required.');
  console.error('   Please set it in your .env file or as an environment variable.');
  process.exit(1);
}

async function testLogin() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if admin user exists
    const adminUser = await User.findOne({ email: 'admin@pos.com' });
    
    if (adminUser) {
      console.log('✅ Admin user found:', adminUser.email);
      console.log('📧 Email: admin@pos.com');
      console.log('🔑 Password: admin123');
      console.log('👤 Role:', adminUser.role);
      console.log('📊 Status:', adminUser.status);
    } else {
      console.log('❌ Admin user not found. Creating one...');
      
      // Create admin user
      const newAdminUser = new User({
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
        ],
        status: 'active'
      });

      await newAdminUser.save();
      console.log('✅ Admin user created successfully!');
      console.log('📧 Email: admin@pos.com');
      console.log('🔑 Password: admin123');
    }

    // Test password comparison
    const user = await User.findOne({ email: 'admin@pos.com' });
    const isPasswordValid = await user.comparePassword('admin123');
    console.log('🔐 Password test:', isPasswordValid ? '✅ Valid' : '❌ Invalid');

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 MongoDB is not running. Please:');
      console.log('1. Install MongoDB: https://docs.mongodb.com/manual/installation/');
      console.log('2. Start MongoDB service');
      console.log('3. Run this script again');
    }
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testLogin();

