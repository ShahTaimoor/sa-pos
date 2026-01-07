/**
 * Environment Variable Validation
 * Validates required environment variables at startup
 */

const logger = require('../utils/logger');

// Required environment variables
const requiredEnvVars = [
  'JWT_SECRET',
  'MONGODB_URI'
];

// Optional environment variables with defaults
const optionalEnvVars = {
  PORT: 5000,
  NODE_ENV: 'development',
  LOG_LEVEL: undefined, // Will be set based on NODE_ENV
  FRONTEND_URL: undefined,
  ALLOWED_ORIGINS: undefined // Comma-separated list of allowed CORS origins
};

/**
 * Validate environment variables
 * @throws {Error} If required variables are missing
 */
const validateEnv = () => {
  const missing = [];
  const warnings = [];

  // Check required variables
  requiredEnvVars.forEach(varName => {
    if (!process.env[varName] || process.env[varName].trim() === '') {
      missing.push(varName);
    }
  });

  // Set defaults for optional variables
  Object.entries(optionalEnvVars).forEach(([varName, defaultValue]) => {
    if (!process.env[varName] && defaultValue !== undefined) {
      process.env[varName] = defaultValue;
    }
  });

  // Set LOG_LEVEL based on NODE_ENV if not provided
  if (!process.env.LOG_LEVEL) {
    process.env.LOG_LEVEL = process.env.NODE_ENV === 'production' ? 'warn' : 'debug';
  }

  // Validate JWT_SECRET strength in production
  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) {
      warnings.push('JWT_SECRET should be at least 32 characters long in production');
    }
  }

  // Validate MONGODB_URI format
  if (process.env.MONGODB_URI && !process.env.MONGODB_URI.startsWith('mongodb://') && 
      !process.env.MONGODB_URI.startsWith('mongodb+srv://')) {
    warnings.push('MONGODB_URI should start with mongodb:// or mongodb+srv://');
  }

  // Log warnings
  if (warnings.length > 0) {
    warnings.forEach(warning => {
      logger.warn(`Environment variable warning: ${warning}`);
    });
  }

  // Throw error if required variables are missing
  if (missing.length > 0) {
    const errorMessage = `Missing required environment variables: ${missing.join(', ')}\n` +
      `Please set them in your .env file or as environment variables.`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  logger.info('Environment variables validated successfully');
  logger.debug('Environment configuration:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    LOG_LEVEL: process.env.LOG_LEVEL,
    hasJWT_SECRET: !!process.env.JWT_SECRET,
    hasMONGODB_URI: !!process.env.MONGODB_URI
  });
};

module.exports = { validateEnv };

