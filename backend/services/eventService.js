/**
 * Event Service - Enterprise Event-Driven Architecture
 * 
 * Handles async event processing for non-critical operations
 * - Invoice PDF generation
 * - Notifications (email/SMS/WhatsApp)
 * - Sales metrics updates
 * - Investor profit distribution
 * - Stock movement tracking
 */

const EventEmitter = require('events');
const logger = require('../utils/logger');

class EventService extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Allow multiple listeners
    this.eventQueue = new Map(); // Track pending events
    this.retryAttempts = new Map(); // Track retry attempts
  }

  /**
   * Emit event for async processing
   * @param {String} eventName - Event name
   * @param {Object} payload - Event payload
   * @param {Object} options - Options (retry, priority, etc.)
   * @returns {Promise<String>} Event ID
   */
  async emitEvent(eventName, payload, options = {}) {
    const {
      retry = true,
      maxRetries = 3,
      retryDelay = 1000,
      priority = 'normal',
      eventId = null
    } = options;

    const eventIdFinal = eventId || `${eventName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const eventData = {
      eventId: eventIdFinal,
      eventName,
      payload,
      timestamp: new Date(),
      priority,
      retry,
      maxRetries,
      retryDelay,
      attempts: 0,
      status: 'pending'
    };

    // Store event for tracking
    this.eventQueue.set(eventIdFinal, eventData);

    try {
      // Emit event asynchronously (non-blocking)
      setImmediate(() => {
        this.emit(eventName, eventData);
      });

      logger.info(`Event emitted: ${eventName}`, { eventId: eventIdFinal });
      
      return eventIdFinal;
    } catch (error) {
      logger.error(`Error emitting event ${eventName}:`, error);
      eventData.status = 'failed';
      eventData.error = error.message;
      throw error;
    }
  }

  /**
   * Register event handler
   * @param {String} eventName - Event name
   * @param {Function} handler - Handler function
   * @param {Object} options - Handler options
   */
  onEvent(eventName, handler, options = {}) {
    const {
      async = true,
      errorHandler = null
    } = options;

    this.on(eventName, async (eventData) => {
      const { eventId, payload } = eventData;

      try {
        if (async) {
          // Process asynchronously
          setImmediate(async () => {
            await this.processEvent(eventName, eventId, payload, handler, eventData);
          });
        } else {
          // Process synchronously
          await this.processEvent(eventName, eventId, payload, handler, eventData);
        }
      } catch (error) {
        logger.error(`Error in event handler for ${eventName}:`, error);
        
        if (errorHandler) {
          await errorHandler(error, eventData);
        } else {
          await this.handleEventError(eventData, error);
        }
      }
    });
  }

  /**
   * Process event with retry logic
   * @param {String} eventName - Event name
   * @param {String} eventId - Event ID
   * @param {Object} payload - Event payload
   * @param {Function} handler - Handler function
   * @param {Object} eventData - Full event data
   */
  async processEvent(eventName, eventId, payload, handler, eventData) {
    const { retry, maxRetries, retryDelay } = eventData;
    let attempts = eventData.attempts || 0;

    while (attempts < maxRetries) {
      try {
        eventData.status = 'processing';
        eventData.attempts = attempts + 1;
        eventData.lastAttempt = new Date();

        logger.info(`Processing event ${eventName} (attempt ${eventData.attempts}/${maxRetries})`, { eventId });

        // Execute handler
        await handler(payload, eventData);

        // Success
        eventData.status = 'completed';
        eventData.completedAt = new Date();
        this.eventQueue.set(eventId, eventData);

        logger.info(`Event ${eventName} completed successfully`, { eventId });
        return;

      } catch (error) {
        attempts++;
        eventData.attempts = attempts;
        eventData.lastError = error.message;
        eventData.lastErrorAt = new Date();

        logger.error(`Event ${eventName} failed (attempt ${attempts}/${maxRetries}):`, error);

        if (attempts >= maxRetries || !retry) {
          // Max retries reached or retry disabled
          eventData.status = 'failed';
          eventData.failedAt = new Date();
          eventData.finalError = error.message;
          this.eventQueue.set(eventId, eventData);

          logger.error(`Event ${eventName} failed permanently after ${attempts} attempts`, {
            eventId,
            error: error.message
          });

          // Emit failure event for monitoring
          this.emit('event:failed', {
            eventName,
            eventId,
            error: error.message,
            attempts
          });

          throw error;
        }

        // Wait before retry
        await this.sleep(retryDelay * attempts); // Exponential backoff
      }
    }
  }

  /**
   * Handle event error
   * @param {Object} eventData - Event data
   * @param {Error} error - Error
   */
  async handleEventError(eventData, error) {
    const { eventName, eventId } = eventData;

    eventData.status = 'error';
    eventData.error = error.message;
    eventData.errorAt = new Date();
    this.eventQueue.set(eventId, eventData);

    // Emit error event
    this.emit('event:error', {
      eventName,
      eventId,
      error: error.message
    });
  }

  /**
   * Get event status
   * @param {String} eventId - Event ID
   * @returns {Object} Event status
   */
  getEventStatus(eventId) {
    return this.eventQueue.get(eventId) || null;
  }

  /**
   * Sleep utility
   * @param {Number} ms - Milliseconds
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create singleton instance
const eventService = new EventService();

// Event Names (Constants)
const EVENTS = {
  // Sales Events
  SALES_ORDER_CREATED: 'sales:order:created',
  SALES_ORDER_UPDATED: 'sales:order:updated',
  SALES_ORDER_CANCELLED: 'sales:order:cancelled',
  
  // Invoice Events
  INVOICE_PDF_GENERATE: 'invoice:pdf:generate',
  INVOICE_EMAIL_SEND: 'invoice:email:send',
  
  // Notification Events
  NOTIFICATION_EMAIL: 'notification:email',
  NOTIFICATION_SMS: 'notification:sms',
  NOTIFICATION_WHATSAPP: 'notification:whatsapp',
  
  // Metrics Events
  SALES_METRICS_UPDATE: 'sales:metrics:update',
  SALES_PERFORMANCE_UPDATE: 'sales:performance:update',
  
  // Investor Events
  INVESTOR_PROFIT_DISTRIBUTE: 'investor:profit:distribute',
  
  // Inventory Events
  STOCK_MOVEMENT_TRACK: 'stock:movement:track',
  INVENTORY_ALERT: 'inventory:alert',
  
  // Customer Events
  CUSTOMER_BALANCE_UPDATED: 'customer:balance:updated',
  
  // System Events
  EVENT_FAILED: 'event:failed',
  EVENT_ERROR: 'event:error'
};

module.exports = {
  eventService,
  EVENTS
};

