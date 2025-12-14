const mongoose = require('mongoose');
require('dotenv').config();

async function checkDatabase() {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('❌ Error: MONGODB_URI environment variable is required.');
      console.error('   Please set it in your .env file or as an environment variable.');
      process.exit(1);
    }
    const mongoUri = process.env.MONGODB_URI;
    console.log('🔍 Checking Database Configuration');
    console.log('═'.repeat(60));
    console.log('\n📋 Connection String (masked):');
    console.log(mongoUri.replace(/:[^:@]+@/, ':***@'));
    
    // Extract database name from connection string
    const dbNameMatch = mongoUri.match(/mongodb\+srv:\/\/[^/]+\/([^?]+)/);
    const dbNameFromUri = dbNameMatch ? dbNameMatch[1] : 'NOT FOUND';
    
    console.log('\n📊 Database Name from URI:', dbNameFromUri);
    console.log('📊 Expected Database: pos_system');
    
    if (dbNameFromUri !== 'pos_system') {
      console.log('\n⚠️  WARNING: Database name mismatch!');
      console.log('   The connection string should end with: /pos_system?retryWrites=true&w=majority');
    }
    
    console.log('\n🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    
    const db = mongoose.connection.db;
    const actualDbName = db.databaseName;
    
    console.log('\n✅ Connected Successfully!');
    console.log('📊 Actual Connected Database:', actualDbName);
    
    if (actualDbName === 'test') {
      console.log('\n❌ PROBLEM DETECTED: Connected to "test" database!');
      console.log('💡 This means the database name is missing from the connection string.');
      console.log('\n🔧 Fix: Update your .env file with a connection string ending in /pos_system?retryWrites=true&w=majority');
    } else if (actualDbName === 'pos_system') {
      console.log('\n✅ Correctly connected to "pos_system" database!');
    } else {
      console.log(`\n⚠️  Connected to "${actualDbName}" database (not "pos_system")`);
    }
    
    // List collections
    const collections = await db.listCollections().toArray();
    console.log(`\n📦 Collections in database (${collections.length}):`);
    collections.forEach(col => {
      console.log(`   - ${col.name}`);
    });
    
    // Check for users collection
    if (collections.find(c => c.name === 'users')) {
      const User = require('./models/User');
      const userCount = await User.countDocuments();
      console.log(`\n👥 Users in database: ${userCount}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected');
  }
}

checkDatabase();

