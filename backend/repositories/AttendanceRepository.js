const BaseRepository = require('./BaseRepository');
const Attendance = require('../models/Attendance');

class AttendanceRepository extends BaseRepository {
  constructor() {
    super(Attendance);
  }

  /**
   * Find attendance by employee ID
   * @param {string} employeeId - Employee ID
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async findByEmployee(employeeId, options = {}) {
    return await this.findAll({ employee: employeeId }, options);
  }

  /**
   * Find open attendance session for employee
   * @param {string} employeeId - Employee ID
   * @param {object} options - Query options
   * @returns {Promise<Attendance|null>}
   */
  async findOpenSession(employeeId, options = {}) {
    return await this.findOne({ employee: employeeId, status: 'open' }, options);
  }

  /**
   * Find attendance with filtering and pagination
   * @param {object} filter - Filter query
   * @param {object} options - Pagination and sorting options
   * @returns {Promise<{attendances: Array, total: number, pagination: object}>}
   */
  async findWithPagination(filter = {}, options = {}) {
    const {
      page = 1,
      limit = 50,
      sort = { date: -1, clockIn: -1 },
      populate = [
        { path: 'employee', select: 'firstName lastName employeeId email' }
      ],
      getAll = false
    } = options;

    const skip = getAll ? 0 : (page - 1) * limit;
    const finalLimit = getAll ? 999999 : limit;

    const finalQuery = this.model.schema.paths.isDeleted 
      ? { ...filter, isDeleted: { $ne: true } } 
      : filter;

    let queryBuilder = this.model.find(finalQuery);
    
    if (populate && populate.length > 0) {
      populate.forEach(pop => {
        queryBuilder = queryBuilder.populate(pop);
      });
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

    const [attendances, total] = await Promise.all([
      queryBuilder,
      this.model.countDocuments(finalQuery)
    ]);

    return {
      attendances,
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
}

module.exports = new AttendanceRepository();

