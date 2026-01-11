import React, { useState } from 'react';
import {
  TrendingUp,
  Calendar,
  Search,
  TrendingDown,
  ArrowUpCircle,
  ArrowDownCircle,
  FileText,
  Download,
  BarChart3,
} from 'lucide-react';
import { useGetSummaryQuery } from '../store/services/plStatementsApi';
import { handleApiError } from '../utils/errorHandler';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { formatCurrency } from '../utils/formatters';
import PLSummaryReportModal from '../components/PLSummaryReportModal';

// Helper function to get local date in YYYY-MM-DD format
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to format date for display
const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
};

export const PLStatements = () => {
  // Get first day of current month and today
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const [fromDate, setFromDate] = useState(getLocalDateString(firstDayOfMonth));
  const [toDate, setToDate] = useState(getLocalDateString(today));
  const [searchFromDate, setSearchFromDate] = useState(getLocalDateString(firstDayOfMonth));
  const [searchToDate, setSearchToDate] = useState(getLocalDateString(today));
  const [showData, setShowData] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  // Fetch P&L summary when search is clicked
  const { data: summaryData, isLoading, error, refetch } = useGetSummaryQuery(
    {
      startDate: searchFromDate,
      endDate: searchToDate,
    },
    {
      skip: !showData, // Only fetch when showData is true
      onError: (error) => handleApiError(error, 'Profit & Loss Statement'),
    }
  );

  const handleSearch = () => {
    if (!fromDate || !toDate) {
      alert('Please select both From Date and To Date');
      return;
    }
    
    if (new Date(fromDate) > new Date(toDate)) {
      alert('From Date cannot be after To Date');
      return;
    }
    
    setSearchFromDate(fromDate);
    setSearchToDate(toDate);
    setShowData(true);
    refetch();
  };

  // Extract summary data - handle different response structures
  const summary = summaryData?.data || summaryData;
  
  // Extract values from summary - handle both direct values and nested structure
  // The backend might return a full statement object or just summary values
  const totalRevenue = summary?.revenue?.totalRevenue?.amount || 
                      summary?.statement?.revenue?.totalRevenue?.amount ||
                      summary?.totalRevenue || 0;
  const grossProfit = summary?.grossProfit?.amount || 
                     summary?.statement?.grossProfit?.amount ||
                     summary?.grossProfit || 0;
  const operatingIncome = summary?.operatingIncome?.amount || 
                         summary?.statement?.operatingIncome?.amount ||
                         summary?.operatingIncome || 0;
  const netIncome = summary?.netIncome?.amount || 
                   summary?.statement?.netIncome?.amount ||
                   summary?.netIncome || 0;
  const grossMargin = summary?.grossProfit?.margin || 
                     summary?.statement?.grossProfit?.margin ||
                     summary?.grossMargin;
  const operatingMargin = summary?.operatingIncome?.margin || 
                         summary?.statement?.operatingIncome?.margin ||
                         summary?.operatingMargin;
  const netMargin = summary?.netIncome?.margin || 
                   summary?.statement?.netIncome?.margin ||
                   summary?.netMargin;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <FileText className="h-7 w-7 mr-3 text-primary-600" />
              Profit & Loss Statement
            </h1>
            <p className="text-gray-600 mt-1">View your business financial performance</p>
          </div>
          {showData && summary && (
            <button
              onClick={() => setShowSummaryModal(true)}
              className="btn btn-primary flex items-center space-x-2 px-4 py-2"
            >
              <BarChart3 className="h-5 w-5" />
              <span>View Summary Report</span>
            </button>
          )}
        </div>

        {/* Date Range Selector */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex items-center space-x-3 flex-1">
              <Calendar className="h-5 w-5 text-gray-500" />
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3 flex-1">
              <Calendar className="h-5 w-5 text-gray-500" />
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleSearch}
                disabled={isLoading}
                className="btn btn-primary flex items-center space-x-2 px-6 py-2.5 h-fit disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Search className="h-5 w-5" />
                <span>{isLoading ? 'Loading...' : 'Search'}</span>
              </button>
            </div>
          </div>

          {showData && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Showing data from <strong>{formatDate(searchFromDate)}</strong> to <strong>{formatDate(searchToDate)}</strong>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && showData && (
        <div className="flex justify-center items-center py-12">
          <LoadingSpinner />
          <p className="ml-3 text-gray-600">Loading Profit & Loss data...</p>
        </div>
      )}

      {/* Error State */}
      {error && showData && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800">Error loading Profit & Loss data</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error?.data?.message || error?.message || 'An unexpected error occurred. Please try again.'}</p>
                {process.env.NODE_ENV === 'development' && error && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs">Technical details</summary>
                    <pre className="mt-2 text-xs bg-red-100 p-2 rounded overflow-auto">
                      {JSON.stringify(error, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              <div className="mt-4">
                <button
                  onClick={() => {
                    setShowData(true);
                    refetch();
                  }}
                  className="text-sm font-medium text-red-800 hover:text-red-900 underline"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* P&L Data Display */}
      {!isLoading && !error && showData && summary && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Total Revenue */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg border-2 border-green-300 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-green-800 uppercase tracking-wide">
                  Total Revenue
                </h3>
                <ArrowUpCircle className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-3xl font-bold text-green-900">
                {formatCurrency(totalRevenue)}
              </p>
              <p className="text-xs text-green-700 mt-2">
                All income from sales
              </p>
            </div>

            {/* Gross Profit */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border-2 border-blue-300 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-blue-800 uppercase tracking-wide">
                  Gross Profit
                </h3>
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
              <p className={`text-3xl font-bold ${grossProfit >= 0 ? 'text-blue-900' : 'text-red-600'}`}>
                {formatCurrency(grossProfit)}
              </p>
              <p className="text-xs text-blue-700 mt-2">
                Revenue - Cost of Goods Sold
              </p>
              {grossMargin !== undefined && (
                <p className="text-xs text-blue-600 mt-1">
                  Margin: {grossMargin.toFixed(1)}%
                </p>
              )}
            </div>

            {/* Net Income */}
            <div className={`bg-gradient-to-br rounded-lg border-2 p-6 shadow-sm ${
              netIncome >= 0 
                ? 'from-teal-50 to-teal-100 border-teal-300' 
                : 'from-red-50 to-red-100 border-red-300'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-semibold uppercase tracking-wide ${
                  netIncome >= 0 ? 'text-teal-800' : 'text-red-800'
                }`}>
                  Net Profit / Loss
                </h3>
                {netIncome >= 0 ? (
                  <TrendingUp className="h-6 w-6 text-teal-600" />
                ) : (
                  <TrendingDown className="h-6 w-6 text-red-600" />
                )}
              </div>
              <p className={`text-3xl font-bold ${
                netIncome >= 0 ? 'text-teal-900' : 'text-red-900'
              }`}>
                {formatCurrency(netIncome)}
              </p>
              <p className={`text-xs mt-2 ${
                netIncome >= 0 ? 'text-teal-700' : 'text-red-700'
              }`}>
                Gross Profit - Operating Expenses
              </p>
              {netMargin !== undefined && (
                <p className={`text-xs mt-1 ${
                  netIncome >= 0 ? 'text-teal-600' : 'text-red-600'
                }`}>
                  Margin: {netMargin.toFixed(1)}%
                </p>
              )}
            </div>
          </div>

          {/* Detailed Breakdown */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Detailed Breakdown
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Period: {formatDate(searchFromDate)} to {formatDate(searchToDate)}
              </p>
            </div>

            <div className="p-6">
              {/* Revenue Section */}
              <div className="mb-6">
                <div className="flex items-center mb-4">
                  <ArrowUpCircle className="h-5 w-5 text-green-600 mr-2" />
                  <h3 className="text-lg font-semibold text-gray-900">Revenue</h3>
                </div>
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700 font-medium">Total Revenue</span>
                    <span className="text-xl font-bold text-green-700">
                      {formatCurrency(totalRevenue)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expenses Section */}
              <div className="mb-6">
                <div className="flex items-center mb-4">
                  <ArrowDownCircle className="h-5 w-5 text-red-600 mr-2" />
                  <h3 className="text-lg font-semibold text-gray-900">Expenses</h3>
                </div>
                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700 font-medium">Total Expenses</span>
                    <span className="text-xl font-bold text-red-700">
                      {formatCurrency(totalRevenue - grossProfit)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Operating Income */}
              {operatingIncome !== undefined && (
                <div className="mb-6">
                  <div className="flex items-center mb-4">
                    <TrendingUp className="h-5 w-5 text-blue-600 mr-2" />
                    <h3 className="text-lg font-semibold text-gray-900">Operating Income</h3>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700 font-medium">Operating Income</span>
                      <span className={`text-xl font-bold ${
                        operatingIncome >= 0 ? 'text-blue-700' : 'text-red-700'
                      }`}>
                        {formatCurrency(operatingIncome)}
                      </span>
                    </div>
                    {operatingMargin !== undefined && (
                      <p className="text-sm text-blue-600 mt-2">
                        Operating Margin: {operatingMargin.toFixed(1)}%
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Net Income Summary */}
              <div className="bg-gray-50 rounded-lg p-6 border-2 border-gray-300">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Net Profit / Loss
                    </h3>
                    <p className="text-sm text-gray-600">
                      Your final profit or loss for this period
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-3xl font-bold ${
                      netIncome >= 0 ? 'text-teal-700' : 'text-red-700'
                    }`}>
                      {formatCurrency(netIncome)}
                    </p>
                    {netMargin !== undefined && (
                      <p className={`text-sm mt-1 ${
                        netIncome >= 0 ? 'text-teal-600' : 'text-red-600'
                      }`}>
                        Net Margin: {netMargin.toFixed(1)}%
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <FileText className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-blue-900 mb-1">
                  Understanding Your Profit & Loss Statement
                </h4>
                <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                  <li><strong>Total Revenue:</strong> All money received from sales</li>
                  <li><strong>Gross Profit:</strong> Revenue minus the cost of goods you sold</li>
                  <li><strong>Operating Income:</strong> Gross profit minus operating expenses</li>
                  <li><strong>Net Profit/Loss:</strong> Your final profit or loss after all expenses</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Initial State - No Data Shown */}
      {!showData && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Select Date Range and Click Search
          </h3>
          <p className="text-gray-600">
            Choose your date range above and click the Search button to view your Profit & Loss statement.
          </p>
        </div>
      )}

      {/* Summary Report Modal */}
      <PLSummaryReportModal
        isOpen={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        summaryData={summaryData}
        fromDate={searchFromDate}
        toDate={searchToDate}
      />
    </div>
  );
};

export default PLStatements;
