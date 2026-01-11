/**
 * Payment Application Service - Enterprise Accounting
 * 
 * Handles payment application to invoices with proper accounting
 * - Links payments to invoices
 * - Handles partial payments
 * - Handles overpayments (advance balance)
 * - Handles split payments
 */

const CustomerTransaction = require('../models/CustomerTransaction');
const PaymentApplication = require('../models/PaymentApplication');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

class PaymentApplicationService {
  /**
   * Apply payment to invoice(s)
   * @param {Object} params - Application parameters
   * @param {String} params.paymentId - Payment transaction ID
   * @param {String} params.customerId - Customer ID
   * @param {Array} params.applications - Array of { invoiceId, amount }
   * @param {Object} params.user - User applying payment
   * @param {String} params.notes - Optional notes
   * @returns {Promise<PaymentApplication>}
   */
  async applyPayment(params) {
    const { paymentId, customerId, applications, user, notes } = params;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Get payment transaction
      const payment = await CustomerTransaction.findById(paymentId).session(session);
      if (!payment) {
        throw new Error(`Payment transaction ${paymentId} not found`);
      }

      if (payment.transactionType !== 'payment') {
        throw new Error(`Transaction ${paymentId} is not a payment`);
      }

      if (payment.customer.toString() !== customerId) {
        throw new Error(`Payment does not belong to customer ${customerId}`);
      }

      // 2. Get customer
      const customer = await Customer.findById(customerId).session(session);
      if (!customer) {
        throw new Error(`Customer ${customerId} not found`);
      }

      // 3. Validate and process applications
      const validApplications = [];
      let totalApplied = 0;

      for (const app of applications) {
        const invoice = await CustomerTransaction.findById(app.invoiceId).session(session);
        
        if (!invoice) {
          throw new Error(`Invoice ${app.invoiceId} not found`);
        }

        if (invoice.transactionType !== 'invoice') {
          throw new Error(`Transaction ${app.invoiceId} is not an invoice`);
        }

        if (invoice.customer.toString() !== customerId) {
          throw new Error(`Invoice does not belong to customer ${customerId}`);
        }

        if (invoice.status === 'paid' || invoice.status === 'cancelled') {
          throw new Error(`Invoice ${invoice.transactionNumber} is already paid or cancelled`);
        }

        // Calculate amount to apply (cannot exceed remaining amount)
        const remainingAmount = invoice.remainingAmount || invoice.netAmount - invoice.paidAmount;
        const amountToApply = Math.min(app.amount, remainingAmount);

        if (amountToApply <= 0) {
          throw new Error(`Invoice ${invoice.transactionNumber} has no remaining amount`);
        }

        // Update invoice
        invoice.paidAmount = (invoice.paidAmount || 0) + amountToApply;
        invoice.remainingAmount = Math.max(0, invoice.netAmount - invoice.paidAmount);
        
        if (invoice.remainingAmount === 0) {
          invoice.status = 'paid';
        } else {
          invoice.status = 'partially_paid';
        }

        await invoice.save({ session });

        validApplications.push({
          invoice: invoice._id,
          invoiceNumber: invoice.transactionNumber,
          amountApplied: amountToApply,
          discountTaken: 0, // Can be calculated if needed
          appliedDate: new Date(),
          appliedBy: user._id
        });

        totalApplied += amountToApply;
      }

      // 4. Calculate unapplied amount (overpayment)
      const unappliedAmount = Math.max(0, payment.netAmount - totalApplied);

      // 5. Validate total
      if (Math.abs(totalApplied + unappliedAmount - payment.netAmount) > 0.01) {
        throw new Error(`Payment application total (${totalApplied + unappliedAmount}) does not match payment amount (${payment.netAmount})`);
      }

      // 6. Create payment application record
      const paymentApplication = new PaymentApplication({
        payment: paymentId,
        customer: customerId,
        applications: validApplications,
        unappliedAmount,
        totalPaymentAmount: payment.netAmount,
        status: 'applied',
        createdBy: user._id,
        appliedBy: user._id,
        notes
      });

      await paymentApplication.save({ session });

      // 7. Update customer balance
      const balanceBefore = {
        pendingBalance: customer.pendingBalance || 0,
        advanceBalance: customer.advanceBalance || 0,
        currentBalance: customer.currentBalance || 0
      };

      // Reduce pending balance by applied amount
      const newPendingBalance = Math.max(0, balanceBefore.pendingBalance - totalApplied);
      
      // Increase advance balance by unapplied amount (overpayment)
      const newAdvanceBalance = balanceBefore.advanceBalance + unappliedAmount;
      
      // Calculate new current balance
      const newCurrentBalance = newPendingBalance - newAdvanceBalance;

      const balanceAfter = {
        pendingBalance: newPendingBalance,
        advanceBalance: newAdvanceBalance,
        currentBalance: newCurrentBalance
      };

      // Update customer balance atomically
      const updatedCustomer = await Customer.findOneAndUpdate(
        { _id: customerId, __v: customer.__v },
        {
          $set: {
            pendingBalance: newPendingBalance,
            advanceBalance: newAdvanceBalance,
            currentBalance: newCurrentBalance
          },
          $inc: { __v: 1 }
        },
        { session, new: true }
      );

      if (!updatedCustomer) {
        throw new Error('Concurrent customer balance update conflict. Please retry.');
      }

      // 8. Update payment transaction with balance snapshots (if not already set)
      if (!payment.balanceBefore || !payment.balanceAfter) {
        payment.balanceBefore = balanceBefore;
        payment.balanceAfter = balanceAfter;
        await payment.save({ session });
      }

      // Commit transaction
      await session.commitTransaction();

      logger.info(`Payment ${payment.transactionNumber} applied successfully`, {
        paymentId,
        customerId,
        totalApplied,
        unappliedAmount,
        invoicesApplied: validApplications.length
      });

      return paymentApplication;
    } catch (error) {
      await session.abortTransaction();
      logger.error('Error applying payment:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Auto-apply payment to oldest invoices (FIFO)
   * @param {String} paymentId - Payment transaction ID
   * @param {String} customerId - Customer ID
   * @param {Object} user - User
   * @returns {Promise<PaymentApplication>}
   */
  async autoApplyPayment(paymentId, customerId, user) {
    const payment = await CustomerTransaction.findById(paymentId);
    if (!payment) {
      throw new Error(`Payment transaction ${paymentId} not found`);
    }

    // Get open invoices for customer (oldest first)
    const openInvoices = await CustomerTransaction.find({
      customer: customerId,
      transactionType: 'invoice',
      status: { $in: ['open', 'partially_paid'] }
    })
      .sort({ transactionDate: 1, dueDate: 1 }) // Oldest first
      .lean();

    if (openInvoices.length === 0) {
      // No invoices to apply, all goes to advance balance
      return this.applyPayment({
        paymentId,
        customerId,
        applications: [],
        user,
        notes: 'Auto-applied: No open invoices, full amount to advance balance'
      });
    }

    // Build applications array
    const applications = [];
    let remainingPayment = payment.netAmount;

    for (const invoice of openInvoices) {
      if (remainingPayment <= 0) break;

      const remainingAmount = invoice.netAmount - (invoice.paidAmount || 0);
      const amountToApply = Math.min(remainingPayment, remainingAmount);

      if (amountToApply > 0) {
        applications.push({
          invoiceId: invoice._id,
          amount: amountToApply
        });
        remainingPayment -= amountToApply;
      }
    }

    return this.applyPayment({
      paymentId,
      customerId,
      applications,
      user,
      notes: `Auto-applied to ${applications.length} invoice(s), ${remainingPayment > 0 ? remainingPayment : 0} to advance balance`
    });
  }

  /**
   * Reverse payment application
   * @param {String} applicationId - Payment application ID
   * @param {Object} user - User
   * @param {String} reason - Reason for reversal
   * @returns {Promise<PaymentApplication>}
   */
  async reverseApplication(applicationId, user, reason) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const application = await PaymentApplication.findById(applicationId).session(session);
      if (!application) {
        throw new Error(`Payment application ${applicationId} not found`);
      }

      if (application.isReversed) {
        throw new Error(`Payment application ${applicationId} is already reversed`);
      }

      // Reverse invoice payments
      for (const app of application.applications) {
        const invoice = await CustomerTransaction.findById(app.invoice).session(session);
        if (invoice) {
          invoice.paidAmount = Math.max(0, invoice.paidAmount - app.amountApplied);
          invoice.remainingAmount = invoice.netAmount - invoice.paidAmount;
          
          if (invoice.remainingAmount === invoice.netAmount) {
            invoice.status = 'open';
          } else if (invoice.remainingAmount > 0) {
            invoice.status = 'partially_paid';
          }
          
          await invoice.save({ session });
        }
      }

      // Reverse customer balance changes
      const customer = await Customer.findById(application.customer).session(session);
      if (customer) {
        const totalApplied = application.applications.reduce((sum, app) => sum + app.amountApplied, 0);
        const newPendingBalance = (customer.pendingBalance || 0) + totalApplied;
        const newAdvanceBalance = Math.max(0, (customer.advanceBalance || 0) - application.unappliedAmount);
        const newCurrentBalance = newPendingBalance - newAdvanceBalance;

        await Customer.findOneAndUpdate(
          { _id: application.customer, __v: customer.__v },
          {
            $set: {
              pendingBalance: newPendingBalance,
              advanceBalance: newAdvanceBalance,
              currentBalance: newCurrentBalance
            },
            $inc: { __v: 1 }
          },
          { session }
        );
      }

      // Mark application as reversed
      application.isReversed = true;
      application.reversedBy = user._id;
      application.reversedAt = new Date();
      application.status = 'reversed';
      application.notes = `${application.notes || ''}\nReversed: ${reason}`.trim();
      await application.save({ session });

      await session.commitTransaction();

      logger.info(`Payment application ${applicationId} reversed`, { applicationId, reason });

      return application;
    } catch (error) {
      await session.abortTransaction();
      logger.error('Error reversing payment application:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = new PaymentApplicationService();

