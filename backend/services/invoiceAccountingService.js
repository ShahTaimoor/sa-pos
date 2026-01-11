/**
 * Invoice Accounting Service - Enterprise Accounting
 * 
 * Creates proper accounting journal entries for invoices and payments
 */

const Transaction = require('../models/Transaction');
const CustomerTransaction = require('../models/CustomerTransaction');
const AccountingService = require('./accountingService');
const logger = require('../utils/logger');

class InvoiceAccountingService {
  /**
   * Create accounting entries for invoice
   * @param {CustomerTransaction} invoice - Invoice transaction
   * @param {Object} options - Options
   * @returns {Promise<Array>} Created transactions
   */
  async createInvoiceEntries(invoice, options = {}) {
    const { session = null } = options;
    const entries = [];

    try {
      // Entry 1: Debit AR, Credit Revenue
      const arAccountCode = await AccountingService.getAccountCode('Accounts Receivable', 'asset', 'current_assets')
        .catch(() => 'AR');
      
      const revenueAccountCode = await AccountingService.getAccountCode('Sales Revenue', 'revenue', 'sales_revenue')
        .catch(() => 'SALES_REVENUE');

      // Debit: Accounts Receivable
      const arEntry = new Transaction({
        accountCode: arAccountCode,
        debitAmount: invoice.netAmount,
        creditAmount: 0,
        description: `Invoice ${invoice.transactionNumber}`,
        referenceType: 'customer_invoice',
        referenceId: invoice._id,
        transactionDate: invoice.transactionDate,
        status: 'posted',
        createdBy: invoice.createdBy
      });

      if (session) {
        await arEntry.save({ session });
      } else {
        await arEntry.save();
      }

      entries.push(arEntry);

      // Credit: Sales Revenue
      const revenueEntry = new Transaction({
        accountCode: revenueAccountCode,
        debitAmount: 0,
        creditAmount: invoice.netAmount,
        description: `Sales Revenue - Invoice ${invoice.transactionNumber}`,
        referenceType: 'customer_invoice',
        referenceId: invoice._id,
        transactionDate: invoice.transactionDate,
        status: 'posted',
        createdBy: invoice.createdBy
      });

      if (session) {
        await revenueEntry.save({ session });
      } else {
        await revenueEntry.save();
      }

      entries.push(revenueEntry);

      // Store accounting entries in invoice
      invoice.accountingEntries = invoice.accountingEntries || [];
      invoice.accountingEntries.push({
        accountCode: arAccountCode,
        debitAmount: invoice.netAmount,
        creditAmount: 0,
        description: `Invoice ${invoice.transactionNumber}`,
        transactionId: arEntry._id
      }, {
        accountCode: revenueAccountCode,
        debitAmount: 0,
        creditAmount: invoice.netAmount,
        description: `Sales Revenue - Invoice ${invoice.transactionNumber}`,
        transactionId: revenueEntry._id
      });

      if (session) {
        await invoice.save({ session });
      } else {
        await invoice.save();
      }

      logger.info(`Accounting entries created for invoice ${invoice.transactionNumber}`, {
        invoiceId: invoice._id,
        entries: entries.length
      });

      return entries;
    } catch (error) {
      logger.error('Error creating invoice accounting entries:', error);
      throw error;
    }
  }

  /**
   * Create accounting entries for payment
   * @param {CustomerTransaction} payment - Payment transaction
   * @param {Object} options - Options
   * @returns {Promise<Array>} Created transactions
   */
  async createPaymentEntries(payment, options = {}) {
    const { session = null } = options;
    const entries = [];

    try {
      // Determine payment account (Cash or Bank)
      const paymentMethod = payment.paymentDetails?.paymentMethod || 'cash';
      let paymentAccountCode;

      switch (paymentMethod) {
        case 'cash':
          paymentAccountCode = await AccountingService.getAccountCode('Cash', 'asset', 'current_assets')
            .catch(() => 'CASH');
          break;
        case 'bank_transfer':
        case 'check':
          paymentAccountCode = await AccountingService.getAccountCode('Bank', 'asset', 'current_assets')
            .catch(() => 'BANK');
          break;
        case 'credit_card':
        case 'debit_card':
          paymentAccountCode = await AccountingService.getAccountCode('Bank', 'asset', 'current_assets')
            .catch(() => 'BANK');
          break;
        default:
          paymentAccountCode = 'CASH';
      }

      const arAccountCode = await AccountingService.getAccountCode('Accounts Receivable', 'asset', 'current_assets')
        .catch(() => 'AR');

      // Debit: Cash/Bank
      const cashEntry = new Transaction({
        accountCode: paymentAccountCode,
        debitAmount: payment.netAmount,
        creditAmount: 0,
        description: `Payment ${payment.transactionNumber} - ${paymentMethod}`,
        referenceType: 'customer_payment',
        referenceId: payment._id,
        transactionDate: payment.transactionDate,
        status: 'posted',
        createdBy: payment.createdBy
      });

      if (session) {
        await cashEntry.save({ session });
      } else {
        await cashEntry.save();
      }

      entries.push(cashEntry);

      // Credit: Accounts Receivable
      const arEntry = new Transaction({
        accountCode: arAccountCode,
        debitAmount: 0,
        creditAmount: payment.netAmount,
        description: `Payment ${payment.transactionNumber} - AR reduction`,
        referenceType: 'customer_payment',
        referenceId: payment._id,
        transactionDate: payment.transactionDate,
        status: 'posted',
        createdBy: payment.createdBy
      });

      if (session) {
        await arEntry.save({ session });
      } else {
        await arEntry.save();
      }

      entries.push(arEntry);

      // Store accounting entries in payment
      payment.accountingEntries = payment.accountingEntries || [];
      payment.accountingEntries.push({
        accountCode: paymentAccountCode,
        debitAmount: payment.netAmount,
        creditAmount: 0,
        description: `Payment ${payment.transactionNumber}`,
        transactionId: cashEntry._id
      }, {
        accountCode: arAccountCode,
        debitAmount: 0,
        creditAmount: payment.netAmount,
        description: `Payment ${payment.transactionNumber} - AR`,
        transactionId: arEntry._id
      });

      if (session) {
        await payment.save({ session });
      } else {
        await payment.save();
      }

      logger.info(`Accounting entries created for payment ${payment.transactionNumber}`, {
        paymentId: payment._id,
        entries: entries.length
      });

      return entries;
    } catch (error) {
      logger.error('Error creating payment accounting entries:', error);
      throw error;
    }
  }

  /**
   * Create accounting entries for refund
   * @param {CustomerTransaction} refund - Refund transaction
   * @param {Object} options - Options
   * @returns {Promise<Array>} Created transactions
   */
  async createRefundEntries(refund, options = {}) {
    const { session = null } = options;
    const entries = [];

    try {
      const arAccountCode = await AccountingService.getAccountCode('Accounts Receivable', 'asset', 'current_assets')
        .catch(() => 'AR');
      
      const salesReturnsAccountCode = await AccountingService.getAccountCode('Sales Returns', 'revenue', 'sales_returns')
        .catch(() => 'SALES_RETURNS');

      const paymentMethod = refund.paymentDetails?.paymentMethod || 'cash';
      let paymentAccountCode;
      
      if (paymentMethod === 'cash') {
        paymentAccountCode = await AccountingService.getAccountCode('Cash', 'asset', 'current_assets')
          .catch(() => 'CASH');
      } else {
        paymentAccountCode = await AccountingService.getAccountCode('Bank', 'asset', 'current_assets')
          .catch(() => 'BANK');
      }

      // Entry 1: Debit Sales Returns, Credit AR
      const salesReturnEntry = new Transaction({
        accountCode: salesReturnsAccountCode,
        debitAmount: refund.netAmount,
        creditAmount: 0,
        description: `Refund ${refund.transactionNumber} - Sales Return`,
        referenceType: 'customer_refund',
        referenceId: refund._id,
        transactionDate: refund.transactionDate,
        status: 'posted',
        createdBy: refund.createdBy
      });

      if (session) {
        await salesReturnEntry.save({ session });
      } else {
        await salesReturnEntry.save();
      }

      entries.push(salesReturnEntry);

      const arCreditEntry = new Transaction({
        accountCode: arAccountCode,
        debitAmount: 0,
        creditAmount: refund.netAmount,
        description: `Refund ${refund.transactionNumber} - AR reduction`,
        referenceType: 'customer_refund',
        referenceId: refund._id,
        transactionDate: refund.transactionDate,
        status: 'posted',
        createdBy: refund.createdBy
      });

      if (session) {
        await arCreditEntry.save({ session });
      } else {
        await arCreditEntry.save();
      }

      entries.push(arCreditEntry);

      // Entry 2: Debit AR, Credit Cash/Bank (payment back to customer)
      const arDebitEntry = new Transaction({
        accountCode: arAccountCode,
        debitAmount: refund.netAmount,
        creditAmount: 0,
        description: `Refund ${refund.transactionNumber} - AR adjustment`,
        referenceType: 'customer_refund',
        referenceId: refund._id,
        transactionDate: refund.transactionDate,
        status: 'posted',
        createdBy: refund.createdBy
      });

      if (session) {
        await arDebitEntry.save({ session });
      } else {
        await arDebitEntry.save();
      }

      entries.push(arDebitEntry);

      const cashEntry = new Transaction({
        accountCode: paymentAccountCode,
        debitAmount: 0,
        creditAmount: refund.netAmount,
        description: `Refund ${refund.transactionNumber} - Payment to customer`,
        referenceType: 'customer_refund',
        referenceId: refund._id,
        transactionDate: refund.transactionDate,
        status: 'posted',
        createdBy: refund.createdBy
      });

      if (session) {
        await cashEntry.save({ session });
      } else {
        await cashEntry.save();
      }

      entries.push(cashEntry);

      // Store accounting entries in refund
      refund.accountingEntries = refund.accountingEntries || [];
      refund.accountingEntries.push(...entries.map(entry => ({
        accountCode: entry.accountCode,
        debitAmount: entry.debitAmount,
        creditAmount: entry.creditAmount,
        description: entry.description,
        transactionId: entry._id
      })));

      if (session) {
        await refund.save({ session });
      } else {
        await refund.save();
      }

      logger.info(`Accounting entries created for refund ${refund.transactionNumber}`, {
        refundId: refund._id,
        entries: entries.length
      });

      return entries;
    } catch (error) {
      logger.error('Error creating refund accounting entries:', error);
      throw error;
    }
  }
}

module.exports = new InvoiceAccountingService();

