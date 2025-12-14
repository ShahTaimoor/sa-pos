const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const ProductVariant = require('../models/ProductVariant');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const { auth, requirePermission } = require('../middleware/auth');

// @route   GET /api/product-variants
// @desc    Get all product variants with filters
// @access  Private
router.get('/', [
  auth,
  requirePermission('view_products'),
  query('baseProduct').optional().isMongoId(),
  query('variantType').optional().isIn(['color', 'warranty', 'size', 'finish', 'custom']),
  query('status').optional().isIn(['active', 'inactive', 'discontinued']),
  query('search').optional().isString().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { baseProduct, variantType, status, search } = req.query;
    const filter = {};

    if (baseProduct) filter.baseProduct = baseProduct;
    if (variantType) filter.variantType = variantType;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { variantName: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } },
        { variantValue: { $regex: search, $options: 'i' } }
      ];
    }

    const variants = await ProductVariant.find(filter)
      .populate('baseProduct', 'name description pricing')
      .populate('createdBy', 'firstName lastName')
      .populate('lastModifiedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: variants.length,
      variants
    });
  } catch (error) {
    console.error('Error fetching product variants:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/product-variants/:id
// @desc    Get single product variant
// @access  Private
router.get('/:id', [
  auth,
  requirePermission('view_products'),
  param('id').isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const variant = await ProductVariant.findById(req.params.id)
      .populate('baseProduct', 'name description pricing inventory')
      .populate('createdBy', 'firstName lastName')
      .populate('lastModifiedBy', 'firstName lastName');

    if (!variant) {
      return res.status(404).json({ message: 'Product variant not found' });
    }

    res.json({
      success: true,
      variant
    });
  } catch (error) {
    console.error('Error fetching product variant:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/product-variants
// @desc    Create new product variant
// @access  Private
router.post('/', [
  auth,
  requirePermission('create_products'),
  body('baseProduct').isMongoId().withMessage('Valid base product ID is required'),
  body('variantName').trim().isLength({ min: 1, max: 200 }).withMessage('Variant name is required'),
  body('variantType').isIn(['color', 'warranty', 'size', 'finish', 'custom']).withMessage('Valid variant type is required'),
  body('variantValue').trim().isLength({ min: 1 }).withMessage('Variant value is required'),
  body('displayName').trim().isLength({ min: 1, max: 200 }).withMessage('Display name is required'),
  body('pricing.cost').isFloat({ min: 0 }).withMessage('Valid cost is required'),
  body('pricing.retail').isFloat({ min: 0 }).withMessage('Valid retail price is required'),
  body('pricing.wholesale').isFloat({ min: 0 }).withMessage('Valid wholesale price is required'),
  body('transformationCost').isFloat({ min: 0 }).withMessage('Valid transformation cost is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      baseProduct,
      variantName,
      variantType,
      variantValue,
      displayName,
      description,
      pricing,
      transformationCost,
      sku,
      inventory
    } = req.body;

    // Check if base product exists
    const baseProductDoc = await Product.findById(baseProduct);
    if (!baseProductDoc) {
      return res.status(404).json({ message: 'Base product not found' });
    }

    // Check if variant already exists
    const existingVariant = await ProductVariant.findOne({
      baseProduct,
      variantType,
      variantValue
    });

    if (existingVariant) {
      return res.status(400).json({ 
        message: 'Variant with this type and value already exists for this product' 
      });
    }

    // Create variant
    const variant = new ProductVariant({
      baseProduct,
      variantName,
      variantType,
      variantValue,
      displayName,
      description,
      pricing,
      transformationCost,
      sku,
      inventory: inventory || { currentStock: 0, minStock: 0 },
      createdBy: req.user._id,
      lastModifiedBy: req.user._id
    });

    await variant.save();

    // Create inventory record for variant
    const variantInventory = new Inventory({
      product: variant._id,
      currentStock: variant.inventory.currentStock || 0,
      reorderPoint: variant.inventory.minStock || 10,
      reorderQuantity: 50,
      status: 'active'
    });
    await variantInventory.save();

    const populatedVariant = await ProductVariant.findById(variant._id)
      .populate('baseProduct', 'name description pricing')
      .populate('createdBy', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'Product variant created successfully',
      variant: populatedVariant
    });
  } catch (error) {
    console.error('Error creating product variant:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/product-variants/:id
// @desc    Update product variant
// @access  Private
router.put('/:id', [
  auth,
  requirePermission('edit_products'),
  param('id').isMongoId(),
  body('variantName').optional().trim().isLength({ min: 1, max: 200 }),
  body('displayName').optional().trim().isLength({ min: 1, max: 200 }),
  body('pricing.cost').optional().isFloat({ min: 0 }),
  body('pricing.retail').optional().isFloat({ min: 0 }),
  body('pricing.wholesale').optional().isFloat({ min: 0 }),
  body('transformationCost').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const variant = await ProductVariant.findById(req.params.id);
    if (!variant) {
      return res.status(404).json({ message: 'Product variant not found' });
    }

    // Update fields
    const updateFields = ['variantName', 'displayName', 'description', 'pricing', 'transformationCost', 'sku', 'status'];
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        variant[field] = req.body[field];
      }
    });

    variant.lastModifiedBy = req.user._id;
    await variant.save();

    const updatedVariant = await ProductVariant.findById(variant._id)
      .populate('baseProduct', 'name description pricing')
      .populate('lastModifiedBy', 'firstName lastName');

    res.json({
      success: true,
      message: 'Product variant updated successfully',
      variant: updatedVariant
    });
  } catch (error) {
    console.error('Error updating product variant:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/product-variants/:id
// @desc    Delete product variant
// @access  Private
router.delete('/:id', [
  auth,
  requirePermission('delete_products'),
  param('id').isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const variant = await ProductVariant.findById(req.params.id);
    if (!variant) {
      return res.status(404).json({ message: 'Product variant not found' });
    }

    // Check if variant has stock
    if (variant.inventory.currentStock > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete variant with existing stock. Please adjust stock to zero first.' 
      });
    }

    // Delete inventory record
    await Inventory.findOneAndDelete({ product: variant._id });

    await ProductVariant.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Product variant deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product variant:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/product-variants/base-product/:productId
// @desc    Get all variants for a base product
// @access  Private
router.get('/base-product/:productId', [
  auth,
  requirePermission('view_products'),
  param('productId').isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const variants = await ProductVariant.find({ 
      baseProduct: req.params.productId,
      status: 'active'
    })
      .populate('baseProduct', 'name description pricing')
      .sort({ variantType: 1, variantValue: 1 });

    res.json({
      success: true,
      count: variants.length,
      variants
    });
  } catch (error) {
    console.error('Error fetching product variants:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;

