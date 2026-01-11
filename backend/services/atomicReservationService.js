/**
 * Atomic Reservation Service - Concurrency-Safe
 * 
 * Prevents race conditions and guarantees no overselling
 * Uses MongoDB atomic operations exclusively
 */

const Inventory = require('../models/Inventory');
const logger = require('../utils/logger');

class AtomicReservationService {
  /**
   * Reserve stock atomically (prevents race conditions)
   * @param {String} productId - Product ID
   * @param {Number} quantity - Quantity to reserve
   * @param {Object} options - Reservation options
   * @returns {Promise<Object>} Reservation result
   */
  async reserveStock(productId, quantity, options = {}) {
    const {
      userId,
      expiresInMinutes = 15,
      referenceType = 'cart',
      referenceId = null,
      reservationId = null,
      idempotencyKey = null,
      maxRetries = 5
    } = options;

    // Generate reservation ID
    const resId = reservationId || idempotencyKey || 
      `RES-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Check for duplicate reservation (idempotency)
    if (idempotencyKey) {
      const existing = await this.getReservation(productId, idempotencyKey);
      if (existing) {
        logger.info(`Reservation already exists: ${idempotencyKey}`);
        return existing;
      }
    }

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

    const reservation = {
      reservationId: resId,
      quantity: quantity,
      expiresAt: expiresAt,
      reservedBy: userId,
      referenceType: referenceType,
      referenceId: referenceId,
      createdAt: new Date()
    };

    let attempt = 0;
    let lastError = null;

    while (attempt < maxRetries) {
      try {
        const result = await this.atomicReserve(productId, quantity, reservation);
        
        if (result) {
          logger.info(`Stock reserved successfully: ${resId}`, {
            productId,
            quantity,
            availableStock: result.availableStock
          });

          return {
            reservationId: resId,
            quantity: quantity,
            expiresAt: expiresAt,
            productId: productId,
            availableStock: result.availableStock,
            status: 'reserved'
          };
        }

        // Reservation failed - insufficient stock
        throw new Error('Insufficient available stock');
      } catch (error) {
        lastError = error;

        if (error.message === 'CONCURRENT_UPDATE_CONFLICT' && attempt < maxRetries - 1) {
          // Exponential backoff for retry
          const delay = 100 * Math.pow(2, attempt);
          await this.sleep(delay);
          attempt++;
          logger.warn(`Reservation retry attempt ${attempt}/${maxRetries}`, {
            productId,
            reservationId: resId
          });
          continue;
        }

        // Non-retryable error or max retries reached
        logger.error(`Reservation failed: ${error.message}`, {
          productId,
          reservationId: resId,
          attempt
        });
        throw error;
      }
    }

    throw lastError || new Error('Reservation failed after maximum retries');
  }

  /**
   * Atomic reservation using MongoDB aggregation pipeline
   * This is the core method that prevents race conditions
   */
  async atomicReserve(productId, quantity, reservation) {
    const now = new Date();

    try {
      const result = await Inventory.findOneAndUpdate(
        { product: productId },
        [
          {
            // Step 1: Filter out expired reservations
            $set: {
              activeReservations: {
                $filter: {
                  input: "$reservations",
                  as: "res",
                  cond: { $gt: ["$$res.expiresAt", now] }
                }
              }
            }
          },
          {
            // Step 2: Calculate total active reserved quantity
            $set: {
              totalActiveReserved: {
                $sum: "$activeReservations.quantity"
              }
            }
          },
          {
            // Step 3: Calculate available stock
            $set: {
              availableStock: {
                $subtract: ["$currentStock", "$totalActiveReserved"]
              }
            }
          },
          {
            // Step 4: Check if reservation already exists (idempotency)
            $set: {
              reservationExists: {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: "$reservations",
                        as: "res",
                        cond: { $eq: ["$$res.reservationId", reservation.reservationId] }
                      }
                    }
                  },
                  0
                ]
              }
            }
          },
          {
            // Step 5: Only update if:
            // - Available stock >= quantity
            // - Reservation doesn't already exist
            $cond: {
              if: {
                $and: [
                  { $gte: [{ $subtract: ["$currentStock", "$totalActiveReserved"] }, quantity] },
                  { $eq: ["$reservationExists", false] }
                ]
              },
              then: {
                $set: {
                  reservations: {
                    $concatArrays: [
                      "$reservations",
                      [reservation]
                    ]
                  },
                  reservedStock: { $add: ["$totalActiveReserved", quantity] },
                  availableStock: {
                    $subtract: [
                      "$currentStock",
                      { $add: ["$totalActiveReserved", quantity] }
                    ]
                  },
                  lastUpdated: new Date()
                }
              },
              else: "$$ROOT" // No change if can't reserve
            }
          }
        ],
        {
          new: true,
          runValidators: true
        }
      );

      if (!result) {
        return null;
      }

      // Verify reservation was actually applied
      const reservationApplied = result.reservations.some(
        r => r.reservationId === reservation.reservationId
      );

      if (!reservationApplied) {
        // Reservation was not applied - likely insufficient stock
        return null;
      }

      // Verify reservedStock is correct
      const activeReservations = result.reservations.filter(
        r => new Date(r.expiresAt) > now
      );
      const correctReservedStock = activeReservations.reduce(
        (sum, r) => sum + r.quantity, 0
      );

      if (result.reservedStock !== correctReservedStock) {
        // Fix discrepancy
        await Inventory.findByIdAndUpdate(
          result._id,
          {
            $set: {
              reservedStock: correctReservedStock,
              availableStock: result.currentStock - correctReservedStock
            }
          }
        );
        result.reservedStock = correctReservedStock;
        result.availableStock = result.currentStock - correctReservedStock;
      }

      return result;
    } catch (error) {
      // Check if it's a write conflict (concurrent update)
      if (error.code === 11000 || error.message.includes('WriteConflict')) {
        throw new Error('CONCURRENT_UPDATE_CONFLICT');
      }
      throw error;
    }
  }

  /**
   * Release reservation atomically
   * @param {String} productId - Product ID
   * @param {String} reservationId - Reservation ID
   * @returns {Promise<Boolean>} Success
   */
  async releaseReservation(productId, reservationId) {
    const now = new Date();

    try {
      const result = await Inventory.findOneAndUpdate(
        {
          product: productId,
          "reservations.reservationId": reservationId
        },
        [
          {
            // Remove the reservation
            $set: {
              reservations: {
                $filter: {
                  input: "$reservations",
                  as: "res",
                  cond: { $ne: ["$$res.reservationId", reservationId] }
                }
              }
            }
          },
          {
            // Recalculate reservedStock from active reservations
            $set: {
              reservedStock: {
                $sum: {
                  $map: {
                    input: {
                      $filter: {
                        input: "$reservations",
                        as: "res",
                        cond: { $gt: ["$$res.expiresAt", now] }
                      }
                    },
                    as: "active",
                    in: "$$active.quantity"
                  }
                }
              }
            }
          },
          {
            // Recalculate availableStock
            $set: {
              availableStock: {
                $subtract: ["$currentStock", "$reservedStock"]
              }
            }
          },
          {
            $set: {
              lastUpdated: new Date()
            }
          }
        ],
        { new: true }
      );

      if (result) {
        logger.info(`Reservation released: ${reservationId}`, {
          productId,
          availableStock: result.availableStock
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error releasing reservation: ${error.message}`, {
        productId,
        reservationId
      });
      throw error;
    }
  }

  /**
   * Cleanup expired reservations atomically (safe for concurrent execution)
   * @param {Object} options - Cleanup options
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupExpiredReservations(options = {}) {
    const {
      batchSize = 100,
      maxAge = 60000 // Only process if last cleanup was > 1 minute ago
    } = options;

    const now = new Date();
    const results = {
      inventoriesProcessed: 0,
      reservationsRemoved: 0,
      totalQuantityReleased: 0,
      timestamp: now
    };

    try {
      // Find inventories with expired reservations
      // Use lastCleanupAt to prevent concurrent cleanup conflicts
      const inventories = await Inventory.find({
        "reservations.expiresAt": { $lt: now },
        $or: [
          { lastCleanupAt: { $exists: false } },
          { lastCleanupAt: { $lt: new Date(now.getTime() - maxAge) } }
        ]
      })
        .limit(batchSize)
        .lean();

      for (const inventory of inventories) {
        try {
          // Mark as being cleaned (prevents concurrent cleanup)
          await Inventory.findByIdAndUpdate(
            inventory._id,
            {
              $set: {
                lastCleanupAt: now
              }
            }
          );

          // Count expired reservations
          const expiredCount = inventory.reservations.filter(
            r => new Date(r.expiresAt) < now
          ).length;

          if (expiredCount === 0) {
            continue;
          }

          // Atomic cleanup
          const cleaned = await Inventory.findByIdAndUpdate(
            inventory._id,
            [
              {
                // Remove expired reservations
                $set: {
                  reservations: {
                    $filter: {
                      input: "$reservations",
                      as: "res",
                      cond: { $gte: ["$$res.expiresAt", now] }
                    }
                  }
                }
              },
              {
                // Recalculate reservedStock
                $set: {
                  reservedStock: {
                    $sum: {
                      $map: {
                        input: "$reservations",
                        as: "res",
                        in: "$$res.quantity"
                      }
                    }
                  }
                }
              },
              {
                // Recalculate availableStock
                $set: {
                  availableStock: {
                    $subtract: ["$currentStock", "$reservedStock"]
                  }
                }
              },
              {
                $set: {
                  lastUpdated: now
                }
              }
            ],
            { new: true }
          );

          if (cleaned) {
            results.inventoriesProcessed++;
            results.reservationsRemoved += expiredCount;
            
            const quantityReleased = inventory.reservations
              .filter(r => new Date(r.expiresAt) < now)
              .reduce((sum, r) => sum + r.quantity, 0);
            results.totalQuantityReleased += quantityReleased;
          }
        } catch (error) {
          logger.error(`Error cleaning inventory ${inventory._id}:`, error);
          // Continue with next inventory
        }
      }

      logger.info(`Expired reservations cleaned`, results);
      return results;
    } catch (error) {
      logger.error(`Error in cleanup expired reservations:`, error);
      throw error;
    }
  }

  /**
   * Get reservation by ID
   * @param {String} productId - Product ID
   * @param {String} reservationId - Reservation ID
   * @returns {Promise<Object|null>} Reservation
   */
  async getReservation(productId, reservationId) {
    const inventory = await Inventory.findOne({
      product: productId,
      "reservations.reservationId": reservationId
    });

    if (!inventory) {
      return null;
    }

    const reservation = inventory.reservations.find(
      r => r.reservationId === reservationId
    );

    if (!reservation) {
      return null;
    }

    return {
      reservationId: reservation.reservationId,
      quantity: reservation.quantity,
      expiresAt: reservation.expiresAt,
      productId: productId,
      availableStock: inventory.availableStock,
      status: new Date(reservation.expiresAt) > new Date() ? 'active' : 'expired'
    };
  }

  /**
   * Reconcile reservations (fix any discrepancies)
   * @returns {Promise<Object>} Reconciliation results
   */
  async reconcileReservations() {
    const results = {
      inventoriesChecked: 0,
      discrepanciesFound: 0,
      discrepanciesFixed: 0,
      timestamp: new Date()
    };

    try {
      const inventories = await Inventory.find({}).lean();
      const now = new Date();

      for (const inventory of inventories) {
        results.inventoriesChecked++;

        // Calculate correct reservedStock from active reservations
        const activeReservations = inventory.reservations.filter(
          r => new Date(r.expiresAt) > now
        );
        const correctReservedStock = activeReservations.reduce(
          (sum, r) => sum + r.quantity, 0
        );

        // Check for discrepancy
        if (inventory.reservedStock !== correctReservedStock) {
          results.discrepanciesFound++;

          // Fix discrepancy atomically
          await Inventory.findByIdAndUpdate(
            inventory._id,
            {
              $set: {
                reservedStock: correctReservedStock,
                availableStock: inventory.currentStock - correctReservedStock,
                lastUpdated: new Date()
              }
            }
          );

          results.discrepanciesFixed++;
          logger.warn(`Reservation discrepancy fixed for product ${inventory.product}`, {
            expected: correctReservedStock,
            actual: inventory.reservedStock
          });
        }
      }

      logger.info(`Reservation reconciliation completed`, results);
      return results;
    } catch (error) {
      logger.error(`Error in reconciliation:`, error);
      throw error;
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new AtomicReservationService();

