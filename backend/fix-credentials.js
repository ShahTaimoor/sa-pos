const mongoose = require('mongoose');
require('dotenv').config();

/**
 * Script to help fix MongoDB Atlas credential issues
 * Tests different password variations and provides solutions
 */

console.log('🔧 MongoDB Atlas Credentials Diagnostic Tool\n');
console.log('═'.repeat(60));

const cluster = 'cluster0.yrhubi5.mongodb.net';
const username = 'muhammadwahab55_db_user';
const database = 'pos_system';

// Get current password from .env
const currentUri = process.env.MONGODB_URI || '';
let currentPassword = '';

if (currentUri) {
  const match = currentUri.match(/mongodb\+srv:\/\/[^:]+:([^@]+)@/);
  if (match) {
    currentPassword = match[1];
  }
}

console.log('📋 Current Configuration:');
console.log('─'.repeat(60));
console.log(`   Username: ${username}`);
console.log(`   Password: ${currentPassword ? currentPassword.replace(/./g, '*') + ` (${currentPassword.length} chars)` : 'NOT SET'}`);
console.log(`   Cluster: ${cluster}`);
console.log(`   Database: ${database}`);
console.log('─'.repeat(60));

// Common password variations to test
const passwordVariations = [
  'PAKistan123',      // Current
  'pakistan123',      // All lowercase
  'PAKISTAN123',      // All uppercase
  'Pakistan123',      // First letter uppercase
  'pakISTAN123',      // Mixed
];

console.log('\n🧪 Testing password variations...\n');

async function testPassword(password) {
  const testUri = `mongodb+srv://${username}:${password}@${cluster}/${database}?retryWrites=true&w=majority`;
  
  try {
    await mongoose.connect(testUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000,
    });
    
    await mongoose.disconnect();
    return { success: true, password };
  } catch (error) {
    await mongoose.disconnect().catch(() => {});
    return { success: false, password, error: error.message };
  }
}

async function diagnose() {
  console.log('Testing current password...');
  const currentResult = await testPassword(currentPassword);
  
  if (currentResult.success) {
    console.log(`✅ Current password "${currentPassword.replace(/./g, '*')}" is CORRECT!`);
    console.log('\n💡 If you\'re still getting errors:');
    console.log('1. Check if the server is using the correct .env file');
    console.log('2. Restart the server: npm start');
    console.log('3. Check server logs for detailed error messages');
    return;
  }
  
  console.log(`❌ Current password failed: ${currentResult.error}\n`);
  console.log('Testing common password variations...\n');
  
  for (const password of passwordVariations) {
    if (password === currentPassword) continue;
    
    process.stdout.write(`Testing "${password.replace(/./g, '*')}"... `);
    const result = await testPassword(password);
    
    if (result.success) {
      console.log('✅ SUCCESS!');
      console.log(`\n🎉 Found working password: ${password}`);
      console.log('\n📝 Update your .env file:');
      console.log(`MONGODB_URI=mongodb+srv://${username}:${password}@${cluster}/${database}?retryWrites=true&w=majority`);
      
      // Update .env file
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(__dirname, '.env');
      
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        envContent = envContent.replace(
          /MONGODB_URI=.*/,
          `MONGODB_URI=mongodb+srv://${username}:${password}@${cluster}/${database}?retryWrites=true&w=majority`
        );
        fs.writeFileSync(envPath, envContent);
        console.log('\n✅ .env file updated automatically!');
      }
      
      return;
    } else {
      console.log('❌ Failed');
    }
  }
  
  console.log('\n❌ None of the tested passwords worked.');
  console.log('\n💡 Solutions:');
  console.log('1. Go to MongoDB Atlas: https://cloud.mongodb.com/');
  console.log('2. Navigate to: Security → Database Access');
  console.log('3. Find user:', username);
  console.log('4. Click "Edit" and check/reset the password');
  console.log('5. Update MONGODB_URI in backend/.env with the correct password');
  console.log('6. Make sure password is URL-encoded if it has special characters');
  console.log('\n📝 To URL-encode password manually:');
  console.log('   - Use encodeURIComponent() in JavaScript');
  console.log('   - Or use online URL encoder');
  console.log('   - Special chars like @, :, /, #, ? need encoding');
}

diagnose().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});

