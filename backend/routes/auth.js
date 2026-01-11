const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const authService = require('../services/authService');
const userRepository = require('../repositories/UserRepository');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Private (Admin only)
router.post('/register', [
  auth,
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['super_admin', 'admin', 'manager', 'cashier', 'inventory', 'viewer']).withMessage('Invalid role'),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    // Check if user has permission to create users
    if (!req.user.hasPermission('manage_users')) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const userData = req.body;
    
    // Only super_admin can create other super_admin users
    if (userData.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ 
        message: 'Access denied. Only super administrators can create super admin users.' 
      });
    }
    
    // Call service to register user
    const result = await authService.register(userData, req.user);
    
    res.status(201).json(result);
  } catch (error) {
    // Handle duplicate email error
    if (error.message === 'User already exists' || error.code === 11000) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    logger.error('❌ Registration error:', { error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    } });
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').exists().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { email, password } = req.body;
    
    // Get IP address and user agent
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
    const userAgent = req.get('User-Agent');
    
    // Call service to login user
    const result = await authService.login(email, password, ipAddress, userAgent);
    
    // Set HTTP-only cookie for secure token storage
    res.cookie('token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
      sameSite: 'strict', // CSRF protection
      maxAge: 8 * 60 * 60 * 1000, // 8 hours in milliseconds
      path: '/'
    });
    
    // Also return token in response for backward compatibility (can be removed later)
    res.json({
      message: result.message,
      token: result.token,
      user: result.user
    });
  } catch (error) {
    // Handle specific error cases
    if (error.message === 'Invalid credentials') {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    if (error.message.includes('locked')) {
      return res.status(423).json({ 
        message: 'Account is temporarily locked due to too many failed login attempts' 
      });
    }
    if (error.message.includes('JWT_SECRET')) {
      return res.status(500).json({ 
        message: 'Server configuration error: JWT_SECRET is missing' 
      });
    }
    
    logger.error('❌ Login error:', { error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    } });
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await authService.getCurrentUser(req.user._id);
    res.json({ user });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ message: 'User not found' });
    }
    logger.error('Get user error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', [
  auth,
  body('firstName').optional().trim().isLength({ min: 1 }),
  body('lastName').optional().trim().isLength({ min: 1 }),
  body('phone').optional().trim(),
  body('department').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const updateData = req.body;
    
    // Call service to update profile
    const result = await authService.updateProfile(req.user._id, updateData);
    
    res.json(result);
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ message: 'User not found' });
    }
    logger.error('Profile update error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', [
  auth,
  body('currentPassword').exists().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { currentPassword, newPassword } = req.body;
    
    // Call service to change password
    const result = await authService.changePassword(req.user._id, currentPassword, newPassword);
    
    res.json(result);
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ message: 'User not found' });
    }
    if (error.message === 'Current password is incorrect') {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    logger.error('Password change error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (clear HTTP-only cookie)
// @access  Private
router.post('/logout', auth, async (req, res) => {
  try {
    // Clear the HTTP-only cookie
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });
    
    res.json({ message: 'Logout successful' });
  } catch (error) {
    logger.error('Logout error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/create-superadmin
// @desc    Create the first super admin user (only if no super admin exists)
// @access  Public (for initial setup only)
router.post('/create-superadmin', [
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('tenantId').optional().isMongoId().withMessage('Valid tenant ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if any super admin already exists
    const existingSuperAdmin = await userRepository.findOne({ role: 'super_admin' });
    if (existingSuperAdmin) {
      return res.status(403).json({ 
        message: 'Super admin already exists. Only one super admin can be created via this endpoint.' 
      });
    }

    const { firstName, lastName, email, password, tenantId } = req.body;

    // Check if email already exists
    const emailExists = await userRepository.findByEmail(email);
    if (emailExists) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // If tenantId is not provided, create a default tenant or use a system tenant
    // For now, we'll require tenantId or use a default
    let finalTenantId = tenantId;
    if (!finalTenantId) {
      // Create a default system tenant ID - in production, you'd want to create a Tenant model
      // For now, we'll use a fixed ObjectId or require it
      return res.status(400).json({ 
        message: 'tenantId is required for super admin creation' 
      });
    }

    // Validate tenantId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(finalTenantId)) {
      return res.status(400).json({ message: 'Invalid tenantId format' });
    }

    // Create super admin user
    const userData = {
      tenantId: new mongoose.Types.ObjectId(finalTenantId),
      firstName,
      lastName,
      email,
      password,
      role: 'super_admin',
      status: 'active',
      permissions: [] // Super admin doesn't need permissions array
    };

    const result = await authService.register(userData, null); // No creator for initial super admin

    logger.info('✅ Super admin created successfully:', { email: result.user.email });

    res.status(201).json({
      ...result,
      message: 'Super admin created successfully'
    });
  } catch (error) {
    // Handle duplicate email error
    if (error.message === 'User already exists' || error.code === 11000) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    logger.error('❌ Superadmin creation error:', { error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    } });
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
