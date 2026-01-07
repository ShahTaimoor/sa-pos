/**
 * Script to create an admin user
 * Run with: node backend/scripts/create-admin.js
 * 
 * Usage:
 *   node backend/scripts/create-admin.js
 *   node backend/scripts/create-admin.js --email admin@example.com --password password123 --firstName Admin --lastName User
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
// Note: For production, consider using a library like 'readline-sync' or 'inquirer'
function promptPassword(question) {
  const rl = createReadlineInterface();
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function createAdmin() {
  try {
    // Connect to database
    await connectDB();
    console.log('✅ Connected to MongoDB\n');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin', isDeleted: { $ne: true } });
    if (existingAdmin) {
      console.log('⚠️  An admin user already exists:');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Name: ${existingAdmin.firstName} ${existingAdmin.lastName}`);
      console.log(`   Created: ${existingAdmin.createdAt}`);
      console.log('\n💡 If you want to create another admin, use the registration endpoint after logging in.');
      process.exit(0);
    }

    // Parse command line arguments
    const args = parseArgs();
    
    let firstName, lastName, email, password, phone, department;

    // Get user input
    if (args.firstName) {
      firstName = args.firstName;
    } else {
      firstName = await prompt('Enter first name: ');
      if (!firstName.trim()) {
        console.error('❌ First name is required');
        process.exit(1);
      }
    }

    if (args.lastName) {
      lastName = args.lastName;
    } else {
      lastName = await prompt('Enter last name: ');
      if (!lastName.trim()) {
        console.error('❌ Last name is required');
        process.exit(1);
      }
    }

    if (args.email) {
      email = args.email;
    } else {
      email = await prompt('Enter email: ');
      if (!email.trim()) {
        console.error('❌ Email is required');
        process.exit(1);
      }
      // Basic email validation
      if (!email.includes('@')) {
        console.error('❌ Invalid email format');
        process.exit(1);
      }
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      console.error(`❌ User with email ${email} already exists`);
      process.exit(1);
    }

    if (args.password) {
      password = args.password;
    } else {
      console.log('⚠️  Note: Password will be visible as you type (for security, use --password argument)');
      password = await promptPassword('Enter password (min 6 characters): ');
      if (password.length < 6) {
        console.error('\n❌ Password must be at least 6 characters');
        process.exit(1);
      }
      
      const confirmPassword = await promptPassword('Confirm password: ');
      if (password !== confirmPassword) {
        console.error('\n❌ Passwords do not match');
        process.exit(1);
      }
    }

    phone = args.phone || await prompt('Enter phone (optional): ');
    department = args.department || await prompt('Enter department (optional): ');

    // Create admin user
    console.log('\n📝 Creating admin user...');
    
    const adminUser = new User({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      role: 'admin',
      phone: phone.trim() || undefined,
      department: department.trim() || undefined,
      status: 'active',
      isActive: true
    });

    await adminUser.save();

    console.log('\n✅ Admin user created successfully!');
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Name: ${adminUser.firstName} ${adminUser.lastName}`);
    console.log(`   Role: ${adminUser.role}`);
    console.log(`   ID: ${adminUser._id}`);
    console.log('\n💡 You can now login with this account.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    if (error.code === 11000) {
      console.error('   Email already exists in the database');
    }
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

// Run the script
createAdmin();

