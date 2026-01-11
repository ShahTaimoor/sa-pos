import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Users, Building2, Search, Calendar, Download, FileText, ChevronDown, Printer } from 'lucide-react';
import { useGetLedgerSummaryQuery, useGetCustomerDetailedTransactionsQuery, useGetSupplierDetailedTransactionsQuery } from '../store/services/accountLedgerApi';
import { useGetCustomersQuery } from '../store/services/customersApi';
import { useGetSuppliersQuery } from '../store/services/suppliersApi';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { handleApiError } from '../utils/errorHandler';
import toast from 'react-hot-toast';

const AccountLedgerSummary = () => {
  // Function to get default date range (one month difference)
  const getDefaultDateRange = () => {
    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);
    
    return {
      startDate: oneMonthAgo.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0]
    };
  };

  const defaultDates = getDefaultDateRange();
  
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const customerDropdownRef = useRef(null);

  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('');
  const supplierDropdownRef = useRef(null);
  const printRef = useRef(null);
  
  const [filters, setFilters] = useState({
    startDate: defaultDates.startDate,
    endDate: defaultDates.endDate,
    search: ''
  });

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target)) {
        setShowCustomerDropdown(false);
      }
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target)) {
        setShowSupplierDropdown(false);
      }
    };

    if (showCustomerDropdown || showSupplierDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCustomerDropdown, showSupplierDropdown]);

  // Fetch customers for dropdown
  const { data: customersData, isLoading: customersLoading } = useGetCustomersQuery(
    { search: customerSearchQuery, limit: 100 },
    { refetchOnMountOrArgChange: true }
  );

  const allCustomers = useMemo(() => {
    return customersData?.data?.customers || customersData?.customers || customersData?.data || customersData || [];
  }, [customersData]);

  // Fetch suppliers for dropdown
  const { data: suppliersData, isLoading: suppliersLoading } = useGetSuppliersQuery(
    { search: supplierSearchQuery, limit: 100 },
    { refetchOnMountOrArgChange: true }
  );

  const allSuppliers = useMemo(() => {
    return suppliersData?.data?.suppliers || suppliersData?.suppliers || suppliersData?.data || suppliersData || [];
  }, [suppliersData]);

  // Build query params with customerId and supplierId
  const queryParams = useMemo(() => {
    const params = { ...filters };
    if (selectedCustomerId) {
      params.customerId = selectedCustomerId;
    }
    if (selectedSupplierId) {
      params.supplierId = selectedSupplierId;
    }
    return params;
  }, [filters, selectedCustomerId, selectedSupplierId]);

  // Fetch ledger summary
  const { data: summaryData, isLoading, error, refetch } = useGetLedgerSummaryQuery(queryParams, {
    onError: (error) => handleApiError(error, 'Error fetching ledger summary')
  });

  // Fetch detailed transactions for selected customer
  const { data: detailedTransactionsData, isLoading: detailedLoading } = useGetCustomerDetailedTransactionsQuery(
    {
      customerId: selectedCustomerId,
      startDate: filters.startDate,
      endDate: filters.endDate
    },
    {
      skip: !selectedCustomerId,
      onError: (error) => handleApiError(error, 'Error fetching detailed transactions')
    }
  );

  // Fetch detailed transactions for selected supplier
  const { data: detailedSupplierTransactionsData, isLoading: detailedSupplierLoading } = useGetSupplierDetailedTransactionsQuery(
    {
      supplierId: selectedSupplierId,
      startDate: filters.startDate,
      endDate: filters.endDate
    },
    {
      skip: !selectedSupplierId,
      onError: (error) => handleApiError(error, 'Error fetching detailed supplier transactions')
    }
  );

  // Extract data from summary (must be before early return)
  const allCustomersSummary = summaryData?.data?.customers?.summary || [];
  const suppliers = summaryData?.data?.suppliers?.summary || [];
  const customerTotals = summaryData?.data?.customers?.totals || {};
  const supplierTotals = summaryData?.data?.suppliers?.totals || {};
  const period = summaryData?.data?.period || {};

  // Filter customers based on selection (must be before early return)
  const customers = useMemo(() => {
    if (!selectedCustomerId) return [];
    return allCustomersSummary.filter(c => {
      const customerId = c.id?.toString() || c._id?.toString();
      const selectedId = selectedCustomerId.toString();
      return customerId === selectedId;
    });
  }, [allCustomersSummary, selectedCustomerId]);

  // Filter customers for dropdown (must be before early return)
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return allCustomers.slice(0, 50);
    const query = customerSearchQuery.toLowerCase();
    return allCustomers.filter(customer => {
      const name = (customer.businessName || customer.name || '').toLowerCase();
      const email = (customer.email || '').toLowerCase();
      const phone = (customer.phone || '').toLowerCase();
      return name.includes(query) || email.includes(query) || phone.includes(query);
    }).slice(0, 50);
  }, [allCustomers, customerSearchQuery]);

  // Filter suppliers based on selection (must be before early return)
  const filteredSuppliersList = useMemo(() => {
    if (!selectedSupplierId) return [];
    return suppliers.filter(s => {
      const supplierId = s.id?.toString() || s._id?.toString();
      const selectedId = selectedSupplierId.toString();
      return supplierId === selectedId;
    });
  }, [suppliers, selectedSupplierId]);

  // Filter suppliers for dropdown (must be before early return)
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearchQuery.trim()) return allSuppliers.slice(0, 50);
    const query = supplierSearchQuery.toLowerCase();
    return allSuppliers.filter(supplier => {
      const name = (supplier.companyName || supplier.name || '').toLowerCase();
      const email = (supplier.email || '').toLowerCase();
      const phone = (supplier.phone || '').toLowerCase();
      return name.includes(query) || email.includes(query) || phone.includes(query);
    }).slice(0, 50);
  }, [allSuppliers, supplierSearchQuery]);

  const handleFilterChange = (field, value) => {
    setFilters({ ...filters, [field]: value });
  };

  const handleClearFilters = () => {
    setFilters({
      startDate: defaultDates.startDate,
      endDate: defaultDates.endDate,
      search: ''
    });
    setSelectedCustomerId('');
    setCustomerSearchQuery('');
    setSelectedSupplierId('');
    setSupplierSearchQuery('');
  };

  const handleCustomerSelect = (customer) => {
    setSelectedCustomerId(customer._id);
    setCustomerSearchQuery(customer.businessName || customer.name || '');
    setShowCustomerDropdown(false);
  };

  const handleSupplierSelect = (supplier) => {
    setSelectedSupplierId(supplier._id);
    setSupplierSearchQuery(supplier.companyName || supplier.name || '');
    setShowSupplierDropdown(false);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const year = d.getFullYear().toString().slice(-2);
    return `${day}-${month}-${year}`;
  };

  const handleExport = () => {
    toast.info('Export functionality coming soon');
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) {
      toast.error('No content to print. Please select a customer or supplier.');
      return;
    }

    const printWindow = window.open('', '_blank');
    const customerName = selectedCustomerId 
      ? (detailedTransactionsData?.data?.customer?.name || 'Customer Receivables')
      : (detailedSupplierTransactionsData?.data?.supplier?.name || 'Supplier Payables');
    const accountCode = selectedCustomerId
      ? (detailedTransactionsData?.data?.customer?.accountCode || '')
      : (detailedSupplierTransactionsData?.data?.supplier?.accountCode || '');
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Account Ledger Summary - ${customerName}</title>
          <style>
            @media print {
              @page {
                size: A4 landscape;
                margin: 0.5in;
              }
              body {
                font-family: 'Inter', Arial, sans-serif;
                font-size: 11px;
                color: #111827;
                margin: 0;
                padding: 0;
              }
            }
            body {
              font-family: 'Inter', Arial, sans-serif;
              font-size: 12px;
              color: #111827;
              margin: 20px;
            }
            .print-header {
              text-align: center;
              margin-bottom: 20px;
              border-bottom: 2px solid #e5e7eb;
              padding-bottom: 15px;
            }
            .print-header h1 {
              font-size: 24px;
              font-weight: 700;
              margin: 0 0 5px 0;
              color: #111827;
            }
            .print-header p {
              font-size: 14px;
              color: #6b7280;
              margin: 5px 0;
            }
            .print-info {
              margin-bottom: 20px;
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 15px;
            }
            .print-info-item {
              font-size: 12px;
            }
            .print-info-label {
              font-weight: 600;
              color: #374151;
            }
            .print-info-value {
              color: #111827;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
            }
            th {
              background: #f3f4f6;
              border: 1px solid #e5e7eb;
              text-align: left;
              padding: 8px;
              font-size: 11px;
              font-weight: 600;
              color: #111827;
            }
            td {
              border: 1px solid #e5e7eb;
              padding: 8px;
              font-size: 11px;
              color: #374151;
            }
            .text-right {
              text-align: right;
            }
            .text-center {
              text-align: center;
            }
            .font-bold {
              font-weight: 700;
            }
            .bg-gray-50 {
              background-color: #f9fafb;
            }
            .bg-gray-100 {
              background-color: #f3f4f6;
            }
            .print-footer {
              margin-top: 30px;
              text-align: center;
              color: #6b7280;
              font-size: 11px;
              border-top: 1px solid #e5e7eb;
              padding-top: 15px;
            }
          </style>
        </head>
        <body>
          <div class="print-header">
            <h1>Account Ledger Summary</h1>
            <p>${customerName}${accountCode ? ` - Account Code: ${accountCode}` : ''}</p>
            <p>Period: ${formatDate(filters.startDate)} to ${formatDate(filters.endDate)}</p>
          </div>
          ${printContent.innerHTML}
          <div class="print-footer">
            <p>Generated on ${new Date().toLocaleString('en-GB', { 
              day: '2-digit', 
              month: 'short', 
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</p>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  // Early return for error (after all hooks)
  if (error) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error loading ledger summary</p>
          <button onClick={() => refetch()} className="btn btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Account Ledger Summary</h1>
          <p className="text-gray-600 mt-1">Customer Receivables and Supplier Payables</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="btn btn-secondary flex items-center gap-2"
            disabled={!selectedCustomerId && !selectedSupplierId}
            title={!selectedCustomerId && !selectedSupplierId ? 'Please select a customer or supplier to print' : 'Print ledger summary'}
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            onClick={handleExport}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* Customer Dropdown */}
          <div className="relative" ref={customerDropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Customer
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Select customer..."
                value={customerSearchQuery}
                onChange={(e) => {
                  setCustomerSearchQuery(e.target.value);
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                className="input w-full"
              />
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              {showCustomerDropdown && filteredCustomers.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {filteredCustomers.map((customer) => {
                    const displayName = customer.businessName || customer.name || 'Unknown Customer';
                    return (
                      <button
                        key={customer._id}
                        onClick={() => handleCustomerSelect(customer)}
                        className={`w-full text-left px-4 py-2 hover:bg-gray-50 ${
                          selectedCustomerId === customer._id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="text-sm font-medium text-gray-900">{displayName}</div>
                        {customer.email && (
                          <div className="text-xs text-gray-500">{customer.email}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Supplier Dropdown */}
          <div className="relative" ref={supplierDropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Supplier
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Select supplier..."
                value={supplierSearchQuery}
                onChange={(e) => {
                  setSupplierSearchQuery(e.target.value);
                  setShowSupplierDropdown(true);
                }}
                onFocus={() => setShowSupplierDropdown(true)}
                className="input w-full"
              />
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              {showSupplierDropdown && filteredSuppliers.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {filteredSuppliers.map((supplier) => {
                    const displayName = supplier.companyName || supplier.name || 'Unknown Supplier';
                    return (
                      <button
                        key={supplier._id}
                        onClick={() => handleSupplierSelect(supplier)}
                        className={`w-full text-left px-4 py-2 hover:bg-gray-50 ${
                          selectedSupplierId === supplier._id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="text-sm font-medium text-gray-900">{displayName}</div>
                        {supplier.email && (
                          <div className="text-xs text-gray-500">{supplier.email}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, phone..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="input w-full pl-10"
              />
            </div>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              From Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="input w-full pl-10"
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              To Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="input w-full pl-10"
              />
            </div>
          </div>

          {/* Clear Button */}
          <div className="flex items-end">
            <button
              onClick={handleClearFilters}
              className="btn btn-outline w-full"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Period Display */}
        {period.startDate && period.endDate && (
          <div className="mt-4 text-sm text-gray-600">
            <span className="font-medium">Period:</span> {formatDate(period.startDate)} to {formatDate(period.endDate)}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Customers Section - Only show if customer is selected */}
          {selectedCustomerId ? (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users className="h-6 w-6 text-blue-600" />
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        {detailedTransactionsData?.data?.customer?.name || 'Customer Receivables'}
                      </h2>
                      <p className="text-sm text-gray-600">
                        Account Code: {detailedTransactionsData?.data?.customer?.accountCode || ''}
                      </p>
                      {filters.startDate && filters.endDate && (
                        <p className="text-xs text-gray-500 mt-1">
                          Period: {formatDate(filters.startDate)} to {formatDate(filters.endDate)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {detailedLoading ? (
                <div className="flex justify-center items-center py-12">
                  <LoadingSpinner />
                </div>
              ) : (
                <div className="overflow-x-auto" ref={selectedCustomerId ? printRef : null}>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Voucher No
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Particular
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Debits
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Credits
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Balance
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {/* Opening Balance Row */}
                      <tr className="bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900"></td>
                        <td className="px-4 py-3 text-sm text-gray-900"></td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">Opening Balance:</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900"></td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900"></td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                          {formatCurrency(detailedTransactionsData?.data?.openingBalance || 0)}
                        </td>
                      </tr>

                      {/* Transaction Rows */}
                      {detailedTransactionsData?.data?.entries?.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                            <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                            <p>No transactions found for this period</p>
                          </td>
                        </tr>
                      ) : (
                        detailedTransactionsData?.data?.entries?.map((entry, index) => (
                          <tr key={index} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {formatDate(entry.date)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {entry.voucherNo || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {entry.particular || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">
                              {entry.debitAmount > 0 ? formatCurrency(entry.debitAmount) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">
                              {entry.creditAmount > 0 ? formatCurrency(entry.creditAmount) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                              {formatCurrency(Math.abs(entry.balance || 0))}
                            </td>
                          </tr>
                        ))
                      )}

                      {/* Total Row */}
                      {detailedTransactionsData?.data?.entries?.length > 0 && (
                        <tr className="bg-gray-100 font-bold">
                          <td className="px-4 py-3 text-sm text-gray-900"></td>
                          <td className="px-4 py-3 text-sm text-gray-900"></td>
                          <td className="px-4 py-3 text-sm text-gray-900">Total</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">
                            {formatCurrency(
                              detailedTransactionsData?.data?.entries?.reduce((sum, e) => sum + (e.debitAmount || 0), 0) || 0
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">
                            {formatCurrency(
                              detailedTransactionsData?.data?.entries?.reduce((sum, e) => sum + (e.creditAmount || 0), 0) || 0
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">
                            {formatCurrency(Math.abs(detailedTransactionsData?.data?.closingBalance || 0))}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">Please select a customer from the dropdown above to view their ledger summary</p>
            </div>
          )}

          {/* Suppliers Section - Only show if supplier is selected */}
          {selectedSupplierId ? (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="bg-gradient-to-r from-orange-50 to-orange-100 px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-6 w-6 text-orange-600" />
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        {detailedSupplierTransactionsData?.data?.supplier?.name || 'Supplier Payables'}
                      </h2>
                      <p className="text-sm text-gray-600">
                        Account Code: {detailedSupplierTransactionsData?.data?.supplier?.accountCode || ''}
                      </p>
                      {filters.startDate && filters.endDate && (
                        <p className="text-xs text-gray-500 mt-1">
                          Period: {formatDate(filters.startDate)} to {formatDate(filters.endDate)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Table */}
              {detailedSupplierLoading ? (
                <div className="flex justify-center items-center py-12">
                  <LoadingSpinner />
                </div>
              ) : (
                <div className="overflow-x-auto" ref={selectedSupplierId && !selectedCustomerId ? printRef : null}>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Voucher No</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Particular</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Debits</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Credits</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {/* Opening Balance Row */}
                      <tr className="bg-gray-50">
                        <td colSpan="3" className="px-4 py-3 text-sm font-medium text-gray-900">Opening Balance:</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">-</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">-</td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                          {formatCurrency(detailedSupplierTransactionsData?.data?.openingBalance || 0)}
                        </td>
                      </tr>

                      {/* Transaction Entries */}
                      {detailedSupplierTransactionsData?.data?.entries?.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                            <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                            <p>No transactions found for this period</p>
                          </td>
                        </tr>
                      ) : (
                        detailedSupplierTransactionsData?.data?.entries?.map((entry, index) => (
                          <tr key={index} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {formatDate(entry.date)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {entry.voucherNo || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 max-w-md whitespace-normal break-words">
                              {entry.particular || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">
                              {entry.debitAmount > 0 ? formatCurrency(entry.debitAmount) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">
                              {entry.creditAmount > 0 ? formatCurrency(entry.creditAmount) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                              {formatCurrency(Math.abs(entry.balance || 0))}
                            </td>
                          </tr>
                        ))
                      )}

                      {/* Total Row */}
                      {detailedSupplierTransactionsData?.data?.entries?.length > 0 && (
                        <tr className="bg-gray-100 font-bold">
                          <td className="px-4 py-3 text-sm text-gray-900"></td>
                          <td className="px-4 py-3 text-sm text-gray-900"></td>
                          <td className="px-4 py-3 text-sm text-gray-900">Total</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">
                            {formatCurrency(
                              detailedSupplierTransactionsData?.data?.entries?.reduce((sum, e) => sum + (e.debitAmount || 0), 0) || 0
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">
                            {formatCurrency(
                              detailedSupplierTransactionsData?.data?.entries?.reduce((sum, e) => sum + (e.creditAmount || 0), 0) || 0
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">
                            {formatCurrency(Math.abs(detailedSupplierTransactionsData?.data?.closingBalance || 0))}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">Please select a supplier from the dropdown above to view their ledger summary</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AccountLedgerSummary;

