const mongoose = require('mongoose');
const CashReceipt = require('../models/CashReceipt');
const User = require('../models/User');

// Connect to MongoDB
if (!process.env.MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required.');
  console.error('   Please set it in your .env file or as an environment variable.');
  process.exit(1);
}
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const seedCashReceipts = async () => {
  try {
    // Get a user to use as createdBy
    const user = await User.findOne();
    if (!user) {
      console.log('❌ No users found. Please create a user first.');
      return;
    }

    // Sample cash receipt data
    const sampleReceipts = [
      {
        date: new Date('2025-09-25'),
        amount: 6500,
        particular: 'CASH IN HAND - ROYAL AUTO DIL JAN PLAZA INVOICE NO : 250900903',
        paymentMethod: 'cash',
        notes: 'Payment received for auto parts sale',
        createdBy: user._id
      },
      {
        date: new Date('2025-09-25'),
        amount: 1000,
        particular: 'CASH IN HAND - ROYAL AUTO DIL JAN PLAZA INVOICE NO : 250900904',
        paymentMethod: 'cash',
        notes: 'Small parts payment',
        createdBy: user._id
      },
      {
        date: new Date('2025-09-25'),
        amount: 8500,
        particular: 'CASH IN HAND - BASIT ELECTRICIAN DIL JAN PLAZA',
        paymentMethod: 'cash',
        notes: 'Electrical services payment',
        createdBy: user._id
      },
      {
        date: new Date('2025-09-25'),
        amount: 25000,
        particular: 'CASH IN HAND - HILAL AUTOS PISHTAKHARA INVOICE NO : 250900915',
        paymentMethod: 'cash',
        notes: 'Large auto parts order',
        createdBy: user._id
      },
      {
        date: new Date('2025-09-25'),
        amount: 16000,
        particular: 'CASH IN HAND - SM WASIM INVOICE NO : 250900921',
        paymentMethod: 'cash',
        notes: 'Customer payment for services',
        createdBy: user._id
      },
      {
        date: new Date('2025-09-25'),
        amount: 30000,
        particular: 'CASH IN HAND - Transfer to jabar nadra received in cash',
        paymentMethod: 'cash',
        notes: 'Transfer payment received',
        createdBy: user._id
      }
    ];

    // Clear existing cash receipts
    await CashReceipt.deleteMany({});
    console.log('🗑️ Cleared existing cash receipts');

    // Insert sample data
    const createdReceipts = await CashReceipt.insertMany(sampleReceipts);
    console.log(`✅ Created ${createdReceipts.length} sample cash receipts`);

    // Display created receipts
    console.log('\n📋 Created Cash Receipts:');
    createdReceipts.forEach(receipt => {
      console.log(`- ${receipt.voucherCode}: ${receipt.amount} - ${receipt.particular.substring(0, 50)}...`);
    });

  } catch (error) {
    console.error('❌ Error seeding cash receipts:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
};

// Run the seed function
seedCashReceipts();
