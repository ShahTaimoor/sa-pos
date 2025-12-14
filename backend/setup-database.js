const mongoose = require('mongoose');
const User = require('./models/User');
const Product = require('./models/Product');
const Customer = require('./models/Customer');
const Supplier = require('./models/Supplier');

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

async function setupDatabase() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await User.deleteMany({});
    await Product.deleteMany({});
    await Customer.deleteMany({});
    await Supplier.deleteMany({});

    // Create admin user
    console.log('👤 Creating admin user...');
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

    // Create sample products
    console.log('📦 Creating sample products...');
    const sampleProducts = [
      {
        name: 'Laptop Computer',
        sku: 'LAPTOP-001',
        barcode: '1234567890123',
        description: 'High-performance laptop for business use',
        pricing: {
          cost: 800,
          retail: 1200,
          wholesale: 1000
        },
        inventory: {
          currentStock: 25,
          reorderPoint: 5
        },
        status: 'active'
      },
      {
        name: 'Wireless Mouse',
        sku: 'MOUSE-001',
        barcode: '1234567890124',
        description: 'Ergonomic wireless mouse',
        pricing: {
          cost: 15,
          retail: 29.99,
          wholesale: 22
        },
        inventory: {
          currentStock: 100,
          reorderPoint: 20
        },
        status: 'active'
      },
      {
        name: 'Mechanical Keyboard',
        sku: 'KEYBOARD-001',
        barcode: '1234567890125',
        description: 'RGB mechanical keyboard',
        pricing: {
          cost: 60,
          retail: 99.99,
          wholesale: 80
        },
        inventory: {
          currentStock: 50,
          reorderPoint: 10
        },
        status: 'active'
      }
    ];

    for (const productData of sampleProducts) {
      const product = new Product(productData);
      await product.save();
    }

    // Create sample customers
    console.log('👥 Creating sample customers...');
    const sampleCustomers = [
      {
        name: 'John Smith',
        email: 'john.smith@email.com',
        phone: '+1-555-0123',
        businessType: 'individual',
        customerTier: 'bronze',
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'USA'
        }
      },
      {
        name: 'ABC Corporation',
        businessName: 'ABC Corporation',
        email: 'orders@abc-corp.com',
        phone: '+1-555-0456',
        businessType: 'wholesale',
        customerTier: 'gold',
        address: {
          street: '456 Business Ave',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90210',
          country: 'USA'
        }
      }
    ];

    for (const customerData of sampleCustomers) {
      const customer = new Customer(customerData);
      await customer.save();
    }

    // Create sample suppliers
    console.log('🏭 Creating sample suppliers...');
    const sampleSuppliers = [
      {
        companyName: 'TechSupply Inc',
        contactName: 'Jane Doe',
        email: 'jane.doe@techsupply.com',
        phone: '+1-555-0789',
        businessType: 'wholesale',
        paymentTerms: 'net30',
        address: {
          street: '789 Supplier Blvd',
          city: 'Chicago',
          state: 'IL',
          zipCode: '60601',
          country: 'USA'
        }
      }
    ];

    for (const supplierData of sampleSuppliers) {
      const supplier = new Supplier(supplierData);
      await supplier.save();
    }

    console.log('\n✅ Database setup completed successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('📧 Email: admin@pos.com');
    console.log('🔑 Password: admin123');
    console.log('\n⚠️  Please change the password after first login!');

  } catch (error) {
    console.error('❌ Error setting up database:', error.message);
    
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

setupDatabase();
