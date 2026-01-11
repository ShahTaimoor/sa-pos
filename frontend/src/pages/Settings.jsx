import React, { useState, useEffect } from 'react';
import { 
  Building, 
  Phone, 
  MapPin, 
  Mail, 
  Save, 
  User,
  Users,
  Plus,
  Trash2,
  Edit,
  Shield,
  UserCheck,
  Upload,
  FileText,
  Printer,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  X,
  Check,
  BarChart3,
  Clock,
  TrendingUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetCompanySettingsQuery,
  useUpdateCompanySettingsMutation,
} from '../store/services/settingsApi';
import {
  useGetUsersQuery,
  useGetUserActivityQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useResetPasswordMutation,
  useUpdateRolePermissionsMutation,
} from '../store/services/usersApi';
import { useChangePasswordMutation } from '../store/services/authApi';
import { LoadingSpinner, LoadingButton } from '../components/LoadingSpinner';
import { handleApiError } from '../utils/errorHandler';
import { useAuth } from '../contexts/AuthContext';

export const Settings2 = () => {
  const { user } = useAuth();

  // Active tab state
  const [activeTab, setActiveTab] = useState('company');

  // Company Information State
  const [companyData, setCompanyData] = useState({
    companyName: '',
    address: '',
    contactNumber: '',
    email: '',
    logo: null,
    taxRegistrationNumber: ''
  });
  const [savingCompanySettings, setSavingCompanySettings] = useState(false);

  // User Management State
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [newUserData, setNewUserData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'cashier',
    status: 'active',
    permissions: {}
  });
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showMyPasswordModal, setShowMyPasswordModal] = useState(false);
  const [passwordResetUser, setPasswordResetUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [rolePermissionsChanged, setRolePermissionsChanged] = useState({});
  const [selectedUserActivity, setSelectedUserActivity] = useState(null);
  const [showActivityModal, setShowActivityModal] = useState(false);

  // Print Preview Settings State
  const [printSettings, setPrintSettings] = useState({
    showLogo: true,
    showDiscount: true,
    showTax: true,
    showDate: true,
    headerText: '',
    footerText: '',
    invoiceLayout: 'standard'
  });

  // Permission categories (matching backend User model enum)
  const permissionCategories = {
    products: {
      name: 'Product Management',
      permissions: [
        { 
          key: 'view_products', 
          name: 'View Products',
          subcategories: [
            { key: 'view_product_list', name: 'Product List' },
            { key: 'view_product_details', name: 'Product Details' },
            { key: 'view_product_categories', name: 'Categories' },
            { key: 'view_product_inventory', name: 'Inventory Levels' }
          ]
        },
        { key: 'create_products', name: 'Create Products' },
        { key: 'edit_products', name: 'Edit Products' },
        { key: 'delete_products', name: 'Delete Products' }
      ]
    },
    customers: {
      name: 'Customer Management',
      permissions: [
        { 
          key: 'view_customers', 
          name: 'View Customers',
          subcategories: [
            { key: 'view_customer_list', name: 'Customer List' },
            { key: 'view_customer_details', name: 'Customer Details' },
            { key: 'view_customer_history', name: 'Purchase History' },
            { key: 'view_customer_balance', name: 'Account Balance' }
          ]
        },
        { key: 'create_customers', name: 'Create Customers' },
        { key: 'edit_customers', name: 'Edit Customers' },
        { key: 'delete_customers', name: 'Delete Customers' }
      ]
    },
    suppliers: {
      name: 'Supplier Management',
      permissions: [
        { 
          key: 'view_suppliers', 
          name: 'View Suppliers',
          subcategories: [
            { key: 'view_supplier_list', name: 'Supplier List' },
            { key: 'view_supplier_details', name: 'Supplier Details' },
            { key: 'view_supplier_orders', name: 'Purchase Orders' },
            { key: 'view_supplier_balance', name: 'Account Balance' }
          ]
        },
        { key: 'create_suppliers', name: 'Create Suppliers' },
        { key: 'edit_suppliers', name: 'Edit Suppliers' },
        { key: 'delete_suppliers', name: 'Delete Suppliers' }
      ]
    },
    orders: {
      name: 'Order Management',
      permissions: [
        { 
          key: 'view_orders', 
          name: 'View Orders',
          subcategories: [
            { key: 'view_sales_orders', name: 'Sales Orders' },
            { key: 'view_purchase_orders', name: 'Purchase Orders' },
            { key: 'view_sales_invoices', name: 'Sales Invoices' },
            { key: 'view_purchase_invoices', name: 'Purchase Invoices' }
          ]
        },
        { key: 'create_orders', name: 'Create Orders' },
        { key: 'edit_orders', name: 'Edit Orders' },
        { key: 'cancel_orders', name: 'Cancel Orders' },
        { key: 'view_cost_prices', name: 'View Cost Prices' },
        // Purchase Operations - Granular
        { 
          key: 'create_purchase_orders', 
          name: 'Create Purchase Orders' 
        },
        { key: 'edit_purchase_orders', name: 'Edit Purchase Orders' },
        { key: 'delete_purchase_orders', name: 'Delete Purchase Orders' },
        { key: 'approve_purchase_orders', name: 'Approve Purchase Orders' },
        { key: 'reject_purchase_orders', name: 'Reject Purchase Orders' },
        { key: 'receive_purchase_orders', name: 'Receive Purchase Orders' },
        { key: 'create_purchase_invoices', name: 'Create Purchase Invoices' },
        { key: 'edit_purchase_invoices', name: 'Edit Purchase Invoices' },
        { key: 'delete_purchase_invoices', name: 'Delete Purchase Invoices' },
        // Sales Operations - Granular
        { key: 'create_sales_orders', name: 'Create Sales Orders' },
        { key: 'edit_sales_orders', name: 'Edit Sales Orders' },
        { key: 'delete_sales_orders', name: 'Delete Sales Orders' },
        { key: 'approve_sales_orders', name: 'Approve Sales Orders' },
        { key: 'reject_sales_orders', name: 'Reject Sales Orders' },
        { key: 'create_sales_invoices', name: 'Create Sales Invoices' },
        { key: 'edit_sales_invoices', name: 'Edit Sales Invoices' },
        { key: 'void_sales_invoices', name: 'Void Sales Invoices' },
        { key: 'apply_discounts', name: 'Apply Discounts' },
        { key: 'override_prices', name: 'Override Prices' }
      ]
    },
    inventory: {
      name: 'Inventory Management',
      permissions: [
        { 
          key: 'view_inventory', 
          name: 'View Inventory',
          subcategories: [
            { key: 'view_inventory_levels', name: 'Inventory Levels' },
            { key: 'view_stock_movements', name: 'Stock Movements' },
            { key: 'view_inventory_reports', name: 'Inventory Reports' },
            { key: 'view_low_stock_alerts', name: 'Low Stock Alerts' }
          ]
        },
        { 
          key: 'update_inventory', 
          name: 'Update Inventory',
          subcategories: [
            { key: 'update_stock_quantities', name: 'Stock Quantities' },
            { key: 'create_stock_adjustments', name: 'Stock Adjustments' },
            { key: 'process_receipts', name: 'Process Receipts' }
          ]
        },
        // Inventory Operations - Granular
        { key: 'generate_purchase_orders', name: 'Generate Purchase Orders' },
        { key: 'acknowledge_inventory_alerts', name: 'Acknowledge Inventory Alerts' },
        { key: 'export_inventory_reports', name: 'Export Inventory Reports' },
        { key: 'import_inventory_data', name: 'Import Inventory Data' }
      ]
    },
    returns: {
      name: 'Returns Management',
      permissions: [
        { 
          key: 'view_returns', 
          name: 'View Returns',
          subcategories: [
            { key: 'view_return_requests', name: 'Return Requests' },
            { key: 'view_return_history', name: 'Return History' },
            { key: 'view_return_reasons', name: 'Return Reasons' }
          ]
        },
        { key: 'create_returns', name: 'Create Returns' },
        { key: 'edit_returns', name: 'Edit Returns' },
        { key: 'approve_returns', name: 'Approve Returns' },
        { key: 'process_returns', name: 'Process Returns' }
      ]
    },
    discounts: {
      name: 'Discount Management',
      permissions: [
        { 
          key: 'view_discounts', 
          name: 'View Discounts',
          subcategories: [
            { key: 'view_discount_list', name: 'Discount List' },
            { key: 'view_discount_rules', name: 'Discount Rules' },
            { key: 'view_discount_history', name: 'Discount History' }
          ]
        },
        { 
          key: 'manage_discounts', 
          name: 'Manage Discounts',
          subcategories: [
            { key: 'create_discounts', name: 'Create Discounts' },
            { key: 'edit_discounts', name: 'Edit Discounts' },
            { key: 'delete_discounts', name: 'Delete Discounts' }
          ]
        }
      ]
    },
    reports: {
      name: 'Reports & Analytics',
      permissions: [
        { 
          key: 'view_reports', 
          name: 'View Reports',
          subcategories: [
            { key: 'view_pl_statements', name: 'P&L Statements' },
            { key: 'view_balance_sheets', name: 'Balance Sheets' },
            { key: 'view_sales_performance', name: 'Sales Performance' },
            { key: 'view_inventory_reports', name: 'Inventory Reports' },
            { key: 'view_general_reports', name: 'Reports' },
            { key: 'view_backdate_report', name: 'Backdate Report' }
          ]
        },
        { key: 'view_analytics', name: 'View Analytics' },
        { key: 'view_customer_analytics', name: 'Customer Analytics' },
        { key: 'view_anomaly_detection', name: 'Anomaly Detection & Fraud Prevention' },
        { key: 'view_recommendations', name: 'View Recommendations' },
        // Reports & Analytics - Granular
        { key: 'export_reports', name: 'Export Reports' },
        { key: 'share_reports', name: 'Share Reports' },
        { key: 'schedule_reports', name: 'Schedule Reports' },
        { key: 'view_advanced_analytics', name: 'View Advanced Analytics' }
      ]
    },
    admin: {
      name: 'System Administration',
      permissions: [
        { 
          key: 'manage_users', 
          name: 'Manage Users',
          subcategories: [
            { key: 'create_users', name: 'Create Users' },
            { key: 'edit_users', name: 'Edit Users' },
            { key: 'delete_users', name: 'Delete Users' },
            { key: 'assign_roles', name: 'Assign Roles' }
          ]
        },
        { 
          key: 'manage_settings', 
          name: 'Manage Settings',
          subcategories: [
            { key: 'company_settings', name: 'Company Settings' },
            { key: 'system_settings', name: 'System Settings' },
            { key: 'print_settings', name: 'Print Settings' },
            { key: 'security_settings', name: 'Security Settings' }
          ]
        },
        { 
          key: 'view_backups', 
          name: 'View Backups',
          subcategories: [
            { key: 'view_backup_list', name: 'Backup List' },
            { key: 'view_backup_logs', name: 'Backup Logs' }
          ]
        },
        { 
          key: 'manage_backups', 
          name: 'Manage Backups',
          subcategories: [
            { key: 'create_backups', name: 'Create Backups' },
            { key: 'restore_backups', name: 'Restore Backups' },
            { key: 'delete_backups', name: 'Delete Backups' }
          ]
        },
        // System Operations
        { key: 'view_audit_logs', name: 'View Audit Logs' },
        { key: 'export_data', name: 'Export Data' },
        { key: 'import_data', name: 'Import Data' },
        { key: 'manage_integrations', name: 'Manage Integrations' },
        { key: 'configure_notifications', name: 'Configure Notifications' }
      ]
    },
    financial: {
      name: 'Financial Operations',
      permissions: [
        {
          key: 'view_cash_receipts',
          name: 'Cash Receipts',
          subcategories: [
            { key: 'view_cash_receipts', name: 'View Cash Receipts' },
            { key: 'create_cash_receipts', name: 'Create Cash Receipts' },
            { key: 'edit_cash_receipts', name: 'Edit Cash Receipts' },
            { key: 'delete_cash_receipts', name: 'Delete Cash Receipts' }
          ]
        },
        {
          key: 'view_cash_payments',
          name: 'Cash Payments',
          subcategories: [
            { key: 'view_cash_payments', name: 'View Cash Payments' },
            { key: 'create_cash_payments', name: 'Create Cash Payments' },
            { key: 'edit_cash_payments', name: 'Edit Cash Payments' },
            { key: 'delete_cash_payments', name: 'Delete Cash Payments' }
          ]
        },
        {
          key: 'view_bank_receipts',
          name: 'Bank Receipts',
          subcategories: [
            { key: 'view_bank_receipts', name: 'View Bank Receipts' },
            { key: 'create_bank_receipts', name: 'Create Bank Receipts' },
            { key: 'edit_bank_receipts', name: 'Edit Bank Receipts' },
            { key: 'delete_bank_receipts', name: 'Delete Bank Receipts' }
          ]
        },
        {
          key: 'view_bank_payments',
          name: 'Bank Payments',
          subcategories: [
            { key: 'view_bank_payments', name: 'View Bank Payments' },
            { key: 'create_bank_payments', name: 'Create Bank Payments' },
            { key: 'edit_bank_payments', name: 'Edit Bank Payments' },
            { key: 'delete_bank_payments', name: 'Delete Bank Payments' }
          ]
        },
        {
          key: 'view_expenses',
          name: 'Expenses',
          subcategories: [
            { key: 'view_expenses', name: 'View Expenses' },
            { key: 'create_expenses', name: 'Create Expenses' },
            { key: 'edit_expenses', name: 'Edit Expenses' },
            { key: 'delete_expenses', name: 'Delete Expenses' },
            { key: 'approve_expenses', name: 'Approve Expenses' }
          ]
        }
      ]
    },
    accounting: {
      name: 'Accounting',
      permissions: [
        { key: 'view_accounting_transactions', name: 'View Transactions' },
        { key: 'view_accounting_accounts', name: 'View Accounts' },
        { key: 'view_trial_balance', name: 'View Trial Balance' },
        { key: 'update_balance_sheet', name: 'Update Balance Sheet' },
        { key: 'view_chart_of_accounts', name: 'View Chart of Accounts' },
        { key: 'view_accounting_summary', name: 'View Financial Summary' }
      ]
    },
    attendance: {
      name: 'Attendance Management',
      permissions: [
        { key: 'clock_attendance', name: 'Clock Attendance' },
        { key: 'clock_in', name: 'Clock In' },
        { key: 'clock_out', name: 'Clock Out' },
        { key: 'manage_attendance_breaks', name: 'Manage Breaks' },
        { key: 'view_own_attendance', name: 'View Own Attendance' },
        { key: 'view_team_attendance', name: 'View Team Attendance' }
      ]
    },
    till: {
      name: 'Till Management',
      permissions: [
        { key: 'open_till', name: 'Open Till' },
        { key: 'close_till', name: 'Close Till' },
        { key: 'view_till', name: 'View Till' }
      ]
    },
    investors: {
      name: 'Investor Management',
      permissions: [
        { key: 'view_investors', name: 'View Investors' },
        { key: 'manage_investors', name: 'Manage Investors' },
        { key: 'create_investors', name: 'Create Investors' },
        { key: 'edit_investors', name: 'Edit Investors' },
        { key: 'payout_investors', name: 'Payout Investors' }
      ]
    }
  };

  // Default role permissions (using correct backend permission names)
  const defaultRolePermissions = {
    admin: {
      // Products
      view_products: true, create_products: true, edit_products: true, delete_products: true,
      view_product_list: true, view_product_details: true, view_product_categories: true, view_product_inventory: true,
      // Customers
      view_customers: true, create_customers: true, edit_customers: true, delete_customers: true,
      view_customer_list: true, view_customer_details: true, view_customer_history: true, view_customer_balance: true,
      // Suppliers
      view_suppliers: true, create_suppliers: true, edit_suppliers: true, delete_suppliers: true,
      view_supplier_list: true, view_supplier_details: true, view_supplier_orders: true, view_supplier_balance: true,
      // Orders
      view_orders: true, create_orders: true, edit_orders: true, cancel_orders: true,
      view_sales_orders: true, view_purchase_orders: true, view_sales_invoices: true, view_purchase_invoices: true,
      view_cost_prices: true,
      // Inventory
      view_inventory: true, update_inventory: true,
      view_inventory_levels: true, view_stock_movements: true, view_low_stock_alerts: true,
      update_stock_quantities: true, create_stock_adjustments: true, process_receipts: true,
      // Returns
      view_returns: true, create_returns: true, edit_returns: true, approve_returns: true, process_returns: true,
      view_return_requests: true, view_return_history: true, view_return_reasons: true,
      // Discounts
      view_discounts: true, manage_discounts: true,
      view_discount_list: true, view_discount_rules: true, view_discount_history: true,
      create_discounts: true, edit_discounts: true, delete_discounts: true,
      // Reports & Analytics
      view_reports: true, view_analytics: true, view_recommendations: true,
      view_pl_statements: true, view_balance_sheets: true, view_sales_performance: true,
      view_inventory_reports: true, view_general_reports: true, view_backdate_report: true,
      view_customer_analytics: true, view_anomaly_detection: true,
      export_reports: true, share_reports: true, schedule_reports: true, view_advanced_analytics: true,
      // Financial Operations
      view_cash_receipts: true, create_cash_receipts: true, edit_cash_receipts: true, delete_cash_receipts: true,
      view_cash_payments: true, create_cash_payments: true, edit_cash_payments: true, delete_cash_payments: true,
      view_bank_receipts: true, create_bank_receipts: true, edit_bank_receipts: true, delete_bank_receipts: true,
      view_bank_payments: true, create_bank_payments: true, edit_bank_payments: true, delete_bank_payments: true,
      view_expenses: true, create_expenses: true, edit_expenses: true, delete_expenses: true, approve_expenses: true,
      // Purchase Operations - Granular
      create_purchase_orders: true, edit_purchase_orders: true, delete_purchase_orders: true,
      approve_purchase_orders: true, reject_purchase_orders: true, receive_purchase_orders: true,
      create_purchase_invoices: true, edit_purchase_invoices: true, delete_purchase_invoices: true,
      // Sales Operations - Granular
      create_sales_orders: true, edit_sales_orders: true, delete_sales_orders: true,
      approve_sales_orders: true, reject_sales_orders: true,
      create_sales_invoices: true, edit_sales_invoices: true, void_sales_invoices: true,
      apply_discounts: true, override_prices: true,
      // Inventory Operations - Granular
      generate_purchase_orders: true, acknowledge_inventory_alerts: true,
      export_inventory_reports: true, import_inventory_data: true,
      // Accounting
      view_accounting_transactions: true, view_accounting_accounts: true, view_trial_balance: true,
      update_balance_sheet: true, view_chart_of_accounts: true, view_accounting_summary: true,
      // Attendance
      clock_attendance: true, clock_in: true, clock_out: true, manage_attendance_breaks: true,
      view_own_attendance: true, view_team_attendance: true,
      // Till Management
      open_till: true, close_till: true, view_till: true,
      // Investor Management
      view_investors: true, manage_investors: true, create_investors: true, edit_investors: true, payout_investors: true,
      // Administration
      manage_users: true, manage_settings: true, view_backups: true, manage_backups: true,
      create_users: true, edit_users: true, delete_users: true, assign_roles: true,
      company_settings: true, system_settings: true, print_settings: true, security_settings: true,
      view_backup_list: true, view_backup_logs: true, create_backups: true, restore_backups: true, delete_backups: true,
      view_audit_logs: true, export_data: true, import_data: true,
      manage_integrations: true, configure_notifications: true
    },
    manager: {
      // Products - Full access except delete
      view_products: true, create_products: true, edit_products: true,
      view_product_list: true, view_product_details: true, view_product_categories: true, view_product_inventory: true,
      // Customers - Full access
      view_customers: true, create_customers: true, edit_customers: true, delete_customers: true,
      view_customer_list: true, view_customer_details: true, view_customer_history: true, view_customer_balance: true,
      // Suppliers - Full access
      view_suppliers: true, create_suppliers: true, edit_suppliers: true, delete_suppliers: true,
      view_supplier_list: true, view_supplier_details: true, view_supplier_orders: true, view_supplier_balance: true,
      // Orders - Full access
      view_orders: true, create_orders: true, edit_orders: true, cancel_orders: true,
      view_sales_orders: true, view_purchase_orders: true, view_sales_invoices: true, view_purchase_invoices: true,
      view_cost_prices: true,
      // Inventory - Full access
      view_inventory: true, update_inventory: true,
      view_inventory_levels: true, view_stock_movements: true, view_low_stock_alerts: true,
      update_stock_quantities: true, create_stock_adjustments: true, process_receipts: true,
      // Returns - Full access
      view_returns: true, create_returns: true, edit_returns: true, approve_returns: true, process_returns: true,
      view_return_requests: true, view_return_history: true, view_return_reasons: true,
      // Discounts - Full access
      view_discounts: true, manage_discounts: true,
      view_discount_list: true, view_discount_rules: true, view_discount_history: true,
      create_discounts: true, edit_discounts: true, delete_discounts: true,
      // Reports & Analytics - Full access
      view_reports: true, view_analytics: true, view_recommendations: true,
      view_pl_statements: true, view_balance_sheets: true, view_sales_performance: true,
      view_inventory_reports: true, view_general_reports: true, view_backdate_report: true,
      view_customer_analytics: true, view_anomaly_detection: true,
      export_reports: true, share_reports: true, schedule_reports: true, view_advanced_analytics: true,
      // Financial Operations
      view_cash_receipts: true, create_cash_receipts: true, edit_cash_receipts: true, delete_cash_receipts: true,
      view_cash_payments: true, create_cash_payments: true, edit_cash_payments: true, delete_cash_payments: true,
      view_bank_receipts: true, create_bank_receipts: true, edit_bank_receipts: true, delete_bank_receipts: true,
      view_bank_payments: true, create_bank_payments: true, edit_bank_payments: true, delete_bank_payments: true,
      view_expenses: true, create_expenses: true, edit_expenses: true, delete_expenses: true, approve_expenses: true,
      // Purchase Operations - Granular
      create_purchase_orders: true, edit_purchase_orders: true, delete_purchase_orders: true,
      approve_purchase_orders: true, reject_purchase_orders: true, receive_purchase_orders: true,
      create_purchase_invoices: true, edit_purchase_invoices: true, delete_purchase_invoices: true,
      // Sales Operations - Granular
      create_sales_orders: true, edit_sales_orders: true, delete_sales_orders: true,
      approve_sales_orders: true, reject_sales_orders: true,
      create_sales_invoices: true, edit_sales_invoices: true, void_sales_invoices: true,
      apply_discounts: true, override_prices: true,
      // Inventory Operations - Granular
      generate_purchase_orders: true, acknowledge_inventory_alerts: true,
      export_inventory_reports: true, import_inventory_data: true,
      // Accounting
      view_accounting_transactions: true, view_accounting_accounts: true, view_trial_balance: true,
      update_balance_sheet: true, view_chart_of_accounts: true, view_accounting_summary: true,
      // Attendance
      clock_attendance: true, clock_in: true, clock_out: true, manage_attendance_breaks: true,
      view_own_attendance: true, view_team_attendance: true,
      // Till Management
      open_till: true, close_till: true, view_till: true,
      // Investor Management
      view_investors: true, manage_investors: true, create_investors: true, edit_investors: true, payout_investors: true
    },
    cashier: {
      // Products - View only with basic details
      view_products: true,
      view_product_list: true, view_product_details: true,
      // Customers - View and create, limited edit
      view_customers: true, create_customers: true, edit_customers: true,
      view_customer_list: true, view_customer_details: true,
      // Orders - View and create sales orders only
      view_orders: true, create_orders: true,
      view_sales_orders: true, view_sales_invoices: true,
      // Inventory - View levels and basic movements
      view_inventory: true,
      view_inventory_levels: true, view_stock_movements: true,
      // Returns - View and process returns
      view_returns: true, process_returns: true,
      view_return_requests: true, view_return_history: true,
      // Discounts - View only
      view_discounts: true,
      view_discount_list: true,
      // Reports - Limited access
      view_reports: true,
      view_general_reports: true
    },
    viewer: {
      // Products - View only, basic details
      view_products: true,
      view_product_list: true, view_product_details: true,
      // Customers - View only, basic details
      view_customers: true,
      view_customer_list: true, view_customer_details: true,
      // Suppliers - View only, basic details
      view_suppliers: true,
      view_supplier_list: true, view_supplier_details: true,
      // Orders - View only
      view_orders: true,
      view_sales_orders: true, view_purchase_orders: true, view_sales_invoices: true, view_purchase_invoices: true,
      // Inventory - View only, basic levels
      view_inventory: true,
      view_inventory_levels: true,
      // Returns - View only
      view_returns: true,
      view_return_requests: true, view_return_history: true,
      // Discounts - View only
      view_discounts: true,
      view_discount_list: true,
      // Reports - Limited financial reports
      view_reports: true,
      view_pl_statements: true, view_balance_sheets: true, view_general_reports: true
    }
  };

  // Fetch company settings
  const { data: settingsResponse, isLoading: companyLoading, refetch: refetchSettings } = useGetCompanySettingsQuery();
  const [updateCompanySettings] = useUpdateCompanySettingsMutation();
  const settings = settingsResponse?.data || settingsResponse;

  // Map settings data to component state
  useEffect(() => {
    if (settings) {
      const mappedData = {
        companyName: settings.companyName || '',
        address: settings.address || '',
        contactNumber: settings.contactNumber || '',
        email: settings.email || '',
        logo: settings.logo || null,
        taxRegistrationNumber: settings.taxId || '' // Map taxId back to taxRegistrationNumber
      };
      setCompanyData(mappedData);
    }
  }, [settings]);

  // Fetch users
  const { data: usersResponse, isLoading: usersLoading, error: usersError, refetch: refetchUsers } = useGetUsersQuery(
    undefined,
    {
      onError: (error) => {
        if (error?.status === 403) {
          toast.error('Access denied. You need "manage_users" permission to view users.');
        } else if (error?.status === 401) {
          toast.error('Authentication required. Please log in again.');
        } else {
          toast.error(`Failed to load users: ${error?.data?.message || error?.message || 'Unknown error'}`);
        }
        setUsers([]);
      },
    }
  );

  // Extract users from response
  React.useEffect(() => {
    if (usersResponse) {
      let usersArray = null;
      
      // Primary path: data.data.users (backend structure)
      if (usersResponse?.data?.users && Array.isArray(usersResponse.data.users)) {
        usersArray = usersResponse.data.users;
      } 
      // Fallback: data.users
      else if (usersResponse?.users && Array.isArray(usersResponse.users)) {
        usersArray = usersResponse.users;
      } 
      // Fallback: direct array
      else if (Array.isArray(usersResponse)) {
        usersArray = usersResponse.filter(item => item._id && item.email);
      }
      // Deep search fallback
      else {
        const findUsers = (obj, depth = 0) => {
          if (depth > 5) return null;
          if (Array.isArray(obj)) {
            if (obj.length > 0 && obj[0]?._id && obj[0]?.email) {
              return obj;
            }
          }
          if (typeof obj === 'object' && obj !== null) {
            for (const key in obj) {
              if (key === 'users' && Array.isArray(obj[key])) {
                return obj[key];
              }
              const result = findUsers(obj[key], depth + 1);
              if (result) return result;
            }
          }
          return null;
        };
        usersArray = findUsers(usersResponse);
      }
      
      if (usersArray && Array.isArray(usersArray)) {
        setUsers(usersArray);
      } else {
        setUsers([]);
      }
    }
  }, [usersResponse]);

  // Sync companyData with settings query data
  useEffect(() => {
    if (settings?.data?.data && !companyLoading) {
      setCompanyData(prev => {
        const newData = {
          companyName: settings.data.data.companyName || '',
          address: settings.data.data.address || '',
          contactNumber: settings.data.data.contactNumber || '',
          email: settings.data.data.email || '',
          logo: settings.data.data.logo || null,
          taxRegistrationNumber: settings.data.data.taxId || ''
        };
        
        // Only update if data has changed
        if (JSON.stringify(prev) !== JSON.stringify(newData)) {
          return newData;
        }
        return prev;
      });
    }
  }, [settings?.data?.data, companyLoading]);

  // Additional sync effect that triggers on component mount
  useEffect(() => {
    if (settings?.data?.data && !companyLoading) {
      const newData = {
        companyName: settings.data.data.companyName || '',
        address: settings.data.data.address || '',
        contactNumber: settings.data.data.contactNumber || '',
        email: settings.data.data.email || '',
        logo: settings.data.data.logo || null,
        taxRegistrationNumber: settings.data.data.taxId || ''
      };
      setCompanyData(newData);
    }
  }, []); // Run only on mount

  // Save company settings handler
  const handleSaveCompanySettings = async (data) => {
    setSavingCompanySettings(true);
    try {
      const response = await updateCompanySettings(data).unwrap();
      toast.success('Company information updated successfully!');
      
      // Update local state with saved data
      if (response?.data) {
        const updatedData = {
          companyName: response.data.companyName || '',
          address: response.data.address || '',
          contactNumber: response.data.contactNumber || '',
          email: response.data.email || '',
          logo: response.data.logo || null,
          taxRegistrationNumber: response.data.taxId || '' // Map taxId back to taxRegistrationNumber
        };
        setCompanyData(updatedData);
      }
      
      // Refetch settings to ensure everything is in sync
      refetchSettings();
    } catch (error) {
      handleApiError(error, 'Company Information Update');
    } finally {
      setSavingCompanySettings(false);
    }
  };

  // Mutations
  const [createUser, { isLoading: isCreatingUser }] = useCreateUserMutation();
  const [updateUser, { isLoading: isUpdatingUser }] = useUpdateUserMutation();
  const [deleteUser, { isLoading: isDeletingUser }] = useDeleteUserMutation();
  const [resetPassword, { isLoading: isResettingPassword }] = useResetPasswordMutation();
  const [changeMyPassword, { isLoading: isChangingMyPassword }] = useChangePasswordMutation();
  const [updateRolePermissions, { isLoading: isUpdatingRolePermissions }] = useUpdateRolePermissionsMutation();

  // User activity query
  const { data: userActivityResponse, isLoading: activityLoading, refetch: refetchActivity } = useGetUserActivityQuery(
    selectedUserActivity?.id,
    {
      skip: !selectedUserActivity?.id,
    }
  );

  React.useEffect(() => {
    if (userActivityResponse?.data) {
      setSelectedUserActivity(prev => ({ ...prev, activity: userActivityResponse.data }));
    }
  }, [userActivityResponse]);

  // Handlers
  const createUserAsync = async (userData) => {
    try {
      await createUser(userData).unwrap();
      toast.success('User created successfully!');
      resetNewUserForm();
      refetchUsers();
    } catch (error) {
      handleApiError(error, 'User Creation');
    }
  };

  const handleUpdateUser = async (id, data) => {
    try {
      await updateUser({ id, ...data }).unwrap();
      toast.success('User updated successfully!');
      setEditingUser(null);
      refetchUsers();
    } catch (error) {
      handleApiError(error, 'User Update');
    }
  };

  const handleDeleteUser = async (id) => {
    try {
      await deleteUser(id).unwrap();
      toast.success('User deleted successfully!');
      refetchUsers();
    } catch (error) {
      handleApiError(error, 'User Deletion');
    }
  };

  // Handlers
  const handleCompanyChange = (e) => {
    const { name, value } = e.target;
    setCompanyData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCompanySubmit = (e) => {
    e.preventDefault();
    
    // Map frontend field names to backend field names
    const dataToSend = {
      companyName: companyData.companyName,
      contactNumber: companyData.contactNumber,
      address: companyData.address,
      email: companyData.email,
      taxId: companyData.taxRegistrationNumber, // Map taxRegistrationNumber to taxId
      logo: companyData.logo
    };
    
    handleSaveCompanySettings(dataToSend);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // In a real app, you'd upload the file to a server
      // For now, we'll just store the file name
    setCompanyData(prev => ({
      ...prev,
        logo: file.name
    }));
      toast.success('Logo uploaded successfully!');
    }
  };

  const handleNewUserChange = (e) => {
    const { name, value } = e.target;
    setNewUserData(prev => ({
      ...prev,
      [name]: value
    }));

    // Auto-apply default permissions when role changes
    if (name === 'role' && defaultRolePermissions[value]) {
      setNewUserData(prev => ({
      ...prev,
        permissions: defaultRolePermissions[value]
    }));
    }
  };

  const handleCreateUser = (e) => {
    e.preventDefault();
    
    // Validation
    if (!newUserData.firstName.trim()) {
      toast.error('First name is required');
      return;
    }
    
    if (!newUserData.lastName.trim()) {
      toast.error('Last name is required');
      return;
    }
    
    if (!newUserData.email.trim()) {
      toast.error('Email is required');
      return;
    }
    
    if (!newUserData.password.trim()) {
      toast.error('Password is required');
      return;
    }
    
    if (newUserData.password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }
    
    // Convert permissions object to array format expected by backend
    const permissionsArray = Object.keys(newUserData.permissions).filter(key => newUserData.permissions[key]);
    
    const userDataToSend = {
      ...newUserData,
      permissions: permissionsArray
    };
    
    createUserAsync(userDataToSend);
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    
    // Convert permissions array to object format for the form
    const permissionsObject = {};
    if (user.permissions && Array.isArray(user.permissions)) {
      user.permissions.forEach(permission => {
        permissionsObject[permission] = true;
      });
    }
    
    setNewUserData({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      password: '',
      role: user.role || 'cashier',
      status: user.status || 'active',
      permissions: permissionsObject
    });
  };

  const handleUpdateUserSubmit = (e) => {
    e.preventDefault();
    if (editingUser) {
    // Validation
    if (!newUserData.firstName.trim()) {
      toast.error('First name is required');
      return;
    }
    
    if (!newUserData.lastName.trim()) {
      toast.error('Last name is required');
      return;
    }
    
    if (!newUserData.email.trim()) {
      toast.error('Email is required');
      return;
    }
    
      // Convert permissions object to array format expected by backend
      const permissionsArray = Object.keys(newUserData.permissions).filter(key => newUserData.permissions[key]);
      
      // If editing own account, prevent changing role and status
      const userDataToSend = {
        firstName: newUserData.firstName,
        lastName: newUserData.lastName,
        email: newUserData.email,
        permissions: permissionsArray
      };
      
      // Only include role and status if NOT editing own account
      if (editingUser._id !== user?._id) {
        userDataToSend.role = newUserData.role;
        userDataToSend.status = newUserData.status;
      }
      
      handleUpdateUser(editingUser._id, userDataToSend);
    }
  };

  const handleDeleteUserClick = (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      handleDeleteUser(userId);
    }
  };

  const handlePermissionChange = (permissionKey, isChecked) => {
    setNewUserData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permissionKey]: isChecked
      }
    }));
    
    // Track role permission changes for bulk updates
    if (newUserData.role) {
      setRolePermissionsChanged(prev => ({
        ...prev,
        [newUserData.role]: {
          ...prev[newUserData.role],
          [permissionKey]: isChecked
        }
      }));
    }
  };

  const handlePrintSettingsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setPrintSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const resetNewUserForm = () => {
    setNewUserData({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      role: 'cashier',
      status: 'active',
      permissions: {}
    });
    setEditingUser(null);
  };

  const handlePasswordReset = () => {
    if (!newPassword.trim()) {
      toast.error('New password is required');
      return;
    }
    
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    const targetUser = passwordResetUser || editingUser;
    if (!targetUser?._id) {
      toast.error('User not selected');
      return;
    }
    
    handleResetPassword(targetUser._id, newPassword);
  };

  const handleChangeMyPassword = () => {
    if (!currentPassword.trim()) {
      toast.error('Current password is required');
      return;
    }
    
    if (!newPassword.trim()) {
      toast.error('New password is required');
      return;
    }
    
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    handleChangeMyPassword(currentPassword, newPassword);
  };

  const openPasswordModal = (userToReset = null) => {
    // If userToReset is provided, it's for resetting another user's password
    // If null, it opens for editing the current user being edited
    if (userToReset) {
      setPasswordResetUser(userToReset);
    } else {
      // Use current editingUser if no user provided
      setPasswordResetUser(editingUser);
    }
    setShowPasswordModal(true);
    setNewPassword('');
    setConfirmPassword('');
  };

  const openMyPasswordModal = () => {
    setShowMyPasswordModal(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleUpdateRolePermissions = (role) => {
    if (!rolePermissionsChanged[role]) {
      toast.error('No permission changes detected for this role');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to update permissions for ALL users with "${role}" role? This will override their current permissions.`
    );
    
    if (confirmed) {
      // Get the current permissions for this role
      const currentPermissions = newUserData.permissions;
      const permissionKeys = Object.keys(currentPermissions);
      
      handleUpdateRolePermissions(role, permissionKeys.filter(key => currentPermissions[key]));
    }
  };

  const openActivityModal = (user) => {
    setSelectedUserActivity({
      id: user._id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role
    });
    setShowActivityModal(true);
  };

  // Load company settings on component mount
  useEffect(() => {
    refetchSettings();
  }, [refetchSettings]);

  const tabs = [
    { id: 'company', name: 'Company Information', icon: Building },
    { id: 'users', name: 'Users Control', icon: Users },
    { id: 'print', name: 'Print Preview Settings', icon: Printer }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings 2</h1>
          <p className="text-gray-600">Advanced system configuration and management</p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => {
              refetchSettings();
              refetchUsers();
            }}
            className="btn btn-primary btn-sm"
            disabled={companyLoading || usersLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(companyLoading || usersLoading) ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </nav>
            </div>

      {/* Tab Content */}
      <div className="mt-6">
        {/* Company Information Tab */}
        {activeTab === 'company' && (
      <div className="card">
        <div className="card-header">
          <div className="flex items-center space-x-2">
            <Building className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold">Company Information</h2>
          </div>
          <p className="text-sm text-gray-600 mt-1">
                Manage your company details and branding information
          </p>
        </div>

        <div className="card-content">
          <form onSubmit={handleCompanySubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Company Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center space-x-2">
                  <Building className="h-4 w-4" />
                  <span>Company Name *</span>
                </div>
              </label>
              <input
                type="text"
                name="companyName"
                value={companyData.companyName}
                onChange={handleCompanyChange}
                className="input"
                placeholder="Enter company name"
                required
              />
            </div>

            {/* Contact Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center space-x-2">
                  <Phone className="h-4 w-4" />
                  <span>Contact Number *</span>
                </div>
              </label>
              <input
                type="text"
                name="contactNumber"
                value={companyData.contactNumber}
                onChange={handleCompanyChange}
                className="input"
                placeholder="Enter contact number"
                required
              />
            </div>

                  {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4" />
                        <span>Email *</span>
                </div>
              </label>
              <input
                type="email"
                name="email"
                value={companyData.email}
                onChange={handleCompanyChange}
                className="input"
                placeholder="Enter email address"
                      required
              />
            </div>

                  {/* Tax Registration Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4" />
                        <span>Tax Registration Number</span>
                </div>
              </label>
                    <input
                      type="text"
                      name="taxRegistrationNumber"
                      value={companyData.taxRegistrationNumber}
                      onChange={handleCompanyChange}
                className="input"
                      placeholder="Enter tax registration number"
                    />
                  </div>
            </div>

                {/* Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center space-x-2">
                      <MapPin className="h-4 w-4" />
                      <span>Address *</span>
                </div>
              </label>
                  <textarea
                    name="address"
                    value={companyData.address}
                    onChange={handleCompanyChange}
                className="input"
                    placeholder="Enter complete address"
                    rows="3"
                    required
                  />
            </div>

                {/* Logo Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center space-x-2">
                      <Upload className="h-4 w-4" />
                      <span>Company Logo</span>
                </div>
              </label>
                  <div className="flex items-center space-x-4">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                className="input"
                    />
                    {companyData.logo && (
                      <span className="text-sm text-green-600 flex items-center">
                        <Check className="h-4 w-4 mr-1" />
                        {companyData.logo}
                      </span>
                    )}
                  </div>
              <p className="text-xs text-gray-500 mt-1">
                    Upload your company logo (PNG, JPG, GIF - Max 2MB)
              </p>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t">
              <LoadingButton
                type="submit"
                    isLoading={savingCompanySettings}
                className="btn btn-primary"
              >
                <Save className="h-4 w-4 mr-2" />
                    Save Company Information
              </LoadingButton>
            </div>
          </form>

              {/* Current Saved Company Information - Editable Section */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
                      <Building className="h-5 w-5 text-blue-600" />
                      <h3 className="text-lg font-semibold text-blue-800">Current Saved Company Information</h3>
          </div>
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={() => {
                          refetchSettings();
                        }}
                        className="btn btn-primary btn-sm"
                        disabled={companyLoading}
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${companyLoading ? 'animate-spin' : ''}`} />
                        {companyLoading ? 'Loading...' : 'Load Data'}
                      </button>
                      <button
                        onClick={() => {
                          refetchSettings();
                        }}
                        className="btn btn-secondary btn-sm"
                        disabled={companyLoading}
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${companyLoading ? 'animate-spin' : ''}`} />
                        Force Refresh
                      </button>
                      <div className="text-sm text-blue-600">
                        {settings?.updatedAt && (
                          <span>Last Updated: {new Date(settings.updatedAt).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-6">
                    View and edit your currently saved company information. Changes here will update the saved data.
                  </p>


                  <form onSubmit={handleCompanySubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Company Name */}
                <div>
                        <label className="block text-sm font-medium text-blue-800 mb-2">
                          <div className="flex items-center space-x-2">
                            <Building className="h-4 w-4" />
                            <span>Company Name *</span>
                  </div>
                        </label>
                        <input
                          type="text"
                          name="companyName"
                          value={companyData.companyName}
                          onChange={handleCompanyChange}
                          className="input bg-white border-blue-300 focus:border-blue-500"
                          placeholder="Enter company name"
                          required
                        />
                </div>

                      {/* Contact Number */}
                <div>
                        <label className="block text-sm font-medium text-blue-800 mb-2">
                          <div className="flex items-center space-x-2">
                            <Phone className="h-4 w-4" />
                            <span>Contact Number *</span>
                  </div>
                        </label>
                        <input
                          type="text"
                          name="contactNumber"
                          value={companyData.contactNumber}
                          onChange={handleCompanyChange}
                          className="input bg-white border-blue-300 focus:border-blue-500"
                          placeholder="Enter contact number"
                          required
                        />
                </div>

                      {/* Email */}
                <div>
                        <label className="block text-sm font-medium text-blue-800 mb-2">
                          <div className="flex items-center space-x-2">
                            <Mail className="h-4 w-4" />
                            <span>Email *</span>
                  </div>
                        </label>
                        <input
                          type="email"
                          name="email"
                          value={companyData.email}
                          onChange={handleCompanyChange}
                          className="input bg-white border-blue-300 focus:border-blue-500"
                          placeholder="Enter email address"
                          required
                        />
            </div>

                      {/* Tax Registration Number */}
            <div>
                        <label className="block text-sm font-medium text-blue-800 mb-2">
                    <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4" />
                            <span>Tax Registration Number</span>
                    </div>
                  </label>
                    <input
                          type="text"
                          name="taxRegistrationNumber"
                          value={companyData.taxRegistrationNumber}
                          onChange={handleCompanyChange}
                          className="input bg-white border-blue-300 focus:border-blue-500"
                          placeholder="Enter tax registration number"
                        />
                  </div>
                </div>

                    {/* Address */}
                <div>
                      <label className="block text-sm font-medium text-blue-800 mb-2">
                    <div className="flex items-center space-x-2">
                          <MapPin className="h-4 w-4" />
                          <span>Address *</span>
                    </div>
                  </label>
                      <textarea
                        name="address"
                        value={companyData.address}
                        onChange={handleCompanyChange}
                        className="input bg-white border-blue-300 focus:border-blue-500"
                        placeholder="Enter complete address"
                        rows="3"
                      required
                    />
                </div>

                    {/* Logo Upload */}
                <div>
                      <label className="block text-sm font-medium text-blue-800 mb-2">
                    <div className="flex items-center space-x-2">
                          <Upload className="h-4 w-4" />
                          <span>Company Logo</span>
                    </div>
                  </label>
                      <div className="flex items-center space-x-4">
                    <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="input bg-white border-blue-300 focus:border-blue-500"
                        />
                        {companyData.logo && (
                          <span className="text-sm text-green-600 flex items-center">
                            <Check className="h-4 w-4 mr-1" />
                            {companyData.logo}
                          </span>
                        )}
                  </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Upload your company logo (PNG, JPG, GIF - Max 2MB)
                      </p>
                </div>

                    {/* Update Button */}
                    <div className="flex justify-end pt-4 border-t border-blue-200">
                  <LoadingButton
                    type="submit"
                        isLoading={savingCompanySettings}
                        className="btn btn-primary bg-blue-600 hover:bg-blue-700"
                  >
                        <Save className="h-4 w-4 mr-2" />
                        Update Company Information
                  </LoadingButton>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
        )}


        {/* Users Control Tab */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Users List */}
            <div className="card">
              <div className="card-header">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <UserCheck className="h-5 w-5 text-gray-600" />
                    <h2 className="text-lg font-semibold">System Users ({users.length})</h2>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        resetNewUserForm();
                        const form = document.getElementById('add-edit-user-form');
                        if (form) {
                          form.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          setTimeout(() => {
                            const firstInput = form.querySelector('input[type="text"]');
                            if (firstInput) {
                              firstInput.focus();
                            }
                          }, 300);
                        }
                      }}
                      className="btn btn-primary btn-sm"
                      title="Add New User"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add New User
                    </button>
                    <button
                      onClick={() => refetchUsers()}
                      className="btn btn-secondary btn-sm"
                      disabled={usersLoading}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${usersLoading ? 'animate-spin' : ''}`} />
                      {usersLoading ? 'Loading...' : 'Refresh Users'}
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Manage existing users and their permissions. Admin users have full system access.
                </p>
                
              </div>

              <div className="card-content">
                  {usersLoading ? (
                    <div className="flex justify-center py-8">
                      <LoadingSpinner />
                    </div>
                ) : usersError ? (
                  <div className="text-center py-8">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
                      <div className="flex items-center justify-center mb-4">
                        <X className="h-12 w-12 text-red-500" />
                      </div>
                      <h3 className="text-lg font-semibold text-red-800 mb-2">Failed to Load Users</h3>
                      <p className="text-sm text-red-600 mb-4">
                        {usersError.response?.status === 403 
                          ? 'You need "manage_users" permission to view users. Please contact an administrator.'
                          : usersError.response?.status === 401
                          ? 'Authentication required. Please refresh the page and log in again.'
                          : usersError.message || 'An error occurred while loading users.'}
                      </p>
                      <button
                        onClick={() => refetchUsers()}
                        className="btn btn-primary btn-sm"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Try Again
                      </button>
                    </div>
                  </div>
                ) : users.length > 0 ? (
                  <div className="space-y-3">
                    {users.map((systemUser) => (
                        <div
                          key={systemUser._id}
                        className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <User className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {systemUser.firstName} {systemUser.lastName}
                              </p>
                              <p className="text-xs text-gray-500">
                                {systemUser.email}
                              </p>
                              <div className="flex items-center space-x-3 mt-1">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  systemUser.role === 'admin' ? 'bg-red-100 text-red-800' :
                                  systemUser.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                                  systemUser.role === 'cashier' ? 'bg-green-100 text-green-800' :
                                systemUser.role === 'inventory' ? 'bg-purple-100 text-purple-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {systemUser.role.charAt(0).toUpperCase() + systemUser.role.slice(1)}
                              </span>
                              
                              {/* Activity Status */}
                              {systemUser.lastLogin && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  systemUser.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  <div className={`w-2 h-2 rounded-full mr-1 ${systemUser.isActive ? 'bg-green-400' : 'bg-red-400'}`}></div>
                                  {systemUser.isActive ? 'Active' : 'Inactive'}
                                </span>
                              )}
                              
                              {/* Login Count */}
                              {systemUser.loginCount > 0 && (
                                <span className="text-xs text-gray-500">
                                  {systemUser.loginCount} logins
                                </span>
                              )}
                            </div>
                            </div>
                          </div>
                          
                        <div className="flex items-center space-x-3">
                            <div className={`h-2 w-2 rounded-full ${systemUser.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <span className="text-xs text-gray-500">
                              {systemUser.status === 'active' ? 'Active' : 'Inactive'}
                            </span>
                            {systemUser._id === user?._id && (
                              <span className="text-xs text-blue-600 font-medium">(You)</span>
                            )}
                          <div className="flex space-x-2">
                            <button
                              onClick={() => openActivityModal(systemUser)}
                              className="btn btn-primary btn-sm"
                              title="View Activity"
                            >
                              <BarChart3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openPasswordModal(systemUser)}
                              className="btn btn-secondary btn-sm"
                              title="Change Password"
                            >
                              <Lock className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleEditUser(systemUser)}
                              className="btn btn-secondary btn-sm"
                              title="Edit User"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUserClick(systemUser._id)}
                              className="btn btn-danger btn-sm"
                              disabled={systemUser._id === user?._id}
                              title="Delete User"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-700 font-medium mb-2">No users found</p>
                      <p className="text-sm text-gray-500 mb-4">
                        The system has no users registered yet. Use the form below to create your first user.
                      </p>
                      <button
                        onClick={() => {
                          const form = document.getElementById('add-edit-user-form');
                          if (form) {
                            form.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            // Focus on first input field
                            setTimeout(() => {
                              const firstInput = form.querySelector('input[type="text"]');
                              if (firstInput) {
                                firstInput.focus();
                              }
                            }, 300);
                          }
                        }}
                        className="btn btn-primary btn-sm"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create First User
                      </button>
                    </div>
                  )}
                </div>
              </div>

            {/* Add/Edit User Form */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-gray-600" />
                    <h2 className="text-lg font-semibold">
                      {editingUser ? 'Edit User' : 'Add New User'}
                    </h2>
              </div>
                  {editingUser && (
                <button
                      onClick={resetNewUserForm}
                      className="btn btn-secondary btn-sm"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel Edit
                </button>
                  )}
            </div>
            <p className="text-sm text-gray-600 mt-1">
                  {editingUser ? 'Update user information and permissions' : 'Create a new system user with specific roles and permissions'}
            </p>
          </div>

          <div className="card-content">
                <form id="add-edit-user-form" key={editingUser?._id || 'new-user'} onSubmit={editingUser ? handleUpdateUserSubmit : handleCreateUser} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* First Name */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            First Name *
                          </label>
                          <input
                            type="text"
                            name="firstName"
                            value={newUserData.firstName}
                            onChange={handleNewUserChange}
                        className="input"
                            placeholder="Enter first name"
                            autoComplete="off"
                            required
                          />
                        </div>

                    {/* Last Name */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Last Name *
                          </label>
                          <input
                            type="text"
                            name="lastName"
                            value={newUserData.lastName}
                            onChange={handleNewUserChange}
                        className="input"
                            placeholder="Enter last name"
                            autoComplete="off"
                            required
                          />
                        </div>

                    {/* Email */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Email Address *
                          </label>
                          <input
                            type="email"
                            name="email"
                            value={newUserData.email}
                            onChange={handleNewUserChange}
                            className="input"
                            placeholder="Enter email address"
                            autoComplete="off"
                            required
                          />
                        </div>

                    {/* Password (only for new users) */}
                    {!editingUser && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Password *
                          </label>
                          <div className="relative">
                            <input
                              type={showNewUserPassword ? 'text' : 'password'}
                              name="password"
                              value={newUserData.password}
                              onChange={handleNewUserChange}
                            className="input pr-10"
                              placeholder="Enter password"
                              autoComplete="new-password"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                              className="absolute inset-y-0 right-0 pr-3 flex items-center"
                            >
                              {showNewUserPassword ? (
                                <EyeOff className="h-4 w-4 text-gray-400" />
                              ) : (
                                <Eye className="h-4 w-4 text-gray-400" />
                              )}
                            </button>
                          </div>
                        </div>
                    )}

                    {/* Change Password button (only for editing users) */}
                    {editingUser && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={openPasswordModal}
                          className="btn btn-secondary w-full"
                        >
                          <Lock className="h-4 w-4 mr-2" />
                          Change Password
                        </button>
                        <p className="text-xs text-gray-500 mt-1">
                          Click to reset the user's password
                        </p>
                      </div>
                    )}

                    {/* Role */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Role * {editingUser && editingUser._id === user?._id && <span className="text-xs text-gray-500">(Cannot change your own role)</span>}
                          </label>
                          <select
                            name="role"
                            value={newUserData.role}
                            onChange={handleNewUserChange}
                            className="input"
                            required
                            disabled={editingUser && editingUser._id === user?._id}
                          >
                        <option value="cashier">Cashier - Basic sales operations</option>
                        <option value="manager">Manager - Full operational access</option>
                        <option value="admin">Admin - Full system access including user management</option>
                        <option value="viewer">Viewer - Read-only access</option>
                          </select>
                      <p className="text-xs text-gray-500 mt-1">
                        {editingUser && editingUser._id === user?._id 
                          ? 'You cannot change your own role. Contact another administrator if needed.'
                          : 'Admin users have full system access and can manage other users'}
                      </p>
                      
                      {/* Update Role Permissions Button */}
                      {rolePermissionsChanged[newUserData.role] && (
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-yellow-800">
                              <strong>⚠️ Permission changes detected</strong>
                              <p className="text-xs text-yellow-600 mt-1">
                                You've modified permissions for the {newUserData.role} role
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleUpdateRolePermissions(newUserData.role)}
                              disabled={isUpdatingRolePermissions}
                              className="btn btn-warning btn-sm"
                            >
                              {isUpdatingRolePermissions ? (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                  Updating...
                                </>
                              ) : (
                                <>
                                  <Users className="h-4 w-4 mr-2" />
                                  Update All {newUserData.role}s
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                        </div>

                    {/* Status */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Status {editingUser && editingUser._id === user?._id && <span className="text-xs text-gray-500">(Cannot change your own status)</span>}
                          </label>
                          <div className="flex space-x-4">
                            <label className="flex items-center">
                              <input
                                type="radio"
                                name="status"
                            value="active"
                                checked={newUserData.status === 'active'}
                            onChange={handleNewUserChange}
                                className="mr-2"
                                disabled={editingUser && editingUser._id === user?._id}
                              />
                              <span className="text-sm text-gray-700">Active</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="radio"
                                name="status"
                            value="inactive"
                                checked={newUserData.status === 'inactive'}
                            onChange={handleNewUserChange}
                                className="mr-2"
                                disabled={editingUser && editingUser._id === user?._id}
                              />
                          <span className="text-sm text-gray-700">Inactive</span>
                            </label>
                          </div>
                          {editingUser && editingUser._id === user?._id && (
                            <p className="text-xs text-gray-500 mt-1">
                              You cannot change your own status. Contact another administrator if needed.
                            </p>
                          )}
                          
                          {/* Create User Button - Only shown when adding new user */}
                          {!editingUser && (
                            <div className="mt-6">
                              <LoadingButton
                                type="submit"
                                isLoading={isCreatingUser}
                                className="btn btn-primary w-full"
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Create User
                              </LoadingButton>
                            </div>
                          )}
                        </div>
                      </div>

                  {/* Permissions */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-4">
                      <div className="flex items-center space-x-2">
                        <Shield className="h-4 w-4" />
                        <span>Roles & Permissions</span>
                        {editingUser && editingUser._id === user?._id && (
                          <span className="text-xs text-gray-500">(Cannot modify your own permissions)</span>
                        )}
                      </div>
                    </label>
                    {editingUser && editingUser._id === user?._id ? (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="text-sm text-yellow-800">
                          <strong>Note:</strong> You cannot modify your own permissions. This prevents you from accidentally locking yourself out of the system. Contact another administrator if you need to change your permissions.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(permissionCategories).map(([categoryKey, category]) => (
                          <div key={categoryKey} className="border border-gray-200 rounded-lg p-4 h-fit">
                            <h4 className="text-sm font-medium text-gray-900 mb-3 border-b border-gray-100 pb-2">
                              {category.name}
                            </h4>
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                              {category.permissions.map((permission) => (
                                <div key={permission.key}>
                                  <label className="flex items-center space-x-2 py-1 hover:bg-gray-50 rounded px-1">
                                    <input
                                      type="checkbox"
                                      checked={newUserData.permissions[permission.key] || false}
                                      onChange={(e) => handlePermissionChange(permission.key, e.target.checked)}
                                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                                    />
                                    <span className="text-sm text-gray-700 font-medium truncate">
                                      {permission.name}
                                    </span>
                                  </label>
                                  {permission.subcategories && permission.subcategories.length > 0 && (
                                    <div className="ml-4 mt-1 space-y-1">
                                      {permission.subcategories.map((subcategory, index) => (
                                        <label key={subcategory.key || index} className="flex items-center space-x-2 py-1 hover:bg-blue-50 rounded px-1">
                                          <input
                                            type="checkbox"
                                            checked={newUserData.permissions[subcategory.key] || false}
                                            onChange={(e) => handlePermissionChange(subcategory.key, e.target.checked)}
                                            className="h-3 w-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                                          />
                                          <span className="text-xs text-gray-600 truncate">
                                            {subcategory.name}
                                          </span>
                                        </label>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Save Button - Only shown when editing user */}
                  {editingUser && (
                    <div className="flex justify-end pt-4 border-t">
                        <LoadingButton
                          type="submit"
                      isLoading={isUpdatingUser}
                          className="btn btn-primary"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Update User
                        </LoadingButton>
                      </div>
                  )}
                    </form>
              </div>
                </div>
          </div>
        )}

        {/* Print Preview Settings Tab */}
        {activeTab === 'print' && (
          <div className="card">
            <div className="card-header">
              <div className="flex items-center space-x-2">
                <Printer className="h-5 w-5 text-gray-600" />
                <h2 className="text-lg font-semibold">Print Preview Settings</h2>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Customize how your invoices and receipts appear when printed
              </p>
                      </div>
                      
            <div className="card-content">
              <div className="space-y-6">
                {/* Layout Options */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-4">
                    Invoice/Sale Receipt Layout
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="invoiceLayout"
                        value="standard"
                        checked={printSettings.invoiceLayout === 'standard'}
                        onChange={handlePrintSettingsChange}
                        className="mr-3"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Standard</div>
                        <div className="text-xs text-gray-500">Basic layout with company info</div>
                            </div>
                    </label>
                    <label className="flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                                  <input
                        type="radio"
                        name="invoiceLayout"
                        value="compact"
                        checked={printSettings.invoiceLayout === 'compact'}
                        onChange={handlePrintSettingsChange}
                        className="mr-3"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Compact</div>
                        <div className="text-xs text-gray-500">Condensed layout for small receipts</div>
                                  </div>
                                </label>
                    <label className="flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="invoiceLayout"
                        value="detailed"
                        checked={printSettings.invoiceLayout === 'detailed'}
                        onChange={handlePrintSettingsChange}
                        className="mr-3"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Detailed</div>
                        <div className="text-xs text-gray-500">Full layout with all information</div>
                            </div>
                    </label>
                          </div>
                      </div>
                      
                {/* Header and Footer Customization */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Header Text (Optional)
                    </label>
                    <textarea
                      name="headerText"
                      value={printSettings.headerText}
                      onChange={handlePrintSettingsChange}
                      className="input"
                      placeholder="Enter custom header text"
                      rows="3"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This text will appear at the top of printed documents
                    </p>
                      </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Footer Text (Optional)
                    </label>
                    <textarea
                      name="footerText"
                      value={printSettings.footerText}
                      onChange={handlePrintSettingsChange}
                      className="input"
                      placeholder="Enter custom footer text"
                      rows="3"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This text will appear at the bottom of printed documents
                    </p>
                    </div>
                    </div>

                {/* Display Options */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-4">
                    Display Options
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        name="showLogo"
                        checked={printSettings.showLogo}
                        onChange={handlePrintSettingsChange}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Show Logo</div>
                        <div className="text-xs text-gray-500">Display company logo on printed documents</div>
                </div>
                    </label>

                    <label className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        name="showDiscount"
                        checked={printSettings.showDiscount}
                        onChange={handlePrintSettingsChange}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Show Discount</div>
                        <div className="text-xs text-gray-500">Display discount information on receipts</div>
              </div>
                    </label>

                    <label className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        name="showTax"
                        checked={printSettings.showTax}
                        onChange={handlePrintSettingsChange}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Show Tax</div>
                        <div className="text-xs text-gray-500">Display tax calculations on receipts</div>
            </div>
                    </label>

                    <label className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        name="showDate"
                        checked={printSettings.showDate}
                        onChange={handlePrintSettingsChange}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Show Date</div>
                        <div className="text-xs text-gray-500">Display transaction date on receipts</div>
          </div>
                    </label>
                  </div>
                </div>

                {/* Print Preview */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Print Preview
                  </label>
                  <p className="text-xs text-gray-500 mb-4">
                    This preview shows how your receipts will appear with the actual saved company information.
                    {(!companyData.companyName && !companyData.address && !companyData.contactNumber) && (
                      <span className="text-orange-600 font-medium"> Please save your company information first to see the preview.</span>
                    )}
                  </p>
                  <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8">
                    {/* Standard Layout */}
                    {printSettings.invoiceLayout === 'standard' && (
                      <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-sm">
                        {/* Header */}
                        {printSettings.headerText && (
                          <div className="text-center text-sm text-gray-600 mb-4 border-b pb-2">
                            {printSettings.headerText}
                          </div>
                        )}

                        {/* Company Info */}
                        <div className="text-center mb-4">
                          {printSettings.showLogo && (
                            <div className="h-12 w-12 bg-gray-200 rounded mx-auto mb-2 flex items-center justify-center">
                              <Building className="h-6 w-6 text-gray-400" />
                            </div>
                          )}
                          <div className="text-lg font-bold text-gray-900">
                            {companyData.companyName || 'Company Name'}
                          </div>
                          {!companyData.companyName && (
                            <div className="text-xs text-orange-600 mt-1">
                              (Company name not set)
                            </div>
                          )}
                          {companyData.address && (
                            <div className="text-sm text-gray-700">
                              {companyData.address}
                            </div>
                          )}
                          {companyData.contactNumber && (
                            <div className="text-sm text-gray-700">
                              Phone: {companyData.contactNumber}
                            </div>
                          )}
                          {companyData.email && (
                            <div className="text-sm text-gray-700">
                              Email: {companyData.email}
                            </div>
                          )}
                          {companyData.taxRegistrationNumber && (
                            <div className="text-sm text-gray-700">
                              Tax ID: {companyData.taxRegistrationNumber}
                            </div>
                          )}
                        </div>

                        {/* Sample Receipt Content */}
                        <div className="border-t pt-4">
                          <div className="text-center text-sm font-medium text-gray-900 mb-2">
                            SAMPLE RECEIPT
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span>Item 1</span>
                              <span>10.00</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Item 2</span>
                              <span>15.00</span>
                            </div>
                            {printSettings.showDiscount && (
                              <div className="flex justify-between text-red-600">
                                <span>Discount</span>
                                <span>-2.50</span>
                              </div>
                            )}
                            {printSettings.showTax && (
                              <div className="flex justify-between">
                                <span>Tax</span>
                                <span>2.25</span>
                              </div>
                            )}
                            <div className="border-t pt-1 flex justify-between font-bold">
                              <span>Total</span>
                              <span>24.75</span>
                            </div>
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="border-t pt-3 mt-4">
                          {printSettings.footerText && (
                            <div className="text-center text-xs text-gray-600 mb-2">
                              {printSettings.footerText}
                            </div>
                          )}
                          
                          {/* Additional Company Info in Footer */}
                          <div className="text-center text-xs text-gray-500 space-y-1">
                            {companyData.email && (
                              <div>Email: {companyData.email}</div>
                            )}
                            {companyData.taxRegistrationNumber && (
                              <div>Tax ID: {companyData.taxRegistrationNumber}</div>
                            )}
                          </div>
                          
                          {printSettings.showDate && (
                            <div className="text-center text-xs text-gray-500 mt-2">
                              Date: {new Date().toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Compact Layout */}
                    {printSettings.invoiceLayout === 'compact' && (
                      <div className="max-w-xs mx-auto bg-white p-4 rounded-lg shadow-sm">
                        {/* Header */}
                        {printSettings.headerText && (
                          <div className="text-center text-xs text-gray-600 mb-2 border-b pb-1">
                            {printSettings.headerText}
                          </div>
                        )}

                        {/* Company Info - Compact */}
                        <div className="text-center mb-3">
                          {printSettings.showLogo && (
                            <div className="h-8 w-8 bg-gray-200 rounded mx-auto mb-1 flex items-center justify-center">
                              <Building className="h-4 w-4 text-gray-400" />
                            </div>
                          )}
                          <div className="text-sm font-bold text-gray-900">
                            {companyData.companyName || 'Your Company Name'}
                          </div>
                          {companyData.address && (
                            <div className="text-xs text-gray-600">
                              {companyData.address}
                            </div>
                          )}
                          {companyData.contactNumber && (
                            <div className="text-xs text-gray-600">
                              {companyData.contactNumber}
                            </div>
                          )}
                        </div>

                        {/* Sample Receipt Content - Compact */}
                        <div className="border-t pt-2">
                          <div className="text-center text-xs font-medium text-gray-900 mb-1">
                            SAMPLE RECEIPT
                          </div>
                          <div className="space-y-0.5 text-xs">
                            <div className="flex justify-between">
                              <span>Item 1</span>
                              <span>10.00</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Item 2</span>
                              <span>15.00</span>
                            </div>
                            {printSettings.showDiscount && (
                              <div className="flex justify-between text-red-600">
                                <span>Discount</span>
                                <span>-2.50</span>
                              </div>
                            )}
                            {printSettings.showTax && (
                              <div className="flex justify-between">
                                <span>Tax</span>
                                <span>2.25</span>
                              </div>
                            )}
                            <div className="border-t pt-0.5 flex justify-between font-bold text-sm">
                              <span>Total</span>
                              <span>24.75</span>
                            </div>
                          </div>
                        </div>

                        {/* Footer - Compact */}
                        <div className="border-t pt-2 mt-2">
                          {printSettings.footerText && (
                            <div className="text-center text-xs text-gray-600 mb-1">
                              {printSettings.footerText}
                            </div>
                          )}
                          
                          {printSettings.showDate && (
                            <div className="text-center text-xs text-gray-500">
                              Date: {new Date().toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Detailed Layout */}
                    {printSettings.invoiceLayout === 'detailed' && (
                      <div className="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-sm">
                        {/* Header */}
                        {printSettings.headerText && (
                          <div className="text-center text-base text-gray-700 mb-4 border-b-2 pb-3">
                            {printSettings.headerText}
                          </div>
                        )}

                        {/* Company Info - Detailed */}
                        <div className="text-center mb-6">
                          {printSettings.showLogo && (
                            <div className="h-16 w-16 bg-gray-200 rounded-lg mx-auto mb-3 flex items-center justify-center">
                              <Building className="h-8 w-8 text-gray-400" />
                            </div>
                          )}
                          <div className="text-xl font-bold text-gray-900 mb-2">
                            {companyData.companyName || 'Company Name'}
                          </div>
                          {!companyData.companyName && (
                            <div className="text-xs text-orange-600 mb-2">
                              (Company name not set)
                            </div>
                          )}
                          <div className="space-y-1 text-sm text-gray-700">
                            {companyData.address && (
                              <div className="flex items-center justify-center">
                                <MapPin className="h-4 w-4 mr-1" />
                                {companyData.address}
                              </div>
                            )}
                            {companyData.contactNumber && (
                              <div className="flex items-center justify-center">
                                <Phone className="h-4 w-4 mr-1" />
                                {companyData.contactNumber}
                              </div>
                            )}
                            {companyData.email && (
                              <div className="flex items-center justify-center">
                                <Mail className="h-4 w-4 mr-1" />
                                {companyData.email}
                              </div>
                            )}
                            {companyData.taxRegistrationNumber && (
                              <div className="flex items-center justify-center">
                                <FileText className="h-4 w-4 mr-1" />
                                Tax ID: {companyData.taxRegistrationNumber}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Sample Receipt Content - Detailed */}
                        <div className="border-t-2 pt-4">
                          <div className="text-center text-base font-semibold text-gray-900 mb-4">
                            SAMPLE RECEIPT
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between py-1 border-b border-gray-100">
                              <span className="font-medium">Item 1</span>
                              <span className="font-medium">10.00</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-gray-100">
                              <span className="font-medium">Item 2</span>
                              <span className="font-medium">15.00</span>
                            </div>
                            {printSettings.showDiscount && (
                              <div className="flex justify-between py-1 text-red-600 border-b border-gray-100">
                                <span className="font-medium">Discount</span>
                                <span className="font-medium">-2.50</span>
                              </div>
                            )}
                            {printSettings.showTax && (
                              <div className="flex justify-between py-1 border-b border-gray-100">
                                <span className="font-medium">Tax</span>
                                <span className="font-medium">2.25</span>
                              </div>
                            )}
                            <div className="border-t-2 pt-2 flex justify-between font-bold text-base mt-2">
                              <span>Total</span>
                              <span>24.75</span>
                            </div>
                          </div>
                        </div>

                        {/* Footer - Detailed */}
                        <div className="border-t-2 pt-4 mt-6">
                          {printSettings.footerText && (
                            <div className="text-center text-sm text-gray-700 mb-3 border-b pb-2">
                              {printSettings.footerText}
                            </div>
                          )}
                          
                          {/* Additional Company Info in Footer - Detailed */}
                          <div className="text-center text-xs text-gray-500 space-y-1 mb-2">
                            {companyData.email && (
                              <div>Email: {companyData.email}</div>
                            )}
                            {companyData.taxRegistrationNumber && (
                              <div>Tax ID: {companyData.taxRegistrationNumber}</div>
                            )}
                          </div>
                          
                          {printSettings.showDate && (
                            <div className="text-center text-sm text-gray-600 mt-3 font-medium">
                              Date: {new Date().toLocaleDateString('en-US', { 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric' 
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => toast.success('Print settings saved!')}
                    className="btn btn-primary"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save Print Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* User Activity Modal */}
        {showActivityModal && selectedUserActivity && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold">User Activity Dashboard</h3>
                  <p className="text-sm text-gray-600">
                    {selectedUserActivity.name} ({selectedUserActivity.email})
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowActivityModal(false);
                    setSelectedUserActivity(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              {activityLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : selectedUserActivity.activity ? (
                <div className="space-y-6">
                  {/* Activity Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="flex items-center">
                        <Clock className="h-8 w-8 text-blue-600 mr-3" />
                        <div>
                          <p className="text-sm font-medium text-blue-800">Last Login</p>
                          <p className="text-lg font-semibold text-blue-900">
                            {selectedUserActivity.activity.lastLogin 
                              ? new Date(selectedUserActivity.activity.lastLogin).toLocaleString()
                              : 'Never'
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-green-50 p-4 rounded-lg">
                      <div className="flex items-center">
                        <TrendingUp className="h-8 w-8 text-green-600 mr-3" />
                        <div>
                          <p className="text-sm font-medium text-green-800">Total Logins</p>
                          <p className="text-lg font-semibold text-green-900">
                            {selectedUserActivity.activity.loginCount || 0}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <div className="flex items-center">
                        <div className={`h-8 w-8 rounded-full mr-3 flex items-center justify-center ${
                          selectedUserActivity.activity.isOnline ? 'bg-green-500' : 'bg-gray-400'
                        }`}>
                          <div className="h-3 w-3 bg-white rounded-full"></div>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-purple-800">Status</p>
                          <p className="text-lg font-semibold text-purple-900">
                            {selectedUserActivity.activity.isOnline ? 'Online' : 'Offline'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Login History */}
                  <div className="bg-white border border-gray-200 rounded-lg">
                    <div className="p-4 border-b border-gray-200">
                      <h4 className="text-md font-semibold flex items-center">
                        <Clock className="h-5 w-5 mr-2" />
                        Recent Login History
                      </h4>
                    </div>
                    <div className="p-4">
                      {selectedUserActivity.activity.loginHistory && selectedUserActivity.activity.loginHistory.length > 0 ? (
                        <div className="space-y-3">
                          {selectedUserActivity.activity.loginHistory.map((login, index) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div>
                                <p className="text-sm font-medium">
                                  {new Date(login.loginTime).toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-500">
                                  IP: {login.ipAddress}
                                </p>
                              </div>
                              <div className="text-xs text-gray-500">
                                {login.userAgent?.split(' ')[0] || 'Unknown'}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-center py-4">No login history available</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Permission History */}
                  <div className="bg-white border border-gray-200 rounded-lg">
                    <div className="p-4 border-b border-gray-200">
                      <h4 className="text-md font-semibold flex items-center">
                        <Shield className="h-5 w-5 mr-2" />
                        Permission Change History
                      </h4>
                    </div>
                    <div className="p-4">
                      {selectedUserActivity.activity.permissionHistory && selectedUserActivity.activity.permissionHistory.length > 0 ? (
                        <div className="space-y-3">
                          {selectedUserActivity.activity.permissionHistory.map((change, index) => (
                            <div key={index} className="p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  change.changeType === 'created' ? 'bg-green-100 text-green-800' :
                                  change.changeType === 'role_changed' ? 'bg-blue-100 text-blue-800' :
                                  change.changeType === 'permissions_modified' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {change.changeType.replace('_', ' ').toUpperCase()}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {new Date(change.changedAt).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700 mb-1">
                                Changed by: {change.changedBy ? 
                                  `${change.changedBy.firstName} ${change.changedBy.lastName}` : 
                                  'System'
                                }
                              </p>
                              {change.notes && (
                                <p className="text-xs text-gray-600">{change.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-center py-4">No permission changes recorded</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">Failed to load activity data</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Password Change Modal */}
        {showPasswordModal && (passwordResetUser || editingUser) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Reset Password</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {(passwordResetUser || editingUser)?.email && `Resetting password for: ${(passwordResetUser || editingUser).email}`}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordResetUser(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="input pr-10"
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input pr-10"
                      placeholder="Confirm new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordResetUser(null);
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePasswordReset}
                  disabled={isResettingPassword || !(passwordResetUser || editingUser)}
                  className="btn btn-primary"
                >
                  {isResettingPassword ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Change My Password Modal */}
        {showMyPasswordModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Change My Password</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {user?.email && `Changing password for: ${user.email}`}
                  </p>
                </div>
                <button
                  onClick={() => setShowMyPasswordModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Current Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="input pr-10"
                      placeholder="Enter current password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="input pr-10"
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm New Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input pr-10"
                      placeholder="Confirm new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-xs text-blue-800">
                    <strong>Note:</strong> You must enter your current password to change it to a new one.
                  </p>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowMyPasswordModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleChangeMyPassword}
                  disabled={isChangingMyPassword}
                  className="btn btn-primary"
                >
                  {isChangingMyPassword ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings2;
