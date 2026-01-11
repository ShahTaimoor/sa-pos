/**
 * Return Processing Service - Enterprise Accounting
 * 
 * Handles return processing with proper accounting:
 * - Uses frozen COGS from original sale
 * - Creates credit notes
 * - Restocks inventory
 * - Reverses revenue and COGS
 * - Handles returns after period close
 */

const Return = require('../models/Return');
const Sales = require('../models/Sales');
const CustomerTransaction = require('../models/CustomerTransaction');
const Inventory = require('../models/Inventory');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const AccountingPeriod = require('../models/AccountingPeriod');
const invoiceAccountingService = require('./invoiceAccountingService');
const accountingService = require('./accountingService');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

class ReturnProcessingService {
  /**
   * Process return (create credit note, restock inventory, reverse accounting)
   * @param {String} returnId - Return ID
   * @param {Object} user - User processing return
   * @param {Object} options - Options
   * @returns {Promise<Object>} Processed return with credit note
   */
  async processReturn(returnId, user, options = {}) {
    const { session: providedSession = null } = options;
    const shouldCreateSession = !providedSession;
    const session = providedSession || await mongoose.startSession();

    if (shouldCreateSession) {
      session.startTransaction();
    }

    try {
      // 1. Get return
      const returnDoc = await Return.findById(returnId).session(session);
      if (!returnDoc) {
        throw new Error(`Return ${returnId} not found`);
      }

      if (returnDoc.status === 'completed' || returnDoc.status === 'cancelled') {
        throw new Error(`Return ${returnId} is already ${returnDoc.status}`);
      }

      // 2. Get original order
      const originalOrder = await Sales.findById(returnDoc.originalOrder).session(session);
      if (!originalOrder) {
        throw new Error(`Original order ${returnDoc.originalOrder} not found`);
      }

      // 3. Get original invoice
      const originalInvoice = await CustomerTransaction.findOne({
        referenceType: 'sales_order',
        referenceId: originalOrder._id,
        transactionType: 'invoice'
      }).session(session);

      if (!originalInvoice) {
        throw new Error(`Original invoice for order ${originalOrder.orderNumber} not found`);
      }

      // 4. Get frozen COGS from original order
      const frozenCOGS = originalOrder.metadata?.frozenCOGS;
      if (!frozenCOGS || !frozenCOGS.frozen) {
        throw new Error(`Frozen COGS not found for order ${originalOrder.orderNumber}`);
      }

      // 5. Calculate return amounts
      const returnAmounts = this.calculateReturnAmounts(returnDoc, originalOrder, frozenCOGS);

      // 6. Check if return is after period close
      const originalPeriod = await this.getPeriodForDate(originalOrder.createdAt);
      const returnPeriod = await this.getPeriodForDate(new Date());
      const isAfterPeriodClose = originalPeriod && originalPeriod.status === 'closed' && 
                                 originalPeriod._id.toString() !== returnPeriod?._id.toString();

      // 7. Create Credit Note
      const creditNote = await this.createCreditNote({
        returnDoc,
        originalOrder,
        originalInvoice,
        returnAmounts,
        frozenCOGS,
        originalPeriod,
        returnPeriod,
        isAfterPeriodClose,
        user,
        session
      });

      // 8. Restock Inventory
      await this.restockInventory({
        returnDoc,
        originalOrder,
        frozenCOGS,
        session
      });

      // 9. Create Accounting Entries
      await this.createReturnAccountingEntries({
        creditNote,
        returnAmounts,
        frozenCOGS,
        originalPeriod,
        returnPeriod,
        isAfterPeriodClose,
        user,
        session
      });

      // 10. Update Customer Balance
      await this.updateCustomerBalance({
        returnDoc,
        creditNote,
        returnAmounts,
        session
      });

      // 11. Update Original Invoice
      await this.updateOriginalInvoice({
        originalInvoice,
        returnDoc,
        returnAmounts,
        session
      });

      // 12. Update Return Status
      returnDoc.status = 'completed';
      returnDoc.creditNote = creditNote._id;
      returnDoc.processedBy = user._id;
      returnDoc.processedAt = new Date();
      returnDoc.originalPeriod = originalPeriod?._id;
      returnDoc.returnPeriod = returnPeriod?._id;
      returnDoc.isAfterPeriodClose = isAfterPeriodClose;
      await returnDoc.save({ session });

      if (shouldCreateSession) {
        await session.commitTransaction();
      }

      logger.info(`Return ${returnDoc.returnNumber} processed successfully`, {
        returnId,
        creditNoteId: creditNote._id,
        creditNoteNumber: creditNote.transactionNumber
      });

      return {
        return: returnDoc,
        creditNote,
        returnAmounts
      };
    } catch (error) {
      if (shouldCreateSession) {
        await session.abortTransaction();
      }
      logger.error('Error processing return:', error);
      throw error;
    } finally {
      if (shouldCreateSession) {
        session.endSession();
      }
    }
  }

  /**
   * Calculate return amounts
   * @param {Return} returnDoc - Return document
   * @param {Sales} originalOrder - Original sales order
   * @param {Object} frozenCOGS - Frozen COGS from original sale
   * @returns {Object} Return amounts
   */
  calculateReturnAmounts(returnDoc, originalOrder, frozenCOGS) {
    let totalRefundAmount = 0;
    let totalRestockingFee = 0;
    let totalCOGS = 0;

    const returnItems = [];

    for (const returnItem of returnDoc.items) {
      // Find original order item
      const originalItem = originalOrder.items.find(
        item => item._id.toString() === returnItem.originalOrderItem.toString()
      );

      if (!originalItem) {
        throw new Error(`Original order item ${returnItem.originalOrderItem} not found`);
      }

      // Find frozen COGS for this item
      const frozenCOGSItem = frozenCOGS.items.find(
        item => item.productId.toString() === returnItem.product.toString()
      );

      if (!frozenCOGSItem) {
        throw new Error(`Frozen COGS not found for product ${returnItem.product}`);
      }

      // Calculate refund amount (original price * quantity)
      const refundAmount = (returnItem.refundAmount || originalItem.unitPrice) * returnItem.quantity;
      const restockingFee = returnItem.restockingFee || 0;
      const netRefund = refundAmount - restockingFee;

      // Calculate COGS (frozen cost * quantity)
      const itemCOGS = frozenCOGSItem.unitCost * returnItem.quantity;

      totalRefundAmount += refundAmount;
      totalRestockingFee += restockingFee;
      totalCOGS += itemCOGS;

      returnItems.push({
        productId: returnItem.product,
        quantity: returnItem.quantity,
        refundAmount,
        restockingFee,
        netRefund,
        unitCost: frozenCOGSItem.unitCost,
        totalCOGS: itemCOGS
      });
    }

    return {
      totalRefundAmount,
      totalRestockingFee,
      netRefundAmount: totalRefundAmount - totalRestockingFee,
      totalCOGS,
      items: returnItems
    };
  }

  /**
   * Create credit note
   * @param {Object} params - Parameters
   * @returns {Promise<CustomerTransaction>}
   */
  async createCreditNote(params) {
    const {
      returnDoc,
      originalOrder,
      originalInvoice,
      returnAmounts,
      frozenCOGS,
      originalPeriod,
      returnPeriod,
      isAfterPeriodClose,
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

    // Generate credit note number
    const creditNoteNumber = await CustomerTransaction.generateTransactionNumber('credit_note', returnDoc.customer);

    // Prepare line items
    const lineItems = returnDoc.items.map(returnItem => {
      const originalItem = originalOrder.items.find(
        item => item._id.toString() === returnItem.originalOrderItem.toString()
      );
      const frozenCOGSItem = frozenCOGS.items.find(
        item => item.productId.toString() === returnItem.product.toString()
      );

      return {
        product: returnItem.product,
        description: `Return: ${originalItem?.product?.name || 'Product'}`,
        quantity: returnItem.quantity,
        unitPrice: returnItem.refundAmount || originalItem.unitPrice,
        totalPrice: (returnItem.refundAmount || originalItem.unitPrice) * returnItem.quantity,
        originalUnitCost: frozenCOGSItem?.unitCost || 0
      };
    });

    // Create credit note
    const creditNote = new CustomerTransaction({
      customer: returnDoc.customer,
      transactionNumber: creditNoteNumber,
      transactionType: 'credit_note',
      transactionDate: new Date(),
      referenceType: 'sales_return',
      referenceId: returnDoc._id,
      referenceNumber: returnDoc.returnNumber,
      originalInvoice: originalInvoice._id,
      originalOrder: originalOrder._id,
      grossAmount: returnAmounts.totalRefundAmount,
      discountAmount: 0,
      taxAmount: 0,
      netAmount: returnAmounts.netRefundAmount,
      lineItems: lineItems,
      frozenCOGS: {
        frozen: true,
        frozenAt: frozenCOGS.frozenAt,
        items: returnAmounts.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalCost: item.totalCOGS
        })),
        totalCOGS: returnAmounts.totalCOGS
      },
      balanceBefore: balanceBefore,
      balanceAfter: {
        pendingBalance: Math.max(0, balanceBefore.pendingBalance - returnAmounts.netRefundAmount),
        advanceBalance: balanceBefore.advanceBalance + Math.max(0, returnAmounts.netRefundAmount - balanceBefore.pendingBalance),
        currentBalance: (balanceBefore.pendingBalance - returnAmounts.netRefundAmount) - (balanceBefore.advanceBalance + Math.max(0, returnAmounts.netRefundAmount - balanceBefore.pendingBalance))
      },
      originalPeriod: originalPeriod?._id,
      returnPeriod: returnPeriod?._id,
      status: 'posted',
      notes: `Credit note for return ${returnDoc.returnNumber}`,
      createdBy: user._id,
      postedBy: user._id,
      postedAt: new Date()
    });

    await creditNote.save({ session });

    return creditNote;
  }

  /**
   * Restock inventory
   * @param {Object} params - Parameters
   */
  async restockInventory(params) {
    const { returnDoc, originalOrder, frozenCOGS, session } = params;

    for (const returnItem of returnDoc.items) {
      // Find frozen COGS for this item
      const frozenCOGSItem = frozenCOGS.items.find(
        item => item.productId.toString() === returnItem.product.toString()
      );

      if (!frozenCOGSItem) {
        throw new Error(`Frozen COGS not found for product ${returnItem.product}`);
      }

      // Get inventory
      const inventory = await Inventory.findOne({ product: returnItem.product }).session(session);
      if (!inventory) {
        throw new Error(`Inventory record not found for product ${returnItem.product}`);
      }

      // Restock using frozen COGS
      const movement = {
        type: 'return',
        quantity: returnItem.quantity,
        reason: 'Sales Return',
        reference: returnDoc.returnNumber,
        referenceId: returnDoc._id,
        referenceModel: 'Return',
        cost: frozenCOGSItem.unitCost, // Use frozen COGS
        performedBy: returnDoc.processedBy,
        date: new Date()
      };

      // Update inventory
      await Inventory.findOneAndUpdate(
        { product: returnItem.product },
        {
          $inc: { currentStock: returnItem.quantity },
          $push: { movements: movement },
          $set: { lastUpdated: new Date() }
        },
        { session, new: true }
      );

      // Update inventory cost (if using average costing)
      if (inventory.cost && inventory.cost.average) {
        const currentValue = inventory.currentStock * inventory.cost.average;
        const returnValue = returnItem.quantity * frozenCOGSItem.unitCost;
        const newStock = inventory.currentStock + returnItem.quantity;
        const newAverage = newStock > 0 ? (currentValue + returnValue) / newStock : frozenCOGSItem.unitCost;

        await Inventory.findOneAndUpdate(
          { product: returnItem.product },
          {
            $set: {
              'cost.average': newAverage,
              'cost.lastPurchase': frozenCOGSItem.unitCost
            }
          },
          { session }
        );
      }
    }
  }

  /**
   * Create accounting entries for return
   * @param {Object} params - Parameters
   */
  async createReturnAccountingEntries(params) {
    const {
      creditNote,
      returnAmounts,
      frozenCOGS,
      originalPeriod,
      returnPeriod,
      isAfterPeriodClose,
      user,
      session
    } = params;

    // Entry 1: Debit Sales Returns, Credit AR
    const salesReturnsAccountCode = await accountingService.getAccountCode('Sales Returns', 'revenue', 'sales_returns')
      .catch(() => 'SALES_RETURNS');
    const arAccountCode = await accountingService.getAccountCode('Accounts Receivable', 'asset', 'current_assets')
      .catch(() => 'AR');

    const salesReturnEntry = new Transaction({
      accountCode: salesReturnsAccountCode,
      debitAmount: returnAmounts.netRefundAmount,
      creditAmount: 0,
      description: `Sales Return - ${creditNote.transactionNumber}`,
      referenceType: 'sales_return',
      referenceId: creditNote._id,
      transactionDate: creditNote.transactionDate,
      status: 'posted',
      createdBy: user._id,
      originalPeriod: originalPeriod?._id,
      returnPeriod: returnPeriod?._id,
      isAfterPeriodClose: isAfterPeriodClose
    });
    await salesReturnEntry.save({ session });

    const arCreditEntry = new Transaction({
      accountCode: arAccountCode,
      debitAmount: 0,
      creditAmount: returnAmounts.netRefundAmount,
      description: `Credit Note - ${creditNote.transactionNumber}`,
      referenceType: 'sales_return',
      referenceId: creditNote._id,
      transactionDate: creditNote.transactionDate,
      status: 'posted',
      createdBy: user._id,
      originalPeriod: originalPeriod?._id,
      returnPeriod: returnPeriod?._id,
      isAfterPeriodClose: isAfterPeriodClose
    });
    await arCreditEntry.save({ session });

    // Entry 2: Debit Inventory, Credit COGS (reversal)
    const inventoryAccountCode = await accountingService.getAccountCode('Inventory', 'asset', 'inventory')
      .catch(() => 'INVENTORY');
    const cogsAccountCode = await accountingService.getAccountCode('Cost of Goods Sold', 'expense', 'cost_of_sales')
      .catch(() => 'COGS');

    const inventoryEntry = new Transaction({
      accountCode: inventoryAccountCode,
      debitAmount: returnAmounts.totalCOGS,
      creditAmount: 0,
      description: `Inventory Restock - ${creditNote.transactionNumber} (Frozen COGS)`,
      referenceType: 'sales_return',
      referenceId: creditNote._id,
      transactionDate: creditNote.transactionDate,
      status: 'posted',
      createdBy: user._id,
      originalPeriod: originalPeriod?._id,
      returnPeriod: returnPeriod?._id,
      isAfterPeriodClose: isAfterPeriodClose
    });
    await inventoryEntry.save({ session });

    const cogsCreditEntry = new Transaction({
      accountCode: cogsAccountCode,
      debitAmount: 0,
      creditAmount: returnAmounts.totalCOGS,
      description: `COGS Reversal - ${creditNote.transactionNumber} (Frozen COGS)`,
      referenceType: 'sales_return',
      referenceId: creditNote._id,
      transactionDate: creditNote.transactionDate,
      status: 'posted',
      createdBy: user._id,
      originalPeriod: originalPeriod?._id,
      returnPeriod: returnPeriod?._id,
      isAfterPeriodClose: isAfterPeriodClose
    });
    await cogsCreditEntry.save({ session });

    // Entry 3: Restocking Fee (if applicable)
    if (returnAmounts.totalRestockingFee > 0) {
      const otherIncomeAccountCode = await accountingService.getAccountCode('Other Income', 'revenue', 'other_revenue')
        .catch(() => 'OTHER_INCOME');

      const restockingFeeEntry = new Transaction({
        accountCode: otherIncomeAccountCode,
        debitAmount: 0,
        creditAmount: returnAmounts.totalRestockingFee,
        description: `Restocking Fee - ${creditNote.transactionNumber}`,
        referenceType: 'sales_return',
        referenceId: creditNote._id,
        transactionDate: creditNote.transactionDate,
        status: 'posted',
        createdBy: user._id
      });
      await restockingFeeEntry.save({ session });
    }

    // Store accounting entries in credit note
    creditNote.accountingEntries = [
      {
        accountCode: salesReturnsAccountCode,
        debitAmount: returnAmounts.netRefundAmount,
        creditAmount: 0,
        description: `Sales Return - ${creditNote.transactionNumber}`,
        transactionId: salesReturnEntry._id
      },
      {
        accountCode: arAccountCode,
        debitAmount: 0,
        creditAmount: returnAmounts.netRefundAmount,
        description: `Credit Note - ${creditNote.transactionNumber}`,
        transactionId: arCreditEntry._id
      },
      {
        accountCode: inventoryAccountCode,
        debitAmount: returnAmounts.totalCOGS,
        creditAmount: 0,
        description: `Inventory Restock - ${creditNote.transactionNumber}`,
        transactionId: inventoryEntry._id
      },
      {
        accountCode: cogsAccountCode,
        debitAmount: 0,
        creditAmount: returnAmounts.totalCOGS,
        description: `COGS Reversal - ${creditNote.transactionNumber}`,
        transactionId: cogsCreditEntry._id
      }
    ];

    await creditNote.save({ session });
  }

  /**
   * Update customer balance
   * @param {Object} params - Parameters
   */
  async updateCustomerBalance(params) {
    const { returnDoc, creditNote, returnAmounts, session } = params;

    const customer = await Customer.findById(returnDoc.customer).session(session);
    if (!customer) {
      throw new Error(`Customer ${returnDoc.customer} not found`);
    }

    // Calculate new balances
    const refundAmount = returnAmounts.netRefundAmount;
    const currentPendingBalance = customer.pendingBalance || 0;
    const currentAdvanceBalance = customer.advanceBalance || 0;

    // Reduce pending balance first
    const newPendingBalance = Math.max(0, currentPendingBalance - refundAmount);
    
    // If refund exceeds pending, add to advance balance
    const overRefund = Math.max(0, refundAmount - currentPendingBalance);
    const newAdvanceBalance = currentAdvanceBalance + overRefund;
    
    // Calculate new current balance
    const newCurrentBalance = newPendingBalance - newAdvanceBalance;

    // Update customer balance atomically
    const updatedCustomer = await Customer.findOneAndUpdate(
      { _id: returnDoc.customer, __v: customer.__v },
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
  }

  /**
   * Update original invoice
   * @param {Object} params - Parameters
   */
  async updateOriginalInvoice(params) {
    const { originalInvoice, returnDoc, returnAmounts, session } = params;

    // Mark invoice items as returned (if tracking needed)
    // Update invoice status if fully returned
    const remainingAmount = originalInvoice.remainingAmount || originalInvoice.netAmount;
    const newRemainingAmount = Math.max(0, remainingAmount - returnAmounts.netRefundAmount);

    if (newRemainingAmount === 0 && returnAmounts.netRefundAmount >= originalInvoice.netAmount) {
      originalInvoice.status = 'returned';
    }

    // Update paid amount if invoice was paid
    if (originalInvoice.paidAmount > 0) {
      originalInvoice.paidAmount = Math.max(0, originalInvoice.paidAmount - returnAmounts.netRefundAmount);
    }

    originalInvoice.remainingAmount = newRemainingAmount;
    await originalInvoice.save({ session });
  }

  /**
   * Get period for date
   * @param {Date} date - Date
   * @returns {Promise<AccountingPeriod>}
   */
  async getPeriodForDate(date) {
    return await AccountingPeriod.findOne({
      periodStart: { $lte: date },
      periodEnd: { $gte: date }
    });
  }
}

module.exports = new ReturnProcessingService();

