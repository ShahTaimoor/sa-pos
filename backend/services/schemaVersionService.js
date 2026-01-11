/**
 * Schema Version Service
 * 
 * Manages schema versions and provides backward compatibility
 */

const logger = require('../utils/logger');

// Current schema versions for each model
const CURRENT_SCHEMA_VERSIONS = {
  Product: '1.0.0',
  Sales: '1.0.0',
  Customer: '1.0.0',
  Inventory: '1.0.0',
  CustomerTransaction: '1.0.0',
  PurchaseOrder: '1.0.0',
  Payment: '1.0.0',
  Return: '1.0.0'
};

class SchemaVersionService {
  /**
   * Get current schema version for a model
   * @param {String} modelName - Model name
   * @returns {String} Current version
   */
  getCurrentVersion(modelName) {
    return CURRENT_SCHEMA_VERSIONS[modelName] || '1.0.0';
  }

  /**
   * Check if document needs migration
   * @param {Object} document - Document to check
   * @param {String} modelName - Model name
   * @returns {Boolean} True if needs migration
   */
  needsMigration(document, modelName) {
    if (!document) return false;
    
    const currentVersion = this.getCurrentVersion(modelName);
    const documentVersion = document.schemaVersion || '1.0.0';
    
    return this.compareVersions(documentVersion, currentVersion) < 0;
  }

  /**
   * Compare two version strings
   * @param {String} v1 - Version 1
   * @param {String} v2 - Version 2
   * @returns {Number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      
      if (part1 < part2) return -1;
      if (part1 > part2) return 1;
    }
    
    return 0;
  }

  /**
   * Get version parts
   * @param {String} version - Version string
   * @returns {Object} Version parts
   */
  parseVersion(version) {
    const parts = version.split('.').map(Number);
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0,
      raw: version
    };
  }

  /**
   * Check if version is breaking change
   * @param {String} fromVersion - From version
   * @param {String} toVersion - To version
   * @returns {Boolean} True if breaking change
   */
  isBreakingChange(fromVersion, toVersion) {
    const from = this.parseVersion(fromVersion);
    const to = this.parseVersion(toVersion);
    
    return from.major !== to.major;
  }

  /**
   * Ensure document has schema version
   * @param {Object} document - Document
   * @param {String} modelName - Model name
   * @returns {Object} Document with schema version
   */
  ensureSchemaVersion(document, modelName) {
    if (!document) return document;
    
    if (!document.schemaVersion) {
      document.schemaVersion = '1.0.0';
    }
    
    return document;
  }

  /**
   * Set schema version on document
   * @param {Object} document - Document
   * @param {String} version - Version to set
   * @returns {Object} Document with version set
   */
  setSchemaVersion(document, version) {
    if (!document) return document;
    
    document.schemaVersion = version;
    return document;
  }

  /**
   * Get migration path between versions
   * @param {String} fromVersion - From version
   * @param {String} toVersion - To version
   * @returns {Array<String>} Array of versions to migrate through
   */
  getMigrationPath(fromVersion, toVersion) {
    const from = this.parseVersion(fromVersion);
    const to = this.parseVersion(toVersion);
    
    if (this.compareVersions(fromVersion, toVersion) >= 0) {
      return [];
    }
    
    const path = [];
    
    // If major version change, need to migrate through all versions
    if (from.major !== to.major) {
      // For simplicity, return direct path
      // In production, you'd want to migrate through each major version
      path.push(toVersion);
    } else if (from.minor !== to.minor) {
      // Minor version change
      path.push(toVersion);
    } else {
      // Patch version change
      path.push(toVersion);
    }
    
    return path;
  }

  /**
   * Update current schema version for a model
   * @param {String} modelName - Model name
   * @param {String} version - New version
   */
  updateCurrentVersion(modelName, version) {
    CURRENT_SCHEMA_VERSIONS[modelName] = version;
    logger.info(`Updated schema version for ${modelName} to ${version}`);
  }

  /**
   * Get all current versions
   * @returns {Object} All current versions
   */
  getAllCurrentVersions() {
    return { ...CURRENT_SCHEMA_VERSIONS };
  }
}

module.exports = new SchemaVersionService();

