const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const cityService = require('../services/cityService');
const logger = require('../utils/logger');

// @route   GET /api/cities
// @desc    Get all cities with filtering and pagination
// @access  Private
router.get('/', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().trim().withMessage('Search must be a string'),
  query('isActive').optional().isIn(['true', 'false']).withMessage('isActive must be true or false'),
  query('state').optional().isString().trim().withMessage('State must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.tenantId || req.user?.tenantId;
    // Call service to get cities
    const result = await cityService.getCities(req.query, tenantId);
    
    res.json({
      success: true,
      data: {
        cities: result.cities,
        pagination: result.pagination
      }
    });
  } catch (error) {
    logger.error('Get cities error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/cities/active
// @desc    Get all active cities (for dropdowns)
// @access  Private
router.get('/active', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports')
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const cities = await cityService.getActiveCities(tenantId);
    res.json({
      success: true,
      data: cities
    });
  } catch (error) {
    logger.error('Get active cities error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/cities/:id
// @desc    Get city by ID
// @access  Private
router.get('/:id', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports')
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const city = await cityService.getCityById(req.params.id, tenantId);
    res.json({
      success: true,
      data: city
    });
  } catch (error) {
    logger.error('Get city error:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/cities
// @desc    Create new city
// @access  Private
router.post('/', [
  auth,
  tenantMiddleware,
  requirePermission('manage_users'),
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('City name is required and must be less than 100 characters'),
  body('state').optional().trim().isLength({ max: 100 }).withMessage('State must be less than 100 characters'),
  body('country').optional().trim().isLength({ max: 100 }).withMessage('Country must be less than 100 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.tenantId || req.user?.tenantId;
    // Call service to create city
    const result = await cityService.createCity(req.body, req.user._id, { tenantId });
    
    res.status(201).json({
      success: true,
      message: result.message,
      data: result.city
    });
  } catch (error) {
    logger.error('Create city error:', { error: error });
    if (error.message === 'City with this name already exists') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/cities/:id
// @desc    Update city
// @access  Private
router.put('/:id', [
  auth,
  tenantMiddleware,
  requirePermission('manage_users'),
  body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('City name must be less than 100 characters'),
  body('state').optional().trim().isLength({ max: 100 }).withMessage('State must be less than 100 characters'),
  body('country').optional().trim().isLength({ max: 100 }).withMessage('Country must be less than 100 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.tenantId || req.user?.tenantId;
    // Call service to update city
    const result = await cityService.updateCity(req.params.id, req.body, req.user._id, { tenantId });
    
    res.json({
      success: true,
      message: result.message,
      data: result.city
    });
  } catch (error) {
    logger.error('Update city error:', { error: error });
    if (error.message === 'City not found') {
      return res.status(404).json({
        success: false,
        message: 'City not found'
      });
    }
    if (error.message === 'City with this name already exists') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   DELETE /api/cities/:id
// @desc    Delete city
// @access  Private
router.delete('/:id', [
  auth,
  tenantMiddleware,
  requirePermission('manage_users')
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    // Call service to delete city
    const result = await cityService.deleteCity(req.params.id, { tenantId });
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    logger.error('Delete city error:', { error: error });
    if (error.message === 'City not found') {
      return res.status(404).json({
        success: false,
        message: 'City not found'
      });
    }
    if (error.message.includes('Cannot delete city')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

