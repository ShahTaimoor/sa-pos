import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, 
  RefreshCw,
  ShoppingCart,
  TrendingDown,
  Package,
  CheckCircle,
  XCircle,
  Loader2,
  Zap
} from 'lucide-react';
import { inventoryAlertsAPI } from '../services/api';
import { showSuccessToast, showErrorToast, handleApiError } from '../utils/errorHandler';
import { formatCurrency } from '../utils/formatters';
import { LoadingSpinner } from '../components/LoadingSpinner';

const InventoryAlerts = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filterLevel, setFilterLevel] = useState('all'); // 'all', 'critical', 'warning'
  const [autoConfirm, setAutoConfirm] = useState(false);

  // Fetch low stock alerts
  const { data: alertsData, isLoading, error, refetch } = useQuery(
    ['inventoryAlerts', filterLevel],
    () => inventoryAlertsAPI.getLowStockAlerts({
      includeOutOfStock: filterLevel === 'all' || filterLevel === 'critical',
      includeCritical: filterLevel === 'all' || filterLevel === 'critical',
      includeWarning: filterLevel === 'all' || filterLevel === 'warning'
    }),
    {
      refetchInterval: 30000, // Refetch every 30 seconds
      select: (response) => {
        // Extract data from response
        const data = response?.data?.data || response?.data || [];
        return Array.isArray(data) ? data : [];
      },
      onError: (error) => {
        showErrorToast(handleApiError(error));
      }
    }
  );

  // Fetch alert summary
  const { data: summaryData } = useQuery(
    'inventoryAlertsSummary',
    () => inventoryAlertsAPI.getAlertSummary(),
    {
      refetchInterval: 30000,
      select: (response) => {
        return response?.data?.data || response?.data || {};
      }
    }
  );

  // Generate purchase orders mutation
  const generatePOMutation = useMutation(
    (params) => inventoryAlertsAPI.generatePurchaseOrders(params),
    {
      onSuccess: (response) => {
        queryClient.invalidateQueries('purchaseOrders');
        queryClient.invalidateQueries('inventoryAlerts');
        queryClient.invalidateQueries('inventoryAlertsSummary');
        
        const count = response?.count || 0;
        const message = response?.message || `Successfully generated ${count} purchase order(s)`;
        
        if (count > 0) {
          showSuccessToast(message);
          // Navigate to purchase orders after a short delay
          setTimeout(() => {
            navigate('/purchase-orders');
          }, 1500);
        } else {
          // Show detailed message about why no POs were generated
          let reasonMessage = message;
          if (response?.unassignedProducts?.length > 0) {
            reasonMessage += `. ${response.unassignedProducts.length} product(s) could not be assigned to suppliers (no purchase history found).`;
          }
          if (response?.errors?.length > 0) {
            reasonMessage += ` ${response.errors.length} error(s) occurred during generation.`;
          }
          showErrorToast(reasonMessage);
        }
        
        if (response?.unassignedProducts?.length > 0 && count === 0) {
          console.log('Unassigned products:', response.unassignedProducts);
        }
      },
      onError: (error) => {
        showErrorToast(handleApiError(error));
      }
    }
  );

  const handleGeneratePOs = () => {
    const params = {
      autoConfirm: autoConfirm.toString(),
      supplierPreference: 'primary',
      groupBySupplier: 'true'
    };

    generatePOMutation.mutate(params);
  };

  // Ensure alerts is always an array
  // alertsData is already processed by the select function above
  const alerts = Array.isArray(alertsData) ? alertsData : [];
  const summary = summaryData || {};

  const getAlertBadgeColor = (level) => {
    switch (level) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getUrgencyColor = (urgency) => {
    if (urgency >= 80) return 'text-red-600 font-bold';
    if (urgency >= 60) return 'text-orange-600 font-semibold';
    if (urgency >= 40) return 'text-yellow-600';
    return 'text-gray-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Alerts</h1>
          <p className="text-gray-600">Monitor low stock and auto-generate purchase orders</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => refetch()}
            className="btn btn-secondary flex items-center"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleGeneratePOs}
            disabled={generatePOMutation.isLoading || alerts.length === 0}
            className="btn btn-primary flex items-center"
          >
            {generatePOMutation.isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Generate Purchase Orders
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Alerts</p>
              <p className="text-2xl font-bold text-gray-900">{summary.total || 0}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-gray-400" />
          </div>
        </div>
        <div className="bg-red-50 rounded-lg shadow p-4 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600">Critical</p>
              <p className="text-2xl font-bold text-red-700">{summary.critical || 0}</p>
            </div>
            <XCircle className="h-8 w-8 text-red-400" />
          </div>
        </div>
        <div className="bg-yellow-50 rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-600">Warning</p>
              <p className="text-2xl font-bold text-yellow-700">{summary.warning || 0}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-yellow-400" />
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg shadow p-4 border-l-4 border-gray-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Out of Stock</p>
              <p className="text-2xl font-bold text-gray-700">{summary.outOfStock || 0}</p>
            </div>
            <Package className="h-8 w-8 text-gray-400" />
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg shadow p-4 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600">Low Stock</p>
              <p className="text-2xl font-bold text-blue-700">{summary.lowStock || 0}</p>
            </div>
            <TrendingDown className="h-8 w-8 text-blue-400" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center space-x-4">
          <label className="text-sm font-medium text-gray-700">Filter by Level:</label>
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="input"
          >
            <option value="all">All Alerts</option>
            <option value="critical">Critical Only</option>
            <option value="warning">Warning Only</option>
          </select>
          <div className="flex items-center space-x-2 ml-auto">
            <input
              type="checkbox"
              id="autoConfirm"
              checked={autoConfirm}
              onChange={(e) => setAutoConfirm(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="autoConfirm" className="text-sm text-gray-700">
              Auto-confirm generated POs
            </label>
          </div>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="p-6 text-center text-red-600">
            Error loading alerts: {handleApiError(error).message}
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No low stock alerts at this time</p>
            <p className="text-gray-400 text-sm mt-2">All products are well stocked!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Stock
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reorder Point
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Days Until Out
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Suggested Qty
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Urgency
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {alerts.map((alert, index) => (
                  <tr
                    key={alert.product._id}
                    className={`hover:bg-gray-50 ${
                      alert.alertLevel === 'critical' ? 'bg-red-50' : ''
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Package className="h-5 w-5 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {alert.product.name}
                          </div>
                          {alert.product.sku && (
                            <div className="text-sm text-gray-500">SKU: {alert.product.sku}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {alert.inventory.currentStock}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {alert.inventory.reorderPoint}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-medium ${getUrgencyColor(alert.urgency)}`}>
                        {alert.daysUntilOutOfStock} days
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getAlertBadgeColor(
                          alert.alertLevel
                        )}`}
                      >
                        {alert.stockStatus === 'out_of_stock'
                          ? 'Out of Stock'
                          : alert.stockStatus === 'critical'
                          ? 'Critical'
                          : 'Low Stock'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                      {alert.suggestedReorderQuantity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-1 bg-gray-200 rounded-full h-2 mr-2">
                          <div
                            className={`h-2 rounded-full ${
                              alert.urgency >= 80
                                ? 'bg-red-600'
                                : alert.urgency >= 60
                                ? 'bg-orange-600'
                                : alert.urgency >= 40
                                ? 'bg-yellow-600'
                                : 'bg-gray-400'
                            }`}
                            style={{ width: `${alert.urgency}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600">{alert.urgency}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryAlerts;

