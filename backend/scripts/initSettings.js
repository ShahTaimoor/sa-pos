const mongoose = require('mongoose');
require('dotenv').config();

const Settings = require('../models/Settings');

async function initializeSettings() {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('❌ Error: MONGODB_URI environment variable is required.');
      console.error('   Please set it in your .env file or as an environment variable.');
      process.exit(1);
    }
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');

    // Check if settings exist
    let settings = await Settings.findById('company_settings');
    
    if (settings) {
      console.log('📋 Settings already exist:');
      console.log(JSON.stringify(settings, null, 2));
    } else {
      console.log('⚠️  No settings found, creating default settings...');
      settings = await Settings.create({
        _id: 'company_settings',
        companyName: 'Zaryab Traders New 2024',
        contactNumber: '091-5250770',
        address: 'LG 470/472 Deans Trade Center Cantt Peshawar',
        email: ''
      });
      console.log('✅ Default settings created:');
      console.log(JSON.stringify(settings, null, 2));
    }

    console.log('\n🎉 Settings initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

initializeSettings();

