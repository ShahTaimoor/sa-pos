const CashReceiptRepository = require('../repositories/CashReceiptRepository');
const CustomerRepository = require('../repositories/CustomerRepository');

class CashReceiptService {
  /**
   * Get cash receipts with filters and pagination
   * @param {object} queryParams - Query parameters
   * @param {string} tenantId - Tenant ID for multi-tenant isolation
   * @returns {Promise<object>}
   */
  async getCashReceipts(queryParams, tenantId = null) {
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

    const result = await CashReceiptRepository.findWithPagination(filter, {
      page,
      limit,
      sort: { date: -1, createdAt: -1 }
    });

    return {
      cashReceipts: result.cashReceipts,
      pagination: result.pagination
    };
  }

  /**
   * Get single cash receipt by ID
   * @param {string} id - Cash receipt ID
   * @param {string} tenantId - Tenant ID for multi-tenant isolation
   * @returns {Promise<object>}
   */
  async getCashReceiptById(id, tenantId = null) {
    // Build query with tenant filter
    const query = { _id: id };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    
    const cashReceipt = await CashReceiptRepository.findOne(query, [
      { path: 'order', model: 'Sales', select: 'orderNumber' },
      { path: 'customer', select: 'name businessName' },
      { path: 'supplier', select: 'name businessName' },
      { path: 'createdBy', select: 'firstName lastName' }
    ]);

    if (!cashReceipt) {
      throw new Error('Cash receipt not found');
    }

    return cashReceipt;
  }

  /**
   * Get cash receipt summary
   * @param {Date} fromDate - Start date
   * @param {Date} toDate - End date
   * @returns {Promise<object>}
   */
  async getSummary(fromDate, toDate) {
    const startOfDay = new Date(fromDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(toDate);
    endOfDay.setDate(endOfDay.getDate() + 1);
    endOfDay.setHours(0, 0, 0, 0);

    return await CashReceiptRepository.getSummary(startOfDay, endOfDay);
  }

  /**
   * Get customers by IDs
   * @param {Array<string>} customerIds - Customer IDs
   * @param {string} tenantId - Tenant ID for multi-tenant isolation
   * @returns {Promise<Array>}
   */
  async getCustomersByIds(customerIds, tenantId = null) {
    // Build filter with tenant
    const filter = { _id: { $in: customerIds } };
    if (tenantId) {
      filter.tenantId = tenantId;
    }
    
    return await CustomerRepository.findAll(filter, { 
      select: 'name businessName',
      lean: true 
    });
  }
}

module.exports = new CashReceiptService();

