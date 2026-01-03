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
   * @returns {Promise<Bank|null>}
   */
  async findByAccountNumber(accountNumber, options = {}) {
    return await this.findOne({ accountNumber }, options);
  }

  /**
   * Find active banks
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async findActive(options = {}) {
    return await this.findWithFilters({ isActive: true }, options);
  }
}

module.exports = new BankRepository();

