/**
 * Schema Version Middleware
 * 
 * Ensures documents have schema version and adapts old versions
 */

const schemaVersionService = require('../services/schemaVersionService');
const logger = require('../utils/logger');

/**
 * Middleware to ensure schema version on save
 */
function ensureSchemaVersion(modelName) {
  return async function(req, res, next) {
    try {
      // For POST requests, ensure schema version
      if (req.method === 'POST' && req.body) {
        req.body.schemaVersion = schemaVersionService.getCurrentVersion(modelName);
      }
      
      // For PUT/PATCH requests, preserve existing version or set current
      if ((req.method === 'PUT' || req.method === 'PATCH') && req.body) {
        if (!req.body.schemaVersion) {
          req.body.schemaVersion = schemaVersionService.getCurrentVersion(modelName);
        }
      }
      
      next();
    } catch (error) {
      logger.error('Error in schema version middleware:', error);
      next(error);
    }
  };
}

/**
 * Middleware to adapt old schema versions
 */
function adaptSchemaVersion(modelName) {
  return async function(req, res, next) {
    try {
      // Adapt response data if needed
      if (res.locals.data) {
        const currentVersion = schemaVersionService.getCurrentVersion(modelName);
        
        if (Array.isArray(res.locals.data)) {
          res.locals.data = res.locals.data.map(doc => {
            if (schemaVersionService.needsMigration(doc, modelName)) {
              return adaptDocument(doc, modelName, currentVersion);
            }
            return doc;
          });
        } else if (res.locals.data) {
          if (schemaVersionService.needsMigration(res.locals.data, modelName)) {
            res.locals.data = adaptDocument(res.locals.data, modelName, currentVersion);
          }
        }
      }
      
      next();
    } catch (error) {
      logger.error('Error in schema adaptation middleware:', error);
      next(error);
    }
  };
}

/**
 * Adapt document to current schema version
 * @param {Object} doc - Document
 * @param {String} modelName - Model name
 * @param {String} currentVersion - Current version
 * @returns {Object} Adapted document
 */
function adaptDocument(doc, modelName, currentVersion) {
  if (!doc || !doc.schemaVersion) {
    return doc;
  }
  
  const docVersion = doc.schemaVersion;
  
  // If already at current version, no adaptation needed
  if (schemaVersionService.compareVersions(docVersion, currentVersion) >= 0) {
    return doc;
  }
  
  // Load adapter for this model
  try {
    const adapter = require(`../adapters/${modelName}Adapter`);
    if (adapter && adapter.adapt) {
      return adapter.adapt(doc, docVersion, currentVersion);
    }
  } catch (error) {
    // Adapter not found, return as-is
    logger.debug(`No adapter found for ${modelName}, returning document as-is`);
  }
  
  return doc;
}

module.exports = {
  ensureSchemaVersion,
  adaptSchemaVersion
};

