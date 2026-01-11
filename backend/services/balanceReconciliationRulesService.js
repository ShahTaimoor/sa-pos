/**
 * Balance Reconciliation Conflict Resolution Rules
 * 
 * Defines authoritative sources and conflict resolution rules
 */

const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const CustomerTransaction = require('../models/CustomerTransaction');
const SupplierTransaction = require('../models/SupplierTransaction');
const logger = require('../utils/logger');

class BalanceReconciliationRulesService {
  /**
   * RULE: Ledger (Transaction sub-ledger) > Summary fields
   * 
   * Authoritative source priority:
   * 1. Transaction sub-ledger (CustomerTransaction/SupplierTransaction)
   * 2. Summary fields (pendingBalance, advanceBalance, currentBalance)
   * 
   * When discrepancy found:
   * - Ledger is always correct
   * - Summary fields must be updated to match ledger
   */
  
  /**
   * Reconcile customer balance with conflict resolution
   * @param {String} customerId - Customer ID
   * @param {Object} options - Options
   * @returns {Promise<Object>} Reconciliation result
   */
  async reconcileCustomerBalance(customerId, options = {}) {
    const {
      autoCorrect = false,
      alertOnDiscrepancy = true
    } = options;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // AUTHORITATIVE SOURCE: Calculate from transaction sub-ledger
    const transactions = await CustomerTransaction.find({
      customerId: customerId,
      status: { $ne: 'cancelled' }
    }).sort({ transactionDate: 1 });

    let calculatedPending = 0;
    let calculatedAdvance = 0;

    for (const txn of transactions) {
      if (txn.transactionType === 'invoice' || txn.transactionType === 'debit_note') {
        calculatedPending += txn.netAmount || 0;
      } else if (txn.transactionType === 'payment' || txn.transactionType === 'credit_note') {
        const paymentAmount = txn.netAmount || 0;
        calculatedPending -= paymentAmount;
        
        // Handle overpayment -> advance balance
        if (calculatedPending < 0) {
          calculatedAdvance += Math.abs(calculatedPending);
          calculatedPending = 0;
        }
      } else if (txn.transactionType === 'adjustment') {
        // Adjustments can affect either pending or advance
        const adjustmentAmount = txn.netAmount || 0;
        if (adjustmentAmount > 0) {
          calculatedPending += adjustmentAmount;
        } else {
          calculatedAdvance += Math.abs(adjustmentAmount);
        }
      }
    }

    const calculatedCurrent = calculatedPending - calculatedAdvance;

    // Get stored balances (summary fields)
    const storedPending = customer.pendingBalance || 0;
    const storedAdvance = customer.advanceBalance || 0;
    const storedCurrent = customer.currentBalance || 0;

    // Check for discrepancies
    const pendingDiff = Math.abs(calculatedPending - storedPending);
    const advanceDiff = Math.abs(calculatedAdvance - storedAdvance);
    const currentDiff = Math.abs(calculatedCurrent - storedCurrent);
    const threshold = 0.01; // Allow small rounding differences

    const hasDiscrepancy = pendingDiff > threshold || advanceDiff > threshold || currentDiff > threshold;

    const reconciliation = {
      customerId,
      reconciled: !hasDiscrepancy,
      hasDiscrepancy,
      stored: {
        pendingBalance: storedPending,
        advanceBalance: storedAdvance,
        currentBalance: storedCurrent
      },
      calculated: {
        pendingBalance: calculatedPending,
        advanceBalance: calculatedAdvance,
        currentBalance: calculatedCurrent
      },
      discrepancies: {
        pendingBalance: pendingDiff,
        advanceBalance: advanceDiff,
        currentBalance: currentDiff
      },
      transactionCount: transactions.length,
      rule: 'Ledger (Transaction sub-ledger) is authoritative source. Summary fields must match ledger.'
    };

    // Auto-correct if enabled
    if (hasDiscrepancy && autoCorrect) {
      // RULE: Update summary fields to match ledger (authoritative source)
      const updated = await Customer.findOneAndUpdate(
        { _id: customerId, __v: customer.__v },
        {
          $set: {
            pendingBalance: calculatedPending,
            advanceBalance: calculatedAdvance,
            currentBalance: calculatedCurrent
          },
          $inc: { __v: 1 }
        },
        { new: true }
      );

      if (!updated) {
        throw new Error('Concurrent update conflict during balance correction');
      }

      reconciliation.corrected = true;
      reconciliation.correctedAt = new Date();

      logger.warn(`Customer balance auto-corrected: ${customerId}`, {
        before: reconciliation.stored,
        after: reconciliation.calculated
      });
    }

    // Alert on discrepancy
    if (hasDiscrepancy && alertOnDiscrepancy) {
      logger.warn(`Balance discrepancy detected for customer ${customerId}`, reconciliation);
      // TODO: Send alert to administrators
    }

    return reconciliation;
  }

  /**
   * Reconcile supplier balance with conflict resolution
   * @param {String} supplierId - Supplier ID
   * @param {Object} options - Options
   * @returns {Promise<Object>} Reconciliation result
   */
  async reconcileSupplierBalance(supplierId, options = {}) {
    const {
      autoCorrect = false,
      alertOnDiscrepancy = true
    } = options;

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      throw new Error('Supplier not found');
    }

    // AUTHORITATIVE SOURCE: Calculate from transaction sub-ledger
    const SupplierTransaction = require('../models/SupplierTransaction');
    const transactions = await SupplierTransaction.find({
      supplierId: supplierId,
      status: { $ne: 'cancelled' }
    }).sort({ transactionDate: 1 });

    let calculatedPending = 0;
    let calculatedAdvance = 0;

    for (const txn of transactions) {
      if (txn.transactionType === 'invoice' || txn.transactionType === 'debit_note') {
        calculatedPending += txn.netAmount || 0;
      } else if (txn.transactionType === 'payment' || txn.transactionType === 'credit_note') {
        const paymentAmount = txn.netAmount || 0;
        calculatedPending -= paymentAmount;
        
        if (calculatedPending < 0) {
          calculatedAdvance += Math.abs(calculatedPending);
          calculatedPending = 0;
        }
      }
    }

    const calculatedCurrent = calculatedPending - calculatedAdvance;

    const storedPending = supplier.pendingBalance || 0;
    const storedAdvance = supplier.advanceBalance || 0;
    const storedCurrent = supplier.currentBalance || 0;

    const pendingDiff = Math.abs(calculatedPending - storedPending);
    const advanceDiff = Math.abs(calculatedAdvance - storedAdvance);
    const currentDiff = Math.abs(calculatedCurrent - storedCurrent);
    const threshold = 0.01;

    const hasDiscrepancy = pendingDiff > threshold || advanceDiff > threshold || currentDiff > threshold;

    const reconciliation = {
      supplierId,
      reconciled: !hasDiscrepancy,
      hasDiscrepancy,
      stored: {
        pendingBalance: storedPending,
        advanceBalance: storedAdvance,
        currentBalance: storedCurrent
      },
      calculated: {
        pendingBalance: calculatedPending,
        advanceBalance: calculatedAdvance,
        currentBalance: calculatedCurrent
      },
      discrepancies: {
        pendingBalance: pendingDiff,
        advanceBalance: advanceDiff,
        currentBalance: currentDiff
      },
      transactionCount: transactions.length,
      rule: 'Ledger (Transaction sub-ledger) is authoritative source. Summary fields must match ledger.'
    };

    if (hasDiscrepancy && autoCorrect) {
      const updated = await Supplier.findOneAndUpdate(
        { _id: supplierId, __v: supplier.__v },
        {
          $set: {
            pendingBalance: calculatedPending,
            advanceBalance: calculatedAdvance,
            currentBalance: calculatedCurrent
          },
          $inc: { __v: 1 }
        },
        { new: true }
      );

      if (!updated) {
        throw new Error('Concurrent update conflict during balance correction');
      }

      reconciliation.corrected = true;
      reconciliation.correctedAt = new Date();
    }

    return reconciliation;
  }

  /**
   * Define overpayment & advance handling rules
   * @param {Number} paymentAmount - Payment amount
   * @param {Number} pendingBalance - Current pending balance
   * @returns {Object} Payment application rules
   */
  getOverpaymentHandlingRules(paymentAmount, pendingBalance) {
    if (paymentAmount > pendingBalance) {
      const overpayment = paymentAmount - pendingBalance;
      return {
        rule: 'Overpayment automatically goes to advanceBalance (credit/advance)',
        appliedToPending: pendingBalance,
        goesToAdvance: overpayment,
        remainingPending: 0,
        newAdvance: overpayment
      };
    }

    return {
      rule: 'Payment applied to pendingBalance',
      appliedToPending: paymentAmount,
      goesToAdvance: 0,
      remainingPending: pendingBalance - paymentAmount,
      newAdvance: 0
    };
  }
}

module.exports = new BalanceReconciliationRulesService();

