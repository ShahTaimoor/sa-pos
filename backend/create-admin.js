const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

// Note: MONGODB_URI and JWT_SECRET must be provided via environment variable or .env file
// Never hardcode credentials in source code
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

async function createAdminUser() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: 'admin@pos.com' });
    if (existingAdmin) {
      console.log('✅ Admin user already exists:', existingAdmin.email);
      console.log('📧 Email: admin@pos.com');
      console.log('🔑 Password: admin123');
      return;
    }

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
      ],
      status: 'active'
    });

    await adminUser.save();
    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin@pos.com');
    console.log('🔑 Password: admin123');
    console.log('⚠️  Please change the password after first login!');

  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 MongoDB is not running. Please:');
      console.log('1. Install MongoDB: https://docs.mongodb.com/manual/installation/');
      console.log('2. Start MongoDB service');
      console.log('3. Run this script again');
    } else if (error.message.includes('MongoNetworkError')) {
      console.log('\n💡 MongoDB connection failed. Please:');
      console.log('1. Check if MongoDB is running');
      console.log('2. Verify the connection string');
      console.log('3. Try again');
    }
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

createAdminUser();
