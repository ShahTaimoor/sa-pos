const express = require('express');
const { body } = require('express-validator');
const { auth, requirePermission } = require('../middleware/auth');
const { handleValidationErrors, sanitizeRequest } = require('../middleware/validation');
const Supplier = require('../models/Supplier'); // Still needed for model reference
const Product = require('../models/Product'); // Still needed for model reference
const StockMovementService = require('../services/stockMovementService');
const SupplierBalanceService = require('../services/supplierBalanceService');
const supplierRepository = require('../repositories/SupplierRepository');
const productRepository = require('../repositories/ProductRepository');

const router = express.Router();

// @route   POST /api/purchase-returns
// @desc    Create a purchase return (return to supplier)
// @access  Private (requires 'edit_purchases' permission)
router.post('/', [
  auth,
  requirePermission('edit_purchases'),
  sanitizeRequest,
  body('supplier').isMongoId().withMessage('Valid supplier ID is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').isMongoId().withMessage('Valid product ID is required'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be greater than 0'),
  body('items.*.unitCost').optional().isFloat({ min: 0 }).withMessage('Unit cost must be non-negative'),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { supplier, items, reason = 'Purchase return' } = req.body;

    // Validate supplier
    const supplierDoc = await supplierRepository.findById(supplier);
    if (!supplierDoc) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    // Validate products and perform stock movements
    let totalAmount = 0;
    for (const item of items) {
      const product = await productRepository.findById(item.product);
      if (!product) {
        return res.status(404).json({ message: `Product not found: ${item.product}` });
      }

      const unitCost = Number(item.unitCost ?? product.costPrice ?? 0);
      totalAmount += unitCost * Number(item.quantity);

      // Record stock movement as supplier return (stock out)
      await StockMovementService.createMovement({
        productId: product._id,
        movementType: 'return_out',
        quantity: Number(item.quantity),
        unitCost,
        referenceType: 'return',
        referenceId: product._id, // not persisted as a document; use product id as minimal reference
        referenceNumber: `PR-${Date.now()}`,
        reason,
        supplier: supplierDoc._id,
      }, req.user);
    }

    // Adjust supplier balance as a debit note (reduce payables / increase advance)
    try {
      await SupplierBalanceService.recordPayment(supplierDoc._id, totalAmount, null);
    } catch (balanceErr) {
      // Do not fail entire return; surface warning
      console.error('Error updating supplier balance for purchase return:', balanceErr);
    }

    res.status(201).json({
      success: true,
      message: 'Purchase return processed successfully',
      data: {
        supplier: supplierDoc._id,
        itemsCount: items.length,
        totalAmount,
      },
    });
  } catch (error) {
    console.error('Error creating purchase return:', error);
    res.status(500).json({ message: 'Server error creating purchase return', error: error.message });
  }
});

module.exports = router;


