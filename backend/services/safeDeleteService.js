const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const Sales = require('../models/Sales');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const logger = require('../utils/logger');

/**
 * Safe Delete Service
 * 
 * Provides safe deletion patterns for customers and suppliers:
 * - Checks for existing transactions before deletion
 * - Uses soft delete (inactivate) instead of hard delete
 * - Prevents deletion if there are active transactions
 */
class SafeDeleteService {
  /**
   * Safely inactivate a customer
   * Checks for existing sales/transactions before inactivation
   * 
   * @param {string} customerId - Customer ID
   * @param {string} tenantId - Tenant ID (required for security)
   * @param {object} user - User performing the action
   * @param {string} reason - Reason for inactivation
   * @returns {Promise<{success: boolean, message: string, customer: object}>}
   */
  async inactivateCustomer(customerId, tenantId, user, reason = '') {
    // Find customer with tenantId check
    const customer = await Customer.findOne({
      _id: customerId,
      tenantId: tenantId,
      isDeleted: false
    });

    if (!customer) {
      throw new Error('Customer not found or access denied');
    }

    // Check for existing sales
    const salesCount = await Sales.countDocuments({
      customer: customerId,
      tenantId: tenantId,
      status: { $in: ['pending', 'confirmed', 'completed'] }
    });

    if (salesCount > 0) {
      throw new Error(
        `Cannot inactivate customer. There are ${salesCount} active sales orders. ` +
        `Please complete or cancel all orders first.`
      );
    }

    // Check for outstanding balance
    if (customer.currentBalance !== 0 || customer.pendingBalance !== 0) {
      throw new Error(
        `Cannot inactivate customer with outstanding balance. ` +
        `Current balance: ${customer.currentBalance}, Pending: ${customer.pendingBalance}. ` +
        `Please settle all balances first.`
      );
    }

    // Inactivate customer (soft delete)
    customer.status = 'inactive';
    customer.lastModifiedBy = user._id || user;
    if (reason) {
      customer.notes = (customer.notes || '') + `\n[Inactivated: ${new Date().toISOString()}] ${reason}`;
    }

    await customer.save();

    // Inactivate associated ledger account if exists
    if (customer.ledgerAccount) {
      await ChartOfAccounts.updateOne(
        { _id: customer.ledgerAccount, tenantId: tenantId },
        { $set: { isActive: false } }
      );
    }

    logger.info('Customer inactivated', {
      customerId,
      tenantId,
      userId: user._id || user,
      reason
    });

    return {
      success: true,
      message: 'Customer inactivated successfully',
      customer: customer.toObject()
    };
  }

  /**
   * Safely delete a customer (hard delete)
   * Only allowed if no transactions exist
   * WARNING: This is permanent and should be used with extreme caution
   * 
   * @param {string} customerId - Customer ID
   * @param {string} tenantId - Tenant ID (required for security)
   * @param {object} user - User performing the action
   * @param {string} reason - Reason for deletion
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async deleteCustomer(customerId, tenantId, user, reason = '') {
    // Find customer with tenantId check
    const customer = await Customer.findOne({
      _id: customerId,
      tenantId: tenantId,
      isDeleted: false
    });

    if (!customer) {
      throw new Error('Customer not found or access denied');
    }

    // Check for ANY sales (even completed ones)
    const salesCount = await Sales.countDocuments({
      customer: customerId,
      tenantId: tenantId
    });

    if (salesCount > 0) {
      throw new Error(
        `Cannot delete customer. There are ${salesCount} sales records associated. ` +
        `Please use inactivate instead to preserve transaction history.`
      );
    }

    // Check for outstanding balance
    if (customer.currentBalance !== 0 || customer.pendingBalance !== 0) {
      throw new Error(
        `Cannot delete customer with outstanding balance. ` +
        `Please settle all balances first.`
      );
    }

    // Soft delete customer (preserve for audit trail)
    customer.isDeleted = true;
    customer.deletedAt = new Date();
    customer.deletedBy = user._id || user;
    customer.deletionReason = reason || 'Deleted by user';
    customer.status = 'inactive';

    await customer.save();

    logger.warn('Customer soft deleted', {
      customerId,
      tenantId,
      userId: user._id || user,
      reason
    });

    return {
      success: true,
      message: 'Customer deleted successfully (soft delete)'
    };
  }

  /**
   * Safely inactivate a supplier
   * Checks for existing purchase orders/invoices before inactivation
   * 
   * @param {string} supplierId - Supplier ID
   * @param {string} tenantId - Tenant ID (required for security)
   * @param {object} user - User performing the action
   * @param {string} reason - Reason for inactivation
   * @returns {Promise<{success: boolean, message: string, supplier: object}>}
   */
  async inactivateSupplier(supplierId, tenantId, user, reason = '') {
    // Find supplier with tenantId check
    const supplier = await Supplier.findOne({
      _id: supplierId,
      tenantId: tenantId,
      isDeleted: false
    });

    if (!supplier) {
      throw new Error('Supplier not found or access denied');
    }

    // Check for existing purchase invoices
    const purchaseInvoiceCount = await PurchaseInvoice.countDocuments({
      supplier: supplierId,
      tenantId: tenantId,
      status: { $in: ['pending', 'confirmed', 'received'] }
    });

    if (purchaseInvoiceCount > 0) {
      throw new Error(
        `Cannot inactivate supplier. There are ${purchaseInvoiceCount} active purchase invoices. ` +
        `Please complete or cancel all invoices first.`
      );
    }

    // Check for outstanding balance
    if (supplier.currentBalance !== 0 || supplier.pendingBalance !== 0) {
      throw new Error(
        `Cannot inactivate supplier with outstanding balance. ` +
        `Current balance: ${supplier.currentBalance}, Pending: ${supplier.pendingBalance}. ` +
        `Please settle all balances first.`
      );
    }

    // Inactivate supplier
    supplier.status = 'inactive';
    supplier.lastModifiedBy = user._id || user;
    if (reason) {
      supplier.notes = (supplier.notes || '') + `\n[Inactivated: ${new Date().toISOString()}] ${reason}`;
    }

    await supplier.save();

    // Inactivate associated ledger account if exists
    if (supplier.ledgerAccount) {
      await ChartOfAccounts.updateOne(
        { _id: supplier.ledgerAccount, tenantId: tenantId },
        { $set: { isActive: false } }
      );
    }

    logger.info('Supplier inactivated', {
      supplierId,
      tenantId,
      userId: user._id || user,
      reason
    });

    return {
      success: true,
      message: 'Supplier inactivated successfully',
      supplier: supplier.toObject()
    };
  }

  /**
   * Safely delete a supplier (hard delete)
   * Only allowed if no transactions exist
   * WARNING: This is permanent and should be used with extreme caution
   * 
   * @param {string} supplierId - Supplier ID
   * @param {string} tenantId - Tenant ID (required for security)
   * @param {object} user - User performing the action
   * @param {string} reason - Reason for deletion
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async deleteSupplier(supplierId, tenantId, user, reason = '') {
    // Find supplier with tenantId check
    const supplier = await Supplier.findOne({
      _id: supplierId,
      tenantId: tenantId,
      isDeleted: false
    });

    if (!supplier) {
      throw new Error('Supplier not found or access denied');
    }

    // Check for ANY purchase invoices (even completed ones)
    const purchaseInvoiceCount = await PurchaseInvoice.countDocuments({
      supplier: supplierId,
      tenantId: tenantId
    });

    if (purchaseInvoiceCount > 0) {
      throw new Error(
        `Cannot delete supplier. There are ${purchaseInvoiceCount} purchase invoices associated. ` +
        `Please use inactivate instead to preserve transaction history.`
      );
    }

    // Check for outstanding balance
    if (supplier.currentBalance !== 0 || supplier.pendingBalance !== 0) {
      throw new Error(
        `Cannot delete supplier with outstanding balance. ` +
        `Please settle all balances first.`
      );
    }

    // Soft delete supplier (preserve for audit trail)
    supplier.isDeleted = true;
    supplier.deletedAt = new Date();
    supplier.status = 'inactive';

    await supplier.save();

    logger.warn('Supplier soft deleted', {
      supplierId,
      tenantId,
      userId: user._id || user,
      reason
    });

    return {
      success: true,
      message: 'Supplier deleted successfully (soft delete)'
    };
  }

  /**
   * Reactivate a customer
   * @param {string} customerId - Customer ID
   * @param {string} tenantId - Tenant ID
   * @param {object} user - User performing the action
   * @returns {Promise<{success: boolean, message: string, customer: object}>}
   */
  async reactivateCustomer(customerId, tenantId, user) {
    const customer = await Customer.findOne({
      _id: customerId,
      tenantId: tenantId
    });

    if (!customer) {
      throw new Error('Customer not found or access denied');
    }

    customer.status = 'active';
    customer.lastModifiedBy = user._id || user;
    await customer.save();

    // Reactivate associated ledger account if exists
    if (customer.ledgerAccount) {
      await ChartOfAccounts.updateOne(
        { _id: customer.ledgerAccount, tenantId: tenantId },
        { $set: { isActive: true } }
      );
    }

    return {
      success: true,
      message: 'Customer reactivated successfully',
      customer: customer.toObject()
    };
  }

  /**
   * Reactivate a supplier
   * @param {string} supplierId - Supplier ID
   * @param {string} tenantId - Tenant ID
   * @param {object} user - User performing the action
   * @returns {Promise<{success: boolean, message: string, supplier: object}>}
   */
  async reactivateSupplier(supplierId, tenantId, user) {
    const supplier = await Supplier.findOne({
      _id: supplierId,
      tenantId: tenantId
    });

    if (!supplier) {
      throw new Error('Supplier not found or access denied');
    }

    supplier.status = 'active';
    supplier.lastModifiedBy = user._id || user;
    await supplier.save();

    // Reactivate associated ledger account if exists
    if (supplier.ledgerAccount) {
      await ChartOfAccounts.updateOne(
        { _id: supplier.ledgerAccount, tenantId: tenantId },
        { $set: { isActive: true } }
      );
    }

    return {
      success: true,
      message: 'Supplier reactivated successfully',
      supplier: supplier.toObject()
    };
  }
}

module.exports = new SafeDeleteService();
