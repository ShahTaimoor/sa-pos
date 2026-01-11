/**
 * Sales Journal Integration Example
 * 
 * This file demonstrates how to integrate journal entries into the sales flow.
 * Use this pattern in your sales routes/services.
 */

const journalEntryService = require('./journalEntryService');
const mongoose = require('mongoose');

/**
 * Example: Integrate journal entries into sales creation
 * 
 * This should be called within a MongoDB transaction after creating the sale
 */
async function createSaleWithJournalEntries(sale, options = {}) {
  const { session = null, tenantId, createdBy } = options;

  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  // Ensure we're in a transaction
  if (!session) {
    throw new Error('This operation must be performed within a MongoDB transaction');
  }

  try {
    // 1. Create the sale (assume this is done elsewhere)
    // const sale = await Sales.create(saleData, { session });

    // 2. Create journal entries for the sale
    const journalEntry = await journalEntryService.createSaleEntries(sale, {
      session,
      tenantId,
      createdBy
    });

    // 3. Update inventory (if needed - this should also be in the transaction)
    // await updateInventoryForSale(sale, { session, tenantId });

    return {
      sale,
      journalEntry
    };
  } catch (error) {
    logger.error('Error creating sale with journal entries:', error);
    throw error;
  }
}

/**
 * Example: Integrate journal entries into purchase creation
 */
async function createPurchaseWithJournalEntries(purchase, options = {}) {
  const { session = null, tenantId, createdBy } = options;

  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  if (!session) {
    throw new Error('This operation must be performed within a MongoDB transaction');
  }

  try {
    // 1. Create the purchase (assume this is done elsewhere)
    // const purchase = await PurchaseInvoice.create(purchaseData, { session });

    // 2. Create journal entries for the purchase
    const journalEntry = await journalEntryService.createPurchaseEntries(purchase, {
      session,
      tenantId,
      createdBy
    });

    // 3. Update inventory (if needed)
    // await updateInventoryForPurchase(purchase, { session, tenantId });

    return {
      purchase,
      journalEntry
    };
  } catch (error) {
    logger.error('Error creating purchase with journal entries:', error);
    throw error;
  }
}

/**
 * Example usage in a route:
 * 
 * router.post('/sales', auth, tenantMiddleware, async (req, res) => {
 *   const session = await mongoose.startSession();
 *   session.startTransaction();
 * 
 *   try {
 *     const tenantId = req.tenantId;
 *     const createdBy = req.user._id;
 * 
 *     // Create sale
 *     const sale = new Sales({
 *       tenantId,
 *       ...req.body,
 *       createdBy
 *     });
 *     await sale.save({ session });
 * 
 *     // Create journal entries
 *     const journalEntry = await journalEntryService.createSaleEntries(sale, {
 *       session,
 *       tenantId,
 *       createdBy
 *     });
 * 
 *     // Update inventory
 *     // ... inventory update logic ...
 * 
 *     await session.commitTransaction();
 *     res.json({ sale, journalEntry });
 *   } catch (error) {
 *     await session.abortTransaction();
 *     res.status(500).json({ error: error.message });
 *   } finally {
 *     session.endSession();
 *   }
 * });
 */

module.exports = {
  createSaleWithJournalEntries,
  createPurchaseWithJournalEntries
};

