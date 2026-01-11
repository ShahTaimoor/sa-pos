/**
 * Invoice PDF Generation Service
 * 
 * Generates invoice PDFs asynchronously
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Sales = require('../models/Sales');
const logger = require('../utils/logger');

class InvoicePdfService {
  /**
   * Generate invoice PDF for sales order
   * @param {String} orderId - Sales order ID
   * @returns {Promise<String>} PDF file path
   */
  async generateInvoicePdf(orderId) {
    try {
      // Get order with populated data
      const order = await Sales.findById(orderId)
        .populate('customer', 'businessName name firstName lastName email phone address')
        .populate('items.product', 'name description pricing')
        .populate('createdBy', 'firstName lastName');

      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      // Create PDF
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `invoice_${order.orderNumber}_${timestamp}.pdf`;
      const filepath = path.join(__dirname, '../exports', filename);

      // Ensure exports directory exists
      const exportsDir = path.dirname(filepath);
      if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
      }

      // Create write stream
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Generate PDF content
      this.generatePdfContent(doc, order);

      // Finalize PDF
      doc.end();

      // Wait for stream to finish
      await new Promise((resolve, reject) => {
        stream.on('finish', () => {
          logger.info(`Invoice PDF generated: ${filepath}`, { orderId, orderNumber: order.orderNumber });
          resolve(filepath);
        });
        stream.on('error', reject);
      });

      // Update order with PDF path (optional)
      await Sales.findByIdAndUpdate(orderId, {
        $set: { invoicePdfPath: filepath }
      });

      return filepath;
    } catch (error) {
      logger.error(`Error generating invoice PDF for order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Generate PDF content
   * @param {PDFDocument} doc - PDF document
   * @param {Object} order - Sales order
   */
  generatePdfContent(doc, order) {
    // Header
    doc.fontSize(20).text('INVOICE', { align: 'center' });
    doc.moveDown();

    // Order Information
    doc.fontSize(12);
    doc.text(`Order Number: ${order.orderNumber}`, { align: 'left' });
    doc.text(`Date: ${order.createdAt.toLocaleDateString()}`, { align: 'left' });
    doc.moveDown();

    // Customer Information
    if (order.customer) {
      doc.text('Bill To:', { underline: true });
      doc.text(order.customer.businessName || order.customer.name || '');
      if (order.customer.address) {
        doc.text(order.customer.address);
      }
      doc.moveDown();
    }

    // Items Table
    doc.text('Items:', { underline: true });
    doc.moveDown(0.5);

    // Table Header
    doc.fontSize(10);
    doc.text('Product', 50, doc.y, { width: 200 });
    doc.text('Qty', 250, doc.y, { width: 50 });
    doc.text('Price', 300, doc.y, { width: 80 });
    doc.text('Total', 380, doc.y, { width: 80 });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(460, doc.y).stroke();
    doc.moveDown(0.5);

    // Items
    let total = 0;
    for (const item of order.items) {
      const productName = item.product?.name || 'Product';
      const quantity = item.quantity || 0;
      const unitPrice = item.unitPrice || 0;
      const itemTotal = item.total || (quantity * unitPrice);

      doc.text(productName, 50, doc.y, { width: 200 });
      doc.text(quantity.toString(), 250, doc.y, { width: 50 });
      doc.text(`$${unitPrice.toFixed(2)}`, 300, doc.y, { width: 80 });
      doc.text(`$${itemTotal.toFixed(2)}`, 380, doc.y, { width: 80 });
      doc.moveDown(0.5);

      total += itemTotal;
    }

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(460, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals
    doc.fontSize(12);
    const subtotal = order.pricing?.subtotal || total;
    const discount = order.pricing?.discountAmount || 0;
    const tax = order.pricing?.taxAmount || 0;
    const orderTotal = order.pricing?.total || total;

    doc.text(`Subtotal: $${subtotal.toFixed(2)}`, { align: 'right' });
    if (discount > 0) {
      doc.text(`Discount: -$${discount.toFixed(2)}`, { align: 'right' });
    }
    if (tax > 0) {
      doc.text(`Tax: $${tax.toFixed(2)}`, { align: 'right' });
    }
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica-Bold');
    doc.text(`Total: $${orderTotal.toFixed(2)}`, { align: 'right' });
    doc.font('Helvetica').fontSize(12);

    // Footer
    doc.moveDown(2);
    doc.fontSize(10).text('Thank you for your business!', { align: 'center' });
  }
}

module.exports = new InvoicePdfService();

