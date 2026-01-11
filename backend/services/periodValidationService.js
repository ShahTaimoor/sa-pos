/**
 * Period Validation Service
 * 
 * STEP 7: Validates transactions against fiscal year and period locking.
 * Prevents posting transactions into closed months or years.
 */

const FiscalYear = require('../models/FiscalYear');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const logger = require('../utils/logger');

class PeriodValidationService {
  /**
   * Validate if a transaction can be posted for a given date
   * @param {Date} transactionDate - Transaction date
   * @param {ObjectId} tenantId - Tenant ID
   * @param {String} accountCode - Account code (optional, for reconciliation check)
   * @returns {Promise<void>} Throws error if validation fails
   */
  async validateTransactionDate(transactionDate, tenantId, accountCode = null) {
    // Find fiscal year for this date
    let fiscalYear = await FiscalYear.findFiscalYearForDate(tenantId, transactionDate);

    // Auto-create fiscal year if it doesn't exist
    if (!fiscalYear) {
      const transactionYear = transactionDate.getFullYear();
      const yearStart = new Date(transactionYear, 0, 1); // January 1st
      const yearEnd = new Date(transactionYear, 11, 31, 23, 59, 59, 999); // December 31st
      
      try {
        logger.info(`Auto-creating fiscal year ${transactionYear} for tenant ${tenantId}`);
        fiscalYear = await FiscalYear.createFiscalYear({
          tenantId,
          year: transactionYear,
          startDate: yearStart,
          endDate: yearEnd,
          createdBy: null, // System-created
          description: `Auto-created fiscal year for ${transactionYear}`
        });
        logger.info(`Successfully auto-created fiscal year ${transactionYear}`);
      } catch (error) {
        // If creation fails (e.g., duplicate key from race condition), try to fetch it
        if (error.code === 11000) {
          logger.warn(`Fiscal year ${transactionYear} was created by another process, fetching it`);
          fiscalYear = await FiscalYear.findFiscalYearForDate(tenantId, transactionDate);
        }
        
        // If still not found after retry, throw original error
        if (!fiscalYear) {
          logger.error(`Failed to auto-create fiscal year ${transactionYear}: ${error.message}`);
          throw new Error(
            `No fiscal year found for transaction date ${transactionDate.toISOString().split('T')[0]}. ` +
            `Please create a fiscal year covering this date.`
          );
        }
      }
    }

    // Check if fiscal year is closed
    if (fiscalYear.isClosed) {
      throw new Error(
        `Fiscal year ${fiscalYear.year} is closed. Cannot post transactions to closed fiscal years.`
      );
    }

    // Check if period is locked
    const period = fiscalYear.getPeriodForDate(transactionDate);
    if (period) {
      if (period.isLocked) {
        throw new Error(
          `Period ${period.period} (${period.startDate.toISOString().split('T')[0]} to ` +
          `${period.endDate.toISOString().split('T')[0]}) is locked. Cannot post transactions to locked periods.`
        );
      }

      if (period.closedAt) {
        throw new Error(
          `Period ${period.period} is closed. Cannot post transactions to closed periods.`
        );
      }
    }

    // If account code provided, check reconciliation status
    if (accountCode) {
      const account = await ChartOfAccounts.findOne({
        tenantId,
        accountCode,
        isDeleted: false
      });

      if (account) {
        account.validateTransactionDate(transactionDate);
      }
    }

    return true;
  }

  /**
   * Get current fiscal year
   * @param {ObjectId} tenantId - Tenant ID
   * @returns {Promise<FiscalYear>}
   */
  async getCurrentFiscalYear(tenantId) {
    const fiscalYear = await FiscalYear.getCurrentFiscalYear(tenantId);
    
    if (!fiscalYear) {
      throw new Error('No active fiscal year found. Please create a fiscal year.');
    }

    return fiscalYear;
  }

  /**
   * Get period for a date
   * @param {Date} date - Date
   * @param {ObjectId} tenantId - Tenant ID
   * @returns {Promise<Object>} Period object
   */
  async getPeriodForDate(date, tenantId) {
    const fiscalYear = await FiscalYear.findFiscalYearForDate(tenantId, date);
    
    if (!fiscalYear) {
      return null;
    }

    return fiscalYear.getPeriodForDate(date);
  }

  /**
   * Check if a date range is valid for transactions
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {ObjectId} tenantId - Tenant ID
   * @returns {Promise<void>} Throws error if validation fails
   */
  async validateDateRange(startDate, endDate, tenantId) {
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      await this.validateTransactionDate(currentDate, tenantId);
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
}

module.exports = new PeriodValidationService();
