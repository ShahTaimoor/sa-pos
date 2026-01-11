const purchaseOrderRepository = require('../repositories/PurchaseOrderRepository');
const supplierRepository = require('../repositories/SupplierRepository');
const PurchaseOrder = require('../models/PurchaseOrder');
const logger = require('../utils/logger'); // Still needed for generatePONumber static method

class PurchaseOrderService {
  /**
   * Transform supplier names to uppercase
   * @param {object} supplier - Supplier to transform
   * @returns {object} - Transformed supplier
   */
  transformSupplierToUppercase(supplier) {
    if (!supplier) return supplier;
    if (supplier.toObject) supplier = supplier.toObject();
    if (supplier.companyName) supplier.companyName = supplier.companyName.toUpperCase();
    if (supplier.contactPerson && supplier.contactPerson.name) {
      supplier.contactPerson.name = supplier.contactPerson.name.toUpperCase();
    }
    return supplier;
  }

  /**
   * Transform product names to uppercase
   * @param {object} product - Product to transform
   * @returns {object} - Transformed product
   */
  transformProductToUppercase(product) {
    if (!product) return product;
    if (product.toObject) product = product.toObject();
    if (product.name) product.name = product.name.toUpperCase();
    if (product.description) product.description = product.description.toUpperCase();
    return product;
  }

  /**
   * Build filter query from request parameters
   * @param {object} queryParams - Request query parameters
   * @returns {object} - MongoDB filter object
   */
  buildFilter(queryParams) {
    const filter = {};

    // Search filter
    if (queryParams.search) {
      filter.$or = [
        { poNumber: { $regex: queryParams.search, $options: 'i' } },
        { notes: { $regex: queryParams.search, $options: 'i' } }
      ];
    }

    // Status filter
    if (queryParams.status) {
      filter.status = queryParams.status;
    }

    // Supplier filter
    if (queryParams.supplier) {
      filter.supplier = queryParams.supplier;
    }

    // Date range filter
    if (queryParams.dateFrom || queryParams.dateTo) {
      filter.createdAt = {};
      if (queryParams.dateFrom) {
        const dateFrom = new Date(queryParams.dateFrom);
        dateFrom.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = dateFrom;
      }
      if (queryParams.dateTo) {
        const dateTo = new Date(queryParams.dateTo);
        dateTo.setDate(dateTo.getDate() + 1);
        dateTo.setHours(0, 0, 0, 0);
        filter.createdAt.$lt = dateTo;
      }
    }

    return filter;
  }

  /**
   * Get purchase orders with filtering and pagination
   * @param {object} queryParams - Query parameters
   * @returns {Promise<object>}
   */
  async getPurchaseOrders(queryParams) {
    const getAllPurchaseOrders = queryParams.all === 'true' || queryParams.all === true ||
                                (queryParams.limit && parseInt(queryParams.limit) >= 999999);

    const page = getAllPurchaseOrders ? 1 : (parseInt(queryParams.page) || 1);
    const limit = getAllPurchaseOrders ? 999999 : (parseInt(queryParams.limit) || 20);

    const filter = this.buildFilter(queryParams);

    const result = await purchaseOrderRepository.findWithPagination(filter, {
      page,
      limit,
      getAll: getAllPurchaseOrders,
      sort: { createdAt: -1 },
      populate: [
        { path: 'supplier', select: 'companyName contactPerson email phone businessType currentBalance pendingBalance' },
        { path: 'items.product', select: 'name description pricing inventory' },
        { path: 'createdBy', select: 'firstName lastName email' },
        { path: 'lastModifiedBy', select: 'firstName lastName email' }
      ]
    });

    // Transform names to uppercase
    result.purchaseOrders.forEach(po => {
      if (po.supplier) {
        po.supplier = this.transformSupplierToUppercase(po.supplier);
      }
      if (po.items && Array.isArray(po.items)) {
        po.items.forEach(item => {
          if (item.product) {
            item.product = this.transformProductToUppercase(item.product);
          }
        });
      }
    });

    return result;
  }

  /**
   * Get single purchase order by ID
   * @param {string} id - Purchase order ID
   * @returns {Promise<object>}
   */
  async getPurchaseOrderById(id) {
    const purchaseOrder = await purchaseOrderRepository.findById(id);
    
    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    // Populate related fields
    await purchaseOrder.populate([
      { path: 'supplier', select: 'companyName contactPerson email phone businessType paymentTerms currentBalance pendingBalance' },
      { path: 'items.product', select: 'name description pricing inventory' },
      { path: 'createdBy', select: 'firstName lastName email' },
      { path: 'lastModifiedBy', select: 'firstName lastName email' },
      { path: 'conversions.convertedBy', select: 'firstName lastName email' }
    ]);

    // Transform names to uppercase
    if (purchaseOrder.supplier) {
      purchaseOrder.supplier = this.transformSupplierToUppercase(purchaseOrder.supplier);
    }
    if (purchaseOrder.items && Array.isArray(purchaseOrder.items)) {
      purchaseOrder.items.forEach(item => {
        if (item.product) {
          item.product = this.transformProductToUppercase(item.product);
        }
      });
    }

    return purchaseOrder;
  }

  /**
   * Create a new purchase order
   * @param {object} poData - Purchase order data
   * @param {string} userId - User ID creating the order
   * @returns {Promise<PurchaseOrder>}
   */
  async createPurchaseOrder(poData, userId) {
    const purchaseOrderData = {
      ...poData,
      poNumber: PurchaseOrder.generatePONumber(),
      createdBy: userId
    };

    const purchaseOrder = await purchaseOrderRepository.create(purchaseOrderData);

    // Update supplier pending balance for unpaid purchase orders
    if (purchaseOrder.supplier && purchaseOrder.total > 0) {
      try {
        const supplier = await supplierRepository.findById(purchaseOrder.supplier);
        if (supplier) {
          await supplierRepository.update(purchaseOrder.supplier, {
            $inc: { pendingBalance: purchaseOrder.total }
          });
        }
      } catch (error) {
        // Don't fail the purchase order creation if supplier update fails
        logger.error('Error updating supplier pending balance:', error);
      }
    }

    // Populate related fields
    await purchaseOrder.populate([
      { path: 'supplier', select: 'companyName contactPerson email phone businessType' },
      { path: 'items.product', select: 'name description pricing inventory' },
      { path: 'createdBy', select: 'firstName lastName email' }
    ]);

    return purchaseOrder;
  }

  /**
   * Update an existing purchase order
   * @param {string} id - Purchase order ID
   * @param {object} updateData - Update data
   * @param {string} userId - User ID performing the update
   * @returns {Promise<PurchaseOrder>}
   */
  async updatePurchaseOrder(id, updateData, userId) {
    const purchaseOrder = await purchaseOrderRepository.findById(id);
    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    // Don't allow editing if already confirmed or received
    if (['confirmed', 'partially_received', 'fully_received'].includes(purchaseOrder.status)) {
      throw new Error('Cannot edit purchase order that has been confirmed or received');
    }

    // Store old values for comparison
    const oldTotal = purchaseOrder.total;
    const oldSupplier = purchaseOrder.supplier;

    const updatedData = {
      ...updateData,
      lastModifiedBy: userId
    };

    const updatedPO = await purchaseOrderRepository.update(id, updatedData, {
      new: true,
      runValidators: true
    });

    // Handle supplier balance updates if supplier or total changed
    if (oldSupplier && oldTotal > 0) {
      try {
        // Reduce old supplier balance
        await supplierRepository.update(oldSupplier, {
          $inc: { pendingBalance: -oldTotal }
        });
      } catch (error) {
        logger.error('Error reducing old supplier balance:', error);
      }
    }

    if (updatedPO.supplier && updatedPO.total > 0) {
      try {
        // Add new supplier balance
        await supplierRepository.update(updatedPO.supplier, {
          $inc: { pendingBalance: updatedPO.total }
        });
      } catch (error) {
        logger.error('Error updating new supplier balance:', error);
      }
    }

    // Populate related fields
    await updatedPO.populate([
      { path: 'supplier', select: 'companyName contactPerson email phone businessType' },
      { path: 'items.product', select: 'name description pricing inventory' },
      { path: 'createdBy', select: 'firstName lastName email' },
      { path: 'lastModifiedBy', select: 'firstName lastName email' }
    ]);

    return updatedPO;
  }

  /**
   * Confirm a purchase order
   * @param {string} id - Purchase order ID
   * @returns {Promise<PurchaseOrder>}
   */
  async confirmPurchaseOrder(id) {
    const purchaseOrder = await purchaseOrderRepository.findById(id);
    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    if (purchaseOrder.status !== 'draft') {
      throw new Error('Only draft purchase orders can be confirmed');
    }

    purchaseOrder.status = 'confirmed';
    purchaseOrder.confirmedDate = new Date();
    await purchaseOrder.save();

    return purchaseOrder;
  }

  /**
   * Cancel a purchase order
   * @param {string} id - Purchase order ID
   * @param {string} userId - User ID performing the cancellation
   * @returns {Promise<PurchaseOrder>}
   */
  async cancelPurchaseOrder(id, userId) {
    const purchaseOrder = await purchaseOrderRepository.findById(id);
    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    if (['fully_received', 'cancelled', 'closed'].includes(purchaseOrder.status)) {
      throw new Error('Cannot cancel purchase order in current status');
    }

    // If confirmed, reduce supplier balance
    if (purchaseOrder.status === 'confirmed' && purchaseOrder.supplier && purchaseOrder.total > 0) {
      try {
        await supplierRepository.update(purchaseOrder.supplier, {
          $inc: { pendingBalance: -purchaseOrder.total }
        });
      } catch (error) {
        logger.error('Error reducing supplier balance on cancellation:', error);
      }
    }

    purchaseOrder.status = 'cancelled';
    purchaseOrder.cancelledDate = new Date();
    purchaseOrder.lastModifiedBy = userId;
    await purchaseOrder.save();

    return purchaseOrder;
  }

  /**
   * Close a purchase order
   * @param {string} id - Purchase order ID
   * @param {string} userId - User ID performing the closure
   * @returns {Promise<PurchaseOrder>}
   */
  async closePurchaseOrder(id, userId) {
    const purchaseOrder = await purchaseOrderRepository.findById(id);
    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    if (purchaseOrder.status !== 'fully_received') {
      throw new Error('Only fully received purchase orders can be closed');
    }

    purchaseOrder.status = 'closed';
    purchaseOrder.lastModifiedBy = userId;
    await purchaseOrder.save();

    return purchaseOrder;
  }

  /**
   * Delete a purchase order
   * @param {string} id - Purchase order ID
   * @returns {Promise<void>}
   */
  async deletePurchaseOrder(id) {
    const purchaseOrder = await purchaseOrderRepository.findById(id);
    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    // Only allow deletion of draft orders
    if (purchaseOrder.status !== 'draft') {
      throw new Error('Only draft purchase orders can be deleted');
    }

    // Reduce supplier balance if order was created
    if (purchaseOrder.supplier && purchaseOrder.total > 0) {
      try {
        await supplierRepository.update(purchaseOrder.supplier, {
          $inc: { pendingBalance: -purchaseOrder.total }
        });
      } catch (error) {
        logger.error('Error reducing supplier balance on deletion:', error);
      }
    }

    await purchaseOrderRepository.softDelete(id);
  }

  /**
   * Get purchase order for conversion
   * @param {string} id - Purchase order ID
   * @returns {Promise<object>}
   */
  async getPurchaseOrderForConversion(id) {
    const purchaseOrder = await purchaseOrderRepository.findById(id, {
      populate: [
        { path: 'items.product', select: 'name description pricing inventory' },
        { path: 'supplier', select: 'companyName contactPerson email phone businessType' }
      ]
    });

    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    // Filter items that have remaining quantities
    const availableItems = purchaseOrder.items.filter(item => item.remainingQuantity > 0);

    return {
      purchaseOrder: {
        _id: purchaseOrder._id,
        poNumber: purchaseOrder.poNumber,
        supplier: purchaseOrder.supplier,
        status: purchaseOrder.status
      },
      availableItems
    };
  }
}

module.exports = new PurchaseOrderService();

