/**
 * Period Lock Middleware
 * 
 * Enforces period locking at API level
 * Blocks all writes to closed/locked periods
 * Checks for admin overrides
 */

const AccountingPeriod = require('../models/AccountingPeriod');
const PeriodOverride = require('../models/PeriodOverride');
const logger = require('../utils/logger');

/**
 * Extract transaction date from request
 * @param {Object} req - Express request
 * @returns {Date|null} Transaction date
 */
function extractTransactionDate(req) {
  // Check various common field names
  const dateFields = [
    'transactionDate',
    'date',
    'orderDate',
    'invoiceDate',
    'paymentDate',
    'createdAt'
  ];
  
  for (const field of dateFields) {
    if (req.body[field]) {
      return new Date(req.body[field]);
    }
  }
  
  // Check nested objects
  if (req.body.transaction && req.body.transaction.date) {
    return new Date(req.body.transaction.date);
  }
  
  if (req.body.payment && req.body.payment.date) {
    return new Date(req.body.payment.date);
  }
  
  // Default to current date if no date specified
  // (will be set by model default)
  return null;
}

/**
 * Period lock validation middleware
 * Blocks writes to closed/locked periods
 */
async function periodLockMiddleware(req, res, next) {
  // Skip for GET requests (reads are allowed)
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  
  // Skip for period management routes (they handle their own validation)
  if (req.path.includes('/accounting-periods') && 
      (req.path.includes('/close') || req.path.includes('/lock') || req.path.includes('/unlock'))) {
    return next();
  }
  
  // Extract transaction date
  const transactionDate = extractTransactionDate(req);
  
  // If no date specified, use current date
  const dateToCheck = transactionDate || new Date();
  
  // Check for period override in request
  const overrideId = req.body.__periodOverrideId || req.query.__periodOverrideId;
  
  if (overrideId) {
    // Validate override
    try {
      const override = await PeriodOverride.findById(overrideId)
        .populate('period');
      
      if (!override) {
        return res.status(400).json({
          error: 'INVALID_OVERRIDE',
          message: 'Period override not found'
        });
      }
      
      // Check if override is valid
      const canUse = override.canBeUsed();
      if (!canUse.canUse) {
        return res.status(403).json({
          error: 'OVERRIDE_INVALID',
          message: canUse.reason,
          overrideId: override._id
        });
      }
      
      // Check if override is for correct period
      const period = await AccountingPeriod.findOne({
        periodStart: { $lte: dateToCheck },
        periodEnd: { $gte: dateToCheck }
      });
      
      if (!period || period._id.toString() !== override.period._id.toString()) {
        return res.status(403).json({
          error: 'OVERRIDE_PERIOD_MISMATCH',
          message: 'Override is for different period',
          overridePeriod: override.period.periodName,
          transactionPeriod: period?.periodName
        });
      }
      
      // Attach override to request for use in service layer
      req.periodOverride = {
        overrideId: override._id,
        periodId: period._id,
        periodName: period.periodName,
        reason: override.reason,
        authorized: true
      };
      
      logger.info(`Period override used: ${override._id}`, {
        userId: req.user?._id,
        periodId: period._id,
        operation: override.operation
      });
      
      return next();
    } catch (error) {
      logger.error('Error validating period override:', error);
      return res.status(500).json({
        error: 'OVERRIDE_VALIDATION_ERROR',
        message: error.message
      });
    }
  }
  
  // Check if date is in closed/locked period
  try {
    const period = await AccountingPeriod.findOne({
      periodStart: { $lte: dateToCheck },
      periodEnd: { $gte: dateToCheck },
      status: { $in: ['closed', 'locked'] }
    });
    
    if (period) {
      logger.warn(`Period lock violation attempted`, {
        userId: req.user?._id,
        periodId: period._id,
        periodName: period.periodName,
        status: period.status,
        transactionDate: dateToCheck,
        path: req.path,
        method: req.method
      });
      
      return res.status(403).json({
        error: 'PERIOD_LOCKED',
        code: 'PERIOD_LOCKED',
        message: `Cannot perform operation in ${period.status} period`,
        period: {
          id: period._id,
          name: period.periodName,
          start: period.periodStart,
          end: period.periodEnd,
          status: period.status,
          isCritical: period.isCritical
        },
        solution: period.status === 'locked' 
          ? 'Period is locked. Use admin override if necessary.'
          : 'Period is closed. Use admin override if necessary.',
        overrideRequired: true
      });
    }
  } catch (error) {
    logger.error('Error checking period lock:', error);
    // Don't block request if period check fails (fail open for availability)
    // But log the error
  }
  
  next();
}

/**
 * Background job period check
 * Prevents background jobs from bypassing locks
 */
async function checkPeriodForBackgroundJob(transactionDate, jobName, options = {}) {
  const { allowOverride = false, overrideId = null } = options;
  
  if (allowOverride && overrideId) {
    const override = await PeriodOverride.findById(overrideId);
    if (override && override.canBeUsed().canUse) {
      return {
        allowed: true,
        override: override
      };
    }
  }
  
  const period = await AccountingPeriod.findOne({
    periodStart: { $lte: transactionDate },
    periodEnd: { $gte: transactionDate },
    status: { $in: ['closed', 'locked'] }
  });
  
  if (period) {
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
  
  return {
    allowed: true
  };
}

module.exports = {
  periodLockMiddleware,
  checkPeriodForBackgroundJob,
  extractTransactionDate
};

