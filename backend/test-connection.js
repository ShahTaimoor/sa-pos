const mongoose = require('mongoose');
require('dotenv').config();

if (!process.env.MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required.');
  console.error('   Please set it in your .env file or as an environment variable.');
  process.exit(1);
}

const mongoUri = process.env.MONGODB_URI;
const isAtlas = mongoUri.includes('mongodb+srv://');
const dbType = isAtlas ? 'MongoDB Atlas' : 'Local MongoDB';

console.log(`🔧 Testing ${dbType} Connection`);
console.log('═'.repeat(50));
console.log(`🔗 Connecting to ${dbType}...`);
console.log('📊 Connection string:', mongoUri.replace(/:[^:@]+@/, ':***@'));

async function testConnection() {
  try {
    await mongoose.connect(mongoUri);
    console.log(`✅ ${dbType} connected successfully!`);
    
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
    
    console.log(`\n🎉 ${dbType} is ready!`);
    console.log('Next steps:');
    console.log('1. Run: node quick-start.js');
    console.log('2. Test login with: admin@pos.com / admin123');
    
    return true;
    
  } catch (error) {
    console.log(`❌ ${dbType} connection failed:`, error.message);
    console.log(`   Error name: ${error.name}`);
    console.log(`   Error code: ${error.code || 'N/A'}`);
    
    if (isAtlas) {
      if (error.message.includes('authentication failed') || 
          error.message.includes('bad auth') ||
          error.message.includes('Authentication failed') ||
          error.name === 'MongoServerError' && error.code === 8000) {
        console.log('\n❌ INVALID LOGIN CREDENTIALS');
        console.log('💡 MongoDB Atlas authentication failed. Please check:');
        console.log('1. Username in connection string is correct');
        console.log('2. Password in connection string is correct');
        console.log('3. Database user exists in MongoDB Atlas');
        console.log('4. Database user has correct permissions');
        console.log('\n📝 To fix:');
        console.log('   - Go to MongoDB Atlas → Database Access');
        console.log('   - Verify the user exists and password is correct');
        console.log('   - Check user permissions (should have read/write access)');
        console.log('   - Update the password in .env file if changed in Atlas');
      } else if (error.message.includes('network') || 
                 error.message.includes('ENOTFOUND') ||
                 error.message.includes('ETIMEDOUT')) {
        console.log('\n💡 Network error. Please check:');
        console.log('1. Internet connection');
        console.log('2. MongoDB Atlas cluster status');
        console.log('3. Your IP address is whitelisted in Atlas Network Access');
        console.log('   - Go to: https://cloud.mongodb.com/ → Security → Network Access');
        console.log('   - Add your IP or allow access from anywhere (0.0.0.0/0)');
      } else if (error.message.includes('IP')) {
        console.log('\n💡 IP Address not whitelisted. Please check:');
        console.log('1. Go to MongoDB Atlas → Security → Network Access');
        console.log('2. Add your current IP address');
        console.log('3. Or click "Allow Access from Anywhere" (0.0.0.0/0)');
        console.log('4. Wait 1-2 minutes for changes to apply');
      } else {
        console.log('\n💡 Connection failed. Please check:');
        console.log('1. Connection string format is correct');
        console.log('2. Cluster is running in MongoDB Atlas');
        console.log('3. Database name is correct (pos_system)');
      }
    } else {
      console.log('\n💡 Local MongoDB connection failed. Please check:');
      console.log('1. MongoDB Community Server is installed');
      console.log('2. MongoDB service is running');
      console.log('3. MongoDB is listening on port 27017');
      console.log('\nTo start MongoDB service:');
      console.log('   - Windows: net start MongoDB');
      console.log('   - Or run: mongod');
    }
    
    return false;
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log(`🔌 Disconnected from ${dbType}`);
    }
  }
}

testConnection().then(success => {
  if (success) {
    console.log('\n✅ Connection test completed successfully!');
    process.exit(0);
  } else {
    console.log('\n❌ Connection test failed.');
    process.exit(1);
  }
});
