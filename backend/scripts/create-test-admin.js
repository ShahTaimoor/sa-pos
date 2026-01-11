/**
 * Script to create a second admin user for testing tenant isolation
 * Run with: node backend/scripts/create-test-admin.js
 * 
 * Usage:
 *   node backend/scripts/create-test-admin.js
 *   node backend/scripts/create-test-admin.js --email admin2@test.com --password password123 --tenantId <tenantId>
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

async function createTestAdmin() {
  try {
    // Connect to database
    await connectDB();
    console.log('✅ Connected to MongoDB\n');

    // Get all existing admin users
    const existingAdmins = await User.find({ 
      role: 'admin', 
      isDeleted: { $ne: true } 
    }).select('email firstName lastName tenantId _id');

    if (existingAdmins.length === 0) {
      console.log('⚠️  No existing admin users found.');
      console.log('💡 Please create the first admin using: node backend/scripts/create-admin.js');
      console.log('   (Note: You may need to update that script to include tenantId)');
      process.exit(1);
    }

    console.log('📋 Existing Admin Users:');
    existingAdmins.forEach((admin, index) => {
      console.log(`   ${index + 1}. ${admin.email} (${admin.firstName} ${admin.lastName})`);
      console.log(`      Tenant ID: ${admin.tenantId}`);
      console.log(`      User ID: ${admin._id}\n`);
    });

    // Parse command line arguments
    const args = parseArgs();
    
    let firstName, lastName, email, password, phone, department, tenantId;

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

    // Check if email already exists (per tenant)
    const existingUser = await User.findOne({ 
      email: email.toLowerCase().trim(),
      isDeleted: { $ne: true }
    });
    if (existingUser) {
      console.error(`❌ User with email ${email} already exists`);
      console.error(`   Existing user: ${existingUser.firstName} ${existingUser.lastName}`);
      console.error(`   Tenant ID: ${existingUser.tenantId}`);
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

    // Handle tenantId
    if (args.tenantId) {
      // Validate tenantId format
      if (!mongoose.Types.ObjectId.isValid(args.tenantId)) {
        console.error('❌ Invalid tenantId format. Must be a valid MongoDB ObjectId');
        process.exit(1);
      }
      tenantId = new mongoose.Types.ObjectId(args.tenantId);
    } else {
      console.log('\n📌 Tenant Selection:');
      console.log('   1. Use a different tenantId (for testing tenant isolation)');
      console.log('   2. Use the same tenantId as an existing admin');
      
      const choice = await prompt('Enter choice (1 or 2): ');
      
      if (choice === '1') {
        // Create new tenantId
        tenantId = new mongoose.Types.ObjectId();
        console.log(`\n✅ Using new tenantId: ${tenantId}`);
        console.log('   This will create a completely isolated tenant for testing.');
      } else if (choice === '2') {
        // Use existing admin's tenantId
        if (existingAdmins.length === 1) {
          tenantId = existingAdmins[0].tenantId;
          console.log(`\n✅ Using existing tenantId: ${tenantId} (from ${existingAdmins[0].email})`);
        } else {
          console.log('\nSelect which admin\'s tenantId to use:');
          existingAdmins.forEach((admin, index) => {
            console.log(`   ${index + 1}. ${admin.email} (Tenant: ${admin.tenantId})`);
          });
          const adminChoice = await prompt('Enter admin number: ');
          const selectedIndex = parseInt(adminChoice) - 1;
          if (selectedIndex >= 0 && selectedIndex < existingAdmins.length) {
            tenantId = existingAdmins[selectedIndex].tenantId;
            console.log(`\n✅ Using tenantId: ${tenantId} (from ${existingAdmins[selectedIndex].email})`);
          } else {
            console.error('❌ Invalid selection');
            process.exit(1);
          }
        }
      } else {
        console.error('❌ Invalid choice');
        process.exit(1);
      }
    }

    phone = args.phone || await prompt('Enter phone (optional): ');
    department = args.department || await prompt('Enter department (optional): ');

    // Create admin user
    console.log('\n📝 Creating admin user...');
    
    const adminUser = new User({
      tenantId: tenantId,
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
    console.log(`   Tenant ID: ${adminUser.tenantId}`);
    console.log(`   User ID: ${adminUser._id}`);
    console.log('\n💡 You can now login with this account to test tenant isolation.');
    console.log('   Each tenant will only see data belonging to their tenantId.');

    // Show comparison
    console.log('\n📊 Tenant Comparison:');
    console.log('   Existing Admins:');
    existingAdmins.forEach((admin) => {
      console.log(`      - ${admin.email} (Tenant: ${admin.tenantId})`);
    });
    console.log(`   New Admin: ${adminUser.email} (Tenant: ${adminUser.tenantId})`);
    
    if (tenantId.toString() !== existingAdmins[0].tenantId.toString()) {
      console.log('\n✅ Different tenantId - Data will be isolated!');
      console.log('   Test by:');
      console.log('   1. Login as first admin and create some products/customers');
      console.log('   2. Login as second admin - you should NOT see the first admin\'s data');
    } else {
      console.log('\n⚠️  Same tenantId - Both admins will see the same data');
      console.log('   This is useful for testing multi-user scenarios within the same tenant.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    if (error.code === 11000) {
      console.error('   Email already exists in the database (per tenant)');
    }
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

// Run the script
createTestAdmin();
