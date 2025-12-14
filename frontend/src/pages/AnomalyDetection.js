import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { 
  AlertTriangle, 
  TrendingDown,
  DollarSign,
  Package,
  CreditCard,
  Users,
  Filter,
  RefreshCw,
  Eye,
  Calendar,
  XCircle,
  AlertCircle,
  Info
} from 'lucide-react';
import { anomalyDetectionAPI } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { showErrorToast, handleApiError } from '../utils/errorHandler';

const AnomalyDetection = () => {
  const [filters, setFilters] = useState({
    type: '',
    severity: '',
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  // Fetch anomalies
  const { data: anomaliesData, isLoading, error, refetch } = useQuery(
    ['anomalyDetection', filters],
    () => anomalyDetectionAPI.getAnomalies({
      startDate: filters.startDate,
      endDate: filters.endDate,
      type: filters.type || undefined,
      severity: filters.severity || undefined
    }),
    {
      refetchInterval: 60000, // Refetch every minute
      onError: (error) => {
        showErrorToast(handleApiError(error));
      }
    }
  );

  // Fetch summary
  const { data: summaryData } = useQuery(
    'anomalyDetectionSummary',
    () => anomalyDetectionAPI.getSummary(),
    {
      refetchInterval: 60000,
      onError: () => {} // Silently fail
    }
  );

  const anomalies = anomaliesData?.data?.anomalies || [];
  const summary = summaryData?.data || {};

  const severityColors = {
    critical: 'bg-red-100 text-red-800 border-red-300',
    high: 'bg-orange-100 text-orange-800 border-orange-300',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    low: 'bg-blue-100 text-blue-800 border-blue-300'
  };

  const severityIcons = {
    critical: XCircle,
    high: AlertTriangle,
    medium: AlertCircle,
    low: Info
  };

  const typeLabels = {
    large_transaction: 'Large Transaction',
    rapid_transactions: 'Rapid Transactions',
    unusual_discount: 'Unusual Discount',
    price_anomaly: 'Price Anomaly',
    quantity_anomaly: 'Quantity Anomaly',
    customer_anomaly: 'Customer Anomaly',
    new_customer_large_transaction: 'New Customer Large Transaction',
    negative_stock: 'Negative Stock',
    sudden_stock_drop: 'Sudden Stock Drop',
    duplicate_payment: 'Duplicate Payment',
    large_payment: 'Large Payment'
  };

  const typeIcons = {
    large_transaction: DollarSign,
    rapid_transactions: RefreshCw,
    unusual_discount: TrendingDown,
    price_anomaly: DollarSign,
    quantity_anomaly: Package,
    customer_anomaly: Users,
    new_customer_large_transaction: Users,
    negative_stock: Package,
    sudden_stock_drop: Package,
    duplicate_payment: CreditCard,
    large_payment: CreditCard
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Anomaly Detection & Fraud Prevention</h1>
          <p className="text-gray-600">AI-powered detection of unusual patterns and potential fraud</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => refetch()}
            className="btn btn-secondary flex items-center"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Critical Anomalies</p>
              <p className="text-2xl font-bold text-gray-900">{summary.summary?.critical || 0}</p>
            </div>
            <XCircle className="h-8 w-8 text-red-400" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">High Priority</p>
              <p className="text-2xl font-bold text-gray-900">{summary.summary?.high || 0}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-orange-400" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Medium Priority</p>
              <p className="text-2xl font-bold text-gray-900">{summary.summary?.medium || 0}</p>
            </div>
            <AlertCircle className="h-8 w-8 text-yellow-400" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Anomalies</p>
              <p className="text-2xl font-bold text-gray-900">{anomaliesData?.data?.total || 0}</p>
            </div>
            <Info className="h-8 w-8 text-blue-400" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
          <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            className="input"
          >
            <option value="">All Types</option>
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
            className="input"
          >
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            className="input"
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            className="input"
          />
          <button
            onClick={() => setFilters({ type: '', severity: '', startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0] })}
            className="btn btn-secondary text-sm"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Anomalies List */}
      {anomalies.length > 0 ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Detected Anomalies ({anomalies.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-200">
            {anomalies.map((anomaly, index) => {
              const SeverityIcon = severityIcons[anomaly.severity] || Info;
              const TypeIcon = typeIcons[anomaly.type] || AlertTriangle;
              
              return (
                <div key={index} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <TypeIcon className="h-5 w-5 text-gray-400" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          {anomaly.title}
                        </h3>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${severityColors[anomaly.severity] || severityColors.low}`}>
                          {anomaly.severity.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">{anomaly.description}</p>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        {anomaly.amount && (
                          <div>
                            <span className="text-gray-500">Amount:</span>
                            <span className="ml-2 font-semibold text-gray-900">
                              {formatCurrency(anomaly.amount)}
                            </span>
                          </div>
                        )}
                        {anomaly.date && (
                          <div>
                            <span className="text-gray-500">Date:</span>
                            <span className="ml-2 font-semibold text-gray-900">
                              {new Date(anomaly.date).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        {anomaly.customer && (
                          <div>
                            <span className="text-gray-500">Customer:</span>
                            <span className="ml-2 font-semibold text-gray-900">
                              {anomaly.customer?.businessName || anomaly.customer?.name || 'N/A'}
                            </span>
                          </div>
                        )}
                        {anomaly.product && (
                          <div>
                            <span className="text-gray-500">Product:</span>
                            <span className="ml-2 font-semibold text-gray-900">
                              {anomaly.product?.name || anomaly.product?.sku || 'N/A'}
                            </span>
                          </div>
                        )}
                        {anomaly.discountPercentage && (
                          <div>
                            <span className="text-gray-500">Discount:</span>
                            <span className="ml-2 font-semibold text-gray-900">
                              {anomaly.discountPercentage}%
                            </span>
                          </div>
                        )}
                        {anomaly.quantity && (
                          <div>
                            <span className="text-gray-500">Quantity:</span>
                            <span className="ml-2 font-semibold text-gray-900">
                              {anomaly.quantity}
                            </span>
                          </div>
                        )}
                      </div>

                      {anomaly.metadata && Object.keys(anomaly.metadata).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <details className="text-sm">
                            <summary className="text-gray-500 cursor-pointer hover:text-gray-700">
                              View Details
                            </summary>
                            <div className="mt-2 space-y-1">
                              {Object.entries(anomaly.metadata).map(([key, value]) => (
                                <div key={key} className="flex">
                                  <span className="text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                                  <span className="ml-2 text-gray-900">{String(value)}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                    <div className="ml-4">
                      {anomaly.transactionId && (
                        <button
                          className="btn btn-outline btn-sm"
                          title="View Transaction"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Anomalies Detected</h3>
          <p className="text-gray-600">
            {filters.type || filters.severity 
              ? 'No anomalies match your current filters. Try adjusting your filters.'
              : 'Great! No suspicious activities detected in the selected period.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default AnomalyDetection;

