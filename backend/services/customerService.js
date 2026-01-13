const customerRepository = require('../repositories/CustomerRepository');
const ledgerAccountService = require('./ledgerAccountService');
const mongoose = require('mongoose');
const { retryMongoTransaction, isDuplicateKeyError } = require('../utils/retry');
const Customer = require('../models/Customer');

// Helper function to parse opening balance
const parseOpeningBalance = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// Helper function to apply opening balance to customer
const applyOpeningBalance = (customer, openingBalance) => {
  if (openingBalance === null) return;
  customer.openingBalance = openingBalance;
  if (openingBalance >= 0) {
    // Positive opening balance: customer owes us money
    customer.pendingBalance = openingBalance;
    customer.advanceBalance = 0;
  } else {
    // Negative opening balance: we owe customer money (credit/advance)
    customer.pendingBalance = 0;
    customer.advanceBalance = Math.abs(openingBalance);
  }
  // Current balance = what customer owes us minus what we owe them
  customer.currentBalance = customer.pendingBalance - (customer.advanceBalance || 0);
};

// Helper function to check if transaction is not supported
const isTransactionNotSupportedError = (error) => {
  if (!error) return false;
  const message = error.message || '';
  return error.code === 20 ||
    error.codeName === 'IllegalOperation' ||
    message.includes('Transaction numbers are only allowed on a replica set member or mongos') ||
    message.includes('transactions are not supported');
};

// Helper function to run operation with optional transaction
const runWithOptionalTransaction = async (operation, context = 'operation') => {
  let session = null;
  let transactionStarted = false;

  try {
    session = await mongoose.startSession();
    session.startTransaction();
    transactionStarted = true;

    const result = await operation(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    if (transactionStarted && session) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        logger.error(`Failed to abort transaction for ${context}:`, abortError);
      }
    }

    if (!transactionStarted && isTransactionNotSupportedError(error)) {
      logger.warn(`Transactions not supported for MongoDB deployment. Retrying ${context} without session.`);
      return await operation(null);
    }

    throw error;
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

class CustomerService {
  /**
   * Build filter query from request parameters
   * @param {object} queryParams - Request query parameters
   * @returns {object} - MongoDB filter object
   */
  buildFilter(queryParams) {
    const filter = {};

    // Tenant ID filter (required for multi-tenant isolation)
    if (queryParams.tenantId) {
      filter.tenantId = queryParams.tenantId;
    }

    // Search filter
    if (queryParams.search) {
      filter.$or = [
        { name: { $regex: queryParams.search, $options: 'i' } },
        { email: { $regex: queryParams.search, $options: 'i' } },
        { businessName: { $regex: queryParams.search, $options: 'i' } },
        { phone: { $regex: queryParams.search, $options: 'i' } }
      ];
    }

    // Business type filter
    if (queryParams.businessType) {
      filter.businessType = queryParams.businessType;
    }

    // Status filter
    if (queryParams.status) {
      filter.status = queryParams.status;
    }

    // Customer tier filter
    if (queryParams.customerTier) {
      filter.customerTier = queryParams.customerTier;
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
   * Transform customer names to uppercase
   * @param {Customer|object} customer - Customer to transform
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
   * Get customers with filtering and pagination
   * @param {object} queryParams - Query parameters
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<object>}
   */
  async getCustomers(queryParams, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get customers');
    }
    
    const getAllCustomers = queryParams.all === 'true' || queryParams.all === true ||
                          (queryParams.limit && parseInt(queryParams.limit) >= 999999);

    const page = getAllCustomers ? 1 : (parseInt(queryParams.page) || 1);
    const limit = getAllCustomers ? 999999 : (parseInt(queryParams.limit) || 20);

    const filter = this.buildFilter(queryParams);
    // Ensure tenantId is in filter
    filter.tenantId = tenantId;

    const result = await customerRepository.findWithPagination(filter, {
      tenantId: tenantId,
      page,
      limit,
      getAll: getAllCustomers,
      sort: { createdAt: -1 }
    });

    // Transform customer names to uppercase
    result.customers = result.customers.map(c => this.transformCustomerToUppercase(c));

    return result;
  }

  /**
   * Get single customer by ID
   * @param {string} id - Customer ID
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<Customer>}
   */
  async getCustomerById(id, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get customer');
    }
    
    const customer = await customerRepository.findById(id, {
      tenantId: tenantId
    });
    if (!customer) {
      throw new Error('Customer not found');
    }
    return this.transformCustomerToUppercase(customer);
  }

  /**
   * Search customers
   * @param {string} searchTerm - Search term
   * @param {number} limit - Maximum results
   * @param {string} tenantId - Tenant ID to scope the search (optional but recommended)
   * @returns {Promise<Array>}
   */
  async searchCustomers(searchTerm, limit = 10, tenantId = null) {
    const customers = await customerRepository.search(searchTerm, {
      select: 'name email businessName businessType customerTier phone pendingBalance advanceBalance creditLimit currentBalance',
      limit,
      sort: { businessName: 1 },
      lean: true
    }, tenantId);

    return customers.map(customer => {
      const transformed = this.transformCustomerToUppercase(customer);
      return {
        ...transformed,
        displayName: (transformed.businessName || transformed.name || '').toUpperCase()
      };
    });
  }

  /**
   * Check if email exists
   * @param {string} email - Email to check
   * @param {string} excludeId - Customer ID to exclude
   * @param {string} tenantId - Tenant ID to scope the check
   * @returns {Promise<boolean>}
   */
  async checkEmailExists(email, excludeId = null, tenantId = null) {
    return await customerRepository.emailExists(email, excludeId, tenantId);
  }

  /**
   * Check if business name exists
   * @param {string} businessName - Business name to check
   * @param {string} excludeId - Customer ID to exclude
   * @returns {Promise<boolean>}
   */
  async checkBusinessNameExists(businessName, excludeId = null, tenantId = null) {
    return await customerRepository.businessNameExists(businessName, excludeId, tenantId);
  }

  /**
   * Create new customer
   * @param {object} customerData - Customer data
   * @param {string} userId - User ID creating the customer
   * @param {object} options - Options including openingBalance, tenantId, etc.
   * @returns {Promise<{customer: Customer, message: string}>}
   */
  async createCustomer(customerData, userId, options = {}) {
    const { openingBalance, useTransaction = true, tenantId = null } = options;
    const finalTenantId = tenantId || customerData.tenantId;

    // Check if name already exists (within same tenant)
    if (customerData.name) {
      const nameExists = await customerRepository.nameExists(customerData.name, null, finalTenantId);
      if (nameExists) {
        throw new Error('A customer with this name already exists');
      }
    }

    // Check if email already exists (within same tenant)
    if (customerData.email) {
      const emailExists = await customerRepository.emailExists(customerData.email, null, finalTenantId);
      if (emailExists) {
        throw new Error('A customer with this email already exists');
      }
    }

    // Check if phone already exists (within same tenant)
    if (customerData.phone) {
      const phoneExists = await customerRepository.phoneExists(customerData.phone, null, finalTenantId);
      if (phoneExists) {
        throw new Error('A customer with this phone number already exists');
      }
    }

    // Check if business name already exists (within same tenant)
    if (customerData.businessName) {
      const businessNameExists = await customerRepository.businessNameExists(customerData.businessName, null, finalTenantId);
      if (businessNameExists) {
        throw new Error('A customer with this business name already exists');
      }
    }

    const parsedOpeningBalance = parseOpeningBalance(openingBalance);
    const dataWithUser = {
      ...customerData,
      tenantId: finalTenantId, // Ensure tenantId is set
      createdBy: userId,
      lastModifiedBy: userId
    };

    // Wrap the transaction operation with retry logic for WriteConflict errors
    const customerId = await retryMongoTransaction(async () => {
      return await runWithOptionalTransaction(async (session) => {
        let newCustomer = new Customer(dataWithUser);
        applyOpeningBalance(newCustomer, parsedOpeningBalance);
        
        // Sync ledger account first (this will save the customer with the ledger account)
        // This ensures the customer is only saved once, after the ledger account is set
        await ledgerAccountService.syncCustomerLedgerAccount(newCustomer, session ? {
          session,
          userId: userId
        } : {
          userId: userId
        });

        // Verify customer was saved (syncCustomerLedgerAccount should have saved it)
        if (newCustomer.isNew) {
          await newCustomer.save(session ? { session } : undefined);
        }

        return newCustomer._id;
      }, 'create customer');
    }, {
      maxRetries: 5,
      initialDelay: 100,
      maxDelay: 3000
    });

    const customer = await this.getCustomerByIdWithLedger(customerId);

    if (!customer) {
      throw new Error('Customer created but could not be retrieved');
    }

    return {
      customer: this.transformCustomerToUppercase(customer),
      message: 'Customer created successfully'
    };
  }

  /**
   * Update customer
   * @param {string} id - Customer ID
   * @param {object} updateData - Data to update
   * @param {string} userId - User ID updating the customer
   * @param {object} options - Options including openingBalance, tenantId, etc.
   * @returns {Promise<{customer: Customer, message: string}>}
   */
  async updateCustomer(id, updateData, userId, options = {}) {
    const { openingBalance, useTransaction = true, tenantId = null } = options;
    
    // Get current customer to verify tenantId
    const finalTenantId = tenantId || updateData.tenantId;
    if (!finalTenantId) {
      throw new Error('tenantId is required to update customer');
    }
    
    const currentCustomer = await customerRepository.findById(id, {
      tenantId: finalTenantId
    });
    if (!currentCustomer) {
      throw new Error('Customer not found');
    }
    
    // Prevent tenantId from being changed
    delete updateData.tenantId;

    // Check if name already exists (excluding current customer, within same tenant)
    if (updateData.name) {
      const nameExists = await customerRepository.nameExists(updateData.name, id, finalTenantId);
      if (nameExists) {
        throw new Error('A customer with this name already exists');
      }
    }

    // Check if email already exists (excluding current customer, within same tenant)
    if (updateData.email) {
      const emailExists = await customerRepository.emailExists(updateData.email, id, finalTenantId);
      if (emailExists) {
        throw new Error('A customer with this email already exists');
      }
    }

    // Check if phone already exists (excluding current customer, within same tenant)
    if (updateData.phone) {
      const phoneExists = await customerRepository.phoneExists(updateData.phone, id, finalTenantId);
      if (phoneExists) {
        throw new Error('A customer with this phone number already exists');
      }
    }

    // Check if business name already exists (excluding current customer, within same tenant)
    if (updateData.businessName) {
      const businessNameExists = await customerRepository.businessNameExists(updateData.businessName, id, finalTenantId);
      if (businessNameExists) {
        throw new Error('A customer with this business name already exists');
      }
    }

    const parsedOpeningBalance = parseOpeningBalance(openingBalance);

    // Wrap the transaction operation with retry logic for WriteConflict errors
    const updatedCustomerId = await retryMongoTransaction(async () => {
      return await runWithOptionalTransaction(async (session) => {
        const customer = await customerRepository.findById(id, { session });

        if (!customer) {
          return null;
        }

        Object.assign(customer, {
          ...updateData,
          lastModifiedBy: userId
        });
        applyOpeningBalance(customer, parsedOpeningBalance);

        await customer.save(session ? { session } : undefined);
        await ledgerAccountService.syncCustomerLedgerAccount(customer, session ? {
          session,
          userId: userId
        } : {
          userId: userId
        });

        return customer;
      }, 'update customer');
    }, {
      maxRetries: 5,
      initialDelay: 100,
      maxDelay: 3000
    });

    if (!updatedCustomer) {
      throw new Error('Customer not found');
    }

    // Get updated customer for audit log and return
    const finalCustomer = await this.getCustomerByIdWithLedger(updatedCustomer._id);
    const oldCustomer = currentCustomer.toObject();

    if (!finalCustomer) {
      throw new Error('Customer updated but could not be retrieved');
    }

    // Log audit trail (async, don't wait)
    customerAuditLogService.logCustomerUpdate(oldCustomer, finalCustomer, { _id: userId }, null)
      .catch(err => logger.error('Audit log error:', { error: err }));

    return {
      customer: this.transformCustomerToUppercase(finalCustomer),
      message: 'Customer updated successfully'
    };
  }

  /**
   * Delete customer (soft delete)
   * @param {string} id - Customer ID
   * @param {string} userId - User ID deleting the customer
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @param {string} reason - Reason for deletion
   * @returns {Promise<{message: string}>}
   */
  async deleteCustomer(id, userId, tenantId, reason = 'Customer deleted') {
    if (!tenantId) {
      throw new Error('tenantId is required to delete customer');
    }
    
    const deletionResult = await runWithOptionalTransaction(async (session) => {
      const customer = await customerRepository.findById(id, { 
        tenantId: tenantId,
        session 
      });

      if (!customer) {
        return null;
      }

      // Check for outstanding balances
      if (customer.currentBalance !== 0) {
        throw new Error('Cannot delete customer with outstanding balance. Please settle all balances first.');
      }

      // Check for pending orders
      const Sales = require('../models/Sales');
const logger = require('../utils/logger');
      const pendingOrders = await Sales.countDocuments({
        customer: id,
        status: { $in: ['pending', 'confirmed', 'processing'] }
      });
      
      if (pendingOrders > 0) {
        throw new Error('Cannot delete customer with pending orders. Please cancel or complete orders first.');
      }

      // Capture customer data before deletion for audit
      const customerData = customer.toObject();

      // Soft delete
      customer.isDeleted = true;
      customer.deletedAt = new Date();
      customer.deletedBy = userId;
      customer.deletionReason = reason;
      customer.status = 'inactive'; // Also set status to inactive
      
      await customer.save(session ? { session } : undefined);

      // Deactivate ledger account
      if (customer.ledgerAccount) {
        await ledgerAccountService.deactivateLedgerAccount(customer.ledgerAccount, session ? {
          session,
          userId: userId
        } : { userId: userId });
      }

      // Log audit trail (async, don't wait)
      customerAuditLogService.logCustomerDeletion(customerData, { _id: userId }, null, reason)
        .catch(err => logger.error('Audit log error:', { error: err }));

      return true;
    }, 'delete customer');

    if (!deletionResult) {
      throw new Error('Customer not found');
    }

    return {
      message: 'Customer deleted successfully'
    };
  }

  /**
   * Restore soft-deleted customer
   * @param {string} id - Customer ID
   * @param {string} userId - User ID restoring the customer
   * @returns {Promise<{customer: Customer, message: string}>}
   */
  async restoreCustomer(id, userId) {
    const customer = await customerRepository.Model.findOneAndUpdate(
      { _id: id, isDeleted: true },
      {
        $set: {
          isDeleted: false,
          status: 'active',
          lastModifiedBy: userId
        },
        $unset: {
          deletedAt: '',
          deletedBy: '',
          deletionReason: ''
        }
      },
      { new: true }
    );

    if (!customer) {
      throw new Error('Deleted customer not found');
    }

    // Reactivate ledger account if exists
    if (customer.ledgerAccount) {
      await ledgerAccountService.activateLedgerAccount(customer.ledgerAccount, { userId });
    }

    return {
      customer: this.transformCustomerToUppercase(customer),
      message: 'Customer restored successfully'
    };
  }

  /**
   * Get deleted customers
   * @param {object} queryParams - Query parameters
   * @returns {Promise<object>}
   */
  async getDeletedCustomers(queryParams = {}) {
    const filter = { isDeleted: true };
    
    if (queryParams.search) {
      filter.$or = [
        { name: { $regex: queryParams.search, $options: 'i' } },
        { businessName: { $regex: queryParams.search, $options: 'i' } }
      ];
    }

    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 20;

    const result = await customerRepository.findWithPagination(filter, {
      page,
      limit,
      sort: { deletedAt: -1 }
    });

    result.customers = result.customers.map(c => this.transformCustomerToUppercase(c));
    return result;
  }

  /**
   * Get unique cities from customer addresses
   * @param {string} tenantId - Tenant ID to scope the query (required)
   * @returns {Promise<Array>}
   */
  async getUniqueCities(tenantId = null) {
    if (!tenantId) {
      throw new Error('tenantId is required for getUniqueCities');
    }
    
    const filter = { tenantId };
    const customers = await customerRepository.findAll(filter, {
      select: 'addresses',
      lean: true
    });

    const citiesSet = new Set();
    customers.forEach(customer => {
      if (customer.addresses && Array.isArray(customer.addresses)) {
        customer.addresses.forEach(address => {
          if (address.city && address.city.trim()) {
            citiesSet.add(address.city.trim());
          }
        });
      }
    });

    return Array.from(citiesSet).sort();
  }

  /**
   * Get customers by cities
   * @param {Array} cities - Array of city names
   * @param {boolean} showZeroBalance - Whether to show customers with zero balance
   * @param {string} tenantId - Tenant ID to scope the query (required)
   * @returns {Promise<Array>}
   */
  async getCustomersByCities(cities = [], showZeroBalance = true, tenantId = null) {
    if (!tenantId) {
      throw new Error('tenantId is required for getCustomersByCities');
    }
    
    const filter = { tenantId };
    if (cities.length > 0) {
      filter['addresses.city'] = { $in: cities };
    }

    const customers = await customerRepository.findAll(filter, {
      select: 'name businessName addresses currentBalance pendingBalance advanceBalance',
      sort: { businessName: 1 },
      lean: true
    });

    // Filter customers by city and balance
    const filteredCustomers = customers.filter(customer => {
      // Check if customer has at least one address matching the selected cities
      if (cities.length > 0) {
        const hasMatchingCity = customer.addresses && customer.addresses.some(addr =>
          addr.city && cities.includes(addr.city.trim())
        );
        if (!hasMatchingCity) return false;
      }

      // Filter by balance if showZeroBalance is false
      if (!showZeroBalance) {
        const balance = customer.pendingBalance || 0;
        return balance > 0;
      }

      return true;
    });

    // Format response
    return filteredCustomers.map(customer => {
      const defaultAddress = customer.addresses && customer.addresses.length > 0
        ? customer.addresses.find(addr => addr.isDefault) || customer.addresses[0]
        : null;

      return {
        _id: customer._id,
        accountName: customer.businessName || customer.name,
        name: customer.name,
        businessName: customer.businessName,
        city: defaultAddress?.city || '',
        balance: customer.pendingBalance || 0,
        currentBalance: customer.currentBalance || 0,
        pendingBalance: customer.pendingBalance || 0,
        advanceBalance: customer.advanceBalance || 0
      };
    });
  }

  /**
   * Update customer balance
   * @param {string} id - Customer ID
   * @param {object} balanceData - Balance data
   * @returns {Promise<{customer: object, message: string}>}
   */
  async updateCustomerBalance(id, balanceData) {
    const customer = await customerRepository.updateBalance(id, balanceData);
    if (!customer) {
      throw new Error('Customer not found');
    }

    return {
      customer: {
        id: customer._id,
        name: customer.name,
        businessName: customer.businessName,
        pendingBalance: customer.pendingBalance,
        currentBalance: customer.currentBalance,
        advanceBalance: customer.advanceBalance
      },
      message: 'Customer balance updated successfully'
    };
  }

  /**
   * Get customers for export
   * @param {object} filters - Filter criteria
   * @returns {Promise<Array>}
   */
  async getCustomersForExport(filters = {}) {
    const filter = this.buildFilter(filters);
    return await customerRepository.findAll(filter, {
      lean: true
    });
  }

  /**
   * Check if customer exists by query
   * @param {object} query - Query object
   * @returns {Promise<boolean>}
   */
  async customerExists(query) {
    const customer = await customerRepository.findOne(query);
    return !!customer;
  }

  /**
   * Add address to customer
   * @param {string} customerId - Customer ID
   * @param {object} addressData - Address data
   * @returns {Promise<Customer>}
   */
  async addCustomerAddress(customerId, addressData) {
    const customer = await customerRepository.findById(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // If this is set as default, unset other defaults of the same type
    if (addressData.isDefault) {
      customer.addresses.forEach(addr => {
        if (addr.type === addressData.type || addr.type === 'both') {
          addr.isDefault = false;
        }
      });
    }

    customer.addresses.push(addressData);
    await customer.save();

    return customer;
  }

  /**
   * Update customer credit limit
   * @param {string} customerId - Customer ID
   * @param {number} creditLimit - Credit limit
   * @param {string} userId - User ID who made the change
   * @returns {Promise<Customer>}
   */
  async updateCustomerCreditLimit(customerId, creditLimit, userId) {
    const customer = await customerRepository.update(customerId, {
      creditLimit,
      lastModifiedBy: userId
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    return customer;
  }

  /**
   * Get customer by ID with populated ledger account
   * @param {string} customerId - Customer ID
   * @returns {Promise<Customer>}
   */
  async getCustomerByIdWithLedger(customerId) {
    const customer = await customerRepository.findById(customerId, {
      populate: [{ path: 'ledgerAccount', select: 'accountCode accountName' }]
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    return customer;
  }
}

module.exports = new CustomerService();

