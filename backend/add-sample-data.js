const mongoose = require('mongoose');
const Customer = require('./models/Customer');
const Supplier = require('./models/Supplier');
const User = require('./models/User');

const addSampleData = async () => {
  try {
    // Connect to MongoDB - credentials must be provided via MONGODB_URI environment variable
    require('dotenv').config();
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is required. Please set it in your .env file.');
    }
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Get admin user for createdBy field
    const adminUser = await User.findOne({ email: 'admin@pos.com' });
    if (!adminUser) {
      console.error('Admin user not found. Please create an admin user first.');
      process.exit(1);
    }

    // Check if customers already exist
    const existingCustomers = await Customer.countDocuments();
    if (existingCustomers > 0) {
      console.log(`Found ${existingCustomers} existing customers. Skipping customer creation.`);
    } else {
      // Create sample customers with unique business names
      const customers = [
        {
          name: 'John Smith',
          email: 'john.smith@retailstore.com',
          phone: '+1-555-0123',
          businessName: 'Smith Electronics Store',
          businessType: 'retail',
          customerTier: 'silver',
          creditLimit: 5000,
          paymentTerms: 'net30',
          discountPercent: 5,
          pendingBalance: 0,
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
          pendingBalance: 0,
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
          pendingBalance: 0,
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
          businessName: 'Davis Individual Services',
          businessType: 'individual',
          customerTier: 'bronze',
          creditLimit: 0,
          paymentTerms: 'cash',
          discountPercent: 0,
          pendingBalance: 0,
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
        console.log(`Created customer: ${customer.businessName}`);
      }
      console.log('Created 4 sample customers');
    }

    // Check if suppliers already exist
    const existingSuppliers = await Supplier.countDocuments();
    if (existingSuppliers > 0) {
      console.log(`Found ${existingSuppliers} existing suppliers. Skipping supplier creation.`);
    } else {
      // Create sample suppliers
      const suppliers = [
        {
          companyName: 'TechSupply Co.',
                contactPerson: {
                  name: 'John Smith',
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
          outstandingBalance: 0,
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
                  name: 'Sarah Johnson',
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
          outstandingBalance: 0,
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
                  name: 'Michael Brown',
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
          outstandingBalance: 0,
          rating: 4,
          reliability: 'good',
          minOrderAmount: 1000,
          leadTime: 14,
          status: 'active',
          notes: 'Premium clothing and accessories manufacturer',
          createdBy: adminUser._id,
          lastModifiedBy: adminUser._id
        }
      ];

      for (const supplierData of suppliers) {
        const supplier = new Supplier(supplierData);
        await supplier.save();
        console.log(`Created supplier: ${supplier.companyName}`);
      }
      console.log('Created 3 sample suppliers');
    }

    console.log('\n✅ Sample data added successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error adding sample data:', error);
    process.exit(1);
  }
};

addSampleData();