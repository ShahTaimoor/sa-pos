import React, { useState } from 'react';
import { 
  FileText, 
  Search, 
  Plus,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Printer,
  Filter,
  Calendar
} from 'lucide-react';
import {
  useGetPurchaseInvoicesQuery,
  useConfirmPurchaseInvoiceMutation,
  useDeletePurchaseInvoiceMutation,
  useExportExcelMutation,
  useExportCSVMutation,
  useExportPDFMutation,
  useExportJSONMutation,
  useDownloadFileMutation,
} from '../store/services/purchaseInvoicesApi';
import { handleApiError, showSuccessToast, showErrorToast } from '../utils/errorHandler';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useTab } from '../contexts/TabContext';
import { getComponentInfo } from '../components/ComponentRegistry';

// Helper function to get local date in YYYY-MM-DD format (avoids timezone issues with toISOString)
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const StatusBadge = ({ status }) => {
  const statusConfig = {
    draft: { color: 'bg-gray-100 text-gray-800', icon: Clock, label: 'Draft' },
    confirmed: { color: 'bg-blue-100 text-blue-800', icon: CheckCircle, label: 'Confirmed' },
    received: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Received' },
    paid: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Paid' },
    cancelled: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Cancelled' },
    closed: { color: 'bg-gray-100 text-gray-800', icon: XCircle, label: 'Closed' }
  };

  const config = statusConfig[status] || statusConfig.draft;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </span>
  );
};

const PurchaseInvoiceCard = ({ invoice, onEdit, onDelete, onConfirm, onView, onPrint }) => (
  <div className="card hover:shadow-lg transition-shadow">
    <div className="card-content">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="font-semibold text-gray-900">{invoice.invoiceNumber}</h3>
            <StatusBadge status={invoice.status} />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center text-sm text-gray-600">
              <FileText className="h-4 w-4 mr-2" />
              {invoice.supplierInfo?.companyName || invoice.supplierInfo?.name || 'Unknown Supplier'}
            </div>
            
            <div className="flex items-center text-sm text-gray-600">
              <TrendingUp className="h-4 w-4 mr-2" />
              {Math.round(invoice.pricing?.total || 0)} ({invoice.items?.length || 0} items)
            </div>
            
            <div className="text-sm text-gray-500">
              {new Date(invoice.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onView(invoice)}
            className="text-gray-600 hover:text-gray-800"
            title="View Invoice"
          >
            <Eye className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => onPrint && onPrint(invoice)}
            className="text-green-600 hover:text-green-800"
            title="Print Invoice"
          >
            <Printer className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => onEdit(invoice)}
            className="text-blue-600 hover:text-blue-800"
            title="Edit Invoice"
          >
            <Edit className="h-4 w-4" />
          </button>
          
          {/* Show delete button for all statuses except paid and closed */}
          {!['paid', 'closed'].includes(invoice.status) && (
            <button
              onClick={() => onDelete(invoice)}
              className="text-red-600 hover:text-red-800"
              title="Delete Invoice"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
);

export const PurchaseInvoices = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const today = getLocalDateString();
  const [dateFrom, setDateFrom] = useState(today); // Today
  const [dateTo, setDateTo] = useState(today); // Today
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  
  const { openTab } = useTab();

  // Build query params
  const queryParams = React.useMemo(() => {
    const params = {
      search: searchTerm || undefined,
      status: statusFilter || undefined,
    };
    
    if (dateFrom) {
      params.dateFrom = dateFrom;
    }
    if (dateTo) {
      params.dateTo = dateTo;
    }
    
    return params;
  }, [searchTerm, statusFilter, dateFrom, dateTo]);

  // Fetch purchase invoices
  const { data, isLoading, error, refetch } = useGetPurchaseInvoicesQuery(
    queryParams,
    { refetchOnMountOrArgChange: true }
  );

  // Editing occurs in Purchase page; no supplier query needed here

  // Mutations
  const [confirmPurchaseInvoiceMutation, { isLoading: confirming }] = useConfirmPurchaseInvoiceMutation();
  const [deletePurchaseInvoiceMutation, { isLoading: deleting }] = useDeletePurchaseInvoiceMutation();
  const [exportExcelMutation] = useExportExcelMutation();
  const [exportCSVMutation] = useExportCSVMutation();
  const [exportPDFMutation] = useExportPDFMutation();
  const [exportJSONMutation] = useExportJSONMutation();
  const [downloadFileMutation] = useDownloadFileMutation();

  // Print helper
  const handlePrint = (invoice) => {
    if (!invoice) return;
    const win = window.open('', '_blank');
    if (!win) return;

    const safeRender = (str) => {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, m => {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return map[m];
      });
    };

    const itemsRows = (invoice.items || []).map(item => `
      <tr>
        <td class="border border-gray-300 px-4 py-2">${safeRender(item.product?.name || 'Unknown Product')}</td>
        <td class="border border-gray-300 px-4 py-2">${safeRender(item.product?.description || '')}</td>
        <td class="border border-gray-300 px-4 py-2 text-right">${item.quantity || 0}</td>
        <td class="border border-gray-300 px-4 py-2 text-right">${Math.round(item.unitCost || 0)}</td>
        <td class="border border-gray-300 px-4 py-2 text-right">${Math.round(item.totalCost || 0)}</td>
      </tr>
    `).join('') || `
      <tr>
        <td colspan="5" class="border border-gray-300 px-4 py-2 text-center text-gray-500">No items found</td>
      </tr>
    `;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Purchase Invoice ${safeRender(invoice.invoiceNumber)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; color: #111827; }
    .header { text-align: center; margin-bottom: 30px; }
    .company-name { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
    .invoice-type { font-size: 18px; color: #6b7280; }
    .invoice-details { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .supplier-info, .invoice-info, .payment-info { width: 100%; }
    .invoice-info, .payment-info { text-align: right; }
    .section-title { font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px; font-size: 14px; }
    .section-content { font-size: 14px; }
    .section-content p { margin: 4px 0; }
    .font-medium { font-weight: 500; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .items-table th, .items-table td { border: 1px solid #ccc; padding: 8px; }
    .items-table th { background-color: #f5f5f5; font-weight: bold; text-align: left; }
    .items-table .text-right { text-align: right; }
    .border { border: 1px solid #ccc; }
    .border-gray-300 { border-color: #ccc; }
    .px-4 { padding-left: 16px; padding-right: 16px; }
    .py-2 { padding-top: 8px; padding-bottom: 8px; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .text-gray-500 { color: #6b7280; }
    .totals { margin-left: auto; width: 300px; }
    .totals table { width: 100%; }
    .totals td { padding: 5px 10px; font-size: 14px; }
    .totals .total-row { font-weight: bold; }
    .totals .total-row td { border-top: 2px solid #000; }
    .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">Your Company Name</div>
    <div class="invoice-type">Purchase Invoice</div>
  </div>
  
  <div class="invoice-details">
    <div class="supplier-info">
      <div class="section-title">Supplier Details:</div>
      <div class="section-content">
        <p style="font-weight: 500;">${safeRender(invoice.supplierInfo?.companyName || invoice.supplierInfo?.name || 'Unknown Supplier')}</p>
        <p>${safeRender(invoice.supplierInfo?.email || '')}</p>
        <p>${safeRender(invoice.supplierInfo?.phone || '')}</p>
        <p>${safeRender(invoice.supplierInfo?.address || '')}</p>
      </div>
    </div>
    <div class="invoice-info">
      <div class="section-title">Invoice Details:</div>
      <div class="section-content">
        <p><span class="font-medium">Invoice #:</span> ${safeRender(invoice.invoiceNumber)}</p>
        <p><span class="font-medium">Date:</span> ${new Date(invoice.createdAt).toLocaleDateString()}</p>
        <p><span class="font-medium">Status:</span> ${safeRender(invoice.status)}</p>
        <p><span class="font-medium">Type:</span> Purchase</p>
      </div>
    </div>
    <div class="payment-info">
      <div class="section-title">Payment:</div>
      <div class="section-content">
        <p><span class="font-medium">Status:</span> ${safeRender(invoice.payment?.status || 'pending')}</p>
        <p><span class="font-medium">Method:</span> ${safeRender(invoice.payment?.method || 'cash')}</p>
        <p><span class="font-medium">Amount:</span> ${Math.round(invoice.pricing?.total || 0)}</p>
      </div>
    </div>
  </div>
  
  <div>
    <div class="section-title" style="margin-bottom: 10px;">Items:</div>
    <table class="items-table">
      <thead>
        <tr>
          <th class="border border-gray-300 px-4 py-2 text-left">Item</th>
          <th class="border border-gray-300 px-4 py-2 text-left">Description</th>
          <th class="border border-gray-300 px-4 py-2 text-right">Qty</th>
          <th class="border border-gray-300 px-4 py-2 text-right">Cost</th>
          <th class="border border-gray-300 px-4 py-2 text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>
  </div>
  
  <div class="totals" style="display: flex; justify-content: flex-end;">
    <table>
      <tbody>
        <tr>
          <td class="px-4 py-2">Subtotal:</td>
          <td class="px-4 py-2 text-right">${Math.round(invoice.pricing?.subtotal || 0)}</td>
        </tr>
        ${invoice.pricing?.taxAmount > 0 ? `
        <tr>
          <td class="px-4 py-2">Tax:</td>
          <td class="px-4 py-2 text-right">${Math.round(invoice.pricing.taxAmount)}</td>
        </tr>
        ` : ''}
        ${invoice.pricing?.discountAmount > 0 ? `
        <tr>
          <td class="px-4 py-2">Discount:</td>
          <td class="px-4 py-2 text-right">${Math.round(invoice.pricing.discountAmount)}</td>
        </tr>
        ` : ''}
        <tr class="total-row">
          <td class="px-4 py-2 font-bold">Total:</td>
          <td class="px-4 py-2 text-right font-bold">${Math.round(invoice.pricing?.total || 0)}</td>
        </tr>
      </tbody>
    </table>
  </div>
  
  <div class="footer">
    Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
  </div>
  
  <script>window.onload=()=>{window.print();}</script>
</body>
</html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  // Table columns configuration
  const columns = [
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      accessor: (item) => item.invoiceNumber,
      render: (value, item) => (
        <div className="font-medium text-gray-900">{value}</div>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      accessor: (item) => item.supplierInfo?.companyName || item.supplierInfo?.name || 'Unknown',
      render: (value, item) => (
        <div>
          <div className="font-medium text-gray-900">{value}</div>
          <div className="text-sm text-gray-500">
            {new Date(item.createdAt).toLocaleDateString()}
          </div>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      accessor: (item) => item.pricing?.total || 0,
      render: (value, item) => (
        <div className="text-right">
          <div className="font-semibold text-gray-900">{Math.round(value)}</div>
          <div className="text-sm text-gray-500">{item.items?.length || 0} items</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (item) => item.status,
      render: (value, item) => <StatusBadge status={value} />,
    },
    {
      key: 'paymentStatus',
      header: 'Payment',
      accessor: (item) => item.payment?.status || 'pending',
      render: (value, item) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          value === 'paid' ? 'bg-green-100 text-green-800' :
          value === 'partial' ? 'bg-yellow-100 text-yellow-800' :
          value === 'overdue' ? 'bg-red-100 text-red-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {value}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      accessor: () => '',
      render: (value, item) => (
        <div className="flex space-x-2">
          <button
            onClick={() => handleView(item)}
            className="text-gray-600 hover:text-gray-800"
            title="View Invoice"
          >
            <Eye className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => handlePrint(item)}
            className="text-green-600 hover:text-green-800"
            title="Print Invoice"
          >
            <Printer className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => handleEdit(item)}
            className="text-blue-600 hover:text-blue-800"
            title="Edit Invoice"
          >
            <Edit className="h-4 w-4" />
          </button>
          
          {/* Show delete button for all statuses except paid and closed */}
          {!['paid', 'closed'].includes(item.status) && (
            <button
              onClick={() => handleDelete(item)}
              className="text-red-600 hover:text-red-800"
              title="Delete Invoice"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  // Event handlers
  const handleConfirm = (invoice) => {
    if (window.confirm(`Are you sure you want to confirm invoice ${invoice.invoiceNumber}?`)) {
      confirmPurchaseInvoiceMutation(invoice._id)
        .unwrap()
        .then(() => {
          showSuccessToast('Purchase invoice confirmed successfully');
          refetch();
        })
        .catch((error) => {
          handleApiError(error, 'Purchase Invoice Confirmation');
        });
    }
  };

  const handleDelete = (invoice) => {
    const message = invoice.status === 'confirmed' 
      ? `Are you sure you want to delete invoice ${invoice.invoiceNumber}?\n\nThis will:\n• Remove ${invoice.items?.length || 0} products from inventory\n• Reduce supplier balance by ${Math.round((invoice.pricing?.total || 0) - (invoice.payment?.amount || 0))}`
      : `Are you sure you want to delete invoice ${invoice.invoiceNumber}?`;
    
    if (window.confirm(message)) {
      deletePurchaseInvoiceMutation(invoice._id)
        .unwrap()
        .then(() => {
          showSuccessToast('Purchase invoice deleted successfully');
          refetch();
        })
        .catch((error) => {
          handleApiError(error, 'Purchase Invoice Deletion');
        });
    }
  };

  const handleEdit = (invoice) => {
    // Get component info for Purchase page
    const componentInfo = getComponentInfo('/purchase');
    if (componentInfo) {
      // Create a new tab for editing the purchase invoice
      const newTabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Prepare the invoice data to pass to the Purchase page
      const invoiceData = {
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        supplier: invoice.supplierInfo,
        items: invoice.items || [],
        notes: invoice.notes || '',
        invoiceType: invoice.invoiceType || 'purchase',
        isEditMode: true
      };
      
      openTab({
        title: `Edit Purchase - ${invoice.invoiceNumber}`,
        path: '/purchase',
        component: componentInfo.component,
        icon: componentInfo.icon,
        allowMultiple: true,
        props: { 
          tabId: newTabId,
          editData: invoiceData
        }
      });
      
      showSuccessToast(`Opening ${invoice.invoiceNumber} for editing...`);
    } else {
      showErrorToast('Purchase page not found');
    }
  };

  const handleView = (invoice) => {
    setSelectedInvoice(invoice);
    setShowViewModal(true);
  };

  const handleExport = async (format = 'csv') => {
    try {
      const payload = {
        search: searchTerm || undefined,
        status: statusFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      };
      let response;
      if (format === 'excel') {
        response = await exportExcelMutation(payload).unwrap();
      } else if (format === 'pdf') {
        response = await exportPDFMutation(payload).unwrap();
      } else if (format === 'json') {
        response = await exportJSONMutation(payload).unwrap();
      } else {
        response = await exportCSVMutation(payload).unwrap();
      }

      const filename =
        response?.filename ||
        (format === 'excel'
          ? 'purchase_invoices.xlsx'
          : format === 'pdf'
          ? 'purchase_invoices.pdf'
          : format === 'json'
          ? 'purchase_invoices.json'
          : 'purchase_invoices.csv');

      const downloadResponse = await downloadFileMutation(filename).unwrap();
      const blob =
        downloadResponse instanceof Blob
          ? downloadResponse
          : new Blob([downloadResponse], {
              type:
                format === 'excel'
                  ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                  : format === 'pdf'
                  ? 'application/pdf'
                  : format === 'json'
                  ? 'application/json'
                  : 'text/csv',
            });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showSuccessToast(`Exported purchase invoices as ${format.toUpperCase()}`);
    } catch (error) {
      handleApiError(error, 'Purchase Invoice Export');
    }
  };

  // Memoize invoices data - must be before conditional returns to follow Rules of Hooks
  const invoices = React.useMemo(() => {
    if (!data) return [];
    if (data?.data?.invoices) return data.data.invoices;
    if (data?.invoices) return data.invoices;
    if (data?.data?.data?.invoices) return data.data.data.invoices;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  }, [data]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load purchase invoices</p>
        <button onClick={refetch} className="btn btn-primary mt-4">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchase Invoices</h1>
          <p className="text-gray-600">Track and manage supplier invoices and receipts</p>
        </div>
        <button className="btn btn-primary btn-md">
          <Plus className="h-4 w-4 mr-2" />
          New Invoice
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900">Filters</h3>
          </div>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Invoice number, supplier, amount..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input pl-10 w-full h-[42px]"
                />
              </div>
            </div>

            {/* Date From */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                From Date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input h-[42px]"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                To Date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input h-[42px]"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input h-[42px]"
              >
                <option value="">All Status</option>
                <option value="draft">Draft</option>
                <option value="confirmed">Confirmed</option>
                <option value="received">Received</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Purchase Invoices Table */}
      {invoices.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No purchase invoices found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm || statusFilter || dateFrom || dateTo ? 'Try adjusting your filters.' : 'No purchase invoices have been created yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Table Header */}
          <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
            <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="col-span-2">Invoice Number</div>
              <div className="col-span-2">Supplier</div>
              <div className="col-span-1">Date</div>
              <div className="col-span-1">Items</div>
              <div className="col-span-1">Total</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1">Payment</div>
              <div className="col-span-1">Notes</div>
              <div className="col-span-2">Actions</div>
            </div>
          </div>
          
          {/* Table Body */}
          <div className="divide-y divide-gray-200">
            {invoices.map((invoice) => (
              <div key={invoice._id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="grid grid-cols-12 gap-4 items-center">
                  {/* Invoice Number */}
                  <div className="col-span-2">
                    <div className="font-medium text-gray-900 truncate">
                      {invoice.invoiceNumber}
                    </div>
                  </div>
                  
                  {/* Supplier */}
                  <div className="col-span-2">
                    <div className="text-sm text-gray-900 truncate">
                      {invoice.supplierInfo?.companyName || invoice.supplierInfo?.name || 'Unknown Supplier'}
                    </div>
                  </div>
                  
                  {/* Date */}
                  <div className="col-span-1">
                    <span className="text-sm text-gray-600">
                      {new Date(invoice.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  
                  {/* Items */}
                  <div className="col-span-1">
                    <span className="text-sm text-gray-600">
                      {invoice.items?.length || 0}
                    </span>
                  </div>
                  
                  {/* Total */}
                  <div className="col-span-1">
                    <span className="font-semibold text-gray-900">
                      {Math.round(invoice.pricing?.total || 0)}
                    </span>
                  </div>
                  
                  {/* Status */}
                  <div className="col-span-1">
                    <StatusBadge status={invoice.status} />
                  </div>
                  
                  {/* Payment */}
                  <div className="col-span-1">
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                      invoice.payment?.status === 'paid' ? 'bg-green-100 text-green-800' :
                      invoice.payment?.status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                      invoice.payment?.status === 'overdue' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {invoice.payment?.status || 'pending'}
                    </span>
                  </div>
                  
                  {/* Notes */}
                  <div className="col-span-1">
                    <span
                      className="text-xs text-gray-600 block truncate"
                      title={invoice.notes?.trim() || 'No notes'}
                    >
                      {invoice.notes?.trim() || '—'}
                    </span>
                  </div>
                  
                  {/* Actions */}
                  <div className="col-span-2">
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleView(invoice)}
                        className="text-gray-600 hover:text-gray-800 p-1"
                        title="View Invoice"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      
                      <button
                        onClick={() => handlePrint(invoice)}
                        className="text-green-600 hover:text-green-800 p-1"
                        title="Print Invoice"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                      
                      <button
                        onClick={() => handleEdit(invoice)}
                        className="text-blue-600 hover:text-blue-800 p-1"
                        title="Edit Invoice"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      
                      {/* Show delete button for all statuses except paid and closed */}
                      {!['paid', 'closed'].includes(invoice.status) && (
                        <button
                          onClick={() => handleDelete(invoice)}
                          className="text-red-600 hover:text-red-800 p-1"
                          title="Delete Invoice"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* View Modal */}
      {showViewModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Purchase Invoice Details</h2>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handlePrint(selectedInvoice)}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2"
                  >
                    <Printer className="h-4 w-4" />
                    <span>Print</span>
                  </button>
                  <button
                    onClick={() => setShowViewModal(false)}
                    className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Invoice Header */}
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Your Company Name</h1>
                <p className="text-lg text-gray-600">Purchase Invoice</p>
              </div>

              {/* Invoice Details */}
              <div className="grid grid-cols-3 gap-8 mb-8">
                {/* Supplier Information */}
                <div>
                  <h3 className="font-semibold text-gray-900 border-b border-gray-300 pb-2 mb-4">Supplier Details:</h3>
                  <div className="space-y-1">
                    <p className="font-medium">{selectedInvoice.supplierInfo?.companyName || selectedInvoice.supplierInfo?.name || 'Unknown Supplier'}</p>
                    <p className="text-gray-600">{selectedInvoice.supplierInfo?.email || ''}</p>
                    <p className="text-gray-600">{selectedInvoice.supplierInfo?.phone || ''}</p>
                    <p className="text-gray-600">{selectedInvoice.supplierInfo?.address || ''}</p>
                  </div>
                </div>

                {/* Invoice Information */}
                <div className="text-right">
                  <h3 className="font-semibold text-gray-900 border-b border-gray-300 pb-2 mb-4">Invoice Details:</h3>
                  <div className="space-y-1">
                    <p><span className="font-medium">Invoice #:</span> {selectedInvoice.invoiceNumber}</p>
                    <p><span className="font-medium">Date:</span> {new Date(selectedInvoice.createdAt).toLocaleDateString()}</p>
                    <p><span className="font-medium">Status:</span> {selectedInvoice.status}</p>
                    <p><span className="font-medium">Type:</span> Purchase</p>
                  </div>
                </div>

                {/* Payment Information */}
                <div className="text-right">
                  <h3 className="font-semibold text-gray-900 border-b border-gray-300 pb-2 mb-4">Payment:</h3>
                  <div className="space-y-1">
                    <p><span className="font-medium">Status:</span> {selectedInvoice.payment?.status || 'pending'}</p>
                    <p><span className="font-medium">Method:</span> {selectedInvoice.payment?.method || 'cash'}</p>
                    <p><span className="font-medium">Amount:</span> {Math.round(selectedInvoice.pricing?.total || 0)}</p>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="mb-8">
                <h3 className="font-semibold text-gray-900 border-b border-gray-300 pb-2 mb-4">Items:</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 px-4 py-2 text-left">Item</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">Description</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">Qty</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">Cost</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInvoice.items?.map((item, index) => (
                        <tr key={index}>
                          <td className="border border-gray-300 px-4 py-2">{item.product?.name || 'Unknown Product'}</td>
                          <td className="border border-gray-300 px-4 py-2">{item.product?.description || ''}</td>
                          <td className="border border-gray-300 px-4 py-2 text-right">{item.quantity}</td>
                          <td className="border border-gray-300 px-4 py-2 text-right">{Math.round(item.unitCost || 0)}</td>
                          <td className="border border-gray-300 px-4 py-2 text-right">{Math.round(item.totalCost || 0)}</td>
                        </tr>
                      )) || (
                        <tr>
                          <td colSpan="5" className="border border-gray-300 px-4 py-2 text-center text-gray-500">
                            No items found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-80">
                  <table className="w-full">
                    <tbody>
                      <tr>
                        <td className="px-4 py-2">Subtotal:</td>
                        <td className="px-4 py-2 text-right">{Math.round(selectedInvoice.pricing?.subtotal || 0)}</td>
                      </tr>
                      {selectedInvoice.pricing?.taxAmount > 0 && (
                        <tr>
                          <td className="px-4 py-2">Tax:</td>
                          <td className="px-4 py-2 text-right">{Math.round(selectedInvoice.pricing.taxAmount)}</td>
                        </tr>
                      )}
                      {selectedInvoice.pricing?.discountAmount > 0 && (
                        <tr>
                          <td className="px-4 py-2">Discount:</td>
                          <td className="px-4 py-2 text-right">{Math.round(selectedInvoice.pricing.discountAmount)}</td>
                        </tr>
                      )}
                      <tr className="border-t-2 border-gray-900">
                        <td className="px-4 py-2 font-bold">Total:</td>
                        <td className="px-4 py-2 text-right font-bold">{Math.round(selectedInvoice.pricing?.total || 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-8 text-center text-sm text-gray-500">
                Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal removed: editing handled via opening /purchase tab */}
    </div>
  );
};
