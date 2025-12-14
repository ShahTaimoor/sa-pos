const express = require('express');
const { body, param, query } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { handleValidationErrors, sanitizeRequest } = require('../middleware/validation');
const Category = require('../models/Category');

const router = express.Router();

// @route   GET /api/categories
// @desc    Get list of categories
// @access  Private (requires 'view_products' permission)
router.get('/', [
  auth,
  requirePermission('view_products'),
  sanitizeRequest,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('isActive').optional().isBoolean(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      isActive = true
    } = req.query;

    const skip = (page - 1) * limit;
    const filter = {};

    // Apply filters
    if (isActive !== undefined) filter.isActive = isActive;

    // Search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const categories = await Category.find(filter)
      .populate('parentCategory', 'name')
      .sort({ sortOrder: 1, name: 1 })
      .skip(skip)
      .limit(limit);

    const total = await Category.countDocuments(filter);

    res.json({
      categories,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Server error fetching categories', error: error.message });
  }
});

// @route   GET /api/categories/tree
// @desc    Get category tree structure
// @access  Private (requires 'view_products' permission)
router.get('/tree', [
  auth,
  requirePermission('view_products'),
  sanitizeRequest,
], async (req, res) => {
  try {
    const categoryTree = await Category.getCategoryTree();
    res.json(categoryTree);
  } catch (error) {
    console.error('Error fetching category tree:', error);
    res.status(500).json({ message: 'Server error fetching category tree', error: error.message });
  }
});

// @route   GET /api/categories/:categoryId
// @desc    Get detailed category information
// @access  Private (requires 'view_products' permission)
router.get('/:categoryId', [
  auth,
  requirePermission('view_products'),
  sanitizeRequest,
  param('categoryId').isMongoId().withMessage('Valid Category ID is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { categoryId } = req.params;
    
    const category = await Category.findById(categoryId)
      .populate('parentCategory', 'name')
      .populate('subcategories', 'name description');

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json(category);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ message: 'Server error fetching category', error: error.message });
  }
});

// @route   POST /api/categories
// @desc    Create a new category
// @access  Private (requires 'manage_products' permission)
router.post('/', [
  auth,
  requirePermission('manage_products'),
  sanitizeRequest,
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required and must be 1-100 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
  body('parentCategory').optional().isMongoId().withMessage('Valid parent category ID is required'),
  body('sortOrder').optional().isInt({ min: 0 }).withMessage('Sort order must be a non-negative integer'),
  body('isActive').optional().isBoolean().withMessage('Active status must be a boolean'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const categoryData = {
      ...req.body,
      createdBy: req.user._id
    };

    const category = new Category(categoryData);
    await category.save();

    res.status(201).json({
      message: 'Category created successfully',
      category
    });
  } catch (error) {
    console.error('Error creating category:', error);
    if (error.message === 'Category name already exists') {
      res.status(400).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Server error creating category', error: error.message });
    }
  }
});

// @route   PUT /api/categories/:categoryId
// @desc    Update category
// @access  Private (requires 'manage_products' permission)
router.put('/:categoryId', [
  auth,
  requirePermission('manage_products'),
  sanitizeRequest,
  param('categoryId').isMongoId().withMessage('Valid Category ID is required'),
  body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
  body('parentCategory').optional().isMongoId().withMessage('Valid parent category ID is required'),
  body('sortOrder').optional().isInt({ min: 0 }).withMessage('Sort order must be a non-negative integer'),
  body('isActive').optional().isBoolean().withMessage('Active status must be a boolean'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { categoryId } = req.params;
    
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Update category
    Object.assign(category, req.body);
    await category.save();

    res.json({
      message: 'Category updated successfully',
      category
    });
  } catch (error) {
    console.error('Error updating category:', error);
    if (error.message === 'Category name already exists') {
      res.status(400).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Server error updating category', error: error.message });
    }
  }
});

// @route   DELETE /api/categories/:categoryId
// @desc    Delete category
// @access  Private (requires 'manage_products' permission)
router.delete('/:categoryId', [
  auth,
  requirePermission('manage_products'),
  sanitizeRequest,
  param('categoryId').isMongoId().withMessage('Valid Category ID is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { categoryId } = req.params;
    
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if category has products
    const Product = require('../models/Product');
    const productCount = await Product.countDocuments({ category: categoryId });
    
    if (productCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category. It has ${productCount} associated products.` 
      });
    }

    // Check if category has subcategories
    const subcategoryCount = await Category.countDocuments({ parentCategory: categoryId });
    
    if (subcategoryCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category. It has ${subcategoryCount} subcategories.` 
      });
    }

    await Category.findByIdAndDelete(categoryId);

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ message: 'Server error deleting category', error: error.message });
  }
});

// @route   GET /api/categories/stats
// @desc    Get category statistics
// @access  Private (requires 'view_products' permission)
router.get('/stats', [
  auth,
  requirePermission('view_products'),
  sanitizeRequest,
], async (req, res) => {
  try {
    const stats = await Category.aggregate([
      {
        $group: {
          _id: null,
          totalCategories: { $sum: 1 },
          activeCategories: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          inactiveCategories: {
            $sum: { $cond: ['$isActive', 0, 1] }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalCategories: 0,
      activeCategories: 0,
      inactiveCategories: 0
    };

    res.json(result);
  } catch (error) {
    console.error('Error fetching category stats:', error);
    res.status(500).json({ message: 'Server error fetching category stats', error: error.message });
  }
});

module.exports = router;
