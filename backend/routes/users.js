const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { auth, requirePermission } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/auth/users
// @desc    Get all users
// @access  Private (Admin only)
router.get('/', auth, requirePermission('manage_users'), async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password -loginAttempts -lockUntil')
      .populate('permissionHistory.changedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: { users }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/auth/users/:id
// @desc    Get single user
// @access  Private (Admin only)
router.get('/:id', auth, requirePermission('manage_users'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -loginAttempts -lockUntil');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/auth/users/:id
// @desc    Update user
// @access  Private (Admin only)
router.put('/:id', [
  auth,
  requirePermission('manage_users'),
  body('firstName').optional().trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').optional().trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('role').optional().isIn(['admin', 'manager', 'cashier', 'inventory', 'viewer']).withMessage('Invalid role'),
  body('status').optional().isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { firstName, lastName, email, role, status, permissions } = req.body;
    
    // Check if user exists
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }
    
    // Store old data for tracking
    const oldData = {
      role: user.role,
      permissions: user.permissions
    };
    
    // Update user
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (status) updateData.status = status;
    if (permissions) updateData.permissions = permissions;
    
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -loginAttempts -lockUntil');
    
    // Track permission changes if role or permissions changed
    if (role && role !== oldData.role) {
      await updatedUser.trackPermissionChange(
        req.user,
        'role_changed',
        oldData,
        { role: updatedUser.role, permissions: updatedUser.permissions },
        `Role changed from ${oldData.role} to ${role}`
      );
    } else if (permissions && JSON.stringify(permissions) !== JSON.stringify(oldData.permissions)) {
      await updatedUser.trackPermissionChange(
        req.user,
        'permissions_modified',
        oldData,
        { role: updatedUser.role, permissions: updatedUser.permissions },
        'User permissions modified'
      );
    }
    
    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/auth/users/:id/reset-password
// @desc    Reset user password (Admin only)
// @access  Private (Admin only)
router.patch('/:id/reset-password', auth, requirePermission('manage_users'), async (req, res) => {
  try {
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update password (the pre-save middleware will hash it automatically)
    user.password = newPassword;
    await user.save();
    
    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/auth/users/:id/activity
// @desc    Get user activity data
// @access  Private (Admin only)
router.get('/:id/activity', auth, requirePermission('manage_users'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('lastLogin loginCount loginHistory permissionHistory isActive')
      .populate('permissionHistory.changedBy', 'firstName lastName email');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Calculate online status (online if logged in within last 30 minutes)
    const isOnline = user.lastLogin && (Date.now() - user.lastLogin.getTime()) < 30 * 60 * 1000;
    
    res.json({
      success: true,
      data: {
        userId: user._id,
        lastLogin: user.lastLogin,
        loginCount: user.loginCount,
        isOnline,
        isActive: user.isActive,
        loginHistory: user.loginHistory.slice(0, 5), // Last 5 logins
        permissionHistory: user.permissionHistory.slice(0, 10) // Last 10 permission changes
      }
    });
  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/auth/users/update-role-permissions
// @desc    Update permissions for all users with a specific role
// @access  Private (Admin only)
router.patch('/update-role-permissions', auth, requirePermission('manage_users'), async (req, res) => {
  try {
    const { role, permissions } = req.body;
    
    if (!role || !permissions) {
      return res.status(400).json({ message: 'Role and permissions are required' });
    }
    
        // Update all users with the specified role
        const result = await User.updateMany(
          { role: role },
          { $set: { permissions: permissions } }
        );
    
    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} users with ${role} role`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Update role permissions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/auth/users/:id
// @desc    Delete user
// @access  Private (Admin only)
router.delete('/:id', auth, requirePermission('manage_users'), async (req, res) => {
  try {
    // Prevent deleting own account
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    await User.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/auth/users/:id/toggle-status
// @desc    Toggle user status
// @access  Private (Admin only)
router.patch('/:id/toggle-status', auth, requirePermission('manage_users'), async (req, res) => {
  try {
    // Prevent toggling own account status
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ message: 'Cannot modify your own account status' });
    }
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Toggle status
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    user.status = newStatus;
    await user.save();
    
    res.json({
      success: true,
      message: `User ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`,
      data: { user: user.toSafeObject() }
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
