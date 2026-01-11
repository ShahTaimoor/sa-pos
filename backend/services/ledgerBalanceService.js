/**
 * Ledger Balance Service
 * 
 * CustomerTransaction ledger is the SINGLE SOURCE OF TRUTH
 * Customer balance fields are CACHED ONLY
 * All balances calculated from ledger transactions
 */

const Customer = require('../models/Customer');
const CustomerTransaction = require('../models/CustomerTransaction');
const PaymentApplication = require('../models/PaymentApplication');
const logger = require('../utils/logger');

class LedgerBalanceService {
  /**
   * Calculate customer balance from ledger (AUTHORITATIVE)
   * @param {String} customerId - Customer ID
   * @param {Date} asOfDate - Calculate balance as of this date (optional)
   * @returns {Promise<Object>} Calculated balances
   */
  async calculateBalanceFromLedger(customerId, asOfDate = null) {
    try {
      const matchQuery = {
        customer: customerId,
        status: { $nin: ['cancelled', 'reversed'] }
      };
      
      if (asOfDate) {
        matchQuery.transactionDate = { $lte: asOfDate };
      }
      
      // Aggregate transactions to calculate balances
      const result = await CustomerTransaction.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$customer',
            // Sum invoices (increase pending)
            totalInvoices: {
              $sum: {
                $cond: [
                  { $in: ['$transactionType', ['invoice', 'debit_note']] },
                  '$netAmount',
                  0
                ]
              }
            },
            // Sum payments (decrease pending)
            totalPayments: {
              $sum: {
                $cond: [
                  { $eq: ['$transactionType', 'payment'] },
                  '$netAmount',
                  0
                ]
              }
            },
            // Sum refunds/credits (decrease pending)
            totalRefunds: {
              $sum: {
                $cond: [
                  { $in: ['$transactionType', ['refund', 'credit_note']] },
                  '$netAmount',
                  0
                ]
              }
            },
            // Sum adjustments
            totalAdjustments: {
              $sum: {
                $cond: [
                  { $eq: ['$transactionType', 'adjustment'] },
                  '$balanceImpact',
                  0
                ]
              }
            },
            // Sum write-offs
            totalWriteOffs: {
              $sum: {
                $cond: [
                  { $eq: ['$transactionType', 'write_off'] },
                  '$netAmount',
                  0
                ]
              }
            },
            // Opening balance
            openingBalance: {
              $sum: {
                $cond: [
                  { $eq: ['$transactionType', 'opening_balance'] },
                  '$balanceImpact',
                  0
                ]
              }
            },
            // Count transactions
            transactionCount: { $sum: 1 },
            // Last transaction date
            lastTransactionDate: { $max: '$transactionDate' }
          }
        }
      ]);
      
      if (result.length === 0) {
        return {
          pendingBalance: 0,
          advanceBalance: 0,
          currentBalance: 0,
          transactionCount: 0,
          lastTransactionDate: null,
          breakdown: {
            openingBalance: 0,
            totalInvoices: 0,
            totalPayments: 0,
            totalRefunds: 0,
            totalWriteOffs: 0,
            totalAdjustments: 0
          }
        };
      }
      
      const totals = result[0];
      
      // Calculate pending balance
      // = Opening + Invoices - Payments - Refunds - Write-offs + Adjustments (positive)
      let pendingBalance = (totals.openingBalance || 0) + 
                           (totals.totalInvoices || 0) - 
                           (totals.totalPayments || 0) - 
                           (totals.totalRefunds || 0) - 
                           (totals.totalWriteOffs || 0);
      
      // Add positive adjustments to pending
      if (totals.totalAdjustments > 0) {
        pendingBalance += totals.totalAdjustments;
      }
      
      // Subtract negative adjustments from pending
      if (totals.totalAdjustments < 0) {
        pendingBalance = Math.max(0, pendingBalance + totals.totalAdjustments);
      }
      
      // Calculate advance balance from payment applications
      const advanceBalance = await this.calculateAdvanceBalance(customerId, asOfDate);
      
      // Current balance = pending - advance
      const currentBalance = pendingBalance - advanceBalance;
      
      return {
        pendingBalance: Math.max(0, pendingBalance),
        advanceBalance: Math.max(0, advanceBalance),
        currentBalance: currentBalance,
        transactionCount: totals.transactionCount || 0,
        lastTransactionDate: totals.lastTransactionDate,
        breakdown: {
          openingBalance: totals.openingBalance || 0,
          totalInvoices: totals.totalInvoices || 0,
          totalPayments: totals.totalPayments || 0,
          totalRefunds: totals.totalRefunds || 0,
          totalWriteOffs: totals.totalWriteOffs || 0,
          totalAdjustments: totals.totalAdjustments || 0
        }
      };
    } catch (error) {
      logger.error('Error calculating balance from ledger:', error);
      throw error;
    }
  }

  /**
   * Calculate advance balance from payment applications
   * Advance = unapplied payments (overpayments)
   * @param {String} customerId - Customer ID
   * @param {Date} asOfDate - Calculate as of date (optional)
   * @returns {Promise<Number>} Advance balance
   */
  async calculateAdvanceBalance(customerId, asOfDate = null) {
    try {
      const matchQuery = {
        customer: customerId,
        status: 'applied',
        isReversed: false
      };
      
      if (asOfDate) {
        matchQuery.createdAt = { $lte: asOfDate };
      }
      
      // Sum all unapplied amounts from payment applications
      const result = await PaymentApplication.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$customer',
            totalUnapplied: { $sum: '$unappliedAmount' }
          }
        }
      ]);
      
      return result.length > 0 ? (result[0].totalUnapplied || 0) : 0;
    } catch (error) {
      logger.error('Error calculating advance balance:', error);
      throw error;
    }
  }

  /**
   * Update cached balance (incremental - fast)
   * Called when transaction is created
   * @param {String} customerId - Customer ID
   * @param {CustomerTransaction} transaction - New transaction
   * @returns {Promise<Object>} Updated balances
   */
  async updateBalanceCacheIncremental(customerId, transaction) {
    try {
      const customer = await Customer.findById(customerId);
      if (!customer) {
        throw new Error(`Customer ${customerId} not found`);
      }
      
      // Get current cached balances
      const balanceBefore = {
        pendingBalance: customer.pendingBalance || 0,
        advanceBalance: customer.advanceBalance || 0,
        currentBalance: customer.currentBalance || 0
      };
      
      // Calculate new balance based on transaction
      const balanceAfter = this.calculateNewBalanceFromTransaction(balanceBefore, transaction);
      
      // Update cache (with flag to allow)
      const updatedCustomer = await Customer.findOneAndUpdate(
        { _id: customerId, __v: customer.__v },
        {
          $set: {
            pendingBalance: balanceAfter.pendingBalance,
            advanceBalance: balanceAfter.advanceBalance,
            currentBalance: balanceAfter.currentBalance,
            __allowBalanceCacheUpdate: true // Flag to allow
          },
          $inc: { __v: 1 }
        },
        { new: true }
      );
      
      if (!updatedCustomer) {
        throw new Error('Concurrent balance cache update conflict. Please retry.');
      }
      
      // Clear flag (not strictly necessary, but for clarity)
      delete updatedCustomer.__allowBalanceCacheUpdate;
      
      logger.debug(`Balance cache updated incrementally for customer ${customerId}`, {
        customerId,
        transactionType: transaction.transactionType,
        balanceBefore,
        balanceAfter
      });
      
      return balanceAfter;
    } catch (error) {
      logger.error('Error updating balance cache incrementally:', error);
      throw error;
    }
  }

  /**
   * Calculate new balance from transaction
   * @param {Object} balanceBefore - Current balances
   * @param {CustomerTransaction} transaction - Transaction
   * @returns {Object} New balances
   */
  calculateNewBalanceFromTransaction(balanceBefore, transaction) {
    let pendingBalance = balanceBefore.pendingBalance || 0;
    let advanceBalance = balanceBefore.advanceBalance || 0;
    
    const balanceImpact = transaction.balanceImpact || 0;
    const transactionType = transaction.transactionType;
    
    switch (transactionType) {
      case 'invoice':
      case 'debit_note':
        // Invoice increases pending balance
        pendingBalance += balanceImpact;
        break;
        
      case 'payment':
        // Payment reduces pending first, then adds to advance
        const paymentAmount = Math.abs(balanceImpact);
        const pendingReduction = Math.min(paymentAmount, pendingBalance);
        pendingBalance -= pendingReduction;
        
        const remainingPayment = paymentAmount - pendingReduction;
        if (remainingPayment > 0) {
          advanceBalance += remainingPayment;
        }
        break;
        
      case 'refund':
      case 'credit_note':
        // Refund reduces pending, may add to advance
        const refundAmount = Math.abs(balanceImpact);
        const refundPendingReduction = Math.min(refundAmount, pendingBalance);
        pendingBalance -= refundPendingReduction;
        
        const remainingRefund = refundAmount - refundPendingReduction;
        if (remainingRefund > 0) {
          advanceBalance += remainingRefund;
        }
        break;
        
      case 'adjustment':
        // Adjustment can affect either balance
        if (balanceImpact > 0) {
          pendingBalance += balanceImpact;
        } else {
          const adjustmentAmount = Math.abs(balanceImpact);
          const adjustmentPendingReduction = Math.min(adjustmentAmount, pendingBalance);
          pendingBalance -= adjustmentPendingReduction;
          
          const remainingAdjustment = adjustmentAmount - adjustmentPendingReduction;
          if (remainingAdjustment > 0) {
            advanceBalance = Math.max(0, advanceBalance - remainingAdjustment);
          }
        }
        break;
        
      case 'write_off':
        // Write-off reduces pending balance
        pendingBalance = Math.max(0, pendingBalance + balanceImpact);
        break;
        
      case 'opening_balance':
        if (balanceImpact >= 0) {
          pendingBalance += balanceImpact;
        } else {
          advanceBalance += Math.abs(balanceImpact);
        }
        break;
    }
    
    const currentBalance = pendingBalance - advanceBalance;
    
    return {
      pendingBalance: Math.max(0, pendingBalance),
      advanceBalance: Math.max(0, advanceBalance),
      currentBalance: currentBalance
    };
  }

  /**
   * Rebuild balance cache from ledger (full recalculation)
   * @param {String} customerId - Customer ID
   * @returns {Promise<Object>} Rebuild result
   */
  async rebuildBalanceCache(customerId) {
    try {
      const calculated = await this.calculateBalanceFromLedger(customerId);
      
      const customer = await Customer.findById(customerId);
      if (!customer) {
        throw new Error(`Customer ${customerId} not found`);
      }
      
      // Update cache
      customer.__allowBalanceCacheUpdate = true;
      customer.pendingBalance = calculated.pendingBalance;
      customer.advanceBalance = calculated.advanceBalance;
      customer.currentBalance = calculated.currentBalance;
      await customer.save();
      
      delete customer.__allowBalanceCacheUpdate;
      
      logger.info(`Balance cache rebuilt for customer ${customerId}`, {
        customerId,
        calculated
      });
      
      return {
        customerId,
        calculated,
        cached: {
          pendingBalance: customer.pendingBalance,
          advanceBalance: customer.advanceBalance,
          currentBalance: customer.currentBalance
        }
      };
    } catch (error) {
      logger.error('Error rebuilding balance cache:', error);
      throw error;
    }
  }

  /**
   * Reconcile customer balance (detect and fix drift)
   * @param {String} customerId - Customer ID
   * @param {Object} options - Options
   * @returns {Promise<Object>} Reconciliation result
   */
  async reconcileCustomerBalance(customerId, options = {}) {
    const {
      autoCorrect = true,
      alertOnDrift = true,
      driftThreshold = 0.01
    } = options;
    
    try {
      // Calculate from ledger (authoritative)
      const calculated = await this.calculateBalanceFromLedger(customerId);
      
      // Get cached balances
      const customer = await Customer.findById(customerId);
      if (!customer) {
        throw new Error(`Customer ${customerId} not found`);
      }
      
      const cached = {
        pendingBalance: customer.pendingBalance || 0,
        advanceBalance: customer.advanceBalance || 0,
        currentBalance: customer.currentBalance || 0
      };
      
      // Calculate drift
      const drift = {
        pendingBalance: calculated.pendingBalance - cached.pendingBalance,
        advanceBalance: calculated.advanceBalance - cached.advanceBalance,
        currentBalance: calculated.currentBalance - cached.currentBalance,
        hasDrift: Math.abs(calculated.pendingBalance - cached.pendingBalance) > driftThreshold ||
                 Math.abs(calculated.advanceBalance - cached.advanceBalance) > driftThreshold
      };
      
      let corrected = false;
      
      // Auto-correct if drift detected
      if (drift.hasDrift && autoCorrect) {
        customer.__allowBalanceCacheUpdate = true;
        customer.pendingBalance = calculated.pendingBalance;
        customer.advanceBalance = calculated.advanceBalance;
        customer.currentBalance = calculated.currentBalance;
        await customer.save();
        
        delete customer.__allowBalanceCacheUpdate;
        
        corrected = true;
        
        logger.warn(`Balance drift corrected for customer ${customerId}`, {
          customerId,
          cached,
          calculated,
          drift
        });
      }
      
      // Alert on drift
      if (drift.hasDrift && alertOnDrift) {
        // TODO: Send alert notification
        logger.warn(`Balance drift detected for customer ${customerId}`, {
          customerId,
          drift,
          corrected
        });
      }
      
      return {
        customerId,
        calculated,
        cached,
        drift,
        corrected,
        transactionCount: calculated.transactionCount
      };
    } catch (error) {
      logger.error('Error reconciling customer balance:', error);
      throw error;
    }
  }

  /**
   * Reconcile all customer balances (batch)
   * @param {Object} options - Options
   * @returns {Promise<Object>} Reconciliation results
   */
  async reconcileAllCustomerBalances(options = {}) {
    const {
      autoCorrect = true,
      batchSize = 100,
      maxDriftThreshold = 0.01
    } = options;
    
    try {
      const customers = await Customer.find({ status: 'active' })
        .limit(batchSize)
        .lean();
      
      const results = {
        processed: 0,
        corrected: 0,
        withDrift: 0,
        errors: []
      };
      
      for (const customer of customers) {
        try {
          const reconciliation = await this.reconcileCustomerBalance(
            customer._id,
            { autoCorrect, alertOnDrift: false, driftThreshold: maxDriftThreshold }
          );
          
          results.processed++;
          
          if (reconciliation.drift.hasDrift) {
            results.withDrift++;
          }
          
          if (reconciliation.corrected) {
            results.corrected++;
          }
        } catch (error) {
          results.errors.push({
            customerId: customer._id,
            error: error.message
          });
          logger.error(`Error reconciling customer ${customer._id}:`, error);
        }
      }
      
      logger.info(`Batch reconciliation completed`, results);
      
      return results;
    } catch (error) {
      logger.error('Error in batch reconciliation:', error);
      throw error;
    }
  }

  /**
   * Validate cached balance accuracy
   * @param {String} customerId - Customer ID
   * @returns {Promise<Object>} Validation result
   */
  async validateBalanceCache(customerId) {
    try {
      const calculated = await this.calculateBalanceFromLedger(customerId);
      const customer = await Customer.findById(customerId);
      
      if (!customer) {
        throw new Error(`Customer ${customerId} not found`);
      }
      
      const cached = {
        pendingBalance: customer.pendingBalance || 0,
        advanceBalance: customer.advanceBalance || 0,
        currentBalance: customer.currentBalance || 0
      };
      
      const isValid = Math.abs(calculated.pendingBalance - cached.pendingBalance) < 0.01 &&
                      Math.abs(calculated.advanceBalance - cached.advanceBalance) < 0.01;
      
      return {
        isValid,
        calculated,
        cached,
        drift: {
          pendingBalance: calculated.pendingBalance - cached.pendingBalance,
          advanceBalance: calculated.advanceBalance - cached.advanceBalance,
          currentBalance: calculated.currentBalance - cached.currentBalance
        }
      };
    } catch (error) {
      logger.error('Error validating balance cache:', error);
      throw error;
    }
  }
}

module.exports = new LedgerBalanceService();

