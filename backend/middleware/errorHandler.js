/**
 * Global Error Handling Middleware for MongoDB Errors
 * Handles duplicate key errors (11000) and WriteConflict errors (112)
 * Ensures the server never crashes from database errors
 */

const mongoose = require('mongoose');

/**
 * Check if error is a MongoDB duplicate key error (E11000)
 */
const isDuplicateKeyError = (error) => {
  return error.code === 11000 || error.codeName === 'DuplicateKey';
};

/**
 * Check if error is a MongoDB WriteConflict error (E112)
 */
const isWriteConflictError = (error) => {
  return error.code === 112 || error.codeName === 'WriteConflict';
};

/**
 * Extract duplicate key field name from error
 */
const getDuplicateKeyField = (error) => {
  if (!error.keyPattern) return 'unknown';
  
  const keys = Object.keys(error.keyPattern);
  return keys.length > 0 ? keys[0] : 'unknown';
};

/**
 * Format duplicate key error message
 */
const formatDuplicateKeyMessage = (error) => {
  const field = getDuplicateKeyField(error);
  const value = error.keyValue ? error.keyValue[field] : 'unknown';
  
  // Common field mappings for user-friendly messages
  const fieldMessages = {
    email: 'This email address is already registered',
    phone: 'This phone number is already registered',
    businessName: 'This business name is already registered',
    name: 'This name already exists',
    code: 'This code already exists',
    orderNumber: 'This order number already exists. Please try again.',
    transactionId: 'This transaction ID already exists',
    sku: 'This SKU already exists',
    barcode: 'This barcode already exists',
  };
  
  const message = fieldMessages[field] || `A record with this ${field} already exists`;
  
  return {
    message,
    field,
    value,
    code: 'DUPLICATE_ENTRY',
    statusCode: 409 // Conflict
  };
};

/**
 * Format WriteConflict error message
 */
const formatWriteConflictMessage = (error) => {
  return {
    message: 'A concurrent update conflict occurred. Please try again.',
    code: 'WRITE_CONFLICT',
    statusCode: 409, // Conflict
    retryable: true
  };
};

/**
 * Format validation error message
 */
const formatValidationError = (error) => {
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message,
      value: err.value
    }));
    
    return {
      message: 'Validation failed',
      errors,
      code: 'VALIDATION_ERROR',
      statusCode: 400
    };
  }
  
  return null;
};

/**
 * Format CastError (invalid ObjectId, etc.)
 */
const formatCastError = (error) => {
  if (error.name === 'CastError') {
    return {
      message: `Invalid ${error.path}: ${error.value}`,
      field: error.path,
      value: error.value,
      code: 'INVALID_ID',
      statusCode: 400
    };
  }
  
  return null;
};

/**
 * Main error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log error for debugging
  console.error('Error occurred:', {
    name: err.name,
    message: err.message,
    code: err.code,
    codeName: err.codeName,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Handle MongoDB duplicate key error (11000)
  if (isDuplicateKeyError(err)) {
    const formatted = formatDuplicateKeyMessage(err);
    return res.status(formatted.statusCode).json({
      success: false,
      error: formatted
    });
  }

  // Handle MongoDB WriteConflict error (112)
  if (isWriteConflictError(err)) {
    const formatted = formatWriteConflictMessage(err);
    return res.status(formatted.statusCode).json({
      success: false,
      error: formatted
    });
  }

  // Handle Mongoose validation errors
  const validationError = formatValidationError(err);
  if (validationError) {
    return res.status(validationError.statusCode).json({
      success: false,
      error: validationError
    });
  }

  // Handle Mongoose CastError (invalid ObjectId)
  const castError = formatCastError(err);
  if (castError) {
    return res.status(castError.statusCode).json({
      success: false,
      error: castError
    });
  }

  // Handle Mongoose connection errors
  if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
    return res.status(503).json({
      success: false,
      error: {
        message: 'Database connection error. Please try again later.',
        code: 'DATABASE_CONNECTION_ERROR',
        statusCode: 503
      }
    });
  }

  // Handle unauthorized errors
  if (err.name === 'UnauthorizedError' || err.status === 401) {
    return res.status(401).json({
      success: false,
      error: {
        message: err.message || 'Unauthorized',
        code: 'UNAUTHORIZED',
        statusCode: 401
      }
    });
  }

  // Handle default server errors
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';
  
  res.status(statusCode).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : message,
      code: err.code || 'INTERNAL_SERVER_ERROR',
      statusCode,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};

module.exports = {
  errorHandler,
  isDuplicateKeyError,
  isWriteConflictError,
  getDuplicateKeyField,
  formatDuplicateKeyMessage,
  formatWriteConflictMessage
};

