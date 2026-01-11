/**
 * Customer Transaction Service - Ledger-Driven
 * 
 * All balance updates go through transaction creation
 * Cache is updated incrementally for performance
 */

const CustomerTransaction = require('../models/CustomerTransaction');
const Customer = require('../models/Customer');
const ledgerBalanceService = require('./ledgerBalanceService');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

class CustomerTransactionServiceLedgerDriven {
  /**
   * Create customer transaction and update balance cache
   * @param {Object} transactionData - Transaction data
   * @param {Object} user - User creating transaction
   * @param {Object} options - Options
   * @returns {Promise<CustomerTransaction>} Created transaction
   */
  async createTransaction(transactionData, user, options = {}) {
    const { session = null, skipCacheUpdate = false } = options;
    
    const shouldCreateSession = !session;
    const transactionSession = session || await mongoose.startSession();
    
    if (shouldCreateSession) {
      transactionSession.startTransaction();
    }
    
    try {
      // Get customer
      const customer = await Customer.findById(transactionData.customerId).session(transactionSession);
      if (!customer) {
        throw new Error('Customer not found');
      }
      
      // Get current cached balances (for snapshot)
      const balanceBefore = {
        pendingBalance: customer.pendingBalance || 0,
        advanceBalance: customer.advanceBalance || 0,
        currentBalance: customer.currentBalance || 0
      };
      
      // Calculate balance impact
      const balanceImpact = this.calculateBalanceImpact(transactionData);
      
      // Calculate new balances
      const balanceAfter = ledgerBalanceService.calculateNewBalanceFromTransaction(
        balanceBefore,
        {
          ...transactionData,
          balanceImpact
        }
      );
      
      // Generate transaction number
      const transactionNumber = await CustomerTransaction.generateTransactionNumber(
        transactionData.transactionType,
        transactionData.customerId
      );
      
      // Create transaction
      const transaction = new CustomerTransaction({
        customer: transactionData.customerId,
        transactionNumber,
        transactionType: transactionData.transactionType,
        transactionDate: transactionData.transactionDate || new Date(),
        dueDate: transactionData.dueDate,
        referenceType: transactionData.referenceType,
        referenceId: transactionData.referenceId,
        referenceNumber: transactionData.referenceNumber,
        grossAmount: transactionData.grossAmount || 0,
        discountAmount: transactionData.discountAmount || 0,
        taxAmount: transactionData.taxAmount || 0,
        netAmount: transactionData.netAmount,
        balanceImpact: balanceImpact,
        balanceBefore: balanceBefore,
        balanceAfter: balanceAfter,
        affectsPendingBalance: this.affectsPendingBalance(transactionData.transactionType),
        affectsAdvanceBalance: this.affectsAdvanceBalance(transactionData.transactionType),
        lineItems: transactionData.lineItems || [],
        paymentDetails: transactionData.paymentDetails,
        status: transactionData.status || 'posted',
        notes: transactionData.notes,
        createdBy: user._id,
        postedBy: user._id,
        postedAt: new Date()
      });
      
      await transaction.save({ session: transactionSession });
      
      // Update balance cache incrementally (unless skipped)
      if (!skipCacheUpdate) {
        await this.updateBalanceCache(customer._id, balanceAfter, transactionSession);
      }
      
      if (shouldCreateSession) {
        await transactionSession.commitTransaction();
      }
      
      logger.info(`Customer transaction created: ${transaction.transactionNumber}`, {
        transactionId: transaction._id,
        customerId: transactionData.customerId,
        transactionType: transactionData.transactionType,
        netAmount: transactionData.netAmount,
        balanceImpact
      });
      
      return transaction;
    } catch (error) {
      if (shouldCreateSession) {
        await transactionSession.abortTransaction();
      }
      logger.error('Error creating customer transaction:', error);
      throw error;
    } finally {
      if (shouldCreateSession) {
        transactionSession.endSession();
      }
    }
  }

  /**
   * Calculate balance impact from transaction
   * @param {Object} transactionData - Transaction data
   * @returns {Number} Balance impact
   */
  calculateBalanceImpact(transactionData) {
    const { transactionType, netAmount } = transactionData;
    
    switch (transactionType) {
      case 'invoice':
      case 'debit_note':
        return netAmount; // Positive (customer owes more)
        
      case 'payment':
        return -netAmount; // Negative (customer owes less)
        
      case 'refund':
      case 'credit_note':
        return -netAmount; // Negative (customer owes less)
        
      case 'adjustment':
        return transactionData.balanceImpact || 0; // Can be positive or negative
        
      case 'write_off':
        return -netAmount; // Negative (customer owes less)
        
      case 'opening_balance':
        return transactionData.balanceImpact || netAmount;
        
      default:
        return 0;
    }
  }

  /**
   * Check if transaction affects pending balance
   */
  affectsPendingBalance(transactionType) {
    return ['invoice', 'payment', 'refund', 'credit_note', 'debit_note', 
            'adjustment', 'write_off', 'opening_balance'].includes(transactionType);
  }

  /**
   * Check if transaction affects advance balance
   */
  affectsAdvanceBalance(transactionType) {
    return ['payment', 'refund', 'credit_note'].includes(transactionType);
  }

  /**
   * Update balance cache
   * @param {String} customerId - Customer ID
   * @param {Object} newBalances - New balances
   * @param {Object} session - MongoDB session
   */
  async updateBalanceCache(customerId, newBalances, session = null) {
    const customer = await Customer.findById(customerId).session(session);
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }
    
    // Update cache with flag
    const update = {
      $set: {
        pendingBalance: newBalances.pendingBalance,
        advanceBalance: newBalances.advanceBalance,
        currentBalance: newBalances.currentBalance,
        __allowBalanceCacheUpdate: true
      },
      $inc: { __v: 1 }
    };
    
    const updated = await Customer.findOneAndUpdate(
      { _id: customerId, __v: customer.__v },
      update,
      { session, new: true }
    );
    
    if (!updated) {
      throw new Error('Concurrent balance cache update conflict. Please retry.');
    }
    
    // Clear flag (not strictly necessary)
    delete updated.__allowBalanceCacheUpdate;
  }
}

module.exports = new CustomerTransactionServiceLedgerDriven();

