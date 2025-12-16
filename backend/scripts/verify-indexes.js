/**
 * Script to verify MongoDB indexes are properly configured
 * Run with: node backend/scripts/verify-indexes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const models = {
  Customer: require('../models/Customer'),
  Product: require('../models/Product'),
  Sales: require('../models/Sales'),
  Inventory: require('../models/Inventory'),
  Transaction: require('../models/Transaction'),
  AccountCategory: require('../models/AccountCategory'),
  User: require('../models/User'),
  Investor: require('../models/Investor'),
};

async function verifyIndexes() {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB\n');

    for (const [modelName, Model] of Object.entries(models)) {
      console.log(`\n📋 Checking indexes for ${modelName}:`);
      const indexes = await Model.collection.getIndexes();
      
      console.log('Indexes:');
      for (const [indexName, indexSpec] of Object.entries(indexes)) {
        const isUnique = indexSpec.unique ? '✅ UNIQUE' : '';
        const isSparse = indexSpec.sparse ? 'SPARSE' : '';
        console.log(`  - ${indexName}: ${JSON.stringify(indexSpec.key)} ${isUnique} ${isSparse}`);
      }

      // Check for expected unique indexes
      const schema = Model.schema;
      const uniqueFields = [];
      
      schema.eachPath((path, schemaType) => {
        if (schemaType.options && schemaType.options.unique) {
          uniqueFields.push(path);
        }
      });

      if (uniqueFields.length > 0) {
        console.log(`\nExpected unique fields: ${uniqueFields.join(', ')}`);
        
        for (const field of uniqueFields) {
          const hasIndex = Object.values(indexes).some(index => 
            index.key[field] !== undefined && index.unique
          );
          
          if (!hasIndex) {
            console.log(`  ⚠️  WARNING: Field '${field}' is marked as unique but no unique index found!`);
          } else {
            console.log(`  ✅ Field '${field}' has unique index`);
          }
        }
      }
    }

    console.log('\n✅ Index verification complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error verifying indexes:', error);
    process.exit(1);
  }
}

verifyIndexes();

