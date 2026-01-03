const salesRepository = require('../repositories/SalesRepository');
const productRepository = require('../repositories/ProductRepository');
const customerRepository = require('../repositories/CustomerRepository');

class SalesService {
  /**
   * Transform customer names to uppercase
   * @param {object} customer - Customer to transform
   * @returns {object} - Transformed customer
   */
  transformCustomerToUppercase(customer) {
    if (!customer) return customer;
    if (customer.toObject) customer = customer.toObject();
    if (customer.name) customer.name = customer.name.toUpperCase();
    if (customer.businessName) customer.businessName = customer.businessName.toUpperCase();
    if (customer.firstName) customer.firstName = customer.firstName.toUpperCase();
    if (customer.lastName) customer.lastName = customer.lastName.toUpperCase();
    return customer;
  }

  /**
   * Transform product names to uppercase
   * @param {object} product - Product to transform
   * @returns {object} - Transformed product
   */
  transformProductToUppercase(product) {
    if (!product) return product;
    if (product.toObject) product = product.toObject();
    if (product.name) product.name = product.name.toUpperCase();
    if (product.description) product.description = product.description.toUpperCase();
    return product;
  }

  /**
   * Build filter query from request parameters
   * @param {object} queryParams - Request query parameters
   * @returns {Promise<object>} - MongoDB filter object
   */
  async buildFilter(queryParams) {
    const filter = {};

    // Product search - find orders containing products with matching names
    if (queryParams.productSearch) {
      const productSearchTerm = queryParams.productSearch.trim();
      const matchingProducts = await productRepository.search(productSearchTerm, 1000);
      
      if (matchingProducts.length > 0) {
        const productIds = matchingProducts.map(p => p._id);
        filter['items.product'] = { $in: productIds };
      } else {
        // If no products match, return empty result
        filter._id = { $in: [] };
      }
    }

    // General search - search in order number, customer info, and notes
    if (queryParams.search) {
      const searchTerm = queryParams.search.trim();
      const searchConditions = [
        { orderNumber: { $regex: searchTerm, $options: 'i' } },
        { 'customerInfo.businessName': { $regex: searchTerm, $options: 'i' } },
        { 'customerInfo.name': { $regex: searchTerm, $options: 'i' } },
        { 'customerInfo.email': { $regex: searchTerm, $options: 'i' } },
        { notes: { $regex: searchTerm, $options: 'i' } }
      ];

      // Search in Customer collection and match by customer ID
      const customerMatches = await customerRepository.search(searchTerm, { limit: 1000 });
      
      if (customerMatches.length > 0) {
        const customerIds = customerMatches.map(c => c._id);
        searchConditions.push({ customer: { $in: customerIds } });
      }

      // Combine with existing filter if productSearch was used
      if (filter['items.product'] || filter._id) {
        filter.$and = [
          filter['items.product'] ? { 'items.product': filter['items.product'] } : filter._id,
          { $or: searchConditions }
        ];
        delete filter['items.product'];
        delete filter._id;
      } else {
        filter.$or = searchConditions;
      }
    }

    // Status filter
    if (queryParams.status) {
      filter.status = queryParams.status;
    }

    // Payment status filter
    if (queryParams.paymentStatus) {
      filter['payment.status'] = queryParams.paymentStatus;
    }

    // Order type filter
    if (queryParams.orderType) {
      filter.orderType = queryParams.orderType;
    }

    // Date range filter
    if (queryParams.dateFrom || queryParams.dateTo) {
      filter.createdAt = {};
      if (queryParams.dateFrom) {
        const dateFrom = new Date(queryParams.dateFrom);
        dateFrom.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = dateFrom;
      }
      if (queryParams.dateTo) {
        const dateTo = new Date(queryParams.dateTo);
        dateTo.setDate(dateTo.getDate() + 1);
        dateTo.setHours(0, 0, 0, 0);
        filter.createdAt.$lt = dateTo;
      }
    }

    return filter;
  }

  /**
   * Get sales orders with filtering and pagination
   * @param {object} queryParams - Query parameters
   * @returns {Promise<object>}
   */
  async getSalesOrders(queryParams) {
    const getAllOrders = queryParams.all === 'true' || queryParams.all === true ||
                        (queryParams.limit && parseInt(queryParams.limit) >= 999999);

    const page = getAllOrders ? 1 : (parseInt(queryParams.page) || 1);
    const limit = getAllOrders ? 999999 : (parseInt(queryParams.limit) || 20);

    const filter = await this.buildFilter(queryParams);

    const result = await salesRepository.findWithPagination(filter, {
      page,
      limit,
      getAll: getAllOrders,
      sort: { createdAt: -1 },
      populate: [
        { path: 'customer', select: 'firstName lastName businessName email phone address pendingBalance' },
        { path: 'items.product', select: 'name description pricing' },
        { path: 'createdBy', select: 'firstName lastName' }
      ]
    });

    // Transform names to uppercase
    result.orders.forEach(order => {
      if (order.customer) {
        order.customer = this.transformCustomerToUppercase(order.customer);
      }
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          if (item.product) {
            item.product = this.transformProductToUppercase(item.product);
          }
        });
      }
    });

    return result;
  }

  /**
   * Get single sales order by ID
   * @param {string} id - Order ID
   * @returns {Promise<object>}
   */
  async getSalesOrderById(id) {
    const order = await salesRepository.findById(id);
    
    if (!order) {
      throw new Error('Order not found');
    }

    // Populate related fields
    await order.populate([
      { path: 'customer', select: 'firstName lastName businessName email phone address pendingBalance' },
      { path: 'items.product', select: 'name description pricing' },
      { path: 'createdBy', select: 'firstName lastName' }
    ]);

    // Transform names to uppercase
    if (order.customer) {
      order.customer = this.transformCustomerToUppercase(order.customer);
    }
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach(item => {
        if (item.product) {
          item.product = this.transformProductToUppercase(item.product);
        }
      });
    }

    return order;
  }

  /**
   * Get period summary
   * @param {Date} dateFrom - Start date
   * @param {Date} dateTo - End date
   * @returns {Promise<object>}
   */
  async getPeriodSummary(dateFrom, dateTo) {
    const orders = await salesRepository.findByDateRange(dateFrom, dateTo, {
      lean: true
    });

    const totalRevenue = orders.reduce((sum, order) => sum + (order.pricing?.total || 0), 0);
    const totalOrders = orders.length;
    const totalItems = orders.reduce((sum, order) =>
      sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Calculate discounts
    const totalDiscounts = orders.reduce((sum, order) =>
      sum + (order.pricing?.discountAmount || 0), 0);

    // Calculate by order type
    const revenueByType = {
      retail: orders.filter(o => o.orderType === 'retail')
        .reduce((sum, order) => sum + (order.pricing?.total || 0), 0),
      wholesale: orders.filter(o => o.orderType === 'wholesale')
        .reduce((sum, order) => sum + (order.pricing?.total || 0), 0)
    };

    const ordersByType = {
      retail: orders.filter(o => o.orderType === 'retail').length,
      wholesale: orders.filter(o => o.orderType === 'wholesale').length
    };

    // Calculate by payment status
    const revenueByPaymentStatus = {
      paid: orders.filter(o => o.payment?.status === 'paid')
        .reduce((sum, order) => sum + (order.pricing?.total || 0), 0),
      pending: orders.filter(o => o.payment?.status === 'pending')
        .reduce((sum, order) => sum + (order.pricing?.total || 0), 0),
      partial: orders.filter(o => o.payment?.status === 'partial')
        .reduce((sum, order) => sum + (order.pricing?.total || 0), 0)
    };

    return {
      totalRevenue,
      totalOrders,
      totalItems,
      averageOrderValue,
      totalDiscounts,
      revenueByType,
      ordersByType,
      revenueByPaymentStatus
    };
  }

  /**
   * Get single sales order by ID
   * @param {string} id - Sales order ID
   * @returns {Promise<Sales>}
   */
  async getSalesOrderById(id) {
    const order = await salesRepository.findById(id, {
      populate: [
        { path: 'customer' },
        { path: 'items.product', select: 'name description pricing' },
        { path: 'createdBy', select: 'firstName lastName' },
        { path: 'processedBy', select: 'firstName lastName' }
      ]
    });

    if (!order) {
      throw new Error('Order not found');
    }

    return order;
  }
}

module.exports = new SalesService();

