const BankReceiptRepository = require('../repositories/BankReceiptRepository');
const CustomerRepository = require('../repositories/CustomerRepository');
const SupplierRepository = require('../repositories/SupplierRepository');

class BankReceiptService {
  /**
   * Get bank receipts with filters and pagination
   * @param {object} queryParams - Query parameters
   * @param {string} tenantId - Tenant ID for multi-tenant isolation
   * @returns {Promise<object>}
   */
  async getBankReceipts(queryParams, tenantId = null) {
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 50;

    const fromDate = queryParams.fromDate || queryParams.dateFrom;
    const toDate = queryParams.toDate || queryParams.dateTo;

    const filter = {};
    
    // Add tenant filter for multi-tenant isolation
    if (tenantId) {
      filter.tenantId = tenantId;
    }

    // Date range filter
    if (fromDate || toDate) {
      filter.date = {};
      if (fromDate) {
        const startOfDay = new Date(fromDate);
        startOfDay.setHours(0, 0, 0, 0);
        filter.date.$gte = startOfDay;
      }
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setDate(endOfDay.getDate() + 1);
        endOfDay.setHours(0, 0, 0, 0);
        filter.date.$lt = endOfDay;
      }
    }

    // Voucher code filter
    if (queryParams.voucherCode) {
      filter.voucherCode = { $regex: queryParams.voucherCode, $options: 'i' };
    }

    // Amount filter
    if (queryParams.amount) {
      filter.amount = parseFloat(queryParams.amount);
    }

    // Particular filter
    if (queryParams.particular) {
      filter.particular = { $regex: queryParams.particular, $options: 'i' };
    }

    const result = await BankReceiptRepository.findWithPagination(filter, {
      page,
      limit,
      sort: { date: -1, createdAt: -1 }
    });

    return {
      bankReceipts: result.bankReceipts,
      pagination: result.pagination
    };
  }

  /**
   * Get single bank receipt by ID
   * @param {string} id - Bank receipt ID
   * @returns {Promise<object>}
   */
  async getBankReceiptById(id) {
    const bankReceipt = await BankReceiptRepository.findById(id, [
      { path: 'bank', select: 'accountName accountNumber bankName' },
      { path: 'order', model: 'Sales', select: 'orderNumber' },
      { path: 'customer', select: 'name businessName' },
      { path: 'supplier', select: 'name businessName' },
      { path: 'createdBy', select: 'firstName lastName' }
    ]);

    if (!bankReceipt) {
      throw new Error('Bank receipt not found');
    }

    return bankReceipt;
  }

  /**
   * Get bank receipt summary
   * @param {Date} fromDate - Start date
   * @param {Date} toDate - End date
   * @param {string} tenantId - Tenant ID for multi-tenant isolation
   * @returns {Promise<object>}
   */
  async getSummary(fromDate, toDate, tenantId = null) {
    const startOfDay = new Date(fromDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(toDate);
    endOfDay.setDate(endOfDay.getDate() + 1);
    endOfDay.setHours(0, 0, 0, 0);

    return await BankReceiptRepository.getSummary(startOfDay, endOfDay, tenantId);
  }

  /**
   * Check if customer exists
   * @param {string} customerId - Customer ID
   * @param {string} tenantId - Tenant ID for multi-tenant isolation
   * @returns {Promise<boolean>}
   */
  async customerExists(customerId, tenantId = null) {
    // Build query with tenant filter
    const query = { _id: customerId };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    
    const customer = await CustomerRepository.findOne(query);
    return !!customer;
  }

  /**
   * Check if supplier exists
   * @param {string} supplierId - Supplier ID
   * @param {string} tenantId - Tenant ID for multi-tenant isolation
   * @returns {Promise<boolean>}
   */
  async supplierExists(supplierId, tenantId = null) {
    // Build query with tenant filter
    const query = { _id: supplierId };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    
    const supplier = await SupplierRepository.findOne(query);
    return !!supplier;
  }
}

module.exports = new BankReceiptService();

