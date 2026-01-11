const InvestorRepository = require('../repositories/InvestorRepository');
const ProductRepository = require('../repositories/ProductRepository');
const profitDistributionService = require('../services/profitDistributionService');

class InvestorService {
  /**
   * Get investors with filters
   * @param {object} queryParams - Query parameters
   * @param {string} tenantId - Tenant ID for multi-tenant isolation
   * @returns {Promise<Array>}
   */
  async getInvestors(queryParams, tenantId = null) {
    const filter = {};

    // Add tenant filter for multi-tenant isolation
    if (tenantId) {
      filter.tenantId = tenantId;
    }

    if (queryParams.status) {
      filter.status = queryParams.status;
    }

    if (queryParams.search) {
      filter.$or = [
        { name: { $regex: queryParams.search, $options: 'i' } },
        { email: { $regex: queryParams.search, $options: 'i' } },
        { phone: { $regex: queryParams.search, $options: 'i' } }
      ];
    }

    return await InvestorRepository.findWithFilters(filter, {
      sort: { createdAt: -1 }
    });
  }

  /**
   * Get single investor by ID
   * @param {string} id - Investor ID
   * @param {string} tenantId - Tenant ID for multi-tenant isolation
   * @returns {Promise<object>}
   */
  async getInvestorById(id, tenantId = null) {
    // Build query with tenant filter
    const query = { _id: id };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    
    const investor = await InvestorRepository.findOne(query);
    if (!investor) {
      throw new Error('Investor not found');
    }

    // Get profit shares for this investor
    const profitShares = await profitDistributionService.getProfitSharesForInvestor(id);

    return {
      investor,
      profitShares
    };
  }

  /**
   * Create investor
   * @param {object} investorData - Investor data
   * @param {string} userId - User ID
   * @param {object} options - Options including tenantId
   * @returns {Promise<object>}
   */
  async createInvestor(investorData, userId, options = {}) {
    const tenantId = options.tenantId || investorData.tenantId;
    if (!tenantId) {
      throw new Error('tenantId is required for investor creation');
    }

    // Check if email already exists (within tenant)
    const existingInvestor = await InvestorRepository.findByEmail(investorData.email, tenantId);
    if (existingInvestor) {
      throw new Error('Investor with this email already exists');
    }

    const newInvestor = await InvestorRepository.create({
      ...investorData,
      tenantId: tenantId,
      createdBy: userId
    });

    return newInvestor;
  }

  /**
   * Update investor
   * @param {string} id - Investor ID
   * @param {object} updateData - Update data
   * @param {string} userId - User ID
   * @param {object} options - Options including tenantId
   * @returns {Promise<object>}
   */
  async updateInvestor(id, updateData, userId, options = {}) {
    const investor = await InvestorRepository.findById(id);
    if (!investor) {
      throw new Error('Investor not found');
    }

    const tenantId = options.tenantId || investor.tenantId;

    // Check if email is being updated and if it already exists (within tenant)
    if (updateData.email && updateData.email !== investor.email && tenantId) {
      const emailExists = await InvestorRepository.emailExists(updateData.email, tenantId, id);
      if (emailExists) {
        throw new Error('Investor with this email already exists');
      }
    }

    const updatedInvestor = await InvestorRepository.update(id, {
      ...updateData,
      updatedBy: userId
    });

    return updatedInvestor;
  }

  /**
   * Delete investor
   * @param {string} id - Investor ID
   * @returns {Promise<object>}
   */
  async deleteInvestor(id) {
    const investor = await InvestorRepository.findById(id);
    if (!investor) {
      throw new Error('Investor not found');
    }

    // Check if investor is linked to any products
    const productsWithInvestor = await ProductRepository.findAll({
      'investors.investor': id
    });

    if (productsWithInvestor.length > 0) {
      throw new Error(`Cannot delete investor. They are linked to ${productsWithInvestor.length} product(s).`);
    }

    await InvestorRepository.softDelete(id);
    return { message: 'Investor deleted successfully' };
  }

  /**
   * Get products linked to investor
   * @param {string} investorId - Investor ID
   * @param {string} tenantId - Tenant ID for multi-tenant isolation
   * @returns {Promise<Array>}
   */
  async getProductsForInvestor(investorId, tenantId = null) {
    const productQuery = {
      'investors.investor': investorId
    };
    
    // Add tenant filter for multi-tenant isolation
    if (tenantId) {
      productQuery.tenantId = tenantId;
    }
    
    const products = await ProductRepository.findAll(productQuery, {
      populate: [
        { path: 'category', select: 'name' }
      ]
    });

    return products;
  }
}

module.exports = new InvestorService();

