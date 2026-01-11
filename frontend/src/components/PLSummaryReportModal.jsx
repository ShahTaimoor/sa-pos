import React, { useState } from 'react';
import { X, TrendingUp, TrendingDown, DollarSign, FileText, Calendar, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

const PLSummaryReportModal = ({ isOpen, onClose, summaryData, fromDate, toDate }) => {
  const [expandedSection, setExpandedSection] = useState(null);
  
  if (!isOpen) return null;

  // Extract summary data - handle different response structures
  const summary = summaryData?.data || summaryData;
  
  // Extract values from summary
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
  
  // Calculate total expenses
  // Total expenses = Revenue - Net Income
  // This includes: COGS + Operating Expenses + Other Expenses + Taxes
  const totalExpenses = totalRevenue - netIncome;

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Format date with time
  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // Extract detailed data from summary
  const revenueDetails = summary?.revenue || summary?.statement?.revenue || {};
  const expenseDetails = summary?.operatingExpenses || summary?.statement?.operatingExpenses || {};
  const cogsDetails = summary?.costOfGoodsSold || summary?.statement?.costOfGoodsSold || {};
  
  // Get revenue breakdown
  const revenueBreakdown = {
    grossSales: revenueDetails?.grossSales?.amount || 0,
    salesReturns: revenueDetails?.salesReturns?.amount || 0,
    salesDiscounts: revenueDetails?.salesDiscounts?.amount || 0,
    otherRevenue: revenueDetails?.otherRevenue?.amount || 0,
    salesByCategory: revenueDetails?.grossSales?.details || [],
  };

  // Get expense breakdown
  const expenseBreakdown = {
    sellingExpenses: expenseDetails?.sellingExpenses?.total || 0,
    administrativeExpenses: expenseDetails?.administrativeExpenses?.total || 0,
    sellingDetails: expenseDetails?.sellingExpenses?.details || [],
    adminDetails: expenseDetails?.administrativeExpenses?.details || [],
  };

  // Get COGS breakdown
  const cogsBreakdown = {
    beginningInventory: cogsDetails?.beginningInventory || 0,
    purchases: cogsDetails?.purchases?.amount || 0,
    endingInventory: cogsDetails?.endingInventory || 0,
    totalCOGS: cogsDetails?.totalCOGS?.amount || 0,
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" 
          onClick={onClose}
          aria-hidden="true"
        ></div>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 border-b border-blue-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <FileText className="h-6 w-6 text-white mr-3" />
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Profit & Loss Summary Report
                  </h3>
                  <div className="flex items-center mt-1 text-blue-100 text-sm">
                    <Calendar className="h-4 w-4 mr-1" />
                    <span>
                      {formatDate(fromDate)} - {formatDate(toDate)}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:text-gray-200 transition-colors rounded-full p-1 hover:bg-blue-800"
                aria-label="Close modal"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Content - Scrollable */}
          <div className="bg-white px-6 py-6 max-h-[70vh] overflow-y-auto overscroll-contain">
            <div className="space-y-6 pb-4">
              {/* Total Revenue */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg border-2 border-green-300 shadow-sm overflow-hidden">
                <div 
                  className="p-6 cursor-pointer hover:bg-green-100 transition-colors"
                  onClick={() => toggleSection('revenue')}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center">
                      <div className="bg-green-500 rounded-full p-2 mr-3">
                        <DollarSign className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-green-800 uppercase tracking-wide">
                          Total Revenue
                        </h4>
                        <p className="text-xs text-green-600 mt-1">
                          All income from sales
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="h-6 w-6 text-green-600" />
                      {expandedSection === 'revenue' ? (
                        <ChevronUp className="h-5 w-5 text-green-600" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-green-600" />
                      )}
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-green-900 ml-12">
                    {formatCurrency(totalRevenue)}
                  </p>
                </div>
                
                {/* Expanded Revenue Details */}
                {expandedSection === 'revenue' && (
                  <div className="bg-white border-t border-green-200 p-4 space-y-4">
                    <div className="flex items-start space-x-2 mb-3">
                      <Info className="h-4 w-4 text-green-600 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-green-800">Data Source & Period</p>
                        <p className="text-xs text-gray-600">
                          Period: {formatDate(fromDate)} to {formatDate(toDate)}
                        </p>
                        <p className="text-xs text-gray-600">
                          Last Updated: {summary?.lastUpdated ? formatDateTime(summary.lastUpdated) : 'N/A'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-green-50 rounded p-3">
                        <p className="text-xs text-green-700 font-medium mb-1">Gross Sales</p>
                        <p className="text-lg font-bold text-green-900">{formatCurrency(revenueBreakdown.grossSales)}</p>
                      </div>
                      <div className="bg-red-50 rounded p-3">
                        <p className="text-xs text-red-700 font-medium mb-1">Sales Returns</p>
                        <p className="text-lg font-bold text-red-900">{formatCurrency(revenueBreakdown.salesReturns)}</p>
                      </div>
                      <div className="bg-yellow-50 rounded p-3">
                        <p className="text-xs text-yellow-700 font-medium mb-1">Sales Discounts</p>
                        <p className="text-lg font-bold text-yellow-900">{formatCurrency(revenueBreakdown.salesDiscounts)}</p>
                      </div>
                      <div className="bg-blue-50 rounded p-3">
                        <p className="text-xs text-blue-700 font-medium mb-1">Other Revenue</p>
                        <p className="text-lg font-bold text-blue-900">{formatCurrency(revenueBreakdown.otherRevenue)}</p>
                      </div>
                    </div>
                    
                    {revenueBreakdown.salesByCategory && revenueBreakdown.salesByCategory.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold text-gray-700 mb-2">Sales by Category</p>
                        <div className="space-y-2">
                          {revenueBreakdown.salesByCategory.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-gray-50 rounded p-2">
                              <span className="text-xs text-gray-700">{item.category || 'Other'}</span>
                              <span className="text-sm font-semibold text-gray-900">{formatCurrency(item.amount || 0)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-4 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600">
                        <strong>Calculation:</strong> Gross Sales - Sales Returns - Sales Discounts + Other Revenue = Total Revenue
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Total Expenses */}
              <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg border-2 border-red-300 shadow-sm overflow-hidden">
                <div 
                  className="p-6 cursor-pointer hover:bg-red-100 transition-colors"
                  onClick={() => toggleSection('expenses')}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center">
                      <div className="bg-red-500 rounded-full p-2 mr-3">
                        <TrendingDown className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-red-800 uppercase tracking-wide">
                          Total Expenses
                        </h4>
                        <p className="text-xs text-red-600 mt-1">
                          All operating and non-operating expenses
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <TrendingDown className="h-6 w-6 text-red-600" />
                      {expandedSection === 'expenses' ? (
                        <ChevronUp className="h-5 w-5 text-red-600" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-red-600" />
                      )}
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-red-900 ml-12">
                    {formatCurrency(totalExpenses)}
                  </p>
                </div>
                
                {/* Expanded Expense Details */}
                {expandedSection === 'expenses' && (
                  <div className="bg-white border-t border-red-200 p-4 space-y-4">
                    <div className="flex items-start space-x-2 mb-3">
                      <Info className="h-4 w-4 text-red-600 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-red-800">Data Source & Period</p>
                        <p className="text-xs text-gray-600">
                          Period: {formatDate(fromDate)} to {formatDate(toDate)}
                        </p>
                        <p className="text-xs text-gray-600">
                          Last Updated: {summary?.lastUpdated ? formatDateTime(summary.lastUpdated) : 'N/A'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-orange-50 rounded p-3">
                        <p className="text-xs text-orange-700 font-medium mb-1">Selling Expenses</p>
                        <p className="text-lg font-bold text-orange-900">{formatCurrency(expenseBreakdown.sellingExpenses)}</p>
                      </div>
                      <div className="bg-purple-50 rounded p-3">
                        <p className="text-xs text-purple-700 font-medium mb-1">Administrative Expenses</p>
                        <p className="text-lg font-bold text-purple-900">{formatCurrency(expenseBreakdown.administrativeExpenses)}</p>
                      </div>
                      <div className="bg-gray-50 rounded p-3">
                        <p className="text-xs text-gray-700 font-medium mb-1">COGS</p>
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(cogsBreakdown.totalCOGS)}</p>
                      </div>
                      <div className="bg-pink-50 rounded p-3">
                        <p className="text-xs text-pink-700 font-medium mb-1">Other Expenses</p>
                        <p className="text-lg font-bold text-pink-900">
                          {formatCurrency(totalExpenses - expenseBreakdown.sellingExpenses - expenseBreakdown.administrativeExpenses - cogsBreakdown.totalCOGS)}
                        </p>
                      </div>
                    </div>
                    
                    {expenseBreakdown.sellingDetails && expenseBreakdown.sellingDetails.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold text-gray-700 mb-2">Selling Expenses Breakdown</p>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {expenseBreakdown.sellingDetails.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-gray-50 rounded p-2">
                              <span className="text-xs text-gray-700">{item.category || item.description || 'Other'}</span>
                              <span className="text-sm font-semibold text-gray-900">{formatCurrency(item.amount || 0)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {expenseBreakdown.adminDetails && expenseBreakdown.adminDetails.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold text-gray-700 mb-2">Administrative Expenses Breakdown</p>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {expenseBreakdown.adminDetails.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-gray-50 rounded p-2">
                              <span className="text-xs text-gray-700">{item.category || item.description || 'Other'}</span>
                              <span className="text-sm font-semibold text-gray-900">{formatCurrency(item.amount || 0)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-4 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600">
                        <strong>Calculation:</strong> COGS + Selling Expenses + Administrative Expenses + Other Expenses = Total Expenses
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Operating Income */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border-2 border-blue-300 shadow-sm overflow-hidden">
                <div 
                  className="p-6 cursor-pointer hover:bg-blue-100 transition-colors"
                  onClick={() => toggleSection('operating')}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center">
                      <div className="bg-blue-500 rounded-full p-2 mr-3">
                        <TrendingUp className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-blue-800 uppercase tracking-wide">
                          Operating Income
                        </h4>
                        <p className="text-xs text-blue-600 mt-1">
                          Revenue minus operating expenses
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="h-6 w-6 text-blue-600" />
                      {expandedSection === 'operating' ? (
                        <ChevronUp className="h-5 w-5 text-blue-600" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-blue-600" />
                      )}
                    </div>
                  </div>
                  <p className={`text-3xl font-bold ml-12 ${
                    operatingIncome >= 0 ? 'text-blue-900' : 'text-red-600'
                  }`}>
                    {formatCurrency(operatingIncome)}
                  </p>
                </div>
                
                {/* Expanded Operating Income Details */}
                {expandedSection === 'operating' && (
                  <div className="bg-white border-t border-blue-200 p-4 space-y-4">
                    <div className="flex items-start space-x-2 mb-3">
                      <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-blue-800">Data Source & Period</p>
                        <p className="text-xs text-gray-600">
                          Period: {formatDate(fromDate)} to {formatDate(toDate)}
                        </p>
                        <p className="text-xs text-gray-600">
                          Last Updated: {summary?.lastUpdated ? formatDateTime(summary.lastUpdated) : 'N/A'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="bg-green-50 rounded p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-green-700 font-medium">Total Revenue</span>
                          <span className="text-lg font-bold text-green-900">{formatCurrency(totalRevenue)}</span>
                        </div>
                      </div>
                      <div className="text-center text-gray-400">-</div>
                      <div className="bg-red-50 rounded p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-red-700 font-medium">COGS</span>
                          <span className="text-lg font-bold text-red-900">{formatCurrency(cogsBreakdown.totalCOGS)}</span>
                        </div>
                      </div>
                      <div className="text-center text-gray-400">=</div>
                      <div className="bg-blue-50 rounded p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-blue-700 font-medium">Gross Profit</span>
                          <span className="text-lg font-bold text-blue-900">{formatCurrency(grossProfit)}</span>
                        </div>
                      </div>
                      <div className="text-center text-gray-400">-</div>
                      <div className="bg-orange-50 rounded p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-orange-700 font-medium">Operating Expenses</span>
                          <span className="text-lg font-bold text-orange-900">
                            {formatCurrency(expenseBreakdown.sellingExpenses + expenseBreakdown.administrativeExpenses)}
                          </span>
                        </div>
                      </div>
                      <div className="text-center text-gray-400">=</div>
                      <div className={`rounded p-3 ${operatingIncome >= 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
                        <div className="flex justify-between items-center">
                          <span className={`text-xs font-medium ${operatingIncome >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                            Operating Income
                          </span>
                          <span className={`text-lg font-bold ${operatingIncome >= 0 ? 'text-blue-900' : 'text-red-900'}`}>
                            {formatCurrency(operatingIncome)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {summary?.operatingIncome?.margin !== undefined && (
                      <div className="mt-4 pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-600">
                          <strong>Operating Margin:</strong> {summary.operatingIncome.margin.toFixed(2)}%
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Net Profit / Loss */}
              <div className={`bg-gradient-to-br rounded-lg border-2 shadow-sm overflow-hidden ${
                netIncome >= 0 
                  ? 'from-teal-50 to-teal-100 border-teal-300' 
                  : 'from-red-50 to-red-100 border-red-300'
              }`}>
                <div 
                  className={`p-6 cursor-pointer transition-colors ${
                    netIncome >= 0 ? 'hover:bg-teal-100' : 'hover:bg-red-100'
                  }`}
                  onClick={() => toggleSection('netIncome')}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center">
                      <div className={`rounded-full p-2 mr-3 ${
                        netIncome >= 0 ? 'bg-teal-500' : 'bg-red-500'
                      }`}>
                        {netIncome >= 0 ? (
                          <TrendingUp className="h-5 w-5 text-white" />
                        ) : (
                          <TrendingDown className="h-5 w-5 text-white" />
                        )}
                      </div>
                      <div>
                        <h4 className={`text-sm font-semibold uppercase tracking-wide ${
                          netIncome >= 0 ? 'text-teal-800' : 'text-red-800'
                        }`}>
                          Net Profit / Loss
                        </h4>
                        <p className={`text-xs mt-1 ${
                          netIncome >= 0 ? 'text-teal-600' : 'text-red-600'
                        }`}>
                          Final profit or loss after all expenses
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {netIncome >= 0 ? (
                        <TrendingUp className="h-6 w-6 text-teal-600" />
                      ) : (
                        <TrendingDown className="h-6 w-6 text-red-600" />
                      )}
                      {expandedSection === 'netIncome' ? (
                        <ChevronUp className={`h-5 w-5 ${netIncome >= 0 ? 'text-teal-600' : 'text-red-600'}`} />
                      ) : (
                        <ChevronDown className={`h-5 w-5 ${netIncome >= 0 ? 'text-teal-600' : 'text-red-600'}`} />
                      )}
                    </div>
                  </div>
                  <p className={`text-3xl font-bold ml-12 ${
                    netIncome >= 0 ? 'text-teal-900' : 'text-red-900'
                  }`}>
                    {formatCurrency(netIncome)}
                  </p>
                  {summary?.netIncome?.margin !== undefined && (
                    <p className={`text-sm mt-2 ml-12 ${
                      netIncome >= 0 ? 'text-teal-600' : 'text-red-600'
                    }`}>
                      Net Margin: {summary.netIncome.margin.toFixed(1)}%
                    </p>
                  )}
                </div>
                
                {/* Expanded Net Income Details */}
                {expandedSection === 'netIncome' && (
                  <div className={`bg-white border-t p-4 space-y-4 ${
                    netIncome >= 0 ? 'border-teal-200' : 'border-red-200'
                  }`}>
                    <div className="flex items-start space-x-2 mb-3">
                      <Info className={`h-4 w-4 mt-0.5 ${netIncome >= 0 ? 'text-teal-600' : 'text-red-600'}`} />
                      <div>
                        <p className={`text-xs font-semibold ${netIncome >= 0 ? 'text-teal-800' : 'text-red-800'}`}>
                          Data Source & Period
                        </p>
                        <p className="text-xs text-gray-600">
                          Period: {formatDate(fromDate)} to {formatDate(toDate)}
                        </p>
                        <p className="text-xs text-gray-600">
                          Last Updated: {summary?.lastUpdated ? formatDateTime(summary.lastUpdated) : 'N/A'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="bg-blue-50 rounded p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-blue-700 font-medium">Operating Income</span>
                          <span className="text-lg font-bold text-blue-900">{formatCurrency(operatingIncome)}</span>
                        </div>
                      </div>
                      <div className="text-center text-gray-400">+</div>
                      <div className="bg-green-50 rounded p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-green-700 font-medium">Other Income</span>
                          <span className="text-lg font-bold text-green-900">
                            {formatCurrency((summary?.otherIncome?.interestIncome || 0) + (summary?.otherIncome?.rentalIncome || 0) + (summary?.otherIncome?.other?.amount || 0))}
                          </span>
                        </div>
                      </div>
                      <div className="text-center text-gray-400">-</div>
                      <div className="bg-red-50 rounded p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-red-700 font-medium">Other Expenses & Taxes</span>
                          <span className="text-lg font-bold text-red-900">
                            {formatCurrency(totalExpenses - expenseBreakdown.sellingExpenses - expenseBreakdown.administrativeExpenses - cogsBreakdown.totalCOGS)}
                          </span>
                        </div>
                      </div>
                      <div className="text-center text-gray-400">=</div>
                      <div className={`rounded p-3 ${netIncome >= 0 ? 'bg-teal-50' : 'bg-red-50'}`}>
                        <div className="flex justify-between items-center">
                          <span className={`text-xs font-medium ${netIncome >= 0 ? 'text-teal-700' : 'text-red-700'}`}>
                            Net Profit / Loss
                          </span>
                          <span className={`text-lg font-bold ${netIncome >= 0 ? 'text-teal-900' : 'text-red-900'}`}>
                            {formatCurrency(netIncome)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {summary?.netIncome?.margin !== undefined && (
                      <div className="mt-4 pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-600">
                          <strong>Net Margin:</strong> {summary.netIncome.margin.toFixed(2)}%
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Net Margin = (Net Income / Total Revenue) × 100
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Summary Section */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 mt-6">
                <h5 className="text-sm font-semibold text-gray-900 mb-3">Summary</h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Revenue:</span>
                    <span className="font-medium text-gray-900">{formatCurrency(totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Expenses:</span>
                    <span className="font-medium text-red-700">{formatCurrency(totalExpenses)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Operating Income:</span>
                    <span className={`font-medium ${
                      operatingIncome >= 0 ? 'text-blue-700' : 'text-red-700'
                    }`}>
                      {formatCurrency(operatingIncome)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-300">
                    <span className="text-gray-900 font-semibold">Net Profit / Loss:</span>
                    <span className={`font-bold text-lg ${
                      netIncome >= 0 ? 'text-teal-700' : 'text-red-700'
                    }`}>
                      {formatCurrency(netIncome)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end">
            <button
              onClick={onClose}
              className="btn btn-primary px-6 py-2"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PLSummaryReportModal;
