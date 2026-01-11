/**
 * Return Validation Service
 * 
 * Validates return requests before processing
 */

const Return = require('../models/Return');
const Sales = require('../models/Sales');
const CustomerTransaction = require('../models/CustomerTransaction');
const logger = require('../utils/logger');

class ReturnValidationService {
  /**
   * Validate return request
   * @param {Object} returnData - Return data
   * @returns {Promise<Object>} Validation result
   */
  async validateReturnRequest(returnData) {
    const errors = [];

    // 1. Validate original order exists
    const originalOrder = await Sales.findById(returnData.originalOrder);
    if (!originalOrder) {
      errors.push(`Original order ${returnData.originalOrder} not found`);
      return { valid: false, errors };
    }

    // 2. Validate order is not already fully returned
    const existingReturns = await Return.find({
      originalOrder: returnData.originalOrder,
      status: { $in: ['completed', 'processing'] }
    });

    // 3. Validate items
    for (const returnItem of returnData.items) {
      // Find original order item
      const originalItem = originalOrder.items.find(
        item => item._id.toString() === returnItem.originalOrderItem.toString()
      );

      if (!originalItem) {
        errors.push(`Original order item ${returnItem.originalOrderItem} not found`);
        continue;
      }

      // Validate quantity
      if (returnItem.quantity > originalItem.quantity) {
        errors.push(`Return quantity ${returnItem.quantity} exceeds original quantity ${originalItem.quantity} for item ${returnItem.product}`);
      }

      // Check previously returned quantities
      const previouslyReturned = existingReturns.reduce((sum, ret) => {
        const item = ret.items.find(i => i.originalOrderItem.toString() === returnItem.originalOrderItem.toString());
        return sum + (item ? item.quantity : 0);
      }, 0);

      if (previouslyReturned + returnItem.quantity > originalItem.quantity) {
        errors.push(`Total return quantity ${previouslyReturned + returnItem.quantity} exceeds original quantity ${originalItem.quantity} for item ${returnItem.product}`);
      }

      // Validate product matches
      if (returnItem.product.toString() !== originalItem.product.toString()) {
        errors.push(`Product ${returnItem.product} does not match original order item`);
      }
    }

    // 4. Validate return policy window (if applicable)
    const returnPolicy = originalOrder.returnPolicy || { window: 30 }; // Default 30 days
    const orderDate = new Date(originalOrder.createdAt);
    const returnDate = new Date();
    const daysSinceOrder = Math.floor((returnDate - orderDate) / (1000 * 60 * 60 * 24));

    if (daysSinceOrder > returnPolicy.window) {
      // Allow with manager approval flag
      if (!returnData.managerApproval) {
        errors.push(`Return is ${daysSinceOrder} days after order (policy: ${returnPolicy.window} days). Manager approval required.`);
      }
    }

    // 5. Validate return reason
    const validReasons = [
      'defective',
      'wrong_item',
      'not_as_described',
      'damaged_shipping',
      'changed_mind',
      'duplicate_order',
      'size_issue',
      'quality_issue',
      'late_delivery',
      'other'
    ];

    for (const returnItem of returnData.items) {
      if (!validReasons.includes(returnItem.returnReason)) {
        errors.push(`Invalid return reason: ${returnItem.returnReason}`);
      }
    }

    // 6. Validate refund method
    const validRefundMethods = ['cash', 'bank', 'check', 'store_credit', 'original_payment'];
    if (returnData.refundMethod && !validRefundMethods.includes(returnData.refundMethod)) {
      errors.push(`Invalid refund method: ${returnData.refundMethod}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: daysSinceOrder > returnPolicy.window ? ['Return outside policy window'] : []
    };
  }

  /**
   * Validate return can be processed
   * @param {String} returnId - Return ID
   * @returns {Promise<Object>} Validation result
   */
  async validateReturnProcessing(returnId) {
    const errors = [];

    const returnDoc = await Return.findById(returnId);
    if (!returnDoc) {
      return { valid: false, errors: [`Return ${returnId} not found`] };
    }

    // Check status
    if (returnDoc.status === 'completed') {
      errors.push(`Return ${returnId} is already completed`);
    }

    if (returnDoc.status === 'cancelled') {
      errors.push(`Return ${returnId} is cancelled`);
    }

    if (!['approved', 'received'].includes(returnDoc.status)) {
      errors.push(`Return ${returnId} must be approved or received before processing`);
    }

    // Check original order exists
    const originalOrder = await Sales.findById(returnDoc.originalOrder);
    if (!originalOrder) {
      errors.push(`Original order ${returnDoc.originalOrder} not found`);
    }

    // Check frozen COGS exists
    if (!originalOrder?.metadata?.frozenCOGS?.frozen) {
      errors.push(`Frozen COGS not found for order ${returnDoc.originalOrder}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate refund can be processed
   * @param {String} returnId - Return ID
   * @returns {Promise<Object>} Validation result
   */
  async validateRefundProcessing(returnId) {
    const errors = [];

    const returnDoc = await Return.findById(returnId);
    if (!returnDoc) {
      return { valid: false, errors: [`Return ${returnId} not found`] };
    }

    // Check return is completed
    if (returnDoc.status !== 'completed') {
      errors.push(`Return ${returnId} must be completed before processing refund`);
    }

    // Check credit note exists
    if (!returnDoc.creditNote) {
      errors.push(`Credit note not found for return ${returnId}`);
    }

    // Check refund not already processed
    if (returnDoc.refundTransaction) {
      errors.push(`Refund already processed for return ${returnId}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = new ReturnValidationService();

