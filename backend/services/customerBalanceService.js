const Customer = require('../models/Customer');
const Sales = require('../models/Sales');

class CustomerBalanceService {
  /**
   * Update customer balance when payment is received
   * @param {String} customerId - Customer ID
   * @param {Number} paymentAmount - Amount paid
   * @param {String} orderId - Order ID (optional)
   * @returns {Promise<Object>}
   */
  static async recordPayment(customerId, paymentAmount, orderId = null) {
    try {
      const customer = await Customer.findById(customerId);
      if (!customer) {
        throw new Error('Customer not found');
      }

      // Update customer balances
      const updates = {};
      
      if (paymentAmount > 0) {
        // Reduce pending balance first
        if (customer.pendingBalance > 0) {
          const pendingReduction = Math.min(paymentAmount, customer.pendingBalance);
          updates.pendingBalance = customer.pendingBalance - pendingReduction;
          paymentAmount -= pendingReduction;
        }
        
        // If there's still payment left, add to advance balance
        if (paymentAmount > 0) {
          updates.advanceBalance = (customer.advanceBalance || 0) + paymentAmount;
        }
      }

      const updatedCustomer = await Customer.findByIdAndUpdate(
        customerId,
        { $set: updates },
        { new: true }
      );

      console.log(`Customer ${customerId} balance updated:`, {
        pendingBalance: updatedCustomer.pendingBalance,
        advanceBalance: updatedCustomer.advanceBalance,
        paymentAmount
      });

      return updatedCustomer;
    } catch (error) {
      console.error('Error recording payment:', error);
      throw error;
    }
  }

  /**
   * Update customer balance when invoice is created
   * @param {String} customerId - Customer ID
   * @param {Number} invoiceAmount - Invoice amount
   * @param {String} orderId - Order ID
   * @returns {Promise<Object>}
   */
  static async recordInvoice(customerId, invoiceAmount, orderId = null) {
    try {
      const customer = await Customer.findById(customerId);
      if (!customer) {
        throw new Error('Customer not found');
      }

      // Add to pending balance
      const updatedCustomer = await Customer.findByIdAndUpdate(
        customerId,
        { $inc: { pendingBalance: invoiceAmount } },
        { new: true }
      );

      console.log(`Customer ${customerId} invoice recorded:`, {
        invoiceAmount,
        newPendingBalance: updatedCustomer.pendingBalance,
        orderId
      });

      return updatedCustomer;
    } catch (error) {
      console.error('Error recording invoice:', error);
      throw error;
    }
  }

  /**
   * Update customer balance when refund is issued
   * @param {String} customerId - Customer ID
   * @param {Number} refundAmount - Refund amount
   * @param {String} orderId - Order ID (optional)
   * @returns {Promise<Object>}
   */
  static async recordRefund(customerId, refundAmount, orderId = null) {
    try {
      const customer = await Customer.findById(customerId);
      if (!customer) {
        throw new Error('Customer not found');
      }

      // Update customer balances
      const updates = {};
      
      if (refundAmount > 0) {
        // Reduce advance balance first
        if (customer.advanceBalance > 0) {
          const advanceReduction = Math.min(refundAmount, customer.advanceBalance);
          updates.advanceBalance = customer.advanceBalance - advanceReduction;
          refundAmount -= advanceReduction;
        }
        
        // If there's still refund left, it means we're refunding more than advance balance
        // This creates a new advance (we now owe them more)
        if (refundAmount > 0) {
          updates.advanceBalance = (updates.advanceBalance || customer.advanceBalance || 0) + refundAmount;
        }
      }

      const updatedCustomer = await Customer.findByIdAndUpdate(
        customerId,
        { $set: updates },
        { new: true }
      );

      console.log(`Customer ${customerId} refund recorded:`, {
        refundAmount,
        newPendingBalance: updatedCustomer.pendingBalance,
        newAdvanceBalance: updatedCustomer.advanceBalance,
        orderId
      });

      return updatedCustomer;
    } catch (error) {
      console.error('Error recording refund:', error);
      throw error;
    }
  }

  /**
   * Get customer balance summary
   * @param {String} customerId - Customer ID
   * @returns {Promise<Object>}
   */
  static async getBalanceSummary(customerId) {
    try {
      const customer = await Customer.findById(customerId);
      if (!customer) {
        throw new Error('Customer not found');
      }

      // Get recent orders for this customer
      const recentOrders = await Sales.find({ customer: customerId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('orderNumber pricing.total payment.status createdAt');

      return {
        customer: {
          _id: customer._id,
          name: customer.name,
          businessName: customer.businessName,
          email: customer.email,
          phone: customer.phone
        },
        balances: {
          pendingBalance: customer.pendingBalance || 0,
          advanceBalance: customer.advanceBalance || 0,
          currentBalance: customer.currentBalance || 0,
          creditLimit: customer.creditLimit || 0
        },
        recentOrders: recentOrders.map(order => ({
          orderNumber: order.orderNumber,
          total: order.pricing.total,
          status: order.payment.status,
          createdAt: order.createdAt
        }))
      };
    } catch (error) {
      console.error('Error getting balance summary:', error);
      throw error;
    }
  }

  /**
   * Recalculate customer balance from all orders
   * @param {String} customerId - Customer ID
   * @returns {Promise<Object>}
   */
  static async recalculateBalance(customerId) {
    try {
      const customer = await Customer.findById(customerId);
      if (!customer) {
        throw new Error('Customer not found');
      }

      // Get all orders for this customer
      const orders = await Sales.find({ customer: customerId });

      let totalInvoiced = 0;
      let totalPaid = 0;

      orders.forEach(order => {
        totalInvoiced += order.pricing.total;
        totalPaid += order.payment.amountPaid || 0;
      });

      const calculatedPendingBalance = Math.max(0, totalInvoiced - totalPaid);
      const calculatedAdvanceBalance = Math.max(0, totalPaid - totalInvoiced);

      // Update customer balances
      const updatedCustomer = await Customer.findByIdAndUpdate(
        customerId,
        {
          $set: {
            pendingBalance: calculatedPendingBalance,
            advanceBalance: calculatedAdvanceBalance,
            currentBalance: calculatedPendingBalance
          }
        },
        { new: true }
      );

      console.log(`Customer ${customerId} balance recalculated:`, {
        totalInvoiced,
        totalPaid,
        calculatedPendingBalance,
        calculatedAdvanceBalance
      });

      return updatedCustomer;
    } catch (error) {
      console.error('Error recalculating balance:', error);
      throw error;
    }
  }

  /**
   * Check if customer can make purchase
   * @param {String} customerId - Customer ID
   * @param {Number} amount - Purchase amount
   * @returns {Promise<Object>}
   */
  static async canMakePurchase(customerId, amount) {
    try {
      const customer = await Customer.findById(customerId);
      if (!customer) {
        throw new Error('Customer not found');
      }

      const canPurchase = customer.canMakePurchase(amount);
      const availableCredit = customer.creditLimit - customer.currentBalance;

      return {
        canPurchase,
        availableCredit,
        currentBalance: customer.currentBalance,
        creditLimit: customer.creditLimit,
        pendingBalance: customer.pendingBalance,
        advanceBalance: customer.advanceBalance
      };
    } catch (error) {
      console.error('Error checking purchase eligibility:', error);
      throw error;
    }
  }
}

module.exports = CustomerBalanceService;
