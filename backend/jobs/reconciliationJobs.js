const cron = require('node-cron');
const reconciliationService = require('../services/reconciliationService');
const logger = require('../utils/logger');

/**
 * Schedule reconciliation jobs
 */
function startReconciliationJobs() {
  // Daily balance reconciliation at 2 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('Starting daily customer balance reconciliation...');
      const results = await reconciliationService.reconcileAllCustomerBalances({
        autoCorrect: false, // Don't auto-correct, just alert
        alertOnDiscrepancy: true,
        batchSize: 100
      });

      logger.info('Daily reconciliation completed:', {
        total: results.total,
        reconciled: results.reconciled,
        discrepancies: results.discrepancies,
        errors: results.errors.length,
        duration: `${(results.duration / 1000).toFixed(2)}s`
      });

      if (results.discrepancies > 0) {
        logger.warn(`Balance discrepancies detected: ${results.discrepancies} customers`);
        // TODO: Send alert notification
      }
    } catch (error) {
      logger.error('Daily reconciliation job failed:', error);
    }
  });

  // Weekly full reconciliation with auto-correction (Sundays at 3 AM)
  cron.schedule('0 3 * * 0', async () => {
    try {
      logger.info('Starting weekly customer balance reconciliation with auto-correction...');
      const results = await reconciliationService.reconcileAllCustomerBalances({
        autoCorrect: true, // Auto-correct discrepancies
        alertOnDiscrepancy: true,
        batchSize: 50 // Smaller batch for auto-correction
      });

      logger.info('Weekly reconciliation completed:', {
        total: results.total,
        reconciled: results.reconciled,
        discrepancies: results.discrepancies,
        corrected: results.corrected,
        errors: results.errors.length,
        duration: `${(results.duration / 1000).toFixed(2)}s`
      });

      if (results.discrepancies > 0) {
        logger.warn(`Balance discrepancies found and corrected: ${results.discrepancies} customers`);
        // TODO: Send summary notification
      }
    } catch (error) {
      logger.error('Weekly reconciliation job failed:', error);
    }
  });

  logger.info('Reconciliation jobs scheduled: Daily at 2 AM, Weekly (Sunday) at 3 AM');
}

module.exports = {
  startReconciliationJobs
};

