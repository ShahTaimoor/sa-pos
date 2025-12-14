const mongoose = require('mongoose');
require('dotenv').config();

/**
 * Script to verify MongoDB Atlas credentials
 * This helps diagnose authentication issues
 */

console.log('🔍 Verifying MongoDB Atlas Credentials...\n');
console.log('═'.repeat(60));

// Get connection string from .env
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('❌ MONGODB_URI not found in .env file');
  console.log('\n💡 Please add MONGODB_URI to backend/.env file');
  process.exit(1);
}

// Extract credentials from connection string
const uriMatch = mongoUri.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)\/(.+)/);
if (!uriMatch) {
  console.error('❌ Invalid connection string format');
  console.log('Expected format: mongodb+srv://username:password@cluster.mongodb.net/database');
  process.exit(1);
}

const [, username, password, cluster, database] = uriMatch;

console.log('📋 Current Configuration:');
console.log('─'.repeat(60));
console.log(`   Username: ${username}`);
console.log(`   Password: ${password.replace(/./g, '*')} (${password.length} characters)`);
console.log(`   Cluster: ${cluster}`);
console.log(`   Database: ${database}`);
console.log('─'.repeat(60));

console.log('\n🔗 Testing connection...\n');

async function testCredentials() {
  try {
    // Set a shorter timeout for faster failure
    const options = {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 10000,
    };

    await mongoose.connect(mongoUri, options);
    
    console.log('✅ SUCCESS! Credentials are valid.');
    console.log('✅ Connected to MongoDB Atlas');
    
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log(`\n📊 Database: ${db.databaseName}`);
    console.log(`📦 Collections: ${collections.length}`);
    
    await mongoose.disconnect();
    console.log('\n🎉 All credentials are correct!');
    return true;
    
  } catch (error) {
    console.error('\n❌ CONNECTION FAILED');
    console.error(`   Error: ${error.message}`);
    console.error(`   Error Name: ${error.name}`);
    console.error(`   Error Code: ${error.code || 'N/A'}`);
    
    if (error.message.includes('authentication failed') || 
        error.message.includes('bad auth') ||
        error.name === 'MongoServerError' && (error.code === 8000 || error.code === 18)) {
      
      console.log('\n❌ INVALID LOGIN CREDENTIALS');
      console.log('\n💡 The username or password is incorrect.');
      console.log('\n📝 To fix this:');
      console.log('1. Go to MongoDB Atlas: https://cloud.mongodb.com/');
      console.log('2. Navigate to: Security → Database Access');
      console.log('3. Find the user:', username);
      console.log('4. Check if the password matches:', password.replace(/./g, '*'));
      console.log('5. If password is different:');
      console.log('   a) Click "Edit" on the user');
      console.log('   b) Update the password');
      console.log('   c) Update MONGODB_URI in backend/.env file with new password');
      console.log('   d) Run this script again to verify');
      console.log('\n6. If user doesn\'t exist:');
      console.log('   a) Click "Add New Database User"');
      console.log('   b) Create user with username:', username);
      console.log('   c) Set password and save');
      console.log('   d) Update MONGODB_URI in backend/.env file');
      
    } else if (error.message.includes('IP') || error.message.includes('whitelist')) {
      console.log('\n💡 IP Address not whitelisted');
      console.log('Go to: Security → Network Access → Add IP Address');
      
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('DNS')) {
      console.log('\n💡 Cluster hostname not found');
      console.log('Check if cluster name is correct:', cluster);
      
    } else {
      console.log('\n💡 Other connection issue');
      console.log('Check:');
      console.log('- Internet connection');
      console.log('- MongoDB Atlas cluster status');
      console.log('- Connection string format');
    }
    
    return false;
  }
}

testCredentials().then(success => {
  process.exit(success ? 0 : 1);
});

