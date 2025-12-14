const fs = require('fs');
const path = require('path');

// Create .env file with default values
const envContent = `# Environment Variables for POS System
NODE_ENV=development
PORT=5000

# JWT Secret - REQUIRED: Change this to a secure random string in production
JWT_SECRET=

# MongoDB Configuration - REQUIRED: Set your MongoDB connection string
# For MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/pos_system?retryWrites=true&w=majority
# For Local MongoDB: mongodb://localhost:27017/pos_system
MONGODB_URI=

# To use MongoDB Atlas:
# 1. Create account at https://cloud.mongodb.com/
# 2. Create a cluster and database user
# 3. Whitelist your IP address in Network Access
# 4. Copy connection string and set MONGODB_URI above
`;

const envPath = path.join(__dirname, '.env');

try {
  // Check if .env file already exists
  if (fs.existsSync(envPath)) {
    console.log('📄 .env file already exists');
    console.log('📖 Current .env content:');
    console.log('─'.repeat(50));
    console.log(fs.readFileSync(envPath, 'utf8'));
    console.log('─'.repeat(50));
  } else {
    // Create .env file
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env file created successfully!');
    console.log('📄 Location:', envPath);
  }
  
  console.log('\n🔧 Next steps:');
  console.log('1. Choose MongoDB setup option:');
  console.log('   a) Local MongoDB: Install from https://www.mongodb.com/try/download/community');
  console.log('   b) MongoDB Atlas: Create free account at https://cloud.mongodb.com/');
  console.log('2. Update MONGODB_URI in .env file if using Atlas');
  console.log('3. Run: node quick-start.js');
  console.log('4. Start servers: npm start (backend) and npm start (frontend)');
  
} catch (error) {
  console.error('❌ Error creating .env file:', error.message);
}
