const BaseRepository = require('./BaseRepository');
const Customer = require('../models/Customer');

class CustomerRepository extends BaseRepository {
  constructor() {
    super(Customer);
  }

  /**
   * Find customer by email
   * @param {string} email - Customer email
   * @param {object} options - Query options (can include tenantId)
   * @param {string} tenantId - Tenant ID to scope the search (optional but recommended)
   * @returns {Promise<Customer|null>}
   */
  async findByEmail(email, options = {}, tenantId = null) {
    if (!email) return null;
    const query = { email: email.toLowerCase().trim() };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    return await this.findOne(query, options);
  }

  /**
   * Find customer by phone
   * @param {string} phone - Customer phone
   * @param {object} options - Query options (can include tenantId)
   * @param {string} tenantId - Tenant ID to scope the search (optional but recommended)
   * @returns {Promise<Customer|null>}
   */
  async findByPhone(phone, options = {}, tenantId = null) {
    if (!phone) return null;
    const query = { phone: phone.trim() };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    return await this.findOne(query, options);
  }

  /**
   * Find customer by business name
   * @param {string} businessName - Business name
   * @param {object} options - Query options (can include tenantId)
   * @param {string} tenantId - Tenant ID to scope the search (optional but recommended)
   * @returns {Promise<Customer|null>}
   */
  async findByBusinessName(businessName, options = {}, tenantId = null) {
    if (!businessName) return null;
    const query = { businessName: { $regex: `^${businessName}$`, $options: 'i' } };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    return await this.findOne(query, options);
  }

  /**
   * Find customers with advanced filtering and pagination
   * @param {object} filter - Filter query
   * @param {object} options - Pagination and sorting options
   * @returns {Promise<{customers: Array, total: number, pagination: object}>}
   */
  async findWithPagination(filter = {}, options = {}) {
    const {
      page = 1,
      limit = 20,
      sort = { createdAt: -1 },
      populate,
      select,
      getAll = false
    } = options;

    const skip = getAll ? 0 : (page - 1) * limit;
    const finalLimit = getAll ? 999999 : limit;

    const [customers, total] = await Promise.all([
      this.findAll(filter, { skip, limit: finalLimit, sort, populate, select }),
      this.count(filter)
    ]);

    return {
      customers,
      total,
      pagination: getAll ? {
        current: 1,
        pages: 1,
        total,
        hasNext: false,
        hasPrev: false
      } : {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  }

  /**
   * Search customers by multiple fields
   * @param {string} searchTerm - Search term
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async search(searchTerm, options = {}) {
    const filter = {
      $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { businessName: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } }
      ]
    };
    return await this.findAll(filter, options);
  }

  /**
   * Find customers by business type
   * @param {string} businessType - Business type
   * @param {object} options - Query options
   * @param {string} tenantId - Tenant ID to scope the search (optional but recommended)
   * @returns {Promise<Array>}
   */
  async findByBusinessType(businessType, options = {}, tenantId = null) {
    const filter = { businessType };
    if (tenantId) {
      filter.tenantId = tenantId;
    }
    return await this.findAll(filter, options);
  }

  /**
   * Find customers by status
   * @param {string} status - Customer status
   * @param {object} options - Query options
   * @param {string} tenantId - Tenant ID to scope the search (optional but recommended)
   * @returns {Promise<Array>}
   */
  async findByStatus(status, options = {}, tenantId = null) {
    const filter = { status };
    if (tenantId) {
      filter.tenantId = tenantId;
    }
    return await this.findAll(filter, options);
  }

  /**
   * Find customers by tier
   * @param {string} tier - Customer tier
   * @param {object} options - Query options
   * @param {string} tenantId - Tenant ID to scope the search (optional but recommended)
   * @returns {Promise<Array>}
   */
  async findByTier(tier, options = {}, tenantId = null) {
    const filter = { customerTier: tier };
    if (tenantId) {
      filter.tenantId = tenantId;
    }
    return await this.findAll(filter, options);
  }

  /**
   * Find customers by IDs
   * @param {Array} customerIds - Array of customer IDs
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async findByIds(customerIds, options = {}) {
    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return [];
    }
    return await this.findAll({ _id: { $in: customerIds } }, options);
  }

  /**
   * Update customer balance
   * @param {string} id - Customer ID
   * @param {object} balanceData - Balance data
   * @returns {Promise<Customer>}
   */
  async updateBalance(id, balanceData) {
    const customer = await this.findById(id);
    if (!customer) {
      throw new Error('Customer not found');
    }

    if (balanceData.openingBalance !== undefined) {
      customer.openingBalance = balanceData.openingBalance;
    }
    if (balanceData.pendingBalance !== undefined) {
      customer.pendingBalance = balanceData.pendingBalance;
    }
    if (balanceData.advanceBalance !== undefined) {
      customer.advanceBalance = balanceData.advanceBalance;
    }
    if (balanceData.currentBalance !== undefined) {
      customer.currentBalance = balanceData.currentBalance;
    }

    return await customer.save();
  }

  /**
   * Check if email exists
   * @param {string} email - Email to check
   * @param {string} excludeId - Customer ID to exclude from check
   * @param {string} tenantId - Tenant ID to scope the check
   * @returns {Promise<boolean>}
   */
  async emailExists(email, excludeId = null, tenantId = null) {
    if (!email) return false;
    const query = { email: email.toLowerCase().trim() };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    return await this.exists(query);
  }

  /**
   * Check if phone exists
   * @param {string} phone - Phone to check
   * @param {string} excludeId - Customer ID to exclude from check
   * @param {string} tenantId - Tenant ID to scope the check
   * @returns {Promise<boolean>}
   */
  async phoneExists(phone, excludeId = null, tenantId = null) {
    if (!phone) return false;
    const query = { phone: phone.trim() };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    return await this.exists(query);
  }

  /**
   * Check if business name exists
   * @param {string} businessName - Business name to check
   * @param {string} excludeId - Customer ID to exclude from check
   * @param {string} tenantId - Tenant ID to scope the check
   * @returns {Promise<boolean>}
   */
  async businessNameExists(businessName, excludeId = null, tenantId = null) {
    if (!businessName) return false;
    const query = { businessName: { $regex: `^${businessName}$`, $options: 'i' } };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    return await this.exists(query);
  }

  /**
   * Check if name exists
   * @param {string} name - Name to check
   * @param {string} excludeId - Customer ID to exclude from check
   * @param {string} tenantId - Tenant ID to scope the check
   * @returns {Promise<boolean>}
   */
  async nameExists(name, excludeId = null, tenantId = null) {
    if (!name) return false;
    const query = { name: { $regex: `^${name}$`, $options: 'i' } };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    return await this.exists(query);
  }
}

module.exports = new CustomerRepository();

