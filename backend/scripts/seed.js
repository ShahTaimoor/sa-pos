const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');

const seedData = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('❌ Error: MONGODB_URI environment variable is required.');
      console.error('   Please set it in your .env file or as an environment variable.');
      process.exit(1);
    }
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await Product.deleteMany({});
    await Customer.deleteMany({});
    await Supplier.deleteMany({});
    console.log('Cleared existing data');

    // Create admin user
    const hashedPassword = await bcrypt.hash('password123', 12);
    const adminUser = new User({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@pos.com',
      password: hashedPassword,
      role: 'admin',
      status: 'active',
      permissions: [
        'view_products', 'create_products', 'edit_products', 'delete_products',
        'view_customers', 'create_customers', 'edit_customers', 'delete_customers',
        'view_orders', 'create_orders', 'edit_orders', 'cancel_orders',
        'view_inventory', 'update_inventory', 'view_reports', 'manage_users',
        'manage_settings', 'view_analytics'
      ]
    });
    await adminUser.save();
    console.log('Created admin user');

    // Create sample products
    const products = [
      {
        name: 'Wireless Bluetooth Headphones',
        sku: 'WBH-001',
        barcode: '1234567890123',
        description: 'High-quality wireless headphones with noise cancellation',
        pricing: {
          cost: 25.00,
          retail: 79.99,
          wholesale: 45.00,
          distributor: 35.00
        },
        inventory: {
          currentStock: 150,
          minStock: 20,
          reorderPoint: 25,
          maxStock: 500
        },
        wholesaleSettings: {
          minOrderQuantity: 10,
          bulkDiscounts: [
            { minQuantity: 50, discountPercent: 5 },
            { minQuantity: 100, discountPercent: 10 }
          ]
        },
        status: 'active',
        createdBy: adminUser._id,
        lastModifiedBy: adminUser._id
      },
      {
        name: 'Smartphone Case - Clear',
        sku: 'SPC-002',
        barcode: '1234567890124',
        description: 'Transparent protective case for smartphones',
        pricing: {
          cost: 2.50,
          retail: 12.99,
          wholesale: 6.00,
          distributor: 4.50
        },
        inventory: {
          currentStock: 500,
          minStock: 50,
          reorderPoint: 75,
          maxStock: 1000
        },
        wholesaleSettings: {
          minOrderQuantity: 25,
          bulkDiscounts: [
            { minQuantity: 100, discountPercent: 8 },
            { minQuantity: 250, discountPercent: 15 }
          ]
        },
        status: 'active',
        createdBy: adminUser._id,
        lastModifiedBy: adminUser._id
      },
      {
        name: 'USB-C Charging Cable',
        sku: 'UCC-003',
        barcode: '1234567890125',
        description: '6ft USB-C to USB-A charging cable',
        pricing: {
          cost: 1.25,
          retail: 8.99,
          wholesale: 4.00,
          distributor: 2.75
        },
        inventory: {
          currentStock: 25,
          minStock: 30,
          reorderPoint: 35,
          maxStock: 200
        },
        wholesaleSettings: {
          minOrderQuantity: 50,
          bulkDiscounts: [
            { minQuantity: 200, discountPercent: 10 },
            { minQuantity: 500, discountPercent: 20 }
          ]
        },
        status: 'active',
        createdBy: adminUser._id,
        lastModifiedBy: adminUser._id
      },
      {
        name: 'Wireless Mouse',
        sku: 'WM-004',
        barcode: '1234567890126',
        description: 'Ergonomic wireless optical mouse',
        pricing: {
          cost: 8.00,
          retail: 24.99,
          wholesale: 15.00,
          distributor: 12.00
        },
        inventory: {
          currentStock: 75,
          minStock: 15,
          reorderPoint: 20,
          maxStock: 150
        },
        wholesaleSettings: {
          minOrderQuantity: 20,
          bulkDiscounts: [
            { minQuantity: 50, discountPercent: 5 },
            { minQuantity: 100, discountPercent: 12 }
          ]
        },
        status: 'active',
        createdBy: adminUser._id,
        lastModifiedBy: adminUser._id
      },
      {
        name: 'Laptop Stand - Adjustable',
        sku: 'LS-005',
        barcode: '1234567890127',
        description: 'Aluminum adjustable laptop stand',
        pricing: {
          cost: 15.00,
          retail: 49.99,
          wholesale: 28.00,
          distributor: 22.00
        },
        inventory: {
          currentStock: 5,
          minStock: 10,
          reorderPoint: 12,
          maxStock: 50
        },
        wholesaleSettings: {
          minOrderQuantity: 5,
          bulkDiscounts: [
            { minQuantity: 25, discountPercent: 8 },
            { minQuantity: 50, discountPercent: 15 }
          ]
        },
        status: 'active',
        createdBy: adminUser._id,
        lastModifiedBy: adminUser._id
      }
    ];

    for (const productData of products) {
      const product = new Product(productData);
      await product.save();
    }
    console.log('Created sample products');

    // Create sample customers
    const customers = [
      {
        name: 'John Smith',
        email: 'john.smith@retailstore.com',
        phone: '+1-555-0123',
        businessName: 'Smith Electronics',
        businessType: 'retail',
        customerTier: 'silver',
        creditLimit: 5000,
        paymentTerms: 'net30',
        discountPercent: 5,
        status: 'active',
        addresses: [{
          type: 'both',
          street: '123 Main Street',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
          isDefault: true
        }],
        createdBy: adminUser._id,
        lastModifiedBy: adminUser._id
      },
      {
        name: 'Sarah Johnson',
        email: 'sarah@wholesaleplus.com',
        phone: '+1-555-0456',
        businessName: 'Wholesale Plus Inc',
        businessType: 'wholesale',
        customerTier: 'gold',
        creditLimit: 25000,
        paymentTerms: 'net45',
        discountPercent: 10,
        status: 'active',
        addresses: [{
          type: 'both',
          street: '456 Business Ave',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90210',
          country: 'US',
          isDefault: true
        }],
        createdBy: adminUser._id,
        lastModifiedBy: adminUser._id
      },
      {
        name: 'Mike Wilson',
        email: 'mike@distributor.com',
        phone: '+1-555-0789',
        businessName: 'Regional Distributors LLC',
        businessType: 'distributor',
        customerTier: 'platinum',
        creditLimit: 100000,
        paymentTerms: 'net60',
        discountPercent: 15,
        status: 'active',
        addresses: [{
          type: 'both',
          street: '789 Distribution Blvd',
          city: 'Chicago',
          state: 'IL',
          zipCode: '60601',
          country: 'US',
          isDefault: true
        }],
        createdBy: adminUser._id,
        lastModifiedBy: adminUser._id
      },
      {
        name: 'Emily Davis',
        email: 'emily.davis@gmail.com',
        phone: '+1-555-0321',
        businessType: 'individual',
        customerTier: 'bronze',
        creditLimit: 0,
        paymentTerms: 'cash',
        discountPercent: 0,
        status: 'active',
        addresses: [{
          type: 'both',
          street: '321 Residential St',
          city: 'Miami',
          state: 'FL',
          zipCode: '33101',
          country: 'US',
          isDefault: true
        }],
        createdBy: adminUser._id,
        lastModifiedBy: adminUser._id
      }
    ];

    for (const customerData of customers) {
      const customer = new Customer(customerData);
      await customer.save();
    }
    console.log('Created sample customers');

    // Create sample suppliers
    const suppliers = [
      {
        companyName: 'TechSupply Co.',
        contactPerson: {
          firstName: 'John',
          lastName: 'Smith',
          title: 'Sales Manager'
        },
        email: 'john.smith@techsupply.com',
        phone: '(555) 123-4567',
        website: 'https://techsupply.com',
        businessType: 'wholesaler',
        addresses: [{
          type: 'both',
          street: '123 Business Ave',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
          isDefault: true
        }],
        paymentTerms: 'net30',
        creditLimit: 50000,
        rating: 4,
        reliability: 'excellent',
        minOrderAmount: 500,
        leadTime: 7,
        status: 'active',
        notes: 'Reliable supplier for electronics and tech accessories',
        createdBy: adminUser._id,
        lastModifiedBy: adminUser._id
      },
      {
        companyName: 'Office Essentials Inc.',
        contactPerson: {
          firstName: 'Sarah',
          lastName: 'Johnson',
          title: 'Account Manager'
        },
        email: 'sarah.johnson@officeessentials.com',
        phone: '(555) 987-6543',
        businessType: 'distributor',
        addresses: [{
          type: 'both',
          street: '456 Commerce Blvd',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90210',
          country: 'US',
          isDefault: true
        }],
        paymentTerms: 'net15',
        creditLimit: 25000,
        rating: 5,
        reliability: 'excellent',
        minOrderAmount: 250,
        leadTime: 5,
        status: 'active',
        notes: 'Fast delivery for office supplies and stationery',
        createdBy: adminUser._id,
        lastModifiedBy: adminUser._id
      },
      {
        companyName: 'Fashion Forward Ltd.',
        contactPerson: {
          firstName: 'Michael',
          lastName: 'Brown',
          title: 'Regional Sales Director'
        },
        email: 'michael.brown@fashionforward.com',
        phone: '(555) 456-7890',
        businessType: 'manufacturer',
        addresses: [{
          type: 'both',
          street: '789 Fashion District',
          city: 'Chicago',
          state: 'IL',
          zipCode: '60601',
          country: 'US',
          isDefault: true
        }],
        paymentTerms: 'net45',
        creditLimit: 100000,
        rating: 4,
        reliability: 'good',
        minOrderAmount: 1000,
        leadTime: 14,
        status: 'active',
        notes: 'Premium clothing and accessories manufacturer',
        createdBy: adminUser._id,
        lastModifiedBy: adminUser._id
      },
      {
        companyName: 'Home & Garden Supply',
        contactPerson: {
          firstName: 'Lisa',
          lastName: 'Davis',
          title: 'Sales Representative'
        },
        email: 'lisa.davis@homegarden.com',
        phone: '(555) 321-0987',
        businessType: 'wholesaler',
        addresses: [{
          type: 'both',
          street: '321 Garden Way',
          city: 'Seattle',
          state: 'WA',
          zipCode: '98101',
          country: 'US',
          isDefault: true
        }],
        paymentTerms: 'net30',
        creditLimit: 15000,
        rating: 3,
        reliability: 'average',
        minOrderAmount: 200,
        leadTime: 10,
        status: 'active',
        notes: 'Seasonal supplier for home and garden products',
        createdBy: adminUser._id,
        lastModifiedBy: adminUser._id
      }
    ];

    for (const supplierData of suppliers) {
      const supplier = new Supplier(supplierData);
      await supplier.save();
    }
    console.log('Created sample suppliers');

    console.log('✅ Database seeded successfully!');
    console.log('\n📋 Sample Data Created:');
    console.log('- 1 Admin user (admin@pos.com / password123)');
    console.log('- 5 Sample products with multi-tier pricing');
    console.log('- 4 Sample customers (retail, wholesale, distributor, individual)');
    console.log('- 4 Sample suppliers (wholesaler, distributor, manufacturer)');
    console.log('\n🚀 You can now start the application and login with the admin credentials.');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

seedData();
