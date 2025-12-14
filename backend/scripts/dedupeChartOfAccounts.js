const mongoose = require('mongoose');
require('dotenv').config();

const { seedBasicAccounts } = require('../services/accountSeeder');

if (!process.env.MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required.');
  console.error('   Please set it in your .env file or as an environment variable.');
  process.exit(1);
}

async function run() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected. Seeding and deduplicating Chart of Accounts...');

    await seedBasicAccounts();

    console.log('🎉 Chart of Accounts has been synchronized.');
  } catch (error) {
    console.error('❌ Failed to synchronize Chart of Accounts:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

run();

