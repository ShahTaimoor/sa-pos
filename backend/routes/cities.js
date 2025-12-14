const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const City = require('../models/City');

// @route   GET /api/cities
// @desc    Get all cities with filtering and pagination
// @access  Private
router.get('/', [
  auth,
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

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};

    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { state: { $regex: req.query.search, $options: 'i' } },
        { country: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true';
    }

    if (req.query.state) {
      filter.state = { $regex: req.query.state, $options: 'i' };
    }

    // Get cities with pagination
    const cities = await City.find(filter)
      .populate('createdBy', 'firstName lastName')
      .populate('updatedBy', 'firstName lastName')
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const total = await City.countDocuments(filter);

    res.json({
      success: true,
      data: {
        cities,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get cities error:', error);
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
  requirePermission('view_reports')
], async (req, res) => {
  try {
    const cities = await City.find({ isActive: true })
      .sort({ name: 1 })
      .select('name state country');

    res.json({
      success: true,
      data: cities
    });
  } catch (error) {
    console.error('Get active cities error:', error);
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
  requirePermission('view_reports')
], async (req, res) => {
  try {
    const city = await City.findById(req.params.id)
      .populate('createdBy', 'firstName lastName')
      .populate('updatedBy', 'firstName lastName');

    if (!city) {
      return res.status(404).json({
        success: false,
        message: 'City not found'
      });
    }

    res.json({
      success: true,
      data: city
    });
  } catch (error) {
    console.error('Get city error:', error);
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

    const { name, state, country = 'US', description, isActive = true } = req.body;

    // Check if city already exists
    const existingCity = await City.findOne({ name: name.trim() });
    if (existingCity) {
      return res.status(400).json({
        success: false,
        message: 'City with this name already exists'
      });
    }

    const city = new City({
      name: name.trim(),
      state: state ? state.trim() : undefined,
      country: country.trim(),
      description: description ? description.trim() : undefined,
      isActive,
      createdBy: req.user._id
    });

    await city.save();

    await city.populate('createdBy', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'City created successfully',
      data: city
    });
  } catch (error) {
    console.error('Create city error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'City with this name already exists'
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

    const { name, state, country, description, isActive } = req.body;

    const city = await City.findById(req.params.id);
    if (!city) {
      return res.status(404).json({
        success: false,
        message: 'City not found'
      });
    }

    // Check if name is being changed and if new name already exists
    if (name && name.trim() !== city.name) {
      const existingCity = await City.findOne({ name: name.trim() });
      if (existingCity) {
        return res.status(400).json({
          success: false,
          message: 'City with this name already exists'
        });
      }
      city.name = name.trim();
    }

    if (state !== undefined) city.state = state ? state.trim() : undefined;
    if (country !== undefined) city.country = country.trim();
    if (description !== undefined) city.description = description ? description.trim() : undefined;
    if (isActive !== undefined) city.isActive = isActive;
    city.updatedBy = req.user._id;

    await city.save();

    await city.populate([
      { path: 'createdBy', select: 'firstName lastName' },
      { path: 'updatedBy', select: 'firstName lastName' }
    ]);

    res.json({
      success: true,
      message: 'City updated successfully',
      data: city
    });
  } catch (error) {
    console.error('Update city error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'City with this name already exists'
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
  requirePermission('manage_users')
], async (req, res) => {
  try {
    const city = await City.findById(req.params.id);
    if (!city) {
      return res.status(404).json({
        success: false,
        message: 'City not found'
      });
    }

    // Check if city is being used by customers or suppliers
    const Customer = require('../models/Customer');
    const Supplier = require('../models/Supplier');
    
    const customersUsingCity = await Customer.findOne({
      'addresses.city': city.name
    });

    const suppliersUsingCity = await Supplier.findOne({
      'addresses.city': city.name
    });

    if (customersUsingCity || suppliersUsingCity) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete city. It is being used by customers or suppliers. Deactivate it instead.'
      });
    }

    await City.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'City deleted successfully'
    });
  } catch (error) {
    console.error('Delete city error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

