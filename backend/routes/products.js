const express = require('express');
const { body, validationResult, query } = require('express-validator');
const multer = require('multer');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { auth, requirePermission } = require('../middleware/auth');
const { sanitizeRequest, handleValidationErrors } = require('../middleware/validation');
const { blockDirectProductStockEdit } = require('../middleware/dataIntegrityMiddleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const logger = require('../utils/logger');
const productService = require('../services/productService');
const auditLogService = require('../services/auditLogService');
const expiryManagementService = require('../services/expiryManagementService');
const costingService = require('../services/costingService');

const router = express.Router();

// Helper function to transform product names to uppercase
const transformProductToUppercase = (product) => {
  if (!product) return product;
  if (product.toObject) product = product.toObject();
  if (product.name) product.name = product.name.toUpperCase();
  if (product.description) product.description = product.description.toUpperCase();
  if (product.category && product.category.name) product.category.name = product.category.name.toUpperCase();
  return product;
};

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
  tenantMiddleware,
  query('page').optional({ checkFalsy: true }).isInt({ min: 1 }),
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 999999 }),
  query('all').optional({ checkFalsy: true }).isBoolean(),
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
    
    // Get tenantId from request (set by tenantMiddleware)
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    
    // Call service to get products with tenantId
    const result = await productService.getProducts(req.query, tenantId);
    
    res.json({
      products: result.products,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('Get products error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/products/:id/last-purchase-price
// @desc    Get last purchase price for a product
// @access  Private
router.get('/:id/last-purchase-price', [auth, tenantMiddleware], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    const { id } = req.params;
    const priceInfo = await productService.getLastPurchasePrice(id, tenantId);
    
    if (!priceInfo) {
      return res.json({
        success: true,
        message: 'No purchase history found for this product',
        lastPurchasePrice: null
      });
    }
    
    res.json({
      success: true,
      message: 'Last purchase price retrieved successfully',
      lastPurchasePrice: priceInfo.lastPurchasePrice,
      invoiceNumber: priceInfo.invoiceNumber,
      purchaseDate: priceInfo.purchaseDate
    });
  } catch (error) {
    logger.error('Get last purchase price error:', { error: error });
    res.status(500).json({ 
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

// @route   GET /api/products/:id
// @desc    Get single product
// @access  Private
router.get('/:id', [auth, tenantMiddleware], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    const product = await productService.getProductById(req.params.id, tenantId);
    res.json({ product });
  } catch (error) {
    if (error.message === 'Product not found') {
      return res.status(404).json({ message: 'Product not found' });
    }
    logger.error('Get product error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/products
// @desc    Create new product
// @access  Private
router.post('/', [
  sanitizeRequest,
  auth,
  tenantMiddleware,
  requirePermission('create_products'),
  body('name').trim().isLength({ min: 1 }).withMessage('Product name is required'),
  body('pricing.cost').isFloat({ min: 0 }).withMessage('Cost must be a positive number'),
  body('pricing.retail').isFloat({ min: 0 }).withMessage('Retail price must be a positive number'),
  body('pricing.wholesale').isFloat({ min: 0 }).withMessage('Wholesale price must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.error('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }
    
    // Get tenantId from request (set by tenantMiddleware)
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    
    // Call service to create product (pass req for audit logging)
    const result = await productService.createProduct(req.body, req.user._id, req, tenantId);
    
    res.status(201).json(result);
  } catch (error) {
    logger.error('Create product error:', { error: error });
    logger.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    
    if (error.code === 11000) {
      
      
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
// @note    Direct stock edits are blocked. Use /api/inventory/update-stock instead.
router.put('/:id', [
  auth,
  tenantMiddleware,
  requirePermission('edit_products'),
  blockDirectProductStockEdit, // BLOCK direct stock edits
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
    
    // Get tenantId from request (set by tenantMiddleware)
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    
    // Call service to update product (pass req for audit logging and optimistic locking)
    const result = await productService.updateProduct(req.params.id, req.body, req.user._id, req, tenantId);
    
    res.json(result);
  } catch (error) {
    logger.error('Update product error:', { error: error });
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
// @desc    Delete product (soft delete)
// @access  Private
router.delete('/:id', [
  auth,
  tenantMiddleware,
  requirePermission('delete_products')
], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    
    // Call service to delete product (soft delete, pass req for audit logging)
    const result = await productService.deleteProduct(req.params.id, tenantId, req);
    res.json(result);
  } catch (error) {
    logger.error('Delete product error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/products/:id/restore
// @desc    Restore soft-deleted product
// @access  Private
router.post('/:id/restore', [
  auth,
  requirePermission('delete_products')
], async (req, res) => {
  try {
    const productRepository = require('../repositories/ProductRepository');
    const product = await productRepository.findDeletedById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Deleted product not found' });
    }
    
    await productRepository.restore(req.params.id);
    res.json({ message: 'Product restored successfully' });
  } catch (error) {
    logger.error('Restore product error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/products/deleted
// @desc    Get all deleted products
// @access  Private
router.get('/deleted', [
  auth,
  requirePermission('view_products')
], async (req, res) => {
  try {
    const productRepository = require('../repositories/ProductRepository');
    const deletedProducts = await productRepository.findDeleted({}, {
      sort: { deletedAt: -1 },
      populate: [{ path: 'category', select: 'name' }]
    });
    res.json(deletedProducts);
  } catch (error) {
    logger.error('Get deleted products error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/products/search/:query
// @desc    Search products by name
// @access  Private
router.get('/search/:query', [auth, tenantMiddleware], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    
    const query = req.params.query;
    const products = await productService.searchProducts(query, tenantId, 10);
    res.json({ products });
  } catch (error) {
    logger.error('Search products error:', { error: error });
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
    
    // Call service to bulk update products
    const result = await productService.bulkUpdateProductsAdvanced(productIds, updates);
    
    res.json(result);
  } catch (error) {
    logger.error('Bulk update products error:', { error: error });
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
    
    // Call service to bulk delete products
    const result = await productService.bulkDeleteProducts(productIds);
    
    res.json(result);
  } catch (error) {
    logger.error('Bulk delete products error:', { error: error });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/products/low-stock
// @desc    Get products with low stock
// @access  Private
router.get('/low-stock', [
  auth,
  tenantMiddleware
], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ 
        message: 'Tenant ID is required',
        products: []
      });
    }
    const products = await productService.getLowStockProducts(tenantId);
    res.json({ data: { products } });
  } catch (error) {
    logger.error('Get low stock products error:', { error: error });
    res.status(500).json({ 
      message: 'Server error',
      error: error.message,
      products: []
    });
  }
});

// @route   POST /api/products/:id/price-check
// @desc    Get price for specific customer type and quantity
// @access  Private
router.post('/:id/price-check', [
  auth,
  tenantMiddleware,
  body('customerType').isIn(['retail', 'wholesale', 'distributor', 'individual']).withMessage('Invalid customer type'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    
    const { customerType, quantity } = req.body;
    const result = await productService.getPriceForCustomerType(req.params.id, customerType, quantity, tenantId);
    res.json(result);
  } catch (error) {
    logger.error('Price check error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/products/export/csv
// @desc    Export products to CSV
// @access  Private
router.post('/export/csv', [auth, tenantMiddleware, requirePermission('view_products')], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    
    const { filters = {} } = req.body;
    
    // Call service to get products for export
    const products = await productService.getProductsForExport(filters, tenantId);
    
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
    logger.error('CSV export error:', { error: error });
    res.status(500).json({ message: 'Export failed' });
  }
});

// @route   POST /api/products/export/excel
// @desc    Export products to Excel
// @access  Private
router.post('/export/excel', [auth, tenantMiddleware, requirePermission('view_products')], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    
    const { filters = {} } = req.body;
    
    // Call service to get products for export
    const products = await productService.getProductsForExport(filters, tenantId);
    
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
      
      
    } catch (xlsxError) {
      logger.error('XLSX write error:', { error: xlsxError });
      
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
    logger.error('Excel export error:', { error: error });
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
      logger.error('File stream error:', { error: err });
      if (!res.headersSent) {
        res.status(500).json({ message: 'Download failed' });
      }
    });
    
  } catch (error) {
    logger.error('Download error:', { error: error });
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
            const productExists = await productService.productExistsByName(row.name.trim());
            
            if (productExists) {
              results.errors.push({
                row: i + 2,
                error: `Product already exists with name: ${row.name}`
              });
              continue;
            }
            
            // Create product using service
            const productData = {
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
            };
            
            await productService.createProduct(productData, req.user._id);
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
        logger.error('CSV parsing error:', { error: error });
        res.status(500).json({ message: 'Failed to parse CSV file' });
      });
      
  } catch (error) {
    logger.error('Import error:', { error: error });
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
        const productExists = await productService.productExistsByName(productData.name.toString().trim());
        
        if (productExists) {
          results.errors.push({
            row: i + 2,
            error: `Product already exists with name: ${productData.name}`
          });
          continue;
        }
        
        // Create product using service
        const productPayload = {
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
        };
        
        await productService.createProduct(productPayload, req.user._id);
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
    logger.error('Excel import error:', { error: error });
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
    logger.error('Template error:', { error: error });
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
    const product = await productService.updateProductInvestors(req.params.id, req.body.investors);

    res.json({
      success: true,
      message: 'Investors linked to product successfully',
      data: product
    });
  } catch (error) {
    logger.error('Error linking investors:', error);
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
    const product = await productService.removeProductInvestor(req.params.id, req.params.investorId);

    res.json({
      success: true,
      message: 'Investor removed from product successfully',
      data: product
    });
  } catch (error) {
    if (error.message === 'Product not found') {
      return res.status(404).json({ message: error.message });
    }
    logger.error('Error removing investor:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/products/get-last-purchase-prices
// @desc    Get last purchase prices for multiple products
// @access  Private
router.post('/get-last-purchase-prices', [auth, tenantMiddleware], async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required' });
    }
    const { productIds } = req.body;
    
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: 'Product IDs array is required' });
    }
    
    const prices = await productService.getLastPurchasePrices(productIds, tenantId);
    
    res.json({
      success: true,
      message: 'Last purchase prices retrieved successfully',
      prices: prices
    });
  } catch (error) {
    logger.error('Get last purchase prices error:', { error: error });
    res.status(500).json({ 
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

// @route   GET /api/products/:id/audit-logs
// @desc    Get audit logs for a product
// @access  Private
router.get('/:id/audit-logs', [
  auth,
  requirePermission('view_products')
], async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, skip = 0, action, startDate, endDate } = req.query;
    
    const logs = await auditLogService.getProductAuditLogs(id, {
      limit: parseInt(limit),
      skip: parseInt(skip),
      action,
      startDate,
      endDate
    });
    
    res.json({
      success: true,
      logs,
      count: logs.length
    });
  } catch (error) {
    logger.error('Get audit logs error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/products/expiring-soon
// @desc    Get products expiring soon
// @access  Private
router.get('/expiring-soon', [
  auth,
  requirePermission('view_products')
], async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const result = await expiryManagementService.getExpiringSoon(days);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Get expiring products error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/products/expired
// @desc    Get expired products
// @access  Private
router.get('/expired', [
  auth,
  requirePermission('view_products')
], async (req, res) => {
  try {
    const result = await expiryManagementService.getExpired();
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Get expired products error:', { error: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/products/:id/write-off-expired
// @desc    Write off expired inventory
// @access  Private
router.post('/:id/write-off-expired', [
  auth,
  requirePermission('edit_products')
], async (req, res) => {
  try {
    const { id } = req.params;
    const result = await expiryManagementService.writeOffExpired(id, req.user._id, req);
    
    res.json({
      success: true,
      message: 'Expired inventory written off successfully',
      ...result
    });
  } catch (error) {
    logger.error('Write off expired error:', { error: error });
    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
});

// @route   POST /api/products/:id/calculate-cost
// @desc    Calculate product cost using costing method
// @access  Private
router.post('/:id/calculate-cost', [
  auth,
  requirePermission('view_products'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { id } = req.params;
    const { quantity } = req.body;
    
    const costInfo = await costingService.calculateCost(id, quantity);
    
    res.json({
      success: true,
      productId: id,
      quantity,
      ...costInfo
    });
  } catch (error) {
    logger.error('Calculate cost error:', { error: error });
    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
});

module.exports = router;
