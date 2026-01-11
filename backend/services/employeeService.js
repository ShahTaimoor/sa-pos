const employeeRepository = require('../repositories/EmployeeRepository');
const userRepository = require('../repositories/UserRepository');

class EmployeeService {
  /**
   * Build filter query from request parameters
   * @param {object} queryParams - Request query parameters
   * @returns {object} - MongoDB filter object
   */
  buildFilter(queryParams) {
    const filter = {};

    // Search filter
    if (queryParams.search && typeof queryParams.search === 'string' && queryParams.search.trim() !== '') {
      try {
        const searchRegex = new RegExp(queryParams.search.trim(), 'i');
        filter.$or = [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { employeeId: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
          { position: searchRegex },
          { department: searchRegex }
        ];
      } catch (regexError) {
        // Continue without search filter if regex fails
      }
    }

    // Status filter
    if (queryParams.status && typeof queryParams.status === 'string' && queryParams.status.trim() !== '') {
      const statusValue = queryParams.status.trim();
      if (['active', 'inactive', 'terminated', 'on_leave'].includes(statusValue)) {
        filter.status = statusValue;
      }
    }

    // Department filter
    if (queryParams.department && typeof queryParams.department === 'string' && queryParams.department.trim() !== '') {
      filter.department = queryParams.department.trim();
    }

    // Position filter
    if (queryParams.position && typeof queryParams.position === 'string' && queryParams.position.trim() !== '') {
      filter.position = queryParams.position.trim();
    }

    return filter;
  }

  /**
   * Get employees with filtering and pagination
   * @param {object} queryParams - Query parameters
   * @returns {Promise<object>}
   */
  async getEmployees(queryParams) {
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 20;

    const filter = this.buildFilter(queryParams);

    const result = await employeeRepository.findWithPagination(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      populate: [{
        path: 'userAccount',
        select: 'firstName lastName email role',
        options: { strictPopulate: false }
      }]
    });

    return result;
  }

  /**
   * Get single employee by ID
   * @param {string} id - Employee ID
   * @returns {Promise<Employee>}
   */
  async getEmployeeById(id) {
    const employee = await employeeRepository.findById(id);
    
    if (!employee) {
      throw new Error('Employee not found');
    }

    // Populate related fields
    await employee.populate({
      path: 'userAccount',
      select: 'firstName lastName email role status',
      options: { strictPopulate: false }
    });

    return employee;
  }

  /**
   * Check if employee ID exists
   * @param {string} employeeId - Employee ID to check
   * @param {string} tenantId - Tenant ID
   * @param {string} excludeId - Employee ID to exclude
   * @returns {Promise<boolean>}
   */
  async checkEmployeeIdExists(employeeId, tenantId = null, excludeId = null) {
    return await employeeRepository.employeeIdExists(employeeId, tenantId, excludeId);
  }

  /**
   * Check if email exists
   * @param {string} email - Email to check
   * @param {string} tenantId - Tenant ID
   * @param {string} excludeId - Employee ID to exclude
   * @returns {Promise<boolean>}
   */
  async checkEmailExists(email, tenantId = null, excludeId = null) {
    return await employeeRepository.emailExists(email, excludeId);
  }
}

module.exports = new EmployeeService();

