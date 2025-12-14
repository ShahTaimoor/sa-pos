const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

// Fix admin user script
const fixAdminUser = async () => {
  try {
    console.log('🔧 Fixing Admin User...');
    console.log('═'.repeat(50));
    
    // MONGODB_URI must be provided via environment variable or .env file
    // Never hardcode credentials in source code
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ Error: MONGODB_URI environment variable is required.');
      console.error('   Please set it in your .env file or as an environment variable.');
      process.exit(1);
    }
    
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB Atlas...');
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connected successfully');
    
    // Find the admin user
    const adminUser = await User.findOne({ email: 'admin@pos.com' });
    
    if (adminUser) {
      console.log('👤 Admin user found');
      console.log('🔒 Current status:', {
        isLocked: adminUser.isLocked,
        loginAttempts: adminUser.loginAttempts,
        lockUntil: adminUser.lockUntil
      });
      
      // Reset login attempts and unlock account
      adminUser.loginAttempts = 0;
      adminUser.lockUntil = undefined;
      adminUser.isLocked = false;
      
      // Reset password to admin123
      adminUser.password = 'admin123';
      
      await adminUser.save();
      console.log('✅ Admin user fixed successfully!');
      console.log('🔓 Account unlocked');
      console.log('🔑 Password reset to: admin123');
      
    } else {
      console.log('👤 Admin user not found, creating new one...');
      
      // Create new admin user
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
        ]
      });
      
      await newAdminUser.save();
      console.log('✅ New admin user created successfully!');
    }
    
    console.log('\n🎉 Admin user is ready!');
    console.log('📧 Email: admin@pos.com');
    console.log('🔑 Password: admin123');
    console.log('🔓 Account: Unlocked');
    
  } catch (error) {
    console.error('❌ Error fixing admin user:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

fixAdminUser();
