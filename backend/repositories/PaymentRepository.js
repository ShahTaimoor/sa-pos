const BaseRepository = require('./BaseRepository');
const Payment = require('../models/Payment');

class PaymentRepository extends BaseRepository {
  constructor() {
    super(Payment);
  }

  /**
   * Find payments with advanced filtering and pagination
   * @param {object} filter - Filter query
   * @param {object} options - Pagination and sorting options
   * @returns {Promise<{payments: Array, total: number, pagination: object}>}
   */
  async findWithPagination(filter = {}, options = {}) {
    const {
      page = 1,
      limit = 20,
      sort = { createdAt: -1 },
      populate = [
        { path: 'orderId', select: 'orderNumber total customer' },
        { path: 'processing.processedBy', select: 'firstName lastName email' }
      ],
      getAll = false
    } = options;

    const query = this.hasSoftDelete ? { ...filter, isDeleted: false } : filter;

    const skip = getAll ? 0 : (page - 1) * limit;
    const finalLimit = getAll ? 0 : limit;

    const [payments, total] = await Promise.all([
      this.model.find(query)
        .populate(populate)
        .sort(sort)
        .skip(skip)
        .limit(finalLimit),
      this.model.countDocuments(query)
    ]);

    return {
      payments,
      total,
      pagination: {
        page,
        limit,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Find payments by order ID
   * @param {string} orderId - Order ID
   * @param {object} options - Query options including tenantId
   * @returns {Promise<Array>}
   */
  async findByOrderId(orderId, options = {}) {
    const { tenantId } = options;
    const query = this.hasSoftDelete ? { orderId, isDeleted: false } : { orderId };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    return this.model.find(query, null, options);
  }

  /**
   * Find payment by payment ID (string)
   * @param {string} paymentId - Payment ID string
   * @param {object} options - Query options including tenantId
   * @returns {Promise<Payment|null>}
   */
  async findByPaymentId(paymentId, options = {}) {
    const { tenantId } = options;
    const query = this.hasSoftDelete ? { paymentId, isDeleted: false } : { paymentId };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    return this.model.findOne(query, null, options);
  }

  /**
   * Find payments by status
   * @param {string} status - Payment status
   * @param {object} options - Query options including tenantId
   * @returns {Promise<Array>}
   */
  async findByStatus(status, options = {}) {
    const { tenantId } = options;
    const query = this.hasSoftDelete ? { status, isDeleted: false } : { status };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    return this.model.find(query, null, options);
  }

  /**
   * Calculate total paid amount for an order
   * @param {string} orderId - Order ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<number>}
   */
  async calculateTotalPaid(orderId, tenantId) {
    const payments = await this.findByOrderId(orderId, { tenantId });
    return payments.reduce((sum, payment) => {
      return sum + (payment.status === 'completed' ? payment.amount : 0);
    }, 0);
  }
}

module.exports = new PaymentRepository();

