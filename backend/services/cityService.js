const cityRepository = require('../repositories/CityRepository');
const customerRepository = require('../repositories/CustomerRepository');
const supplierRepository = require('../repositories/SupplierRepository');

class CityService {
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
        { name: { $regex: queryParams.search, $options: 'i' } },
        { state: { $regex: queryParams.search, $options: 'i' } },
        { country: { $regex: queryParams.search, $options: 'i' } }
      ];
    }

    // Active status filter
    if (queryParams.isActive !== undefined) {
      filter.isActive = queryParams.isActive === 'true' || queryParams.isActive === true;
    }

    // State filter
    if (queryParams.state) {
      filter.state = { $regex: queryParams.state, $options: 'i' };
    }

    return filter;
  }

  /**
   * Get cities with filtering and pagination
   * @param {object} queryParams - Query parameters
   * @param {string} tenantId - Tenant ID to scope the query (optional but recommended)
   * @returns {Promise<object>}
   */
  async getCities(queryParams, tenantId = null) {
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 50;

    const filter = this.buildFilter(queryParams, tenantId);

    const result = await cityRepository.findWithPagination(filter, {
      page,
      limit,
      sort: { name: 1 },
      populate: [
        { path: 'createdBy', select: 'firstName lastName' },
        { path: 'updatedBy', select: 'firstName lastName' }
      ]
    });

    return result;
  }

  /**
   * Get active cities (for dropdowns)
   * @param {string} tenantId - Tenant ID to scope the query (optional but recommended)
   * @returns {Promise<Array>}
   */
  async getActiveCities(tenantId = null) {
    return await cityRepository.findActive({}, tenantId);
  }

  /**
   * Get single city by ID
   * @param {string} id - City ID
   * @param {string} tenantId - Tenant ID to scope the query (optional but recommended)
   * @returns {Promise<City>}
   */
  async getCityById(id, tenantId = null) {
    const query = { _id: id };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    const city = await cityRepository.findOne(query);
    
    if (!city) {
      throw new Error('City not found');
    }

    // Populate related fields
    await city.populate([
      { path: 'createdBy', select: 'firstName lastName' },
      { path: 'updatedBy', select: 'firstName lastName' }
    ]);

    return city;
  }

  /**
   * Create new city
   * @param {object} cityData - City data
   * @param {string} userId - User ID creating the city
   * @param {object} options - Options including tenantId
   * @returns {Promise<{city: City, message: string}>}
   */
  async createCity(cityData, userId, options = {}) {
    const tenantId = options.tenantId;
    if (!tenantId) {
      throw new Error('tenantId is required for city creation');
    }
    
    // Check if city name already exists (within tenant)
    const nameExists = await cityRepository.nameExists(cityData.name, null, tenantId);
    if (nameExists) {
      throw new Error('City with this name already exists');
    }

    const dataWithUser = {
      name: cityData.name.trim(),
      state: cityData.state ? cityData.state.trim() : undefined,
      country: cityData.country ? cityData.country.trim() : 'US',
      description: cityData.description ? cityData.description.trim() : undefined,
      isActive: cityData.isActive !== undefined ? cityData.isActive : true,
      tenantId: tenantId, // Ensure tenantId is set
      createdBy: userId
    };

    const city = await cityRepository.create(dataWithUser);
    
    // Populate createdBy
    await city.populate('createdBy', 'firstName lastName');

    return {
      city,
      message: 'City created successfully'
    };
  }

  /**
   * Update city
   * @param {string} id - City ID
   * @param {object} updateData - Data to update
   * @param {string} userId - User ID updating the city
   * @param {object} options - Options including tenantId
   * @returns {Promise<{city: City, message: string}>}
   */
  async updateCity(id, updateData, userId, options = {}) {
    const tenantId = options.tenantId;
    const query = { _id: id };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    const city = await cityRepository.findOne(query);
    if (!city) {
      throw new Error('City not found');
    }

    // Check if name is being changed and if new name already exists (within tenant)
    if (updateData.name && updateData.name.trim() !== city.name) {
      const finalTenantId = tenantId || city.tenantId;
      const nameExists = await cityRepository.nameExists(updateData.name, id, finalTenantId);
      if (nameExists) {
        throw new Error('City with this name already exists');
      }
    }

    const dataToUpdate = {
      ...updateData,
      updatedBy: userId
    };

    // Clean up the data
    if (dataToUpdate.name) dataToUpdate.name = dataToUpdate.name.trim();
    if (dataToUpdate.state !== undefined) dataToUpdate.state = dataToUpdate.state ? dataToUpdate.state.trim() : undefined;
    if (dataToUpdate.country !== undefined) dataToUpdate.country = dataToUpdate.country.trim();
    if (dataToUpdate.description !== undefined) dataToUpdate.description = dataToUpdate.description ? dataToUpdate.description.trim() : undefined;

    const updatedCity = await cityRepository.update(id, dataToUpdate, {
      new: true,
      runValidators: true
    });

    // Populate related fields
    await updatedCity.populate([
      { path: 'createdBy', select: 'firstName lastName' },
      { path: 'updatedBy', select: 'firstName lastName' }
    ]);

    return {
      city: updatedCity,
      message: 'City updated successfully'
    };
  }

  /**
   * Delete city
   * @param {string} id - City ID
   * @param {object} options - Options including tenantId
   * @returns {Promise<{message: string}>}
   */
  async deleteCity(id, options = {}) {
    const tenantId = options.tenantId;
    const query = { _id: id };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    const city = await cityRepository.findOne(query);
    if (!city) {
      throw new Error('City not found');
    }

    // Check if city is being used by customers or suppliers (within tenant)
    const finalTenantId = tenantId || city.tenantId;
    const customersUsingCity = await customerRepository.findOne({
      'addresses.city': city.name,
      tenantId: finalTenantId
    });

    const suppliersUsingCity = await supplierRepository.findOne({
      'addresses.city': city.name,
      tenantId: finalTenantId
    });

    if (customersUsingCity || suppliersUsingCity) {
      throw new Error('Cannot delete city. It is being used by customers or suppliers. Deactivate it instead.');
    }

    await cityRepository.softDelete(id);

    return {
      message: 'City deleted successfully'
    };
  }
}

module.exports = new CityService();

