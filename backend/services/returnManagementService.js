const Return = require('../models/Return');
const Sales = require('../models/Sales');
const SalesOrder = require('../models/SalesOrder');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const PurchaseOrder = require('../models/PurchaseOrder');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');
const CustomerBalanceService = require('../services/customerBalanceService');
const ReturnRepository = require('../repositories/ReturnRepository');
const SalesRepository = require('../repositories/SalesRepository');
const logger = require('../utils/logger');

class ReturnManagementService {
  constructor() {
    this.returnReasons = [
      'defective', 'wrong_item', 'not_as_described', 'damaged_shipping',
      'changed_mind', 'duplicate_order', 'size_issue', 'quality_issue',
      'late_delivery', 'other'
    ];
    
    this.returnActions = [
      'refund', 'exchange', 'store_credit', 'repair', 'replace'
    ];
  }

  // Create a new return request
  async createReturn(returnData, requestedBy) {
    try {
      // Validate original order - check if it's a sales return or purchase return
      const isPurchaseReturn = returnData.origin === 'purchase';
      
      let originalOrder;
      if (isPurchaseReturn) {
        // Try PurchaseInvoice first, then PurchaseOrder
        originalOrder = await PurchaseInvoice.findById(returnData.originalOrder)
          .populate('supplier')
          .populate('items.product');
        
        if (!originalOrder) {
          originalOrder = await PurchaseOrder.findById(returnData.originalOrder)
            .populate('supplier')
            .populate('items.product');
        }
      } else {
        // Try Sales first, then SalesOrder
        originalOrder = await Sales.findById(returnData.originalOrder)
          .populate('customer')
          .populate('items.product');
        
        if (!originalOrder) {
          originalOrder = await SalesOrder.findById(returnData.originalOrder)
            .populate('customer')
            .populate('items.product');
        }
      }
      
      if (!originalOrder) {
        throw new Error('Original order not found');
      }

      // Check if order is eligible for return (only for sales returns)
      if (!isPurchaseReturn) {
        const eligibility = await this.checkReturnEligibility(originalOrder, returnData.items);
        if (!eligibility.eligible) {
          throw new Error(eligibility.reason);
        }

        // Validate return items
        await this.validateReturnItems(originalOrder, returnData.items);
      }

      // Create return object
      const returnRequest = new Return({
        ...returnData,
        customer: isPurchaseReturn ? null : (originalOrder.customer?._id || originalOrder.customer),
        supplier: isPurchaseReturn ? (originalOrder.supplier?._id || originalOrder.supplier) : null,
        requestedBy,
        returnDate: new Date(),
        status: 'pending'
      });

      // Ensure policy object exists before any calculations
      if (!returnRequest.policy) {
        returnRequest.policy = { restockingFeePercent: 0 };
      }

      // Calculate refund amounts
      await this.calculateRefundAmounts(returnRequest);
      
      logger.info('Return amounts after calculation:', {
        totalRefundAmount: returnRequest.totalRefundAmount,
        totalRestockingFee: returnRequest.totalRestockingFee,
        netRefundAmount: returnRequest.netRefundAmount
      });

      // Save return request
      await returnRequest.save();
      
      logger.info('Return amounts after save:', {
        totalRefundAmount: returnRequest.totalRefundAmount,
        totalRestockingFee: returnRequest.totalRestockingFee,
        netRefundAmount: returnRequest.netRefundAmount
      });

      // Send notification to customer
      await this.notifyCustomer(returnRequest, 'return_requested');

      return returnRequest;
    } catch (error) {
      logger.error('Error creating return:', error);
      throw error;
    }
  }

  // Check if order is eligible for return
  async checkReturnEligibility(order, returnItems) {
    const now = new Date();
    const daysSinceOrder = Math.floor((now - order.createdAt) / (1000 * 60 * 60 * 24));
    
    // Check return window (default 30 days)
    const returnWindow = 30; // This could be configurable per product/category
    if (daysSinceOrder > returnWindow) {
      return {
        eligible: false,
        reason: `Return window has expired. Order is ${daysSinceOrder} days old.`
      };
    }

    // Check if items are returnable
    for (const returnItem of returnItems) {
      const orderItem = order.items.find(item => 
        item._id.toString() === returnItem.originalOrderItem.toString()
      );
      
      if (!orderItem) {
        return {
          eligible: false,
          reason: 'Item not found in original order'
        };
      }

      // Check if item is already returned
      const existingReturn = await Return.findOne({
        originalOrder: order._id,
        'items.originalOrderItem': returnItem.originalOrderItem,
        status: { $nin: ['rejected', 'cancelled'] }
      });

      if (existingReturn) {
        return {
          eligible: false,
          reason: 'Item has already been returned'
        };
      }

      // Check if return quantity exceeds order quantity
      const alreadyReturnedQuantity = await this.getAlreadyReturnedQuantity(
        order._id, 
        returnItem.originalOrderItem
      );
      
      if (returnItem.quantity + alreadyReturnedQuantity > orderItem.quantity) {
        return {
          eligible: false,
          reason: `Cannot return ${returnItem.quantity} items. Only ${orderItem.quantity - alreadyReturnedQuantity} items available for return.`
        };
      }
    }

    return { eligible: true };
  }

  // Validate return items
  async validateReturnItems(originalOrder, returnItems) {
    for (const returnItem of returnItems) {
      // Find the original order item
      const orderItem = originalOrder.items.find(item => 
        item._id.toString() === returnItem.originalOrderItem.toString()
      );

      if (!orderItem) {
        throw new Error(`Order item not found: ${returnItem.originalOrderItem}`);
      }

      // Validate product exists
      const product = await Product.findById(orderItem.product._id);
      if (!product) {
        throw new Error(`Product not found: ${orderItem.product._id}`);
      }

      // Always set original price from order (override any frontend value)
      returnItem.originalPrice = Number(orderItem.price) || 0;
      logger.info(`Set originalPrice for item ${returnItem.product}: ${returnItem.originalPrice}`);
      
      // Always set default values for optional fields (override any frontend value)
      // Handle string "undefined" or actual undefined values
      returnItem.refundAmount = Number(returnItem.refundAmount) || 0;
      returnItem.restockingFee = Number(returnItem.restockingFee) || 0;
      logger.info(`Set refundAmount: ${returnItem.refundAmount}, restockingFee: ${returnItem.restockingFee} for item ${returnItem.product}`);
    }
  }

  // Calculate refund amounts for return items
  async calculateRefundAmounts(returnRequest) {
    logger.info('Calculating refund amounts for return items...');
    for (const item of returnRequest.items) {
      logger.info(`Processing item: ${item.product}, originalPrice: ${item.originalPrice}, quantity: ${item.quantity}`);
      
      // Calculate restocking fee based on condition and policy
      const baseFee = Number(returnRequest.policy?.restockingFeePercent) || 0;
      const restockingFeePercent = this.calculateRestockingFee(
        item.condition,
        item.returnReason,
        baseFee
      );
      
      logger.info(`Restocking fee percent: ${restockingFeePercent}%`);
      
      item.restockingFee = (item.originalPrice * item.quantity * restockingFeePercent) / 100;
      
      // Calculate refund amount
      item.refundAmount = (item.originalPrice * item.quantity) - item.restockingFee;
      
      logger.info(`Calculated amounts - refundAmount: ${item.refundAmount}, restockingFee: ${item.restockingFee}`);
    }
    
    logger.info('All item amounts calculated. Return totals will be calculated in pre-save middleware.');
  }

  // Calculate restocking fee based on various factors
  calculateRestockingFee(condition, returnReason, baseFeePercent) {
    let feePercent = baseFeePercent || 0;
    
    // Adjust fee based on condition
    switch (condition) {
      case 'new':
      case 'like_new':
        feePercent *= 0.5; // Reduce fee for good condition
        break;
      case 'good':
        break; // No adjustment
      case 'fair':
        feePercent *= 1.5; // Increase fee for fair condition
        break;
      case 'poor':
      case 'damaged':
        feePercent *= 2; // Double fee for poor condition
        break;
    }
    
    // Adjust fee based on return reason
    switch (returnReason) {
      case 'defective':
      case 'wrong_item':
      case 'damaged_shipping':
        feePercent = 0; // No fee for store error
        break;
      case 'changed_mind':
        feePercent *= 1.5; // Higher fee for change of mind
        break;
    }
    
    return Math.min(feePercent, 100); // Cap at 100%
  }

  // Get already returned quantity for an order item
  async getAlreadyReturnedQuantity(orderId, orderItemId) {
    const returns = await ReturnRepository.findAll({
      originalOrder: orderId,
      'items.originalOrderItem': orderItemId,
      status: { $nin: ['rejected', 'cancelled'] }
    });

    let totalReturned = 0;
    returns.forEach(returnDoc => {
      returnDoc.items.forEach(item => {
        if (item.originalOrderItem.toString() === orderItemId.toString()) {
          totalReturned += item.quantity;
        }
      });
    });

    return totalReturned;
  }

  // Approve return request
  async approveReturn(returnId, approvedBy, notes = null) {
    try {
      const returnRequest = await ReturnRepository.findById(returnId);
      if (!returnRequest) {
        throw new Error('Return request not found');
      }

      if (returnRequest.status !== 'pending') {
        throw new Error('Return request cannot be approved in current status');
      }

      // Update status to approved
      await returnRequest.updateStatus('approved', approvedBy, notes);

      // Send approval notification
      await this.notifyCustomer(returnRequest, 'return_approved');

      return returnRequest;
    } catch (error) {
      logger.error('Error approving return:', error);
      throw error;
    }
  }

  // Reject return request
  async rejectReturn(returnId, rejectedBy, reason) {
    try {
      const returnRequest = await ReturnRepository.findById(returnId);
      if (!returnRequest) {
        throw new Error('Return request not found');
      }

      if (returnRequest.status !== 'pending') {
        throw new Error('Return request cannot be rejected in current status');
      }

      // Update status to rejected
      await returnRequest.updateStatus('rejected', rejectedBy, `Rejected: ${reason}`);

      // Send rejection notification
      await this.notifyCustomer(returnRequest, 'return_rejected');

      return returnRequest;
    } catch (error) {
      logger.error('Error rejecting return:', error);
      throw error;
    }
  }

  // Process received return
  async processReceivedReturn(returnId, receivedBy, inspectionData = {}) {
    try {
      const returnRequest = await ReturnRepository.findById(returnId, [
        { path: 'originalOrder' },
        { path: 'items.product' }
      ]);
      
      if (!returnRequest) {
        throw new Error('Return request not found');
      }

      if (!['approved', 'processing'].includes(returnRequest.status)) {
        throw new Error('Return cannot be processed in current status');
      }

      // Update status to received
      await returnRequest.updateStatus('received', receivedBy);

      // Add inspection data
      if (inspectionData) {
        returnRequest.inspection = {
          ...inspectionData,
          inspectedBy: receivedBy,
          inspectionDate: new Date()
        };
        await returnRequest.save();
      }

      // Update inventory for returned items
      await this.updateInventoryForReturn(returnRequest);

      // Process refund or exchange
      if (returnRequest.returnType === 'return') {
        await this.processRefund(returnRequest);
      } else if (returnRequest.returnType === 'exchange') {
        await this.processExchange(returnRequest);
      }

      // Update status to completed
      await returnRequest.updateStatus('completed', receivedBy);

      // Send completion notification
      await this.notifyCustomer(returnRequest, 'return_completed');

      return returnRequest;
    } catch (error) {
      logger.error('Error processing return:', error);
      throw error;
    }
  }

  // Update inventory for returned items
  async updateInventoryForReturn(returnRequest) {
    for (const item of returnRequest.items) {
      // Find or create inventory record
      let inventory = await Inventory.findOne({
        product: item.product._id
      });

      if (!inventory) {
        inventory = new Inventory({
          product: item.product._id,
          currentStock: 0,
          reservedStock: 0,
          reorderPoint: 0,
          reorderQuantity: 0
        });
      }

      // Add returned quantity to inventory if item is resellable
      if (returnRequest.inspection && returnRequest.inspection.resellable !== false) {
        inventory.currentStock += item.quantity;
        await inventory.save();

        // Log inventory movement
        await this.logInventoryMovement(item, 'return', item.quantity);
      }
    }
  }

  // Log inventory movement
  async logInventoryMovement(item, type, quantity) {
    // This would integrate with your existing inventory movement logging
    logger.info(`Inventory movement: ${type} - ${item.product.name} - ${quantity} units`);
  }

  // Process refund
  async processRefund(returnRequest) {
    try {
      // Create refund transaction
      const refundTransaction = new Transaction({
        transactionId: `REF-${Date.now()}`,
        type: 'refund',
        amount: returnRequest.netRefundAmount,
        status: 'completed',
        payment: {
          method: returnRequest.refundMethod,
          reference: `Return ${returnRequest.returnNumber}`
        },
        metadata: {
          returnId: returnRequest._id,
          originalOrder: returnRequest.originalOrder
        }
      });

      await refundTransaction.save();

      // Update return with refund details
      returnRequest.refundDetails = {
        refundTransaction: refundTransaction._id,
        refundDate: new Date(),
        refundReference: refundTransaction.transactionId
      };

      await returnRequest.save();

      // Adjust customer balance (credit note behavior)
      try {
        await CustomerBalanceService.recordRefund(
          returnRequest.customer,
          Number(returnRequest.netRefundAmount) || 0,
          returnRequest.originalOrder
        );
      } catch (balanceErr) {
        // Log but do not fail the whole return completion
        logger.error('Error updating customer balance for return refund:', balanceErr);
      }

      return refundTransaction;
    } catch (error) {
      logger.error('Error processing refund:', error);
      throw error;
    }
  }

  // Process exchange
  async processExchange(returnRequest) {
    try {
      // Create new order for exchange items
      const exchangeOrder = new Sales({
        orderNumber: `EXC-${Date.now()}`,
        customer: returnRequest.customer,
        items: returnRequest.exchangeDetails.exchangeItems,
        orderType: 'exchange',
        status: 'completed',
        metadata: {
          originalReturn: returnRequest._id,
          exchangeType: 'return_exchange'
        }
      });

      await exchangeOrder.save();

      // Update return with exchange details
      returnRequest.exchangeDetails.exchangeOrder = exchangeOrder._id;
      await returnRequest.save();

      return exchangeOrder;
    } catch (error) {
      logger.error('Error processing exchange:', error);
      throw error;
    }
  }

  // Notify customer about return status
  async notifyCustomer(returnRequest, notificationType) {
    try {
      const customer = await Customer.findById(returnRequest.customer);
      if (!customer) return;

      const messages = {
        return_requested: `Your return request ${returnRequest.returnNumber} has been submitted and is under review.`,
        return_approved: `Your return request ${returnRequest.returnNumber} has been approved. Please ship items back.`,
        return_rejected: `Your return request ${returnRequest.returnNumber} has been rejected. Contact support for details.`,
        return_completed: `Your return request ${returnRequest.returnNumber} has been completed. Refund processed.`
      };

      const message = messages[notificationType];
      if (message) {
        await returnRequest.addCommunication(
          'email',
          message,
          null, // System generated
          customer.email
        );
      }
    } catch (error) {
      logger.error('Error notifying customer:', error);
    }
  }

  // Get return statistics
  async getReturnStats(period = {}) {
    try {
      const stats = await ReturnRepository.getStats(period);
      
      // Get additional metrics
      const filter = period.startDate && period.endDate ? {
        returnDate: {
          $gte: period.startDate,
          $lte: period.endDate
        }
      } : {};
      
      const totalReturns = await ReturnRepository.count(filter);

      const pendingFilter = {
        status: 'pending',
        ...(period.startDate && period.endDate ? {
          returnDate: {
            $gte: period.startDate,
            $lte: period.endDate
          }
        } : {})
      };
      const pendingReturns = await ReturnRepository.count(pendingFilter);

      const averageProcessingTime = await this.calculateAverageProcessingTime(period);

      // Calculate status and type breakdowns
      const statusBreakdown = {};
      const typeBreakdown = {};
      if (stats.byStatus && Array.isArray(stats.byStatus)) {
        stats.byStatus.forEach(status => {
          statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
        });
      }
      if (stats.byType && Array.isArray(stats.byType)) {
        stats.byType.forEach(type => {
          typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
        });
      }

      return {
        totalReturns,
        pendingReturns,
        totalRefundAmount: stats.totalRefundAmount || 0,
        totalRestockingFee: stats.totalRestockingFee || 0,
        netRefundAmount: stats.netRefundAmount || 0,
        averageRefundAmount: totalReturns > 0 ? (stats.totalRefundAmount || 0) / totalReturns : 0,
        averageProcessingTime,
        returnRate: await this.calculateReturnRate(period),
        statusBreakdown,
        typeBreakdown
      };
    } catch (error) {
      logger.error('Error getting return stats:', error);
      throw error;
    }
  }

  // Calculate average processing time
  async calculateAverageProcessingTime(period = {}) {
    const match = {
      status: 'completed',
      ...(period.startDate && period.endDate ? {
        returnDate: {
          $gte: period.startDate,
          $lte: period.endDate
        }
      } : {})
    };

    const result = await Return.aggregate([
      { $match: match },
      {
        $project: {
          processingTime: {
            $divide: [
              { $subtract: ['$completionDate', '$returnDate'] },
              1000 * 60 * 60 * 24 // Convert to days
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          averageProcessingTime: { $avg: '$processingTime' }
        }
      }
    ]);

    return result[0]?.averageProcessingTime || 0;
  }

  // Calculate return rate
  async calculateReturnRate(period = {}) {
    const match = period.startDate && period.endDate ? {
      createdAt: {
        $gte: period.startDate,
        $lte: period.endDate
      }
    } : {};

    const totalOrders = await Sales.countDocuments(match);
    const totalReturns = await Return.countDocuments({
      ...match,
      status: { $nin: ['rejected', 'cancelled'] }
    });

    return totalOrders > 0 ? (totalReturns / totalOrders) * 100 : 0;
  }

  // Get return trends
  async getReturnTrends(periods = 12) {
    try {
      const trends = await ReturnRepository.getTrends(periods);
      
      // Format trends data
      return trends.map(trend => ({
        period: `${trend._id.year}-${String(trend._id.month).padStart(2, '0')}`,
        totalReturns: trend.count || 0,
        totalRefundAmount: trend.totalRefundAmount || 0,
        averageRefundAmount: trend.averageRefundAmount || 0
      }));
    } catch (error) {
      logger.error('Error getting return trends:', error);
      throw error;
    }
  }

  // Get returns with filters and pagination
  async getReturns(queryParams) {
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 10;

    const filter = {};

    // Apply filters
    if (queryParams.status) filter.status = queryParams.status;
    if (queryParams.returnType) filter.returnType = queryParams.returnType;
    if (queryParams.customer) filter.customer = queryParams.customer;
    if (queryParams.priority) filter.priority = queryParams.priority;

    // Date range filter
    if (queryParams.startDate || queryParams.endDate) {
      filter.returnDate = {};
      if (queryParams.startDate) filter.returnDate.$gte = queryParams.startDate;
      if (queryParams.endDate) filter.returnDate.$lte = queryParams.endDate;
    }

    // Search filter
    if (queryParams.search) {
      filter.$or = [
        { returnNumber: { $regex: queryParams.search, $options: 'i' } },
        { 'customer.firstName': { $regex: queryParams.search, $options: 'i' } },
        { 'customer.lastName': { $regex: queryParams.search, $options: 'i' } }
      ];
    }

    const result = await ReturnRepository.findWithPagination(filter, {
      page,
      limit,
      sort: { returnDate: -1 }
    });

    return {
      returns: result.returns,
      pagination: result.pagination
    };
  }

  // Get single return by ID
  async getReturnById(returnId) {
    const returnRequest = await ReturnRepository.findById(returnId, [
      { path: 'originalOrder', populate: { path: 'customer' } },
      { path: 'customer', select: 'name businessName email phone firstName lastName' },
      { path: 'supplier', select: 'name businessName email phone companyName contactPerson' },
      { path: 'items.product', select: 'name description pricing' },
      { path: 'requestedBy', select: 'firstName lastName email' },
      { path: 'approvedBy', select: 'firstName lastName email' },
      { path: 'processedBy', select: 'firstName lastName email' }
    ]);

    if (!returnRequest) {
      throw new Error('Return request not found');
    }

    return returnRequest;
  }

  // Update return inspection details
  async updateInspection(returnId, inspectionData, userId) {
    const returnRequest = await ReturnRepository.findById(returnId);
    if (!returnRequest) {
      throw new Error('Return request not found');
    }

    returnRequest.inspection = {
      inspectedBy: userId,
      inspectionDate: new Date(),
      ...inspectionData
    };

    await returnRequest.save();
    return returnRequest;
  }

  // Add note to return
  async addNote(returnId, note, userId, isInternal = false) {
    const returnRequest = await ReturnRepository.findById(returnId);
    if (!returnRequest) {
      throw new Error('Return request not found');
    }

    await returnRequest.addNote(note, userId, isInternal);
    return returnRequest;
  }

  // Add communication log to return
  async addCommunication(returnId, type, message, userId, recipient) {
    const returnRequest = await ReturnRepository.findById(returnId);
    if (!returnRequest) {
      throw new Error('Return request not found');
    }

    await returnRequest.addCommunication(type, message, userId, recipient);
    return returnRequest;
  }

  // Cancel return request
  async cancelReturn(returnId, userId) {
    const returnRequest = await ReturnRepository.findById(returnId);
    if (!returnRequest) {
      throw new Error('Return request not found');
    }

    if (returnRequest.status !== 'pending') {
      throw new Error('Only pending return requests can be cancelled');
    }

    await returnRequest.updateStatus('cancelled', userId, 'Return request cancelled');
    return returnRequest;
  }

  // Delete return request
  async deleteReturn(returnId) {
    const returnRequest = await ReturnRepository.findById(returnId);
    if (!returnRequest) {
      throw new Error('Return request not found');
    }

    if (!['pending', 'cancelled'].includes(returnRequest.status)) {
      throw new Error('Only pending or cancelled return requests can be deleted');
    }

    await ReturnRepository.softDelete(returnId);
    return { message: 'Return request deleted successfully' };
  }
}

module.exports = new ReturnManagementService();
