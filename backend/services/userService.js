const userRepository = require('../repositories/UserRepository');

class UserService {
  /**
   * Get all users
   * @param {object} options - Query options
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<Array>}
   */
  async getUsers(options = {}, tenantId = null) {
    if (!tenantId) {
      throw new Error('tenantId is required to get users');
    }
    
    const users = await userRepository.findAll({}, {
      tenantId: tenantId, // Enforce tenant isolation
      select: '-password -loginAttempts -lockUntil',
      populate: [{ path: 'permissionHistory.changedBy', select: 'firstName lastName email' }],
      sort: { createdAt: -1 }
    });
    return users;
  }

  /**
   * Get user by ID
   * @param {string} id - User ID
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<object>}
   */
  async getUserById(id, tenantId = null) {
    if (!tenantId) {
      throw new Error('tenantId is required to get user');
    }
    
    const user = await userRepository.findById(id, {
      tenantId: tenantId // Enforce tenant isolation
    });
    if (!user) {
      throw new Error('User not found');
    }
    // Remove sensitive fields
    const userObj = user.toObject ? user.toObject() : user;
    delete userObj.password;
    delete userObj.loginAttempts;
    delete userObj.lockUntil;
    return userObj;
  }

  /**
   * Update user
   * @param {string} id - User ID
   * @param {object} updateData - Update data
   * @param {object} changedBy - User making the change
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<object>}
   */
  async updateUser(id, updateData, changedBy, tenantId = null) {
    if (!tenantId) {
      tenantId = changedBy?.tenantId;
    }
    if (!tenantId) {
      throw new Error('tenantId is required to update user');
    }
    
    const user = await userRepository.findById(id, {
      tenantId: tenantId // Enforce tenant isolation
    });
    if (!user) {
      throw new Error('User not found');
    }

    // Prevent tenantId from being changed
    if (updateData.tenantId) {
      delete updateData.tenantId;
    }

    // Check if email is being changed and if it's already taken (within same tenant)
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await userRepository.findByEmail(updateData.email, {
        tenantId: tenantId
      });
      if (existingUser && existingUser._id.toString() !== id) {
        throw new Error('Email already exists');
      }
    }

    // Store old data for tracking
    const oldData = {
      role: user.role,
      permissions: user.permissions
    };

    // Update user (with tenantId enforcement)
    const updatedUser = await userRepository.updateById(id, updateData, {
      tenantId: tenantId
    });
    
    // Track permission changes if role or permissions changed
    if (updateData.role && updateData.role !== oldData.role) {
      await userRepository.trackPermissionChange(
        id,
        changedBy._id || changedBy,
        'role_changed',
        oldData,
        { role: updatedUser.role, permissions: updatedUser.permissions },
        `Role changed from ${oldData.role} to ${updateData.role}`
      );
    } else if (updateData.permissions && JSON.stringify(updateData.permissions) !== JSON.stringify(oldData.permissions)) {
      await userRepository.trackPermissionChange(
        id,
        changedBy._id || changedBy,
        'permissions_modified',
        oldData,
        { role: updatedUser.role, permissions: updatedUser.permissions },
        'User permissions modified'
      );
    }

    // Remove sensitive fields
    const userObj = updatedUser.toObject ? updatedUser.toObject() : updatedUser;
    delete userObj.password;
    delete userObj.loginAttempts;
    delete userObj.lockUntil;
    return userObj;
  }

  /**
   * Reset user password
   * @param {string} id - User ID
   * @param {string} newPassword - New password
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<object>}
   */
  async resetPassword(id, newPassword, tenantId = null) {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    if (!tenantId) {
      throw new Error('tenantId is required to reset password');
    }

    const user = await userRepository.findById(id, {
      tenantId: tenantId // Enforce tenant isolation
    });
    if (!user) {
      throw new Error('User not found');
    }

    // Update password (the pre-save middleware will hash it automatically)
    await userRepository.updatePassword(id, newPassword);
    return { message: 'Password reset successfully' };
  }

  /**
   * Get user activity data
   * @param {string} id - User ID
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<object>}
   */
  async getUserActivity(id, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get user activity');
    }
    const user = await userRepository.findById(id, {
      tenantId: tenantId,
      populate: [{ path: 'permissionHistory.changedBy', select: 'firstName lastName email' }]
    });
    
    if (!user) {
      throw new Error('User not found');
    }

    // Calculate online status (online if logged in within last 30 minutes)
    const isOnline = user.lastLogin && (Date.now() - user.lastLogin.getTime()) < 30 * 60 * 1000;

    return {
      userId: user._id,
      lastLogin: user.lastLogin,
      loginCount: user.loginCount,
      isOnline,
      isActive: user.isActive,
      loginHistory: user.loginHistory ? user.loginHistory.slice(0, 5) : [], // Last 5 logins
      permissionHistory: user.permissionHistory ? user.permissionHistory.slice(0, 10) : [] // Last 10 permission changes
    };
  }

  /**
   * Update permissions for all users with a specific role
   * @param {string} role - Role to update
   * @param {Array} permissions - New permissions
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<object>}
   */
  async updateRolePermissions(role, permissions, tenantId) {
    if (!role || !permissions) {
      throw new Error('Role and permissions are required');
    }
    if (!tenantId) {
      throw new Error('tenantId is required to update role permissions');
    }

    // Use BaseRepository's updateMany method
    const result = await userRepository.updateMany(
      { role: role, tenantId: tenantId },
      { $set: { permissions: permissions } }
    );

    return {
      message: `Updated ${result.modifiedCount} users with ${role} role`,
      modifiedCount: result.modifiedCount
    };
  }

  /**
   * Delete user
   * @param {string} id - User ID
   * @param {string} currentUserId - Current user ID (to prevent self-deletion)
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<object>}
   */
  async deleteUser(id, currentUserId, tenantId = null) {
    if (!tenantId) {
      throw new Error('tenantId is required to delete user');
    }
    
    // Prevent deleting own account
    if (id === currentUserId) {
      throw new Error('Cannot delete your own account');
    }

    const user = await userRepository.findById(id, {
      tenantId: tenantId // Enforce tenant isolation
    });
    if (!user) {
      throw new Error('User not found');
    }

    await userRepository.softDelete(id, {
      tenantId: tenantId
    });
    return { message: 'User deleted successfully' };
  }

  /**
   * Toggle user status
   * @param {string} id - User ID
   * @param {string} currentUserId - Current user ID (to prevent self-modification)
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<object>}
   */
  async toggleUserStatus(id, currentUserId, tenantId = null) {
    if (!tenantId) {
      throw new Error('tenantId is required to toggle user status');
    }
    
    // Prevent toggling own account status
    if (id === currentUserId) {
      throw new Error('Cannot modify your own account status');
    }

    const user = await userRepository.findById(id, {
      tenantId: tenantId // Enforce tenant isolation
    });
    if (!user) {
      throw new Error('User not found');
    }

    // Toggle status
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    await userRepository.updateById(id, { status: newStatus }, {
      tenantId: tenantId
    });

    const updatedUser = await userRepository.findById(id, {
      tenantId: tenantId
    });
    return {
      message: `User ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`,
      user: updatedUser.toSafeObject ? updatedUser.toSafeObject() : updatedUser
    };
  }
}

module.exports = new UserService();

