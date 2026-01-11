const express = require('express');
const { body, param, query } = require('express-validator');
const Customer = require('../models/Customer'); // Still needed for model reference
const Sales = require('../models/Sales'); // Still needed for model reference
const CustomerBalanceService = require('../services/customerBalanceService');
const customerRepository = require('../repositories/CustomerRepository');
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

// Get customer balance summary
router.get('/:customerId', [
  auth,
  tenantMiddleware,
  requirePermission('view_customers'),
  param('customerId').isMongoId().withMessage('Invalid customer ID')
], async (req, res) => {
  try {
    const { customerId } = req.params;
    const summary = await CustomerBalanceService.getBalanceSummary(customerId);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Error getting customer balance summary:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Record payment for customer
router.post('/:customerId/payment', [
  auth,
  tenantMiddleware,
  requirePermission('manage_payments'),
  param('customerId').isMongoId().withMessage('Invalid customer ID'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Payment amount must be greater than 0'),
  body('orderId').optional().isMongoId().withMessage('Invalid order ID'),
  body('notes').optional().isString().trim().isLength({ max: 500 }).withMessage('Notes too long')
], async (req, res) => {
  try {
    const { customerId } = req.params;
    const { amount, orderId, notes } = req.body;
    
    const updatedCustomer = await CustomerBalanceService.recordPayment(customerId, amount, orderId);
    
    res.json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        customer: updatedCustomer,
        paymentAmount: amount
      }
    });
  } catch (error) {
    logger.error('Error recording payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Record refund for customer
router.post('/:customerId/refund', [
  auth,
  tenantMiddleware,
  requirePermission('manage_payments'),
  param('customerId').isMongoId().withMessage('Invalid customer ID'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Refund amount must be greater than 0'),
  body('orderId').optional().isMongoId().withMessage('Invalid order ID'),
  body('reason').optional().isString().trim().isLength({ max: 500 }).withMessage('Reason too long')
], async (req, res) => {
  try {
    const { customerId } = req.params;
    const { amount, orderId, reason } = req.body;
    
    const updatedCustomer = await CustomerBalanceService.recordRefund(customerId, amount, orderId);
    
    res.json({
      success: true,
      message: 'Refund recorded successfully',
      data: {
        customer: updatedCustomer,
        refundAmount: amount
      }
    });
  } catch (error) {
    logger.error('Error recording refund:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Recalculate customer balance
router.post('/:customerId/recalculate', [
  auth, 
  requirePermission('manage_customers'),
  param('customerId').isMongoId().withMessage('Invalid customer ID')
], async (req, res) => {
  try {
    const { customerId } = req.params;
    const updatedCustomer = await CustomerBalanceService.recalculateBalance(customerId);
    
    res.json({
      success: true,
      message: 'Customer balance recalculated successfully',
      data: updatedCustomer
    });
  } catch (error) {
    logger.error('Error recalculating balance:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Check if customer can make purchase
router.get('/:customerId/can-purchase', [
  auth,
  tenantMiddleware,
  requirePermission('view_customers'),
  param('customerId').isMongoId().withMessage('Invalid customer ID'),
  query('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0')
], async (req, res) => {
  try {
    const { customerId } = req.params;
    const { amount } = req.query;
    
    const eligibility = await CustomerBalanceService.canMakePurchase(customerId, parseFloat(amount));
    
    res.json({
      success: true,
      data: eligibility
    });
  } catch (error) {
    logger.error('Error checking purchase eligibility:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all customers with balance issues
router.get('/reports/balance-issues', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports')
], async (req, res) => {
  try {
    // Find customers with pending balances
    const customersWithPendingBalances = await customerRepository.findAll({
      pendingBalance: { $gt: 0 }
    }, {
      select: 'name businessName email phone pendingBalance advanceBalance creditLimit'
    });

    // Find customers with advance balances
    const customersWithAdvanceBalances = await customerRepository.findAll({
      advanceBalance: { $gt: 0 }
    }, {
      select: 'name businessName email phone pendingBalance advanceBalance creditLimit'
    });

    // Find customers over credit limit
    const customersOverCreditLimit = await customerRepository.findAll({
      $expr: { $gt: ['$currentBalance', '$creditLimit'] }
    }, {
      select: 'name businessName email phone currentBalance creditLimit'
    });

    res.json({
      success: true,
      data: {
        pendingBalances: customersWithPendingBalances,
        advanceBalances: customersWithAdvanceBalances,
        overCreditLimit: customersOverCreditLimit,
        summary: {
          totalPendingBalance: customersWithPendingBalances.reduce((sum, c) => sum + c.pendingBalance, 0),
          totalAdvanceBalance: customersWithAdvanceBalances.reduce((sum, c) => sum + c.advanceBalance, 0),
          customersWithPendingBalances: customersWithPendingBalances.length,
          customersWithAdvanceBalances: customersWithAdvanceBalances.length,
          customersOverCreditLimit: customersOverCreditLimit.length
        }
      }
    });
  } catch (error) {
    logger.error('Error getting balance issues report:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Fix all customer balances (recalculate from orders)
router.post('/fix-all-balances', [
  auth, 
  requirePermission('manage_customers')
], async (req, res) => {
  try {
    const customers = await customerRepository.findAll({});
    const results = [];

    for (const customer of customers) {
      try {
        const updatedCustomer = await CustomerBalanceService.recalculateBalance(customer._id);
        results.push({
          customerId: customer._id,
          customerName: customer.businessName || customer.name,
          success: true,
          newPendingBalance: updatedCustomer.pendingBalance,
          newAdvanceBalance: updatedCustomer.advanceBalance
        });
      } catch (error) {
        results.push({
          customerId: customer._id,
          customerName: customer.businessName || customer.name,
          success: false,
          error: error.message
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      message: `Balance fix completed. ${successful} successful, ${failed} failed.`,
      data: {
        results,
        summary: {
          total: results.length,
          successful,
          failed
        }
      }
    });
  } catch (error) {
    logger.error('Error fixing all balances:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
