/**
 * Refund Processing Service - Enterprise Accounting
 * 
 * Handles refund processing after return is completed:
 * - Cash/Bank refunds
 * - Store credit
 * - Links to credit note
 */

const CustomerTransaction = require('../models/CustomerTransaction');
const Return = require('../models/Return');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const invoiceAccountingService = require('./invoiceAccountingService');
const accountingService = require('./accountingService');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

class RefundProcessingService {
  /**
   * Process refund
   * @param {String} returnId - Return ID
   * @param {Object} refundData - Refund data
   * @param {Object} user - User processing refund
   * @returns {Promise<Object>} Refund transaction
   */
  async processRefund(returnId, refundData, user) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Get return
      const returnDoc = await Return.findById(returnId).session(session);
      if (!returnDoc) {
        throw new Error(`Return ${returnId} not found`);
      }

      if (returnDoc.status !== 'completed') {
        throw new Error(`Return ${returnId} must be completed before processing refund`);
      }

      if (returnDoc.refundTransaction) {
        throw new Error(`Refund already processed for return ${returnId}`);
      }

      // 2. Get credit note
      const creditNote = await CustomerTransaction.findById(returnDoc.creditNote).session(session);
      if (!creditNote) {
        throw new Error(`Credit note not found for return ${returnId}`);
      }

      // 3. Validate refund amount
      const refundAmount = refundData.amount || returnDoc.netRefundAmount;
      if (refundAmount > creditNote.netAmount) {
        throw new Error(`Refund amount ${refundAmount} exceeds credit note amount ${creditNote.netAmount}`);
      }

      // 4. Process based on refund method
      const refundMethod = refundData.refundMethod || returnDoc.refundMethod;

      if (refundMethod === 'store_credit') {
        return await this.processStoreCreditRefund({
          returnDoc,
          creditNote,
          refundAmount,
          user,
          session
        });
      } else {
        return await this.processCashRefund({
          returnDoc,
          creditNote,
          refundAmount,
          refundMethod,
          refundData,
          user,
          session
        });
      }
    } catch (error) {
      await session.abortTransaction();
      logger.error('Error processing refund:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Process cash/bank refund
   * @param {Object} params - Parameters
   * @returns {Promise<Object>}
   */
  async processCashRefund(params) {
    const {
      returnDoc,
      creditNote,
      refundAmount,
      refundMethod,
      refundData,
      user,
      session
    } = params;

    // Get customer balance before
    const customer = await Customer.findById(returnDoc.customer).session(session);
    const balanceBefore = {
      pendingBalance: customer.pendingBalance || 0,
      advanceBalance: customer.advanceBalance || 0,
      currentBalance: customer.currentBalance || 0
    };

    // Generate refund number
    const refundNumber = await CustomerTransaction.generateTransactionNumber('refund', returnDoc.customer);

    // Create refund transaction
    const refundTransaction = new CustomerTransaction({
      customer: returnDoc.customer,
      transactionNumber: refundNumber,
      transactionType: 'refund',
      transactionDate: new Date(),
      referenceType: 'sales_return',
      referenceId: returnDoc._id,
      referenceNumber: returnDoc.returnNumber,
      creditNote: creditNote._id,
      netAmount: refundAmount,
      paymentDetails: {
        paymentMethod: refundMethod,
        paymentReference: refundData.paymentReference || refundNumber,
        paymentDate: new Date()
      },
      balanceBefore: balanceBefore,
      balanceAfter: balanceBefore, // Balance already updated by credit note
      status: 'posted',
      notes: `Refund for return ${returnDoc.returnNumber}`,
      createdBy: user._id,
      postedBy: user._id,
      postedAt: new Date()
    });

    await refundTransaction.save({ session });

    // Create accounting entries
    await invoiceAccountingService.createRefundEntries(refundTransaction, { session });

    // Update return
    returnDoc.refundTransaction = refundTransaction._id;
    returnDoc.refundDetails = {
      refundTransaction: refundTransaction._id,
      refundDate: new Date(),
      refundReference: refundNumber,
      refundNotes: refundData.notes
    };
    await returnDoc.save({ session });

    await session.commitTransaction();

    logger.info(`Refund ${refundNumber} processed successfully`, {
      returnId: returnDoc._id,
      refundAmount,
      refundMethod
    });

    return {
      refundTransaction,
      return: returnDoc
    };
  }

  /**
   * Process store credit refund
   * @param {Object} params - Parameters
   * @returns {Promise<Object>}
   */
  async processStoreCreditRefund(params) {
    const {
      returnDoc,
      creditNote,
      refundAmount,
      user,
      session
    } = params;

    // Get customer
    const customer = await Customer.findById(returnDoc.customer).session(session);
    const balanceBefore = {
      pendingBalance: customer.pendingBalance || 0,
      advanceBalance: customer.advanceBalance || 0,
      currentBalance: customer.currentBalance || 0
    };

    // Store credit increases advance balance (already done by credit note)
    // Just create a record for audit trail

    const refundNumber = await CustomerTransaction.generateTransactionNumber('refund', returnDoc.customer);

    const refundTransaction = new CustomerTransaction({
      customer: returnDoc.customer,
      transactionNumber: refundNumber,
      transactionType: 'refund',
      transactionDate: new Date(),
      referenceType: 'sales_return',
      referenceId: returnDoc._id,
      referenceNumber: returnDoc.returnNumber,
      creditNote: creditNote._id,
      netAmount: refundAmount,
      paymentDetails: {
        paymentMethod: 'store_credit',
        paymentReference: refundNumber,
        paymentDate: new Date()
      },
      balanceBefore: balanceBefore,
      balanceAfter: balanceBefore, // Already updated by credit note
      status: 'posted',
      notes: `Store credit for return ${returnDoc.returnNumber}`,
      createdBy: user._id,
      postedBy: user._id,
      postedAt: new Date()
    });

    await refundTransaction.save({ session });

    // No accounting entry for store credit (balance adjustment only)

    // Update return
    returnDoc.refundTransaction = refundTransaction._id;
    returnDoc.refundDetails = {
      refundTransaction: refundTransaction._id,
      refundDate: new Date(),
      refundReference: refundNumber,
      refundNotes: 'Store credit issued'
    };
    await returnDoc.save({ session });

    await session.commitTransaction();

    logger.info(`Store credit ${refundNumber} issued successfully`, {
      returnId: returnDoc._id,
      refundAmount
    });

    return {
      refundTransaction,
      return: returnDoc
    };
  }
}

module.exports = new RefundProcessingService();

