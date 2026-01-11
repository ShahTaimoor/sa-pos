/**
 * Background Job Period Protection
 * 
 * Prevents background jobs from bypassing period locks
 * Enforces period checks for all scheduled jobs
 */

const AccountingPeriod = require('../models/AccountingPeriod');
const PeriodOverride = require('../models/PeriodOverride');
const logger = require('../utils/logger');

/**
 * Job configuration
 * Defines which jobs can bypass period locks
 */
const JOB_CONFIG = {
  'reconciliation': {
    allowPeriodOverride: false,
    checkPeriod: true,
    allowedInClosed: false,
    allowedInLocked: false
  },
  'dataIntegrityCheck': {
    allowPeriodOverride: true,
    checkPeriod: true,
    allowedInClosed: true, // Read-only
    allowedInLocked: false
  },
  'backup': {
    allowPeriodOverride: true,
    checkPeriod: false, // Backup doesn't modify financial data
    allowedInClosed: true,
    allowedInLocked: true
  },
  'reportGeneration': {
    allowPeriodOverride: true,
    checkPeriod: false, // Read-only
    allowedInClosed: true,
    allowedInLocked: true
  },
  'inventorySync': {
    allowPeriodOverride: false,
    checkPeriod: true,
    allowedInClosed: false,
    allowedInLocked: false
  },
  'customerBalanceReconciliation': {
    allowPeriodOverride: false,
    checkPeriod: true,
    allowedInClosed: false,
    allowedInLocked: false
  }
};

class BackgroundJobPeriodProtection {
  /**
   * Check if job can run for given date
   * @param {String} jobName - Job name
   * @param {Date} transactionDate - Transaction date
   * @param {Object} options - Options
   * @returns {Promise<Object>} Check result
   */
  async checkJobCanRun(jobName, transactionDate, options = {}) {
    const { overrideId = null } = options;
    
    const config = JOB_CONFIG[jobName];
    if (!config) {
      // Unknown job - default to strict
      logger.warn(`Unknown job configuration: ${jobName}, using strict defaults`);
      return await this.checkPeriodStrict(transactionDate, overrideId);
    }
    
    // If job doesn't check period, allow
    if (!config.checkPeriod) {
      return {
        allowed: true,
        reason: 'Job does not require period check'
      };
    }
    
    // Check period status
    const period = await AccountingPeriod.findOne({
      periodStart: { $lte: transactionDate },
      periodEnd: { $gte: transactionDate }
    });
    
    if (!period) {
      // No period found - allow (period might not be created yet)
      return {
        allowed: true,
        reason: 'No period found for date'
      };
    }
    
    // Check if period is open
    if (period.status === 'open') {
      return {
        allowed: true,
        reason: 'Period is open'
      };
    }
    
    // Check if job is allowed in closed period
    if (period.status === 'closed' && config.allowedInClosed) {
      return {
        allowed: true,
        reason: 'Job allowed in closed period'
      };
    }
    
    // Check if job is allowed in locked period
    if (period.status === 'locked' && config.allowedInLocked) {
      return {
        allowed: true,
        reason: 'Job allowed in locked period'
      };
    }
    
    // Check for override
    if (config.allowPeriodOverride && overrideId) {
      const override = await PeriodOverride.findById(overrideId);
      if (override && override.canBeUsed().canUse) {
        return {
          allowed: true,
          reason: 'Override provided',
          override: override
        };
      }
    }
    
    // Job is blocked
    return {
      allowed: false,
      blocked: true,
      period: {
        id: period._id,
        name: period.periodName,
        status: period.status
      },
      reason: `Job ${jobName} cannot run in ${period.status} period`,
      solution: config.allowPeriodOverride 
        ? 'Use period override if necessary'
        : 'Job cannot bypass period lock'
    };
  }

  /**
   * Strict period check (default for unknown jobs)
   */
  async checkPeriodStrict(transactionDate, overrideId = null) {
    const period = await AccountingPeriod.findOne({
      periodStart: { $lte: transactionDate },
      periodEnd: { $gte: transactionDate },
      status: { $in: ['closed', 'locked'] }
    });
    
    if (!period) {
      return {
        allowed: true,
        reason: 'No locked period found'
      };
    }
    
    if (overrideId) {
      const override = await PeriodOverride.findById(overrideId);
      if (override && override.canBeUsed().canUse) {
        return {
          allowed: true,
          reason: 'Override provided',
          override: override
        };
      }
    }
    
    return {
      allowed: false,
      blocked: true,
      period: {
        id: period._id,
        name: period.periodName,
        status: period.status
      },
      reason: `Period ${period.periodName} is ${period.status}`
    };
  }

  /**
   * Execute job with period protection
   * @param {String} jobName - Job name
   * @param {Function} jobFunction - Job function
   * @param {Object} options - Options
   * @returns {Promise<Object>} Job result
   */
  async executeJobWithProtection(jobName, jobFunction, options = {}) {
    const { transactionDate = new Date(), overrideId = null } = options;
    
    // Check if job can run
    const check = await this.checkJobCanRun(jobName, transactionDate, { overrideId });
    
    if (!check.allowed) {
      logger.warn(`Job ${jobName} blocked by period lock`, {
        jobName,
        transactionDate,
        period: check.period,
        reason: check.reason
      });
      
      return {
        executed: false,
        blocked: true,
        reason: check.reason,
        period: check.period
      };
    }
    
    // Execute job
    try {
      const result = await jobFunction();
      
      logger.info(`Job ${jobName} executed successfully`, {
        jobName,
        transactionDate,
        overrideUsed: !!check.override
      });
      
      return {
        executed: true,
        result: result,
        overrideUsed: !!check.override
      };
    } catch (error) {
      logger.error(`Job ${jobName} execution failed:`, error);
      throw error;
    }
  }

  /**
   * Get job configuration
   * @param {String} jobName - Job name
   * @returns {Object} Job configuration
   */
  getJobConfig(jobName) {
    return JOB_CONFIG[jobName] || {
      allowPeriodOverride: false,
      checkPeriod: true,
      allowedInClosed: false,
      allowedInLocked: false
    };
  }
}

module.exports = new BackgroundJobPeriodProtection();

