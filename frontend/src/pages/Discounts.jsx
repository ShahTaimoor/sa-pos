import React, { useState } from 'react';
import { 
  RefreshCw, 
  Search, 
  Filter, 
  Plus, 
  Eye, 
  Edit, 
  Trash2,
  ToggleLeft,
  ToggleRight,
  Percent,
  TrendingUp,
  Tag,
  Calendar,
  Users,
  Package,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  TrendingDown
} from 'lucide-react';
import {
  useGetDiscountsQuery,
  useGetDiscountStatsQuery,
  useGetDiscountQuery,
  useToggleDiscountStatusMutation,
  useDeleteDiscountMutation,
} from '../store/services/discountsApi';
import { handleApiError, showSuccessToast, showErrorToast } from '../utils/errorHandler';
import { LoadingSpinner, LoadingCard, LoadingTable } from '../components/LoadingSpinner';
import { useResponsive, ResponsiveContainer, ResponsiveGrid } from '../components/ResponsiveContainer';
import CreateDiscountModal from '../components/CreateDiscountModal';
import DiscountDetailModal from '../components/DiscountDetailModal';
import DiscountFilters from '../components/DiscountFilters';

const Discounts = () => {
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    status: '',
    type: '',
    isActive: '',
    search: '',
    validFrom: '',
    validUntil: '',
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });
  
  const [selectedDiscount, setSelectedDiscount] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const { isMobile } = useResponsive();

  // Fetch discounts
  const { 
    data: discountsData, 
    isLoading: discountsLoading, 
    error: discountsError,
    refetch: refetchDiscounts
  } = useGetDiscountsQuery(filters, {
    onError: (error) => {
      handleApiError(error, 'Fetch Discounts');
    }
  });

  // Fetch discount statistics
  const { 
    data: statsData, 
    isLoading: statsLoading 
  } = useGetDiscountStatsQuery(
    {
      startDate: filters.validFrom,
      endDate: filters.validUntil
    },
    {
      skip: !filters.validFrom || !filters.validUntil,
    }
  );

  // Get selected discount details
  const { data: selectedDiscountData } = useGetDiscountQuery(selectedDiscount?._id, {
    skip: !selectedDiscount?._id,
  });

  // Mutations
  const [toggleDiscountStatus] = useToggleDiscountStatusMutation();
  const [deleteDiscount] = useDeleteDiscountMutation();

  React.useEffect(() => {
    if (selectedDiscountData?.data) {
      setSelectedDiscount(selectedDiscountData.data);
    }
  }, [selectedDiscountData]);

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      page: 1 // Reset to first page when filters change
    }));
  };

  const handleDiscountSelect = (discountId) => {
    setSelectedDiscount({ _id: discountId }); // Trigger query
    setShowDetailModal(true);
  };

  const handleToggleStatus = async (discountId) => {
    try {
      const response = await toggleDiscountStatus(discountId).unwrap();
      showSuccessToast(`Discount ${response.data?.discount?.isActive ? 'activated' : 'deactivated'} successfully`);
      refetchDiscounts();
    } catch (error) {
      handleApiError(error, 'Toggle Discount Status');
    }
  };

  const handleDelete = async (discountId) => {
    if (window.confirm('Are you sure you want to delete this discount?')) {
      try {
        await deleteDiscount(discountId).unwrap();
        showSuccessToast('Discount deleted successfully');
        refetchDiscounts();
      } catch (error) {
        handleApiError(error, 'Delete Discount');
      }
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'inactive':
        return <XCircle className="h-4 w-4 text-gray-500" />;
      case 'scheduled':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'expired':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'exhausted':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'exhausted':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type) => {
    return type === 'percentage' ? 
      <Percent className="h-4 w-4 text-blue-500" /> : 
      <TrendingUp className="h-4 w-4 text-green-500" />;
  };

  const getTypeColor = (type) => {
    return type === 'percentage' ? 
      'bg-blue-100 text-blue-800' : 
      'bg-green-100 text-green-800';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString();
  };

  if (discountsLoading && !discountsData) {
    return <LoadingSpinner message="Loading discounts..." />;
  }

  const discounts = discountsData?.data?.discounts || [];
  const pagination = discountsData?.data?.pagination || {};
  const stats = statsData?.data || {};

  return (
    <ResponsiveContainer className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Discount Management</h1>
          <p className="text-gray-600">Manage percentage and fixed amount discounts</p>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={() => refetchDiscounts()}
            className="btn btn-secondary"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary btn-md"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Discount
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      {!statsLoading && (
        <ResponsiveGrid cols={{ default: 1, md: 2, lg: 4 }} gap={6}>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="p-3 rounded-md bg-blue-50 text-blue-600">
                    <Tag className="h-5 w-5" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Discounts
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stats.totalDiscounts || 0}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="p-3 rounded-md bg-green-50 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Active Discounts
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stats.activeDiscounts || 0}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="p-3 rounded-md bg-purple-50 text-purple-600">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Usage
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stats.totalUsage || 0}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="p-3 rounded-md bg-yellow-50 text-yellow-600">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Discount Amount
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {formatCurrency(stats.totalDiscountAmount || 0)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </ResponsiveGrid>
      )}

      {/* Filters */}
      <DiscountFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        isLoading={discountsLoading}
      />

      {/* Discounts Table */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Discounts</h3>
            <span className="text-sm text-gray-600">
              {pagination.total || 0} total discounts
            </span>
          </div>
        </div>
        
        <div className="card-content p-0">
          {discountsLoading ? (
            <LoadingTable rows={5} cols={8} />
          ) : discounts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Tag className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2">No discounts found</p>
              <p className="text-sm">Try adjusting your filters or create a new discount</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Discount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Value
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usage
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Valid Period
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Applicable To
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {discounts.map((discount) => (
                    <tr key={discount._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {discount.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          Code: {discount.code}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeColor(discount.type)}`}>
                          {getTypeIcon(discount.type)}
                          <span className="ml-1 capitalize">{discount.type.replace('_', ' ')}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {discount.type === 'percentage' ? 
                          `${discount.value}%` : 
                          formatCurrency(discount.value)
                        }
                        {discount.maximumDiscount && discount.type === 'percentage' && (
                          <div className="text-xs text-gray-500">
                            Max: {formatCurrency(discount.maximumDiscount)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(discount.status)}`}>
                          {getStatusIcon(discount.status)}
                          <span className="ml-1 capitalize">{discount.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>{discount.currentUsage || 0}</div>
                        {discount.usageLimit && (
                          <div className="text-xs text-gray-500">
                            / {discount.usageLimit}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>{formatDate(discount.validFrom)}</div>
                        <div className="text-xs text-gray-500">
                          to {formatDate(discount.validUntil)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center">
                          {discount.applicableTo === 'all' && <Users className="h-4 w-4 text-gray-400" />}
                          {discount.applicableTo === 'products' && <Package className="h-4 w-4 text-gray-400" />}
                          {discount.applicableTo === 'categories' && <Tag className="h-4 w-4 text-gray-400" />}
                          {discount.applicableTo === 'customers' && <Users className="h-4 w-4 text-gray-400" />}
                          <span className="ml-1 capitalize">
                            {discount.applicableTo}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleDiscountSelect(discount._id)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(discount._id)}
                            className="text-green-600 hover:text-green-900"
                            title={discount.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {discount.isActive ? 
                              <ToggleRight className="h-4 w-4" /> : 
                              <ToggleLeft className="h-4 w-4" />
                            }
                          </button>
                          {discount.currentUsage === 0 && (
                            <button
                              onClick={() => handleDelete(discount._id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => handleFilterChange({ page: pagination.current - 1 })}
                disabled={!pagination.hasPrev}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => handleFilterChange({ page: pagination.current + 1 })}
                disabled={!pagination.hasNext}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing{' '}
                  <span className="font-medium">
                    {(pagination.current - 1) * filters.limit + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-medium">
                    {Math.min(pagination.current * filters.limit, pagination.total)}
                  </span>{' '}
                  of{' '}
                  <span className="font-medium">{pagination.total}</span>{' '}
                  results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => handleFilterChange({ page: pagination.current - 1 })}
                    disabled={!pagination.hasPrev}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  {[...Array(pagination.pages)].map((_, i) => (
                    <button
                      key={i + 1}
                      onClick={() => handleFilterChange({ page: i + 1 })}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        pagination.current === i + 1
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    onClick={() => handleFilterChange({ page: pagination.current + 1 })}
                    disabled={!pagination.hasNext}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateDiscountModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            refetchDiscounts();
          }}
        />
      )}

      {showDetailModal && selectedDiscount && (
        <DiscountDetailModal
          discount={selectedDiscount}
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedDiscount(null);
          }}
          onToggleStatus={handleToggleStatus}
          onDelete={handleDelete}
          isLoading={false}
        />
      )}
    </ResponsiveContainer>
  );
};

export default Discounts;
