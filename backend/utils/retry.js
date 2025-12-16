/**
 * Retry Utility for MongoDB WriteConflict Errors
 * Implements exponential backoff for retryable operations
 */

/**
 * Retry a function with exponential backoff for WriteConflict errors
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 5)
 * @param {number} options.initialDelay - Initial delay in ms (default: 50)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 2000)
 * @param {number} options.multiplier - Backoff multiplier (default: 2)
 * @param {Function} options.shouldRetry - Custom function to determine if error should be retried
 * @returns {Promise} Result of the function
 */
const retryWithBackoff = async (fn, options = {}) => {
  const {
    maxRetries = 5,
    initialDelay = 50,
    maxDelay = 2000,
    multiplier = 2,
    shouldRetry = (error) => {
      // Default: retry on WriteConflict errors (code 112)
      return error.code === 112 || error.codeName === 'WriteConflict';
    }
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      if (!shouldRetry(error)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff
      const currentDelay = Math.min(delay, maxDelay);
      
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${currentDelay}ms for error:`, {
        code: error.code,
        codeName: error.codeName,
        message: error.message
      });

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, currentDelay));

      // Increase delay for next attempt
      delay *= multiplier;
    }
  }

  // All retries exhausted
  throw lastError;
};

/**
 * Retry a MongoDB operation with WriteConflict handling
 * Specifically designed for MongoDB operations that may encounter WriteConflict errors
 */
const retryMongoOperation = async (operation, options = {}) => {
  return retryWithBackoff(operation, {
    maxRetries: options.maxRetries || 5,
    initialDelay: options.initialDelay || 50,
    maxDelay: options.maxDelay || 2000,
    shouldRetry: (error) => {
      // Retry on WriteConflict errors
      if (error.code === 112 || error.codeName === 'WriteConflict') {
        return true;
      }
      
      // Also retry on transient network errors
      if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
        return true;
      }
      
      return false;
    },
    ...options
  });
};

module.exports = {
  retryWithBackoff,
  retryMongoOperation
};

