const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const DropShipping = require('../models/DropShipping');
const Supplier = require('../models/Supplier');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const { auth, requirePermission } = require('../middleware/auth');

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// @route   GET /api/drop-shipping
// @desc    Get all drop shipping transactions with filters
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      supplier,
      customer,
      startDate,
      endDate,
      search
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (status) filter.status = status;
    if (supplier) filter.supplier = supplier;
    if (customer) filter.customer = customer;
    
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) filter.transactionDate.$lte = new Date(endDate);
    }
    
    if (search) {
      filter.$or = [
        { transactionNumber: { $regex: search, $options: 'i' } },
        { 'supplierInfo.companyName': { $regex: search, $options: 'i' } },
        { 'customerInfo.displayName': { $regex: search, $options: 'i' } },
        { trackingNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const transactions = await DropShipping.find(filter)
      .populate('supplier', 'companyName contactPerson email phone businessType')
      .populate('customer', 'displayName firstName lastName email phone businessType')
      .populate('items.product', 'name description pricing inventory')
      .populate('createdBy', 'firstName lastName email')
      .populate('lastModifiedBy', 'firstName lastName email')
      .sort({ transactionDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DropShipping.countDocuments(filter);

    res.json({
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get drop shipping transactions error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/drop-shipping/stats
// @desc    Get drop shipping statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {};
    
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) filter.transactionDate.$lte = new Date(endDate);
    }

    const stats = await DropShipping.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalSupplierAmount: { $sum: '$supplierTotal' },
          totalCustomerAmount: { $sum: '$customerTotal' },
          totalProfit: { $sum: '$totalProfit' },
          avgMargin: { $avg: '$averageMargin' }
        }
      }
    ]);

    const statusBreakdown = await DropShipping.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      overall: stats[0] || {
        totalTransactions: 0,
        totalSupplierAmount: 0,
        totalCustomerAmount: 0,
        totalProfit: 0,
        avgMargin: 0
      },
      statusBreakdown
    });
  } catch (error) {
    console.error('Get drop shipping stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/drop-shipping/:id
// @desc    Get single drop shipping transaction
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const transaction = await DropShipping.findById(req.params.id)
      .populate('supplier', 'companyName contactPerson email phone businessType currentBalance pendingBalance')
      .populate('customer', 'displayName firstName lastName email phone businessType currentBalance pendingBalance creditLimit')
      .populate('items.product', 'name description pricing inventory')
      .populate('createdBy', 'firstName lastName email')
      .populate('lastModifiedBy', 'firstName lastName email');

    if (!transaction) {
      return res.status(404).json({ message: 'Drop shipping transaction not found' });
    }

    res.json({ transaction });
  } catch (error) {
    console.error('Get drop shipping transaction error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/drop-shipping
// @desc    Create new drop shipping transaction
// @access  Private
router.post('/', [
  auth,
  requirePermission('create_drop_shipping'),
  body('supplier').isMongoId().withMessage('Valid supplier is required'),
  body('customer').isMongoId().withMessage('Valid customer is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').isMongoId().withMessage('Valid product is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.supplierRate').isFloat({ min: 0 }).withMessage('Supplier rate must be positive'),
  body('items.*.customerRate').isFloat({ min: 0 }).withMessage('Customer rate must be positive'),
  handleValidationErrors
], async (req, res) => {
  try {
    // Verify supplier and customer exist
    const supplier = await Supplier.findById(req.body.supplier);
    if (!supplier) {
      return res.status(400).json({ message: 'Supplier not found' });
    }

    const customer = await Customer.findById(req.body.customer);
    if (!customer) {
      return res.status(400).json({ message: 'Customer not found' });
    }

    // Verify all products exist
    const productIds = req.body.items.map(item => item.product);
    const products = await Product.find({ _id: { $in: productIds } });
    
    if (products.length !== productIds.length) {
      return res.status(400).json({ message: 'One or more products not found' });
    }

    // Build transaction data
    const transactionData = {
      ...req.body,
      supplierInfo: {
        companyName: supplier.companyName,
        contactPerson: supplier.contactPerson?.name || '',
        email: supplier.email || '',
        phone: supplier.phone || ''
      },
      customerInfo: {
        displayName: customer.displayName || customer.name,
        businessName: customer.businessName || '',
        email: customer.email || '',
        phone: customer.phone || '',
        businessType: customer.businessType || ''
      },
      createdBy: req.user._id,
      lastModifiedBy: req.user._id
    };

    // Create transaction
    const transaction = new DropShipping(transactionData);
    await transaction.save();

    // Update balances for suppliers and customers
    await Supplier.findByIdAndUpdate(
      supplier._id,
      { $inc: { pendingBalance: transaction.supplierTotal } }
    );

    if (transaction.customerPayment.method === 'account') {
      await Customer.findByIdAndUpdate(
        customer._id,
        { $inc: { pendingBalance: transaction.customerTotal } }
      );
    }

    // Populate and return
    await transaction.populate([
      { path: 'supplier', select: 'companyName contactPerson email phone businessType' },
      { path: 'customer', select: 'displayName firstName lastName email phone businessType' },
      { path: 'items.product', select: 'name description pricing inventory' },
      { path: 'createdBy', select: 'firstName lastName email' }
    ]);

    res.status(201).json({
      message: 'Drop shipping transaction created successfully',
      transaction
    });
  } catch (error) {
    console.error('Create drop shipping transaction error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/drop-shipping/:id
// @desc    Update drop shipping transaction
// @access  Private
router.put('/:id', [
  auth,
  requirePermission('update_drop_shipping'),
  body('supplier').optional().isMongoId().withMessage('Valid supplier is required'),
  body('customer').optional().isMongoId().withMessage('Valid customer is required'),
  body('items').optional().isArray({ min: 1 }).withMessage('At least one item is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const transaction = await DropShipping.findById(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({ message: 'Drop shipping transaction not found' });
    }

    // Store old values for balance adjustments
    const oldSupplierTotal = transaction.supplierTotal;
    const oldCustomerTotal = transaction.customerTotal;

    // Update transaction
    const updateData = {
      ...req.body,
      lastModifiedBy: req.user._id
    };

    // If supplier info changed, update it
    if (req.body.supplier && req.body.supplier !== transaction.supplier.toString()) {
      const supplier = await Supplier.findById(req.body.supplier);
      if (supplier) {
        updateData.supplierInfo = {
          companyName: supplier.companyName,
          contactPerson: supplier.contactPerson?.name || '',
          email: supplier.email || '',
          phone: supplier.phone || ''
        };
      }
    }

    // If customer info changed, update it
    if (req.body.customer && req.body.customer !== transaction.customer.toString()) {
      const customer = await Customer.findById(req.body.customer);
      if (customer) {
        updateData.customerInfo = {
          displayName: customer.displayName || customer.name,
          businessName: customer.businessName || '',
          email: customer.email || '',
          phone: customer.phone || '',
          businessType: customer.businessType || ''
        };
      }
    }

    Object.assign(transaction, updateData);
    await transaction.save();

    // Update balances
    if (transaction.supplierTotal !== oldSupplierTotal) {
      const balanceDiff = transaction.supplierTotal - oldSupplierTotal;
      await Supplier.findByIdAndUpdate(
        transaction.supplier,
        { $inc: { pendingBalance: balanceDiff } }
      );
    }

    if (transaction.customerTotal !== oldCustomerTotal && transaction.customerPayment.method === 'account') {
      const balanceDiff = transaction.customerTotal - oldCustomerTotal;
      await Customer.findByIdAndUpdate(
        transaction.customer,
        { $inc: { pendingBalance: balanceDiff } }
      );
    }

    // Populate and return
    await transaction.populate([
      { path: 'supplier', select: 'companyName contactPerson email phone businessType' },
      { path: 'customer', select: 'displayName firstName lastName email phone businessType' },
      { path: 'items.product', select: 'name description pricing inventory' },
      { path: 'createdBy', select: 'firstName lastName email' },
      { path: 'lastModifiedBy', select: 'firstName lastName email' }
    ]);

    res.json({
      message: 'Drop shipping transaction updated successfully',
      transaction
    });
  } catch (error) {
    console.error('Update drop shipping transaction error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/drop-shipping/:id
// @desc    Delete drop shipping transaction
// @access  Private
router.delete('/:id', [
  auth,
  requirePermission('delete_drop_shipping')
], async (req, res) => {
  try {
    const transaction = await DropShipping.findById(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({ message: 'Drop shipping transaction not found' });
    }

    // Reverse balance adjustments
    await Supplier.findByIdAndUpdate(
      transaction.supplier,
      { $inc: { pendingBalance: -transaction.supplierTotal } }
    );

    if (transaction.customerPayment.method === 'account') {
      await Customer.findByIdAndUpdate(
        transaction.customer,
        { $inc: { pendingBalance: -transaction.customerTotal } }
      );
    }

    await transaction.deleteOne();

    res.json({ message: 'Drop shipping transaction deleted successfully' });
  } catch (error) {
    console.error('Delete drop shipping transaction error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/drop-shipping/:id/status
// @desc    Update transaction status
// @access  Private
router.put('/:id/status', [
  auth,
  body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'completed']).withMessage('Valid status is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const transaction = await DropShipping.findById(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({ message: 'Drop shipping transaction not found' });
    }

    transaction.status = req.body.status;
    transaction.lastModifiedBy = req.user._id;

    // Set delivery date if marked as delivered or completed
    if (req.body.status === 'delivered' || req.body.status === 'completed') {
      transaction.actualDelivery = new Date();
    }

    await transaction.save();

    await transaction.populate([
      { path: 'supplier', select: 'companyName contactPerson email phone' },
      { path: 'customer', select: 'displayName firstName lastName email phone' },
      { path: 'items.product', select: 'name description' }
    ]);

    res.json({
      message: 'Transaction status updated successfully',
      transaction
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;

