const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const ProductVariant = require('../models/ProductVariant'); // Still needed for new ProductVariant()
const Product = require('../models/Product'); // Still needed for model reference
const Inventory = require('../models/Inventory'); // Still needed for new Inventory() and findOneAndDelete
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const productVariantRepository = require('../repositories/ProductVariantRepository');
const productRepository = require('../repositories/ProductRepository');
const inventoryRepository = require('../repositories/InventoryRepository');
const logger = require('../utils/logger');

// @route   GET /api/product-variants
// @desc    Get all product variants with filters
// @access  Private
router.get('/', [
  auth,
  tenantMiddleware,
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
    const tenantId = req.tenantId || req.user?.tenantId;
    const filter = {};
    
    // Add tenant filter for multi-tenant isolation
    if (tenantId) {
      filter.tenantId = tenantId;
    }

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

    const variants = await productVariantRepository.findWithFilter(filter, {
      sort: { createdAt: -1 },
      populate: [
        { path: 'baseProduct', select: 'name description pricing' },
        { path: 'createdBy', select: 'firstName lastName' },
        { path: 'lastModifiedBy', select: 'firstName lastName' }
      ]
    });

    res.json({
      success: true,
      count: variants.length,
      variants
    });
  } catch (error) {
    logger.error('Error fetching product variants:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/product-variants/:id
// @desc    Get single product variant
// @access  Private
router.get('/:id', [
  auth,
  tenantMiddleware,
  requirePermission('view_products'),
  param('id').isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.tenantId || req.user?.tenantId;
    
    // Build query with tenant filter
    const query = { _id: req.params.id };
    if (tenantId) {
      query.tenantId = tenantId;
    }
    
    const variant = await productVariantRepository.findOne(query, {
      populate: [
        { path: 'baseProduct', select: 'name description pricing inventory' },
        { path: 'createdBy', select: 'firstName lastName' },
        { path: 'lastModifiedBy', select: 'firstName lastName' }
      ]
    });

    if (!variant) {
      return res.status(404).json({ message: 'Product variant not found' });
    }

    res.json({
      success: true,
      variant
    });
  } catch (error) {
    logger.error('Error fetching product variant:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/product-variants
// @desc    Create new product variant
// @access  Private
router.post('/', [
  auth,
  tenantMiddleware,
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

    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    // Check if base product exists
    const baseProductDoc = await productRepository.findById(baseProduct, { tenantId });
    if (!baseProductDoc) {
      return res.status(404).json({ message: 'Base product not found' });
    }
    
    // Check if variant already exists
    const variantCheckQuery = {
      baseProduct,
      variantType,
      variantValue
    };
    
    // Add tenant filter for multi-tenant isolation
    if (tenantId) {
      variantCheckQuery.tenantId = tenantId;
    }
    
    const existingVariant = await productVariantRepository.findOne(variantCheckQuery);

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
      lastModifiedBy: req.user._id,
      tenantId
    });

    await variant.save();

    // Create inventory record for variant
    const variantInventory = new Inventory({
      product: variant._id,
      currentStock: variant.inventory.currentStock || 0,
      reorderPoint: variant.inventory.minStock || 10,
      reorderQuantity: 50,
      status: 'active',
      tenantId
    });
    await variantInventory.save();

    const populatedVariant = await productVariantRepository.findById(variant._id, { tenantId }, {
      populate: [
        { path: 'baseProduct', select: 'name description pricing' },
        { path: 'createdBy', select: 'firstName lastName' }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Product variant created successfully',
      variant: populatedVariant
    });
  } catch (error) {
    logger.error('Error creating product variant:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/product-variants/:id
// @desc    Update product variant
// @access  Private
router.put('/:id', [
  auth,
  tenantMiddleware,
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

    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const variant = await productVariantRepository.findById(req.params.id, { tenantId });
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

    const updatedVariant = await productVariantRepository.findById(variant._id, { tenantId }, { tenantId }, {
      populate: [
        { path: 'baseProduct', select: 'name description pricing' },
        { path: 'lastModifiedBy', select: 'firstName lastName' }
      ]
    });

    res.json({
      success: true,
      message: 'Product variant updated successfully',
      variant: updatedVariant
    });
  } catch (error) {
    logger.error('Error updating product variant:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/product-variants/:id
// @desc    Delete product variant
// @access  Private
router.delete('/:id', [
  auth,
  tenantMiddleware,
  requirePermission('delete_products'),
  param('id').isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const variant = await productVariantRepository.findById(req.params.id, { tenantId });
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
    const inventoryRecord = await inventoryRepository.findOne({ product: variant._id, tenantId });
    if (inventoryRecord) {
      await inventoryRepository.hardDelete(inventoryRecord._id);
    }

    await productVariantRepository.hardDelete(req.params.id);

    res.json({
      success: true,
      message: 'Product variant deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting product variant:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/product-variants/base-product/:productId
// @desc    Get all variants for a base product
// @access  Private
router.get('/base-product/:productId', [
  auth,
  tenantMiddleware,
  requirePermission('view_products'),
  param('productId').isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.tenantId || req.user?.tenantId;
    
    // Build filter with tenant
    const filter = { baseProduct: req.params.productId };
    if (tenantId) {
      filter.tenantId = tenantId;
    }
    
    const variants = await productVariantRepository.findWithFilter(filter, {
      sort: { variantType: 1, variantValue: 1 },
      populate: [
        { path: 'baseProduct', select: 'name description pricing' }
      ]
    });

    res.json({
      success: true,
      count: variants.length,
      variants
    });
  } catch (error) {
    logger.error('Error fetching product variants:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;

