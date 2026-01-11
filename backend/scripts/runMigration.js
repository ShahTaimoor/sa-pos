/**
 * Migration Runner Script
 * 
 * Runs schema migrations safely
 */

const mongoose = require('mongoose');
const migrationService = require('../services/migrationService');
require('dotenv').config();

async function runMigration() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const options = {
    version: null,
    model: null,
    rollback: false,
    dryRun: false,
    validate: true
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--version':
      case '-v':
        options.version = args[++i];
        break;
      case '--model':
      case '-m':
        options.model = args[++i];
        break;
      case '--rollback':
      case '-r':
        options.rollback = true;
        break;
      case '--dry-run':
      case '-d':
        options.dryRun = true;
        break;
      case '--no-validate':
        options.validate = false;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }
  
  if (!options.version || !options.model) {
    console.error('Error: --version and --model are required');
    printHelp();
    process.exit(1);
  }
  
  try {
    // Connect to database
    const connectionString = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/sa-pos';
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(connectionString, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB\n');
    
    // Run migration or rollback
    let result;
    if (options.rollback) {
      console.log(`🔄 Rolling back migration: ${options.model} from version ${options.version}`);
      result = await migrationService.rollbackMigration(
        options.version,
        options.model,
        { dryRun: options.dryRun, validate: options.validate }
      );
    } else {
      console.log(`🚀 Running migration: ${options.model} to version ${options.version}`);
      result = await migrationService.runMigration(
        options.version,
        options.model,
        { dryRun: options.dryRun, validate: options.validate }
      );
    }
    
    if (result.success) {
      console.log('\n' + '='.repeat(50));
      console.log('✅ Migration completed successfully!');
      console.log('='.repeat(50));
      console.log('\nResults:');
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error('\n❌ Migration failed');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Migration error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

function printHelp() {
  console.log(`
Usage: node runMigration.js [options]

Options:
  --version, -v <version>    Schema version to migrate to (e.g., 1.1.0)
  --model, -m <model>        Model name (e.g., Sales, Product)
  --rollback, -r             Rollback migration instead of running
  --dry-run, -d              Show what would be done without executing
  --no-validate              Skip validation
  --help, -h                 Show this help message

Examples:
  # Run migration
  node runMigration.js --version 1.1.0 --model Sales
  
  # Rollback migration
  node runMigration.js --version 1.1.0 --model Sales --rollback
  
  # Dry run
  node runMigration.js --version 1.1.0 --model Sales --dry-run
`);
}

// Run if executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };

