import React, { useRef, useEffect, useMemo } from 'react';
import { X, Printer } from 'lucide-react';
import { useCompanyInfo } from '../hooks/useCompanyInfo';

const PrintModal = ({
  isOpen,
  onClose,
  orderData,
  companyInfo,
  documentTitle = 'Invoice',
  partyLabel = 'Customer'
}) => {
  const printRef = useRef(null);
  const { companyInfo: companySettings } = useCompanyInfo();
  const resolvedDocumentTitle = documentTitle || 'Invoice';

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const formatDate = (date) =>
    new Date(date || new Date()).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

  const formatDateTime = (date) =>
    new Date(date || new Date()).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

  const formatCurrency = (value) => {
    if (value === undefined || value === null || isNaN(value)) return '-';
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  };

  const toNumber = (value, fallback = 0) => {
    if (value === undefined || value === null) return fallback;
    const num = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
  };

  const formatText = (value, fallback = 'N/A') =>
    value && String(value).trim() !== '' ? value : fallback;

  const partyHeaderLabel =
    partyLabel?.toLowerCase() === 'supplier' ? 'Supplier' : 'Bill To';

  const resolvedCompanyName =
    companySettings.companyName || companyInfo?.name || 'Your Company Name';
  const resolvedCompanySubtitle = resolvedDocumentTitle;
  const resolvedCompanyAddress =
    companySettings.address || companyInfo?.address || '';
  const resolvedCompanyPhone =
    companySettings.contactNumber || companyInfo?.phone || '';

  const partyInfo = useMemo(() => {
    if (!orderData) {
      return {
        name: 'Walk-in Customer',
        email: 'N/A',
        phone: 'N/A',
        extra: ''
      };
    }

    const customer =
      orderData.customerInfo || orderData.customer || orderData.supplier || {};
    const composedName =
      customer.displayName ||
      customer.businessName ||
      customer.name ||
      (customer.firstName || customer.lastName
        ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
        : '') ||
      'Walk-in Customer';
    return {
      name: composedName,
      email: customer.email || 'N/A',
      phone: customer.phone || 'N/A',
      extra:
        customer.companyName ||
        orderData.customerInfo?.businessName ||
        orderData.customer?.businessName ||
        ''
    };
  }, [orderData]);

  const items = Array.isArray(orderData?.items) ? orderData.items : [];

  const computedSubtotal =
    orderData?.pricing?.subtotal ??
    orderData?.subtotal ??
    items.reduce((sum, item) => {
      const qty = toNumber(item.quantity ?? item.qty, 0);
      const price = toNumber(
        item.unitPrice ?? item.price ?? item.unitCost ?? item.rate,
        0
      );
      return sum + qty * price;
    }, 0);

  const discountValue =
    orderData?.pricing?.discountAmount ??
    orderData?.discount ??
    orderData?.pricing?.discount ??
    0;
  const taxValue =
    orderData?.pricing?.taxAmount ??
    orderData?.tax ??
    (orderData?.pricing?.isTaxExempt ? 0 : 0);
  const totalValue =
    orderData?.pricing?.total ??
    orderData?.total ??
    computedSubtotal - toNumber(discountValue) + toNumber(taxValue);

  const documentNumber =
    orderData?.invoiceNumber ||
    orderData?.orderNumber ||
    orderData?.poNumber ||
    orderData?.referenceNumber ||
    orderData?._id ||
    'N/A';

  const documentStatus =
    orderData?.status ||
    orderData?.orderStatus ||
    orderData?.invoiceStatus ||
    orderData?.payment?.status ||
    'Pending';

  const documentType =
    orderData?.orderType ||
    orderData?.type ||
    resolvedDocumentTitle ||
    'Invoice';

  const paymentStatus =
    orderData?.payment?.status ||
    (orderData?.payment?.isPartialPayment
      ? 'Partial'
      : orderData?.payment?.remainingBalance > 0
        ? 'Pending'
        : orderData?.payment?.amountPaid
          ? 'Paid'
          : orderData?.payment?.method
            ? 'Pending'
            : 'N/A');

  const paymentMethod = orderData?.payment?.method || 'N/A';
  const paymentAmount =
    orderData?.payment?.amountPaid ??
    orderData?.pricing?.total ??
    orderData?.total ??
    0;

  const generatedAt = new Date();

  const documentNumberLabel =
    resolvedDocumentTitle && resolvedDocumentTitle.toLowerCase().includes('order')
      ? `${resolvedDocumentTitle} #:`
      : resolvedDocumentTitle && resolvedDocumentTitle.toLowerCase().includes('purchase')
        ? `${resolvedDocumentTitle} #:`
        : 'Invoice #:';

  const billToLines = [
    partyInfo.name,
    partyInfo.extra || null,
    partyInfo.email !== 'N/A' ? partyInfo.email : null,
    partyInfo.phone !== 'N/A' ? partyInfo.phone : null,
    orderData?.customerInfo?.address || null
  ].filter(Boolean);

  const invoiceDetailLines = [
    { label: 'Invoice #:', value: formatText(documentNumber) },
    {
      label: 'Date:',
      value: formatDate(orderData?.createdAt || orderData?.invoiceDate)
    },
    { label: 'Status:', value: formatText(documentStatus) },
    { label: 'Type:', value: formatText(documentType) }
  ];

  const paymentDetailLines = [
    { label: 'Status:', value: formatText(paymentStatus) },
    { label: 'Method:', value: formatText(paymentMethod) },
    { label: 'Amount:', value: formatCurrency(paymentAmount) }
  ];

  const handlePrint = () => {
    const printContent = printRef.current;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>${resolvedDocumentTitle} - ${documentNumber}</title>
          <style>
            @media print {
              @page {
                size: A4;
                margin: 0.4in;
              }
              body {
                font-family: 'Inter', Arial, sans-serif;
                font-size: 12px;
                color: #111827;
                margin: 0;
                padding: 0;
                background: #f5f6fb;
              }
              .print-preview-scale {
                transform: none !important;
              }
              .print-document {
                width: 100%;
                max-width: 100%;
                box-shadow: none;
                border-radius: 0;
                padding: 24px 28px;
              }
              .print-document__company-name {
                font-size: 28px;
              }
            }
            .print-preview-scale {
              width: 100%;
            }
            .print-document {
              width: 900px;
              background: #fff;
              border-radius: 18px;
              padding: 32px 36px 28px;
              box-shadow: 0 20px 45px rgba(15, 23, 42, 0.18);
              font-family: 'Inter', 'Segoe UI', sans-serif;
            }
            .print-document__title {
              font-size: 18px;
              font-weight: 600;
              color: #111827;
              margin-bottom: 12px;
            }
            .print-document__company {
              text-align: center;
              margin-bottom: 28px;
            }
            .print-document__company-name {
              font-size: 30px;
              font-weight: 700;
              margin-bottom: 4px;
            }
            .print-document__company-subtitle {
              font-size: 16px;
              color: #6b7280;
            }
            .print-document__info-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
              gap: 24px;
              margin-bottom: 28px;
            }
            .print-document__info-section {
              border-top: 2px solid #e5e7eb;
              padding-top: 12px;
            }
            .print-document__info-title {
              font-size: 12px;
              font-weight: 600;
              color: #6b7280;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              margin-bottom: 10px;
            }
            .print-document__info-row {
              font-size: 13px;
              color: #111827;
              margin-bottom: 6px;
              display: flex;
              justify-content: space-between;
            }
            .print-document__info-label {
              font-weight: 500;
              color: #374151;
            }
            .print-document__info-value {
              text-align: right;
              max-width: 65%;
            }
            .print-document__table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
            }
            .print-document__table th {
              background: #f3f4f6;
              border: 1px solid #e5e7eb;
              text-align: left;
              padding: 10px;
              font-size: 13px;
              font-weight: 600;
              color: #111827;
            }
            .print-document__table td {
              border: 1px solid #e5e7eb;
              padding: 10px;
              font-size: 13px;
              color: #374151;
            }
            .print-document__summary {
              margin-top: 24px;
              display: flex;
              justify-content: flex-end;
            }
            .print-document__summary-table {
              width: 260px;
            }
            .print-document__summary-row {
              display: flex;
              justify-content: space-between;
              font-size: 14px;
              margin-bottom: 6px;
              color: #111827;
            }
            .print-document__summary-row--total {
              border-top: 1px solid #e5e7eb;
              padding-top: 8px;
              margin-top: 6px;
              font-weight: 700;
              font-size: 16px;
            }
            .print-document__footer {
              margin-top: 24px;
              text-align: center;
              color: #6b7280;
              font-size: 12px;
            }
            .print-document__footer span {
              display: block;
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  if (!isOpen || !orderData) return null;

  const documentHeading = `${resolvedDocumentTitle} Details`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 p-4 overflow-hidden">
      <div className="w-full h-full overflow-auto flex items-center justify-center">
        <div className="bg-transparent w-full max-w-[95vw] max-h-[92vh] flex flex-col items-center">
          <div className="p-4 print-preview-wrapper w-full">
          <div ref={printRef} className="print-preview-scale">
            <div className="print-document">
              <div className="print-document__toolbar">
                <h2 className="print-document__heading">{documentHeading}</h2>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handlePrint}
                    className="btn btn-success btn-md flex items-center space-x-2 px-4"
                  >
                    <Printer className="h-4 w-4" />
                    <span>Print</span>
                  </button>
                  <button
                    onClick={onClose}
                    className="btn btn-secondary-outline btn-md flex items-center space-x-2 px-4 text-gray-700 border border-gray-300 hover:bg-gray-100"
                  >
                    <X className="h-4 w-4" />
                    <span>Close</span>
                  </button>
                </div>
              </div>

              <div className="print-document__company">
                <div className="print-document__company-name">{resolvedCompanyName}</div>
                <div className="print-document__company-subtitle">{resolvedCompanySubtitle}</div>
              </div>

              <div className="print-document__info-grid">
                <div className="print-document__info-block">
                  <div className="print-document__section-label">{partyHeaderLabel}:</div>
                  {billToLines.map((line, idx) => (
                    <div
                      key={`bill-${idx}`}
                      className="print-document__info-line print-document__info-line--stack"
                    >
                      {line}
                    </div>
                  ))}
                </div>
                <div className="print-document__info-block">
                  <div className="print-document__section-label">Invoice Details:</div>
                  {invoiceDetailLines.map((line, idx) => (
                    <div key={`inv-${idx}`} className="print-document__info-line">
                      <span className="print-document__info-label">{line.label}</span>
                      <span className="print-document__info-value">{line.value}</span>
                    </div>
                  ))}
                </div>
                <div className="print-document__info-block">
                  <div className="print-document__section-label">Payment:</div>
                  {paymentDetailLines.map((line, idx) => (
                    <div key={`pay-${idx}`} className="print-document__info-line">
                      <span className="print-document__info-label">{line.label}</span>
                      <span className="print-document__info-value">{line.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="print-document__section-label mt-6">Items:</div>

              <table className="print-document__table mt-3">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center' }}>
                        No items available
                      </td>
                    </tr>
                  )}
                  {items.map((item, index) => {
                    const qty = toNumber(item.quantity ?? item.qty, 0);
                    const price = toNumber(
                      item.unitPrice ?? item.price ?? item.unitCost ?? item.rate,
                      0
                    );
                    const lineTotal = toNumber(item.total ?? item.lineTotal, qty * price);
                    return (
                      <tr key={index}>
                        <td>{item.product?.name || item.name || `Item ${index + 1}`}</td>
                        <td>
                          {item.product?.description ||
                            item.description ||
                            item.notes ||
                            '—'}
                        </td>
                        <td>{formatCurrency(qty)}</td>
                        <td>{formatCurrency(price)}</td>
                        <td>{formatCurrency(lineTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="print-document__summary">
                <div className="print-document__summary-table">
                  <div className="print-document__summary-row">
                    <span>Subtotal</span>
                    <span>{formatCurrency(computedSubtotal)}</span>
                  </div>
                  <div className="print-document__summary-row">
                    <span>Tax</span>
                    <span>{formatCurrency(taxValue)}</span>
                  </div>
                  <div className="print-document__summary-row">
                    <span>Discount</span>
                    <span>{formatCurrency(discountValue)}</span>
                  </div>
                  <div className="print-document__summary-row print-document__summary-row--total">
                    <span>Total</span>
                    <span>{formatCurrency(totalValue)}</span>
                  </div>
                </div>
              </div>

              <div className="print-document__footer">
                <div className="print-document__generated">
                  Generated on {formatDateTime(generatedAt)} &nbsp;•&nbsp; Printed by{' '}
                  {orderData?.createdBy?.name || 'Current User'}
                </div>
                {resolvedCompanyAddress && <span>{resolvedCompanyAddress}</span>}
                {resolvedCompanyPhone && <span>Phone: {resolvedCompanyPhone}</span>}
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintModal;