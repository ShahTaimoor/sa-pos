/**
 * Migration Service
 * 
 * Handles schema migrations safely and reversibly
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const schemaVersionService = require('./schemaVersionService');
const fs = require('fs');
const path = require('path');

class MigrationService {
  constructor() {
    this.migrationsPath = path.join(__dirname, '../migrations');
    this.migrationRegistry = this.loadMigrationRegistry();
  }

  /**
   * Load migration registry
   * @returns {Object} Migration registry
   */
  loadMigrationRegistry() {
    const registry = {};
    
    try {
      // Load all migration directories
      const migrationsDir = this.migrationsPath;
      
      if (!fs.existsSync(migrationsDir)) {
        logger.warn(`Migrations directory not found: ${migrationsDir}`);
        return registry;
      }
      
      const versionDirs = fs.readdirSync(migrationsDir)
        .filter(dir => dir.startsWith('v') && fs.statSync(path.join(migrationsDir, dir)).isDirectory());
      
      for (const versionDir of versionDirs) {
        const version = versionDir.substring(1); // Remove 'v' prefix
        const versionPath = path.join(migrationsDir, versionDir);
        const migrationFiles = fs.readdirSync(versionPath)
          .filter(file => file.endsWith('.js'));
        
        registry[version] = {};
        
        for (const file of migrationFiles) {
          try {
            const migration = require(path.join(versionPath, file));
            const modelName = migration.model || this.extractModelName(file);
            
            if (!registry[version][modelName]) {
              registry[version][modelName] = [];
            }
            
            registry[version][modelName].push({
              file: file,
              path: path.join(versionPath, file),
              ...migration
            });
          } catch (error) {
            logger.error(`Error loading migration ${file}:`, error);
          }
        }
      }
    } catch (error) {
      logger.error('Error loading migration registry:', error);
    }
    
    return registry;
  }

  /**
   * Extract model name from filename
   * @param {String} filename - Filename
   * @returns {String} Model name
   */
  extractModelName(filename) {
    // Remove extension and common prefixes
    return filename
      .replace('.js', '')
      .replace(/^add/, '')
      .replace(/^remove/, '')
      .replace(/^update/, '')
      .replace(/To/, '')
      .replace(/From/, '')
      .split(/(?=[A-Z])/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  /**
   * Run migration for a specific version and model
   * @param {String} version - Version to migrate to
   * @param {String} modelName - Model name
   * @param {Object} options - Options
   * @returns {Promise<Object>} Migration result
   */
  async runMigration(version, modelName, options = {}) {
    const {
      dryRun = false,
      batchSize = 100,
      validate = true
    } = options;
    
    try {
      logger.info(`Starting migration: ${modelName} to version ${version}`);
      
      // Check if migration exists
      if (!this.migrationRegistry[version] || !this.migrationRegistry[version][modelName]) {
        throw new Error(`Migration not found: ${version} for ${modelName}`);
      }
      
      const migrations = this.migrationRegistry[version][modelName];
      
      if (dryRun) {
        logger.info(`[DRY RUN] Would run ${migrations.length} migration(s) for ${modelName}`);
        return {
          success: true,
          dryRun: true,
          migrations: migrations.length
        };
      }
      
      // Run each migration
      const results = [];
      
      for (const migration of migrations) {
        logger.info(`Running migration: ${migration.file}`);
        
        try {
          // Validate before migration
          if (validate && migration.validate) {
            logger.info('Validating before migration...');
            await migration.validate(mongoose.connection.db);
          }
          
          // Run migration
          const result = await migration.up(mongoose.connection.db);
          results.push({
            migration: migration.file,
            success: true,
            result
          });
          
          logger.info(`Migration ${migration.file} completed successfully`);
        } catch (error) {
          logger.error(`Migration ${migration.file} failed:`, error);
          results.push({
            migration: migration.file,
            success: false,
            error: error.message
          });
          
          // If critical, stop
          if (migration.critical !== false) {
            throw error;
          }
        }
      }
      
      // Validate after migration
      if (validate) {
        for (const migration of migrations) {
          if (migration.validate) {
            logger.info('Validating after migration...');
            await migration.validate(mongoose.connection.db);
          }
        }
      }
      
      // Update current version
      schemaVersionService.updateCurrentVersion(modelName, version);
      
      return {
        success: true,
        version,
        modelName,
        results
      };
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Rollback migration
   * @param {String} version - Version to rollback from
   * @param {String} modelName - Model name
   * @param {Object} options - Options
   * @returns {Promise<Object>} Rollback result
   */
  async rollbackMigration(version, modelName, options = {}) {
    const { dryRun = false } = options;
    
    try {
      logger.info(`Rolling back migration: ${modelName} from version ${version}`);
      
      // Check if migration exists
      if (!this.migrationRegistry[version] || !this.migrationRegistry[version][modelName]) {
        throw new Error(`Migration not found: ${version} for ${modelName}`);
      }
      
      const migrations = this.migrationRegistry[version][modelName];
      
      if (dryRun) {
        logger.info(`[DRY RUN] Would rollback ${migrations.length} migration(s) for ${modelName}`);
        return {
          success: true,
          dryRun: true,
          migrations: migrations.length
        };
      }
      
      // Rollback in reverse order
      const results = [];
      
      for (let i = migrations.length - 1; i >= 0; i--) {
        const migration = migrations[i];
        
        if (!migration.down) {
          logger.warn(`Migration ${migration.file} has no rollback script`);
          continue;
        }
        
        logger.info(`Rolling back migration: ${migration.file}`);
        
        try {
          const result = await migration.down(mongoose.connection.db);
          results.push({
            migration: migration.file,
            success: true,
            result
          });
          
          logger.info(`Rollback ${migration.file} completed successfully`);
        } catch (error) {
          logger.error(`Rollback ${migration.file} failed:`, error);
          results.push({
            migration: migration.file,
            success: false,
            error: error.message
          });
        }
      }
      
      // Determine previous version
      const previousVersion = this.getPreviousVersion(version);
      schemaVersionService.updateCurrentVersion(modelName, previousVersion);
      
      return {
        success: true,
        version,
        modelName,
        previousVersion,
        results
      };
    } catch (error) {
      logger.error('Rollback failed:', error);
      throw error;
    }
  }

  /**
   * Get previous version
   * @param {String} version - Current version
   * @returns {String} Previous version
   */
  getPreviousVersion(version) {
    const parsed = schemaVersionService.parseVersion(version);
    
    if (parsed.patch > 0) {
      return `${parsed.major}.${parsed.minor}.${parsed.patch - 1}`;
    } else if (parsed.minor > 0) {
      return `${parsed.major}.${parsed.minor - 1}.0`;
    } else if (parsed.major > 1) {
      return `${parsed.major - 1}.0.0`;
    }
    
    return '1.0.0';
  }

  /**
   * Get pending migrations for a model
   * @param {String} modelName - Model name
   * @returns {Array<Object>} Pending migrations
   */
  getPendingMigrations(modelName) {
    const currentVersion = schemaVersionService.getCurrentVersion(modelName);
    const pending = [];
    
    for (const version in this.migrationRegistry) {
      if (schemaVersionService.compareVersions(version, currentVersion) > 0) {
        if (this.migrationRegistry[version][modelName]) {
          pending.push({
            version,
            migrations: this.migrationRegistry[version][modelName]
          });
        }
      }
    }
    
    return pending.sort((a, b) => 
      schemaVersionService.compareVersions(a.version, b.version)
    );
  }

  /**
   * Validate all migrations
   * @returns {Promise<Object>} Validation result
   */
  async validateAllMigrations() {
    const results = {};
    
    for (const version in this.migrationRegistry) {
      for (const modelName in this.migrationRegistry[version]) {
        const migrations = this.migrationRegistry[version][modelName];
        
        for (const migration of migrations) {
          try {
            if (migration.validate) {
              await migration.validate(mongoose.connection.db);
              results[`${version}:${modelName}:${migration.file}`] = {
                success: true
              };
            }
          } catch (error) {
            results[`${version}:${modelName}:${migration.file}`] = {
              success: false,
              error: error.message
            };
          }
        }
      }
    }
    
    return results;
  }
}

module.exports = new MigrationService();
