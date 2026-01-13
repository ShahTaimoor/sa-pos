const BaseRepository = require('./BaseRepository');
const FinancialStatement = require('../models/FinancialStatement');

class FinancialStatementRepository extends BaseRepository {
  constructor() {
    super(FinancialStatement);
  }

  /**
   * Find financial statement by statement ID
   * @param {string} statementId - Statement ID
   * @param {object} options - Query options
   * @returns {Promise<FinancialStatement|null>}
   */
  async findByStatementId(statementId, options = {}) {
    return await this.findOne({ statementId }, options);
  }

  /**
   * Find financial statements by type
   * @param {string} type - Statement type
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async findByType(type, options = {}) {
    return await this.findAll({ type }, options);
  }

  /**
   * Find financial statements by period
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async findByPeriod(startDate, endDate, options = {}) {
    const filter = {
      'period.startDate': startDate,
      'period.endDate': endDate
    };
    return await this.findAll(filter, options);
  }

  /**
   * Find financial statements with pagination
   * @param {object} filter - Filter query
   * @param {object} options - Pagination and sorting options
   * @returns {Promise<{statements: Array, total: number, pagination: object}>}
   */
  async findWithPagination(filter = {}, options = {}) {
    const {
      page = 1,
      limit = 10,
      sort = { 'period.startDate': -1 },
      populate = [],
      getAll = false
    } = options;

    const skip = getAll ? 0 : (page - 1) * limit;
    const finalLimit = getAll ? 999999 : limit;

    let queryBuilder = this.Model.find(filter);
    
    if (populate && populate.length > 0) {
      populate.forEach(pop => queryBuilder = queryBuilder.populate(pop));
    }
    
    if (sort) {
      queryBuilder = queryBuilder.sort(sort);
    }
    
    if (skip !== undefined) {
      queryBuilder = queryBuilder.skip(skip);
    }
    
    if (finalLimit > 0) {
      queryBuilder = queryBuilder.limit(finalLimit);
    }

    const [statements, total] = await Promise.all([
      queryBuilder,
      this.Model.countDocuments(filter)
    ]);

    return {
      statements,
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
   * Check if statement exists for period
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {string} type - Statement type
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<FinancialStatement|null>}
   */
  async findExistingStatement(startDate, endDate, type = 'profit_loss', tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to find existing statement');
    }
    
    // Use date range query to handle timezone/normalization differences
    const startOfDay = new Date(startDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfStartDay = new Date(startDate);
    endOfStartDay.setHours(23, 59, 59, 999);
    
    const startOfEndDay = new Date(endDate);
    startOfEndDay.setHours(0, 0, 0, 0);
    const endOfEndDay = new Date(endDate);
    endOfEndDay.setHours(23, 59, 59, 999);
    
    return await this.findOne({
      tenantId: tenantId,
      type,
      'period.startDate': { $gte: startOfDay, $lte: endOfStartDay },
      'period.endDate': { $gte: startOfEndDay, $lte: endOfEndDay }
    });
  }

  /**
   * Get latest statement by type and period type
   * @param {string} type - Statement type
   * @param {string} periodType - Period type
   * @param {string} tenantId - Tenant ID (required for tenant isolation)
   * @returns {Promise<FinancialStatement|null>}
   */
  async getLatestStatement(type, periodType, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get latest statement');
    }
    return await this.Model.getLatestStatement(type, periodType, tenantId);
  }

  /**
   * Get statement comparison
   * @param {string} statementId - Statement ID
   * @param {string} type - Comparison type
   * @param {string} tenantId - Tenant ID (required for tenant isolation)
   * @returns {Promise<object>}
   */
  async getStatementComparison(statementId, type, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get statement comparison');
    }
    return await this.Model.getStatementComparison(statementId, type, tenantId);
  }
}

module.exports = new FinancialStatementRepository();

