const express = require('express');
const { query, validationResult } = require('express-validator');
const Sales = require('../models/Sales');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const { auth, requirePermission } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/reports/sales
// @desc    Get sales report
// @access  Private
router.get('/sales', [
  auth,
  requirePermission('view_reports'),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('groupBy').optional().isIn(['day', 'week', 'month', 'year']),
  query('orderType').optional().isIn(['retail', 'wholesale', 'return', 'exchange'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : new Date();
    const groupBy = req.query.groupBy || 'day';
    const orderType = req.query.orderType;
    
    // Build filter
    const filter = {
      createdAt: { $gte: dateFrom, $lte: dateTo },
      status: { $nin: ['cancelled'] }
    };
    
    if (orderType) {
      filter.orderType = orderType;
    }
    
    const orders = await Sales.find(filter)
      .populate('items.product', 'name description')
      .sort({ createdAt: 1 });
    
    // Group data by time period
    const groupedData = {};
    const formatDate = (date, groupBy) => {
      switch (groupBy) {
        case 'day':
          return date.toISOString().split('T')[0];
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          return weekStart.toISOString().split('T')[0];
        case 'month':
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        case 'year':
          return date.getFullYear().toString();
        default:
          return date.toISOString().split('T')[0];
      }
    };
    
    orders.forEach(order => {
      const key = formatDate(order.createdAt, groupBy);
      if (!groupedData[key]) {
        groupedData[key] = {
          date: key,
          totalRevenue: 0,
          totalOrders: 0,
          totalItems: 0,
          averageOrderValue: 0
        };
      }
      
      groupedData[key].totalRevenue += order.pricing.total;
      groupedData[key].totalOrders += 1;
      groupedData[key].totalItems += order.items.reduce((sum, item) => sum + item.quantity, 0);
    });
    
    // Calculate averages
    Object.values(groupedData).forEach(period => {
      period.averageOrderValue = period.totalOrders > 0 ? 
        period.totalRevenue / period.totalOrders : 0;
    });
    
    const reportData = Object.values(groupedData).sort((a, b) => a.date.localeCompare(b.date));
    
    // Calculate summary
    const summary = {
      totalRevenue: orders.reduce((sum, order) => sum + order.pricing.total, 0),
      totalOrders: orders.length,
      totalItems: orders.reduce((sum, order) => 
        sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0),
      averageOrderValue: orders.length > 0 ? 
        orders.reduce((sum, order) => sum + order.pricing.total, 0) / orders.length : 0,
      dateRange: {
        from: dateFrom,
        to: dateTo
      }
    };
    
    res.json({
      summary,
      data: reportData,
      groupBy,
      filters: {
        dateFrom,
        dateTo,
        orderType
      }
    });
  } catch (error) {
    console.error('Sales report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/products
// @desc    Get product performance report
// @access  Private
router.get('/products', [
  auth,
  requirePermission('view_reports'),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : new Date();
    const limit = parseInt(req.query.limit) || 20;
    
    const orders = await Sales.find({
      createdAt: { $gte: dateFrom, $lte: dateTo },
      status: { $nin: ['cancelled'] }
    })
    .populate('items.product', 'name description pricing')
    .sort({ createdAt: 1 });
    
    // Aggregate product sales
    const productSales = {};
    
    orders.forEach(order => {
      order.items.forEach(item => {
        const productId = item.product._id.toString();
        if (!productSales[productId]) {
          productSales[productId] = {
            product: item.product,
            totalQuantity: 0,
            totalRevenue: 0,
            totalOrders: 0,
            averagePrice: 0
          };
        }
        
        productSales[productId].totalQuantity += item.quantity;
        productSales[productId].totalRevenue += item.total;
        productSales[productId].totalOrders += 1;
      });
    });
    
    // Calculate averages and sort
    const productReport = Object.values(productSales)
      .map(item => ({
        ...item,
        averagePrice: item.totalQuantity > 0 ? item.totalRevenue / item.totalQuantity : 0
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);
    
    res.json({
      products: productReport,
      dateRange: {
        from: dateFrom,
        to: dateTo
      },
      total: Object.keys(productSales).length
    });
  } catch (error) {
    console.error('Product report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/customers
// @desc    Get customer performance report
// @access  Private
router.get('/customers', [
  auth,
  requirePermission('view_reports'),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('businessType').optional().isIn(['retail', 'wholesale', 'distributor', 'individual'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : new Date();
    const limit = parseInt(req.query.limit) || 20;
    const businessType = req.query.businessType;
    
    const filter = {
      createdAt: { $gte: dateFrom, $lte: dateTo },
      status: { $nin: ['cancelled'] },
      customer: { $exists: true, $ne: null }
    };
    
    const orders = await Sales.find(filter)
      .populate('customer', 'firstName lastName businessName businessType customerTier')
      .sort({ createdAt: 1 });
    
    // Aggregate customer sales
    const customerSales = {};
    
    orders.forEach(order => {
      if (!order.customer) return;
      
      const customerId = order.customer._id.toString();
      if (!customerSales[customerId]) {
        customerSales[customerId] = {
          customer: order.customer,
          totalOrders: 0,
          totalRevenue: 0,
          totalItems: 0,
          averageOrderValue: 0,
          lastOrderDate: null
        };
      }
      
      customerSales[customerId].totalOrders += 1;
      customerSales[customerId].totalRevenue += order.pricing.total;
      customerSales[customerId].totalItems += order.items.reduce((sum, item) => sum + item.quantity, 0);
      
      if (!customerSales[customerId].lastOrderDate || order.createdAt > customerSales[customerId].lastOrderDate) {
        customerSales[customerId].lastOrderDate = order.createdAt;
      }
    });
    
    // Filter by business type if specified
    let filteredCustomers = Object.values(customerSales);
    if (businessType) {
      filteredCustomers = filteredCustomers.filter(item => 
        item.customer.businessType === businessType
      );
    }
    
    // Calculate averages and sort
    const customerReport = filteredCustomers
      .map(item => ({
        ...item,
        averageOrderValue: item.totalOrders > 0 ? item.totalRevenue / item.totalOrders : 0
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);
    
    res.json({
      customers: customerReport,
      dateRange: {
        from: dateFrom,
        to: dateTo
      },
      total: filteredCustomers.length,
      filters: {
        businessType
      }
    });
  } catch (error) {
    console.error('Customer report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/inventory
// @desc    Get inventory report
// @access  Private
router.get('/inventory', [
  auth,
  requirePermission('view_reports'),
  query('lowStock').optional().isBoolean(),
  query('category').optional().isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const filter = { status: 'active' };
    
    if (req.query.lowStock === 'true') {
      filter.$expr = {
        $lte: ['$inventory.currentStock', '$inventory.reorderPoint']
      };
    }
    
    if (req.query.category) {
      filter.category = req.query.category;
    }
    
    const products = await Product.find(filter)
      .populate('category', 'name')
      .select('name description inventory pricing category')
      .sort({ 'inventory.currentStock': 1 });
    
    const summary = {
      totalProducts: products.length,
      totalValue: products.reduce((sum, product) => 
        sum + (product.inventory.currentStock * product.pricing.cost), 0),
      lowStockItems: products.filter(p => p.isLowStock()).length,
      outOfStockItems: products.filter(p => p.inventory.currentStock === 0).length,
      highValueItems: products.filter(p => 
        (p.inventory.currentStock * p.pricing.cost) > 1000
      ).length
    };
    
    res.json({
      products,
      summary,
      filters: {
        lowStock: req.query.lowStock,
        category: req.query.category
      }
    });
  } catch (error) {
    console.error('Inventory report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
