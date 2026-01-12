import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShoppingCart, 
  Users, 
  Package, 
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
  useGetTodaySummaryQuery,
  useGetOrdersQuery,
  useLazyGetPeriodSummaryQuery,
} from '../store/services/salesApi';
import { useGetLowStockItemsQuery, useGetInventorySummaryQuery } from '../store/services/inventoryApi';
import { useGetCustomersQuery } from '../store/services/customersApi';
import { useGetSalesOrdersQuery } from '../store/services/salesOrdersApi';
import { useGetPurchaseOrdersQuery } from '../store/services/purchaseOrdersApi';
import { useGetPurchaseInvoicesQuery } from '../store/services/purchaseInvoicesApi';
import { useGetCashReceiptsQuery } from '../store/services/cashReceiptsApi';
import { useGetCashPaymentsQuery } from '../store/services/cashPaymentsApi';
import { useGetBankReceiptsQuery } from '../store/services/bankReceiptsApi';
import { useGetBankPaymentsQuery } from '../store/services/bankPaymentsApi';
import { useGetUpcomingExpensesQuery } from '../store/services/expensesApi';
import { formatCurrency, formatDate } from '../utils/formatters';
import { LoadingSpinner, LoadingButton, LoadingCard, LoadingGrid, LoadingPage, LoadingInline } from '../components/LoadingSpinner';
import PeriodComparisonSection from '../components/PeriodComparisonSection';
import PeriodComparisonCard from '../components/PeriodComparisonCard';
import ComparisonChart from '../components/ComparisonChart';
import { usePeriodComparison } from '../hooks/usePeriodComparison';
import DashboardReportModal from '../components/DashboardReportModal';

const StatCard = ({ title, value, icon: Icon, color, change, changeType }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 w-full min-h-0">
    <div className="text-center flex flex-col justify-center items-center w-full">
      <div className="flex justify-center mb-2 sm:mb-3">
        <div className={`p-2 sm:p-3 rounded-full ${color}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
        </div>
      </div>
      <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1 break-words">{title}</p>
      <p className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900 mb-1 break-words">{value}</p>
      <div className="min-h-[1.25rem] flex items-center justify-center space-x-1">
        {change && (
          <>
            {changeType === 'positive' && (
              <svg className="h-3 w-3 sm:h-4 sm:w-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            )}
            <p className={`text-xs sm:text-sm font-medium ${changeType === 'positive' ? 'text-green-600' : 'text-gray-600'} break-words`}>
              {changeType === 'positive' ? '+' : ''}{change}
            </p>
          </>
        )}
      </div>
    </div>
  </div>
);

// Helper function to get local date in YYYY-MM-DD format (avoids timezone issues with toISOString)
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const Dashboard = () => {
  const navigate = useNavigate();
  const today = getLocalDateString();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [activeFromDate, setActiveFromDate] = useState(today);
  const [activeToDate, setActiveToDate] = useState(today);
  const [reportModal, setReportModal] = useState({
    isOpen: false,
    type: null,
    title: '',
    dateFrom: today,
    dateTo: today
  });

  // Lazy query for period summary
  const [getPeriodSummary] = useLazyGetPeriodSummaryQuery();

  // Handle search button click
  const handleSearch = () => {
    setActiveFromDate(fromDate);
    setActiveToDate(toDate);
  };

  // Wrapper function for period summary that matches the expected API format
  const fetchPeriodSummary = async (params) => {
    try {
      const result = await getPeriodSummary(params).unwrap();
      return {
        data: {
          data: result.data || result
        }
      };
    } catch (error) {
      // Error fetching period summary - silent fail
      return {
        data: {
          data: {
            totalRevenue: 0,
            totalOrders: 0,
            averageOrderValue: 0,
            totalItems: 0
          }
        }
      };
    }
  };

  const { data: todaySummary, isLoading: summaryLoading } = useGetTodaySummaryQuery(undefined, {
    pollingInterval: 30000, // Refetch every 30 seconds
  });

  const { data: lowStockData, isLoading: lowStockLoading } = useGetLowStockItemsQuery();

  const { data: inventoryData, isLoading: inventoryLoading } = useGetInventorySummaryQuery();

  const { data: customersData, isLoading: customersLoading } = useGetCustomersQuery(
    { status: 'active' }
  );

  // Pending Sales Orders data (draft status only)
  const { data: pendingSalesOrdersData, isLoading: pendingSalesOrdersLoading } = useGetSalesOrdersQuery(
    { status: 'draft' }
  );

  // All Sales Orders data (for total value calculation)
  // Use 'all' parameter to get all orders without pagination
  const { data: salesOrdersData, isLoading: salesOrdersLoading } = useGetSalesOrdersQuery(
    { dateFrom: activeFromDate, dateTo: activeToDate, all: true },
    { skip: !activeFromDate || !activeToDate }
  );

  // Pending Purchase Orders data (draft status only)
  const { data: pendingPurchaseOrdersData, isLoading: pendingPurchaseOrdersLoading } = useGetPurchaseOrdersQuery(
    { status: 'draft' }
  );

  // All Purchase Orders data (for total value calculation)
  const { data: purchaseOrdersData, isLoading: purchaseOrdersLoading } = useGetPurchaseOrdersQuery(
    { dateFrom: activeFromDate, dateTo: activeToDate },
    { skip: !activeFromDate || !activeToDate }
  );

  // Sales Invoices (from Sales page) - actual completed sales
  // Use 'all' parameter to get all orders without pagination
  const { data: salesInvoicesData, isLoading: salesInvoicesLoading } = useGetOrdersQuery(
    { dateFrom: activeFromDate, dateTo: activeToDate, all: true },
    { skip: !activeFromDate || !activeToDate }
  );

  // Purchase Invoices (from Purchase page) - actual purchases
  const { data: purchaseInvoicesData, isLoading: purchaseInvoicesLoading } = useGetPurchaseInvoicesQuery(
    { dateFrom: activeFromDate, dateTo: activeToDate },
    { skip: !activeFromDate || !activeToDate }
  );

  // Cash Receipts data
  const { data: cashReceiptsData, isLoading: cashReceiptsLoading } = useGetCashReceiptsQuery(
    { dateFrom: activeFromDate, dateTo: activeToDate },
    { skip: !activeFromDate || !activeToDate }
  );

  // Cash Payments data
  const { data: cashPaymentsData, isLoading: cashPaymentsLoading } = useGetCashPaymentsQuery(
    { dateFrom: activeFromDate, dateTo: activeToDate },
    { skip: !activeFromDate || !activeToDate }
  );

  // Bank Receipts data
  const { data: bankReceiptsData, isLoading: bankReceiptsLoading } = useGetBankReceiptsQuery(
    { dateFrom: activeFromDate, dateTo: activeToDate },
    { skip: !activeFromDate || !activeToDate }
  );

  // Bank Payments data
  const { data: bankPaymentsData, isLoading: bankPaymentsLoading } = useGetBankPaymentsQuery(
    { dateFrom: activeFromDate, dateTo: activeToDate },
    { skip: !activeFromDate || !activeToDate }
  );

  const { data: recurringExpensesData, isLoading: recurringExpensesLoading } = useGetUpcomingExpensesQuery(
    { days: 14 },
    { pollingInterval: 60000 }
  );

  if (summaryLoading || lowStockLoading || inventoryLoading || customersLoading || 
      salesOrdersLoading || pendingSalesOrdersLoading || purchaseOrdersLoading || pendingPurchaseOrdersLoading || 
      salesInvoicesLoading || purchaseInvoicesLoading || cashReceiptsLoading || 
      cashPaymentsLoading || bankReceiptsLoading || bankPaymentsLoading || recurringExpensesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[12rem] sm:min-h-[16rem] w-full">
        <div className="animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const summary = todaySummary?.data?.summary || {};
  const lowStockCount = lowStockData?.data?.products?.length || 0;
  const inventorySummary = inventoryData?.data?.summary || {};
  
  const activeCustomersCount = customersData?.data?.customers?.length || 0;
  
  // Extract counts from API responses
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
  // RTK Query wraps axios response in 'data', so structure is: { data: { salesOrders: [...], pagination: {...} } }
  // Sales Orders use `total` directly, not `pricing.total`
  const salesOrdersArray = salesOrdersData?.data?.salesOrders || salesOrdersData?.salesOrders || [];
  const salesOrdersTotal = salesOrdersArray.reduce((sum, order) => {
    const orderTotal = order.total || order.pricing?.total || 0;
    return sum + Number(orderTotal);
  }, 0);
  
  const purchaseOrdersTotal = (purchaseOrdersData?.data?.purchaseOrders || purchaseOrdersData?.purchaseOrders || []).reduce((sum, order) => {
    return sum + Number(order.pricing?.total || order.total || 0);
  }, 0);
  
  // Sales Invoices (from Sales/POS page) - use `pricing.total`
  // RTK Query wraps axios response in 'data', so structure is: { data: { orders: [...], pagination: {...} } }
  // Also handle direct response structure (no data wrapper)
  const salesInvoicesArray = salesInvoicesData?.data?.orders || salesInvoicesData?.orders || [];
  const salesInvoicesTotal = salesInvoicesArray.reduce((sum, order) => {
    const orderTotal = order.pricing?.total || order.total || 0;
    return sum + Number(orderTotal);
  }, 0);
  
  // Purchase Invoices (from Purchase page)
  const purchaseInvoicesTotal = purchaseInvoicesData?.data?.invoices?.reduce((sum, invoice) => sum + (invoice.pricing?.total || 0), 0) || 
                                 purchaseInvoicesData?.invoices?.reduce((sum, invoice) => sum + (invoice.pricing?.total || 0), 0) || 0;
  
  const cashReceiptsTotal = cashReceiptsData?.data?.cashReceipts?.reduce((sum, receipt) => sum + (receipt.amount || 0), 0) || 0;
  const cashPaymentsTotal = cashPaymentsData?.data?.cashPayments?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;
  const bankReceiptsTotal = bankReceiptsData?.data?.bankReceipts?.reduce((sum, receipt) => sum + (receipt.amount || 0), 0) || 0;
  const bankPaymentsTotal = bankPaymentsData?.data?.bankPayments?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;
  
  // Calculate total sales (Sales Orders + Sales Invoices)
  const totalSales = salesOrdersTotal + salesInvoicesTotal;
  
  // Calculate total purchases (Purchase Orders + Purchase Invoices) - COGS
  const totalPurchases = purchaseOrdersTotal + purchaseInvoicesTotal;
  
  // Calculate total discounts from sales orders and sales invoices
  const salesOrdersDiscounts = salesOrdersData?.data?.salesOrders?.reduce((sum, order) => sum + (order.pricing?.discountAmount || 0), 0) || 0;
  const salesInvoicesDiscounts = salesInvoicesData?.data?.orders?.reduce((sum, order) => sum + (order.discountAmount || 0), 0) || 
                                  salesInvoicesData?.orders?.reduce((sum, order) => sum + (order.discountAmount || 0), 0) || 0;
  const totalDiscounts = salesOrdersDiscounts + salesInvoicesDiscounts;
  
  // Separate Cash/Bank Payments into Supplier Payments vs Operating Expenses
  // Operating expenses are payments that don't have a supplier or customer (general expenses)
  const cashPayments = cashPaymentsData?.data?.cashPayments || [];
  const bankPayments = bankPaymentsData?.data?.bankPayments || [];
  
  const cashOperatingExpenses = cashPayments
    .filter(payment => !payment?.supplier && !payment?.customer)
    .reduce((sum, payment) => sum + (payment.amount || 0), 0);
  
  const bankOperatingExpenses = bankPayments
    .filter(payment => !payment?.supplier && !payment?.customer)
    .reduce((sum, payment) => sum + (payment.amount || 0), 0);
  
  const operatingExpenses = cashOperatingExpenses + bankOperatingExpenses;
  
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
  const netProfit = grossProfit - operatingExpenses;

  // Report modal handlers
  const openReportModal = (type, title) => {
    setReportModal({
      isOpen: true,
      type,
      title,
      dateFrom: activeFromDate,
      dateTo: activeToDate
    });
  };

  const closeReportModal = () => {
    setReportModal({
      isOpen: false,
      type: null,
      title: '',
      dateFrom: today,
      dateTo: today
    });
  };

  const handleReportDateChange = (newFromDate, newToDate) => {
    setReportModal(prev => ({
      ...prev,
      dateFrom: newFromDate,
      dateTo: newToDate
    }));
    setActiveFromDate(newFromDate);
    setActiveToDate(newToDate);
  };

  // Prepare report data based on type
  const getReportData = () => {
    const { type, dateFrom: modalFromDate, dateTo: modalToDate } = reportModal;
    
    switch (type) {
      case 'receipts': {
        const allReceipts = [
          ...(cashReceiptsData?.data?.cashReceipts || []).map(r => ({
            ...r,
            type: 'Cash',
            _id: r._id || `cash-${r.voucherCode}`
          })),
          ...(bankReceiptsData?.data?.bankReceipts || []).map(r => ({
            ...r,
            type: 'Bank',
            _id: r._id || `bank-${r.voucherCode}`
          }))
        ];
        return {
          columns: [
            { key: 'date', label: 'Date', filterType: 'date', format: 'date', sortable: true },
            { key: 'voucherCode', label: 'VoucherCode', filterType: 'text', sortable: true },
            { key: 'amount', label: 'Amount', filterType: 'number', format: 'currency', sortable: true },
            { key: 'particular', label: 'Particular', filterType: 'text', sortable: true },
            { key: 'type', label: 'Type', filterType: 'text', sortable: true }
          ],
          data: allReceipts,
          isLoading: cashReceiptsLoading || bankReceiptsLoading
        };
      }
      case 'sales': {
        const allSales = [
          ...(salesOrdersData?.data?.salesOrders || salesOrdersData?.salesOrders || []).map(order => ({
            date: order.orderDate || order.createdAt,
            orderNumber: order.orderNumber || order._id,
            customer: order.customer?.businessName || order.customer?.name || 'N/A',
            amount: order.total || order.pricing?.total || 0,
            type: 'Sales Order',
            _id: order._id
          })),
          ...(salesInvoicesData?.data?.orders || salesInvoicesData?.orders || []).map(order => ({
            date: order.orderDate || order.createdAt,
            orderNumber: order.orderNumber || order._id,
            customer: order.customer?.businessName || order.customer?.name || 'N/A',
            amount: order.pricing?.total || order.total || 0,
            type: 'Sales Invoice',
            _id: order._id
          }))
        ];
        return {
          columns: [
            { key: 'date', label: 'Date', filterType: 'date', format: 'date', sortable: true },
            { key: 'orderNumber', label: 'Order Number', filterType: 'text', sortable: true },
            { key: 'customer', label: 'Customer', filterType: 'text', sortable: true },
            { key: 'amount', label: 'Amount', filterType: 'number', format: 'currency', sortable: true },
            { key: 'type', label: 'Type', filterType: 'text', sortable: true }
          ],
          data: allSales,
          isLoading: salesOrdersLoading || salesInvoicesLoading
        };
      }
      case 'purchases': {
        const allPurchases = [
          ...(purchaseOrdersData?.data?.purchaseOrders || purchaseOrdersData?.purchaseOrders || []).map(order => ({
            date: order.orderDate || order.createdAt,
            orderNumber: order.orderNumber || order._id,
            supplier: order.supplier?.companyName || order.supplier?.name || 'N/A',
            amount: order.pricing?.total || order.total || 0,
            type: 'Purchase Order',
            _id: order._id
          })),
          ...(purchaseInvoicesData?.data?.invoices || purchaseInvoicesData?.invoices || []).map(invoice => ({
            date: invoice.invoiceDate || invoice.createdAt,
            orderNumber: invoice.invoiceNumber || invoice._id,
            supplier: invoice.supplier?.companyName || invoice.supplier?.name || 'N/A',
            amount: invoice.pricing?.total || 0,
            type: 'Purchase Invoice',
            _id: invoice._id
          }))
        ];
        return {
          columns: [
            { key: 'date', label: 'Date', filterType: 'date', format: 'date', sortable: true },
            { key: 'orderNumber', label: 'Invoice/Order Number', filterType: 'text', sortable: true },
            { key: 'supplier', label: 'Supplier', filterType: 'text', sortable: true },
            { key: 'amount', label: 'Amount', filterType: 'number', format: 'currency', sortable: true },
            { key: 'type', label: 'Type', filterType: 'text', sortable: true }
          ],
          data: allPurchases,
          isLoading: purchaseOrdersLoading || purchaseInvoicesLoading
        };
      }
      case 'discounts': {
        const allDiscounts = [
          ...(salesOrdersData?.data?.salesOrders || salesOrdersData?.salesOrders || []).filter(o => (o.pricing?.discountAmount || 0) > 0).map(order => ({
            date: order.orderDate || order.createdAt,
            orderNumber: order.orderNumber || order._id,
            customer: order.customer?.businessName || order.customer?.name || 'N/A',
            amount: order.pricing?.discountAmount || 0,
            type: 'Sales Order',
            _id: order._id
          })),
          ...(salesInvoicesData?.data?.orders || salesInvoicesData?.orders || []).filter(o => (o.discountAmount || 0) > 0).map(order => ({
            date: order.orderDate || order.createdAt,
            orderNumber: order.orderNumber || order._id,
            customer: order.customer?.businessName || order.customer?.name || 'N/A',
            amount: order.discountAmount || 0,
            type: 'Sales Invoice',
            _id: order._id
          }))
        ];
        return {
          columns: [
            { key: 'date', label: 'Date', filterType: 'date', format: 'date', sortable: true },
            { key: 'orderNumber', label: 'Order Number', filterType: 'text', sortable: true },
            { key: 'customer', label: 'Customer', filterType: 'text', sortable: true },
            { key: 'amount', label: 'Discount Amount', filterType: 'number', format: 'currency', sortable: true },
            { key: 'type', label: 'Type', filterType: 'text', sortable: true }
          ],
          data: allDiscounts,
          isLoading: salesOrdersLoading || salesInvoicesLoading
        };
      }
      case 'pending-sales-orders': {
        const pendingOrders = (pendingSalesOrdersData?.data?.salesOrders || pendingSalesOrdersData?.salesOrders || []).map(order => ({
          date: order.orderDate || order.createdAt,
          orderNumber: order.orderNumber || order._id,
          customer: order.customer?.businessName || order.customer?.name || 'N/A',
          amount: order.total || order.pricing?.total || 0,
          status: order.status || 'draft',
          _id: order._id
        }));
        return {
          columns: [
            { key: 'date', label: 'Date', filterType: 'date', format: 'date', sortable: true },
            { key: 'orderNumber', label: 'Order Number', filterType: 'text', sortable: true },
            { key: 'customer', label: 'Customer', filterType: 'text', sortable: true },
            { key: 'amount', label: 'Amount', filterType: 'number', format: 'currency', sortable: true },
            { key: 'status', label: 'Status', filterType: 'text', sortable: true }
          ],
          data: pendingOrders,
          isLoading: pendingSalesOrdersLoading
        };
      }
      case 'pending-purchase-orders': {
        const pendingOrders = (pendingPurchaseOrdersData?.data?.purchaseOrders || pendingPurchaseOrdersData?.purchaseOrders || []).map(order => ({
          date: order.orderDate || order.createdAt,
          orderNumber: order.orderNumber || order._id,
          supplier: order.supplier?.companyName || order.supplier?.name || 'N/A',
          amount: order.pricing?.total || order.total || 0,
          status: order.status || 'draft',
          _id: order._id
        }));
        return {
          columns: [
            { key: 'date', label: 'Date', filterType: 'date', format: 'date', sortable: true },
            { key: 'orderNumber', label: 'Order Number', filterType: 'text', sortable: true },
            { key: 'supplier', label: 'Supplier', filterType: 'text', sortable: true },
            { key: 'amount', label: 'Amount', filterType: 'number', format: 'currency', sortable: true },
            { key: 'status', label: 'Status', filterType: 'text', sortable: true }
          ],
          data: pendingOrders,
          isLoading: pendingPurchaseOrdersLoading
        };
      }
      case 'gross-profit': {
        // Calculate profit per transaction
        const salesMap = new Map();
        (salesOrdersData?.data?.salesOrders || salesOrdersData?.salesOrders || []).forEach(order => {
          salesMap.set(order._id, {
            date: order.orderDate || order.createdAt,
            orderNumber: order.orderNumber || order._id,
            revenue: order.total || order.pricing?.total || 0,
            discount: order.pricing?.discountAmount || 0,
            type: 'Sales Order'
          });
        });
        (salesInvoicesData?.data?.orders || salesInvoicesData?.orders || []).forEach(order => {
          salesMap.set(order._id, {
            date: order.orderDate || order.createdAt,
            orderNumber: order.orderNumber || order._id,
            revenue: order.pricing?.total || order.total || 0,
            discount: order.discountAmount || 0,
            type: 'Sales Invoice'
          });
        });

        const profitData = Array.from(salesMap.values()).map(sale => {
          // For simplicity, we'll show revenue - we'd need COGS per sale for accurate profit
          return {
            date: sale.date,
            orderNumber: sale.orderNumber,
            revenue: sale.revenue - sale.discount,
            discount: sale.discount,
            type: sale.type,
            _id: sale.orderNumber
          };
        });
        return {
          columns: [
            { key: 'date', label: 'Date', filterType: 'date', format: 'date', sortable: true },
            { key: 'orderNumber', label: 'Order Number', filterType: 'text', sortable: true },
            { key: 'revenue', label: 'Revenue', filterType: 'number', format: 'currency', sortable: true },
            { key: 'discount', label: 'Discount', filterType: 'number', format: 'currency', sortable: true },
            { key: 'type', label: 'Type', filterType: 'text', sortable: true }
          ],
          data: profitData,
          isLoading: salesOrdersLoading || salesInvoicesLoading
        };
      }
      case 'payments': {
        const allPayments = [
          ...(cashPaymentsData?.data?.cashPayments || []).map(p => ({
            ...p,
            type: 'Cash',
            _id: p._id || `cash-${p.voucherCode}`
          })),
          ...(bankPaymentsData?.data?.bankPayments || []).map(p => ({
            ...p,
            type: 'Bank',
            _id: p._id || `bank-${p.voucherCode}`
          }))
        ];
        return {
          columns: [
            { key: 'date', label: 'Date', filterType: 'date', format: 'date', sortable: true },
            { key: 'voucherCode', label: 'VoucherCode', filterType: 'text', sortable: true },
            { key: 'amount', label: 'Amount', filterType: 'number', format: 'currency', sortable: true },
            { key: 'particular', label: 'Particular', filterType: 'text', sortable: true },
            { key: 'type', label: 'Type', filterType: 'text', sortable: true }
          ],
          data: allPayments,
          isLoading: cashPaymentsLoading || bankPaymentsLoading
        };
      }
      case 'net-cash-flow': {
        // Combined receipts and payments
        const allReceipts = [
          ...(cashReceiptsData?.data?.cashReceipts || []).map(r => ({
            date: r.date,
            voucherCode: r.voucherCode,
            amount: r.amount || 0,
            type: 'Receipt - Cash',
            particular: r.particular,
            _id: `receipt-cash-${r._id}`
          })),
          ...(bankReceiptsData?.data?.bankReceipts || []).map(r => ({
            date: r.date,
            voucherCode: r.voucherCode,
            amount: r.amount || 0,
            type: 'Receipt - Bank',
            particular: r.particular,
            _id: `receipt-bank-${r._id}`
          }))
        ];
        const allPayments = [
          ...(cashPaymentsData?.data?.cashPayments || []).map(p => ({
            date: p.date,
            voucherCode: p.voucherCode,
            amount: -(p.amount || 0),
            type: 'Payment - Cash',
            particular: p.particular,
            _id: `payment-cash-${p._id}`
          })),
          ...(bankPaymentsData?.data?.bankPayments || []).map(p => ({
            date: p.date,
            voucherCode: p.voucherCode,
            amount: -(p.amount || 0),
            type: 'Payment - Bank',
            particular: p.particular,
            _id: `payment-bank-${p._id}`
          }))
        ];
        return {
          columns: [
            { key: 'date', label: 'Date', filterType: 'date', format: 'date', sortable: true },
            { key: 'voucherCode', label: 'VoucherCode', filterType: 'text', sortable: true },
            { key: 'amount', label: 'Amount', filterType: 'number', format: 'currency', sortable: true, render: (val) => (
              <span className={val >= 0 ? 'text-green-600' : 'text-red-600'}>
                {formatCurrency(val)}
              </span>
            )},
            { key: 'type', label: 'Type', filterType: 'text', sortable: true },
            { key: 'particular', label: 'Particular', filterType: 'text', sortable: true }
          ],
          data: [...allReceipts, ...allPayments].sort((a, b) => new Date(b.date) - new Date(a.date)),
          isLoading: cashReceiptsLoading || bankReceiptsLoading || cashPaymentsLoading || bankPaymentsLoading
        };
      }
      case 'transactions': {
        // All transactions combined
        const allTransactions = [
          ...(salesInvoicesData?.data?.orders || salesInvoicesData?.orders || []).map(order => ({
            date: order.orderDate || order.createdAt,
            transactionNumber: order.orderNumber || order._id,
            type: 'Sales Invoice',
            amount: order.pricing?.total || order.total || 0,
            customer: order.customer?.businessName || order.customer?.name || 'N/A',
            _id: `sales-${order._id}`
          })),
          ...(purchaseInvoicesData?.data?.invoices || purchaseInvoicesData?.invoices || []).map(invoice => ({
            date: invoice.invoiceDate || invoice.createdAt,
            transactionNumber: invoice.invoiceNumber || invoice._id,
            type: 'Purchase Invoice',
            amount: invoice.pricing?.total || 0,
            supplier: invoice.supplier?.companyName || invoice.supplier?.name || 'N/A',
            _id: `purchase-${invoice._id}`
          }))
        ];
        return {
          columns: [
            { key: 'date', label: 'Date', filterType: 'date', format: 'date', sortable: true },
            { key: 'transactionNumber', label: 'Transaction Number', filterType: 'text', sortable: true },
            { key: 'type', label: 'Type', filterType: 'text', sortable: true },
            { key: 'amount', label: 'Amount', filterType: 'number', format: 'currency', sortable: true },
            { key: 'customer', label: 'Customer/Supplier', filterType: 'text', sortable: true, render: (val, row) => row.customer || row.supplier || 'N/A' }
          ],
          data: allTransactions,
          isLoading: salesInvoicesLoading || purchaseInvoicesLoading
        };
      }
      default:
        return { columns: [], data: [], isLoading: false };
    }
  };

  const reportData = getReportData();

  return (
    <div className="space-y-4 sm:space-y-5 md:space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="w-full">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 break-words">Dashboard</h1>
        <p className="text-sm sm:text-base text-gray-600 break-words">Welcome back! Here's what's happening today.</p>
      </div>

      {upcomingRecurringExpenses.length > 0 && (
        <div className="card w-full overflow-hidden">
          <div className="card-header flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div className="w-full sm:w-auto">
              <h2 className="text-base sm:text-lg font-medium text-gray-900 flex items-center space-x-2 break-words">
                <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-primary-600 flex-shrink-0" />
                <span>Upcoming Monthly Obligations</span>
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 break-words mt-1">
                Stay ahead of salaries, rent, and other committed expenses.
              </p>
            </div>
          </div>
          <div className="card-content overflow-visible">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {upcomingRecurringExpenses.slice(0, 4).map((expense) => {
                const daysLeft = calculateDaysUntilDue(expense.nextDueDate);
                const isOverdue = typeof daysLeft === 'number' && daysLeft < 0;
                return (
                  <div
                    key={expense._id}
                    className={`border rounded-lg p-3 sm:p-4 shadow-sm w-full min-w-0 ${
                      isOverdue ? 'border-danger-200 bg-danger-50/60' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 break-words">
                        {expense.defaultPaymentType === 'bank' ? 'Bank Payment' : 'Cash Payment'}
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 break-words">{expense.name}</h3>
                    <p className="text-xs sm:text-sm text-gray-600 break-words">{getRecurringPayeeName(expense)}</p>
                    <p className="text-base sm:text-lg font-bold text-gray-900 mt-2 break-words">
                      {formatCurrency(expense.amount)}
                    </p>
                    <div className="mt-2 text-xs sm:text-sm text-gray-600 flex items-center space-x-2 min-w-0">
                      <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0" />
                      <span className="break-words">Due {formatDate(expense.nextDueDate)}</span>
                    </div>
                    <div className="mt-2">
                      <span
                        className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full break-words ${
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
      <div className="card w-full overflow-hidden">
        <div className="card-header">
          <div className="flex flex-col items-center space-y-3 sm:space-y-4 w-full">
            <h2 className="text-base sm:text-lg font-medium text-gray-900 break-words text-center">Financial Overview</h2>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-3 md:space-x-6 w-full sm:w-auto">
              <div className="grid grid-cols-2 sm:flex sm:flex-row items-stretch sm:items-center gap-2 sm:gap-x-2 md:gap-x-3 w-full sm:w-auto">
                <Calendar className="h-4 w-4 text-gray-500 hidden sm:block flex-shrink-0" />
                <div className="flex flex-col items-stretch sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                  <label className="text-xs sm:text-sm font-medium text-gray-600 sm:whitespace-nowrap">From:</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="input text-xs sm:text-sm w-full sm:w-auto min-w-0 sm:min-w-[8rem] md:min-w-[10rem]"
                  />
                </div>
                <div className="flex flex-col items-stretch sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                  <label className="text-xs sm:text-sm font-medium text-gray-600 sm:whitespace-nowrap">To:</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="input text-xs sm:text-sm w-full sm:w-auto min-w-0 sm:min-w-[8rem] md:min-w-[10rem]"
                  />
                </div>
              </div>
              <button 
                onClick={handleSearch}
                className="btn btn-primary flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 w-full sm:w-auto whitespace-nowrap"
              >
                <Search className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="text-xs sm:text-sm">Search</span>
              </button>
            </div>
          </div>
        </div>
        <div className="card-content space-y-4 sm:space-y-5 md:space-y-6 overflow-visible">
          
          {/* REVENUE, COST & DISCOUNT SECTION */}
          <div className="w-full overflow-visible">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 sm:mb-3 uppercase tracking-wide break-words">Revenue, Cost & Discounts</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            
            {/* Sales */}
            <div 
              className="text-center p-3 sm:p-4 border-2 border-green-300 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 hover:border-green-400 transition-colors w-full min-w-0 overflow-hidden"
              onClick={() => openReportModal('sales', 'Sales Revenue Report')}
            >
              <div className="flex justify-center mb-2">
                <div className="p-2 sm:p-3 bg-green-500 rounded-full">
                  <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                </div>
              </div>
              <p className="text-xs sm:text-sm font-medium text-green-700 mb-1 break-words">Sales (Revenue)</p>
              <p className="text-base sm:text-lg md:text-xl font-bold text-green-800 break-words">{Math.round(totalSales).toLocaleString()}</p>
              <p className="text-xs text-green-600 mt-1 break-words">SO: {Math.round(salesOrdersTotal)} | SI: {Math.round(salesInvoicesTotal)}</p>
            </div>

            {/* Purchase (COGS) */}
            <div 
              className="text-center p-3 sm:p-4 border-2 border-purple-300 bg-purple-50 rounded-lg cursor-pointer hover:bg-purple-100 hover:border-purple-400 transition-colors w-full min-w-0 overflow-hidden"
              onClick={() => openReportModal('purchases', 'Purchase Cost Report')}
            >
              <div className="flex justify-center mb-2">
                <div className="p-2 sm:p-3 bg-purple-500 rounded-full">
                  <Truck className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                </div>
              </div>
              <p className="text-xs sm:text-sm font-medium text-purple-700 mb-1 break-words">Purchase (COGS)</p>
              <p className="text-base sm:text-lg md:text-xl font-bold text-purple-800 break-words">{Math.round(totalPurchases).toLocaleString()}</p>
              <p className="text-xs text-purple-600 mt-1 break-words">PO: {Math.round(purchaseOrdersTotal)} | PI: {Math.round(purchaseInvoicesTotal)}</p>
            </div>

            {/* Discount */}
            <div 
              className="text-center p-3 sm:p-4 border-2 border-red-300 bg-red-50 rounded-lg cursor-pointer hover:bg-red-100 hover:border-red-400 transition-colors w-full min-w-0 overflow-hidden"
              onClick={() => openReportModal('discounts', 'Discount Report')}
            >
              <div className="flex justify-center mb-2">
                <div className="p-2 sm:p-3 bg-red-500 rounded-full">
                  <Tag className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                </div>
              </div>
              <p className="text-xs sm:text-sm font-medium text-red-700 mb-1 break-words">Discount Given</p>
              <p className="text-base sm:text-lg md:text-xl font-bold text-red-800 break-words">{Math.round(totalDiscounts).toLocaleString()}</p>
            </div>

             {/* Pending Sales Orders */}
             <div 
               className="text-center p-3 sm:p-4 border-2 border-cyan-300 bg-cyan-50 rounded-lg cursor-pointer hover:bg-cyan-100 hover:border-cyan-400 transition-colors w-full min-w-0 overflow-hidden"
               onClick={() => openReportModal('pending-sales-orders', 'Pending Sales Orders Report')}
             >
               <div className="flex justify-center mb-2">
                 <div className="p-2 sm:p-3 bg-cyan-500 rounded-full">
                   <FileText className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                 </div>
               </div>
               <p className="text-xs sm:text-sm font-medium text-cyan-700 mb-1 break-words">Pending Sales Orders</p>
               <p className="text-base sm:text-lg md:text-xl font-bold text-cyan-800 break-words">{pendingSalesOrdersCount}</p>
             </div>
 
             {/* Pending Purchase Orders */}
             <div 
               className="text-center p-3 sm:p-4 border-2 border-indigo-300 bg-indigo-50 rounded-lg cursor-pointer hover:bg-indigo-100 hover:border-indigo-400 transition-colors w-full min-w-0 overflow-hidden"
               onClick={() => openReportModal('pending-purchase-orders', 'Pending Purchase Orders Report')}
             >
               <div className="flex justify-center mb-2">
                 <div className="p-2 sm:p-3 bg-indigo-500 rounded-full">
                   <Receipt className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                 </div>
               </div>
               <p className="text-xs sm:text-sm font-medium text-indigo-700 mb-1 break-words">Pending Purchase Orders</p>
               <p className="text-base sm:text-lg md:text-xl font-bold text-indigo-800 break-words">{pendingPurchaseOrdersCount}</p>
             </div>
            </div>
          </div>
          
          {/* PROFITABILITY & CASH FLOW SECTION */}
          <div className="w-full overflow-visible">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 sm:mb-3 uppercase tracking-wide break-words">Profitability & Cash Flow</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            
            {/* Gross Profit */}
            <div 
              className="text-center p-3 sm:p-4 border-2 border-blue-300 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100 hover:border-blue-400 transition-colors w-full min-w-0 overflow-hidden"
              onClick={() => openReportModal('gross-profit', 'Gross Profit Report')}
            >
              <div className="flex justify-center mb-2">
                <div className="p-2 sm:p-3 bg-blue-500 rounded-full">
                  <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                </div>
              </div>
              <p className="text-xs sm:text-sm font-medium text-gray-700 mb-1 break-words">Gross Profit</p>
              <p className={`text-base sm:text-lg md:text-xl font-bold break-words ${grossProfit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                {Math.round(grossProfit).toLocaleString()}
              </p>
              <p className="text-xs text-gray-600 mt-1 break-words">Revenue - COGS</p>
            </div>
            
            {/* Total Receipts */}
            <div 
              className="text-center p-3 sm:p-4 border-2 border-emerald-300 bg-emerald-50 rounded-lg cursor-pointer hover:bg-emerald-100 hover:border-emerald-400 transition-colors w-full min-w-0 overflow-hidden"
              onClick={() => openReportModal('receipts', 'Total Receipts Report')}
            >
              <div className="flex justify-center mb-2">
                <div className="p-2 sm:p-3 bg-emerald-500 rounded-full">
                  <Receipt className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                </div>
              </div>
              <p className="text-xs sm:text-sm font-medium text-emerald-700 mb-1 break-words">Total Receipts</p>
              <p className="text-base sm:text-lg md:text-xl font-bold text-emerald-800 break-words">{Math.round(totalReceipts).toLocaleString()}</p>
              <p className="text-xs text-emerald-600 mt-1 break-words">Cash: {Math.round(totalCashReceipts)} | Bank: {Math.round(totalBankReceipts)}</p>
            </div>
            
            {/* Total Payments */}
            <div 
              className="text-center p-3 sm:p-4 border-2 border-orange-300 bg-orange-50 rounded-lg cursor-pointer hover:bg-orange-100 hover:border-orange-400 transition-colors w-full min-w-0 overflow-hidden"
              onClick={() => openReportModal('payments', 'Total Payments Report')}
            >
              <div className="flex justify-center mb-2">
                <div className="p-2 sm:p-3 bg-orange-500 rounded-full">
                  <Banknote className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                </div>
              </div>
              <p className="text-xs sm:text-sm font-medium text-orange-700 mb-1 break-words">Total Payments</p>
              <p className="text-base sm:text-lg md:text-xl font-bold text-orange-800 break-words">{Math.round(totalPayments).toLocaleString()}</p>
              <p className="text-xs text-orange-600 mt-1 break-words">Cash: {Math.round(totalCashPayments)} | Bank: {Math.round(totalBankPayments)}</p>
            </div>
            
            {/* Net Cash Flow */}
            <div 
              className={`text-center p-3 sm:p-4 border-2 rounded-lg cursor-pointer transition-colors w-full min-w-0 overflow-hidden ${netCashFlow >= 0 ? 'border-green-300 bg-green-50 hover:bg-green-100 hover:border-green-400' : 'border-red-300 bg-red-50 hover:bg-red-100 hover:border-red-400'}`}
              onClick={() => openReportModal('net-cash-flow', 'Net Cash Flow Report')}
            >
              <div className="flex justify-center mb-2">
                <div className={`p-2 sm:p-3 rounded-full ${netCashFlow >= 0 ? 'bg-green-500' : 'bg-red-500'}`}>
                  <Wallet className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                </div>
              </div>
              <p className="text-xs sm:text-sm font-medium text-gray-700 mb-1 break-words">Net Cash Flow</p>
              <p className={`text-base sm:text-lg md:text-xl font-bold break-words ${netCashFlow >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {Math.round(netCashFlow).toLocaleString()}
              </p>
              <p className="text-xs text-gray-600 mt-1 break-words">Receipts - Payments</p>
            </div>
            
            {/* Total Orders */}
            <div 
              className="text-center p-3 sm:p-4 border-2 border-yellow-300 bg-yellow-50 rounded-lg cursor-pointer hover:bg-yellow-100 hover:border-yellow-400 transition-colors w-full min-w-0 overflow-hidden"
              onClick={() => openReportModal('transactions', 'Total Transactions Report')}
            >
              <div className="flex justify-center mb-2">
                <div className="p-2 sm:p-3 bg-yellow-500 rounded-full">
                  <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                </div>
              </div>
              <p className="text-xs sm:text-sm font-medium text-yellow-700 mb-1 break-words">Total Transactions</p>
              <p className="text-base sm:text-lg md:text-xl font-bold text-yellow-800 break-words">{summary.totalOrders || 0}</p>
            </div>
            
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid - Single Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4 md:gap-5 w-full">
        <StatCard
          title="Today's Revenue"
          value={`${summary.totalRevenue?.toFixed(2) || '0.00'}`}
          icon={TrendingUp}
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
          value={`${summary.averageOrderValue?.toFixed(2) || '0.00'}`}
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
            fetchFunction: (params) => fetchPeriodSummary(params).then(res => ({
              data: res.data?.data?.totalRevenue || 0
            })),
            format: 'currency',
            icon: TrendingUp,
            iconColor: 'bg-green-500'
          },
          {
            title: 'Total Orders',
            fetchFunction: (params) => fetchPeriodSummary(params).then(res => ({
              data: res.data?.data?.totalOrders || 0
            })),
            format: 'number',
            icon: ShoppingCart,
            iconColor: 'bg-blue-500'
          },
          {
            title: 'Average Order Value',
            fetchFunction: (params) => fetchPeriodSummary(params).then(res => ({
              data: res.data?.data?.averageOrderValue || 0
            })),
            format: 'currency',
            icon: TrendingUp,
            iconColor: 'bg-purple-500'
          },
          {
            title: 'Total Items Sold',
            fetchFunction: (params) => fetchPeriodSummary(params).then(res => ({
              data: res.data?.data?.totalItems || 0
            })),
            format: 'number',
            icon: Package,
            iconColor: 'bg-orange-500'
          }
        ]}
        fetchFunction={fetchPeriodSummary}
      />

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 md:gap-6 w-full">
        {/* Recent Orders */}
        <div className="card w-full overflow-hidden">
          <div className="card-header">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 break-words">Today's Orders</h3>
          </div>
          <div className="card-content overflow-visible">
            {summary.orderTypes ? (
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs sm:text-sm text-gray-600 break-words">Retail Orders</span>
                  <span className="font-medium text-xs sm:text-sm whitespace-nowrap">{summary.orderTypes.retail || 0}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs sm:text-sm text-gray-600 break-words">Wholesale Orders</span>
                  <span className="font-medium text-xs sm:text-sm whitespace-nowrap">{summary.orderTypes.wholesale || 0}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs sm:text-sm text-gray-600 break-words">Returns</span>
                  <span className="font-medium text-xs sm:text-sm whitespace-nowrap">{summary.orderTypes.return || 0}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs sm:text-sm text-gray-600 break-words">Exchanges</span>
                  <span className="font-medium text-xs sm:text-sm whitespace-nowrap">{summary.orderTypes.exchange || 0}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-gray-500 break-words">No orders today</p>
            )}
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="card w-full overflow-hidden">
          <div className="card-header">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 break-words">Low Stock Alert</h3>
          </div>
          <div className="card-content overflow-visible">
            {lowStockCount > 0 ? (
              <div className="space-y-2">
                <p className="text-xs sm:text-sm text-gray-600 break-words">
                  {lowStockCount} products are running low on stock
                </p>
                <div className="space-y-1">
                  {lowStockData?.data?.products?.slice(0, 3).map((product) => (
                    <div key={product._id} className="flex justify-between items-center text-xs sm:text-sm gap-2 min-w-0">
                      <span className="truncate flex-1 min-w-0">{product.name}</span>
                      <span className="text-danger-600 font-medium flex-shrink-0 whitespace-nowrap">
                        {product.inventory.currentStock} left
                      </span>
                    </div>
                  ))}
                </div>
                {lowStockCount > 3 && (
                  <p className="text-xs text-gray-500 break-words">
                    And {lowStockCount - 3} more...
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-success-600 break-words">All products are well stocked!</p>
            )}
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      {summary.paymentMethods && (
        <div className="card w-full overflow-hidden">
          <div className="card-header">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 break-words">Payment Methods Today</h3>
          </div>
          <div className="card-content overflow-visible">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {Object.entries(summary.paymentMethods).map(([method, count]) => (
                <div key={method} className="text-center w-full min-w-0">
                  <p className="text-xl sm:text-2xl font-semibold text-gray-900 break-words">{count}</p>
                  <p className="text-xs sm:text-sm text-gray-600 capitalize break-words">
                    {method.replace('_', ' ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Financial Metrics Legend */}
      <div className="card bg-blue-50 border-blue-200 w-full overflow-hidden">
        <div className="card-content overflow-visible">
          <h3 className="text-xs sm:text-sm font-semibold text-blue-900 mb-2 sm:mb-3 break-words">📊 Financial Metrics Explained</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 text-xs text-blue-800">
            <div><strong>Sales:</strong> Total revenue from Sales Orders + Sales Invoices</div>
            <div><strong>Net Revenue:</strong> Sales minus discounts given</div>
            <div><strong>Purchase (COGS):</strong> Cost of goods purchased from suppliers</div>
            <div><strong>Gross Profit:</strong> Net Revenue - COGS (your margin)</div>
            <div><strong>Receipts:</strong> Cash/Bank money received (includes sales + customer payments)</div>
            <div><strong>Payments:</strong> Cash/Bank money paid (includes supplier payments + expenses)</div>
            <div><strong>Net Cash Flow:</strong> Total receipts minus total payments (cash position)</div>
            <div className="sm:col-span-2 lg:col-span-3 mt-2 p-2 sm:p-3 bg-yellow-100 border border-yellow-300 rounded break-words">
              <strong>⚠️ Note:</strong> Receipts/Payments may include both sales/purchases AND separate cash/bank transactions. For accurate accounting, check individual transaction pages.
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Report Modal */}
      <DashboardReportModal
        isOpen={reportModal.isOpen}
        onClose={closeReportModal}
        title={reportModal.title}
        columns={reportData.columns}
        data={reportData.data}
        isLoading={reportData.isLoading}
        dateFrom={reportModal.dateFrom}
        dateTo={reportModal.dateTo}
        onDateChange={handleReportDateChange}
      />
    </div>
  );
};
