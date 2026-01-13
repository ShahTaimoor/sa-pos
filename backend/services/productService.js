const productRepository = require('../repositories/ProductRepository');
const investorRepository = require('../repositories/InvestorRepository');
const purchaseInvoiceRepository = require('../repositories/PurchaseInvoiceRepository');
const Inventory = require('../models/Inventory');
const auditLogService = require('./auditLogService');
const costingService = require('./costingService');
const logger = require('../utils/logger');

class ProductService {
  /**
   * Build filter query from request parameters
   * @param {object} queryParams - Request query parameters
   * @returns {object} - MongoDB filter object
   */
  buildFilter(queryParams) {
    const filter = {};

    // Tenant ID filter (required for multi-tenant isolation)
    if (queryParams.tenantId) {
      filter.tenantId = queryParams.tenantId;
    }

    // Multi-field search
    if (queryParams.search) {
      const searchTerm = queryParams.search;
      let searchFields = ['name', 'description'];

      // Parse custom search fields if provided
      if (queryParams.searchFields) {
        try {
          searchFields = JSON.parse(queryParams.searchFields);
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
    if (queryParams.category) {
      filter.category = queryParams.category;
    } else if (queryParams.categories) {
      try {
        const categories = JSON.parse(queryParams.categories);
        if (Array.isArray(categories) && categories.length > 0) {
          filter.category = { $in: categories };
        }
      } catch (e) {
        // Invalid format, ignore
      }
    }

    // Status filter (single or multiple)
    if (queryParams.status) {
      filter.status = queryParams.status;
    } else if (queryParams.statuses) {
      try {
        const statuses = JSON.parse(queryParams.statuses);
        if (Array.isArray(statuses) && statuses.length > 0) {
          filter.status = { $in: statuses };
        }
      } catch (e) {
        // Invalid format, ignore
      }
    }

    // Price range filter
    if (queryParams.minPrice || queryParams.maxPrice) {
      const priceField = queryParams.priceField || 'retail';
      const pricePath = `pricing.${priceField}`;

      if (queryParams.minPrice && queryParams.maxPrice) {
        filter[pricePath] = {
          $gte: parseFloat(queryParams.minPrice),
          $lte: parseFloat(queryParams.maxPrice)
        };
      } else if (queryParams.minPrice) {
        filter[pricePath] = { $gte: parseFloat(queryParams.minPrice) };
      } else if (queryParams.maxPrice) {
        filter[pricePath] = { $lte: parseFloat(queryParams.maxPrice) };
      }
    }

    // Stock level filter
    if (queryParams.minStock || queryParams.maxStock) {
      if (queryParams.minStock && queryParams.maxStock) {
        filter['inventory.currentStock'] = {
          $gte: parseInt(queryParams.minStock),
          $lte: parseInt(queryParams.maxStock)
        };
      } else if (queryParams.minStock) {
        filter['inventory.currentStock'] = { $gte: parseInt(queryParams.minStock) };
      } else if (queryParams.maxStock) {
        filter['inventory.currentStock'] = { $lte: parseInt(queryParams.maxStock) };
      }
    }

    // Date range filter
    if (queryParams.dateFrom || queryParams.dateTo) {
      const dateField = queryParams.dateField || 'createdAt';

      if (queryParams.dateFrom && queryParams.dateTo) {
        filter[dateField] = {
          $gte: new Date(queryParams.dateFrom),
          $lte: new Date(queryParams.dateTo)
        };
      } else if (queryParams.dateFrom) {
        filter[dateField] = { $gte: new Date(queryParams.dateFrom) };
      } else if (queryParams.dateTo) {
        filter[dateField] = { $lte: new Date(queryParams.dateTo) };
      }
    }

    // Brand filter
    if (queryParams.brand) {
      filter.brand = { $regex: queryParams.brand, $options: 'i' };
    }

    // Low stock filter
    if (queryParams.lowStock === 'true') {
      filter.$expr = { $lte: ['$inventory.currentStock', '$inventory.reorderPoint'] };
    }

    // Stock status filter
    if (queryParams.stockStatus) {
      switch (queryParams.stockStatus) {
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

    return filter;
  }

  /**
   * Transform product names to uppercase
   * @param {Product|object} product - Product to transform
   * @returns {object} - Transformed product
   */
  transformProductToUppercase(product) {
    if (!product) return product;
    if (product.toObject) product = product.toObject();
    if (product.name) product.name = product.name.toUpperCase();
    if (product.description) product.description = product.description.toUpperCase();
    if (product.category && product.category.name) product.category.name = product.category.name.toUpperCase();
    return product;
  }

  /**
   * Get products with filtering and pagination
   * @param {object} queryParams - Query parameters
   * @returns {Promise<object>}
   */
  async getProducts(queryParams, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get products');
    }
    
    const getAllProducts = queryParams.all === 'true' || queryParams.all === true ||
                          (queryParams.limit && parseInt(queryParams.limit) >= 999999);

    const page = getAllProducts ? 1 : (parseInt(queryParams.page) || 1);
    const limit = getAllProducts ? 999999 : (parseInt(queryParams.limit) || 20);

    const filter = this.buildFilter(queryParams);
    // Ensure tenantId is in filter
    filter.tenantId = tenantId;

    const result = await productRepository.findWithPagination(filter, {
      tenantId: tenantId,
      page,
      limit,
      getAll: getAllProducts,
      populate: [
        { path: 'category', select: 'name' },
        { path: 'investors.investor', select: 'name email' }
      ],
      sort: { createdAt: -1 }
    });

    // Transform product names to uppercase
    result.products = result.products.map(p => this.transformProductToUppercase(p));

    return result;
  }

  /**
   * Get single product by ID
   * @param {string} id - Product ID
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<Product>}
   */
  async getProductById(id, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get product');
    }
    
    const product = await productRepository.findById(id, {
      tenantId: tenantId,
      populate: [
        { path: 'category', select: 'name' },
        { path: 'investors.investor', select: 'name email' }
      ]
    });

    if (!product) {
      throw new Error('Product not found');
    }

    return this.transformProductToUppercase(product);
  }

  /**
   * Create new product
   * @param {object} productData - Product data
   * @param {string} userId - User ID creating the product
   * @param {object} req - Express request object (for audit logging)
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<{product: Product, message: string}>}
   */
  async createProduct(productData, userId, req = null, tenantId = null) {
    // Get tenantId from req if not provided
    if (!tenantId && req && req.tenantId) {
      tenantId = req.tenantId;
    }
    if (!tenantId && req && req.user && req.user.tenantId) {
      tenantId = req.user.tenantId;
    }
    if (!tenantId) {
      throw new Error('tenantId is required to create a product');
    }

    // Check if product name already exists (within same tenant)
    if (productData.name) {
      const nameExists = await productRepository.nameExists(productData.name, null, tenantId);
      if (nameExists) {
        throw new Error('A product with this name already exists. Please choose a different name.');
      }
    }

    // Check if SKU already exists (within same tenant)
    if (productData.sku) {
      const skuExists = await productRepository.skuExists(productData.sku, null, tenantId);
      if (skuExists) {
        throw new Error('A product with this SKU already exists.');
      }
    }

    // Check if barcode already exists (within same tenant)
    if (productData.barcode) {
      const barcodeExists = await productRepository.barcodeExists(productData.barcode, null, tenantId);
      if (barcodeExists) {
        throw new Error('A product with this barcode already exists.');
      }
    }

    // Set default costing method if not provided
    if (!productData.costingMethod) {
      productData.costingMethod = 'standard';
    }

    const dataWithUser = {
      ...productData,
      tenantId: tenantId, // Include tenantId
      createdBy: userId,
      lastModifiedBy: userId,
      version: 0 // Initialize version for optimistic locking
    };

    const product = await productRepository.create(dataWithUser);

    // Automatically create inventory record for the new product
    try {
      const inventoryRecord = new Inventory({
        tenantId: tenantId, // Include tenantId
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
        cost: {
          average: product.pricing?.cost || 0,
          lastPurchase: product.pricing?.cost || 0,
          fifo: []
        },
        createdBy: userId
      });
      await inventoryRecord.save();
    } catch (inventoryError) {
      // Don't fail the product creation if inventory creation fails
      // Log error but continue
      logger.error('Inventory creation error:', { error: inventoryError });
    }

    // Log audit trail
    try {
      if (req) {
        await auditLogService.logProductCreation(product, { _id: userId }, req);
      }
    } catch (auditError) {
      // Don't fail product creation if audit logging fails
      logger.error('Audit logging error:', { error: auditError });
    }

    return {
      product,
      message: 'Product created successfully'
    };
  }

  /**
   * Update product with optimistic locking
   * @param {string} id - Product ID
   * @param {object} updateData - Data to update
   * @param {string} userId - User ID updating the product
   * @param {object} req - Express request object (for audit logging)
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @returns {Promise<{product: Product, message: string}>}
   */
  async updateProduct(id, updateData, userId, req = null, tenantId = null) {
    // Get tenantId from req if not provided
    if (!tenantId && req && req.tenantId) {
      tenantId = req.tenantId;
    }
    if (!tenantId && req && req.user && req.user.tenantId) {
      tenantId = req.user.tenantId;
    }

    if (!tenantId) {
      throw new Error('tenantId is required to update product');
    }

    // Get current product for optimistic locking check
    const currentProduct = await productRepository.findById(id, {
      tenantId: tenantId
    });
    if (!currentProduct) {
      throw new Error('Product not found');
    }

    // Check version for optimistic locking
    if (updateData.version !== undefined && updateData.version !== currentProduct.__v) {
      throw new Error('Product was modified by another user. Please refresh and try again.');
    }

    const finalTenantId = tenantId;
    
    // Prevent tenantId from being changed
    delete updateData.tenantId;

    // Check if product name already exists (excluding current product, within same tenant)
    if (updateData.name) {
      const nameExists = await productRepository.nameExists(updateData.name, id, finalTenantId);
      if (nameExists) {
        throw new Error('A product with this name already exists. Please choose a different name.');
      }
    }

    // Check if SKU already exists (excluding current product, within same tenant)
    if (updateData.sku) {
      const skuExists = await productRepository.skuExists(updateData.sku, id, finalTenantId);
      if (skuExists) {
        throw new Error('A product with this SKU already exists.');
      }
    }

    // Check if barcode already exists (excluding current product, within same tenant)
    if (updateData.barcode) {
      const barcodeExists = await productRepository.barcodeExists(updateData.barcode, id, finalTenantId);
      if (barcodeExists) {
        throw new Error('A product with this barcode already exists.');
      }
    }

    // Remove version from updateData (Mongoose handles __v automatically)
    const { version, ...dataToUpdate } = updateData;

    const dataWithUser = {
      ...dataToUpdate,
      lastModifiedBy: userId
    };

    // Use findOneAndUpdate with version check for atomic update
    // Include tenantId in filter for security
    const updatedProduct = await productRepository.Model.findOneAndUpdate(
      { _id: id, tenantId: finalTenantId, __v: currentProduct.__v }, // Include tenantId and version in filter
      { $set: dataWithUser, $inc: { __v: 1 } }, // Increment version
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      throw new Error('Product was modified by another user. Please refresh and try again.');
    }

    // Log audit trail
    try {
      if (req) {
        const reason = updateData.reason || 'Product updated';
        await auditLogService.logProductUpdate(
          currentProduct,
          updatedProduct,
          { _id: userId },
          req,
          reason
        );
      }
    } catch (auditError) {
      // Don't fail update if audit logging fails
      logger.error('Audit logging error:', { error: auditError });
    }

    return {
      product: updatedProduct,
      message: 'Product updated successfully'
    };
  }

  /**
   * Delete product (soft delete)
   * @param {string} id - Product ID
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @param {object} req - Express request object (for audit logging)
   * @returns {Promise<{message: string}>}
   */
  async deleteProduct(id, tenantId, req = null) {
    if (!tenantId) {
      throw new Error('tenantId is required to delete product');
    }
    
    const product = await productRepository.findById(id, {
      tenantId: tenantId
    });
    if (!product) {
      throw new Error('Product not found');
    }

    await productRepository.softDelete(id, {
      tenantId: tenantId
    });

    // Log audit trail
    try {
      if (req) {
        await auditLogService.logProductDeletion(product, { _id: req.user?._id }, req);
      }
    } catch (auditError) {
      logger.error('Audit logging error:', { error: auditError });
    }

    return {
      message: 'Product deleted successfully'
    };
  }

  /**
   * Bulk update products
   * @param {Array} productIds - Array of product IDs
   * @param {object} updates - Updates to apply
   * @returns {Promise<{message: string, updated: number}>}
   */
  async bulkUpdateProducts(productIds, updates) {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      throw new Error('Product IDs are required');
    }

    const result = await productRepository.bulkUpdate(productIds, updates);

    return {
      message: 'Products updated successfully',
      updated: result.modifiedCount || 0
    };
  }

  /**
   * Bulk delete products (soft delete)
   * @param {Array} productIds - Array of product IDs
   * @returns {Promise<{message: string, deleted: number}>}
   */
  async bulkDeleteProducts(productIds) {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      throw new Error('Product IDs are required');
    }

    const result = await productRepository.bulkDelete(productIds);

    return {
      message: 'Products deleted successfully',
      deleted: result.modifiedCount || 0
    };
  }

  /**
   * Bulk update products with complex logic (price adjustments, stock adjustments, etc.)
   * @param {Array} productIds - Array of product IDs
   * @param {object} updates - Updates to apply
   * @returns {Promise<{message: string, updated: number}>}
   */
  async bulkUpdateProductsAdvanced(productIds, updates) {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      throw new Error('Product IDs are required');
    }

    // Get all products first for complex calculations
    const products = await productRepository.findByIds(productIds);

    // Handle price updates with different methods
    if (updates.priceType && updates.priceValue !== undefined) {
      const priceField = `pricing.${updates.priceType}`;
      const updateMethod = updates.updateMethod || 'set';

      const bulkOps = products.map(product => {
        let newValue = updates.priceValue;

        if (updateMethod === 'increase') {
          newValue = (product.pricing?.[updates.priceType] || 0) + updates.priceValue;
        } else if (updateMethod === 'decrease') {
          newValue = Math.max(0, (product.pricing?.[updates.priceType] || 0) - updates.priceValue);
        } else if (updateMethod === 'percentage') {
          newValue = (product.pricing?.[updates.priceType] || 0) * (1 + updates.priceValue / 100);
        }

        return {
          updateOne: {
            filter: { _id: product._id },
            update: { $set: { [priceField]: newValue } }
          }
        };
      });

      await productRepository.Model.bulkWrite(bulkOps);
    }

    // Handle category update
    if (updates.category) {
      await productRepository.bulkUpdate(productIds, { category: updates.category });
    }

    // Handle status update
    if (updates.status) {
      await productRepository.bulkUpdate(productIds, { status: updates.status });
    }

    // Handle stock adjustment
    if (updates.stockAdjustment !== undefined) {
      const stockMethod = updates.stockMethod || 'set';
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

      await productRepository.Model.bulkWrite(bulkOps);
    }

    return {
      message: `Successfully updated ${productIds.length} products`,
      updated: productIds.length
    };
  }

  /**
   * Get low stock products
   * @returns {Promise<Array>}
   */
  async getLowStockProducts(tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get low stock products');
    }
    const products = await productRepository.findLowStock({
      select: 'name inventory pricing',
      sort: { 'inventory.currentStock': 1 },
      populate: null,
      filter: { tenantId: tenantId }
    });

    return products.map(p => this.transformProductToUppercase(p));
  }

  /**
   * Get products for export (with filters)
   * @param {object} filters - Filter criteria
   * @returns {Promise<Array>}
   */
  async getProductsForExport(filters = {}, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to export products');
    }
    
    const filter = this.buildFilter(filters);
    filter.tenantId = tenantId;
    
    return await productRepository.findAll(filter, {
      tenantId: tenantId,
      populate: { path: 'category', select: 'name' },
      lean: true
    });
  }

  /**
   * Search products by name
   * @param {string} searchTerm - Search term
   * @param {string} tenantId - Tenant ID (required for multi-tenant isolation)
   * @param {number} limit - Maximum results
   * @returns {Promise<Array>}
   */
  async searchProducts(searchTerm, tenantId, limit = 10) {
    if (!tenantId) {
      throw new Error('tenantId is required to search products');
    }
    
    const products = await productRepository.findAll({
      name: { $regex: searchTerm, $options: 'i' },
      status: 'active'
    }, {
      tenantId: tenantId,
      select: 'name pricing inventory status',
      limit,
      sort: { name: 1 }
    });

    return products.map(p => this.transformProductToUppercase(p));
  }

  /**
   * Get price for product by customer type and quantity
   * @param {string} productId - Product ID
   * @param {string} customerType - Customer type
   * @param {number} quantity - Quantity
   * @returns {Promise<object>}
   */
  async getPriceForCustomerType(productId, customerType, quantity, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get product price');
    }
    
    const product = await productRepository.findById(productId, {
      tenantId: tenantId
    });
    if (!product) {
      throw new Error('Product not found');
    }

    const price = product.getPriceForCustomerType(customerType, quantity);

    return {
      product: {
        id: product._id,
        name: product.name
      },
      customerType,
      quantity,
      unitPrice: price,
      totalPrice: price * quantity,
      availableStock: product.inventory?.currentStock || 0
    };
  }

  /**
   * Check if product exists by name
   * @param {string} name - Product name
   * @returns {Promise<boolean>}
   */
  async productExistsByName(name) {
    const product = await productRepository.findOne({ name: name.trim() });
    return !!product;
  }

  /**
   * Update product investors
   * @param {string} productId - Product ID
   * @param {Array} investors - Array of investor objects
   * @returns {Promise<Product>}
   */
  async updateProductInvestors(productId, investors) {
    const product = await productRepository.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    // Validate all investors exist
    for (const inv of investors) {
      const investor = await investorRepository.findById(inv.investor);
      if (!investor) {
        throw new Error(`Investor ${inv.investor} not found`);
      }
    }

    // Update product investors
    const updatedInvestors = investors.map(inv => ({
      investor: inv.investor,
      sharePercentage: inv.sharePercentage || 30,
      addedAt: new Date()
    }));

    product.investors = updatedInvestors;
    product.hasInvestors = product.investors.length > 0;

    await product.save();

    // Populate investors before returning
    await product.populate('investors.investor', 'name email');

    return product;
  }

  /**
   * Remove investor from product
   * @param {string} productId - Product ID
   * @param {string} investorId - Investor ID
   * @returns {Promise<Product>}
   */
  async removeProductInvestor(productId, investorId) {
    const product = await productRepository.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    product.investors = product.investors.filter(
      inv => inv.investor.toString() !== investorId
    );
    product.hasInvestors = product.investors.length > 0;

    await product.save();

    // Populate investors before returning
    await product.populate('investors.investor', 'name email');

    return product;
  }

  /**
   * Get last purchase price for a product
   * @param {string} productId - Product ID
   * @returns {Promise<object|null>}
   */
  async getLastPurchasePrice(productId, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get last purchase price');
    }
    const lastPurchase = await purchaseInvoiceRepository.findLastPurchaseForProduct(
      productId,
      {
        select: 'items invoiceNumber createdAt',
        lean: true,
        tenantId
      }
    );

    if (!lastPurchase) {
      return null;
    }

    // Find the item for this product in the invoice
    const productItem = lastPurchase.items.find(
      item => item.product.toString() === productId.toString()
    );

    if (!productItem) {
      return null;
    }

    return {
      lastPurchasePrice: productItem.unitCost,
      invoiceNumber: lastPurchase.invoiceNumber,
      purchaseDate: lastPurchase.createdAt
    };
  }

  /**
   * Get last purchase prices for multiple products
   * @param {Array<string>} productIds - Array of product IDs
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<object>}
   */
  async getLastPurchasePrices(productIds, tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to get last purchase prices');
    }
    const prices = {};

    // Process all products in parallel for better performance
    const pricePromises = productIds.map(async (productId) => {
      const priceInfo = await this.getLastPurchasePrice(productId, tenantId);
      if (priceInfo) {
        prices[productId] = {
          productId: productId,
          lastPurchasePrice: priceInfo.lastPurchasePrice,
          invoiceNumber: priceInfo.invoiceNumber,
          purchaseDate: priceInfo.purchaseDate
        };
      }
    });

    await Promise.all(pricePromises);

    return prices;
  }
}

module.exports = new ProductService();

