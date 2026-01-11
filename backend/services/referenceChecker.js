/**
 * Reference Checker Service
 * 
 * Checks if a document has active references before deletion
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Import models
const Sales = require('../models/Sales');
const PurchaseOrder = require('../models/PurchaseOrder');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const CustomerTransaction = require('../models/CustomerTransaction');
const PaymentApplication = require('../models/PaymentApplication');
const Return = require('../models/Return');
const Inventory = require('../models/Inventory');
const Transaction = require('../models/Transaction');

class ReferenceChecker {
  /**
   * Check references for a document
   * @param {String} modelName - Model name
   * @param {String} id - Document ID
   * @returns {Promise<Object>} Reference check result
   */
  async checkReferences(modelName, id) {
    switch (modelName) {
      case 'Product':
        return await this.checkProductReferences(id);
      case 'Customer':
        return await this.checkCustomerReferences(id);
      case 'Supplier':
        return await this.checkSupplierReferences(id);
      default:
        return {
          hasActiveReferences: false,
          references: {}
        };
    }
  }

  /**
   * Check Product references
   * @param {String} productId - Product ID
   * @returns {Promise<Object>} Reference check result
   */
  async checkProductReferences(productId) {
    try {
      const [
        salesOrders,
        purchaseOrders,
        inventoryRecords,
        returns,
        transactions
      ] = await Promise.all([
        // Active sales orders
        Sales.countDocuments({
          'items.product': productId,
          isDeleted: false,
          status: { $nin: ['cancelled', 'completed'] }
        }),
        
        // Active purchase orders
        PurchaseOrder.countDocuments({
          'items.product': productId,
          isDeleted: false,
          status: { $nin: ['cancelled', 'completed'] }
        }),
        
        // Active inventory records
        Inventory.countDocuments({
          product: productId,
          isDeleted: false,
          currentStock: { $gt: 0 }
        }),
        
        // Active returns
        Return.countDocuments({
          'items.product': productId,
          isDeleted: false,
          status: { $nin: ['cancelled', 'completed'] }
        }),
        
        // Any transactions (historical)
        Transaction.countDocuments({
          'items.product': productId,
          isDeleted: false
        })
      ]);
      
      const hasActiveReferences = 
        salesOrders > 0 ||
        purchaseOrders > 0 ||
        inventoryRecords > 0 ||
        returns > 0;
      
      const hasHistoricalReferences = transactions > 0;
      
      return {
        hasActiveReferences,
        hasHistoricalReferences,
        references: {
          salesOrders,
          purchaseOrders,
          inventoryRecords,
          returns,
          transactions
        }
      };
    } catch (error) {
      logger.error('Error checking product references:', error);
      throw error;
    }
  }

  /**
   * Check Customer references
   * @param {String} customerId - Customer ID
   * @returns {Promise<Object>} Reference check result
   */
  async checkCustomerReferences(customerId) {
    try {
      const [
        salesOrders,
        customerTransactions,
        paymentApplications,
        returns
      ] = await Promise.all([
        // Any sales orders (preserve history)
        Sales.countDocuments({
          customer: customerId,
          isDeleted: false
        }),
        
        // Customer transactions
        CustomerTransaction.countDocuments({
          customer: customerId,
          isDeleted: false
        }),
        
        // Payment applications
        PaymentApplication.countDocuments({
          customer: customerId,
          isDeleted: false
        }),
        
        // Returns
        Return.countDocuments({
          customer: customerId,
          isDeleted: false
        })
      ]);
      
      const hasActiveReferences = 
        salesOrders > 0 ||
        customerTransactions > 0 ||
        paymentApplications > 0 ||
        returns > 0;
      
      return {
        hasActiveReferences,
        hasHistoricalReferences: hasActiveReferences, // All are historical
        references: {
          salesOrders,
          customerTransactions,
          paymentApplications,
          returns
        }
      };
    } catch (error) {
      logger.error('Error checking customer references:', error);
      throw error;
    }
  }

  /**
   * Check Supplier references
   * @param {String} supplierId - Supplier ID
   * @returns {Promise<Object>} Reference check result
   */
  async checkSupplierReferences(supplierId) {
    try {
      const [
        purchaseOrders,
        purchaseInvoices,
        payments
      ] = await Promise.all([
        // Any purchase orders (preserve history)
        PurchaseOrder.countDocuments({
          supplier: supplierId,
          isDeleted: false
        }),
        
        // Purchase invoices
        PurchaseInvoice.countDocuments({
          supplier: supplierId,
          isDeleted: false
        }),
        
        // Payments
        Transaction.countDocuments({
          supplier: supplierId,
          isDeleted: false,
          type: 'payment'
        })
      ]);
      
      const hasActiveReferences = 
        purchaseOrders > 0 ||
        purchaseInvoices > 0 ||
        payments > 0;
      
      return {
        hasActiveReferences,
        hasHistoricalReferences: hasActiveReferences, // All are historical
        references: {
          purchaseOrders,
          purchaseInvoices,
          payments
        }
      };
    } catch (error) {
      logger.error('Error checking supplier references:', error);
      throw error;
    }
  }

  /**
   * Get detailed reference information
   * @param {String} modelName - Model name
   * @param {String} id - Document ID
   * @returns {Promise<Object>} Detailed references
   */
  async getDetailedReferences(modelName, id) {
    const check = await this.checkReferences(modelName, id);
    
    if (!check.hasActiveReferences) {
      return check;
    }
    
    // Get sample references for each type
    const details = { ...check, details: {} };
    
    if (modelName === 'Product') {
      if (check.references.salesOrders > 0) {
        details.details.salesOrders = await Sales.find({
          'items.product': id,
          isDeleted: false
        })
          .select('orderNumber status createdAt')
          .limit(5)
          .lean();
      }
      
      if (check.references.purchaseOrders > 0) {
        details.details.purchaseOrders = await PurchaseOrder.find({
          'items.product': id,
          isDeleted: false
        })
          .select('orderNumber status createdAt')
          .limit(5)
          .lean();
      }
    }
    
    return details;
  }
}

module.exports = new ReferenceChecker();

