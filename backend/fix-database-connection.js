const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Script to fix database connection - ensures pos_system database is used
 */

console.log('🔧 Fixing Database Connection Configuration...\n');

const envPath = path.join(__dirname, '.env');

if (!process.env.MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required.');
  console.error('   Please set it in your .env file or as an environment variable.');
  console.error('   This script validates that the connection string includes /pos_system');
  process.exit(1);
}

const correctUri = process.env.MONGODB_URI;

// Check if .env exists
if (!fs.existsSync(envPath)) {
  console.log('❌ .env file not found! Creating it...');
  const envContent = `# Environment Variables for POS System
NODE_ENV=development
PORT=5000

# JWT Secret - REQUIRED: Change this to a secure random string in production
JWT_SECRET=

# MongoDB Configuration - REQUIRED: Set your MongoDB connection string
MONGODB_URI=${correctUri}
`;
  fs.writeFileSync(envPath, envContent);
  console.log('✅ .env file created!');
} else {
  // Read existing .env
  let envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  let updated = false;
  
  // Find and update MONGODB_URI
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('MONGODB_URI=')) {
      const currentUri = lines[i].split('=')[1]?.trim() || '';
      
      // Check if database name is missing or wrong
      if (!currentUri.includes('/pos_system') || currentUri.includes('/test')) {
        console.log('⚠️  Found incorrect database in connection string');
        console.log('   Current:', currentUri.replace(/:[^:@]+@/, ':***@'));
        lines[i] = `MONGODB_URI=${correctUri}`;
        updated = true;
        console.log('✅ Updated to correct connection string');
      } else if (currentUri !== correctUri) {
        // Update to new cluster if needed
        lines[i] = `MONGODB_URI=${correctUri}`;
        updated = true;
        console.log('✅ Updated connection string to new cluster');
      } else {
        console.log('✅ Connection string is already correct');
      }
      break;
    }
  }
  
  // If MONGODB_URI not found, add it
  if (!lines.some(line => line.trim().startsWith('MONGODB_URI='))) {
    lines.push('');
    lines.push(`# MongoDB Configuration (Atlas - Active)`);
    lines.push(`MONGODB_URI=${correctUri}`);
    updated = true;
    console.log('✅ Added MONGODB_URI to .env file');
  }
  
  if (updated) {
    fs.writeFileSync(envPath, lines.join('\n'));
    console.log('\n📝 .env file updated successfully!');
  }
}

// Verify the connection string
console.log('\n📋 Current Configuration:');
console.log('─'.repeat(60));
const finalEnvContent = fs.readFileSync(envPath, 'utf8');
const uriLine = finalEnvContent.split('\n').find(line => line.trim().startsWith('MONGODB_URI='));
if (uriLine) {
  const uri = uriLine.split('=')[1]?.trim() || '';
  console.log('MONGODB_URI:', uri.replace(/:[^:@]+@/, ':***@'));
  
  // Check database name
  if (uri.includes('/pos_system')) {
    console.log('✅ Database name: pos_system (CORRECT)');
  } else if (uri.includes('/test')) {
    console.log('❌ Database name: test (WRONG - will be fixed)');
  } else {
    const dbMatch = uri.match(/mongodb\+srv:\/\/[^/]+\/([^?]+)/);
    const dbName = dbMatch ? dbMatch[1] : 'NOT SPECIFIED';
    console.log(`⚠️  Database name: ${dbName}`);
  }
}

console.log('\n✅ Configuration check complete!');
console.log('\n💡 Next steps:');
console.log('1. Restart your backend server: npm start');
console.log('2. Verify it connects to "pos_system" database');
console.log('3. Check server logs for: "Connected to database: pos_system"');

