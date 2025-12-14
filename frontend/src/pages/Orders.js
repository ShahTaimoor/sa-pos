import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { 
  ShoppingCart, 
  Search, 
  Filter,
  Plus,
  Eye,
  CheckCircle,
  Clock,
  XCircle,
  Trash2,
  Edit,
  Printer
} from 'lucide-react';
import { salesAPI, productsAPI, customersAPI, settingsAPI } from '../services/api';
import { handleApiError, showSuccessToast, showErrorToast } from '../utils/errorHandler';
import { useTab } from '../contexts/TabContext';
import { getComponentInfo } from '../components/ComponentRegistry';

const OrderCard = ({ order, onDelete, onView, onEdit, onPrint }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
      case 'delivered':
        return 'badge-success';
      case 'pending':
      case 'processing':
        return 'badge-warning';
      case 'cancelled':
        return 'badge-danger';
      default:
        return 'badge-gray';
    }
  };

  const getPaymentStatusColor = (status) => {
    switch (status) {
      case 'paid':
        return 'badge-success';
      case 'partial':
        return 'badge-warning';
      case 'pending':
        return 'badge-gray';
      default:
        return 'badge-gray';
    }
  };

  return (
    <div className="card">
      <div className="card-content">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-medium text-gray-900">
              Order #{order.orderNumber}
            </h3>
            <p className="text-sm text-gray-600">
              {order.customerInfo?.name || 'Walk-in Customer'}
            </p>
            <p className="text-sm text-gray-600">
              {new Date(order.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-900">
              {Math.round(order.pricing.total)}
            </p>
            <p className="text-sm text-gray-600">
              {order.items.length} item{order.items.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className={`badge ${getStatusColor(order.status)}`}>
              {order.status}
            </span>
            <span className={`badge ${getPaymentStatusColor(order.payment.status)}`}>
              {order.payment.status}
            </span>
            <span className="badge badge-info">
              {order.orderType}
            </span>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => onView(order)}
              className="text-primary-600 hover:text-primary-800"
              title="View Invoice"
            >
            <Eye className="h-4 w-4" />
          </button>
            <button
              onClick={() => onPrint(order)}
              className="text-green-600 hover:text-green-800"
              title="Print Invoice"
            >
              <Printer className="h-4 w-4" />
            </button>
            <button
              onClick={() => onEdit(order)}
              className="text-blue-600 hover:text-blue-800"
              title="Edit Invoice"
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              onClick={() => onDelete(order)}
              className="text-red-600 hover:text-red-800"
              title="Delete Invoice"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Orders = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    notes: '',
    items: [],
    customer: null,
    orderType: 'retail'
  });
  
  const { openTab } = useTab();
  const [showProductModal, setShowProductModal] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [availableProducts, setAvailableProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [newProductQuantity, setNewProductQuantity] = useState(1);
  const [newProductRate, setNewProductRate] = useState(0);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery(
    ['orders', { search: searchTerm, status: statusFilter }],
    () => salesAPI.getOrders({ 
      search: searchTerm, 
      status: statusFilter || undefined 
    }),
    {
      keepPreviousData: true,
    }
  );

  const { data: companySettingsData } = useQuery(
    'companySettings',
    settingsAPI.getCompanySettings,
    {
      staleTime: 5 * 60 * 1000,
      cacheTime: 10 * 60 * 1000,
    }
  );

  const companySettings = companySettingsData?.data || {};
  const companyName = companySettings.companyName?.trim() || 'Your Company Name';
  const companyAddress = companySettings.address?.trim() || '';
  const companyPhone = companySettings.contactNumber?.trim() || '';
  const companyEmail = companySettings.email?.trim() || '';

  // Products query for adding items
  const { data: productsData } = useQuery(
    ['products', { search: productSearchTerm }],
    () => productsAPI.getProducts({ 
      search: productSearchTerm,
      limit: 50 
    }),
    {
      enabled: showProductModal,
      keepPreviousData: true,
    }
  );

  // Customers query for customer selection
  const { data: customersData } = useQuery(
    ['customers', { search: customerSearchTerm }],
    () => customersAPI.getCustomers({ 
      search: customerSearchTerm,
      limit: 50 
    }),
    {
      enabled: showEditModal,
      keepPreviousData: true,
    }
  );

  // Delete mutation
  const deleteMutation = useMutation(salesAPI.deleteOrder, {
    onSuccess: () => {
      queryClient.invalidateQueries('orders');
      showSuccessToast('Sales invoice deleted successfully');
    },
    onError: (error) => {
      handleApiError(error, 'Sales Invoice Deletion');
    }
  });

  // Edit mutation
  const editMutation = useMutation(salesAPI.updateOrder, {
    onSuccess: () => {
      queryClient.invalidateQueries('orders');
      showSuccessToast('Sales invoice updated successfully');
    },
    onError: (error) => {
      handleApiError(error, 'Sales Invoice Update');
    }
  });

  // Event handlers
  const handleEdit = (order) => {
    // Get component info for Sales page
    const componentInfo = getComponentInfo('/sales');
    if (componentInfo) {
      // Create a new tab for editing the sales invoice
      const newTabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Prepare the order data to pass to the Sales page
      const orderData = {
        orderId: order._id,
        orderNumber: order.orderNumber,
        customer: order.customer,
        items: order.items || [],
        notes: order.notes || '',
        orderType: order.orderType || 'retail',
        isTaxExempt: order.pricing?.isTaxExempt !== undefined ? order.pricing.isTaxExempt : true,
        payment: order.payment || null,
        isEditMode: true
      };
      
      openTab({
        title: `Edit Sales - ${order.orderNumber}`,
        path: '/sales',
        component: componentInfo.component,
        icon: componentInfo.icon,
        allowMultiple: true,
        props: { 
          tabId: newTabId,
          editData: orderData
        }
      });
      
      showSuccessToast(`Opening ${order.orderNumber} for editing...`);
    } else {
      showErrorToast('Sales page not found');
    }
  };

  const handlePrint = (order) => {
    const addressLine = companyAddress ? `<div>${companyAddress}</div>` : '';
    const contactSegments = [];
    if (companyPhone) {
      contactSegments.push(`Phone: ${companyPhone}`);
    }
    if (companyEmail) {
      contactSegments.push(`Email: ${companyEmail}`);
    }
    const contactLine = contactSegments.length ? `<div>${contactSegments.join(' | ')}</div>` : '';

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sales Invoice - ${order.orderNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .company-name { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
          .invoice-details { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .customer-info, .invoice-info, .payment-info { width: 100%; }
          .invoice-info, .payment-info { text-align: right; }
          .section-title { font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .items-table th, .items-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          .items-table th { background-color: #f5f5f5; font-weight: bold; }
          .text-right { text-align: right; }
          .totals { margin-left: auto; width: 300px; }
          .totals table { width: 100%; }
          .totals td { padding: 5px 10px; }
          .totals .total-row { font-weight: bold; }
          .totals .total-row td { border-top: 1px solid #000; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
          @media print { body { margin: 0; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">${companyName}</div>
          ${addressLine}
          ${contactLine}
          <div>Sales Invoice</div>
        </div>
        
        <div class="invoice-details">
          <div class="customer-info">
            <div class="section-title">Bill To:</div>
            <div><strong>${order.customerInfo?.name || 'N/A'}</strong></div>
            <div>${order.customerInfo?.email || ''}</div>
            <div>${order.customerInfo?.phone || ''}</div>
            <div>${order.customerInfo?.address || ''}</div>
            ${order.customerInfo?.pendingBalance ? `<div style="margin-top: 10px;"><strong>Pending Balance: ${Math.round(order.customerInfo.pendingBalance)}</strong></div>` : ''}
          </div>
          <div class="invoice-info">
            <div class="section-title">Invoice Details:</div>
            <div><strong>Invoice #:</strong> ${order.orderNumber}</div>
            <div><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</div>
            <div><strong>Status:</strong> ${order.status}</div>
            <div><strong>Type:</strong> ${order.orderType}</div>
          </div>
          <div class="payment-info">
            <div class="section-title">Payment:</div>
            <div><strong>Status:</strong> ${order.payment?.status}</div>
            <div><strong>Method:</strong> ${order.payment?.method}</div>
            <div><strong>Amount:</strong> ${Math.round(order.pricing?.total || 0)}</div>
          </div>
        </div>
        
        <table class="items-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Description</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Price</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${order.items?.map(item => `
              <tr>
                <td>${item.product?.name || 'Unknown Product'}</td>
                <td>${item.product?.description || ''}</td>
                <td class="text-right">${item.quantity}</td>
                <td class="text-right">${Math.round(item.unitPrice)}</td>
                <td class="text-right">${Math.round(item.total)}</td>
              </tr>
            `).join('') || '<tr><td colspan="5">No items found</td></tr>'}
          </tbody>
        </table>
        
        <div class="totals">
          <table>
            <tr>
              <td>Subtotal:</td>
              <td class="text-right">${Math.round(order.pricing?.subtotal || 0)}</td>
            </tr>
            <tr>
              <td>Tax:</td>
              <td class="text-right">${Math.round(order.pricing?.taxAmount || 0)}</td>
            </tr>
            <tr>
              <td>Discount:</td>
              <td class="text-right">${Math.round(order.pricing?.discountAmount || 0)}</td>
            </tr>
            <tr class="total-row">
              <td><strong>Total:</strong></td>
              <td class="text-right"><strong>${Math.round(order.pricing?.total || 0)}</strong></td>
            </tr>
          </table>
        </div>
        
        <div class="footer">
          <div>Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const handleDelete = (order) => {
    if (window.confirm(`Are you sure you want to delete invoice ${order.orderNumber}?`)) {
      deleteMutation.mutate(order._id);
    }
  };

  const handleView = (order) => {
    setSelectedOrder(order);
    setShowViewModal(true);
  };

  const handleAddNewProduct = () => {
    if (!selectedProduct || !newProductRate) {
      showErrorToast('Please select a product and enter a rate');
      return;
    }

    // Check if product is out of stock
    if (selectedProduct.inventory?.currentStock === 0) {
      showErrorToast(`${selectedProduct.name} is out of stock and cannot be added to the invoice.`);
      return;
    }

    // Check if requested quantity exceeds available stock
    if (newProductQuantity > selectedProduct.inventory?.currentStock) {
      showErrorToast(`Cannot add ${newProductQuantity} units. Only ${selectedProduct.inventory?.currentStock} units available in stock.`);
      return;
    }

    const newItem = {
      product: {
        _id: selectedProduct._id,
        name: selectedProduct.name,
        description: selectedProduct.description
      },
      quantity: newProductQuantity,
      unitPrice: newProductRate,
      total: newProductQuantity * newProductRate
    };

    const updatedItems = [...editFormData.items, newItem];
    setEditFormData({...editFormData, items: updatedItems});

    // Reset form
    setSelectedProduct(null);
    setNewProductQuantity(1);
    setNewProductRate(0);
    setProductSearchTerm('');

    showSuccessToast(`${selectedProduct.name} added to invoice`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-danger-600">Failed to load sales invoices</p>
      </div>
    );
  }

  const orders = data?.data?.orders || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Invoices</h1>
          <p className="text-gray-600">View and manage sales invoices</p>
        </div>
        <button className="btn btn-primary btn-md">
          <Plus className="h-4 w-4 mr-2" />
          New Invoice
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative min-w-0">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by invoice number, customer name, or amount..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
        <div className="flex-shrink-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input min-w-[120px]"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Orders Grid */}
      {orders.length === 0 ? (
        <div className="text-center py-12">
          <ShoppingCart className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No orders found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm || statusFilter ? 'Try adjusting your search terms.' : 'No orders have been placed yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Table Header */}
          <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
            <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="col-span-2">Order Number</div>
              <div className="col-span-2">Customer</div>
              <div className="col-span-1">Date</div>
              <div className="col-span-1">Items</div>
              <div className="col-span-1">Total</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1">Type</div>
              <div className="col-span-1">Notes</div>
              <div className="col-span-1">Actions</div>
            </div>
          </div>
          
          {/* Table Body */}
          <div className="divide-y divide-gray-200">
            {orders.map((order) => (
              <div key={order._id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="grid grid-cols-12 gap-4 items-center">
                  {/* Order Number */}
                  <div className="col-span-2">
                    <div className="font-medium text-gray-900 truncate">
                      #{order.orderNumber}
                    </div>
                  </div>
                  
                  {/* Customer */}
                  <div className="col-span-2">
                    <div className="text-sm text-gray-900 truncate">
                      {order.customerInfo?.name || 'Walk-in Customer'}
                    </div>
                  </div>
                  
                  {/* Date */}
                  <div className="col-span-1">
                    <span className="text-sm text-gray-600">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  
                  {/* Items */}
                  <div className="col-span-1">
                    <span className="text-sm text-gray-600">
                      {order.items.length}
                    </span>
                  </div>
                  
                  {/* Total */}
                  <div className="col-span-1">
                    <span className="font-semibold text-gray-900">
                      {Math.round(order.pricing.total)}
                    </span>
                  </div>
                  
                  {/* Status */}
                  <div className="col-span-2">
                    <div className="flex flex-wrap gap-1">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        order.status === 'completed' || order.status === 'delivered' 
                          ? 'bg-green-100 text-green-800'
                          : order.status === 'pending' || order.status === 'processing'
                          ? 'bg-yellow-100 text-yellow-800'
                          : order.status === 'cancelled'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {order.status}
                      </span>
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        order.payment.status === 'paid'
                          ? 'bg-green-100 text-green-800'
                          : order.payment.status === 'partial'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {order.payment.status}
                      </span>
                    </div>
                  </div>
                  
                  {/* Type */}
                  <div className="col-span-1">
                    <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                      {order.orderType}
                    </span>
                  </div>
                  
                  {/* Notes */}
                  <div className="col-span-1">
                    <span
                      className="text-xs text-gray-600 block truncate"
                      title={order.notes?.trim() || 'No notes'}
                    >
                      {order.notes?.trim() || '—'}
                    </span>
                  </div>
                  
                  {/* Actions */}
                  <div className="col-span-1">
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleView(order)}
                        className="text-primary-600 hover:text-primary-800 p-1"
                        title="View Invoice"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handlePrint(order)}
                        className="text-green-600 hover:text-green-800 p-1"
                        title="Print Invoice"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(order)}
                        className="text-blue-600 hover:text-blue-800 p-1"
                        title="Edit Invoice"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(order)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Delete Invoice"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Sales Invoice Details</h2>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handlePrint(selectedOrder)}
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
                <h1 className="text-3xl font-bold text-gray-900">{companyName}</h1>
                {companyAddress && (
                  <p className="text-sm text-gray-600">{companyAddress}</p>
                )}
                {(companyPhone || companyEmail) && (
                  <p className="text-sm text-gray-600">
                    {[companyPhone && `Phone: ${companyPhone}`, companyEmail && `Email: ${companyEmail}`]
                      .filter(Boolean)
                      .join(' | ')}
                  </p>
                )}
                <p className="text-lg text-gray-600">Sales Invoice</p>
              </div>

              {/* Invoice Details */}
              <div className="grid grid-cols-3 gap-8 mb-8">
                {/* Customer Information */}
                <div>
                  <h3 className="font-semibold text-gray-900 border-b border-gray-300 pb-2 mb-4">Bill To:</h3>
                  <div className="space-y-1">
                    <p className="font-medium">{selectedOrder.customerInfo?.name || 'Walk-in Customer'}</p>
                    <p className="text-gray-600">{selectedOrder.customerInfo?.email || ''}</p>
                    <p className="text-gray-600">{selectedOrder.customerInfo?.phone || ''}</p>
                    <p className="text-gray-600">{selectedOrder.customerInfo?.address || ''}</p>
                    {selectedOrder.customerInfo?.pendingBalance && (
                      <p className="font-medium text-gray-900 mt-2">
                        Pending Balance: {Math.round(selectedOrder.customerInfo.pendingBalance)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Invoice Information */}
                <div className="text-right">
                  <h3 className="font-semibold text-gray-900 border-b border-gray-300 pb-2 mb-4">Invoice Details:</h3>
                  <div className="space-y-1">
                    <p><span className="font-medium">Invoice #:</span> {selectedOrder.orderNumber}</p>
                    <p><span className="font-medium">Date:</span> {new Date(selectedOrder.createdAt).toLocaleDateString()}</p>
                    <p><span className="font-medium">Status:</span> {selectedOrder.status}</p>
                    <p><span className="font-medium">Type:</span> {selectedOrder.orderType}</p>
                  </div>
                </div>

                {/* Payment Information */}
                <div className="text-right">
                  <h3 className="font-semibold text-gray-900 border-b border-gray-300 pb-2 mb-4">Payment:</h3>
                  <div className="space-y-1">
                    <p><span className="font-medium">Status:</span> {selectedOrder.payment?.status}</p>
                    <p><span className="font-medium">Method:</span> {selectedOrder.payment?.method}</p>
                    <p><span className="font-medium">Amount:</span> {Math.round(selectedOrder.pricing?.total || 0)}</p>
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
                        <th className="border border-gray-300 px-4 py-2 text-right">Price</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items?.map((item, index) => (
                        <tr key={index}>
                          <td className="border border-gray-300 px-4 py-2">{item.product?.name || 'Unknown Product'}</td>
                          <td className="border border-gray-300 px-4 py-2">{item.product?.description || ''}</td>
                          <td className="border border-gray-300 px-4 py-2 text-right">{item.quantity}</td>
                          <td className="border border-gray-300 px-4 py-2 text-right">{Math.round(item.unitPrice)}</td>
                          <td className="border border-gray-300 px-4 py-2 text-right">{Math.round(item.total)}</td>
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
                        <td className="px-4 py-2 text-right">{Math.round(selectedOrder.pricing?.subtotal || 0)}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2">Tax:</td>
                        <td className="px-4 py-2 text-right">{Math.round(selectedOrder.pricing?.taxAmount || 0)}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2">Discount:</td>
                        <td className="px-4 py-2 text-right">{Math.round(selectedOrder.pricing?.discountAmount || 0)}</td>
                      </tr>
                      <tr className="border-t-2 border-gray-900">
                        <td className="px-4 py-2 font-bold">Total:</td>
                        <td className="px-4 py-2 text-right font-bold">{Math.round(selectedOrder.pricing?.total || 0)}</td>
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

      {/* Edit Modal */}
      {showEditModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Edit Sales Invoice</h2>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setCustomerSearchTerm('');
                  }}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
                >
                  Close
                </button>
              </div>

              {/* Customer Information */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Customer Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Customer Selection</label>
                    <input
                      type="text"
                      placeholder="Search customers..."
                      value={customerSearchTerm}
                      onChange={(e) => setCustomerSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {/* Customer Suggestions */}
                    {customerSearchTerm && customersData?.customers?.length > 0 && (
                      <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md bg-white shadow-lg">
                        {customersData.customers.slice(0, 5).map((customer) => (
                          <div
                            key={customer._id}
                            onClick={() => {
                              setEditFormData({...editFormData, customer: customer._id});
                              setCustomerSearchTerm(customer.displayName);
                            }}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                          >
                            <div className="font-medium">{customer.displayName}</div>
                            <div className="text-sm text-gray-600">{customer.email}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Selected Customer Display */}
                    {editFormData.customer && (
                      <div className="mt-2 p-2 bg-blue-50 rounded border">
                        <div className="text-sm font-medium text-blue-900">
                          Selected: {selectedOrder.customerInfo?.name || 'Customer'}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditFormData({...editFormData, customer: null});
                            setCustomerSearchTerm('');
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                        >
                          Clear selection
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Order Type</label>
                    <select
                      value={editFormData.orderType}
                      onChange={(e) => setEditFormData({...editFormData, orderType: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="retail">Retail</option>
                      <option value="wholesale">Wholesale</option>
                      <option value="return">Return</option>
                      <option value="exchange">Exchange</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <p className="text-gray-900">{selectedOrder.customerInfo?.email || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <p className="text-gray-900">{selectedOrder.customerInfo?.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                    <p className="text-gray-900">{selectedOrder.orderNumber}</p>
                  </div>
                </div>
              </div>

              {/* Edit Form */}
              <form onSubmit={(e) => {
                e.preventDefault();
                editMutation.mutate({
                  id: selectedOrder._id,
                  data: editFormData
                });
                setShowEditModal(false);
              }}>

                {/* Notes */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes
                  </label>
                  <textarea
                    value={editFormData.notes}
                    onChange={(e) => setEditFormData({...editFormData, notes: e.target.value})}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Add any notes or comments..."
                  />
                </div>

                {/* Items Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Items</h3>
                  
                  {/* Product Selection Bar */}
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <h4 className="text-md font-medium text-gray-900 mb-4">Add New Product</h4>
                    
                    {/* Product Search and Input Fields Row */}
                    <div className="grid grid-cols-12 gap-4 items-end">
                      {/* Product Search - 6 columns */}
                      <div className="col-span-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Product Search
                        </label>
                        <input
                          type="text"
                          placeholder="Search or type product name..."
                          value={productSearchTerm}
                          onChange={(e) => setProductSearchTerm(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {/* Product Suggestions */}
                        {productSearchTerm && productsData?.products?.length > 0 && (
                          <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md bg-white shadow-lg">
                            {productsData.products.slice(0, 5).map((product) => (
                              <div
                                key={product._id}
                                onClick={() => {
                                  setProductSearchTerm(product.name);
                                  setSelectedProduct(product);
                                }}
                                className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                              >
                                <div className="font-medium text-gray-900">{product.name}</div>
                                <div className="text-sm text-gray-600">
                                  Stock: {product.inventory?.currentStock || 0} | 
                                  Retail: {Math.round(product.pricing?.retail || 0)} | 
                                  Wholesale: {Math.round(product.pricing?.wholesale || 0)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Stock - 1 column */}
                      <div className="col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Stock
                        </label>
                        <input
                          type="text"
                          value={selectedProduct ? selectedProduct.inventory?.currentStock || 0 : '0'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-center bg-gray-50"
                          disabled
                          placeholder="0"
                        />
                      </div>
                      
                      {/* Quantity - 1 column */}
                      <div className="col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Quantity
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={selectedProduct?.inventory?.currentStock || 1}
                          value={newProductQuantity}
                          onChange={(e) => setNewProductQuantity(parseInt(e.target.value) || 1)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-center"
                          placeholder="1"
                        />
                      </div>
                      
                      {/* Rate - 2 columns */}
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Rate
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={newProductRate}
                          onChange={(e) => setNewProductRate(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-center"
                          placeholder="0"
                        />
                      </div>
                      
                      {/* Amount - 1 column */}
                      <div className="col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Amount
                        </label>
                        <input
                          type="text"
                          value={selectedProduct ? Math.round(newProductQuantity * newProductRate) : ''}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-center font-medium bg-gray-50"
                          disabled
                          placeholder=""
                        />
                      </div>
                      
                      {/* Add Button - 1 column */}
                      <div className="col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          &nbsp;
                        </label>
                        <button
                          type="button"
                          onClick={handleAddNewProduct}
                          className="w-full bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 flex items-center justify-center"
                          disabled={!selectedProduct || !newProductRate}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-300 px-4 py-2 text-left">Item</th>
                          <th className="border border-gray-300 px-4 py-2 text-right">Qty</th>
                          <th className="border border-gray-300 px-4 py-2 text-right">Unit Price</th>
                          <th className="border border-gray-300 px-4 py-2 text-right">Total</th>
                          <th className="border border-gray-300 px-4 py-2 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editFormData.items?.map((item, index) => (
                          <tr key={index}>
                            <td className="border border-gray-300 px-4 py-2">
                              {item.product?.name || 'Unknown Product'}
                            </td>
                            <td className="border border-gray-300 px-4 py-2">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => {
                                  const newItems = [...editFormData.items];
                                  newItems[index].quantity = parseInt(e.target.value) || 1;
                                  newItems[index].total = newItems[index].quantity * newItems[index].unitPrice;
                                  setEditFormData({...editFormData, items: newItems});
                                }}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-right"
                              />
                            </td>
                            <td className="border border-gray-300 px-4 py-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) => {
                                  const newItems = [...editFormData.items];
                                  newItems[index].unitPrice = parseFloat(e.target.value) || 0;
                                  newItems[index].total = newItems[index].quantity * newItems[index].unitPrice;
                                  setEditFormData({...editFormData, items: newItems});
                                }}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-right"
                              />
                            </td>
                            <td className="border border-gray-300 px-4 py-2 text-right">
                              {Math.round(item.total)}
                            </td>
                            <td className="border border-gray-300 px-4 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  const newItems = editFormData.items.filter((_, i) => i !== index);
                                  setEditFormData({...editFormData, items: newItems});
                                }}
                                className="text-red-600 hover:text-red-800"
                                title="Remove Item"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
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
                  
                  {/* Order Summary */}
                  {editFormData.items && editFormData.items.length > 0 && (
                    <div className="mt-4 flex justify-end">
                      <div className="w-80">
                        <table className="w-full">
                          <tbody>
                            <tr>
                              <td className="px-4 py-2">Subtotal:</td>
                              <td className="px-4 py-2 text-right">
                                {Math.round(editFormData.items.reduce((sum, item) => sum + item.total, 0))}
                              </td>
                            </tr>
                            <tr>
                              <td className="px-4 py-2">Tax:</td>
                              <td className="px-4 py-2 text-right">
                                {Math.round(selectedOrder.pricing?.taxAmount || 0)}
                              </td>
                            </tr>
                            <tr>
                              <td className="px-4 py-2">Discount:</td>
                              <td className="px-4 py-2 text-right">
                                {Math.round(selectedOrder.pricing?.discountAmount || 0)}
                              </td>
                            </tr>
                            <tr className="border-t-2 border-gray-900">
                              <td className="px-4 py-2 font-bold">Total:</td>
                              <td className="px-4 py-2 text-right font-bold">
                                {Math.round(editFormData.items.reduce((sum, item) => sum + item.total, 0) + (selectedOrder.pricing?.taxAmount || 0) - (selectedOrder.pricing?.discountAmount || 0))}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Form Actions */}
                <div className="flex justify-end space-x-4">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editMutation.isLoading}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {editMutation.isLoading ? 'Updating...' : 'Update Invoice'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Product Selection Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Select Product</h2>
                <button
                  onClick={() => setShowProductModal(false)}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
                >
                  Close
                </button>
              </div>

              {/* Search */}
              <div className="mb-6">
                <input
                  type="text"
                  placeholder="Search products..."
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Products List */}
              <div className="max-h-96 overflow-y-auto">
                {productsData?.products?.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {productsData.products.map((product) => (
                      <div key={product._id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900">{product.name}</h3>
                            <p className="text-sm text-gray-600">{product.description}</p>
                            <div className="mt-2 flex space-x-4 text-sm text-gray-500">
                              <span>Stock: {product.inventory?.currentStock || 0}</span>
                              <span>Retail: {Math.round(product.pricing?.retail || 0)}</span>
                              <span>Wholesale: {Math.round(product.pricing?.wholesale || 0)}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              // Add product to cart
                              const newItem = {
                                product: {
                                  _id: product._id,
                                  name: product.name,
                                  description: product.description
                                },
                                quantity: 1,
                                unitPrice: product.pricing?.retail || 0,
                                total: product.pricing?.retail || 0
                              };
                              
                              const updatedItems = [...editFormData.items, newItem];
                              setEditFormData({...editFormData, items: updatedItems});
                              setShowProductModal(false);
                              showSuccessToast('Product added to invoice');
                            }}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
                          >
                            Add to Invoice
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {productSearchTerm ? 'No products found matching your search.' : 'No products available.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
