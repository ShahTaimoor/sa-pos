const Tenant = require('../models/Tenant');
const User = require('../models/User');
const authService = require('./authService');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Tenant Service
 * 
 * Handles tenant creation and management
 * Only Super Admin can create tenants
 */
class TenantService {
  /**
   * Create a new tenant with an Admin user
   * This is called by Super Admin when creating a new Admin user
   * 
   * @param {object} tenantData - Tenant data
   * @param {object} adminUserData - Admin user data
   * @param {object} createdBy - Super Admin user creating this tenant
   * @returns {Promise<{tenant: Tenant, adminUser: User}>}
   */
  async createTenantWithAdmin(tenantData, adminUserData, createdBy) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Validate Super Admin
      if (!createdBy || createdBy.role !== 'super_admin') {
        throw new Error('Only Super Admin can create tenants');
      }

      // Generate new tenantId
      const tenantId = new mongoose.Types.ObjectId();

      // Create Admin user first (with the new tenantId)
      const userData = {
        ...adminUserData,
        tenantId: tenantId,
        role: 'admin',
        status: 'active'
      };

      const adminUser = await authService.register(userData, createdBy);
      const adminUserDoc = await User.findById(adminUser.user._id).session(session);

      // Create Tenant record
      const tenant = new Tenant({
        name: tenantData.name || adminUserData.firstName + ' ' + adminUserData.lastName,
        businessName: tenantData.businessName || tenantData.name || adminUserData.firstName + ' ' + adminUserData.lastName,
        businessType: tenantData.businessType || 'retail',
        email: tenantData.email || adminUserData.email,
        phone: tenantData.phone || adminUserData.phone,
        address: tenantData.address || {},
        taxId: tenantData.taxId,
        adminUserId: adminUserDoc._id,
        createdBy: createdBy._id || createdBy,
        status: 'active',
        plan: tenantData.plan || 'basic',
        settings: tenantData.settings || {}
      });

      await tenant.save({ session });

      // Commit transaction
      await session.commitTransaction();

      logger.info('Tenant created successfully', {
        tenantId: tenant._id,
        adminUserId: adminUserDoc._id,
        createdBy: createdBy._id || createdBy
      });

      return {
        tenant: tenant.toObject(),
        adminUser: adminUser.user
      };
    } catch (error) {
      await session.abortTransaction();
      logger.error('Error creating tenant:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Get tenant by ID
   * @param {string} tenantId - Tenant ID
   * @param {object} user - User making the request (for authorization)
   * @returns {Promise<Tenant>}
   */
  async getTenantById(tenantId, user) {
    // Super Admin can view any tenant
    if (user.role === 'super_admin') {
      return await Tenant.findById(tenantId);
    }

    // Regular users can only view their own tenant
    if (user.tenantId.toString() !== tenantId.toString()) {
      throw new Error('Access denied. You can only view your own tenant.');
    }

    return await Tenant.findById(tenantId);
  }

  /**
   * Get all tenants (Super Admin only)
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async getAllTenants(options = {}) {
    const { page = 1, limit = 20, status } = options;
    const skip = (page - 1) * limit;

    const query = {};
    if (status) {
      query.status = status;
    }

    const [tenants, total] = await Promise.all([
      Tenant.find(query)
        .populate('adminUserId', 'firstName lastName email')
        .populate('createdBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Tenant.countDocuments(query)
    ]);

    return {
      tenants,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Update tenant (Super Admin only, or Admin for their own tenant)
   * @param {string} tenantId - Tenant ID
   * @param {object} updateData - Update data
   * @param {object} user - User making the request
   * @returns {Promise<Tenant>}
   */
  async updateTenant(tenantId, updateData, user) {
    // Super Admin can update any tenant
    if (user.role === 'super_admin') {
      return await Tenant.findByIdAndUpdate(
        tenantId,
        { $set: updateData },
        { new: true, runValidators: true }
      );
    }

    // Admin can only update their own tenant
    if (user.role === 'admin' && user.tenantId.toString() === tenantId.toString()) {
      // Prevent changing critical fields
      delete updateData.adminUserId;
      delete updateData.createdBy;
      delete updateData.status; // Only Super Admin can change status

      return await Tenant.findByIdAndUpdate(
        tenantId,
        { $set: updateData },
        { new: true, runValidators: true }
      );
    }

    throw new Error('Access denied. You can only update your own tenant.');
  }

  /**
   * Suspend/Activate tenant (Super Admin only)
   * @param {string} tenantId - Tenant ID
   * @param {string} status - New status ('active' or 'suspended')
   * @param {object} user - Super Admin user
   * @returns {Promise<Tenant>}
   */
  async setTenantStatus(tenantId, status, user) {
    if (user.role !== 'super_admin') {
      throw new Error('Only Super Admin can change tenant status');
    }

    if (!['active', 'suspended', 'inactive'].includes(status)) {
      throw new Error('Invalid status');
    }

    return await Tenant.findByIdAndUpdate(
      tenantId,
      { $set: { status } },
      { new: true }
    );
  }
}

module.exports = new TenantService();
