import axios from 'axios';
import { sanitizeRequestData, sanitizeResponseData } from '../utils/sanitization';

// API Configuration with fallback options
const getApiBaseUrl = () => {
  const envUrl = process.env.REACT_APP_API_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.endsWith('/') ? envUrl : `${envUrl}/`;
  }

  // Use relative /api in browser environments (window is defined)
  if (typeof window !== 'undefined') {
    return '/api/';
  }

  // Fall back to localhost when running in Node (e.g. tests/scripts)
  return 'http://localhost:5000/api/';
};

const API_BASE_URL = getApiBaseUrl();

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token and sanitize data
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Ensure relative URLs combine with baseURL
    if (config.url && config.url.startsWith('/')) {
      config.url = config.url.substring(1);
    }
  
    // Sanitize request data for security
    if (config.data) {
      config.data = sanitizeRequestData(config.data);
    }
    
    if (config.params) {
      config.params = sanitizeRequestData(config.params);
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors and sanitize responses
api.interceptors.response.use(
  (response) => {
    // Skip sanitization for blob responses (files, PDFs, images, etc.)
    // Blobs should not be sanitized as they are binary data
    if (response.data && !(response.data instanceof Blob) && !(response.data instanceof ArrayBuffer)) {
      // Sanitize response data with lighter sanitization
      response.data = sanitizeResponseData(response.data);
    }
    return response;
  },
  (error) => {
    // Handle authentication errors
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return Promise.reject(error);
    }
    
    // Handle network errors
    if (!error.response) {
      console.error('Network Error:', error.message);
      console.error('Request URL:', error.config?.url);
      console.error('Request Base URL:', error.config?.baseURL);
      console.error('Full Request Config:', error.config);
      
      return Promise.reject({
        ...error,
        message: `Unable to connect to server at ${error.config?.baseURL || API_BASE_URL}. Please ensure the backend server is running.`,
        type: 'network',
        url: error.config?.url,
        baseURL: error.config?.baseURL || API_BASE_URL
      });
    }
    
    // Handle server errors
    if (error.response?.status >= 500) {
      console.error('Server Error:', error.response.data);
      return Promise.reject({
        ...error,
        message: 'Server error. Please try again later.',
        type: 'server'
      });
    }
    
    // Handle validation errors
    if (error.response?.status === 400) {
      const errorData = error.response.data;
      let message = errorData?.message || 'Invalid request. Please check your input.';
      
      // If there are specific validation errors, include them in the message
      if (errorData?.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
        const errorMessages = errorData.errors.map(err => 
          `${err.field || err.param || 'Field'}: ${err.message || err.msg}`
        ).join('; ');
        message = `${message} ${errorMessages}`;
      }
      
      return Promise.reject({
        ...error,
        message,
        type: 'validation',
        validationErrors: errorData?.errors || []
      });
    }
    
    // Handle not found errors
    if (error.response?.status === 404) {
      return Promise.reject({
        ...error,
        message: 'The requested resource was not found.',
        type: 'not_found'
      });
    }
    
    // Handle forbidden errors
    if (error.response?.status === 403) {
      return Promise.reject({
        ...error,
        message: 'You do not have permission to perform this action.',
        type: 'forbidden'
      });
    }
    
    return Promise.reject(error);
  }
);

// Connection test function
export const testConnection = async () => {
  try {
    console.log('🔍 Testing connection to:', API_BASE_URL);
    const response = await axios.get(`${API_BASE_URL.replace('/api', '')}/health`, {
      timeout: 5000
    });
    console.log('✅ Backend connection successful:', response.status);
    return { success: true, status: response.status };
  } catch (error) {
    console.error('❌ Backend connection failed:', error.message);
    console.error('Full error:', error);
    return { 
      success: false, 
      error: error.message,
      url: API_BASE_URL
    };
  }
};

// Auth API
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  getCurrentUser: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (currentPassword, newPassword) => 
    api.post('/auth/change-password', { currentPassword, newPassword }),
};

// Users API
export const usersAPI = {
  getUsers: (params) => api.get('/auth/users', { params }),
  getUser: (id) => api.get(`/auth/users/${id}`),
  createUser: (data) => api.post('/auth/register', data),
  updateUser: (id, data) => api.put(`/auth/users/${id}`, data),
  deleteUser: (id) => api.delete(`/auth/users/${id}`),
  toggleUserStatus: (id) => api.patch(`/auth/users/${id}/toggle-status`),
  resetPassword: (id, newPassword) => api.patch(`/auth/users/${id}/reset-password`, { newPassword }),
  updateRolePermissions: (role, permissions) => api.patch('/auth/users/update-role-permissions', { role, permissions }),
  getUserActivity: (id) => api.get(`/auth/users/${id}/activity`),
};

// Products API
export const productsAPI = {
  getProducts: (params) => api.get('/products', { params }),
  getProduct: (id) => api.get(`/products/${id}`),
  createProduct: (data) => api.post('/products', data),
  updateProduct: (id, data) => api.put(`/products/${id}`, data),
  deleteProduct: (id) => api.delete(`/products/${id}`),
  searchProducts: (query) => api.get(`/products/search/${query}`),
  getLowStockProducts: () => api.get('/products/low-stock'),
  checkPrice: (id, customerType, quantity) => 
    api.post(`/products/${id}/price-check`, { customerType, quantity }),
  getLastPurchasePrice: (id) => api.get(`/products/${id}/last-purchase-price`),
  bulkUpdateProducts: (productIds, updates) => 
    api.put('/products/bulk', { productIds, updates }),
  bulkDeleteProducts: (productIds) => 
    api.delete('/products/bulk', { data: { productIds } }),
  getLastPurchasePrices: (productIds) => api.post('/products/get-last-purchase-prices', { productIds }),
  
  // Investor linking functions
  linkInvestors: (productId, investors) => api.post(`/products/${productId}/investors`, { investors }),
  unlinkInvestor: (productId, investorId) => api.delete(`/products/${productId}/investors/${investorId}`),
  
  // Import/Export functions
  exportCSV: (filters = {}) => api.post('/products/export/csv', { filters }),
  exportExcel: (filters = {}) => api.post('/products/export/excel', { filters }),
  importCSV: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/products/import/csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  importExcel: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/products/import/excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  downloadTemplate: () => api.get('/products/template/csv'),
  downloadFile: (filename) => api.get(`/products/download/${filename}`, {
    responseType: 'blob'
  }),
};

// Customers API
export const customersAPI = {
  getCustomers: (params) => api.get('/customers', { params }),
  getCustomer: (id) => api.get(`/customers/${id}`),
  createCustomer: (data) => api.post('/customers', data),
  updateCustomer: (id, data) => api.put(`/customers/${id}`, data),
  deleteCustomer: (id) => api.delete(`/customers/${id}`),
  searchCustomers: (query) => api.get(`/customers/search/${query}`),
  checkEmail: (email, excludeId) => {
    const url = `/customers/check-email/${encodeURIComponent(email)}`;
    const params = excludeId ? { excludeId } : {};
    return api.get(url, { params });
  },
  checkBusinessName: (businessName, excludeId) => {
    const url = `/customers/check-business-name/${encodeURIComponent(businessName)}`;
    const params = excludeId ? { excludeId } : {};
    return api.get(url, { params });
  },
  addAddress: (id, data) => api.post(`/customers/${id}/address`, data),
  updateCreditLimit: (id, creditLimit) => 
    api.put(`/customers/${id}/credit-limit`, { creditLimit }),
  
  // Import/Export functions
  exportExcel: (filters = {}) => api.post('/customers/export/excel', { filters }),
  importExcel: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/customers/import/excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  downloadTemplate: () => api.get('/customers/template/excel', { responseType: 'blob' }),
  downloadFile: (filename) => api.get(`/customers/download/${filename}`, {
    responseType: 'blob'
  }),
  getCities: () => api.get('/customers/cities'),
  getCustomersByCities: (params) => api.get('/customers/by-cities', { params }),
};

// Cities API
export const citiesAPI = {
  getCities: (params) => api.get('/cities', { params }),
  getActiveCities: () => api.get('/cities/active'),
  getCity: (id) => api.get(`/cities/${id}`),
  createCity: (data) => api.post('/cities', data),
  updateCity: (id, data) => api.put(`/cities/${id}`, data),
  deleteCity: (id) => api.delete(`/cities/${id}`),
};

// Suppliers API
export const suppliersAPI = {
  getSuppliers: (params) => api.get('/suppliers', { params }),
  getSupplier: (id) => api.get(`/suppliers/${id}`),
  createSupplier: (data) => api.post('/suppliers', data),
  updateSupplier: (id, data) => api.put(`/suppliers/${id}`, data),
  deleteSupplier: (id) => api.delete(`/suppliers/${id}`),
  searchSuppliers: (query) => api.get(`/suppliers/search/${query}`),
  getActiveSuppliers: () => api.get('/suppliers/active/list'),
  
  // Import/Export functions
  exportExcel: (filters = {}) => api.post('/suppliers/export/excel', { filters }),
  importExcel: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/suppliers/import/excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  downloadTemplate: () => api.get('/suppliers/template/excel', { responseType: 'blob' }),
  downloadFile: (filename) => api.get(`/suppliers/download/${filename}`, {
    responseType: 'blob'
  }),
};

// Purchase Orders API
export const purchaseOrdersAPI = {
  getPurchaseOrders: (params) => api.get('/purchase-orders', { params }),
  getPurchaseOrder: (id) => api.get(`/purchase-orders/${id}`),
  createPurchaseOrder: (data) => api.post('/purchase-orders', data),
  updatePurchaseOrder: (id, data) => api.put(`/purchase-orders/${id}`, data),
  deletePurchaseOrder: (id) => api.delete(`/purchase-orders/${id}`),
  confirmPurchaseOrder: (id) => api.put(`/purchase-orders/${id}/confirm`),
  cancelPurchaseOrder: (id) => api.put(`/purchase-orders/${id}/cancel`),
  closePurchaseOrder: (id) => api.put(`/purchase-orders/${id}/close`),
  getConversionData: (id) => api.get(`/purchase-orders/${id}/convert`),
  convertToPurchase: (id, data) => api.post(`/purchase-orders/${id}/convert`, data),
};

// Sales Orders API
export const salesOrdersAPI = {
  getSalesOrders: (params) => api.get('/sales-orders', { params }),
  getSalesOrder: (id) => api.get(`/sales-orders/${id}`),
  createSalesOrder: (data) => api.post('/sales-orders', data),
  updateSalesOrder: (id, data) => api.put(`/sales-orders/${id}`, data),
  deleteSalesOrder: (id) => api.delete(`/sales-orders/${id}`),
  confirmSalesOrder: (id) => api.put(`/sales-orders/${id}/confirm`),
  cancelSalesOrder: (id) => api.put(`/sales-orders/${id}/cancel`),
  closeSalesOrder: (id) => api.put(`/sales-orders/${id}/close`),
  getConversionData: (id) => api.get(`/sales-orders/${id}/convert`),
  exportExcel: (filters) => api.post('/sales-orders/export/excel', { filters }),
  exportCSV: (filters) => api.post('/sales-orders/export/csv', { filters }),
  exportPDF: (filters) => api.post('/sales-orders/export/pdf', { filters }),
  exportJSON: (filters) => api.post('/sales-orders/export/json', { filters }),
  downloadFile: (filename) => api.get(`/sales-orders/download/${filename}`, { responseType: 'blob' }),
};

// Sales API (formerly Orders API)
export const salesAPI = {
  getOrders: (params) => api.get('/sales', { params }),
  getOrder: (id) => api.get(`/sales/${id}`),
  createOrder: (data) => api.post('/sales', data),
  updateOrder: (id, data) => api.put(`/sales/${id}`, data),
  updateOrderStatus: (id, status) => api.put(`/sales/${id}/status`, { status }),
  processPayment: (id, data) => api.post(`/sales/${id}/payment`, data),
  deleteOrder: (id) => api.delete(`/sales/${id}`),
  getTodaySummary: () => api.get('/sales/today/summary'),
  getPeriodSummary: (params) => api.get('/sales/period/summary', { params }),
  getLastPrices: (customerId) => api.get(`/sales/customer/${customerId}/last-prices`),
  exportExcel: (filters) => api.post('/sales/export/excel', { filters }),
  exportCSV: (filters) => api.post('/sales/export/csv', { filters }),
  exportPDF: (filters) => api.post('/sales/export/pdf', { filters }),
  exportJSON: (filters) => api.post('/sales/export/json', { filters }),
  downloadFile: (filename) => api.get(`/sales/download/${filename}`, { responseType: 'blob' }),
};

// Keep ordersAPI as alias for backward compatibility (deprecated - use salesAPI)
export const ordersAPI = salesAPI;

export const purchaseInvoicesAPI = {
  getPurchaseInvoices: (params) => api.get('/purchase-invoices', { params }),
  getPurchaseInvoice: (id) => api.get(`/purchase-invoices/${id}`),
  createPurchaseInvoice: (data) => api.post('/purchase-invoices', data),
  updatePurchaseInvoice: (id, data) => api.put(`/purchase-invoices/${id}`, data),
  deletePurchaseInvoice: (id) => api.delete(`/purchase-invoices/${id}`),
  confirmPurchaseInvoice: (id) => api.put(`/purchase-invoices/${id}/confirm`),
  cancelPurchaseInvoice: (id) => api.put(`/purchase-invoices/${id}/cancel`),
  exportExcel: (filters) => api.post('/purchase-invoices/export/excel', { filters }),
  exportCSV: (filters) => api.post('/purchase-invoices/export/csv', { filters }),
  exportPDF: (filters) => api.post('/purchase-invoices/export/pdf', { filters }),
  exportJSON: (filters) => api.post('/purchase-invoices/export/json', { filters }),
  downloadFile: (filename) => api.get(`/purchase-invoices/download/${filename}`, { responseType: 'blob' }),
};

// Notes API
export const notesAPI = {
  getNotes: (params) => api.get('/notes', { params }),
  getNote: (id) => api.get(`/notes/${id}`),
  createNote: (data) => api.post('/notes', data),
  updateNote: (id, data) => api.put(`/notes/${id}`, data),
  deleteNote: (id) => api.delete(`/notes/${id}`),
  getNoteHistory: (id) => api.get(`/notes/${id}/history`),
  searchUsers: (query) => api.get('/notes/search/users', { params: { q: query } })
};

// Reports API
export const reportsAPI = {
  getSalesReport: (params) => api.get('/reports/sales', { params }),
  getProductReport: (params) => api.get('/reports/products', { params }),
  getCustomerReport: (params) => api.get('/reports/customers', { params }),
  getInventoryReport: (params) => api.get('/reports/inventory', { params }),
};

// Payment API
export const paymentAPI = {
  processPayment: (paymentData) => api.post('/payments/process', paymentData),
  processRefund: (paymentId, refundData) => api.post(`/payments/${paymentId}/refund`, refundData),
  voidTransaction: (transactionId, reason) => api.post(`/payments/transactions/${transactionId}/void`, { reason }),
  getPaymentHistory: (filters = {}) => api.get('/payments', { params: filters }),
  getPaymentDetails: (paymentId) => api.get(`/payments/${paymentId}`),
  getPaymentStats: (startDate, endDate) => api.get('/payments/stats', { params: { startDate, endDate } }),
  getPaymentMethods: () => api.get('/payments/methods'),
};

// Inventory API
export const inventoryAPI = {
  getInventory: (filters = {}) => {
    console.log('Getting inventory with filters:', filters);
    return api.get('/inventory', { params: filters })
      .catch(error => {
        console.error('Inventory API error:', error.response?.data || error.message);
        throw error;
      });
  },
  getInventorySummary: () => api.get('/inventory/summary'),
  getLowStockItems: () => api.get('/inventory/low-stock'),
  getInventoryDetails: (productId) => api.get(`/inventory/${productId}`),
  getInventoryHistory: (productId, filters = {}) => api.get(`/inventory/${productId}/history`, { params: filters }),
  updateStock: (stockData) => api.post('/inventory/update-stock', stockData),
  bulkUpdateStock: (updates) => api.post('/inventory/bulk-update', { updates }),
  bulkAdjustment: (adjustmentData) => {
    // Convert adjustment data to bulk update format
    const updates = adjustmentData.adjustments.map(adj => ({
      productId: adj.productId,
      quantity: adj.quantity,
      type: adj.operation === 'add' ? 'in' : 'out', // Convert operation to type
      reason: adjustmentData.reason
    }));
    
    console.log('Bulk adjustment data being sent:', { updates });
    return api.post('/inventory/bulk-update', { updates });
  },
  reserveStock: (productId, quantity) => api.post('/inventory/reserve-stock', { productId, quantity }),
  releaseStock: (productId, quantity) => api.post('/inventory/release-stock', { productId, quantity }),
  createStockAdjustment: (adjustmentData) => api.post('/inventory/adjustments', adjustmentData),
  getStockAdjustments: (filters = {}) => api.get('/inventory/adjustments', { params: filters }),
  approveStockAdjustment: (adjustmentId) => api.put(`/inventory/adjustments/${adjustmentId}/approve`),
  completeStockAdjustment: (adjustmentId) => api.put(`/inventory/adjustments/${adjustmentId}/complete`),
};

// Warehouses API
export const warehousesAPI = {
  getWarehouses: (params = {}) => api.get('/warehouses', { params }),
  getWarehouse: (id) => api.get(`/warehouses/${id}`),
  createWarehouse: (data) => api.post('/warehouses', data),
  updateWarehouse: (id, data) => api.put(`/warehouses/${id}`, data),
  deleteWarehouse: (id) => api.delete(`/warehouses/${id}`),
};

// Recommendations API
export const recommendationsAPI = {
  generateRecommendations: (data) => api.post('/recommendations/generate', data),
  getRecommendation: (recommendationId) => api.get(`/recommendations/${recommendationId}`),
  trackInteraction: (recommendationId, data) => api.post(`/recommendations/${recommendationId}/interact`, data),
  getTrendingProducts: (filters = {}) => api.get('/recommendations/trending', { params: filters }),
  getFrequentlyBoughtTogether: (productId, limit = 10) => api.get(`/recommendations/frequently-bought/${productId}`, { params: { limit } }),
  getSimilarProducts: (productId, limit = 10) => api.get(`/recommendations/similar/${productId}`, { params: { limit } }),
  trackBehavior: (behaviorData) => api.post('/recommendations/behavior', behaviorData),
  getPerformanceMetrics: (filters = {}) => api.get('/recommendations/performance', { params: filters }),
  getUserRecommendations: (userId, limit = 10) => api.get(`/recommendations/user/${userId}`, { params: { limit } }),
};

// Backups API
export const backupsAPI = {
  createBackup: (data) => api.post('/backups/create', data),
  getBackups: (filters = {}) => api.get('/backups', { params: filters }),
  getBackupStats: (days = 30) => api.get('/backups/stats', { params: { days } }),
  getBackup: (backupId) => api.get(`/backups/${backupId}`),
  restoreBackup: (backupId, data) => api.post(`/backups/${backupId}/restore`, data),
  deleteBackup: (backupId, data) => api.delete(`/backups/${backupId}`, { data }),
  verifyBackup: (backupId) => api.post(`/backups/${backupId}/verify`),
  retryBackup: (backupId) => api.post(`/backups/${backupId}/retry`),
  getSchedulerStatus: () => api.get('/backups/scheduler/status'),
  startScheduler: () => api.post('/backups/scheduler/start'),
  stopScheduler: () => api.post('/backups/scheduler/stop'),
  triggerBackup: (data) => api.post('/backups/scheduler/trigger', data),
  runCleanup: () => api.post('/backups/cleanup'),
};

// P&L Statements API
export const plStatementsAPI = {
  generateStatement: (data) => api.post('/pl-statements/generate', data),
  getStatements: (filters = {}) => api.get('/pl-statements', { params: filters }),
  getStatement: (statementId) => api.get(`/pl-statements/${statementId}`),
  updateStatement: (statementId, data) => api.put(`/pl-statements/${statementId}`, data),
  updateStatementStatus: (statementId, data) => api.put(`/pl-statements/${statementId}/status`, data),
  deleteStatement: (statementId) => api.delete(`/pl-statements/${statementId}`),
  getSummary: (startDate, endDate) => api.get('/pl-statements/summary', { params: { startDate, endDate } }),
  getTrends: (periods, periodType = 'monthly') => api.get('/pl-statements/trends', { params: { periods, periodType } }),
  getComparison: (statementId, type = 'previous') => api.get(`/pl-statements/${statementId}/comparison`, { params: { type } }),
  exportStatement: (statementId, data) => api.post(`/pl-statements/${statementId}/export`, data),
  getLatestStatement: (periodType = 'monthly') => api.get('/pl-statements/latest', { params: { periodType } }),
};

// Returns API
export const returnsAPI = {
  createReturn: (data) => api.post('/returns', data),
  getReturns: (filters = {}) => api.get('/returns', { params: filters }),
  getReturn: (returnId) => api.get(`/returns/${returnId}`),
  updateReturnStatus: (returnId, data) => api.put(`/returns/${returnId}/status`, data),
  updateInspection: (returnId, data) => api.put(`/returns/${returnId}/inspection`, data),
  addNote: (returnId, data) => api.post(`/returns/${returnId}/notes`, data),
  addCommunication: (returnId, data) => api.post(`/returns/${returnId}/communication`, data),
  getReturnStats: (filters = {}) => api.get('/returns/stats', { params: filters }),
  getReturnTrends: (periods = 12) => api.get('/returns/trends', { params: { periods } }),
  getEligibleItems: (orderId) => api.get(`/returns/order/${orderId}/eligible-items`),
  deleteReturn: (returnId) => api.delete(`/returns/${returnId}`),
};

// Balance Sheets API
export const balanceSheetsAPI = {
  generateBalanceSheet: (data) => api.post('/balance-sheets/generate', data),
  getBalanceSheets: (filters = {}) => api.get('/balance-sheets', { params: filters }),
  getBalanceSheet: (balanceSheetId) => api.get(`/balance-sheets/${balanceSheetId}`),
  updateBalanceSheetStatus: (balanceSheetId, data) => api.put(`/balance-sheets/${balanceSheetId}/status`, data),
  updateBalanceSheet: (balanceSheetId, data) => api.put(`/balance-sheets/${balanceSheetId}`, data),
  deleteBalanceSheet: (balanceSheetId) => api.delete(`/balance-sheets/${balanceSheetId}`),
  getComparison: (balanceSheetId, type = 'previous') => api.get(`/balance-sheets/${balanceSheetId}/comparison`, { params: { type } }),
  getBalanceSheetStats: (filters = {}) => api.get('/balance-sheets/stats', { params: filters }),
  getLatestBalanceSheet: (periodType = 'monthly') => api.get('/balance-sheets/latest', { params: { periodType } }),
  addAuditEntry: (balanceSheetId, data) => api.post(`/balance-sheets/${balanceSheetId}/audit`, data),
};

// Settings API
export const settingsAPI = {
  getCompanySettings: () => api.get('/settings/company'),
  updateCompanySettings: (data) => api.put('/settings/company', data),
  getUserPreferences: () => api.get('/settings/preferences'),
  updateUserPreferences: (data) => api.put('/settings/preferences', data),
};

// Discounts API
export const discountsAPI = {
  createDiscount: (data) => api.post('/discounts', data),
  getDiscounts: (filters = {}) => api.get('/discounts', { params: filters }),
  getDiscount: (discountId) => api.get(`/discounts/${discountId}`),
  updateDiscount: (discountId, data) => api.put(`/discounts/${discountId}`, data),
  deleteDiscount: (discountId) => api.delete(`/discounts/${discountId}`),
  toggleDiscountStatus: (discountId) => api.put(`/discounts/${discountId}/toggle-status`),
  applyDiscount: (data) => api.post('/discounts/apply', data),
  removeDiscount: (data) => api.post('/discounts/remove', data),
  checkApplicableDiscounts: (orderData, customerData) => api.post('/discounts/check-applicable', { orderData, customerData }),
  getDiscountByCode: (code) => api.get(`/discounts/code/${code}`),
  checkCodeAvailability: (code) => api.get(`/discounts/code/${code}/availability`),
  generateCodeSuggestions: (name, type) => api.post('/discounts/generate-code-suggestions', { name, type }),
  getDiscountStats: (filters = {}) => api.get('/discounts/stats', { params: filters }),
  getActiveDiscounts: () => api.get('/discounts/active'),
};

// Categories API
export const categoriesAPI = {
  getCategories: (filters = {}) => api.get('/categories', { params: filters }),
  getCategoryTree: () => api.get('/categories/tree'),
  getCategory: (categoryId) => api.get(`/categories/${categoryId}`),
  createCategory: (data) => api.post('/categories', data),
  updateCategory: (categoryId, data) => api.put(`/categories/${categoryId}`, data),
  deleteCategory: (categoryId) => api.delete(`/categories/${categoryId}`),
  getCategoryStats: () => api.get('/categories/stats'),
};

// Sales Performance API
export const salesPerformanceAPI = {
  generateReport: (config) => api.post('/sales-performance/generate', config),
  getReports: (filters = {}) => api.get('/sales-performance', { params: filters }),
  getReport: (reportId) => api.get(`/sales-performance/${reportId}`),
  deleteReport: (reportId) => api.delete(`/sales-performance/${reportId}`),
  toggleFavorite: (reportId, isFavorite) => api.put(`/sales-performance/${reportId}/favorite`, { isFavorite }),
  updateTags: (reportId, tags) => api.put(`/sales-performance/${reportId}/tags`, { tags }),
  updateNotes: (reportId, notes) => api.put(`/sales-performance/${reportId}/notes`, { notes }),
  exportReport: (reportId, format) => api.post(`/sales-performance/${reportId}/export`, { format }),
  getReportStats: (filters = {}) => api.get('/sales-performance/stats/overview', { params: filters }),
  getQuickTopProducts: (options = {}) => api.get('/sales-performance/quick/top-products', { params: options }),
  getQuickTopCustomers: (options = {}) => api.get('/sales-performance/quick/top-customers', { params: options }),
  getQuickTopSalesReps: (options = {}) => api.get('/sales-performance/quick/top-sales-reps', { params: options }),
  getQuickSummary: (options = {}) => api.get('/sales-performance/quick/summary', { params: options }),
};

// Inventory Reports API
export const inventoryReportsAPI = {
  generateReport: (config) => api.post('/inventory-reports/generate', config),
  getReports: (filters = {}) => api.get('/inventory-reports', { params: filters }),
  getReport: (reportId) => api.get(`/inventory-reports/${reportId}`),
  deleteReport: (reportId) => api.delete(`/inventory-reports/${reportId}`),
  toggleFavorite: (reportId, isFavorite) => api.put(`/inventory-reports/${reportId}/favorite`, { isFavorite }),
  exportReport: (reportId, format) => api.post(`/inventory-reports/${reportId}/export`, { format }),
  getQuickSummary: () => api.get('/inventory-reports/quick/summary'),
  getQuickStockLevels: (params) => api.get('/inventory-reports/quick/stock-levels', { params }),
  getQuickTurnoverRates: (params) => api.get('/inventory-reports/quick/turnover-rates', { params }),
  getQuickAgingAnalysis: (params) => api.get('/inventory-reports/quick/aging-analysis', { params }),
  getStats: (params) => api.get('/inventory-reports/stats', { params })
};

// Chart of Accounts API
export const chartOfAccountsAPI = {
  getAccounts: async (params) => {
    const response = await api.get('/chart-of-accounts', { params });
    return response.data;
  },
  getAccount: async (id) => {
    const response = await api.get(`/chart-of-accounts/${id}`);
    return response.data;
  },
  getAccountHierarchy: async () => {
    const response = await api.get('/chart-of-accounts/hierarchy');
    return response.data;
  },
  createAccount: async (data) => {
    const response = await api.post('/chart-of-accounts', data);
    return response.data;
  },
  updateAccount: async (id, data) => {
    const response = await api.put(`/chart-of-accounts/${id}`, data);
    return response.data;
  },
  deleteAccount: async (id) => {
    const response = await api.delete(`/chart-of-accounts/${id}`);
    return response.data;
  },
  getAccountStats: async () => {
    const response = await api.get('/chart-of-accounts/stats/summary');
    return response.data;
  },
};

// Account Categories API
export const accountCategoriesAPI = {
  getCategories: async (params) => {
    const response = await api.get('/account-categories', { params });
    return response.data;
  },
  getCategory: async (id) => {
    const response = await api.get(`/account-categories/${id}`);
    return response.data;
  },
  getCategoriesByType: async (accountType) => {
    const response = await api.get(`/account-categories?accountType=${accountType}`);
    return response.data;
  },
  getCategoriesGrouped: async () => {
    const response = await api.get('/account-categories?grouped=true');
    return response.data;
  },
  createCategory: async (data) => {
    const response = await api.post('/account-categories', data);
    return response.data;
  },
  updateCategory: async (id, data) => {
    const response = await api.put(`/account-categories/${id}`, data);
    return response.data;
  },
  deleteCategory: async (id) => {
    const response = await api.delete(`/account-categories/${id}`);
    return response.data;
  },
};

// Inventory Alerts API
export const inventoryAlertsAPI = {
  getLowStockAlerts: (params) => api.get('/inventory-alerts', { params }),
  getAlertSummary: () => api.get('/inventory-alerts/summary'),
  getProductsNeedingReorder: () => api.get('/inventory-alerts/products-needing-reorder'),
  generatePurchaseOrders: (params) => api.post('/inventory-alerts/generate-purchase-orders', {}, { params }),
};

// Customer Analytics API
export const customerAnalyticsAPI = {
  getAnalytics: (params) => api.get('/customer-analytics', { params }),
  getSummary: () => api.get('/customer-analytics/summary'),
  getCustomerAnalytics: (customerId) => api.get(`/customer-analytics/${customerId}`),
  getSegment: (segment, params) => api.get(`/customer-analytics/segments/${segment}`, { params }),
  getChurnRisk: (level) => api.get(`/customer-analytics/churn-risk/${level}`),
};

// Anomaly Detection API
export const anomalyDetectionAPI = {
  getAnomalies: (params) => api.get('/anomaly-detection', { params }),
  getSalesAnomalies: (params) => api.get('/anomaly-detection/sales', { params }),
  getInventoryAnomalies: () => api.get('/anomaly-detection/inventory'),
  getPaymentAnomalies: (params) => api.get('/anomaly-detection/payments', { params }),
  getSummary: () => api.get('/anomaly-detection/summary'),
};

// Product Variants API
export const productVariantsAPI = {
  getVariants: (params) => api.get('/product-variants', { params }),
  getVariant: (id) => api.get(`/product-variants/${id}`),
  createVariant: (data) => api.post('/product-variants', data),
  updateVariant: (id, data) => api.put(`/product-variants/${id}`, data),
  deleteVariant: (id) => api.delete(`/product-variants/${id}`),
  getVariantsByBaseProduct: (productId) => api.get(`/product-variants/base-product/${productId}`),
};

// Product Transformations API
export const productTransformationsAPI = {
  getTransformations: (params) => api.get('/product-transformations', { params }),
  getTransformation: (id) => api.get(`/product-transformations/${id}`),
  createTransformation: (data) => api.post('/product-transformations', data),
  cancelTransformation: (id) => api.put(`/product-transformations/${id}/cancel`),
};

// Cash Receipts API
export const cashReceiptsAPI = {
  getCashReceipts: (params) => api.get('/cash-receipts', { params }),
  getCashReceipt: (id) => api.get(`/cash-receipts/${id}`),
  createCashReceipt: (data) => api.post('/cash-receipts', data),
  updateCashReceipt: (id, data) => api.put(`/cash-receipts/${id}`, data),
  deleteCashReceipt: (id) => api.delete(`/cash-receipts/${id}`),
  getCashReceiptStats: (params) => api.get('/cash-receipts/stats', { params }),
  createBatchCashReceipts: (data) => api.post('/cash-receipts/batch', data),
};

// Cash Payments API
export const cashPaymentsAPI = {
  getCashPayments: (params) => api.get('/cash-payments', { params }),
  getCashPayment: (id) => api.get(`/cash-payments/${id}`),
  createCashPayment: (data) => api.post('/cash-payments', data),
  updateCashPayment: (id, data) => api.put(`/cash-payments/${id}`, data),
  deleteCashPayment: (id) => api.delete(`/cash-payments/${id}`),
  getCashPaymentStats: (params) => api.get('/cash-payments/stats', { params }),
};

// Bank Receipts API
export const bankReceiptsAPI = {
  getBankReceipts: (params) => api.get('/bank-receipts', { params }),
  getBankReceipt: (id) => api.get(`/bank-receipts/${id}`),
  createBankReceipt: (data) => api.post('/bank-receipts', data),
  updateBankReceipt: (id, data) => api.put(`/bank-receipts/${id}`, data),
  deleteBankReceipt: (id) => api.delete(`/bank-receipts/${id}`),
  getBankReceiptStats: (params) => api.get('/bank-receipts/stats', { params }),
};

// Bank Payments API
export const bankPaymentsAPI = {
  getBankPayments: (params) => api.get('/bank-payments', { params }),
  getBankPayment: (id) => api.get(`/bank-payments/${id}`),
  createBankPayment: (data) => api.post('/bank-payments', data),
  updateBankPayment: (id, data) => api.put(`/bank-payments/${id}`, data),
  deleteBankPayment: (id) => api.delete(`/bank-payments/${id}`),
  getBankPaymentStats: (params) => api.get('/bank-payments/stats', { params }),
};

// Journal Vouchers API
export const journalVouchersAPI = {
  getJournalVouchers: (params) => api.get('/journal-vouchers', { params }),
  getJournalVoucher: (id) => api.get(`/journal-vouchers/${id}`),
  createJournalVoucher: (data) => api.post('/journal-vouchers', data),
};

// Recurring Expenses API
export const recurringExpensesAPI = {
  getRecurringExpenses: (params) => api.get('/recurring-expenses', { params }),
  getUpcoming: (params) => api.get('/recurring-expenses/upcoming', { params }),
  createRecurringExpense: (data) => api.post('/recurring-expenses', data),
  updateRecurringExpense: (id, data) => api.put(`/recurring-expenses/${id}`, data),
  deactivateRecurringExpense: (id) => api.delete(`/recurring-expenses/${id}`),
  recordPayment: (id, data) => api.post(`/recurring-expenses/${id}/record-payment`, data),
  snoozeRecurringExpense: (id, data) => api.post(`/recurring-expenses/${id}/snooze`, data),
};

// Stock Movements API
export const stockMovementsAPI = {
  getStockMovements: (params) => api.get('/stock-movements', { params }),
  getProductMovements: (productId, params) => api.get(`/stock-movements/product/${productId}`, { params }),
  getStockMovement: (id) => api.get(`/stock-movements/${id}`),
  createAdjustment: (data) => api.post('/stock-movements/adjustment', data),
  reverseMovement: (id, data) => api.post(`/stock-movements/${id}/reverse`, data),
  getStats: (params) => api.get('/stock-movements/stats/overview', { params }),
};

// Customer Balances API
export const customerBalancesAPI = {
  getBalanceSummary: (customerId) => api.get(`/customer-balances/${customerId}`),
  recordPayment: (customerId, data) => api.post(`/customer-balances/${customerId}/payment`, data),
  recordRefund: (customerId, data) => api.post(`/customer-balances/${customerId}/refund`, data),
  recalculateBalance: (customerId) => api.post(`/customer-balances/${customerId}/recalculate`),
  canMakePurchase: (customerId, amount) => api.get(`/customer-balances/${customerId}/can-purchase?amount=${amount}`),
  getBalanceIssues: () => api.get('/customer-balances/reports/balance-issues'),
  fixAllBalances: () => api.post('/customer-balances/fix-all-balances'),
};

// Supplier Balances API
export const supplierBalancesAPI = {
  getBalanceSummary: (supplierId) => api.get(`/supplier-balances/${supplierId}`),
  recordPayment: (supplierId, data) => api.post(`/supplier-balances/${supplierId}/payment`, data),
  recordRefund: (supplierId, data) => api.post(`/supplier-balances/${supplierId}/refund`, data),
  recalculateBalance: (supplierId) => api.post(`/supplier-balances/${supplierId}/recalculate`),
  canAcceptPurchase: (supplierId, amount) => api.get(`/supplier-balances/${supplierId}/can-accept-purchase?amount=${amount}`),
  getBalanceIssues: () => api.get('/supplier-balances/reports/balance-issues'),
  fixAllBalances: () => api.post('/supplier-balances/fix-all-balances'),
};

// Accounting API
export const accountingAPI = {
  getTransactions: (params) => api.get('/accounting/transactions', { params }),
  getAccountBalance: (accountCode, asOfDate) => api.get(`/accounting/accounts/${accountCode}/balance`, { 
    params: asOfDate ? { asOfDate } : {} 
  }),
  getTrialBalance: (asOfDate) => api.get('/accounting/trial-balance', { 
    params: asOfDate ? { asOfDate } : {} 
  }),
  updateBalanceSheet: (statementDate) => api.post('/accounting/balance-sheet/update', { statementDate }),
  getChartOfAccounts: (includeBalances, asOfDate) => api.get('/accounting/chart-of-accounts', { 
    params: { 
      includeBalances: includeBalances ? 'true' : 'false',
      ...(asOfDate && { asOfDate })
    } 
  }),
  getFinancialSummary: (asOfDate) => api.get('/accounting/financial-summary', { 
    params: asOfDate ? { asOfDate } : {} 
  }),
};

// Account Ledger API
export const accountLedgerAPI = {
  // Get ledger entries for a specific account or all accounts
  getLedgerEntries: async (params) => {
    const response = await api.get('/account-ledger', { params });
    return response.data;
  },
  // Get list of all accounts with balances
  getAccountsList: async () => {
    const response = await api.get('/account-ledger/accounts');
    return response.data;
  },
  // Get all entries from all sources (Cash, Bank receipts/payments)
  getAllEntries: async (params) => {
    const response = await api.get('/account-ledger/all-entries', { params });
    return response.data;
  },
};

// Investors API
export const investorsAPI = {
  getInvestors: (params) => api.get('/investors', { params }),
  getInvestor: (id) => api.get(`/investors/${id}`),
  createInvestor: (data) => api.post('/investors', data),
  updateInvestor: (id, data) => api.put(`/investors/${id}`, data),
  deleteInvestor: (id) => api.delete(`/investors/${id}`),
  recordPayout: (id, amount) => api.post(`/investors/${id}/payout`, { amount }),
  recordInvestment: (id, amount, notes) => api.post(`/investors/${id}/investment`, { amount, notes }),
  getProfitShares: (id, params) => api.get(`/investors/${id}/profit-shares`, { params }),
  getProfitSummary: (params) => api.get('/investors/profit-shares/summary', { params }),
  getOrderProfitShares: (orderId) => api.get(`/investors/profit-shares/order/${orderId}`),
  getInvestorProducts: (id) => api.get(`/investors/${id}/products`),
};

// Banks API
export const banksAPI = {
  getBanks: (params) => api.get('/banks', { params }),
  getBank: (id) => api.get(`/banks/${id}`),
  createBank: (data) => api.post('/banks', data),
  updateBank: (id, data) => api.put(`/banks/${id}`, data),
  deleteBank: (id) => api.delete(`/banks/${id}`),
};

// Drop Shipping API
export const dropShippingAPI = {
  getTransactions: (params) => api.get('/drop-shipping', { params }),
  getTransaction: (id) => api.get(`/drop-shipping/${id}`),
  createTransaction: (data) => api.post('/drop-shipping', data),
  updateTransaction: (id, data) => api.put(`/drop-shipping/${id}`, data),
  deleteTransaction: (id) => api.delete(`/drop-shipping/${id}`),
  updateStatus: (id, status) => api.put(`/drop-shipping/${id}/status`, { status }),
  getStats: (params) => api.get('/drop-shipping/stats', { params }),
};

// Attendance API
export const attendanceAPI = {
  clockIn: (data) => api.post('/attendance/clock-in', data),
  clockOut: (data) => api.post('/attendance/clock-out', data),
  startBreak: (type) => api.post('/attendance/breaks/start', { type }),
  endBreak: () => api.post('/attendance/breaks/end'),
  getStatus: () => api.get('/attendance/status'),
  getMyAttendance: (params) => api.get('/attendance/me', { params }),
  getTeamAttendance: (params) => api.get('/attendance/team', { params }),
};

// Employees API
export const employeesAPI = {
  getEmployees: (params) => api.get('/employees', { params }),
  getEmployee: (id) => api.get(`/employees/${id}`),
  createEmployee: (data) => api.post('/employees', data),
  updateEmployee: (id, data) => api.put(`/employees/${id}`, data),
  deleteEmployee: (id) => api.delete(`/employees/${id}`),
  getDepartments: () => api.get('/employees/departments/list'),
  getPositions: () => api.get('/employees/positions/list'),
};

export default api;
