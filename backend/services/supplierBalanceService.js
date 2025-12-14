const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');

class SupplierBalanceService {
  /**
   * Update supplier balance when payment is made
   * @param {String} supplierId - Supplier ID
   * @param {Number} paymentAmount - Amount paid
   * @param {String} purchaseOrderId - Purchase Order ID (optional)
   * @returns {Promise<Object>}
   */
  static async recordPayment(supplierId, paymentAmount, purchaseOrderId = null) {
    try {
      const supplier = await Supplier.findById(supplierId);
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // Update supplier balances
      const updates = {};
      
      if (paymentAmount > 0) {
        // Reduce outstanding balance first (money we owe)
        if (supplier.pendingBalance > 0) {
          const pendingReduction = Math.min(paymentAmount, supplier.pendingBalance);
          updates.pendingBalance = supplier.pendingBalance - pendingReduction;
          paymentAmount -= pendingReduction;
        }
        
        // If there's still payment left, add to advance balance (credit we have with supplier)
        if (paymentAmount > 0) {
          updates.advanceBalance = (supplier.advanceBalance || 0) + paymentAmount;
        }
      }

      const updatedSupplier = await Supplier.findByIdAndUpdate(
        supplierId,
        { $set: updates },
        { new: true }
      );

      console.log(`Supplier ${supplierId} balance updated:`, {
        pendingBalance: updatedSupplier.pendingBalance,
        advanceBalance: updatedSupplier.advanceBalance,
        paymentAmount
      });

      return updatedSupplier;
    } catch (error) {
      console.error('Error recording supplier payment:', error);
      throw error;
    }
  }

  /**
   * Update supplier balance when purchase order is created
   * @param {String} supplierId - Supplier ID
   * @param {Number} purchaseAmount - Purchase amount
   * @param {String} purchaseOrderId - Purchase Order ID
   * @returns {Promise<Object>}
   */
  static async recordPurchase(supplierId, purchaseAmount, purchaseOrderId = null) {
    try {
      const supplier = await Supplier.findById(supplierId);
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // Add to pending balance (money we owe to supplier)
      const updatedSupplier = await Supplier.findByIdAndUpdate(
        supplierId,
        { $inc: { pendingBalance: purchaseAmount } },
        { new: true }
      );

      console.log(`Supplier ${supplierId} purchase recorded:`, {
        purchaseAmount,
        newPendingBalance: updatedSupplier.pendingBalance,
        purchaseOrderId
      });

      return updatedSupplier;
    } catch (error) {
      console.error('Error recording supplier purchase:', error);
      throw error;
    }
  }

  /**
   * Update supplier balance when refund is received
   * @param {String} supplierId - Supplier ID
   * @param {Number} refundAmount - Refund amount
   * @param {String} purchaseOrderId - Purchase Order ID (optional)
   * @returns {Promise<Object>}
   */
  static async recordRefund(supplierId, refundAmount, purchaseOrderId = null) {
    try {
      const supplier = await Supplier.findById(supplierId);
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // Update supplier balances
      const updates = {};
      
      if (refundAmount > 0) {
        // Reduce advance balance first (money we've overpaid)
        if (supplier.advanceBalance > 0) {
          const advanceReduction = Math.min(refundAmount, supplier.advanceBalance);
          updates.advanceBalance = supplier.advanceBalance - advanceReduction;
          refundAmount -= advanceReduction;
        }
        
        // If there's still refund left, reduce pending balance (credit)
        if (refundAmount > 0) {
          updates.pendingBalance = Math.max(0, (supplier.pendingBalance || 0) - refundAmount);
        }
      }

      const updatedSupplier = await Supplier.findByIdAndUpdate(
        supplierId,
        { $set: updates },
        { new: true }
      );

      console.log(`Supplier ${supplierId} refund recorded:`, {
        refundAmount,
        newPendingBalance: updatedSupplier.pendingBalance,
        newAdvanceBalance: updatedSupplier.advanceBalance,
        purchaseOrderId
      });

      return updatedSupplier;
    } catch (error) {
      console.error('Error recording supplier refund:', error);
      throw error;
    }
  }

  /**
   * Get supplier balance summary
   * @param {String} supplierId - Supplier ID
   * @returns {Promise<Object>}
   */
  static async getBalanceSummary(supplierId) {
    try {
      const supplier = await Supplier.findById(supplierId);
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // Get recent purchase orders for this supplier
      const recentPurchaseOrders = await PurchaseOrder.find({ supplier: supplierId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('poNumber pricing.total status createdAt');

      return {
        supplier: {
          _id: supplier._id,
          companyName: supplier.companyName,
          contactPerson: supplier.contactPerson,
          email: supplier.email,
          phone: supplier.phone
        },
        balances: {
          pendingBalance: supplier.pendingBalance || 0,
          advanceBalance: supplier.advanceBalance || 0,
          currentBalance: supplier.currentBalance || 0,
          creditLimit: supplier.creditLimit || 0
        },
        recentPurchaseOrders: recentPurchaseOrders.map(po => ({
          poNumber: po.poNumber,
          total: po.pricing.total,
          status: po.status,
          createdAt: po.createdAt
        }))
      };
    } catch (error) {
      console.error('Error getting supplier balance summary:', error);
      throw error;
    }
  }

  /**
   * Recalculate supplier balance from all purchase orders
   * @param {String} supplierId - Supplier ID
   * @returns {Promise<Object>}
   */
  static async recalculateBalance(supplierId) {
    try {
      const supplier = await Supplier.findById(supplierId);
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // Get all purchase orders for this supplier
      const purchaseOrders = await PurchaseOrder.find({ supplier: supplierId });

      let totalPurchased = 0;
      let totalPaid = 0;

      purchaseOrders.forEach(po => {
        totalPurchased += po.pricing.total;
        totalPaid += po.payment?.amountPaid || 0;
      });

      const calculatedPendingBalance = Math.max(0, totalPurchased - totalPaid);
      const calculatedAdvanceBalance = Math.max(0, totalPaid - totalPurchased);

      // Update supplier balances
      const updatedSupplier = await Supplier.findByIdAndUpdate(
        supplierId,
        {
          $set: {
            pendingBalance: calculatedPendingBalance,
            advanceBalance: calculatedAdvanceBalance,
            currentBalance: calculatedPendingBalance
          }
        },
        { new: true }
      );

      console.log(`Supplier ${supplierId} balance recalculated:`, {
        totalPurchased,
        totalPaid,
        calculatedPendingBalance,
        calculatedAdvanceBalance
      });

      return updatedSupplier;
    } catch (error) {
      console.error('Error recalculating supplier balance:', error);
      throw error;
    }
  }

  /**
   * Check if supplier can accept purchase order
   * @param {String} supplierId - Supplier ID
   * @param {Number} amount - Purchase amount
   * @returns {Promise<Object>}
   */
  static async canAcceptPurchase(supplierId, amount) {
    try {
      const supplier = await Supplier.findById(supplierId);
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      const canAccept = supplier.status === 'active';
      const availableCredit = supplier.creditLimit - supplier.currentBalance;

      return {
        canAccept,
        availableCredit,
        currentBalance: supplier.currentBalance,
        creditLimit: supplier.creditLimit,
        pendingBalance: supplier.pendingBalance,
        advanceBalance: supplier.advanceBalance
      };
    } catch (error) {
      console.error('Error checking purchase eligibility:', error);
      throw error;
    }
  }
}

module.exports = SupplierBalanceService;
