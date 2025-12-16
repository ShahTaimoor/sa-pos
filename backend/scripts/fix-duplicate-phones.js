/**
 * Script to find and report duplicate phone numbers in Customer collection
 * Run with: node backend/scripts/fix-duplicate-phones.js
 * 
 * NOTE: Before adding unique index on phone, you must resolve existing duplicates
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Customer = require('../models/Customer');

async function findDuplicatePhones() {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB\n');

    // Find duplicate phone numbers (excluding null/empty)
    const duplicates = await Customer.aggregate([
      {
        $match: {
          phone: { $exists: true, $ne: null, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$phone',
          count: { $sum: 1 },
          customerIds: { $push: '$_id' },
          customerNames: { $push: '$businessName' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    if (duplicates.length === 0) {
      console.log('✅ No duplicate phone numbers found. Safe to add unique index.');
      process.exit(0);
    }

    console.log(`⚠️  Found ${duplicates.length} duplicate phone number(s):\n`);

    for (const dup of duplicates) {
      console.log(`Phone: ${dup._id}`);
      console.log(`  Count: ${dup.count}`);
      console.log(`  Customers:`);
      dup.customerIds.forEach((id, idx) => {
        console.log(`    - ${id}: ${dup.customerNames[idx]}`);
      });
      console.log('');
    }

    console.log('\n💡 To fix duplicates:');
    console.log('1. Review each duplicate and decide which customer record to keep');
    console.log('2. Update or remove phone numbers from duplicate records');
    console.log('3. Run this script again to verify no duplicates remain');
    console.log('4. Then add unique index: db.customers.createIndex({ phone: 1 }, { unique: true, sparse: true })');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error finding duplicates:', error);
    process.exit(1);
  }
}

findDuplicatePhones();

