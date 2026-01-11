/**
 * Event Handlers - Async Processing Handlers
 * 
 * Handles all async event processing for non-critical operations
 */

const logger = require('../utils/logger');
const { eventService, EVENTS } = require('./eventService');

/**
 * Initialize all event handlers
 */
function initializeEventHandlers() {
  // Invoice PDF Generation Handler
  eventService.onEvent(EVENTS.INVOICE_PDF_GENERATE, async (payload) => {
    const { orderId, orderNumber, customerId } = payload;
    
    logger.info(`Generating invoice PDF for order ${orderNumber}`, { orderId });
    
    try {
      const invoicePdfService = require('./invoicePdfService');
      const pdfPath = await invoicePdfService.generateInvoicePdf(orderId);
      
      logger.info(`Invoice PDF generated successfully: ${pdfPath}`, { orderId, orderNumber });
      
      // Emit event to send invoice via email if customer has email
      if (customerId) {
        await eventService.emitEvent(EVENTS.INVOICE_EMAIL_SEND, {
          orderId,
          orderNumber,
          customerId,
          pdfPath
        });
      }
    } catch (error) {
      logger.error(`Error generating invoice PDF for order ${orderNumber}:`, error);
      throw error;
    }
  }, {
    async: true,
    errorHandler: async (error, eventData) => {
      logger.error(`Invoice PDF generation failed for event ${eventData.eventId}:`, error);
      // Could send alert to admin here
    }
  });

  // Email Notification Handler
  eventService.onEvent(EVENTS.NOTIFICATION_EMAIL, async (payload) => {
    const { to, subject, body, attachments, orderId } = payload;
    
    logger.info(`Sending email notification`, { to, subject, orderId });
    
    try {
      // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
      // For now, just log
      logger.info(`Email notification sent`, { to, subject });
      
      // Example integration:
      // const emailService = require('./emailService');
      // await emailService.sendEmail({ to, subject, body, attachments });
    } catch (error) {
      logger.error(`Error sending email notification:`, error);
      throw error;
    }
  });

  // SMS Notification Handler
  eventService.onEvent(EVENTS.NOTIFICATION_SMS, async (payload) => {
    const { to, message, orderId } = payload;
    
    logger.info(`Sending SMS notification`, { to, orderId });
    
    try {
      // TODO: Integrate with SMS service (Twilio, AWS SNS, etc.)
      logger.info(`SMS notification sent`, { to });
      
      // Example integration:
      // const smsService = require('./smsService');
      // await smsService.sendSMS({ to, message });
    } catch (error) {
      logger.error(`Error sending SMS notification:`, error);
      throw error;
    }
  });

  // WhatsApp Notification Handler
  eventService.onEvent(EVENTS.NOTIFICATION_WHATSAPP, async (payload) => {
    const { to, message, orderId } = payload;
    
    logger.info(`Sending WhatsApp notification`, { to, orderId });
    
    try {
      // TODO: Integrate with WhatsApp Business API
      logger.info(`WhatsApp notification sent`, { to });
      
      // Example integration:
      // const whatsappService = require('./whatsappService');
      // await whatsappService.sendMessage({ to, message });
    } catch (error) {
      logger.error(`Error sending WhatsApp notification:`, error);
      throw error;
    }
  });

  // Sales Metrics Update Handler
  eventService.onEvent(EVENTS.SALES_METRICS_UPDATE, async (payload) => {
    const { orderId, orderNumber, orderTotal, customerId, items } = payload;
    
    logger.info(`Updating sales metrics for order ${orderNumber}`, { orderId });
    
    try {
      const salesPerformanceService = require('./salesPerformanceService');
      
      // Update sales performance metrics
      await salesPerformanceService.updateMetricsForOrder({
        orderId,
        orderNumber,
        orderTotal,
        customerId,
        items,
        orderDate: new Date()
      });
      
      logger.info(`Sales metrics updated successfully`, { orderId, orderNumber });
    } catch (error) {
      logger.error(`Error updating sales metrics:`, error);
      throw error;
    }
  });

  // Investor Profit Distribution Handler
  eventService.onEvent(EVENTS.INVESTOR_PROFIT_DISTRIBUTE, async (payload) => {
    const { orderId, orderNumber, items, userId } = payload;
    
    logger.info(`Distributing profit for order ${orderNumber}`, { orderId });
    
    try {
      const profitDistributionService = require('./profitDistributionService');
      const Sales = require('../models/Sales');
      
      // Get order
      const order = await Sales.findById(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }
      
      // Distribute profit
      await profitDistributionService.distributeProfitForOrder(order, { _id: userId });
      
      logger.info(`Profit distributed successfully`, { orderId, orderNumber });
    } catch (error) {
      logger.error(`Error distributing profit:`, error);
      throw error;
    }
  });

  // Stock Movement Tracking Handler
  eventService.onEvent(EVENTS.STOCK_MOVEMENT_TRACK, async (payload) => {
    const { orderId, orderNumber, items, userId } = payload;
    
    logger.info(`Tracking stock movements for order ${orderNumber}`, { orderId });
    
    try {
      const stockMovementService = require('./stockMovementService');
      const Sales = require('../models/Sales');
      
      // Get order
      const order = await Sales.findById(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }
      
      // Track stock movements
      await stockMovementService.trackSalesOrder(order, { _id: userId });
      
      logger.info(`Stock movements tracked successfully`, { orderId, orderNumber });
    } catch (error) {
      logger.error(`Error tracking stock movements:`, error);
      throw error;
    }
  });

  // Sales Order Created Handler (orchestrates other events)
  eventService.onEvent(EVENTS.SALES_ORDER_CREATED, async (payload) => {
    const {
      orderId,
      orderNumber,
      customerId,
      orderTotal,
      items,
      userId,
      paymentMethod,
      paymentStatus
    } = payload;
    
    logger.info(`Processing post-order events for ${orderNumber}`, { orderId });
    
    try {
      // Emit all async events
      const events = [];
      
      // 1. Generate invoice PDF
      events.push(
        eventService.emitEvent(EVENTS.INVOICE_PDF_GENERATE, {
          orderId,
          orderNumber,
          customerId
        })
      );
      
      // 2. Update sales metrics
      events.push(
        eventService.emitEvent(EVENTS.SALES_METRICS_UPDATE, {
          orderId,
          orderNumber,
          orderTotal,
          customerId,
          items
        })
      );
      
      // 3. Track stock movements
      events.push(
        eventService.emitEvent(EVENTS.STOCK_MOVEMENT_TRACK, {
          orderId,
          orderNumber,
          items,
          userId
        })
      );
      
      // 4. Distribute profit (if order is confirmed/paid)
      if (paymentStatus === 'paid' || paymentStatus === 'confirmed') {
        events.push(
          eventService.emitEvent(EVENTS.INVESTOR_PROFIT_DISTRIBUTE, {
            orderId,
            orderNumber,
            items,
            userId
          })
        );
      }
      
      // 5. Send notifications (if customer has contact info)
      if (customerId) {
        // Email notification
        events.push(
          eventService.emitEvent(EVENTS.NOTIFICATION_EMAIL, {
            to: null, // Will be fetched from customer
            subject: `Order Confirmation: ${orderNumber}`,
            body: `Your order ${orderNumber} has been confirmed.`,
            orderId,
            customerId
          })
        );
      }
      
      // Wait for all events to be emitted (not completed)
      await Promise.all(events);
      
      logger.info(`All post-order events emitted for ${orderNumber}`, { orderId });
    } catch (error) {
      logger.error(`Error processing post-order events:`, error);
      throw error;
    }
  });

  logger.info('Event handlers initialized');
}

module.exports = {
  initializeEventHandlers
};

