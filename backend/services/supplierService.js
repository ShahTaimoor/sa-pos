const supplierRepository = require('../repositories/SupplierRepository');
const ledgerAccountService = require('../services/ledgerAccountService');

class SupplierService {
  /**
   * Transform supplier names to uppercase
   * @param {Supplier|object} supplier - Supplier to transform
   * @returns {object} - Transformed supplier
   */
  transformSupplierToUppercase(supplier) {
    if (!supplier) return supplier;
    if (supplier.toObject) supplier = supplier.toObject();
    if (supplier.companyName) supplier.companyName = supplier.companyName.toUpperCase();
    if (supplier.contactPerson && supplier.contactPerson.name) {
      supplier.contactPerson.name = supplier.contactPerson.name.toUpperCase();
    }
    return supplier;
  }

  /**
   * Parse opening balance
   * @param {any} value - Value to parse
   * @returns {number|null}
   */
  parseOpeningBalance(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Apply opening balance to supplier
   * @param {Supplier} supplier - Supplier object
   * @param {number} openingBalance - Opening balance
   */
  applyOpeningBalance(supplier, openingBalance) {
    if (openingBalance === null || openingBalance === undefined) return;
    supplier.openingBalance = openingBalance;
    if (openingBalance >= 0) {
      supplier.pendingBalance = openingBalance;
      supplier.advanceBalance = 0;
    } else {
      supplier.pendingBalance = 0;
      supplier.advanceBalance = Math.abs(openingBalance);
    }
    supplier.currentBalance = supplier.pendingBalance - (supplier.advanceBalance || 0);
  }

  /**
   * Build filter query from request parameters
   * @param {object} queryParams - Request query parameters
   * @param {string} tenantId - Tenant ID to scope the filter (optional but recommended)
   * @returns {object} - MongoDB filter object
   */
  buildFilter(queryParams, tenantId = null) {
    const filter = {};
    if (tenantId) {
      filter.tenantId = tenantId; // Always include tenantId for isolation
    }

    // Search filter
    if (queryParams.search) {
      filter.$or = [
        { companyName: { $regex: queryParams.search, $options: 'i' } },
        { email: { $regex: queryParams.search, $options: 'i' } },
        { 'contactPerson.name': { $regex: queryParams.search, $options: 'i' } },
        { phone: { $regex: queryParams.search, $options: 'i' } }
      ];
    }

    // Business type filter
    if (queryParams.businessType && queryParams.businessType !== '') {
      filter.businessType = queryParams.businessType;
    }

    // Status filter
    if (queryParams.status && queryParams.status !== '') {
      filter.status = queryParams.status;
    }

    // Reliability filter
    if (queryParams.reliability && queryParams.reliability !== '') {
      filter.reliability = queryParams.reliability;
    }

    // Email status filter
    if (queryParams.emailStatus) {
      switch (queryParams.emailStatus) {
        case 'verified':
          filter.emailVerified = true;
          break;
        case 'unverified':
          filter.emailVerified = false;
          filter.email = { $exists: true, $ne: '' };
          break;
        case 'no-email':
          filter.$or = [
            { email: { $exists: false } },
            { email: '' },
            { email: null }
          ];
          break;
      }
    }

    // Phone status filter
    if (queryParams.phoneStatus) {
      switch (queryParams.phoneStatus) {
        case 'verified':
          filter.phoneVerified = true;
          break;
        case 'unverified':
          filter.phoneVerified = false;
          filter.phone = { $exists: true, $ne: '' };
          break;
        case 'no-phone':
          filter.$or = [
            { phone: { $exists: false } },
            { phone: '' },
            { phone: null }
          ];
          break;
      }
    }

    return filter;
  }

  /**
   * Get suppliers with filtering and pagination
   * @param {object} queryParams - Query parameters
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<object>}
   */
  async getSuppliers(queryParams, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get suppliers');
    }
    
    const getAllSuppliers = queryParams.all === 'true' || queryParams.all === true ||
                           (queryParams.limit && parseInt(queryParams.limit) >= 999999);

    const page = getAllSuppliers ? 1 : (parseInt(queryParams.page) || 1);
    const limit = getAllSuppliers ? 999999 : (parseInt(queryParams.limit) || 20);

    const filter = this.buildFilter(queryParams, tenantId);
    // Ensure tenantId is in filter
    filter.tenantId = tenantId;

    const result = await supplierRepository.findWithPagination(filter, {
      tenantId: tenantId,
      page,
      limit,
      getAll: getAllSuppliers,
      sort: { createdAt: -1 },
      populate: [
        { path: 'ledgerAccount', select: 'accountCode accountName' }
      ]
    });

    // Transform supplier names to uppercase
    result.suppliers = result.suppliers.map(s => this.transformSupplierToUppercase(s));

    return result;
  }

  /**
   * Get single supplier by ID
   * @param {string} id - Supplier ID
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<Supplier>}
   */
  async getSupplierById(id, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get supplier');
    }
    
    const supplier = await supplierRepository.findById(id, {
      tenantId: tenantId,
      populate: [
        { path: 'ledgerAccount', select: 'accountCode accountName' }
      ]
    });

    if (!supplier) {
      throw new Error('Supplier not found');
    }

    return this.transformSupplierToUppercase(supplier);
  }

  /**
   * Search suppliers
   * @param {string} searchTerm - Search term
   * @param {number} limit - Maximum results
   * @param {string} tenantId - Tenant ID to scope the search (optional but recommended)
   * @returns {Promise<Array>}
   */
  async searchSuppliers(searchTerm, limit = 10, tenantId = null) {
    const suppliers = await supplierRepository.search(searchTerm, {
      select: 'companyName contactPerson email phone businessType paymentTerms currentBalance pendingBalance creditLimit',
      limit,
      sort: { companyName: 1 },
      lean: true
    }, tenantId);

    return suppliers.map(supplier => this.transformSupplierToUppercase(supplier));
  }

  /**
   * Check if email exists
   * @param {string} email - Email to check
   * @param {string} excludeId - Supplier ID to exclude
   * @param {string} tenantId - Tenant ID to scope the check
   * @returns {Promise<boolean>}
   */
  async checkEmailExists(email, excludeId = null, tenantId = null) {
    return await supplierRepository.emailExists(email, excludeId, tenantId);
  }

  /**
   * Check if company name exists
   * @param {string} companyName - Company name to check
   * @param {string} excludeId - Supplier ID to exclude
   * @param {string} tenantId - Tenant ID to scope the check
   * @returns {Promise<boolean>}
   */
  async checkCompanyNameExists(companyName, excludeId = null, tenantId = null) {
    return await supplierRepository.companyNameExists(companyName, excludeId, tenantId);
  }

  /**
   * Get suppliers for export
   * @param {object} filters - Filter criteria
   * @param {string} tenantId - Tenant ID to scope the query (optional but recommended)
   * @returns {Promise<Array>}
   */
  async getSuppliersForExport(filters = {}, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to export suppliers');
    }
    
    const filter = this.buildFilter(filters, tenantId);
    filter.tenantId = tenantId;
    
    return await supplierRepository.findAll(filter, {
      tenantId: tenantId,
      lean: true
    });
  }

  /**
   * Check if supplier exists by query
   * @param {object} query - Query object (should include tenantId)
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<boolean>}
   */
  async supplierExists(query, tenantId = null) {
    if (!tenantId && !query.tenantId) {
      throw new Error('tenantId is required for supplierExists');
    }
    // Ensure tenantId is in query
    const finalQuery = { ...query, tenantId: tenantId || query.tenantId };
    const supplier = await supplierRepository.findOne(finalQuery);
    return !!supplier;
  }

  /**
   * Get supplier by ID with populated ledger account
   * @param {string} supplierId - Supplier ID
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @param {object} options - Query options (e.g., session)
   * @returns {Promise<Supplier>}
   */
  async getSupplierByIdWithLedger(supplierId, tenantId, options = {}) {
    if (!tenantId) {
      throw new Error('tenantId is required for getSupplierByIdWithLedger');
    }
    const populate = [{ path: 'ledgerAccount', select: 'accountCode accountName' }];
    const supplier = await supplierRepository.findById(supplierId, { ...options, tenantId, populate });

    if (!supplier) {
      throw new Error('Supplier not found');
    }

    return supplier;
  }

  /**
   * Get all suppliers (for dropdowns/lists)
   * @param {object} filter - Filter query (should include tenantId)
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async getAllSuppliers(filter = {}, options = {}) {
    const { select = 'companyName contactPerson email phone businessType paymentTerms rating pendingBalance advanceBalance', sort = { companyName: 1 } } = options;
    
    // Ensure tenantId is in filter if provided
    return await supplierRepository.findAll(filter, { select, sort });
  }
}

module.exports = new SupplierService();

