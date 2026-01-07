/**
 * Script to reset admin user password
 * Run with: node backend/scripts/reset-admin-password.js
 * 
 * Usage:
 *   node backend/scripts/reset-admin-password.js
 *   node backend/scripts/reset-admin-password.js --email admin@example.com --password newpassword123
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const readline = require('readline');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        parsed[key] = value;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  
  return parsed;
}

// Create readline interface for user input
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// Prompt for user input
function prompt(question) {
  const rl = createReadlineInterface();
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Prompt for password (with simple input, password will be visible)
function promptPassword(question) {
  const rl = createReadlineInterface();
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function resetAdminPassword() {
  try {
    // Connect to database
    await connectDB();
    console.log('✅ Connected to MongoDB\n');

    // Parse command line arguments
    const args = parseArgs();
    
    let email, password;

    // Get email
    if (args.email) {
      email = args.email;
    } else {
      email = await prompt('Enter admin email (default: admin@example.com): ');
      if (!email.trim()) {
        email = 'admin@example.com';
      }
    }

    // Find admin user
    const adminUser = await User.findOne({ 
      email: email.toLowerCase().trim(),
      role: 'admin',
      isDeleted: { $ne: true }
    });

    if (!adminUser) {
      console.error(`❌ Admin user with email ${email} not found`);
      console.log('\n💡 Available admin users:');
      const allAdmins = await User.find({ role: 'admin', isDeleted: { $ne: true } });
      if (allAdmins.length === 0) {
        console.log('   No admin users found. Use create-admin.js to create one.');
      } else {
        allAdmins.forEach(admin => {
          console.log(`   - ${admin.email} (${admin.firstName} ${admin.lastName})`);
        });
      }
      process.exit(1);
    }

    console.log(`\n📋 Found admin user:`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Name: ${adminUser.firstName} ${adminUser.lastName}`);
    console.log(`   Created: ${adminUser.createdAt}\n`);

    // Get new password
    if (args.password) {
      password = args.password;
    } else {
      console.log('⚠️  Note: Password will be visible as you type (for security, use --password argument)');
      password = await promptPassword('Enter new password (min 6 characters): ');
      if (password.length < 6) {
        console.error('\n❌ Password must be at least 6 characters');
        process.exit(1);
      }
      
      const confirmPassword = await promptPassword('Confirm new password: ');
      if (password !== confirmPassword) {
        console.error('\n❌ Passwords do not match');
        process.exit(1);
      }
    }

    // Reset password
    console.log('\n📝 Resetting password...');
    
    // Update password (the pre-save middleware will hash it automatically)
    adminUser.password = password;
    await adminUser.save();

    console.log('\n✅ Password reset successfully!');
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   New password has been set`);
    console.log('\n💡 You can now login with this account.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error resetting password:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

// Run the script
resetAdminPassword();


