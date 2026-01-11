/**
 * Enhanced Transaction Service
 * 
 * Ensures MongoDB transactions are truly atomic with retry and failure recovery
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

class EnhancedTransactionService {
  /**
   * Execute operation with MongoDB transaction and retry logic
   * @param {Function} operation - Operation to execute
   * @param {Object} options - Options
   * @returns {Promise<Object>} Result
   */
  async executeWithTransaction(operation, options = {}) {
    const {
      maxRetries = 5,
      retryDelay = 100,
      session = null
    } = options;

    let lastError = null;
    let attempt = 0;

    while (attempt < maxRetries) {
      const shouldCreateSession = !session;
      const transactionSession = session || await mongoose.startSession();
      
      try {
        if (shouldCreateSession) {
          transactionSession.startTransaction();
        }

        // Execute operation with session
        const result = await operation(transactionSession);

        if (shouldCreateSession) {
          await transactionSession.commitTransaction();
        }

        return {
          success: true,
          result,
          attempts: attempt + 1
        };
      } catch (error) {
        lastError = error;

        // Rollback transaction
        if (shouldCreateSession && transactionSession.inTransaction()) {
          try {
            await transactionSession.abortTransaction();
          } catch (rollbackError) {
            logger.error('Error during transaction rollback:', rollbackError);
          }
        }

        // Check if error is retryable
        if (!this.isRetryableError(error) || attempt >= maxRetries - 1) {
          if (shouldCreateSession) {
            transactionSession.endSession();
          }
          throw error;
        }

        // Wait before retry
        await this.sleep(retryDelay * (attempt + 1));
        attempt++;
      } finally {
        if (shouldCreateSession && transactionSession) {
          transactionSession.endSession();
        }
      }
    }

    throw lastError || new Error('Transaction failed after maximum retries');
  }

  /**
   * Check if error is retryable
   * @param {Error} error - Error
   * @returns {Boolean} Is retryable
   */
  isRetryableError(error) {
    // Retry on transient errors
    const retryableCodes = [
      'WriteConflict',
      'TransientTransactionError',
      'UnknownTransactionCommitResult',
      'NetworkError',
      'HostUnreachable'
    ];

    return retryableCodes.some(code => 
      error.message.includes(code) || 
      error.codeName === code ||
      error.code === 11000 // Duplicate key (can retry)
    );
  }

  /**
   * Sleep utility
   * @param {Number} ms - Milliseconds
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute multiple operations atomically
   * @param {Array} operations - Array of operations
   * @param {Object} options - Options
   * @returns {Promise<Object>} Results
   */
  async executeAtomicOperations(operations, options = {}) {
    return this.executeWithTransaction(async (session) => {
      const results = [];

      for (const operation of operations) {
        try {
          const result = await operation(session);
          results.push({ success: true, result });
        } catch (error) {
          // If any operation fails, the entire transaction will rollback
          results.push({ success: false, error: error.message });
          throw error;
        }
      }

      return results;
    }, options);
  }

  /**
   * Handle partial failure recovery
   * @param {String} transactionId - Transaction ID
   * @param {Object} failedOperations - Failed operations
   * @returns {Promise<Object>} Recovery result
   */
  async recoverFromPartialFailure(transactionId, failedOperations) {
    logger.warn(`Recovering from partial failure for transaction ${transactionId}`, {
      failedOperations: failedOperations.length
    });

    // Log failed operations for manual review
    const recoveryLog = {
      transactionId,
      timestamp: new Date(),
      failedOperations,
      status: 'requires_manual_review'
    };

    // TODO: Store recovery log in database for admin review
    // await RecoveryLog.create(recoveryLog);

    return {
      recovered: false,
      requiresManualReview: true,
      recoveryLog
    };
  }
}

module.exports = new EnhancedTransactionService();

