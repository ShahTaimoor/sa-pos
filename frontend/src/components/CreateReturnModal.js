import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { X, Search, Plus, Minus, AlertCircle } from 'lucide-react';
import { returnsAPI, salesAPI, purchaseInvoicesAPI } from '../services/api';
import { handleApiError, showSuccessToast, showErrorToast } from '../utils/errorHandler';
import { LoadingSpinner } from '../components/LoadingSpinner';

const CreateReturnModal = ({ isOpen, onClose, onSuccess, defaultReturnType = 'sales' }) => {
  const isPurchaseReturn = defaultReturnType === 'purchase';
  const [formData, setFormData] = useState({
    originalOrder: '',
    returnType: 'return',
    priority: 'normal',
    refundMethod: 'original_payment',
    items: [],
    generalNotes: '',
    origin: defaultReturnType
  });

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderSearch, setOrderSearch] = useState('');
  const [showOrderSearch, setShowOrderSearch] = useState(false);

  const queryClient = useQueryClient();

  // Search for orders
  const ordersQueryKey = useMemo(() => {
    const origin = isPurchaseReturn ? 'purchase' : 'sales';
    return ['returns-orders-search', origin, orderSearch];
  }, [isPurchaseReturn, orderSearch]);

  const { data: ordersData, isLoading: ordersLoading } = useQuery(
    ordersQueryKey,
    () => {
      const params = {
        search: orderSearch,
        limit: 10
      };

      if (isPurchaseReturn) {
        return purchaseInvoicesAPI.getPurchaseInvoices(params);
      }

      return salesAPI.getOrders({ ...params, type: 'sales' });
    },
    {
      enabled: orderSearch.length > 2,
      keepPreviousData: true,
      onError: (error) => handleApiError(error, 'Order Search')
    }
  );

  // Get eligible items for selected order
  const { data: eligibleItemsData, isLoading: eligibleItemsLoading } = useQuery(
    ['eligible-items', selectedOrder?._id, defaultReturnType],
    () => returnsAPI.getEligibleItems(selectedOrder._id, { origin: defaultReturnType }),
    {
      enabled: !!selectedOrder,
      onError: (error) => {
        handleApiError(error, 'Fetch Eligible Items');
      }
    }
  );

  // Create return mutation
  const createReturnMutation = useMutation(
    (data) => returnsAPI.createReturn(data),
    {
      onSuccess: () => {
        showSuccessToast('Return request created successfully');
        queryClient.invalidateQueries(['returns']);
        onSuccess();
      },
      onError: (error) => {
        handleApiError(error, 'Create Return');
      }
    }
  );

  useEffect(() => {
    if (isOpen) {
      setFormData({
        originalOrder: '',
        returnType: 'return',
        priority: 'normal',
        refundMethod: 'original_payment',
        items: [],
        generalNotes: '',
        origin: defaultReturnType
      });
      setSelectedOrder(null);
      setOrderSearch('');
      setShowOrderSearch(false);
    }
  }, [isOpen, defaultReturnType]);

  const handleOrderSelect = (order) => {
    setSelectedOrder(order);
    setFormData(prev => ({ ...prev, originalOrder: order._id }));
    setShowOrderSearch(false);
    setOrderSearch('');
  };

  const handleAddItem = (orderItem, availableQuantity) => {
    const newItem = {
      product: orderItem.product._id,
      originalOrderItem: orderItem._id,
      quantity: 1,
      originalPrice: orderItem.price || 0,
      returnReason: 'changed_mind',
      condition: 'good',
      action: 'refund',
      returnReasonDetail: '',
      refundAmount: 0,
      restockingFee: 0
    };

    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { ...newItem, maxQuantity: availableQuantity }]
    }));
  };

  const handleRemoveItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleItemChange = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!selectedOrder) {
      showErrorToast('Please select an order');
      return;
    }

    if (formData.items.length === 0) {
      showErrorToast('Please add at least one item to return');
      return;
    }

    // Validate all items
    for (const item of formData.items) {
      if (!item.returnReason) {
        showErrorToast('Please select a return reason for all items');
        return;
      }
      if (!item.condition) {
        showErrorToast('Please select a condition for all items');
        return;
      }
      if (item.quantity < 1 || item.quantity > item.maxQuantity) {
        showErrorToast('Invalid quantity for one or more items');
        return;
      }
    }

    createReturnMutation.mutate(formData);
  };

  const orders = useMemo(() => {
    if (!ordersData?.data) return [];

    if (isPurchaseReturn) {
      return ordersData.data.purchaseInvoices || ordersData.data.invoices || ordersData.data;
    }

    return ordersData.data.orders || ordersData.data;
  }, [ordersData, isPurchaseReturn]);
  const eligibleItems = eligibleItemsData?.data?.eligibleItems || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Create Return Request</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Order Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Original Order *
            </label>
            
            {!selectedOrder ? (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={
                    isPurchaseReturn
                      ? 'Search purchase orders by order number, supplier name...'
                      : 'Search orders by order number, customer name...'
                  }
                  value={orderSearch}
                  onChange={(e) => {
                    setOrderSearch(e.target.value);
                    setShowOrderSearch(true);
                  }}
                  onFocus={() => setShowOrderSearch(true)}
                  className="input pl-10"
                />
                
                {showOrderSearch && orderSearch && (
                  <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
                    {ordersLoading ? (
                      <div className="px-4 py-2 text-gray-500">Searching...</div>
                    ) : orders.length === 0 ? (
                      <div className="px-4 py-2 text-gray-500">No orders found</div>
                    ) : (
                      orders.map((order) => {
                        const supplier = order.supplier || order.purchaseInvoice?.supplier;
                        const customer = order.customer || order.salesOrder?.customer;
                        const partyName = isPurchaseReturn
                          ? (
                              supplier?.companyName ||
                              supplier?.name ||
                              supplier?.businessName ||
                              supplier?.contactPerson?.name ||
                              'Unknown supplier'
                            )
                          : (
                              customer?.businessName ||
                              [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') ||
                              customer?.email ||
                              'Unknown customer'
                            );

                        const orderTotal = order.total ?? order.grandTotal ?? order.amount ?? 0;
                        const orderDate = order.createdAt || order.invoiceDate || order.orderDate;

                        return (
                          <button
                            key={order._id}
                            type="button"
                            onClick={() => handleOrderSelect(order)}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-sm text-gray-500">
                                {orderDate ? new Date(orderDate).toLocaleDateString() : '—'}
                              </span>
                              <span className="font-medium flex-1">
                                {partyName}
                              </span>
                              <span className="text-sm text-gray-600">
                                {order.orderNumber}
                              </span>
                              <span className="text-sm font-medium text-gray-900">
                                ${orderTotal.toFixed(2)}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-gray-50 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{selectedOrder.orderNumber}</div>
                    <div className="text-sm text-gray-500">
                        {(() => {
                        const supplier = selectedOrder.supplier || selectedOrder.purchaseInvoice?.supplier;
                        const customer = selectedOrder.customer || selectedOrder.salesOrder?.customer;
                        const partyName = isPurchaseReturn
                          ? (
                              supplier?.companyName ||
                              supplier?.name ||
                              supplier?.businessName ||
                              supplier?.contactPerson?.name ||
                              'Unknown supplier'
                            )
                          : (
                              customer?.businessName ||
                              [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') ||
                              customer?.email ||
                              'Unknown customer'
                            );
                          const orderTotal = selectedOrder.total ?? selectedOrder.grandTotal ?? selectedOrder.amount ?? 0;
                          const orderDate = selectedOrder.createdAt || selectedOrder.invoiceDate || selectedOrder.orderDate;
                          return `${partyName} • $${orderTotal.toFixed(2)} • ${orderDate ? new Date(orderDate).toLocaleDateString() : '—'}`;
                        })()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOrder(null);
                      setFormData(prev => ({ ...prev, originalOrder: '' }));
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {selectedOrder && (
            <>
              {/* Return Type and Priority */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Return Type *
                  </label>
                  <select
                    value={formData.returnType}
                    onChange={(e) => setFormData(prev => ({ ...prev, returnType: e.target.value }))}
                    className="input"
                    required
                  >
                    <option value="return">Return</option>
                    <option value="exchange">Exchange</option>
                    <option value="warranty">Warranty</option>
                    <option value="recall">Recall</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                    className="input"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Eligible Items */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Items to Return *
                </label>
                
                {eligibleItemsLoading ? (
                  <LoadingSpinner message="Loading eligible items..." />
                ) : eligibleItems.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg">
                    <AlertCircle className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                    <p>No items are eligible for return from this order</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Available Items */}
                    <div className="border rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3">Available Items</h4>
                      <div className="space-y-2">
                        {eligibleItems.map((item, index) => (
                          <div key={item.orderItem._id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex-1">
                              <div className="font-medium">{item.orderItem.product.name}</div>
                              <div className="text-sm text-gray-500">
                                Available: {item.availableQuantity} • 
                                Price: ${item.orderItem.price?.toFixed(2)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddItem(item.orderItem, item.availableQuantity)}
                              className="btn btn-primary btn-sm"
                              disabled={formData.items.some(i => i.originalOrderItem === item.orderItem._id)}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Selected Items */}
                    {formData.items.length > 0 && (
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3">Selected Items</h4>
                        <div className="space-y-4">
                          {formData.items.map((item, index) => (
                            <div key={index} className="p-3 bg-gray-50 rounded border">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <div className="font-medium">
                                    {eligibleItems.find(ei => ei.orderItem._id === item.originalOrderItem)?.orderItem.product.name}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    Max quantity: {item.maxQuantity}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(index)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Quantity *
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    max={item.maxQuantity}
                                    value={item.quantity}
                                    onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)}
                                    className="input"
                                    required
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Return Reason *
                                  </label>
                                  <select
                                    value={item.returnReason}
                                    onChange={(e) => handleItemChange(index, 'returnReason', e.target.value)}
                                    className="input"
                                    required
                                  >
                                    <option value="">Select reason</option>
                                    <option value="defective">Defective</option>
                                    <option value="wrong_item">Wrong Item</option>
                                    <option value="not_as_described">Not as Described</option>
                                    <option value="damaged_shipping">Damaged in Shipping</option>
                                    <option value="changed_mind">Changed Mind</option>
                                    <option value="duplicate_order">Duplicate Order</option>
                                    <option value="size_issue">Size Issue</option>
                                    <option value="quality_issue">Quality Issue</option>
                                    <option value="late_delivery">Late Delivery</option>
                                    <option value="other">Other</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Condition *
                                  </label>
                                  <select
                                    value={item.condition}
                                    onChange={(e) => handleItemChange(index, 'condition', e.target.value)}
                                    className="input"
                                    required
                                  >
                                    <option value="">Select condition</option>
                                    <option value="new">New</option>
                                    <option value="like_new">Like New</option>
                                    <option value="good">Good</option>
                                    <option value="fair">Fair</option>
                                    <option value="poor">Poor</option>
                                    <option value="damaged">Damaged</option>
                                  </select>
                                </div>
                              </div>

                              <div className="mt-3">
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Return Reason Details
                                </label>
                                <textarea
                                  value={item.returnReasonDetail}
                                  onChange={(e) => handleItemChange(index, 'returnReasonDetail', e.target.value)}
                                  placeholder="Additional details about the return reason..."
                                  className="input"
                                  rows={2}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Refund Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Refund Method
                </label>
                <select
                  value={formData.refundMethod}
                  onChange={(e) => setFormData(prev => ({ ...prev, refundMethod: e.target.value }))}
                  className="input"
                >
                  <option value="original_payment">Original Payment Method</option>
                  <option value="store_credit">Store Credit</option>
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.generalNotes}
                  onChange={(e) => setFormData(prev => ({ ...prev, generalNotes: e.target.value }))}
                  placeholder="Additional notes about this return request..."
                  className="input"
                  rows={3}
                />
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createReturnMutation.isLoading || !selectedOrder || formData.items.length === 0}
              className="btn btn-primary"
            >
              {createReturnMutation.isLoading ? (
                <LoadingSpinner size="sm" />
              ) : (
                'Create Return Request'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateReturnModal;
