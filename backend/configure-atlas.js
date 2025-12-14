const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Script to configure MongoDB Atlas connection
 * This will update or create the .env file with Atlas configuration
 */

// ATLAS_URI should be provided via command line argument or environment variable
// Usage: node configure-atlas.js "mongodb+srv://username:password@cluster.mongodb.net/pos_system?retryWrites=true&w=majority"
const ATLAS_URI = process.argv[2] || process.env.ATLAS_URI || '';

if (!ATLAS_URI) {
  console.error('❌ Error: MongoDB Atlas URI is required.');
  console.error('   Usage: node configure-atlas.js "mongodb+srv://username:password@cluster.mongodb.net/pos_system?retryWrites=true&w=majority"');
  console.error('   Or set ATLAS_URI environment variable.');
  process.exit(1);
}

console.log('🔧 Configuring MongoDB Atlas Connection...\n');

const envPath = path.join(__dirname, '.env');
let envContent = '';

// Read existing .env if it exists
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
  console.log('📄 Found existing .env file');
} else {
  console.log('📄 Creating new .env file');
  envContent = `# Environment Variables for POS System
NODE_ENV=development
PORT=5000

# JWT Secret - REQUIRED: Change this to a secure random string in production
JWT_SECRET=

# MongoDB Configuration - REQUIRED: Set your MongoDB connection string
MONGODB_URI=
`;
}

// Update or add MONGODB_URI
const lines = envContent.split('\n');
let updated = false;
let mongoUriLineIndex = -1;

// Find and update existing MONGODB_URI line
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim().startsWith('MONGODB_URI=')) {
    const currentUri = lines[i].split('=')[1]?.trim() || '';
    if (currentUri !== ATLAS_URI) {
      lines[i] = `MONGODB_URI=${ATLAS_URI}`;
      updated = true;
      mongoUriLineIndex = i;
      console.log('✅ Updated MONGODB_URI to Atlas connection string');
    } else {
      console.log('✅ MONGODB_URI already set to Atlas');
    }
    break;
  }
}

// If MONGODB_URI not found, add it
if (mongoUriLineIndex === -1) {
  // Find where to insert (after JWT_SECRET or at the end)
  let insertIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('JWT_SECRET=')) {
      insertIndex = i + 1;
      break;
    }
  }
  
  if (insertIndex === -1) {
    lines.push('');
    lines.push(`# MongoDB Configuration`);
    lines.push(`MONGODB_URI=${ATLAS_URI}`);
  } else {
    lines.splice(insertIndex, 0, '');
    lines.splice(insertIndex + 1, 0, `# MongoDB Configuration`);
    lines.splice(insertIndex + 2, 0, `MONGODB_URI=${ATLAS_URI}`);
  }
  updated = true;
  console.log('✅ Added MONGODB_URI to .env file');
}

// Write updated content
if (updated) {
  fs.writeFileSync(envPath, lines.join('\n'));
  console.log('\n📝 .env file updated successfully!');
} else {
  console.log('\n✅ .env file is already configured correctly');
}

console.log('\n📋 Current MongoDB Configuration:');
console.log('─'.repeat(60));
console.log(`MONGODB_URI=${ATLAS_URI}`);
console.log('─'.repeat(60));

console.log('\n🔍 Next Steps:');
console.log('1. Verify your MongoDB Atlas cluster is accessible');
console.log('2. Ensure your IP address is whitelisted in Atlas Network Access');
console.log('3. Test connection: node test-connection.js');
console.log('4. Start the server: npm start\n');

// Test connection
console.log('🧪 Testing MongoDB Atlas connection...\n');
const mongoose = require('mongoose');

mongoose.connect(ATLAS_URI)
.then(() => {
  console.log('✅ Successfully connected to MongoDB Atlas!');
  console.log('✅ Database: pos_system');
  console.log('✅ Cluster: cluster0.yrhubi5.mongodb.net');
  mongoose.connection.close();
  process.exit(0);
})
.catch((error) => {
  console.error('❌ Failed to connect to MongoDB Atlas:');
  console.error('   Error:', error.message);
  console.error('\n💡 Troubleshooting:');
  console.error('   1. Check your Atlas connection string');
  console.error('   2. Verify your IP is whitelisted in Atlas');
  console.error('   3. Check your username and password');
  console.error('   4. Ensure the cluster is running');
  process.exit(1);
});

