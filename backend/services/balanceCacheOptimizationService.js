/**
 * Balance Cache Optimization Service
 * 
 * Performance optimizations for balance caching
 * - Incremental updates
 * - Batch processing
 * - Materialized views (optional)
 */

const Customer = require('../models/Customer');
const CustomerTransaction = require('../models/CustomerTransaction');
const ledgerBalanceService = require('./ledgerBalanceService');
const logger = require('../utils/logger');

class BalanceCacheOptimizationService {
  /**
   * Update balance cache incrementally (fast)
   * Called after each transaction creation
   * @param {String} customerId - Customer ID
   * @param {CustomerTransaction} transaction - New transaction
   * @returns {Promise<Object>} Updated balances
   */
  async updateCacheIncremental(customerId, transaction) {
    try {
      return await ledgerBalanceService.updateBalanceCacheIncremental(customerId, transaction);
    } catch (error) {
      logger.error('Error in incremental cache update:', error);
      // Fallback to full recalculation
      return await ledgerBalanceService.rebuildBalanceCache(customerId);
    }
  }

  /**
   * Batch update balance cache for multiple customers
   * @param {Array<String>} customerIds - Customer IDs
   * @param {Object} options - Options
   * @returns {Promise<Object>} Update results
   */
  async batchUpdateCache(customerIds, options = {}) {
    const {
      batchSize = 50,
      useIncremental = false
    } = options;
    
    const results = {
      processed: 0,
      updated: 0,
      errors: []
    };
    
    // Process in batches
    for (let i = 0; i < customerIds.length; i += batchSize) {
      const batch = customerIds.slice(i, i + batchSize);
      
      const promises = batch.map(async (customerId) => {
        try {
          if (useIncremental) {
            // Get last transaction and update incrementally
            const lastTransaction = await CustomerTransaction.findOne({
              customer: customerId
            })
              .sort({ transactionDate: -1 })
              .lean();
            
            if (lastTransaction) {
              await this.updateCacheIncremental(customerId, lastTransaction);
            }
          } else {
            // Full rebuild
            await ledgerBalanceService.rebuildBalanceCache(customerId);
          }
          
          results.updated++;
        } catch (error) {
          results.errors.push({
            customerId,
            error: error.message
          });
          logger.error(`Error updating cache for customer ${customerId}:`, error);
        }
      });
      
      await Promise.all(promises);
      results.processed += batch.length;
    }
    
    logger.info(`Batch cache update completed`, results);
    return results;
  }

  /**
   * Warm up balance cache (pre-calculate for active customers)
   * @param {Object} options - Options
   * @returns {Promise<Object>} Warm-up results
   */
  async warmupCache(options = {}) {
    const {
      limit = 100,
      activeCustomersOnly = true
    } = options;
    
    const query = activeCustomersOnly 
      ? { status: 'active' }
      : {};
    
    const customers = await Customer.find(query)
      .limit(limit)
      .select('_id')
      .lean();
    
    const customerIds = customers.map(c => c._id);
    
    return await this.batchUpdateCache(customerIds, {
      useIncremental: false // Full rebuild for warmup
    });
  }

  /**
   * Get balance with cache fallback
   * Tries cache first, falls back to ledger calculation if cache is stale
   * @param {String} customerId - Customer ID
   * @param {Object} options - Options
   * @returns {Promise<Object>} Balance
   */
  async getBalanceWithFallback(customerId, options = {}) {
    const {
      maxCacheAge = 3600000, // 1 hour default
      forceRecalculate = false
    } = options;
    
    const customer = await Customer.findById(customerId)
      .select('pendingBalance advanceBalance currentBalance _balanceCacheLastUpdated');
    
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }
    
    // Check if cache is fresh
    const cacheAge = customer._balanceCacheLastUpdated 
      ? Date.now() - new Date(customer._balanceCacheLastUpdated).getTime()
      : Infinity;
    
    if (forceRecalculate || cacheAge > maxCacheAge) {
      // Cache is stale, recalculate from ledger
      const calculated = await ledgerBalanceService.calculateBalanceFromLedger(customerId);
      
      // Update cache
      customer.__allowBalanceCacheUpdate = true;
      customer.pendingBalance = calculated.pendingBalance;
      customer.advanceBalance = calculated.advanceBalance;
      customer.currentBalance = calculated.currentBalance;
      customer._balanceCacheLastUpdated = new Date();
      await customer.save();
      
      return calculated;
    }
    
    // Return cached balance
    return {
      pendingBalance: customer.pendingBalance || 0,
      advanceBalance: customer.advanceBalance || 0,
      currentBalance: customer.currentBalance || 0,
      source: 'cache',
      cacheAge: cacheAge
    };
  }

  /**
   * Optimize balance queries with aggregation pipeline
   * Pre-calculates balances for multiple customers
   * @param {Array<String>} customerIds - Customer IDs
   * @returns {Promise<Map>} Balance map
   */
  async getBalancesForCustomers(customerIds) {
    // Use aggregation for efficient batch calculation
    const balances = await CustomerTransaction.aggregate([
      {
        $match: {
          customer: { $in: customerIds },
          status: { $nin: ['cancelled', 'reversed'] }
        }
      },
      {
        $group: {
          _id: '$customer',
          pendingBalance: {
            $sum: {
              $cond: [
                { $in: ['$transactionType', ['invoice', 'debit_note', 'opening_balance']] },
                '$netAmount',
                {
                  $cond: [
                    { $in: ['$transactionType', ['payment', 'refund', 'credit_note', 'write_off']] },
                    { $multiply: ['$netAmount', -1] },
                    0
                  ]
                }
              ]
            }
          },
          transactionCount: { $sum: 1 }
        }
      }
    ]);
    
    // Create map
    const balanceMap = new Map();
    for (const balance of balances) {
      // Calculate advance balance separately (from PaymentApplications)
      const advanceBalance = await ledgerBalanceService.calculateAdvanceBalance(balance._id);
      
      balanceMap.set(balance._id.toString(), {
        pendingBalance: Math.max(0, balance.pendingBalance),
        advanceBalance: advanceBalance,
        currentBalance: Math.max(0, balance.pendingBalance) - advanceBalance,
        transactionCount: balance.transactionCount
      });
    }
    
    return balanceMap;
  }
}

module.exports = new BalanceCacheOptimizationService();

