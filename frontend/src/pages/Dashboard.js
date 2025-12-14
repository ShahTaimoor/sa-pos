import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { 
  ShoppingCart, 
  Users, 
  Package, 
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Bell,
  BarChart3,
  FileText,
  CreditCard,
  Building,
  Wallet,
  Receipt,
  Minus,
  Calendar,
  Search,
  ShoppingBag,
  Banknote,
  ArrowDownCircle,
  ArrowUpCircle,
  Truck,
  Tag
} from 'lucide-react';
import { 
  salesAPI, 
  productsAPI, 
  customersAPI, 
  inventoryAPI, 
  salesOrdersAPI, 
  purchaseOrdersAPI,
  purchaseInvoicesAPI,
  cashReceiptsAPI, 
  cashPaymentsAPI, 
  bankReceiptsAPI, 
  bankPaymentsAPI,
  recurringExpensesAPI
} from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { LoadingSpinner, LoadingButton, LoadingCard, LoadingGrid, LoadingPage, LoadingInline } from '../components/LoadingSpinner';
import PeriodComparisonSection from '../components/PeriodComparisonSection';
import PeriodComparisonCard from '../components/PeriodComparisonCard';
import ComparisonChart from '../components/ComparisonChart';
import { usePeriodComparison } from '../hooks/usePeriodComparison';

const StatCard = ({ title, value, icon: Icon, color, change, changeType }) => (
  <div className="card h-full">
    <div className="card-content h-full">
      <div className="text-center flex flex-col justify-center items-center h-full">
        <div className="flex justify-center mb-3">
          <div className={`p-3 rounded-full ${color}`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
        <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
        <p className="text-2xl font-semibold text-gray-900 mb-1">{value}</p>
        <div className="h-5 flex items-center">
          {change && (
            <p className={`text-sm ${changeType === 'positive' ? 'text-success-600' : 'text-danger-600'}`}>
              {changeType === 'positive' ? '+' : ''}{change}
            </p>
          )}
        </div>
      </div>
    </div>
  </div>
);

export const Dashboard = () => {
  const navigate = useNavigate();
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeFromDate, setActiveFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeToDate, setActiveToDate] = useState(new Date().toISOString().split('T')[0]);

  // Handle search button click
  const handleSearch = () => {
    setActiveFromDate(fromDate);
    setActiveToDate(toDate);
  };

  const { data: todaySummary, isLoading: summaryLoading } = useQuery(
    'todaySummary',
    salesAPI.getTodaySummary,
    {
      refetchInterval: 30000, // Refetch every 30 seconds
    }
  );

  const { data: lowStockData, isLoading: lowStockLoading } = useQuery(
    'lowStock',
    inventoryAPI.getLowStock
  );

  const { data: inventoryData, isLoading: inventoryLoading } = useQuery(
    'inventorySummary',
    inventoryAPI.getInventory
  );

  const { data: customersData, isLoading: customersLoading } = useQuery(
    'activeCustomers',
    () => customersAPI.getCustomers({ status: 'active' })
  );

  // Pending Sales Orders data (draft status only)
  const { data: pendingSalesOrdersData, isLoading: pendingSalesOrdersLoading } = useQuery(
    'pendingSalesOrders',
    () => salesOrdersAPI.getSalesOrders({ status: 'draft' })
  );

  // All Sales Orders data (for total value calculation)
  const { data: salesOrdersData, isLoading: salesOrdersLoading } = useQuery(
    ['salesOrdersFiltered', activeFromDate, activeToDate],
    () => salesOrdersAPI.getSalesOrders({ dateFrom: activeFromDate, dateTo: activeToDate }),
    { staleTime: 0 }
  );

  // Pending Purchase Orders data (draft status only)
  const { data: pendingPurchaseOrdersData, isLoading: pendingPurchaseOrdersLoading } = useQuery(
    'pendingPurchaseOrders',
    () => purchaseOrdersAPI.getPurchaseOrders({ status: 'draft' })
  );

  // All Purchase Orders data (for total value calculation)
  const { data: purchaseOrdersData, isLoading: purchaseOrdersLoading } = useQuery(
    ['purchaseOrdersFiltered', activeFromDate, activeToDate],
    () => purchaseOrdersAPI.getPurchaseOrders({ dateFrom: activeFromDate, dateTo: activeToDate }),
    { staleTime: 0 }
  );

  // Sales Invoices (from Sales page) - actual completed sales
  const { data: salesInvoicesData, isLoading: salesInvoicesLoading } = useQuery(
    ['salesInvoicesFiltered', activeFromDate, activeToDate],
    () => salesAPI.getOrders({ dateFrom: activeFromDate, dateTo: activeToDate }),
    { staleTime: 0 }
  );

  // Purchase Invoices (from Purchase page) - actual purchases
  const { data: purchaseInvoicesData, isLoading: purchaseInvoicesLoading } = useQuery(
    ['purchaseInvoicesFiltered', activeFromDate, activeToDate],
    () => purchaseInvoicesAPI.getPurchaseInvoices({ dateFrom: activeFromDate, dateTo: activeToDate }),
    { staleTime: 0 }
  );

  // Cash Receipts data
  const { data: cashReceiptsData, isLoading: cashReceiptsLoading } = useQuery(
    ['cashReceiptsFiltered', activeFromDate, activeToDate],
    () => cashReceiptsAPI.getCashReceipts({ dateFrom: activeFromDate, dateTo: activeToDate }),
    { staleTime: 0 }
  );

  // Cash Payments data
  const { data: cashPaymentsData, isLoading: cashPaymentsLoading } = useQuery(
    ['cashPaymentsFiltered', activeFromDate, activeToDate],
    () => cashPaymentsAPI.getCashPayments({ dateFrom: activeFromDate, dateTo: activeToDate }),
    { staleTime: 0 }
  );

  // Bank Receipts data
  const { data: bankReceiptsData, isLoading: bankReceiptsLoading } = useQuery(
    ['bankReceiptsFiltered', activeFromDate, activeToDate],
    () => bankReceiptsAPI.getBankReceipts({ dateFrom: activeFromDate, dateTo: activeToDate }),
    { staleTime: 0 }
  );

  // Bank Payments data
  const { data: bankPaymentsData, isLoading: bankPaymentsLoading } = useQuery(
    ['bankPaymentsFiltered', activeFromDate, activeToDate],
    () => bankPaymentsAPI.getBankPayments({ dateFrom: activeFromDate, dateTo: activeToDate }),
    { staleTime: 0 }
  );

  const { data: recurringExpensesData, isLoading: recurringExpensesLoading } = useQuery(
    ['dashboardRecurringExpenses'],
    () => recurringExpensesAPI.getUpcoming({ days: 14 }),
    { refetchInterval: 60_000 }
  );

  if (summaryLoading || lowStockLoading || inventoryLoading || customersLoading || 
      salesOrdersLoading || pendingSalesOrdersLoading || purchaseOrdersLoading || pendingPurchaseOrdersLoading || 
      salesInvoicesLoading || purchaseInvoicesLoading || cashReceiptsLoading || 
      cashPaymentsLoading || bankReceiptsLoading || bankPaymentsLoading || recurringExpensesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const summary = todaySummary?.data?.summary || {};
  const lowStockCount = lowStockData?.data?.products?.length || 0;
  const inventorySummary = inventoryData?.data?.summary || {};
  
  const activeCustomersCount = customersData?.data?.customers?.length || 0;
  
  // Extract counts from API responses
  console.log('Pending Sales Orders Data:', pendingSalesOrdersData);
  const pendingSalesOrdersCount = pendingSalesOrdersData?.data?.salesOrders?.length || pendingSalesOrdersData?.salesOrders?.length || 0;
  const pendingPurchaseOrdersCount = pendingPurchaseOrdersData?.data?.purchaseOrders?.length || pendingPurchaseOrdersData?.purchaseOrders?.length || 0;
  const cashReceiptsCount = cashReceiptsData?.data?.cashReceipts?.length || 0;
  const cashPaymentsCount = cashPaymentsData?.data?.cashPayments?.length || 0;
  const bankReceiptsCount = bankReceiptsData?.data?.bankReceipts?.length || 0;
  const bankPaymentsCount = bankPaymentsData?.data?.bankPayments?.length || 0;

  const upcomingRecurringExpenses = recurringExpensesData?.data || recurringExpensesData?.expenses || [];

  const calculateDaysUntilDue = (dateString) => {
    if (!dateString) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateString);
    due.setHours(0, 0, 0, 0);
    const diff = due.getTime() - today.getTime();
    return Math.round(diff / (1000 * 60 * 60 * 24));
  };

  const getRecurringPayeeName = (expense) => {
    if (expense?.supplier) {
      return (
        expense.supplier.displayName ||
        expense.supplier.companyName ||
        expense.supplier.businessName ||
        expense.supplier.name
      );
    }
    if (expense?.customer) {
      return (
        expense.customer.displayName ||
        expense.customer.businessName ||
        expense.customer.name ||
        [expense.customer.firstName, expense.customer.lastName].filter(Boolean).join(' ')
      );
    }
    return 'General Expense';
  };
  
  // Calculate totals for financial metrics
  const salesOrdersTotal = salesOrdersData?.data?.salesOrders?.reduce((sum, order) => sum + (order.pricing?.total || 0), 0) || 0;
  const purchaseOrdersTotal = purchaseOrdersData?.data?.purchaseOrders?.reduce((sum, order) => sum + (order.pricing?.total || 0), 0) || 0;
  
  // Sales Invoices (from Sales/POS page)
  const salesInvoicesTotal = salesInvoicesData?.data?.orders?.reduce((sum, order) => sum + (order.pricing?.total || 0), 0) || 
                              salesInvoicesData?.orders?.reduce((sum, order) => sum + (order.pricing?.total || 0), 0) || 0;
  
  // Purchase Invoices (from Purchase page)
  const purchaseInvoicesTotal = purchaseInvoicesData?.data?.invoices?.reduce((sum, invoice) => sum + (invoice.pricing?.total || 0), 0) || 
                                 purchaseInvoicesData?.invoices?.reduce((sum, invoice) => sum + (invoice.pricing?.total || 0), 0) || 0;
  
  const cashReceiptsTotal = cashReceiptsData?.data?.cashReceipts?.reduce((sum, receipt) => sum + (receipt.amount || 0), 0) || 0;
  const cashPaymentsTotal = cashPaymentsData?.data?.cashPayments?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;
  const bankReceiptsTotal = bankReceiptsData?.data?.bankReceipts?.reduce((sum, receipt) => sum + (receipt.amount || 0), 0) || 0;
  const bankPaymentsTotal = bankPaymentsData?.data?.bankPayments?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;
  
  // Calculate total sales (Sales Orders + Sales Invoices)
  const totalSales = salesOrdersTotal + salesInvoicesTotal;
  console.log('Dashboard Sales - SO:', salesOrdersTotal, 'SI:', salesInvoicesTotal, 'Total:', totalSales);
  
  // Calculate total purchases (Purchase Orders + Purchase Invoices) - COGS
  const totalPurchases = purchaseOrdersTotal + purchaseInvoicesTotal;
  console.log('Dashboard Purchases - PO:', purchaseOrdersTotal, 'PI:', purchaseInvoicesTotal, 'Total:', totalPurchases);
  
  // Calculate total discounts from sales orders and sales invoices
  const salesOrdersDiscounts = salesOrdersData?.data?.salesOrders?.reduce((sum, order) => sum + (order.pricing?.discountAmount || 0), 0) || 0;
  const salesInvoicesDiscounts = salesInvoicesData?.data?.orders?.reduce((sum, order) => sum + (order.discountAmount || 0), 0) || 
                                  salesInvoicesData?.orders?.reduce((sum, order) => sum + (order.discountAmount || 0), 0) || 0;
  const totalDiscounts = salesOrdersDiscounts + salesInvoicesDiscounts;
  
  // Separate Cash/Bank Payments into Supplier Payments vs Operating Expenses
  // Note: This is a simplification - ideally we'd tag each payment as "supplier" or "expense"
  // For now, we'll show total payments but label them correctly
  const totalCashPayments = cashPaymentsTotal;
  const totalBankPayments = bankPaymentsTotal;
  const totalPayments = totalCashPayments + totalBankPayments; // Includes both supplier payments and expenses
  
  // Cash Flow Calculations
  const totalCashReceipts = cashReceiptsTotal;
  const totalBankReceipts = bankReceiptsTotal;
  const totalReceipts = totalCashReceipts + totalBankReceipts;
  const netCashFlow = totalReceipts - totalPayments;
  
  // Financial Performance Calculations
  const grossRevenue = totalSales; // Total sales before discounts
  const netRevenue = totalSales - totalDiscounts; // Sales after discounts
  const costOfGoodsSold = totalPurchases; // COGS
  const grossProfit = netRevenue - costOfGoodsSold; // Gross Profit
  
  // Note: For accurate net profit, we'd need operating expenses separate from supplier payments
  // This is a simplified calculation
  const operatingExpenses = 0; // TODO: Add when expense tracking is implemented
  const netProfit = grossProfit - operatingExpenses;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome back! Here's what's happening today.</p>
      </div>

      {upcomingRecurringExpenses.length > 0 && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-gray-900 flex items-center space-x-2">
                <Bell className="h-5 w-5 text-primary-600" />
                <span>Upcoming Monthly Obligations</span>
              </h2>
              <p className="text-sm text-gray-600">
                Stay ahead of salaries, rent, and other committed expenses.
              </p>
            </div>
          </div>
          <div className="card-content">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {upcomingRecurringExpenses.slice(0, 4).map((expense) => {
                const daysLeft = calculateDaysUntilDue(expense.nextDueDate);
                const isOverdue = typeof daysLeft === 'number' && daysLeft < 0;
                return (
                  <div
                    key={expense._id}
                    className={`border rounded-lg p-4 shadow-sm ${
                      isOverdue ? 'border-danger-200 bg-danger-50/60' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {expense.defaultPaymentType === 'bank' ? 'Bank Payment' : 'Cash Payment'}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">{expense.name}</h3>
                    <p className="text-sm text-gray-600">{getRecurringPayeeName(expense)}</p>
                    <p className="text-lg font-bold text-gray-900 mt-2">
                      {formatCurrency(expense.amount)}
                    </p>
                    <div className="mt-2 text-sm text-gray-600 flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span>Due {formatDate(expense.nextDueDate)}</span>
                    </div>
                    <div className="mt-2">
                      <span
                        className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${
                          isOverdue
                            ? 'bg-danger-100 text-danger-700'
                            : 'bg-primary-100 text-primary-700'
                        }`}
                      >
                        {isOverdue ? `${Math.abs(daysLeft)} day(s) overdue` : `${daysLeft} day(s) left`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {upcomingRecurringExpenses.length > 4 && (
              <p className="text-xs text-gray-500 mt-3">
                Showing first 4 reminders. Review all recurring expenses from the Cash Payments page.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Financial Dashboard */}
      <div className="card">
        <div className="card-header">
          <div className="flex flex-col items-center space-y-4">
            <h2 className="text-lg font-medium text-gray-900">Financial Overview</h2>
            <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-6">
              <div className="flex items-center space-x-3">
                <Calendar className="h-4 w-4 text-gray-500" />
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-600">From:</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="input text-sm w-40"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-600">To:</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="input text-sm w-40"
                  />
                </div>
              </div>
              <button 
                onClick={handleSearch}
                className="btn btn-primary flex items-center space-x-2 px-4 py-2"
              >
                <Search className="h-4 w-4" />
                <span>Search</span>
              </button>
            </div>
          </div>
        </div>
        <div className="card-content space-y-6">
          
          {/* REVENUE, COST & DISCOUNT SECTION */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Revenue, Cost & Discounts</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 lg:grid-cols-5">
            
            {/* Sales */}
            <div className="text-center p-4 border-2 border-green-300 bg-green-50 rounded-lg">
              <div className="flex justify-center mb-2">
                <div className="p-3 bg-green-500 rounded-full">
                  <CreditCard className="h-6 w-6 text-white" />
                </div>
              </div>
              <p className="text-sm font-medium text-green-700 mb-1">Sales (Revenue)</p>
              <p className="text-xl font-bold text-green-800">${Math.round(totalSales).toLocaleString()}</p>
              <p className="text-xs text-green-600 mt-1">SO: ${Math.round(salesOrdersTotal)} | SI: ${Math.round(salesInvoicesTotal)}</p>
            </div>

            {/* Purchase (COGS) */}
            <div className="text-center p-4 border-2 border-purple-300 bg-purple-50 rounded-lg">
              <div className="flex justify-center mb-2">
                <div className="p-3 bg-purple-500 rounded-full">
                  <Truck className="h-6 w-6 text-white" />
                </div>
              </div>
              <p className="text-sm font-medium text-purple-700 mb-1">Purchase (COGS)</p>
              <p className="text-xl font-bold text-purple-800">${Math.round(totalPurchases).toLocaleString()}</p>
              <p className="text-xs text-purple-600 mt-1">PO: ${Math.round(purchaseOrdersTotal)} | PI: ${Math.round(purchaseInvoicesTotal)}</p>
            </div>

            {/* Discount */}
            <div className="text-center p-4 border-2 border-red-300 bg-red-50 rounded-lg">
              <div className="flex justify-center mb-2">
                <div className="p-3 bg-red-500 rounded-full">
                  <Tag className="h-6 w-6 text-white" />
                </div>
              </div>
              <p className="text-sm font-medium text-red-700 mb-1">Discount Given</p>
              <p className="text-xl font-bold text-red-800">${Math.round(totalDiscounts).toLocaleString()}</p>
            </div>

             {/* Pending Sales Orders */}
             <div 
               className="text-center p-4 border-2 border-cyan-300 bg-cyan-50 rounded-lg cursor-pointer hover:bg-cyan-100 hover:border-cyan-400 transition-colors"
               onClick={() => navigate('/sales-orders')}
             >
               <div className="flex justify-center mb-2">
                 <div className="p-3 bg-cyan-500 rounded-full">
                   <FileText className="h-6 w-6 text-white" />
                 </div>
               </div>
               <p className="text-sm font-medium text-cyan-700 mb-1">Pending Sales Orders</p>
               <p className="text-xl font-bold text-cyan-800">{pendingSalesOrdersCount}</p>
             </div>
 
             {/* Pending Purchase Orders */}
             <div 
               className="text-center p-4 border-2 border-indigo-300 bg-indigo-50 rounded-lg cursor-pointer hover:bg-indigo-100 hover:border-indigo-400 transition-colors"
               onClick={() => navigate('/purchase-orders')}
             >
               <div className="flex justify-center mb-2">
                 <div className="p-3 bg-indigo-500 rounded-full">
                   <Receipt className="h-6 w-6 text-white" />
                 </div>
               </div>
               <p className="text-sm font-medium text-indigo-700 mb-1">Pending Purchase Orders</p>
               <p className="text-xl font-bold text-indigo-800">{pendingPurchaseOrdersCount}</p>
             </div>
            </div>
          </div>
          
          {/* PROFITABILITY & CASH FLOW SECTION */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Profitability & Cash Flow</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            
            {/* Gross Profit */}
            <div className="text-center p-4 border-2 border-blue-300 bg-blue-50 rounded-lg">
              <div className="flex justify-center mb-2">
                <div className="p-3 bg-blue-500 rounded-full">
                  <BarChart3 className="h-6 w-6 text-white" />
                </div>
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">Gross Profit</p>
              <p className={`text-xl font-bold ${grossProfit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                ${Math.round(grossProfit).toLocaleString()}
              </p>
              <p className="text-xs text-gray-600 mt-1">Revenue - COGS</p>
            </div>
            
            {/* Total Receipts */}
            <div className="text-center p-4 border-2 border-emerald-300 bg-emerald-50 rounded-lg">
              <div className="flex justify-center mb-2">
                <div className="p-3 bg-emerald-500 rounded-full">
                  <Receipt className="h-6 w-6 text-white" />
                </div>
              </div>
              <p className="text-sm font-medium text-emerald-700 mb-1">Total Receipts</p>
              <p className="text-xl font-bold text-emerald-800">${Math.round(totalReceipts).toLocaleString()}</p>
              <p className="text-xs text-emerald-600 mt-1">Cash: ${Math.round(totalCashReceipts)} | Bank: ${Math.round(totalBankReceipts)}</p>
            </div>
            
            {/* Total Payments */}
            <div className="text-center p-4 border-2 border-orange-300 bg-orange-50 rounded-lg">
              <div className="flex justify-center mb-2">
                <div className="p-3 bg-orange-500 rounded-full">
                  <Banknote className="h-6 w-6 text-white" />
                </div>
              </div>
              <p className="text-sm font-medium text-orange-700 mb-1">Total Payments</p>
              <p className="text-xl font-bold text-orange-800">${Math.round(totalPayments).toLocaleString()}</p>
              <p className="text-xs text-orange-600 mt-1">Cash: ${Math.round(totalCashPayments)} | Bank: ${Math.round(totalBankPayments)}</p>
            </div>
            
            {/* Net Cash Flow */}
            <div className={`text-center p-4 border-2 rounded-lg ${netCashFlow >= 0 ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
              <div className="flex justify-center mb-2">
                <div className={`p-3 rounded-full ${netCashFlow >= 0 ? 'bg-green-500' : 'bg-red-500'}`}>
                  <Wallet className="h-6 w-6 text-white" />
                </div>
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">Net Cash Flow</p>
              <p className={`text-xl font-bold ${netCashFlow >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                ${Math.round(netCashFlow).toLocaleString()}
              </p>
              <p className="text-xs text-gray-600 mt-1">Receipts - Payments</p>
            </div>
            
            {/* Total Orders */}
            <div className="text-center p-4 border-2 border-yellow-300 bg-yellow-50 rounded-lg">
              <div className="flex justify-center mb-2">
                <div className="p-3 bg-yellow-500 rounded-full">
                  <ShoppingCart className="h-6 w-6 text-white" />
                </div>
              </div>
              <p className="text-sm font-medium text-yellow-700 mb-1">Total Transactions</p>
              <p className="text-xl font-bold text-yellow-800">{summary.totalOrders || 0}</p>
            </div>
            
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid - Single Row */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-7">
        <StatCard
          title="Today's Revenue"
          value={`$${summary.totalRevenue?.toFixed(2) || '0.00'}`}
          icon={DollarSign}
          color="bg-success-500"
          change="12%"
          changeType="positive"
        />
        <StatCard
          title="Orders Today"
          value={summary.totalOrders || 0}
          icon={ShoppingCart}
          color="bg-primary-500"
          change="8%"
          changeType="positive"
        />
        <StatCard
          title="Total Products"
          value={inventorySummary.totalProducts || 0}
          icon={Package}
          color="bg-warning-500"
        />
        <StatCard
          title="Active Customers"
          value={activeCustomersCount.toLocaleString()}
          icon={Users}
          color="bg-purple-500"
          change="5%"
          changeType="positive"
        />
        <StatCard
          title="Items Sold Today"
          value={summary.totalItems || 0}
          icon={TrendingUp}
          color="bg-blue-500"
        />
        <StatCard
          title="Average Order Value"
          value={`$${summary.averageOrderValue?.toFixed(2) || '0.00'}`}
          icon={BarChart3}
          color="bg-indigo-500"
        />
        <StatCard
          title="Low Stock Items"
          value={lowStockCount}
          icon={AlertTriangle}
          color="bg-danger-500"
        />
      </div>

      {/* Period Comparison Section */}
      <PeriodComparisonSection
        title="Sales Performance Comparison"
        metrics={[
          {
            title: 'Total Revenue',
            fetchFunction: (params) => salesAPI.getPeriodSummary(params).then(res => ({
              data: res.data?.data?.totalRevenue || 0
            })),
            format: 'currency',
            icon: DollarSign,
            iconColor: 'bg-green-500'
          },
          {
            title: 'Total Orders',
            fetchFunction: (params) => salesAPI.getPeriodSummary(params).then(res => ({
              data: res.data?.data?.totalOrders || 0
            })),
            format: 'number',
            icon: ShoppingCart,
            iconColor: 'bg-blue-500'
          },
          {
            title: 'Average Order Value',
            fetchFunction: (params) => salesAPI.getPeriodSummary(params).then(res => ({
              data: res.data?.data?.averageOrderValue || 0
            })),
            format: 'currency',
            icon: TrendingUp,
            iconColor: 'bg-purple-500'
          },
          {
            title: 'Total Items Sold',
            fetchFunction: (params) => salesAPI.getPeriodSummary(params).then(res => ({
              data: res.data?.data?.totalItems || 0
            })),
            format: 'number',
            icon: Package,
            iconColor: 'bg-orange-500'
          }
        ]}
        fetchFunction={(params) => salesAPI.getPeriodSummary(params)}
      />

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Orders */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">Today's Orders</h3>
          </div>
          <div className="card-content">
            {summary.orderTypes ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Retail Orders</span>
                  <span className="font-medium">{summary.orderTypes.retail || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Wholesale Orders</span>
                  <span className="font-medium">{summary.orderTypes.wholesale || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Returns</span>
                  <span className="font-medium">{summary.orderTypes.return || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Exchanges</span>
                  <span className="font-medium">{summary.orderTypes.exchange || 0}</span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">No orders today</p>
            )}
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">Low Stock Alert</h3>
          </div>
          <div className="card-content">
            {lowStockCount > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  {lowStockCount} products are running low on stock
                </p>
                <div className="space-y-1">
                  {lowStockData?.data?.products?.slice(0, 3).map((product) => (
                    <div key={product._id} className="flex justify-between items-center text-sm">
                      <span className="truncate">{product.name}</span>
                      <span className="text-danger-600 font-medium">
                        {product.inventory.currentStock} left
                      </span>
                    </div>
                  ))}
                </div>
                {lowStockCount > 3 && (
                  <p className="text-xs text-gray-500">
                    And {lowStockCount - 3} more...
                  </p>
                )}
              </div>
            ) : (
              <p className="text-success-600">All products are well stocked!</p>
            )}
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      {summary.paymentMethods && (
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">Payment Methods Today</h3>
          </div>
          <div className="card-content">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Object.entries(summary.paymentMethods).map(([method, count]) => (
                <div key={method} className="text-center">
                  <p className="text-2xl font-semibold text-gray-900">{count}</p>
                  <p className="text-sm text-gray-600 capitalize">
                    {method.replace('_', ' ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Financial Metrics Legend */}
      <div className="card bg-blue-50 border-blue-200">
        <div className="card-content">
          <h3 className="text-sm font-semibold text-blue-900 mb-3">📊 Financial Metrics Explained</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-blue-800">
            <div><strong>Sales:</strong> Total revenue from Sales Orders + Sales Invoices</div>
            <div><strong>Net Revenue:</strong> Sales minus discounts given</div>
            <div><strong>Purchase (COGS):</strong> Cost of goods purchased from suppliers</div>
            <div><strong>Gross Profit:</strong> Net Revenue - COGS (your margin)</div>
            <div><strong>Receipts:</strong> Cash/Bank money received (includes sales + customer payments)</div>
            <div><strong>Payments:</strong> Cash/Bank money paid (includes supplier payments + expenses)</div>
            <div><strong>Net Cash Flow:</strong> Total receipts minus total payments (cash position)</div>
            <div className="md:col-span-2 lg:col-span-3 mt-2 p-2 bg-yellow-100 border border-yellow-300 rounded">
              <strong>⚠️ Note:</strong> Receipts/Payments may include both sales/purchases AND separate cash/bank transactions. For accurate accounting, check individual transaction pages.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
