import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  ShoppingCart, 
  Warehouse, 
  BarChart3, 
  Settings, 
  LogOut,
  Menu,
  X,
  User,
  CreditCard,
  Truck,
  Building,
  Building2,
  FileText,
  Keyboard,
  RotateCcw,
  Tag,
  TrendingUp,
  Receipt,
  ArrowUpDown,
  ArrowRight,
  FolderTree,
  Search,
  Clock,
  MapPin,
  AlertTriangle,
  Wallet
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTab } from '../contexts/TabContext';
import { getComponentInfo } from '../utils/componentUtils';
import TabBar from './TabBar';
import TabContent from './TabContent';
import toast from 'react-hot-toast';
import ErrorBoundary from './ErrorBoundary';
import MobileNavigation from './MobileNavigation';
import { useResponsive } from './ResponsiveContainer';
import { useQuery } from 'react-query';
import { inventoryAlertsAPI } from '../services/api';

const navigation = [
  // Dashboard
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: null, allowMultiple: true },
  
  // Sales Section
  { type: 'heading', name: 'Sales Section', color: 'bg-blue-500' },
  { name: 'Sales Orders', href: '/sales-orders', icon: FileText, permission: 'view_sales_orders' },
  { name: 'Sales', href: '/sales', icon: CreditCard, permission: 'view_sales_orders' },
  { name: 'Sales Invoices', href: '/sales-invoices', icon: Search, permission: 'view_sales_invoices' },
  
  // Purchase Section
  { type: 'heading', name: 'Purchase Section', color: 'bg-green-500' },
  { name: 'Purchase Orders', href: '/purchase-orders', icon: FileText, permission: 'view_purchase_orders' },
  { name: 'Purchase', href: '/purchase', icon: Truck, permission: 'view_purchase_orders' },
  { name: 'Purchase Invoices', href: '/purchase-invoices', icon: Search, permission: 'view_purchase_invoices' },
  
  // Operations Section
  { type: 'heading', name: 'Operations Section', color: 'bg-teal-500' },
  { name: 'Returns', href: '/returns', icon: RotateCcw, permission: 'view_returns' },
  { name: 'Discounts', href: '/discounts', icon: Tag, permission: 'view_discounts' },
  
  // Financial Transactions Section
  { type: 'heading', name: 'Financial Transactions', color: 'bg-yellow-500' },
  { name: 'Cash Receipts', href: '/cash-receipts', icon: Receipt, permission: 'view_reports' },
  { name: 'Cash Payments', href: '/cash-payments', icon: CreditCard, permission: 'view_reports' },
  { name: 'Bank Receipts', href: '/bank-receipts', icon: Building, permission: 'view_reports' },
  { name: 'Bank Payments', href: '/bank-payments', icon: ArrowUpDown, permission: 'view_reports' },
  { name: 'Record Expense', href: '/expenses', icon: Wallet, permission: null },
  
  // Master Data Section
  { type: 'heading', name: 'Master Data Section', color: 'bg-purple-500' },
  { name: 'Products', href: '/products', icon: Package, permission: 'view_products' },
  { name: 'Product Variants', href: '/product-variants', icon: Tag, permission: 'view_products' },
  { name: 'Product Transformations', href: '/product-transformations', icon: ArrowRight, permission: 'update_inventory' },
  { name: 'Customers', href: '/customers', icon: Users, permission: 'view_customers' },
  { name: 'Customer Analytics', href: '/customer-analytics', icon: BarChart3, permission: 'view_customer_analytics' },
  { name: 'Suppliers', href: '/suppliers', icon: Building, permission: 'view_suppliers' },
  { name: 'Banks', href: '/banks', icon: Building2, permission: null },
  { name: 'Investors', href: '/investors', icon: TrendingUp, permission: 'view_investors' },
  { name: 'Drop Shipping', href: '/drop-shipping', icon: ArrowRight, permission: 'create_drop_shipping' },
  { name: 'Cities', href: '/cities', icon: MapPin, permission: 'manage_users' },
  
  // Inventory Section
  { type: 'heading', name: 'Inventory Section', color: 'bg-orange-500' },
  { name: 'Inventory', href: '/inventory', icon: Warehouse, permission: 'view_inventory' },
  { name: 'Inventory Alerts', href: '/inventory-alerts', icon: AlertTriangle, permission: 'view_inventory' },
  { name: 'Warehouses', href: '/warehouses', icon: Warehouse, permission: 'view_inventory' },
  { name: 'Stock Movements', href: '/stock-movements', icon: ArrowUpDown, permission: 'view_stock_movements' },
  
  // Accounting Section
  { type: 'heading', name: 'Accounting Section', color: 'bg-pink-500' },
  { name: 'Chart of Accounts', href: '/chart-of-accounts', icon: FolderTree, permission: 'view_chart_of_accounts' },
  { name: 'Journal Vouchers', href: '/journal-vouchers', icon: FileText, permission: 'view_reports', allowMultiple: true },
  { name: 'Account Ledger', href: '/account-ledger', icon: FileText, permission: 'view_reports', allowMultiple: true },
  
  // Reports & Analytics Section
  { type: 'heading', name: 'Reports & Analytics', color: 'bg-indigo-500' },
  { name: 'P&L Statements', href: '/pl-statements', icon: BarChart3, permission: 'view_pl_statements' },
  { name: 'Balance Sheets', href: '/balance-sheets', icon: FileText, permission: 'view_balance_sheets' },
  { name: 'Sales Performance', href: '/sales-performance', icon: TrendingUp, permission: 'view_sales_performance' },
  { name: 'Inventory Reports', href: '/inventory-reports', icon: Warehouse, permission: 'view_inventory_reports' },
  { name: 'Anomaly Detection', href: '/anomaly-detection', icon: AlertTriangle, permission: 'view_anomaly_detection' },
  { name: 'Reports', href: '/reports', icon: BarChart3, permission: 'view_general_reports' },
  { name: 'Backdate Report', href: '/backdate-report', icon: Clock, permission: 'view_backdate_report' },
  
  // HR/Admin Section
  { type: 'heading', name: 'HR/Admin Section', color: 'bg-cyan-500' },
  { name: 'Employees', href: '/employees', icon: Users, permission: 'manage_users', allowMultiple: true },
  { name: 'Attendance', href: '/attendance', icon: Clock, permission: 'view_own_attendance' },
  
  // System/Utilities Section
  { type: 'heading', name: 'System/Utilities', color: 'bg-red-500' },
  { name: 'Settings', href: '/settings2', icon: Settings, permission: 'manage_users' },
];

// Inventory Alerts Badge Component
const InventoryAlertsBadge = ({ onNavigate }) => {
  const { data: summaryData } = useQuery(
    'inventoryAlertsSummary',
    () => inventoryAlertsAPI.getAlertSummary(),
    {
      refetchInterval: 60000, // Refetch every minute
      retry: 1,
      onError: () => {} // Silently fail
    }
  );

  const summary = summaryData?.data || {};
  const criticalCount = summary.critical || 0;
  const outOfStockCount = summary.outOfStock || 0;
  const totalAlerts = summary.total || 0;

  if (totalAlerts === 0) return null;

  return (
    <button
      onClick={() => onNavigate({ href: '/inventory-alerts', name: 'Inventory Alerts' })}
      className="relative flex items-center space-x-2 px-3 py-2 rounded-md bg-red-50 hover:bg-red-100 text-red-700 transition-colors"
      title={`${criticalCount} critical alert(s), ${outOfStockCount} out of stock`}
    >
      <AlertTriangle className="h-4 w-4" />
      <span className="hidden sm:inline text-sm font-medium">Alerts</span>
      <span className="bg-red-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
        {criticalCount > 0 ? criticalCount : totalAlerts}
      </span>
    </button>
  );
};

export const MultiTabLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile, isTablet } = useResponsive();
  const { openTab, tabs, switchToTab, triggerTabHighlight } = useTab();

  // Filter navigation based on user permissions
  const filteredNavigation = navigation.filter(item => {
    if (item.type === 'divider' || item.type === 'heading') return true; // Always show dividers and headings
    if (!item.permission) return true; // Always show items without permission requirement (like Dashboard)
    if (user?.role === 'admin') return true; // Admin users see everything
    return hasPermission(item.permission);
  });

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  const reuseNavigationPaths = new Set([
    '/sales-invoices',
    '/sales-invoices/',
    '/orders',
    '/purchase-invoices',
    '/settings',
    '/settings2'
  ]);

  const handleNavigationClick = (item) => {
    const componentInfo = getComponentInfo(item.href);
    if (componentInfo) {
      const existingTab = tabs.find(tab => tab.path === item.href);
      if (existingTab && reuseNavigationPaths.has(item.href)) {
        switchToTab(existingTab.id);
        triggerTabHighlight(existingTab.id);
        return;
      }
      const tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      openTab({
        title: componentInfo.title,
        path: item.href,
        component: componentInfo.component,
        icon: componentInfo.icon,
        allowMultiple: componentInfo.allowMultiple || false,
        props: { tabId: tabId }
      });
    } else {
      // For routes not in registry (like dashboard, settings), use regular navigation
      navigate(item.href);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Navigation */}
      <MobileNavigation user={user} onLogout={handleLogout} />
      
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white">
          <div className="flex h-16 items-center justify-between px-4">
            <h1 className="text-xl font-bold text-gray-900">POS System</h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto max-h-[calc(100vh-4rem)] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            {filteredNavigation.map((item, index) => {
              if (item.type === 'divider') {
                return (
                  <div key={`divider-${index}`} className="my-2 border-t border-gray-200"></div>
                );
              }
              
              if (item.type === 'heading') {
                return (
                  <div key={`heading-${index}`} className={`${item.color} text-white px-3 py-2 mt-3 mb-1 rounded-md text-xs font-bold uppercase tracking-wider shadow-sm`}>
                    {item.name}
                  </div>
                );
              }
              
              const isActive = location.pathname === item.href;
              return (
                <button
                  key={item.name}
                  onClick={() => {
                    handleNavigationClick(item);
                    setSidebarOpen(false);
                  }}
                  className={`group flex items-center w-full px-2 py-2 text-sm font-medium rounded-md ${
                    isActive
                      ? 'bg-primary-100 text-primary-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
          <div className="flex h-16 items-center px-4">
            <h1 className="text-xl font-bold text-gray-900">POS System</h1>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto max-h-[calc(100vh-4rem)] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            {filteredNavigation.map((item, index) => {
              if (item.type === 'divider') {
                return (
                  <div key={`divider-${index}`} className="my-2 border-t border-gray-200"></div>
                );
              }
              
              if (item.type === 'heading') {
                return (
                  <div key={`heading-${index}`} className={`${item.color} text-white px-3 py-2 mt-3 mb-1 rounded-md text-xs font-bold uppercase tracking-wider shadow-sm`}>
                    {item.name}
                  </div>
                );
              }
              
              const isActive = location.pathname === item.href;
              return (
                <button
                  key={item.name}
                  onClick={() => handleNavigationClick(item)}
                  className={`group flex items-center w-full px-2 py-2 text-sm font-medium rounded-md ${
                    isActive
                      ? 'bg-primary-100 text-primary-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            {/* Inventory Alerts Badge */}
            <InventoryAlertsBadge onNavigate={handleNavigationClick} />
            
            {/* Financial Transaction Buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleNavigationClick({ href: '/cash-receiving', name: 'Cash Receiving' })}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-md shadow-sm hover:shadow-md transition-all duration-200 flex items-center space-x-1 text-sm font-medium"
              >
                <Receipt className="h-4 w-4" />
                <span className="hidden sm:inline">Cash Receiving</span>
              </button>
              <button
                onClick={() => handleNavigationClick({ href: '/cash-receipts', name: 'Cash Receipts' })}
                className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-md shadow-sm hover:shadow-md transition-all duration-200 flex items-center space-x-1 text-sm font-medium"
              >
                <Receipt className="h-4 w-4" />
                <span className="hidden sm:inline">Cash Receipt</span>
              </button>
              <button
                onClick={() => handleNavigationClick({ href: '/bank-receipts', name: 'Bank Receipts' })}
                className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-md shadow-sm hover:shadow-md transition-all duration-200 flex items-center space-x-1 text-sm font-medium"
              >
                <Receipt className="h-4 w-4" />
                <span className="hidden sm:inline">Bank Receipt</span>
              </button>
              <button
                onClick={() => handleNavigationClick({ href: '/cash-payments', name: 'Cash Payments' })}
                className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-md shadow-sm hover:shadow-md transition-all duration-200 flex items-center space-x-1 text-sm font-medium"
              >
                <ArrowUpDown className="h-4 w-4" />
                <span className="hidden sm:inline">Cash Payment</span>
              </button>
              <button
                onClick={() => handleNavigationClick({ href: '/bank-payments', name: 'Bank Payments' })}
                className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-md shadow-sm hover:shadow-md transition-all duration-200 flex items-center space-x-1 text-sm font-medium"
              >
                <ArrowUpDown className="h-4 w-4" />
                <span className="hidden sm:inline">Bank Payment</span>
              </button>
              <button
                onClick={() => handleNavigationClick({ href: '/expenses', name: 'Record Expense' })}
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-md shadow-sm hover:shadow-md transition-all duration-200 flex items-center space-x-1 text-sm font-medium"
              >
                <CreditCard className="h-4 w-4" />
                <span className="hidden sm:inline">Record Expense</span>
              </button>
            </div>

            <div className="flex items-center gap-x-4 ml-auto">
              {/* Keyboard Shortcuts Button */}
              <button
                onClick={() => {
                  toast.success('Keyboard Shortcuts: Ctrl+F (Product Search), Ctrl+S (Supplier Search), Ctrl+P (Process Purchase), Esc (Clear Items)');
                }}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Show Keyboard Shortcuts"
              >
                <Keyboard className="h-4 w-4" />
                <span className="hidden sm:inline">Shortcuts</span>
              </button>

              {/* User menu */}
              <div className="flex items-center gap-x-2">
                <div className="flex items-center gap-x-2">
                  <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary-600" />
                  </div>
                  <div className="hidden lg:block">
                    <p className="text-sm font-medium text-gray-900">{user?.fullName}</p>
                    <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="text-gray-400 hover:text-gray-600"
                  title="Logout"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <TabBar />

        {/* Page content */}
        <main className={`${isMobile ? 'py-2' : 'py-4'}`}>
          <div className={`mx-auto max-w-full ${isMobile ? 'px-2' : 'px-2 sm:px-4 lg:px-6'}`}>
            <ErrorBoundary>
              {tabs.length > 0 ? (
                <TabContent />
              ) : (
                children
              )}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
};
