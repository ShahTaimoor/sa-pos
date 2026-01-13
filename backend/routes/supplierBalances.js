const express = require('express');
const { body, param, query } = require('express-validator');
const Supplier = require('../models/Supplier'); // Still needed for model reference
const PurchaseOrder = require('../models/PurchaseOrder'); // Still needed for model reference
const SupplierBalanceService = require('../services/supplierBalanceService');
const supplierRepository = require('../repositories/SupplierRepository');
const { auth, requirePermission } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

// Get supplier balance summary
router.get('/:supplierId', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('view_suppliers'),
  param('supplierId').isMongoId().withMessage('Invalid supplier ID')
], async (req, res) => {
  try {
    const { supplierId } = req.params;
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    const summary = await SupplierBalanceService.getBalanceSummary(supplierId, tenantId);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Error getting supplier balance summary:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Record payment to supplier
router.post('/:supplierId/payment', [
  auth,
  tenantMiddleware,
  requirePermission('manage_payments'),
  param('supplierId').isMongoId().withMessage('Invalid supplier ID'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Payment amount must be greater than 0'),
  body('purchaseOrderId').optional().isMongoId().withMessage('Invalid purchase order ID'),
  body('notes').optional().isString().trim().isLength({ max: 500 }).withMessage('Notes too long')
], async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { amount, purchaseOrderId, notes } = req.body;
    
    const updatedSupplier = await SupplierBalanceService.recordPayment(supplierId, amount, purchaseOrderId);
    
    res.json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        supplier: updatedSupplier,
        paymentAmount: amount
      }
    });
  } catch (error) {
    logger.error('Error recording supplier payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Record refund from supplier
router.post('/:supplierId/refund', [
  auth,
  tenantMiddleware,
  requirePermission('manage_payments'),
  param('supplierId').isMongoId().withMessage('Invalid supplier ID'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Refund amount must be greater than 0'),
  body('purchaseOrderId').optional().isMongoId().withMessage('Invalid purchase order ID'),
  body('reason').optional().isString().trim().isLength({ max: 500 }).withMessage('Reason too long')
], async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { amount, purchaseOrderId, reason } = req.body;
    
    const updatedSupplier = await SupplierBalanceService.recordRefund(supplierId, amount, purchaseOrderId);
    
    res.json({
      success: true,
      message: 'Refund recorded successfully',
      data: {
        supplier: updatedSupplier,
        refundAmount: amount
      }
    });
  } catch (error) {
    logger.error('Error recording supplier refund:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Recalculate supplier balance
router.post('/:supplierId/recalculate', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('manage_suppliers'),
  param('supplierId').isMongoId().withMessage('Invalid supplier ID')
], async (req, res) => {
  try {
    const { supplierId } = req.params;
    const updatedSupplier = await SupplierBalanceService.recalculateBalance(supplierId);
    
    res.json({
      success: true,
      message: 'Supplier balance recalculated successfully',
      data: updatedSupplier
    });
  } catch (error) {
    logger.error('Error recalculating supplier balance:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Check if supplier can accept purchase
router.get('/:supplierId/can-accept-purchase', [
  auth,
  tenantMiddleware,
  requirePermission('view_suppliers'),
  param('supplierId').isMongoId().withMessage('Invalid supplier ID'),
  query('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0')
], async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { amount } = req.query;
    
    const eligibility = await SupplierBalanceService.canAcceptPurchase(supplierId, parseFloat(amount));
    
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

// Get all suppliers with balance issues
router.get('/reports/balance-issues', [
  auth,
  tenantMiddleware,
  requirePermission('view_reports')
], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    // Find suppliers with pending balances (tenant-scoped)
    const suppliersWithPendingBalances = await supplierRepository.findAll({
      tenantId,
      pendingBalance: { $gt: 0 }
    }, {
      select: 'companyName contactPerson email phone pendingBalance advanceBalance creditLimit'
    });

    // Find suppliers with advance balances (tenant-scoped)
    const suppliersWithAdvanceBalances = await supplierRepository.findAll({
      tenantId,
      advanceBalance: { $gt: 0 }
    }, {
      select: 'companyName contactPerson email phone pendingBalance advanceBalance creditLimit'
    });

    // Find suppliers over credit limit (tenant-scoped)
    const suppliersOverCreditLimit = await supplierRepository.findAll({
      tenantId,
      $expr: { $gt: ['$currentBalance', '$creditLimit'] }
    }, {
      select: 'companyName contactPerson email phone currentBalance creditLimit'
    });

    res.json({
      success: true,
      data: {
        pendingBalances: suppliersWithPendingBalances,
        advanceBalances: suppliersWithAdvanceBalances,
        overCreditLimit: suppliersOverCreditLimit,
        summary: {
          totalPendingBalance: suppliersWithPendingBalances.reduce((sum, s) => sum + s.pendingBalance, 0),
          totalAdvanceBalance: suppliersWithAdvanceBalances.reduce((sum, s) => sum + s.advanceBalance, 0),
          suppliersWithPendingBalances: suppliersWithPendingBalances.length,
          suppliersWithAdvanceBalances: suppliersWithAdvanceBalances.length,
          suppliersOverCreditLimit: suppliersOverCreditLimit.length
        }
      }
    });
  } catch (error) {
    logger.error('Error getting supplier balance issues report:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Fix all supplier balances (recalculate from purchase orders)
router.post('/fix-all-balances', [
  auth,
  tenantMiddleware, // Enforce tenant isolation
  requirePermission('manage_suppliers')
], async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const suppliers = await supplierRepository.findAll({ tenantId });
    const results = [];

    for (const supplier of suppliers) {
      try {
        const updatedSupplier = await SupplierBalanceService.recalculateBalance(supplier._id);
        results.push({
          supplierId: supplier._id,
          supplierName: supplier.companyName,
          success: true,
          newPendingBalance: updatedSupplier.pendingBalance,
          newAdvanceBalance: updatedSupplier.advanceBalance
        });
      } catch (error) {
        results.push({
          supplierId: supplier._id,
          supplierName: supplier.companyName,
          success: false,
          error: error.message
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      message: `Supplier balance fix completed. ${successful} successful, ${failed} failed.`,
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
    logger.error('Error fixing all supplier balances:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
