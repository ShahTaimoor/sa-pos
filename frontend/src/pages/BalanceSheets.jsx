import React, { useState } from 'react';
import { 
  RefreshCw, 
  Search, 
  Filter, 
  Plus, 
  Eye, 
  Edit, 
  Trash2,
  TrendingUp,
  TrendingDown,
  BarChart3,
  FileText,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  Download
} from 'lucide-react';
import {
  useGetBalanceSheetsQuery,
  useGetBalanceSheetStatsQuery,
  useGetBalanceSheetQuery,
  useDeleteBalanceSheetMutation,
  useUpdateBalanceSheetStatusMutation,
} from '../store/services/balanceSheetsApi';
import { handleApiError, showSuccessToast, showErrorToast } from '../utils/errorHandler';
import { LoadingSpinner, LoadingCard, LoadingTable } from '../components/LoadingSpinner';
import { useResponsive, ResponsiveContainer, ResponsiveGrid } from '../components/ResponsiveContainer';
import CreateBalanceSheetModal from '../components/CreateBalanceSheetModal';
import BalanceSheetDetailModal from '../components/BalanceSheetDetailModal';
import BalanceSheetFilters from '../components/BalanceSheetFilters';

const BalanceSheets = () => {
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    status: '',
    periodType: '',
    search: '',
    startDate: '',
    endDate: ''
  });
  
  const [selectedBalanceSheet, setSelectedBalanceSheet] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const { isMobile } = useResponsive();

  // Fetch balance sheets
  const { 
    data: balanceSheetsData, 
    isLoading: balanceSheetsLoading, 
    error: balanceSheetsError,
    refetch: refetchBalanceSheets
  } = useGetBalanceSheetsQuery(filters, {
    onError: (error) => {
      handleApiError(error, 'Fetch Balance Sheets');
    }
  });

  // Fetch balance sheet statistics
  const { 
    data: statsData, 
    isLoading: statsLoading 
  } = useGetBalanceSheetStatsQuery(
    {
      startDate: filters.startDate,
      endDate: filters.endDate
    },
    {
      skip: !filters.startDate || !filters.endDate,
    }
  );

  // Get selected balance sheet details
  const { data: selectedBalanceSheetData } = useGetBalanceSheetQuery(
    selectedBalanceSheet?._id,
    {
      skip: !selectedBalanceSheet?._id,
    }
  );

  // Mutations
  const [deleteBalanceSheet] = useDeleteBalanceSheetMutation();
  const [updateBalanceSheetStatus] = useUpdateBalanceSheetStatusMutation();

  // Handlers
  const handleUpdateStatus = async (balanceSheetId, status, notes) => {
    try {
      await updateBalanceSheetStatus({ id: balanceSheetId, status, notes }).unwrap();
      showSuccessToast(`Balance sheet status updated to ${status}`);
      setShowDetailModal(false);
      setSelectedBalanceSheet(null);
      refetchBalanceSheets();
    } catch (error) {
      handleApiError(error, 'Update Balance Sheet Status');
    }
  };

  const handleDeleteBalanceSheet = async (balanceSheetId) => {
    try {
      await deleteBalanceSheet(balanceSheetId).unwrap();
      showSuccessToast('Balance sheet deleted successfully');
      refetchBalanceSheets();
    } catch (error) {
      handleApiError(error, 'Delete Balance Sheet');
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      page: 1 // Reset to first page when filters change
    }));
  };

  const handleBalanceSheetSelect = (balanceSheetId) => {
    setSelectedBalanceSheet({ _id: balanceSheetId }); // Trigger query
    setShowDetailModal(true);
  };

  React.useEffect(() => {
    if (selectedBalanceSheetData?.data) {
      setSelectedBalanceSheet(selectedBalanceSheetData.data);
    }
  }, [selectedBalanceSheetData]);

  const handleStatusUpdate = (status, notes = '') => {
    if (!selectedBalanceSheet) return;
    
    updateStatusMutation.mutate({
      balanceSheetId: selectedBalanceSheet._id,
      status,
      notes
    });
  };

  const handleDelete = (balanceSheetId) => {
    if (window.confirm('Are you sure you want to delete this balance sheet?')) {
      handleDeleteBalanceSheet(balanceSheetId);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'draft':
        return <Edit className="h-4 w-4 text-gray-500" />;
      case 'review':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'final':
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'review':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'final':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPeriodTypeColor = (periodType) => {
    switch (periodType) {
      case 'monthly':
        return 'bg-blue-100 text-blue-800';
      case 'quarterly':
        return 'bg-green-100 text-green-800';
      case 'yearly':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (balanceSheetsLoading && !balanceSheetsData) {
    return <LoadingSpinner message="Loading balance sheets..." />;
  }

  const balanceSheets = balanceSheetsData?.data?.balanceSheets || [];
  const pagination = balanceSheetsData?.data?.pagination || {};
  const stats = statsData?.data || {};

  return (
    <ResponsiveContainer className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Balance Sheets</h1>
          <p className="text-gray-600">Financial position and asset management</p>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={() => refetchBalanceSheets()}
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
            Generate Balance Sheet
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
                    <FileText className="h-5 w-5" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Balance Sheets
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stats.totalStatements || 0}
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
                    <TrendingUp className="h-5 w-5" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Average Total Assets
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {(stats.averageTotalAssets || 0).toLocaleString()}
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
                  <div className="p-3 rounded-md bg-red-50 text-red-600">
                    <TrendingDown className="h-5 w-5" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Average Total Liabilities
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {(stats.averageTotalLiabilities || 0).toLocaleString()}
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
                    <BarChart3 className="h-5 w-5" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Average Total Equity
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {(stats.averageTotalEquity || 0).toLocaleString()}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </ResponsiveGrid>
      )}

      {/* Filters */}
      <BalanceSheetFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        isLoading={balanceSheetsLoading}
      />

      {/* Balance Sheets Table */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Balance Sheets</h3>
            <span className="text-sm text-gray-600">
              {pagination.total || 0} total balance sheets
            </span>
          </div>
        </div>
        
        <div className="card-content p-0">
          {balanceSheetsLoading ? (
            <LoadingTable rows={5} cols={7} />
          ) : balanceSheets.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2">No balance sheets found</p>
              <p className="text-sm">Try adjusting your filters or generate a new balance sheet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Statement #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Period
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Assets
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Equity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {balanceSheets.map((balanceSheet) => (
                    <tr key={balanceSheet._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {balanceSheet.statementNumber}
                        </div>
                        <div className="text-sm text-gray-500">
                          Generated {new Date(balanceSheet.metadata?.generatedAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(balanceSheet.statementDate).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPeriodTypeColor(balanceSheet.periodType)}`}>
                          {balanceSheet.periodType}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(balanceSheet.status)}`}>
                          {getStatusIcon(balanceSheet.status)}
                          <span className="ml-1 capitalize">{balanceSheet.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {balanceSheet.assets?.totalAssets?.toLocaleString() || '0'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {balanceSheet.equity?.totalEquity?.toLocaleString() || '0'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleBalanceSheetSelect(balanceSheet._id)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {balanceSheet.status === 'draft' && (
                            <>
                              <button
                                onClick={() => handleDelete(balanceSheet._id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
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
        <CreateBalanceSheetModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            refetchBalanceSheets();
          }}
        />
      )}

      {showDetailModal && selectedBalanceSheet && (
        <BalanceSheetDetailModal
          balanceSheet={selectedBalanceSheet}
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedBalanceSheet(null);
          }}
          onStatusUpdate={handleStatusUpdate}
          isLoading={false}
        />
      )}
    </ResponsiveContainer>
  );
};

export default BalanceSheets;
