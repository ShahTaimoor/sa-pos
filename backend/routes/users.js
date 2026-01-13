const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const userService = require('../services/userService');
const logger = require('../utils/logger');

const router = express.Router();

// @route   GET /api/auth/users
// @desc    Get all users (tenant-scoped)
// @access  Private (Admin only)
router.get('/', auth, tenantMiddleware, requirePermission('manage_users'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    
    const users = await userService.getUsers({}, tenantId);
    
    res.json({
      success: true,
      data: { users }
    });
  } catch (error) {
    logger.error('Get users error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/auth/users/:id
// @desc    Get single user (tenant-scoped)
// @access  Private (Admin only)
router.get('/:id', auth, tenantMiddleware, requirePermission('manage_users'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    
    const user = await userService.getUserById(req.params.id, tenantId);
    
    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ message: 'User not found' });
    }
    logger.error('Get user error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/auth/users/:id
// @desc    Update user
// @access  Private (Admin only)
router.put('/:id', [
  auth,
  tenantMiddleware, // CRITICAL: Enforce tenant isolation
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
    
    const updateData = {};
    const { firstName, lastName, email, role, status, permissions } = req.body;
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (status) updateData.status = status;
    if (permissions) updateData.permissions = permissions;
    
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    
    const updatedUser = await userService.updateUser(req.params.id, updateData, req.user, tenantId);
    
    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ message: 'User not found' });
    }
    if (error.message === 'Email already exists') {
      return res.status(400).json({ message: 'Email already exists' });
    }
    logger.error('Update user error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/auth/users/:id/reset-password
// @desc    Reset user password (Admin only)
// @access  Private (Admin only)
router.patch('/:id/reset-password', auth, tenantMiddleware, requirePermission('manage_users'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    
    const { newPassword } = req.body;
    const result = await userService.resetPassword(req.params.id, newPassword, tenantId);
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ message: 'User not found' });
    }
    if (error.message.includes('Password must be at least')) {
      return res.status(400).json({ message: error.message });
    }
    logger.error('❌ Reset password error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/auth/users/:id/activity
// @desc    Get user activity data
// @access  Private (Admin only)
router.get('/:id/activity', auth, tenantMiddleware, requirePermission('manage_users'), async (req, res) => {
  try {
    const activity = await userService.getUserActivity(req.params.id);
    
    res.json({
      success: true,
      data: activity
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ message: 'User not found' });
    }
    logger.error('Get user activity error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/auth/users/update-role-permissions
// @desc    Update permissions for all users with a specific role
// @access  Private (Admin only)
router.patch('/update-role-permissions', auth, tenantMiddleware, requirePermission('manage_users'), async (req, res) => {
  try {
    const { role, permissions } = req.body;
    const result = await userService.updateRolePermissions(role, permissions);
    
    res.json({
      success: true,
      message: result.message,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    if (error.message === 'Role and permissions are required') {
      return res.status(400).json({ message: error.message });
    }
    logger.error('Update role permissions error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/auth/users/:id
// @desc    Delete user
// @access  Private (Admin only)
router.delete('/:id', auth, tenantMiddleware, requirePermission('manage_users'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    
    const result = await userService.deleteUser(req.params.id, req.user.userId || req.user._id, tenantId);
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ message: 'User not found' });
    }
    if (error.message === 'Cannot delete your own account') {
      return res.status(400).json({ message: error.message });
    }
    logger.error('Delete user error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/auth/users/:id/toggle-status
// @desc    Toggle user status
// @access  Private (Admin only)
router.patch('/:id/toggle-status', auth, tenantMiddleware, requirePermission('manage_users'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    
    const result = await userService.toggleUserStatus(req.params.id, req.user.userId || req.user._id, tenantId);
    
    res.json({
      success: true,
      message: result.message,
      data: { user: result.user }
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ message: 'User not found' });
    }
    if (error.message === 'Cannot modify your own account status') {
      return res.status(400).json({ message: error.message });
    }
    logger.error('Toggle user status error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
