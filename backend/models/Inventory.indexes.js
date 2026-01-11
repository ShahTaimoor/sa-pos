/**
 * Inventory Model Indexes
 * 
 * Optimized indexes for concurrent reservation operations
 */

const Inventory = require('./Inventory');

/**
 * Create all indexes for Inventory model
 * Call this during application startup
 */
async function createInventoryIndexes() {
  try {
    // Index 1: Product lookup (primary, unique)
    await Inventory.collection.createIndex(
      { product: 1 },
      { unique: true, name: 'product_1_unique' }
    );

    // Index 2: Expired reservations cleanup
    await Inventory.collection.createIndex(
      { "reservations.expiresAt": 1 },
      { name: 'reservations_expiresAt_1' }
    );

    // Index 3: Reservation ID lookup
    await Inventory.collection.createIndex(
      { "reservations.reservationId": 1 },
      { name: 'reservations_reservationId_1' }
    );

    // Index 4: Reference lookup (for cleanup by reference)
    await Inventory.collection.createIndex(
      { 
        "reservations.referenceType": 1,
        "reservations.referenceId": 1 
      },
      { name: 'reservations_reference_1' }
    );

    // Index 5: Compound index for active reservations query
    await Inventory.collection.createIndex(
      { 
        product: 1,
        "reservations.expiresAt": 1,
        "reservations.reservationId": 1
      },
      { name: 'product_reservations_compound_1' }
    );

    // Index 6: Available stock queries
    await Inventory.collection.createIndex(
      { 
        currentStock: 1,
        reservedStock: 1,
        status: 1
      },
      { name: 'stock_status_1' }
    );

    // Index 7: Cleanup prevention (lastCleanupAt)
    await Inventory.collection.createIndex(
      { 
        "reservations.expiresAt": 1,
        lastCleanupAt: 1
      },
      { name: 'cleanup_prevention_1' }
    );

    // Index 8: Reserved by user (for user-specific queries)
    await Inventory.collection.createIndex(
      { "reservations.reservedBy": 1 },
      { name: 'reservations_reservedBy_1' }
    );

    console.log('Inventory indexes created successfully');
  } catch (error) {
    console.error('Error creating inventory indexes:', error);
    throw error;
  }
}

module.exports = { createInventoryIndexes };

