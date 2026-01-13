const Customer = require('../models/Customer');
const CustomerTransaction = require('../models/CustomerTransaction');
const customerAuditLogService = require('./customerAuditLogService');
const logger = require('../utils/logger');

class ReconciliationService {
  /**
   * Reconcile a single customer's balance
   * @param {String} customerId - Customer ID
   * @param {Object} options - Reconciliation options
   * @param {String} tenantId - Tenant ID (required)
   * @returns {Promise<Object>}
   */
  async reconcileCustomerBalance(customerId, options = {}, tenantId = null) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for reconcileCustomerBalance');
    }
    const { autoCorrect = false, alertOnDiscrepancy = true } = options;
    
    const customer = await Customer.findOne({ _id: customerId, tenantId });
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Get all transactions (excluding reversed) - tenant-scoped
    const transactions = await CustomerTransaction.find({
      customer: customerId,
      tenantId,
      status: { $ne: 'reversed' }
    }).sort({ transactionDate: 1 });

    // Calculate balances from transactions
    const calculated = this.calculateBalancesFromTransactions(transactions);

    // Get current customer balances
    const current = {
      pendingBalance: customer.pendingBalance || 0,
      advanceBalance: customer.advanceBalance || 0,
      currentBalance: customer.currentBalance || 0
    };

    // Calculate discrepancies
    const discrepancy = {
      pendingBalance: Math.abs(current.pendingBalance - calculated.pendingBalance),
      advanceBalance: Math.abs(current.advanceBalance - calculated.advanceBalance),
      currentBalance: Math.abs(current.currentBalance - calculated.currentBalance),
      hasDifference: false
    };

    // Check if discrepancy exceeds threshold (0.01 for rounding)
    const threshold = 0.01;
    if (discrepancy.pendingBalance > threshold || 
        discrepancy.advanceBalance > threshold ||
        discrepancy.currentBalance > threshold) {
      discrepancy.hasDifference = true;
    }

    const reconciliation = {
      customerId,
      customerName: customer.businessName || customer.name,
      reconciliationDate: new Date(),
      current,
      calculated,
      discrepancy,
      transactionCount: transactions.length,
      reconciled: !discrepancy.hasDifference
    };

    // Handle discrepancy
    if (discrepancy.hasDifference) {
      reconciliation.discrepancyDetails = {
        pendingBalanceDiff: calculated.pendingBalance - current.pendingBalance,
        advanceBalanceDiff: calculated.advanceBalance - current.advanceBalance,
        currentBalanceDiff: calculated.currentBalance - current.currentBalance
      };

      // Log discrepancy
      await this.logDiscrepancy(customerId, discrepancy, calculated, current);

      // Alert if configured
      if (alertOnDiscrepancy) {
        await this.alertDiscrepancy(customer, reconciliation);
      }

      // Auto-correct if enabled
      if (autoCorrect) {
        await this.correctBalance(customerId, calculated, reconciliation);
        reconciliation.corrected = true;
      }
    }

    return reconciliation;
  }

  /**
   * Calculate balances from transaction sub-ledger
   * @param {Array} transactions - CustomerTransaction records
   * @returns {Object}
   */
  calculateBalancesFromTransactions(transactions) {
    let pendingBalance = 0;
    let advanceBalance = 0;

    transactions.forEach(transaction => {
      if (transaction.affectsPendingBalance) {
        // Positive impact increases pendingBalance (invoice)
        // Negative impact decreases pendingBalance (payment, refund)
        pendingBalance += transaction.balanceImpact;
      }

      if (transaction.affectsAdvanceBalance) {
        // Negative balanceImpact means payment exceeded pending, creating advance
        if (transaction.balanceImpact < 0) {
          const paymentAmount = Math.abs(transaction.balanceImpact);
          // This is handled in balanceAfter, but we need to recalculate
          // For simplicity, use balanceAfter from last transaction if available
        }
      }

      // Use balanceAfter from last transaction as source of truth
      if (transaction.balanceAfter) {
        pendingBalance = transaction.balanceAfter.pendingBalance;
        advanceBalance = transaction.balanceAfter.advanceBalance;
      }
    });

    // If no transactions, recalculate from balance impacts
    if (transactions.length > 0 && !transactions[transactions.length - 1].balanceAfter) {
      // Recalculate from scratch
      pendingBalance = 0;
      advanceBalance = 0;

      transactions.forEach(transaction => {
        const impact = transaction.balanceImpact;
        
        if (transaction.transactionType === 'invoice' || transaction.transactionType === 'debit_note') {
          pendingBalance += impact;
        } else if (transaction.transactionType === 'payment') {
          // Payment reduces pending first, then creates advance
          const paymentAmount = Math.abs(impact);
          const pendingReduction = Math.min(paymentAmount, pendingBalance);
          pendingBalance -= pendingReduction;
          
          const remainingPayment = paymentAmount - pendingReduction;
          if (remainingPayment > 0) {
            advanceBalance += remainingPayment;
          }
        } else if (transaction.transactionType === 'refund' || transaction.transactionType === 'credit_note') {
          // Refund reduces pending, may create advance
          const refundAmount = Math.abs(impact);
          const pendingReduction = Math.min(refundAmount, pendingBalance);
          pendingBalance -= pendingReduction;
          
          const remainingRefund = refundAmount - pendingReduction;
          if (remainingRefund > 0) {
            advanceBalance += remainingRefund;
          }
        } else if (transaction.transactionType === 'adjustment') {
          if (impact > 0) {
            pendingBalance += impact;
          } else {
            const adjustmentAmount = Math.abs(impact);
            const pendingReduction = Math.min(adjustmentAmount, pendingBalance);
            pendingBalance -= pendingReduction;
            
            const remainingAdjustment = adjustmentAmount - pendingReduction;
            if (remainingAdjustment > 0) {
              advanceBalance = Math.max(0, advanceBalance - remainingAdjustment);
            }
          }
        } else if (transaction.transactionType === 'write_off') {
          pendingBalance = Math.max(0, pendingBalance + impact);
        } else if (transaction.transactionType === 'opening_balance') {
          if (impact >= 0) {
            pendingBalance += impact;
          } else {
            advanceBalance += Math.abs(impact);
          }
        }
      });
    }

    const currentBalance = pendingBalance - advanceBalance;

    return {
      pendingBalance: Math.max(0, pendingBalance),
      advanceBalance: Math.max(0, advanceBalance),
      currentBalance
    };
  }

  /**
   * Reconcile all customer balances
   * @param {Object} options - Reconciliation options
   * @param {String} tenantId - Tenant ID (required)
   * @returns {Promise<Object>}
   */
  async reconcileAllCustomerBalances(options = {}, tenantId = null) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for reconcileAllCustomerBalances');
    }
    const { autoCorrect = false, alertOnDiscrepancy = true, batchSize = 100 } = options;
    
    const customers = await Customer.find({ 
      tenantId: tenantId,
      isDeleted: false 
    }).select('_id businessName name pendingBalance advanceBalance currentBalance');

    const results = {
      total: customers.length,
      reconciled: 0,
      discrepancies: 0,
      corrected: 0,
      errors: [],
      startTime: new Date()
    };

    // Process in batches
    for (let i = 0; i < customers.length; i += batchSize) {
      const batch = customers.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (customer) => {
        try {
          const reconciliation = await this.reconcileCustomerBalance(
            customer._id,
            { autoCorrect, alertOnDiscrepancy }
          );

          if (reconciliation.reconciled) {
            results.reconciled++;
          } else {
            results.discrepancies++;
            if (reconciliation.corrected) {
              results.corrected++;
            }
          }
        } catch (error) {
          results.errors.push({
            customerId: customer._id,
            customerName: customer.businessName || customer.name,
            error: error.message
          });
        }
      }));
    }

    results.endTime = new Date();
    results.duration = results.endTime - results.startTime;

    return results;
  }

  /**
   * Log discrepancy for audit
   * @param {String} customerId - Customer ID
   * @param {Object} discrepancy - Discrepancy details
   * @param {Object} calculated - Calculated balances
   * @param {Object} current - Current balances
   * @returns {Promise<void>}
   */
  async logDiscrepancy(customerId, discrepancy, calculated, current) {
    try {
      await customerAuditLogService.logBalanceAdjustment(
        customerId,
        current.currentBalance,
        calculated.currentBalance,
        { _id: null }, // System user
        null, // No req object
        `Balance discrepancy detected: Pending ${discrepancy.pendingBalance.toFixed(2)}, Advance ${discrepancy.advanceBalance.toFixed(2)}`
      );
    } catch (error) {
      logger.error('Error logging discrepancy:', error);
    }
  }

  /**
   * Alert on discrepancy
   * @param {Customer} customer - Customer
   * @param {Object} reconciliation - Reconciliation result
   * @returns {Promise<void>}
   */
  async alertDiscrepancy(customer, reconciliation) {
    // TODO: Implement actual alerting (email, Slack, etc.)
    logger.error('BALANCE DISCREPANCY DETECTED:', {
      customerId: customer._id,
      customerName: customer.businessName || customer.name,
      discrepancy: reconciliation.discrepancy
    });
  }

  /**
   * Correct balance discrepancy
   * @param {String} customerId - Customer ID
   * @param {Object} calculated - Calculated balances
   * @param {Object} reconciliation - Reconciliation result
   * @returns {Promise<Customer>}
   */
  async correctBalance(customerId, calculated, reconciliation) {
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Update balance atomically
    const updated = await Customer.findOneAndUpdate(
      { _id: customerId, __v: customer.__v },
      {
        $set: {
          pendingBalance: calculated.pendingBalance,
          advanceBalance: calculated.advanceBalance,
          currentBalance: calculated.currentBalance
        },
        $inc: { __v: 1 }
      },
      { new: true }
    );

    if (!updated) {
      throw new Error('Concurrent update conflict during balance correction');
    }

    // Log correction
    await customerAuditLogService.logBalanceAdjustment(
      customerId,
      reconciliation.current.currentBalance,
      calculated.currentBalance,
      { _id: null }, // System user
      null,
      `Balance auto-corrected during reconciliation: ${JSON.stringify(reconciliation.discrepancyDetails)}`
    );

    return updated;
  }

  /**
   * Get reconciliation report for a customer
   * @param {String} customerId - Customer ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {String} tenantId - Tenant ID (required)
   * @returns {Promise<Object>}
   */
  async getReconciliationReport(customerId, startDate, endDate, tenantId = null) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for getReconciliationReport');
    }
    const reconciliation = await this.reconcileCustomerBalance(customerId, {}, tenantId);
    
    const transactions = await CustomerTransaction.find({
      customer: customerId,
      tenantId,
      transactionDate: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ transactionDate: 1 });

    return {
      reconciliation,
      period: { startDate, endDate },
      transactions: transactions.length,
      transactionSummary: this.summarizeTransactions(transactions)
    };
  }

  /**
   * Summarize transactions for reporting
   * @param {Array} transactions - Transactions
   * @returns {Object}
   */
  summarizeTransactions(transactions) {
    const summary = {
      invoices: { count: 0, total: 0 },
      payments: { count: 0, total: 0 },
      refunds: { count: 0, total: 0 },
      adjustments: { count: 0, total: 0 },
      writeOffs: { count: 0, total: 0 }
    };

    transactions.forEach(transaction => {
      switch (transaction.transactionType) {
        case 'invoice':
          summary.invoices.count++;
          summary.invoices.total += transaction.netAmount;
          break;
        case 'payment':
          summary.payments.count++;
          summary.payments.total += transaction.netAmount;
          break;
        case 'refund':
        case 'credit_note':
          summary.refunds.count++;
          summary.refunds.total += transaction.netAmount;
          break;
        case 'adjustment':
          summary.adjustments.count++;
          summary.adjustments.total += transaction.netAmount;
          break;
        case 'write_off':
          summary.writeOffs.count++;
          summary.writeOffs.total += transaction.netAmount;
          break;
      }
    });

    return summary;
  }
}

module.exports = new ReconciliationService();

