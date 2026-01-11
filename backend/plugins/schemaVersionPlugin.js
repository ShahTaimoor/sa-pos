/**
 * Schema Version Plugin
 * 
 * Adds schemaVersion field to all schemas
 */

/**
 * Plugin to add schemaVersion to schema
 * @param {Object} schema - Mongoose schema
 * @param {Object} options - Options
 */
function schemaVersionPlugin(schema, options = {}) {
  const defaultVersion = options.defaultVersion || '1.0.0';
  
  // Add schemaVersion field
  schema.add({
    schemaVersion: {
      type: String,
      default: defaultVersion,
      required: true,
      index: true
    }
  });
  
  // Pre-save: Ensure schema version is set
  schema.pre('save', function(next) {
    if (!this.schemaVersion) {
      this.schemaVersion = defaultVersion;
    }
    next();
  });
  
  // Pre-create: Set schema version for new documents
  schema.pre('validate', function(next) {
    if (this.isNew && !this.schemaVersion) {
      this.schemaVersion = defaultVersion;
    }
    next();
  });
}

module.exports = schemaVersionPlugin;

