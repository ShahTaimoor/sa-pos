const financialStatementRepository = require('../repositories/FinancialStatementRepository');
const plCalculationService = require('../services/plCalculationService');

class PLStatementService {
  /**
   * Check if statement exists for period
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<object|null>}
   */
  async findExistingStatement(startDate, endDate, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to find existing statement');
    }
    return await financialStatementRepository.findExistingStatement(startDate, endDate, 'profit_loss', tenantId);
  }

  /**
   * Generate P&L statement
   * @param {object} period - Period object
   * @param {object} options - Generation options
   * @returns {Promise<object>}
   */
  async generateStatement(period, options) {
    return await plCalculationService.generatePLStatement(period, options);
  }

  /**
   * Get P&L statements with filters and pagination
   * @param {object} queryParams - Query parameters
   * @returns {Promise<object>}
   */
  async getStatements(queryParams) {
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 10;
    const tenantId = queryParams.tenantId;

    if (!tenantId) {
      throw new Error('tenantId is required to get statements');
    }

    const filter = { type: 'profit_loss', tenantId: tenantId };

    if (queryParams.startDate || queryParams.endDate) {
      filter['period.startDate'] = {};
      if (queryParams.startDate) filter['period.startDate'].$gte = queryParams.startDate;
      if (queryParams.endDate) filter['period.startDate'].$lte = queryParams.endDate;
    }

    if (queryParams.periodType) filter['period.type'] = queryParams.periodType;
    if (queryParams.status) filter.status = queryParams.status;

    const result = await financialStatementRepository.findWithPagination(filter, {
      page,
      limit,
      sort: { 'period.startDate': -1 },
      populate: [
        { path: 'generatedBy', select: 'firstName lastName email' },
        { path: 'approvedBy', select: 'firstName lastName email' }
      ],
      select: 'statementId period revenue.totalRevenue grossProfit operatingIncome netIncome status createdAt approvedAt'
    });

    return {
      statements: result.statements,
      pagination: result.pagination
    };
  }

  /**
   * Get single P&L statement by ID
   * @param {string} statementId - Statement ID
   * @param {string} tenantId - Tenant ID (required for tenant isolation)
   * @returns {Promise<object>}
   */
  async getStatementById(statementId, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get statement');
    }
    
    const statement = await financialStatementRepository.findById(statementId, {
      populate: [
        { path: 'generatedBy', select: 'firstName lastName email' },
        { path: 'approvedBy', select: 'firstName lastName email' }
      ],
      tenantId
    });

    if (!statement) {
      throw new Error('P&L statement not found');
    }

    return statement;
  }

  /**
   * Update P&L statement
   * @param {string} statementId - Statement ID
   * @param {object} updates - Update data
   * @param {string} tenantId - Tenant ID (required for tenant isolation)
   * @returns {Promise<object>}
   */
  async updateStatement(statementId, updates, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to update statement');
    }
    
    const statement = await financialStatementRepository.findById(statementId, { tenantId });
    if (!statement) {
      throw new Error('P&L statement not found');
    }

    // Apply allowed updates only
    const updateData = {};
    if (updates.company) {
      updateData.company = {
        ...statement.company,
        ...updates.company
      };
    }

    if (updates.metadata) {
      updateData.metadata = {
        ...statement.metadata,
        ...updates.metadata
      };
    }

    if (Array.isArray(updates.notes)) {
      updateData.notes = updates.notes;
    }

    // Support optional title/description via metadata
    if (typeof updates.title === 'string') {
      updateData.metadata = updateData.metadata || statement.metadata || {};
      updateData.metadata.title = updates.title;
    }
    if (typeof updates.description === 'string') {
      updateData.metadata = updateData.metadata || statement.metadata || {};
      updateData.metadata.description = updates.description;
    }

    const updatedStatement = await financialStatementRepository.update(statementId, updateData, { tenantId });
    return updatedStatement;
  }

  /**
   * Update P&L statement status
   * @param {string} statementId - Statement ID
   * @param {string} status - New status
   * @param {string} userId - User ID making the change
   * @param {string} notes - Optional notes
   * @param {string} tenantId - Tenant ID (required for tenant isolation)
   * @returns {Promise<object>}
   */
  async updateStatementStatus(statementId, status, userId, notes, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to update statement status');
    }
    
    const statement = await financialStatementRepository.findById(statementId, { tenantId });
    if (!statement) {
      throw new Error('P&L statement not found');
    }

    const updateData = { status };

    // Add approval information if approving
    if (status === 'approved' || status === 'published') {
      updateData.approvedBy = userId;
      updateData.approvedAt = new Date();
    }

    // Add notes if provided
    if (notes) {
      const currentNotes = statement.notes || [];
      currentNotes.push({
        section: 'status_change',
        note: notes,
        date: new Date()
      });
      updateData.notes = currentNotes;
    }

    const updatedStatement = await financialStatementRepository.update(statementId, updateData, { tenantId });
    return {
      statementId: updatedStatement.statementId,
      status: updatedStatement.status,
      approvedBy: updatedStatement.approvedBy,
      approvedAt: updatedStatement.approvedAt
    };
  }

  /**
   * Delete P&L statement
   * @param {string} statementId - Statement ID
   * @param {string} tenantId - Tenant ID (required for tenant isolation)
   * @returns {Promise<object>}
   */
  async deleteStatement(statementId, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to delete statement');
    }
    
    const statement = await financialStatementRepository.findById(statementId, { tenantId });
    if (!statement) {
      throw new Error('P&L statement not found');
    }

    // Only allow deletion of draft statements
    if (statement.status !== 'draft') {
      throw new Error('Only draft statements can be deleted');
    }

    await financialStatementRepository.softDelete(statementId, { tenantId });
    return { message: 'P&L statement deleted successfully' };
  }

  /**
   * Get latest P&L statement
   * @param {string} periodType - Period type
   * @param {string} tenantId - Tenant ID (required for tenant isolation)
   * @returns {Promise<object|null>}
   */
  async getLatestStatement(periodType = 'monthly', tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get latest statement');
    }
    return await financialStatementRepository.getLatestStatement('profit_loss', periodType, tenantId);
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
    return await financialStatementRepository.getStatementComparison(statementId, type, tenantId);
  }
}

module.exports = new PLStatementService();

