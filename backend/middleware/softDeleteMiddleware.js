/**
 * Soft Delete Middleware
 * 
 * Handles soft delete in API routes
 */

const softDeleteService = require('../services/softDeleteService');
const logger = require('../utils/logger');

/**
 * Middleware to handle soft delete
 * @param {String} modelName - Model name
 * @returns {Function} Middleware function
 */
function softDeleteMiddleware(modelName) {
  return async (req, res, next) => {
    try {
      const id = req.params.id;
      
      // Validate deletion
      const validation = await softDeleteService.validateDeletion(modelName, id, {
        force: req.body.force === true
      });
      
      if (!validation.allowed) {
        return res.status(403).json({
          error: 'DELETION_NOT_ALLOWED',
          code: validation.reason,
          message: validation.message,
          references: validation.references
        });
      }
      
      // Add validation to request
      req.softDeleteValidation = validation;
      
      next();
    } catch (error) {
      logger.error('Error in soft delete middleware:', error);
      res.status(500).json({
        error: 'DELETION_VALIDATION_ERROR',
        message: error.message
      });
    }
  };
}

/**
 * Middleware to exclude deleted documents from queries
 */
function excludeDeletedMiddleware(req, res, next) {
  // By default, exclude deleted
  if (!req.query.includeDeleted && !req.query.deletedOnly) {
    req.query.isDeleted = false;
  }
  
  // Only deleted
  if (req.query.deletedOnly === 'true') {
    req.query.isDeleted = true;
  }
  
  // Remove query params to avoid conflicts
  delete req.query.includeDeleted;
  delete req.query.deletedOnly;
  
  next();
}

/**
 * Middleware to handle restore
 */
function restoreMiddleware(modelName) {
  return async (req, res, next) => {
    try {
      const id = req.params.id;
      
      // Check if document exists and is deleted
      const Model = require(`../models/${modelName}`);
      const document = await Model.findById(id);
      
      if (!document) {
        return res.status(404).json({
          error: 'DOCUMENT_NOT_FOUND',
          message: 'Document not found'
        });
      }
      
      if (!document.isDeleted) {
        return res.status(400).json({
          error: 'NOT_DELETED',
          message: 'Document is not deleted'
        });
      }
      
      req.restoreDocument = document;
      next();
    } catch (error) {
      logger.error('Error in restore middleware:', error);
      res.status(500).json({
        error: 'RESTORE_VALIDATION_ERROR',
        message: error.message
      });
    }
  };
}

module.exports = {
  softDeleteMiddleware,
  excludeDeletedMiddleware,
  restoreMiddleware
};

