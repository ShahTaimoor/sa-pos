const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB Setup Script
const setupMongoDB = async () => {
  console.log('🔧 MongoDB Connection Setup');
  console.log('═'.repeat(50));
  
  // Test current connection - credentials must be provided via MONGODB_URI environment variable
  const currentUri = process.env.MONGODB_URI;
  if (!currentUri) {
    console.error('❌ Error: MONGODB_URI environment variable is required.');
    console.error('   Please set it in your .env file or as an environment variable.');
    process.exit(1);
  }
  // Mask credentials in log output for security
  const maskedUri = currentUri.replace(/:([^:@]+)@/, ':****@');
  console.log(`🔗 Testing connection to: ${maskedUri}`);
  
  try {
    await mongoose.connect(currentUri);
    console.log('✅ MongoDB connected successfully!');
    
    // Test database operations
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log('📊 Database info:');
    console.log(`   Database: ${db.databaseName}`);
    console.log(`   Collections: ${collections.length}`);
    
    if (collections.length > 0) {
      console.log('   Existing collections:');
      collections.forEach(col => console.log(`   - ${col.name}`));
    }
    
    console.log('\n🎉 MongoDB is ready! You can now:');
    console.log('1. Run: node quick-start.js (to create admin user)');
    console.log('2. Start your servers and test login');
    
    return true;
    
  } catch (error) {
    console.log('❌ MongoDB connection failed:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 MongoDB is not running. Choose one option:');
      console.log('\n📥 OPTION 1: Install MongoDB Locally');
      console.log('1. Download: https://www.mongodb.com/try/download/community');
      console.log('2. Install with default settings');
      console.log('3. MongoDB will start automatically');
      console.log('4. Run this script again');
      
      console.log('\n☁️ OPTION 2: Use MongoDB Atlas (Cloud - Recommended)');
      console.log('1. Go to: https://cloud.mongodb.com/');
      console.log('2. Click "Try Free" and create account');
      console.log('3. Create a new cluster (free tier)');
      console.log('4. Click "Connect" → "Connect your application"');
      console.log('5. Copy the connection string');
      console.log('6. Update MONGODB_URI in .env file');
      console.log('7. Run this script again');
      
      console.log('\n🐳 OPTION 3: Use Docker (if installed)');
      console.log('Run: docker run -d -p 27017:27017 --name mongodb mongo:latest');
    }
    
    return false;
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('🔌 Disconnected from MongoDB');
    }
  }
};

// Run setup
setupMongoDB().then(success => {
  if (success) {
    console.log('\n✅ Setup completed successfully!');
    process.exit(0);
  } else {
    console.log('\n❌ Setup failed. Please follow the instructions above.');
    process.exit(1);
  }
});
