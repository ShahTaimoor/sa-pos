const express = require('express');
const { body, param, query } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { handleValidationErrors, sanitizeRequest } = require('../middleware/validation');
const Return = require('../models/Return');
const Sales = require('../models/Sales');
const returnManagementService = require('../services/returnManagementService');

const router = express.Router();

// @route   POST /api/returns
// @desc    Create a new return request
// @access  Private (requires 'create_orders' permission)
router.post('/', [
  auth,
  requirePermission('create_orders'),
  sanitizeRequest,
  body('originalOrder').isMongoId().withMessage('Valid original order ID is required'),
  body('returnType').isIn(['return', 'exchange', 'warranty', 'recall']).withMessage('Valid return type is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one return item is required'),
  body('items.*.product').isMongoId().withMessage('Valid product ID is required'),
  body('items.*.originalOrderItem').isMongoId().withMessage('Valid order item ID is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Valid quantity is required'),
  body('items.*.returnReason').isIn([
    'defective', 'wrong_item', 'not_as_described', 'damaged_shipping',
    'changed_mind', 'duplicate_order', 'size_issue', 'quality_issue',
    'late_delivery', 'other'
  ]).withMessage('Valid return reason is required'),
  body('items.*.condition').isIn(['new', 'like_new', 'good', 'fair', 'poor', 'damaged']).withMessage('Valid condition is required'),
  body('items.*.action').isIn(['refund', 'exchange', 'store_credit', 'repair', 'replace']).withMessage('Valid action is required'),
  body('items.*.originalPrice').optional().isFloat({ min: 0 }).withMessage('Valid original price is required'),
  body('items.*.refundAmount').optional().isFloat({ min: 0 }).withMessage('Valid refund amount is required'),
  body('items.*.restockingFee').optional().isFloat({ min: 0 }).withMessage('Valid restocking fee is required'),
  body('items.*.generalNotes').optional().isString().isLength({ max: 1000 }).withMessage('General notes must be less than 1000 characters'),
  body('refundMethod').optional().isIn(['original_payment', 'store_credit', 'cash', 'check', 'bank_transfer']),
  body('priority').optional().isIn(['low', 'normal', 'high', 'urgent']),
  body('generalNotes').optional().trim().isLength({ max: 1000 }),
  handleValidationErrors,
], async (req, res) => {
  try {
    const returnData = {
      ...req.body,
      requestedBy: req.user._id
    };

    const returnRequest = await returnManagementService.createReturn(returnData, req.user._id);
    
    // Populate the return with related data
    await returnRequest.populate([
      { path: 'originalOrder', populate: { path: 'customer' } },
      { path: 'customer', select: 'name businessName email phone' },
      { path: 'items.product' },
      { path: 'requestedBy', select: 'firstName lastName email' }
    ]);

    res.status(201).json({
      message: 'Return request created successfully',
      return: returnRequest
    });
  } catch (error) {
    console.error('Error creating return:', error);
    res.status(400).json({ message: error.message });
  }
});

// @route   GET /api/returns
// @desc    Get list of returns with filters
// @access  Private (requires 'view_orders' permission)
router.get('/', [
  auth,
  requirePermission('view_orders'),
  sanitizeRequest,
  query('page').optional({ checkFalsy: true }).isInt({ min: 1 }),
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }),
  query('status').optional({ checkFalsy: true }).isIn([
    'pending', 'approved', 'rejected', 'processing', 'received',
    'inspected', 'refunded', 'exchanged', 'completed', 'cancelled'
  ]),
  query('returnType').optional({ checkFalsy: true }).isIn(['return', 'exchange', 'warranty', 'recall']),
  query('customer').optional({ checkFalsy: true }).isMongoId(),
  query('startDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  query('endDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  query('priority').optional({ checkFalsy: true }).isIn(['low', 'normal', 'high', 'urgent']),
  query('search').optional({ checkFalsy: true }).trim(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      returnType,
      customer,
      startDate,
      endDate,
      priority,
      search
    } = req.query;

    const skip = (page - 1) * limit;
    const filter = {};

    // Apply filters
    if (status) filter.status = status;
    if (returnType) filter.returnType = returnType;
    if (customer) filter.customer = customer;
    if (priority) filter.priority = priority;

    // Date range filter
    if (startDate || endDate) {
      filter.returnDate = {};
      if (startDate) filter.returnDate.$gte = startDate;
      if (endDate) filter.returnDate.$lte = endDate;
    }

    // Search filter
    if (search) {
      filter.$or = [
        { returnNumber: { $regex: search, $options: 'i' } },
        { 'customer.firstName': { $regex: search, $options: 'i' } },
        { 'customer.lastName': { $regex: search, $options: 'i' } }
      ];
    }

    const returns = await Return.find(filter)
      .populate([
        { path: 'originalOrder', select: 'orderNumber createdAt' },
        { path: 'customer', select: 'name businessName email phone' },
        { path: 'items.product', select: 'name description' },
        { path: 'requestedBy', select: 'name businessName' },
        { path: 'approvedBy', select: 'name businessName' },
        { path: 'processedBy', select: 'name businessName' }
      ])
      .sort({ returnDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Return.countDocuments(filter);

    res.json({
      returns,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(500).json({ message: 'Server error fetching returns', error: error.message });
  }
});

// @route   GET /api/returns/:returnId
// @desc    Get detailed return information
// @access  Private (requires 'view_orders' permission)
router.get('/:returnId', [
  auth,
  requirePermission('view_orders'),
  sanitizeRequest,
  param('returnId').isMongoId().withMessage('Valid Return ID is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { returnId } = req.params;
    
    const returnRequest = await Return.findById(returnId)
      .populate([
        { 
          path: 'originalOrder',
          populate: [
            { path: 'customer', select: 'name businessName email phone' },
            { path: 'items.product', select: 'name description pricing' }
          ]
        },
        { path: 'customer', select: 'name businessName email phone' },
        { path: 'items.product', select: 'name description pricing category' },
        { path: 'requestedBy', select: 'firstName lastName email' },
        { path: 'approvedBy', select: 'firstName lastName email' },
        { path: 'processedBy', select: 'firstName lastName email' },
        { path: 'receivedBy', select: 'firstName lastName email' },
        { path: 'inspection.inspectedBy', select: 'firstName lastName email' }
      ]);

    if (!returnRequest) {
      return res.status(404).json({ message: 'Return request not found' });
    }
    
    // Debug: Log the return data to see if amounts are present
    console.log('Return data fetched for ID:', returnId);
    console.log('Total refund amount:', returnRequest.totalRefundAmount);
    console.log('Total restocking fee:', returnRequest.totalRestockingFee);
    console.log('Net refund amount:', returnRequest.netRefundAmount);
    console.log('Items with amounts:', returnRequest.items.map(item => ({
      product: item.product?.name,
      refundAmount: item.refundAmount,
      restockingFee: item.restockingFee
    })));

    res.json(returnRequest);
  } catch (error) {
    console.error('Error fetching return:', error);
    res.status(500).json({ message: 'Server error fetching return', error: error.message });
  }
});

// @route   PUT /api/returns/:returnId/status
// @desc    Update return status
// @access  Private (requires 'edit_orders' permission)
router.put('/:returnId/status', [
  auth,
  requirePermission('edit_orders'),
  sanitizeRequest,
  param('returnId').isMongoId().withMessage('Valid Return ID is required'),
  body('status').isIn([
    'pending', 'approved', 'rejected', 'processing', 'received',
    'inspected', 'refunded', 'exchanged', 'completed', 'cancelled'
  ]).withMessage('Valid status is required'),
  body('notes').optional().trim(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { returnId } = req.params;
    const { status, notes } = req.body;
    
    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({ message: 'Return request not found' });
    }

    // Handle different status changes
    switch (status) {
      case 'approved':
        await returnManagementService.approveReturn(returnId, req.user._id, notes);
        break;
      case 'rejected':
        if (!notes) {
          return res.status(400).json({ message: 'Rejection reason is required' });
        }
        await returnManagementService.rejectReturn(returnId, req.user._id, notes);
        break;
      case 'received':
        await returnManagementService.processReceivedReturn(returnId, req.user._id);
        break;
      default:
        await returnRequest.updateStatus(status, req.user._id, notes);
    }

    // Populate the updated return
    await returnRequest.populate([
      { path: 'originalOrder', select: 'orderNumber createdAt' },
      { path: 'customer', select: 'name businessName email' },
      { path: 'items.product', select: 'name description' },
      { path: 'requestedBy', select: 'name businessName' },
      { path: 'approvedBy', select: 'name businessName' },
      { path: 'processedBy', select: 'name businessName' }
    ]);

    res.json({
      message: 'Return status updated successfully',
      return: returnRequest
    });
  } catch (error) {
    console.error('Error updating return status:', error);
    res.status(400).json({ message: error.message });
  }
});

// @route   PUT /api/returns/:returnId/inspection
// @desc    Update return inspection details
// @access  Private (requires 'edit_orders' permission)
router.put('/:returnId/inspection', [
  auth,
  requirePermission('edit_orders'),
  sanitizeRequest,
  param('returnId').isMongoId().withMessage('Valid Return ID is required'),
  body('inspectionNotes').optional().trim(),
  body('conditionVerified').optional().isBoolean(),
  body('resellable').optional().isBoolean(),
  body('disposalRequired').optional().isBoolean(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { returnId } = req.params;
    const { inspectionNotes, conditionVerified, resellable, disposalRequired } = req.body;
    
    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({ message: 'Return request not found' });
    }

    // Update inspection details
    returnRequest.inspection = {
      inspectedBy: req.user._id,
      inspectionDate: new Date(),
      inspectionNotes,
      conditionVerified,
      resellable,
      disposalRequired
    };

    await returnRequest.save();

    res.json({
      message: 'Inspection details updated successfully',
      return: returnRequest
    });
  } catch (error) {
    console.error('Error updating inspection:', error);
    res.status(500).json({ message: 'Server error updating inspection', error: error.message });
  }
});

// @route   POST /api/returns/:returnId/notes
// @desc    Add note to return
// @access  Private (requires 'view_orders' permission)
router.post('/:returnId/notes', [
  auth,
  requirePermission('view_orders'),
  sanitizeRequest,
  param('returnId').isMongoId().withMessage('Valid Return ID is required'),
  body('note').trim().isLength({ min: 1 }).withMessage('Note is required'),
  body('isInternal').optional().isBoolean(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { returnId } = req.params;
    const { note, isInternal = false } = req.body;
    
    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({ message: 'Return request not found' });
    }

    await returnRequest.addNote(note, req.user._id, isInternal);

    res.json({
      message: 'Note added successfully',
      return: returnRequest
    });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ message: 'Server error adding note', error: error.message });
  }
});

// @route   POST /api/returns/:returnId/communication
// @desc    Add communication log to return
// @access  Private (requires 'view_orders' permission)
router.post('/:returnId/communication', [
  auth,
  requirePermission('view_orders'),
  sanitizeRequest,
  param('returnId').isMongoId().withMessage('Valid Return ID is required'),
  body('type').isIn(['email', 'phone', 'in_person', 'system']).withMessage('Valid communication type is required'),
  body('message').trim().isLength({ min: 1 }).withMessage('Message is required'),
  body('recipient').optional().trim(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { returnId } = req.params;
    const { type, message, recipient } = req.body;
    
    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({ message: 'Return request not found' });
    }

    await returnRequest.addCommunication(type, message, req.user._id, recipient);

    res.json({
      message: 'Communication logged successfully',
      return: returnRequest
    });
  } catch (error) {
    console.error('Error adding communication:', error);
    res.status(500).json({ message: 'Server error adding communication', error: error.message });
  }
});

// @route   GET /api/returns/stats
// @desc    Get return statistics
// @access  Private (requires 'view_reports' permission)
router.get('/stats', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  query('startDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  query('endDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const period = startDate && endDate ? { startDate, endDate } : {};
    const stats = await returnManagementService.getReturnStats(period);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching return stats:', error);
    res.status(500).json({ message: 'Server error fetching return stats', error: error.message });
  }
});

// @route   GET /api/returns/trends
// @desc    Get return trends over time
// @access  Private (requires 'view_reports' permission)
router.get('/trends', [
  auth,
  requirePermission('view_reports'),
  sanitizeRequest,
  query('periods').optional({ checkFalsy: true }).isInt({ min: 1, max: 24 }),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { periods = 12 } = req.query;
    const trends = await returnManagementService.getReturnTrends(parseInt(periods));

    res.json({
      trends,
      totalPeriods: trends.length
    });
  } catch (error) {
    console.error('Error fetching return trends:', error);
    res.status(500).json({ message: 'Server error fetching return trends', error: error.message });
  }
});

// @route   GET /api/returns/order/:orderId/eligible-items
// @desc    Get eligible items for return from an order
// @access  Private (requires 'view_orders' permission)
router.get('/order/:orderId/eligible-items', [
  auth,
  requirePermission('view_orders'),
  sanitizeRequest,
  param('orderId').isMongoId().withMessage('Valid Order ID is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Sales.findById(orderId)
      .populate('customer')
      .populate('items.product');
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check return eligibility for each item
    const eligibleItems = [];
    
    for (const item of order.items) {
      const alreadyReturnedQuantity = await returnManagementService.getAlreadyReturnedQuantity(
        order._id,
        item._id
      );
      
      const availableForReturn = item.quantity - alreadyReturnedQuantity;
      
      if (availableForReturn > 0) {
        eligibleItems.push({
          orderItem: item,
          availableQuantity: availableForReturn,
          alreadyReturned: alreadyReturnedQuantity
        });
      }
    }

    res.json({
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        customer: order.customer
      },
      eligibleItems
    });
  } catch (error) {
    console.error('Error fetching eligible items:', error);
    res.status(500).json({ message: 'Server error fetching eligible items', error: error.message });
  }
});

// @route   PUT /api/returns/:returnId/cancel
// @desc    Cancel a pending return request (status -> cancelled)
// @access  Private (requires 'edit_orders' permission)
router.put('/:returnId/cancel', [
  auth,
  requirePermission('edit_orders'),
  sanitizeRequest,
  param('returnId').isMongoId().withMessage('Valid Return ID is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { returnId } = req.params;
    
    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({ message: 'Return request not found' });
    }

    // Only allow cancellation of pending returns
    if (returnRequest.status !== 'pending') {
      return res.status(400).json({ 
        message: 'Only pending return requests can be cancelled' 
      });
    }

    await returnRequest.updateStatus('cancelled', req.user._id, 'Return request cancelled');

    res.json({ message: 'Return request cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling return:', error);
    res.status(500).json({ message: 'Server error cancelling return', error: error.message });
  }
});

// @route   DELETE /api/returns/:returnId
// @desc    Permanently delete a return request (pending or cancelled only)
// @access  Private (Admin only)
router.delete('/:returnId', [
  auth,
  requirePermission('delete_returns'),
  sanitizeRequest,
  param('returnId').isMongoId().withMessage('Valid Return ID is required'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { returnId } = req.params;
    
    const returnRequest = await Return.findById(returnId);
    
    if (!returnRequest) {
      return res.status(404).json({ message: 'Return request not found' });
    }

    // Only allow deletion of pending or cancelled returns
    if (!['pending', 'cancelled'].includes(returnRequest.status)) {
      return res.status(400).json({ 
        message: 'Only pending or cancelled return requests can be deleted' 
      });
    }

    // Delete the return request
    await Return.findByIdAndDelete(returnId);

    res.json({ message: 'Return request deleted successfully' });
  } catch (error) {
    console.error('Error deleting return:', error);
    res.status(500).json({ message: 'Server error deleting return', error: error.message });
  }
});

module.exports = router;
