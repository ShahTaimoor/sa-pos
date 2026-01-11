const BaseRepository = require('./BaseRepository');
const Bank = require('../models/Bank');

class BankRepository extends BaseRepository {
  constructor() {
    super(Bank);
  }

  /**
   * Find banks with filtering
   * @param {object} filter - Filter query
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async findWithFilters(filter = {}, options = {}) {
    const { sort = { bankName: 1, accountNumber: 1 }, populate = [] } = options;

    let queryBuilder = this.Model.find(filter);
    
    if (populate && populate.length > 0) {
      populate.forEach(pop => queryBuilder = queryBuilder.populate(pop));
    }
    
    if (sort) {
      queryBuilder = queryBuilder.sort(sort);
    }

    return queryBuilder;
  }

  /**
   * Find bank by account number
   * @param {string} accountNumber - Account number
   * @param {object} options - Query options
   * @param {string} tenantId - Tenant ID to scope the search (optional but recommended)
   * @returns {Promise<Bank|null>}
   */
  async findByAccountNumber(accountNumber, options = {}, tenantId = null) {
    const query = { accountNumber };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    return await this.findOne(query, options);
  }

  /**
   * Find active banks
   * @param {object} options - Query options
   * @param {string} tenantId - Tenant ID to scope the search (optional but recommended)
   * @returns {Promise<Array>}
   */
  async findActive(options = {}, tenantId = null) {
    const filter = { isActive: true };
    if (tenantId) {
      filter.tenantId = tenantId;
    }
    return await this.findWithFilters(filter, options);
  }
}

module.exports = new BankRepository();

