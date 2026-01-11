/**
 * Data Integrity Enforcement Service
 * 
 * NON-NEGOTIABLE PRODUCTION RULES:
 * 1. Inventory is single source of truth for stock
 * 2. No negative stock allowed (DB + service level)
 * 3. No direct product stock edits
 * 4. All stock updates must be atomic with rollback
 * 5. COGS frozen at sale time
 * 6. Double-entry accounting enforced everywhere
 * 7. Closed periods cannot be modified
 * 8. Customer/Supplier balances are ledger-driven only
 * 9. No manual balance edits
 * 10. Historical P&L/COGS/Balance Sheet never changes
 */

const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const Sales = require('../models/Sales');
const AccountingPeriod = require('../models/AccountingPeriod');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');

class DataIntegrityEnforcementService {
  /**
   * Validate inventory stock update - PREVENTS NEGATIVE STOCK
   * @param {String} productId - Product ID
   * @param {Number} quantityChange - Quantity change (negative for decrease)
   * @param {Object} options - Options
   * @returns {Promise<Object>} Validation result
   */
  async validateStockUpdate(productId, quantityChange, options = {}) {
    const { allowNegative = false, movementType = 'out' } = options;

    // Get current inventory (source of truth)
    const inventory = await Inventory.findOne({ product: productId });
    
    if (!inventory) {
      throw new Error(`Inventory record not found for product ${productId}. Inventory is the single source of truth.`);
    }

    // Calculate new stock
    const newStock = inventory.currentStock + quantityChange;
    const availableStock = inventory.currentStock - inventory.reservedStock;

    // HARD RULE: No negative stock unless explicitly allowed (e.g., adjustments)
    if (!allowNegative && newStock < 0) {
      throw new Error(
        `NEGATIVE_STOCK_PREVENTED: Cannot reduce stock below zero. ` +
        `Current: ${inventory.currentStock}, Reserved: ${inventory.reservedStock}, ` +
        `Available: ${availableStock}, Requested: ${Math.abs(quantityChange)}`
      );
    }

    // For out movements, check available stock
    if (movementType === 'out' && availableStock < Math.abs(quantityChange)) {
      throw new Error(
        `INSUFFICIENT_STOCK: Available stock (${availableStock}) is less than requested (${Math.abs(quantityChange)})`
      );
    }

    return {
      valid: true,
      currentStock: inventory.currentStock,
      reservedStock: inventory.reservedStock,
      availableStock: availableStock,
      newStock: newStock
    };
  }

  /**
   * Block direct product stock edits
   * @param {String} productId - Product ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Validation result
   */
  async validateProductStockEdit(productId, updateData) {
    // Check if trying to directly edit inventory.currentStock
    if (updateData['inventory.currentStock'] !== undefined || 
        updateData.inventory?.currentStock !== undefined) {
      throw new Error(
        'DIRECT_STOCK_EDIT_BLOCKED: Cannot directly edit product.inventory.currentStock. ' +
        'Use Inventory model as single source of truth. ' +
        'Stock must be updated via inventoryService.updateStock() which creates stock movements.'
      );
    }

    return { valid: true };
  }

  /**
   * Validate accounting period is not closed/locked
   * @param {Date} transactionDate - Transaction date
   * @param {String} operation - Operation type
   * @returns {Promise<Object>} Validation result
   */
  async validatePeriodNotLocked(transactionDate, operation = 'create') {
    const period = await AccountingPeriod.findOne({
      periodStart: { $lte: transactionDate },
      periodEnd: { $gte: transactionDate },
      status: { $in: ['closed', 'locked'] }
    });

    if (period) {
      throw new Error(
        `PERIOD_LOCKED: Cannot ${operation} transaction in ${period.status} period. ` +
        `Period: ${period.periodName} (${period.periodStart.toISOString()} to ${period.periodEnd.toISOString()}). ` +
        `Status: ${period.status}. ` +
        `Transaction date: ${transactionDate.toISOString()}`
      );
    }

    return { valid: true };
  }

  /**
   * Validate double-entry accounting
   * @param {Array} entries - Journal entries
   * @returns {Promise<Object>} Validation result
   */
  async validateDoubleEntry(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error('DOUBLE_ENTRY_REQUIRED: At least one journal entry is required');
    }

    let totalDebits = 0;
    let totalCredits = 0;

    for (const entry of entries) {
      if (entry.debitAmount && entry.debitAmount > 0) {
        totalDebits += entry.debitAmount;
      }
      if (entry.creditAmount && entry.creditAmount > 0) {
        totalCredits += entry.creditAmount;
      }
    }

    // HARD RULE: Debits must equal Credits
    const difference = Math.abs(totalDebits - totalCredits);
    if (difference > 0.01) { // Allow small rounding differences
      throw new Error(
        `DOUBLE_ENTRY_VIOLATION: Debits (${totalDebits}) must equal Credits (${totalCredits}). ` +
        `Difference: ${difference}`
      );
    }

    return {
      valid: true,
      totalDebits,
      totalCredits,
      balanced: true
    };
  }

  /**
   * Block manual customer balance edits
   * @param {String} customerId - Customer ID
   * @param {Object} balanceData - Balance data
   * @returns {Promise<Object>} Validation result
   */
  async validateCustomerBalanceEdit(customerId, balanceData) {
    // Check if trying to manually edit balance fields
    const balanceFields = ['pendingBalance', 'advanceBalance', 'currentBalance'];
    const hasBalanceFields = balanceFields.some(field => balanceData[field] !== undefined);

    if (hasBalanceFields) {
      throw new Error(
        'MANUAL_BALANCE_EDIT_BLOCKED: Cannot manually edit customer balances. ' +
        'Balances are ledger-driven only and must be updated via CustomerTransaction records. ' +
        'Use customerTransactionService.createTransaction() to update balances.'
      );
    }

    return { valid: true };
  }

  /**
   * Block manual supplier balance edits
   * @param {String} supplierId - Supplier ID
   * @param {Object} balanceData - Balance data
   * @returns {Promise<Object>} Validation result
   */
  async validateSupplierBalanceEdit(supplierId, balanceData) {
    const balanceFields = ['pendingBalance', 'advanceBalance', 'currentBalance'];
    const hasBalanceFields = balanceFields.some(field => balanceData[field] !== undefined);

    if (hasBalanceFields) {
      throw new Error(
        'MANUAL_BALANCE_EDIT_BLOCKED: Cannot manually edit supplier balances. ' +
        'Balances are ledger-driven only and must be updated via SupplierTransaction records.'
      );
    }

    return { valid: true };
  }

  /**
   * Freeze COGS at sale time
   * @param {String} salesOrderId - Sales order ID
   * @param {Array} items - Order items
   * @returns {Promise<Object>} Frozen COGS data
   */
  async freezeCOGSAtSaleTime(salesOrderId, items) {
    const frozenCOGS = [];

    for (const item of items) {
      // Get product cost at sale time
      const product = await Product.findById(item.product);
      if (!product) {
        throw new Error(`Product ${item.product} not found`);
      }

      // Get inventory cost at sale time
      const inventory = await Inventory.findOne({ product: item.product });
      const costAtSaleTime = inventory?.cost?.average || product.pricing.cost || 0;

      frozenCOGS.push({
        productId: item.product,
        productName: product.name,
        quantity: item.quantity,
        unitCost: costAtSaleTime,
        totalCost: costAtSaleTime * item.quantity,
        frozenAt: new Date(),
        salesOrderId: salesOrderId
      });
    }

    return {
      frozen: true,
      items: frozenCOGS,
      totalCOGS: frozenCOGS.reduce((sum, item) => sum + item.totalCost, 0)
    };
  }

  /**
   * Validate sales order cannot be edited after completion
   * @param {String} salesOrderId - Sales order ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Validation result
   */
  async validateSalesOrderEdit(salesOrderId, updateData) {
    const order = await Sales.findById(salesOrderId);
    if (!order) {
      throw new Error('Sales order not found');
    }

    // HARD RULE: Cannot edit completed orders
    if (order.status === 'completed') {
      throw new Error(
        `SALES_ORDER_LOCKED: Cannot edit completed sales order ${order.orderNumber}. ` +
        `Status: ${order.status}. ` +
        `Completed orders are immutable to preserve historical financial data.`
      );
    }

    // Block editing items or pricing after confirmation
    if (order.status === 'confirmed' || order.status === 'processing') {
      const blockedFields = ['items', 'pricing', 'customer'];
      const hasBlockedFields = blockedFields.some(field => updateData[field] !== undefined);

      if (hasBlockedFields) {
        throw new Error(
          `SALES_ORDER_PARTIALLY_LOCKED: Cannot edit items, pricing, or customer after order is ${order.status}. ` +
          `Order: ${order.orderNumber}`
        );
      }
    }

    return { valid: true };
  }

  /**
   * Validate balance sheet equation: Assets = Liabilities + Equity
   * @param {Object} balanceSheet - Balance sheet data
   * @returns {Promise<Object>} Validation result
   */
  async validateBalanceSheetEquation(balanceSheet) {
    const totalAssets = balanceSheet.assets?.totalAssets || 0;
    const totalLiabilities = balanceSheet.liabilities?.totalLiabilities || 0;
    const totalEquity = balanceSheet.equity?.totalEquity || 0;

    const leftSide = totalAssets;
    const rightSide = totalLiabilities + totalEquity;
    const difference = Math.abs(leftSide - rightSide);

    // HARD RULE: Assets must equal Liabilities + Equity
    if (difference > 0.01) { // Allow small rounding differences
      throw new Error(
        `BALANCE_SHEET_IMBALANCE: Assets (${totalAssets}) must equal Liabilities (${totalLiabilities}) + Equity (${totalEquity}). ` +
        `Difference: ${difference}`
      );
    }

    return {
      valid: true,
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: true
    };
  }

  /**
   * Prevent historical P&L recalculation
   * @param {String} statementId - P&L statement ID
   * @param {Date} periodStart - Period start date
   * @param {Date} periodEnd - Period end date
   * @returns {Promise<Object>} Validation result
   */
  async validatePLRecalculation(statementId, periodStart, periodEnd) {
    // Check if period is closed
    const period = await AccountingPeriod.findOne({
      periodStart: { $lte: periodEnd },
      periodEnd: { $gte: periodStart },
      status: { $in: ['closed', 'locked'] }
    });

    if (period) {
      throw new Error(
        `HISTORICAL_PL_LOCKED: Cannot recalculate P&L for closed/locked period. ` +
        `Period: ${period.periodName} (${period.status}). ` +
        `Historical financial statements are immutable to preserve audit trail.`
      );
    }

    return { valid: true };
  }

  /**
   * Validate credit limit at transaction level
   * @param {String} customerId - Customer ID
   * @param {Number} transactionAmount - Transaction amount
   * @returns {Promise<Object>} Validation result
   */
  async validateCreditLimit(customerId, transactionAmount) {
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Skip credit check for cash payments
    if (customer.paymentTerms === 'cash') {
      return { valid: true, creditCheckSkipped: true };
    }

    const currentBalance = customer.currentBalance || 0;
    const creditLimit = customer.creditLimit || 0;
    const newBalance = currentBalance + transactionAmount;

    if (newBalance > creditLimit) {
      throw new Error(
        `CREDIT_LIMIT_EXCEEDED: Transaction would exceed credit limit. ` +
        `Current Balance: ${currentBalance}, Credit Limit: ${creditLimit}, ` +
        `Transaction Amount: ${transactionAmount}, New Balance: ${newBalance}`
      );
    }

    return {
      valid: true,
      currentBalance,
      creditLimit,
      newBalance,
      availableCredit: creditLimit - newBalance
    };
  }

  /**
   * Define authoritative balance sources
   * @param {String} entityType - 'customer' or 'supplier'
   * @param {String} entityId - Entity ID
   * @returns {Promise<Object>} Authoritative source
   */
  async getAuthoritativeBalanceSource(entityType, entityId) {
    // RULE: Ledger (Transaction sub-ledger) > Summary fields
    const TransactionModel = entityType === 'customer' 
      ? require('../models/CustomerTransaction')
      : require('../models/SupplierTransaction');

    const transactions = await TransactionModel.find({
      [entityType === 'customer' ? 'customerId' : 'supplierId']: entityId,
      status: { $ne: 'cancelled' }
    });

    // Calculate from transactions (authoritative source)
    let calculatedPending = 0;
    let calculatedAdvance = 0;

    for (const txn of transactions) {
      if (txn.transactionType === 'invoice' || txn.transactionType === 'debit_note') {
        calculatedPending += txn.netAmount || 0;
      } else if (txn.transactionType === 'payment' || txn.transactionType === 'credit_note') {
        calculatedPending -= txn.netAmount || 0;
        if (calculatedPending < 0) {
          calculatedAdvance += Math.abs(calculatedPending);
          calculatedPending = 0;
        }
      }
    }

    return {
      source: 'ledger',
      calculated: {
        pendingBalance: calculatedPending,
        advanceBalance: calculatedAdvance,
        currentBalance: calculatedPending - calculatedAdvance
      },
      transactionCount: transactions.length
    };
  }

  /**
   * Validate overpayment and advance handling
   * @param {String} customerId - Customer ID
   * @param {Number} paymentAmount - Payment amount
   * @param {Number} pendingBalance - Current pending balance
   * @returns {Promise<Object>} Payment application result
   */
  async validateOverpaymentHandling(customerId, paymentAmount, pendingBalance) {
    if (paymentAmount > pendingBalance) {
      const overpayment = paymentAmount - pendingBalance;
      return {
        valid: true,
        hasOverpayment: true,
        overpaymentAmount: overpayment,
        appliedToPending: pendingBalance,
        goesToAdvance: overpayment,
        handling: 'Overpayment automatically goes to advanceBalance (credit/advance)'
      };
    }

    return {
      valid: true,
      hasOverpayment: false,
      appliedToPending: paymentAmount
    };
  }
}

module.exports = new DataIntegrityEnforcementService();

