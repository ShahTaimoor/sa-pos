import api from './api';

const paymentAPI = {
  // Process payment
  processPayment: (paymentData) => {
    return api.post('/payments/process', paymentData);
  },

  // Process refund
  processRefund: (paymentId, refundData) => {
    return api.post(`/payments/${paymentId}/refund`, refundData);
  },

  // Void transaction
  voidTransaction: (transactionId, reason) => {
    return api.post(`/payments/transactions/${transactionId}/void`, { reason });
  },

  // Get payment history
  getPaymentHistory: (filters = {}) => {
    return api.get('/payments', { params: filters });
  },

  // Get payment details
  getPaymentDetails: (paymentId) => {
    return api.get(`/payments/${paymentId}`);
  },

  // Get payment statistics
  getPaymentStats: (startDate, endDate) => {
    return api.get('/payments/stats', {
      params: { startDate, endDate }
    });
  },

  // Get available payment methods
  getPaymentMethods: () => {
    return api.get('/payments/methods');
  }
};

export default paymentAPI;
