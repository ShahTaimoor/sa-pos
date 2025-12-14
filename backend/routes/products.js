const express = require('express');
const { body, validationResult, query } = require('express-validator');
const multer = require('multer');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');
const { auth, requirePermission } = require('../middleware/auth');
const { sanitizeRequest, handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// @route   GET /api/products
// @desc    Get all products with filtering and pagination
// @access  Private
router.get('/', [
  sanitizeRequest,
  auth,
  query('page').optional({ checkFalsy: true }).isInt({ min: 1 }),
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 10000 }),
  query('search').optional({ checkFalsy: true }).trim(),
  query('category').optional({ checkFalsy: true }).isMongoId(),
  query('categories').optional({ checkFalsy: true }).custom((value) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed);
      } catch {
        return false;
      }
    }
    return true;
  }),
  query('status').optional({ checkFalsy: true }).isIn(['active', 'inactive', 'discontinued']),
  query('statuses').optional({ checkFalsy: true }).custom((value) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed);
      } catch {
        return false;
      }
    }
    return true;
  }),
  query('lowStock').optional({ checkFalsy: true }).isBoolean(),
  query('stockStatus').optional({ checkFalsy: true }).isIn(['lowStock', 'outOfStock', 'inStock']),
  query('minPrice').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  query('maxPrice').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  query('priceField').optional({ checkFalsy: true }).isIn(['retail', 'wholesale', 'cost']),
  query('minStock').optional({ checkFalsy: true }).isInt({ min: 0 }),
  query('maxStock').optional({ checkFalsy: true }).isInt({ min: 0 }),
  query('dateFrom').optional({ checkFalsy: true }).isISO8601(),
  query('dateTo').optional({ checkFalsy: true }).isISO8601(),
  query('dateField').optional({ checkFalsy: true }).isIn(['createdAt', 'updatedAt']),
  query('brand').optional({ checkFalsy: true }).trim(),
  query('searchFields').optional({ checkFalsy: true }).custom((value) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed);
      } catch {
        return false;
      }
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => err.msg || `${err.param}: ${err.msg}`);
      return res.status(400).json({ 
        message: 'Invalid request. Please check your input.',
        errors: errors.array(),
        details: errorMessages
      });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Build filter
    const filter = {};
    
    // Multi-field search
    if (req.query.search) {
      const searchTerm = req.query.search;
      let searchFields = ['name', 'description'];
      
      // Parse custom search fields if provided
      if (req.query.searchFields) {
        try {
          searchFields = JSON.parse(req.query.searchFields);
        } catch (e) {
          // Use default fields
        }
      }
      
      // Build $or query for multiple fields
      const searchConditions = [];
      searchFields.forEach(field => {
        if (field === 'sku' || field === 'barcode') {
          // Exact match for SKU/barcode
          searchConditions.push({ [field]: { $regex: `^${searchTerm}$`, $options: 'i' } });
        } else {
          // Partial match for other fields
          searchConditions.push({ [field]: { $regex: searchTerm, $options: 'i' } });
        }
      });
      
      if (searchConditions.length > 0) {
        filter.$or = searchConditions;
    }
    }
    
    // Category filter (single or multiple)
    if (req.query.category) {
      filter.category = req.query.category;
    } else if (req.query.categories) {
      try {
        const categories = JSON.parse(req.query.categories);
        if (Array.isArray(categories) && categories.length > 0) {
          filter.category = { $in: categories };
        }
      } catch (e) {
        // Invalid format, ignore
      }
    }
    
    // Status filter (single or multiple)
    if (req.query.status) {
      filter.status = req.query.status;
    } else if (req.query.statuses) {
      try {
        const statuses = JSON.parse(req.query.statuses);
        if (Array.isArray(statuses) && statuses.length > 0) {
          filter.status = { $in: statuses };
        }
      } catch (e) {
        // Invalid format, ignore
      }
    }
    
    // Price range filter
    if (req.query.minPrice || req.query.maxPrice) {
      const priceField = req.query.priceField || 'retail';
      const pricePath = `pricing.${priceField}`;
      
      if (req.query.minPrice && req.query.maxPrice) {
        filter[pricePath] = {
          $gte: parseFloat(req.query.minPrice),
          $lte: parseFloat(req.query.maxPrice)
        };
      } else if (req.query.minPrice) {
        filter[pricePath] = { $gte: parseFloat(req.query.minPrice) };
      } else if (req.query.maxPrice) {
        filter[pricePath] = { $lte: parseFloat(req.query.maxPrice) };
      }
    }
    
    // Stock level filter
    if (req.query.minStock || req.query.maxStock) {
      if (req.query.minStock && req.query.maxStock) {
        filter['inventory.currentStock'] = {
          $gte: parseInt(req.query.minStock),
          $lte: parseInt(req.query.maxStock)
        };
      } else if (req.query.minStock) {
        filter['inventory.currentStock'] = { $gte: parseInt(req.query.minStock) };
      } else if (req.query.maxStock) {
        filter['inventory.currentStock'] = { $lte: parseInt(req.query.maxStock) };
      }
    }
    
    // Date range filter
    if (req.query.dateFrom || req.query.dateTo) {
      const dateField = req.query.dateField || 'createdAt';
      
      if (req.query.dateFrom && req.query.dateTo) {
        filter[dateField] = {
          $gte: new Date(req.query.dateFrom),
          $lte: new Date(req.query.dateTo)
        };
      } else if (req.query.dateFrom) {
        filter[dateField] = { $gte: new Date(req.query.dateFrom) };
      } else if (req.query.dateTo) {
        filter[dateField] = { $lte: new Date(req.query.dateTo) };
      }
    }
    
    // Brand filter
    if (req.query.brand) {
      filter.brand = { $regex: req.query.brand, $options: 'i' };
    }
    
    // Low stock filter
    if (req.query.lowStock === 'true') {
      filter.$expr = { $lte: ['$inventory.currentStock', '$inventory.reorderPoint'] };
    }

    // Stock status filter
    if (req.query.stockStatus) {
      switch (req.query.stockStatus) {
        case 'lowStock':
          filter.$expr = { $lte: ['$inventory.currentStock', '$inventory.reorderPoint'] };
          break;
        case 'outOfStock':
          filter['inventory.currentStock'] = 0;
          break;
        case 'inStock':
          filter['inventory.currentStock'] = { $gt: 0 };
          break;
      }
    }
    
    const products = await Product.find(filter)
      .populate('category', 'name')
      .populate('investors.investor', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Product.countDocuments(filter);
    
    res.json({
      products,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/products/:id
// @desc    Get single product
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name')
      .populate('investors.investor', 'name email');
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json({ product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/products
// @desc    Create new product
// @access  Private
router.post('/', [
  // Temporarily disable sanitization for debugging
  // sanitizeRequest,
  auth,
  requirePermission('create_products'),
  body('name').trim().isLength({ min: 1 }).withMessage('Product name is required'),
  body('pricing.cost').isFloat({ min: 0 }).withMessage('Cost must be a positive number'),
  body('pricing.retail').isFloat({ min: 0 }).withMessage('Retail price must be a positive number'),
  body('pricing.wholesale').isFloat({ min: 0 }).withMessage('Wholesale price must be a positive number')
], async (req, res) => {
  try {
    console.log('Product creation request body:', req.body);
    console.log('User ID:', req.user._id);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }
    
    const productData = {
      ...req.body,
      createdBy: req.user._id,
      lastModifiedBy: req.user._id
    };
    
    console.log('Product data to create:', productData);
    console.log('Product name being created:', productData.name);
    console.log('Product name length:', productData.name?.length);
    
    const product = new Product(productData);
    await product.save();
    
    // Automatically create inventory record for the new product
    try {
      console.log('Creating inventory record for product:', product.name);
      const Inventory = require('../models/Inventory');
      const inventoryRecord = new Inventory({
        product: product._id,
        currentStock: product.inventory?.currentStock || 0,
        reorderPoint: product.inventory?.reorderPoint || 10,
        reorderQuantity: product.inventory?.reorderQuantity || 50,
        status: 'active',
        location: {
          warehouse: 'Main Warehouse',
          aisle: 'A1',
          shelf: 'S1'
        },
        movements: [],
        createdBy: req.user._id
      });
      console.log('Inventory record data:', inventoryRecord);
      await inventoryRecord.save();
      console.log('Inventory record created successfully for product:', product.name);
    } catch (inventoryError) {
      console.error('Error creating inventory record:', inventoryError);
      console.error('Inventory error details:', {
        name: inventoryError.name,
        message: inventoryError.message,
        code: inventoryError.code
      });
      // Don't fail the product creation if inventory creation fails
    }
    
    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Create product error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    
    if (error.code === 11000) {
      console.log('Duplicate key error detected:', {
        attemptedName: req.body.name,
        errorMessage: error.message,
        errorKeyPattern: error.keyPattern,
        errorKeyValue: error.keyValue
      });
      
      // Try to find the existing product to provide more details
      try {
        const existingProduct = await Product.findOne({ name: req.body.name });
        console.log('Found existing product:', existingProduct);
      } catch (findError) {
        console.log('Could not find existing product:', findError);
      }
      
      return res.status(400).json({ 
        message: 'A product with this name already exists. Please choose a different name.',
        code: 'DUPLICATE_PRODUCT_NAME',
        attemptedName: req.body.name
      });
    }
    
    res.status(500).json({ 
      message: 'Server error creating product',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   PUT /api/products/:id
// @desc    Update product
// @access  Private
router.put('/:id', [
  auth,
  requirePermission('edit_products'),
  body('name').optional().trim().isLength({ min: 1 }),
  body('pricing.cost').optional().isFloat({ min: 0 }),
  body('pricing.retail').optional().isFloat({ min: 0 }),
  body('pricing.wholesale').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const updateData = {
      ...req.body,
      lastModifiedBy: req.user._id
    };
    
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Update product error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'A product with this name already exists. Please choose a different name.',
        code: 'DUPLICATE_PRODUCT_NAME' 
      });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/products/:id
// @desc    Delete product
// @access  Private
router.delete('/:id', [
  auth,
  requirePermission('delete_products')
], async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/products/search/:query
// @desc    Search products by name
// @access  Private
router.get('/search/:query', auth, async (req, res) => {
  try {
    const query = req.params.query;
    
    const products = await Product.find({
      name: { $regex: query, $options: 'i' },
      status: 'active'
    })
    .select('name pricing inventory status')
    .limit(10);
    
    res.json({ products });
  } catch (error) {
    console.error('Search products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/products/bulk
// @desc    Bulk update products
// @access  Private
router.put('/bulk', [
  auth,
  requirePermission('update_products'),
  body('productIds').isArray().withMessage('Product IDs array is required'),
  body('updates').isObject().withMessage('Updates object is required')
], async (req, res) => {
  try {
    const { productIds, updates } = req.body;
    
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: 'Product IDs array is required' });
    }

    // Handle price updates
    if (updates.priceType && updates.priceValue !== undefined) {
      const priceField = `pricing.${updates.priceType}`;
      const updateMethod = updates.updateMethod || 'set';
      
      const products = await Product.find({ _id: { $in: productIds } });
      const bulkOps = products.map(product => {
        let newValue = updates.priceValue;
        
        if (updateMethod === 'increase') {
          newValue = (product.pricing[updates.priceType] || 0) + updates.priceValue;
        } else if (updateMethod === 'decrease') {
          newValue = Math.max(0, (product.pricing[updates.priceType] || 0) - updates.priceValue);
        } else if (updateMethod === 'percentage') {
          newValue = (product.pricing[updates.priceType] || 0) * (1 + updates.priceValue / 100);
        }
        
        return {
          updateOne: {
            filter: { _id: product._id },
            update: { $set: { [priceField]: newValue } }
          }
        };
      });
      
      await Product.bulkWrite(bulkOps);
    }
    
    // Handle category update
    if (updates.category) {
      await Product.updateMany(
        { _id: { $in: productIds } },
        { $set: { category: updates.category } }
      );
    }
    
    // Handle status update
    if (updates.status) {
      await Product.updateMany(
        { _id: { $in: productIds } },
        { $set: { status: updates.status } }
      );
    }
    
    // Handle stock adjustment
    if (updates.stockAdjustment !== undefined) {
      const stockMethod = updates.stockMethod || 'set';
      const products = await Product.find({ _id: { $in: productIds } });
      const bulkOps = products.map(product => {
        let newStock = updates.stockAdjustment;
        
        if (stockMethod === 'increase') {
          newStock = (product.inventory?.currentStock || 0) + updates.stockAdjustment;
        } else if (stockMethod === 'decrease') {
          newStock = Math.max(0, (product.inventory?.currentStock || 0) - updates.stockAdjustment);
        }
        
        return {
          updateOne: {
            filter: { _id: product._id },
            update: { $set: { 'inventory.currentStock': newStock } }
          }
        };
      });
      
      await Product.bulkWrite(bulkOps);
    }
    
    res.json({ 
      message: `Successfully updated ${productIds.length} products`,
      updated: productIds.length
    });
  } catch (error) {
    console.error('Bulk update products error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/products/bulk
// @desc    Bulk delete products
// @access  Private
router.delete('/bulk', [
  auth,
  requirePermission('delete_products'),
  body('productIds').isArray().withMessage('Product IDs array is required')
], async (req, res) => {
  try {
    const { productIds } = req.body;
    
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: 'Product IDs array is required' });
    }
    
    const result = await Product.deleteMany({ _id: { $in: productIds } });
    
    res.json({ 
      message: `Successfully deleted ${result.deletedCount} products`,
      deleted: result.deletedCount
    });
  } catch (error) {
    console.error('Bulk delete products error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/products/low-stock
// @desc    Get products with low stock
// @access  Private
router.get('/low-stock', auth, async (req, res) => {
  try {
    const products = await Product.find({
      $expr: {
        $lte: ['$inventory.currentStock', '$inventory.reorderPoint']
      },
      status: 'active'
    })
    .select('name inventory pricing')
    .sort({ 'inventory.currentStock': 1 });
    
    res.json({ products });
  } catch (error) {
    console.error('Get low stock products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/products/:id/price-check
// @desc    Get price for specific customer type and quantity
// @access  Private
router.post('/:id/price-check', [
  auth,
  body('customerType').isIn(['retail', 'wholesale', 'distributor', 'individual']).withMessage('Invalid customer type'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    const { customerType, quantity } = req.body;
    const price = product.getPriceForCustomerType(customerType, quantity);
    
    res.json({
      product: {
        id: product._id,
        name: product.name
      },
      customerType,
      quantity,
      unitPrice: price,
      totalPrice: price * quantity,
      availableStock: product.inventory.currentStock
    });
  } catch (error) {
    console.error('Price check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/products/export/csv
// @desc    Export products to CSV
// @access  Private
router.post('/export/csv', [auth, requirePermission('view_products')], async (req, res) => {
  try {
    const { filters = {} } = req.body;
    
    // Build query based on filters
    const query = {};
    if (filters.category) query.category = filters.category;
    if (filters.status) query.status = filters.status;
    if (filters.lowStock) {
      query['inventory.currentStock'] = { $lte: '$inventory.reorderPoint' };
    }
    
    const products = await Product.find(query)
      .populate('category', 'name')
      .lean();
    
    // Prepare CSV data with proper string conversion
    const csvData = products.map(product => ({
      name: String(product.name || ''),
      description: String(product.description || ''),
      category: String(product.category?.name || ''),
      brand: String(product.brand || ''),
      barcode: String(product.barcode || ''),
      sku: String(product.sku || ''),
      cost: String(product.pricing?.cost || 0),
      retail: String(product.pricing?.retail || 0),
      wholesale: String(product.pricing?.wholesale || 0),
      distributor: String(product.pricing?.distributor || 0),
      currentStock: String(product.inventory?.currentStock || 0),
      minStock: String(product.inventory?.minStock || 0),
      maxStock: String(product.inventory?.maxStock || 0),
      reorderPoint: String(product.inventory?.reorderPoint || 0),
      weight: String(product.weight || 0),
      status: String(product.status || 'active'),
      taxable: String(product.taxSettings?.taxable || true),
      taxRate: String(product.taxSettings?.taxRate || 0),
      createdAt: String(product.createdAt?.toISOString().split('T')[0] || '')
    }));
    
    // Ensure exports directory exists
    if (!fs.existsSync('exports')) {
      fs.mkdirSync('exports');
    }
    
    // Generate unique filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `products_${timestamp}.csv`;
    
    // Create CSV file
    const csvWriter = createCsvWriter({
      path: `exports/${filename}`,
      header: [
        { id: 'name', title: 'Product Name' },
        { id: 'description', title: 'Description' },
        { id: 'category', title: 'Category' },
        { id: 'brand', title: 'Brand' },
        { id: 'barcode', title: 'Barcode' },
        { id: 'sku', title: 'SKU' },
        { id: 'cost', title: 'Cost Price' },
        { id: 'retail', title: 'Retail Price' },
        { id: 'wholesale', title: 'Wholesale Price' },
        { id: 'distributor', title: 'Distributor Price' },
        { id: 'currentStock', title: 'Current Stock' },
        { id: 'minStock', title: 'Min Stock' },
        { id: 'maxStock', title: 'Max Stock' },
        { id: 'reorderPoint', title: 'Reorder Point' },
        { id: 'weight', title: 'Weight' },
        { id: 'status', title: 'Status' },
        { id: 'taxable', title: 'Taxable' },
        { id: 'taxRate', title: 'Tax Rate' },
        { id: 'createdAt', title: 'Created Date' }
      ]
    });
    
    await csvWriter.writeRecords(csvData);
    
    res.json({
      message: 'Products exported successfully',
      filename: filename,
      recordCount: csvData.length,
      downloadUrl: `/api/products/download/${filename}`
    });
    
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ message: 'Export failed' });
  }
});

// @route   POST /api/products/export/excel
// @desc    Export products to Excel
// @access  Private
router.post('/export/excel', [auth, requirePermission('view_products')], async (req, res) => {
  try {
    const { filters = {} } = req.body;
    
    // Build query based on filters
    const query = {};
    if (filters.category) query.category = filters.category;
    if (filters.status) query.status = filters.status;
    if (filters.lowStock) {
      query['inventory.currentStock'] = { $lte: '$inventory.reorderPoint' };
    }
    
    const products = await Product.find(query)
      .populate('category', 'name')
      .lean();
    
    // Helper function to safely convert any value to string
    const safeString = (value) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') {
        // If it's an object with a name property, use that
        if (value.name) return String(value.name);
        // If it's a date object, format it
        if (value instanceof Date) return value.toISOString().split('T')[0];
        // Otherwise, stringify the object
        return JSON.stringify(value);
      }
      return String(value);
    };

    // Helper function to safely convert to number
    const safeNumber = (value) => {
      if (value === null || value === undefined) return 0;
      if (typeof value === 'object') {
        // If it's an object with a numeric property, extract it
        if (typeof value.cost === 'number') return value.cost;
        if (typeof value.retail === 'number') return value.retail;
        if (typeof value.wholesale === 'number') return value.wholesale;
        if (typeof value.currentStock === 'number') return value.currentStock;
        if (typeof value.reorderPoint === 'number') return value.reorderPoint;
        return 0;
      }
      const num = Number(value);
      return isNaN(num) ? 0 : num;
    };

    // Prepare Excel data with proper data types and object handling
    const excelData = products.map(product => ({
      'Product Name': safeString(product.name),
      'Description': safeString(product.description),
      'Category': safeString(product.category?.name || product.category),
      'Brand': safeString(product.brand),
      'Barcode': safeString(product.barcode),
      'SKU': safeString(product.sku),
      'Cost Price': safeNumber(product.pricing?.cost),
      'Retail Price': safeNumber(product.pricing?.retail),
      'Wholesale Price': safeNumber(product.pricing?.wholesale),
      'Distributor Price': safeNumber(product.pricing?.distributor),
      'Current Stock': safeNumber(product.inventory?.currentStock),
      'Min Stock': safeNumber(product.inventory?.minStock),
      'Max Stock': safeNumber(product.inventory?.maxStock),
      'Reorder Point': safeNumber(product.inventory?.reorderPoint),
      'Weight': safeNumber(product.weight),
      'Status': safeString(product.status),
      'Taxable': safeString(product.taxSettings?.taxable),
      'Tax Rate': safeNumber(product.taxSettings?.taxRate),
      'Created Date': safeString(product.createdAt)
    }));

    // Debug: Log first product data to see what we're working with
    if (products.length > 0) {
      console.log('First product raw data:', JSON.stringify(products[0], null, 2));
      console.log('First product processed data:', JSON.stringify(excelData[0], null, 2));
    }
    
    // Create Excel workbook with proper options
    const workbook = XLSX.utils.book_new();
    
    // Create worksheet from JSON data
    const worksheet = XLSX.utils.json_to_sheet(excelData, {
      header: Object.keys(excelData[0] || {}),
      skipHeader: false
    });
    
    // Set column widths
    const columnWidths = [
      { wch: 25 }, // Product Name
      { wch: 30 }, // Description
      { wch: 15 }, // Category
      { wch: 20 }, // Supplier
      { wch: 12 }, // Cost Price
      { wch: 12 }, // Retail Price
      { wch: 15 }, // Wholesale Price
      { wch: 12 }, // Current Stock
      { wch: 12 }, // Reorder Point
      { wch: 10 }, // Status
      { wch: 12 }  // Created Date
    ];
    worksheet['!cols'] = columnWidths;
    
    // Add worksheet to workbook with proper options
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products', true);
    
    // Ensure exports directory exists
    if (!fs.existsSync('exports')) {
      fs.mkdirSync('exports');
    }
    
    // Generate unique filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `products_${timestamp}.xlsx`;
    const filepath = path.join('exports', filename);
    
    try {
      // Write Excel file with proper options
      XLSX.writeFile(workbook, filepath, {
        bookType: 'xlsx',
        type: 'file'
      });
      
      // Verify file was created and has content
      if (!fs.existsSync(filepath)) {
        throw new Error('Failed to create Excel file');
      }
      
      const stats = fs.statSync(filepath);
      if (stats.size === 0) {
        throw new Error('Excel file was created but is empty');
      }
      
      console.log(`Excel file created successfully: ${filepath}, size: ${stats.size} bytes`);
      
    } catch (xlsxError) {
      console.error('XLSX write error:', xlsxError);
      
      // Fallback: Create a simple CSV file instead
      const csvFilename = filename.replace('.xlsx', '.csv');
      const csvFilepath = path.join('exports', csvFilename);
      
      // Convert to CSV format with proper escaping
      const csvContent = [
        Object.keys(excelData[0] || {}).join(','),
        ...excelData.map(row => Object.values(row).map(val => {
          const strVal = String(val || '');
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
            return `"${strVal.replace(/"/g, '""')}"`;
          }
          return strVal;
        }).join(','))
      ].join('\n');
      
      fs.writeFileSync(csvFilepath, csvContent, 'utf8');
      
      console.log(`Fallback CSV file created: ${csvFilepath}`);
      
      // Return CSV file info instead
      res.json({
        message: 'Products exported successfully (CSV format due to Excel compatibility issue)',
        filename: csvFilename,
        recordCount: excelData.length,
        downloadUrl: `/api/products/download/${csvFilename}`
      });
      return;
    }
    
    res.json({
      message: 'Products exported successfully',
      filename: filename,
      recordCount: excelData.length,
      downloadUrl: `/api/products/download/${filename}`
    });
    
  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({ 
      message: 'Export failed', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   GET /api/products/download/:filename
// @desc    Download exported file
// @access  Private
router.get('/download/:filename', [auth, requirePermission('view_products')], (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join('exports', filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Set proper headers based on file type
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (ext === '.xlsx') {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (ext === '.csv') {
      contentType = 'text/csv';
    }
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    const fileStream = fs.createReadStream(filepath);
    fileStream.pipe(res);
    
    fileStream.on('error', (err) => {
      console.error('File stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Download failed' });
      }
    });
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ message: 'Download failed' });
  }
});

// @route   POST /api/products/import/csv
// @desc    Import products from CSV
// @access  Private
router.post('/import/csv', [
  auth,
  requirePermission('create_products'),
  upload.single('file')
], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const results = {
      total: 0,
      success: 0,
      errors: []
    };
    
    const products = [];
    
    // Parse CSV file
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => {
        products.push(row);
      })
      .on('end', async () => {
        results.total = products.length;
        
        for (let i = 0; i < products.length; i++) {
          try {
            const row = products[i];
            
            // Validate required fields
            if (!row.name) {
              results.errors.push({
                row: i + 2, // +2 because CSV has header and 0-based index
                error: 'Missing required field: name is required'
              });
              continue;
            }
            
            // Check if product already exists
            const existingProduct = await Product.findOne({ 
              name: row.name.trim()
            });
            
            if (existingProduct) {
              results.errors.push({
                row: i + 2,
                error: `Product already exists with name: ${row.name}`
              });
              continue;
            }
            
            // Create product
            const product = new Product({
              name: row.name.trim(),
              description: row.description?.trim() || '',
              category: row.category?.trim() || 'Uncategorized',
              brand: row.brand?.trim() || '',
              barcode: row.barcode?.trim() || '',
              sku: row.sku?.trim() || '',
              supplier: row.supplier?.trim() || '',
              pricing: {
                cost: parseFloat(row.cost) || 0,
                retail: parseFloat(row.retail) || 0,
                wholesale: parseFloat(row.wholesale) || 0
              },
              inventory: {
                currentStock: parseInt(row.currentStock) || 0,
                reorderPoint: parseInt(row.reorderPoint) || 0
              },
              status: row.status?.toLowerCase() === 'inactive' ? 'inactive' : 'active'
            });
            
            await product.save();
            results.success++;
            
          } catch (error) {
            results.errors.push({
              row: i + 2,
              error: error.message
            });
          }
        }
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        
        res.json({
          message: 'Import completed',
          results: results
        });
      })
      .on('error', (error) => {
        console.error('CSV parsing error:', error);
        res.status(500).json({ message: 'Failed to parse CSV file' });
      });
      
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ message: 'Import failed' });
  }
});

// @route   POST /api/products/import/excel
// @desc    Import products from Excel
// @access  Private
router.post('/import/excel', [
  auth,
  requirePermission('create_products'),
  upload.single('file')
], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const results = {
      total: 0,
      success: 0,
      errors: []
    };
    
    // Read Excel file
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const products = XLSX.utils.sheet_to_json(worksheet);
    
    results.total = products.length;
    
    for (let i = 0; i < products.length; i++) {
      try {
        const row = products[i];
        
        // Map Excel columns to our format (handle different column names)
        const productData = {
          name: row['Product Name'] || row['Name'] || row['Product'] || row.name,
          description: row['Description'] || row['description'] || row.description || '',
          category: row['Category'] || row['category'] || row.category || 'Uncategorized',
          brand: row['Brand'] || row['brand'] || row.brand || '',
          barcode: row['Barcode'] || row['barcode'] || row.barcode || '',
          sku: row['SKU'] || row['Sku'] || row['sku'] || row.sku || '',
          supplier: row['Supplier'] || row['supplier'] || row.supplier || '',
          cost: row['Cost Price'] || row['Cost'] || row['cost'] || row.cost || 0,
          retail: row['Retail Price'] || row['Retail'] || row['retail'] || row.retail || 0,
          wholesale: row['Wholesale Price'] || row['Wholesale'] || row['wholesale'] || row.wholesale || 0,
          currentStock: row['Current Stock'] || row['Stock'] || row['currentStock'] || row.stock || 0,
          reorderPoint: row['Reorder Point'] || row['Reorder'] || row['reorderPoint'] || row.reorder || 0,
          status: row['Status'] || row['status'] || 'active'
        };
        
        // Validate required fields
        if (!productData.name) {
          results.errors.push({
            row: i + 2,
            error: 'Missing required field: Product Name is required'
          });
          continue;
        }
        
        // Check if product already exists
        const existingProduct = await Product.findOne({ 
          name: productData.name.toString().trim()
        });
        
        if (existingProduct) {
          results.errors.push({
            row: i + 2,
            error: `Product already exists with name: ${productData.name}`
          });
          continue;
        }
        
        // Create product
        const product = new Product({
          name: productData.name.toString().trim(),
          description: productData.description?.toString().trim() || '',
          category: productData.category?.toString().trim() || 'Uncategorized',
          brand: productData.brand?.toString().trim() || '',
          barcode: productData.barcode?.toString().trim() || '',
          sku: productData.sku?.toString().trim() || '',
          supplier: productData.supplier?.toString().trim() || '',
          pricing: {
            cost: parseFloat(productData.cost) || 0,
            retail: parseFloat(productData.retail) || 0,
            wholesale: parseFloat(productData.wholesale) || 0
          },
          inventory: {
            currentStock: parseInt(productData.currentStock) || 0,
            reorderPoint: parseInt(productData.reorderPoint) || 0
          },
          status: productData.status?.toString().toLowerCase() === 'inactive' ? 'inactive' : 'active'
        });
        
        await product.save();
        results.success++;
        
      } catch (error) {
        results.errors.push({
          row: i + 2,
          error: error.message
        });
      }
    }
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json({
      message: 'Import completed',
      results: results
    });
    
  } catch (error) {
    console.error('Excel import error:', error);
    res.status(500).json({ message: 'Import failed' });
  }
});

// @route   GET /api/products/template/csv
// @desc    Download CSV template
// @access  Private
router.get('/template/csv', [auth, requirePermission('create_products')], async (req, res) => {
  try {
    const templateData = [
      {
        name: 'Sample Product',
        description: 'This is a sample product',
        category: 'Electronics',
        brand: 'Sample Brand',
        barcode: '1234567890123',
        sku: 'SKU-001',
        cost: '10.00',
        retail: '15.00',
        wholesale: '12.00',
        distributor: '11.00',
        currentStock: '100',
        minStock: '5',
        maxStock: '200',
        reorderPoint: '10',
        weight: '1.5',
        status: 'active',
        taxable: 'true',
        taxRate: '0.08'
      }
    ];
    
    const csvWriter = createCsvWriter({
      path: 'exports/product_template.csv',
      header: [
        { id: 'name', title: 'Product Name' },
        { id: 'description', title: 'Description' },
        { id: 'category', title: 'Category' },
        { id: 'brand', title: 'Brand' },
        { id: 'barcode', title: 'Barcode' },
        { id: 'sku', title: 'SKU' },
        { id: 'cost', title: 'Cost Price' },
        { id: 'retail', title: 'Retail Price' },
        { id: 'wholesale', title: 'Wholesale Price' },
        { id: 'distributor', title: 'Distributor Price' },
        { id: 'currentStock', title: 'Current Stock' },
        { id: 'minStock', title: 'Min Stock' },
        { id: 'maxStock', title: 'Max Stock' },
        { id: 'reorderPoint', title: 'Reorder Point' },
        { id: 'weight', title: 'Weight' },
        { id: 'status', title: 'Status' },
        { id: 'taxable', title: 'Taxable' },
        { id: 'taxRate', title: 'Tax Rate' }
      ]
    });
    
    // Ensure exports directory exists
    if (!fs.existsSync('exports')) {
      fs.mkdirSync('exports');
    }
    
    await csvWriter.writeRecords(templateData);
    res.download('exports/product_template.csv', 'product_template.csv');
    
  } catch (error) {
    console.error('Template error:', error);
    res.status(500).json({ message: 'Failed to generate template' });
  }
});

// Link investors to product
router.post('/:id/investors', [
  auth,
  requirePermission('edit_products'),
  body('investors').isArray().withMessage('Investors must be an array'),
  body('investors.*.investor').isMongoId().withMessage('Invalid investor ID'),
  body('investors.*.sharePercentage').optional().isFloat({ min: 0, max: 100 })
], async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const Investor = require('../models/Investor');
    
    // Validate all investors exist
    for (const inv of req.body.investors) {
      const investor = await Investor.findById(inv.investor);
      if (!investor) {
        return res.status(400).json({ message: `Investor ${inv.investor} not found` });
      }
    }

    // Update product investors
    // Use sharePercentage from request, default to 30% if not provided
    const updatedInvestors = req.body.investors.map(inv => ({
      investor: inv.investor,
      sharePercentage: inv.sharePercentage || 30,
      addedAt: new Date()
    }));
    
    product.investors = updatedInvestors;
    product.hasInvestors = product.investors.length > 0;
    
    await product.save();

    // Populate investors before returning
    await product.populate('investors.investor', 'name email');

    res.json({
      success: true,
      message: 'Investors linked to product successfully',
      data: product
    });
  } catch (error) {
    console.error('Error linking investors:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Remove investor from product
router.delete('/:id/investors/:investorId', [
  auth,
  requirePermission('edit_products')
], async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    product.investors = product.investors.filter(
      inv => inv.investor.toString() !== req.params.investorId
    );
    product.hasInvestors = product.investors.length > 0;
    
    await product.save();

    // Populate investors before returning
    await product.populate('investors.investor', 'name email');

    res.json({
      success: true,
      message: 'Investor removed from product successfully',
      data: product
    });
  } catch (error) {
    console.error('Error removing investor:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/products/:id/last-purchase-price
// @desc    Get last purchase price for a product
// @access  Private
router.get('/:id/last-purchase-price', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const PurchaseInvoice = require('../models/PurchaseInvoice');
    
    // Find the most recent purchase invoice item for this product
    const lastPurchase = await PurchaseInvoice.findOne({
      'items.product': id,
      invoiceType: 'purchase'
    })
      .sort({ createdAt: -1 })
      .select('items invoiceNumber createdAt')
      .lean();
    
    if (!lastPurchase) {
      return res.json({
        success: true,
        message: 'No purchase history found for this product',
        lastPurchasePrice: null
      });
    }
    
    // Find the item for this product in the invoice
    const productItem = lastPurchase.items.find(
      item => item.product.toString() === id.toString()
    );
    
    if (!productItem) {
      return res.json({
        success: true,
        message: 'Product not found in last purchase',
        lastPurchasePrice: null
      });
    }
    
    res.json({
      success: true,
      message: 'Last purchase price retrieved successfully',
      lastPurchasePrice: productItem.unitCost,
      invoiceNumber: lastPurchase.invoiceNumber,
      purchaseDate: lastPurchase.createdAt
    });
  } catch (error) {
    console.error('Get last purchase price error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/products/get-last-purchase-prices
// @desc    Get last purchase prices for multiple products
// @access  Private
router.post('/get-last-purchase-prices', auth, async (req, res) => {
  try {
    const { productIds } = req.body;
    
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: 'Product IDs array is required' });
    }
    
    const PurchaseInvoice = require('../models/PurchaseInvoice');
    
    // Get last purchase price for each product
    const prices = {};
    
    for (const productId of productIds) {
      const lastPurchase = await PurchaseInvoice.findOne({
        'items.product': productId,
        invoiceType: 'purchase'
      })
        .sort({ createdAt: -1 })
        .select('items invoiceNumber createdAt')
        .lean();
      
      if (lastPurchase) {
        const productItem = lastPurchase.items.find(
          item => item.product.toString() === productId.toString()
        );
        
        if (productItem) {
          prices[productId] = {
            productId: productId,
            lastPurchasePrice: productItem.unitCost,
            invoiceNumber: lastPurchase.invoiceNumber,
            purchaseDate: lastPurchase.createdAt
          };
        }
      }
    }
    
    res.json({
      success: true,
      message: 'Last purchase prices retrieved successfully',
      prices: prices
    });
  } catch (error) {
    console.error('Get last purchase prices error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
