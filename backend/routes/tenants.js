const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, requireRole } = require('../middleware/auth');
const tenantService = require('../services/tenantService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @route   GET /api/tenants
 * @desc    Get all tenants (Super Admin only)
 * @access  Private (Super Admin only)
 */
router.get('/', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { page, limit, status } = req.query;
    
    const result = await tenantService.getAllTenants({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Get tenants error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/tenants/:id
 * @desc    Get tenant by ID
 * @access  Private (Super Admin or Admin for own tenant)
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const tenant = await tenantService.getTenantById(req.params.id, req.user);
    
    res.json({
      success: true,
      data: { tenant }
    });
  } catch (error) {
    if (error.message.includes('Access denied')) {
      return res.status(403).json({ message: error.message });
    }
    logger.error('Get tenant error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   PUT /api/tenants/:id
 * @desc    Update tenant
 * @access  Private (Super Admin or Admin for own tenant)
 */
router.put('/:id', [
  auth,
  body('name').optional().trim(),
  body('businessName').optional().trim(),
  body('businessType').optional().isIn(['retail', 'wholesale', 'manufacturing', 'service', 'other']),
  body('email').optional().isEmail(),
  body('phone').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const tenant = await tenantService.updateTenant(
      req.params.id,
      req.body,
      req.user
    );
    
    res.json({
      success: true,
      message: 'Tenant updated successfully',
      data: { tenant }
    });
  } catch (error) {
    if (error.message.includes('Access denied')) {
      return res.status(403).json({ message: error.message });
    }
    logger.error('Update tenant error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   PATCH /api/tenants/:id/status
 * @desc    Suspend/Activate tenant (Super Admin only)
 * @access  Private (Super Admin only)
 */
router.patch('/:id/status', [
  auth,
  requireRole('super_admin'),
  body('status').isIn(['active', 'suspended', 'inactive']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { status } = req.body;
    const tenant = await tenantService.setTenantStatus(
      req.params.id,
      status,
      req.user
    );
    
    res.json({
      success: true,
      message: `Tenant ${status === 'active' ? 'activated' : 'suspended'} successfully`,
      data: { tenant }
    });
  } catch (error) {
    if (error.message.includes('Only Super Admin')) {
      return res.status(403).json({ message: error.message });
    }
    logger.error('Set tenant status error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
