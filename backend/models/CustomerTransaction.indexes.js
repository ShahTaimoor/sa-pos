/**
 * CustomerTransaction Indexes
 * 
 * Optimized indexes for ledger-based balance calculation
 */

const CustomerTransaction = require('./CustomerTransaction');

/**
 * Create all indexes for CustomerTransaction model
 * Call this during application startup
 */
async function createCustomerTransactionIndexes() {
  try {
    // Index 1: Customer + Date (primary for balance calculation)
    await CustomerTransaction.collection.createIndex(
      { customer: 1, transactionDate: 1 },
      { name: 'customer_transactionDate_1' }
    );

    // Index 2: Customer + Type (for filtering by type)
    await CustomerTransaction.collection.createIndex(
      { customer: 1, transactionType: 1 },
      { name: 'customer_transactionType_1' }
    );

    // Index 3: Customer + Status + Date (for active transactions)
    await CustomerTransaction.collection.createIndex(
      { customer: 1, status: 1, transactionDate: -1 },
      { name: 'customer_status_transactionDate_1' }
    );

    // Index 4: Customer + Reconciled (for reconciliation)
    await CustomerTransaction.collection.createIndex(
      { customer: 1, reconciled: 1 },
      { name: 'customer_reconciled_1' }
    );

    // Index 5: Transaction Number (unique lookup)
    await CustomerTransaction.collection.createIndex(
      { transactionNumber: 1 },
      { unique: true, sparse: true, name: 'transactionNumber_1_unique' }
    );

    // Index 6: Reference (for linking to orders/invoices)
    await CustomerTransaction.collection.createIndex(
      { referenceType: 1, referenceId: 1 },
      { name: 'reference_1' }
    );

    // Index 7: Date range queries
    await CustomerTransaction.collection.createIndex(
      { transactionDate: 1, status: 1 },
      { name: 'transactionDate_status_1' }
    );

    // Index 8: Compound for balance calculation (customer + date + status)
    await CustomerTransaction.collection.createIndex(
      { 
        customer: 1, 
        transactionDate: 1, 
        status: 1,
        transactionType: 1
      },
      { name: 'balance_calculation_compound_1' }
    );

    console.log('CustomerTransaction indexes created successfully');
  } catch (error) {
    console.error('Error creating CustomerTransaction indexes:', error);
    throw error;
  }
}

module.exports = { createCustomerTransactionIndexes };

