import React, { useState, useMemo, useRef } from 'react';
import {
  FileText
} from 'lucide-react';
import {
  useGetLedgerEntriesQuery,
  useGetAccountsListQuery,
  useGetAllEntriesQuery,
  useExportLedgerMutation,
} from '../store/services/accountLedgerApi';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { handleApiError } from '../utils/errorHandler';
import toast from 'react-hot-toast';

const AccountLedger = () => {
  // Function to get default date range (one month difference)
  const getDefaultDateRange = () => {
    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);
    
    return {
      startDate: oneMonthAgo.toISOString().split('T')[0], // Format as YYYY-MM-DD
      endDate: today.toISOString().split('T')[0] // Format as YYYY-MM-DD
    };
  };

  const defaultDates = getDefaultDateRange();
  
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [filters, setFilters] = useState({
    startDate: defaultDates.startDate,
    endDate: defaultDates.endDate,
    accountCode: '',
    accountName: '',
    customerName: '',
    supplierName: ''
  });
  const [accountSearchQuery, setAccountSearchQuery] = useState('');
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportLedger] = useExportLedgerMutation();
  // Store ledger data in local state to persist it even if query is skipped
  const [cachedLedgerData, setCachedLedgerData] = useState(null);
  // Use a ref to persist data across renders and prevent RTK Query from clearing it
  const persistedLedgerDataRef = useRef(null);

  // Close export menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (showExportMenu && !event.target.closest('.relative')) {
        setShowExportMenu(false);
      }
      if (showAccountDropdown && !event.target.closest('.relative')) {
        setShowAccountDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu, showAccountDropdown]);

  // Fetch all accounts list
  const { data: accountsData, isLoading: accountsLoading } = useGetAccountsListQuery(undefined, {
    onError: (error) => handleApiError(error, 'Error fetching accounts')
  });

  // Fetch ledger entries based on filters
  // Build query params including customerId/supplierId if available
  // Memoize queryParams to prevent unnecessary re-renders
  // For customer accounts, ensure customerId is always included and stable
  const queryParams = useMemo(() => {
    const params = { ...filters };
    
    // Always include customerId/supplierId if available in selectedAccount
    // This ensures the query params remain stable for customer accounts
    if (selectedAccount?.customerId) {
      params.customerId = selectedAccount.customerId;
    }
    if (selectedAccount?.supplierId) {
      params.supplierId = selectedAccount.supplierId;
    }
    
    return params;
  }, [
    filters.startDate,
    filters.endDate,
    filters.accountCode,
    filters.accountName,
    filters.customerName,
    filters.supplierName,
    selectedAccount?.customerId,
    selectedAccount?.supplierId
  ]);

  // Check if query should be skipped - only skip if no account is selected AND no date filters
  const shouldSkip = useMemo(() => {
    // Don't skip if we have an account selected (even if filters are empty, we want to keep showing data)
    if (selectedAccount) {
      return false;
    }
    // Only skip if no filters at all
    return !(filters.accountCode || filters.startDate || filters.endDate || filters.accountName);
  }, [selectedAccount, filters.accountCode, filters.startDate, filters.endDate, filters.accountName]);

  // For customer accounts, never skip the query to keep data persistent
  const effectiveShouldSkip = useMemo(() => {
    // If it's a customer account, never skip - this keeps the subscription active
    if (selectedAccount?.customerId) {
      return false;
    }
    return shouldSkip;
  }, [shouldSkip, selectedAccount?.customerId]);

  const { data: ledgerData, isLoading: ledgerLoading, refetch: refetchLedger } = useGetAllEntriesQuery(
    queryParams,
    {
      skip: effectiveShouldSkip,
      onError: (error) => handleApiError(error, 'Error fetching ledger entries'),
      // Keep data in cache for 5 minutes to prevent it from disappearing
      keepUnusedDataFor: 300,
      // Disable automatic refetching to prevent data from being cleared
      refetchOnMountOrArgChange: false,
      refetchOnFocus: false,
      refetchOnReconnect: false
    }
  );

  // Persist ledger data in both state and ref when it's available
  // For customer accounts, ensure data persists even if query params change slightly
  React.useEffect(() => {
    if (ledgerData && ledgerData.data) {
      // Update both state and ref to persist data
      // Check if we have entries or if it's a valid response structure
      if (ledgerData.data.entries && ledgerData.data.entries.length > 0) {
        setCachedLedgerData(ledgerData);
        persistedLedgerDataRef.current = ledgerData;
      } else if (ledgerData.data.summary) {
        // Even if entries array is empty, keep the structure if summary exists
        setCachedLedgerData(ledgerData);
        persistedLedgerDataRef.current = ledgerData;
      }
    }
  }, [ledgerData]);
  
  // For customer accounts specifically, aggressively preserve data
  React.useEffect(() => {
    if (selectedAccount?.customerId) {
      // If we have customer account data, always ensure it's preserved
      if (ledgerData && ledgerData.data) {
        // Always update cache when we have fresh data
        setCachedLedgerData(ledgerData);
        persistedLedgerDataRef.current = ledgerData;
      } else if (persistedLedgerDataRef.current && !ledgerData) {
        // If RTK Query cleared the data but we have it in ref, immediately restore it
        setCachedLedgerData(persistedLedgerDataRef.current);
      } else if (cachedLedgerData && !ledgerData) {
        // If we have cached data but RTK Query cleared it, restore from cache
        persistedLedgerDataRef.current = cachedLedgerData;
      }
    }
  }, [selectedAccount?.customerId, ledgerData, cachedLedgerData]);
  
  // Additional safeguard: periodically check and restore customer account data
  React.useEffect(() => {
    if (!selectedAccount?.customerId) return;
    
    const checkInterval = setInterval(() => {
      // Every 2 seconds, check if data is missing and restore it
      if (!ledgerData && persistedLedgerDataRef.current) {
        setCachedLedgerData(persistedLedgerDataRef.current);
      }
    }, 2000);
    
    return () => clearInterval(checkInterval);
  }, [selectedAccount?.customerId, ledgerData]);
  
  // Clear cached data only when account is cleared or filters are completely reset
  React.useEffect(() => {
    if (!selectedAccount && !filters.accountCode && !filters.accountName) {
      // Only clear if we truly have no account selected and no filters
      setCachedLedgerData(null);
      persistedLedgerDataRef.current = null;
    }
  }, [selectedAccount, filters.accountCode, filters.accountName]);

  const handleAccountSelect = (account) => {
    setSelectedAccount(account);
    setFilters({ ...filters, accountCode: account.accountCode, accountName: account.accountName });
    setShowAccountDropdown(false);
    setAccountSearchQuery(account.accountName || account.accountCode);
  };

  const handleView = () => {
    if (selectedAccount) {
      // Force refetch and update cache
      refetchLedger().then((result) => {
        if (result.data) {
          setCachedLedgerData(result.data);
          persistedLedgerDataRef.current = result.data;
        }
      });
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters({ ...filters, [field]: value });
  };

  const handleClearFilters = () => {
    setFilters({ startDate: defaultDates.startDate, endDate: defaultDates.endDate, accountCode: '', accountName: '' });
    setSelectedAccount(null);
    setCachedLedgerData(null); // Clear cached data when filters are cleared
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


  const handleExport = async (format = 'csv') => {
    if (!ledgerData?.data?.entries?.length) {
      toast.error('No data to export');
      return;
    }

    try {
      setIsExporting(true);
      setShowExportMenu(false);

      // Build export params with current filters
      const params = {
        export: format,
      };
      
      // Add filters that have values
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.accountCode) params.accountCode = filters.accountCode;
      if (filters.accountName) params.accountName = filters.accountName;

      const result = await exportLedger(params).unwrap();

      // Get filename - generate one based on format and account
      const formatExtension = format === 'excel' ? 'xlsx' : format;
      let filename = `account-ledger-${selectedAccount?.accountCode || 'all'}-${new Date().toISOString().split('T')[0]}.${formatExtension}`;

      // Create blob and download
      // RTK Query with responseType: 'blob' returns the blob directly
      const blob = result instanceof Blob ? result : new Blob([result]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(`Ledger exported as ${format.toUpperCase()} successfully`);
    } catch (error) {
      handleApiError(error, 'Export ledger');
      toast.error('Failed to export ledger');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (accountsLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  const groupedAccounts = accountsData?.data?.groupedAccounts || {};
  const allAccounts = Object.values(groupedAccounts).flat();
  // Use cached data if current data is not available (persists data even when query is skipped)
  // For customer accounts, aggressively prioritize persisted data to prevent disappearing
  let currentLedgerData = ledgerData;
  
  // For customer accounts, if RTK Query data is missing or empty, use persisted data
  if (selectedAccount?.customerId) {
    if (!currentLedgerData || !currentLedgerData.data || !currentLedgerData.data.entries || currentLedgerData.data.entries.length === 0) {
      // Use persisted data if current data is missing or empty
      currentLedgerData = persistedLedgerDataRef.current || cachedLedgerData;
    }
  } else {
    // For non-customer accounts, use normal fallback
    currentLedgerData = ledgerData || cachedLedgerData || persistedLedgerDataRef.current;
  }
  
  const ledgerEntries = currentLedgerData?.data?.entries || [];
  const summary = currentLedgerData?.data?.summary || {};

  // Filter accounts for dropdown
  const filteredAccounts = allAccounts.filter(account => {
                    if (!accountSearchQuery.trim()) return true;
                    const query = accountSearchQuery.toLowerCase();
                    return (
                      account.accountCode.toLowerCase().includes(query) ||
                      account.accountName.toLowerCase().includes(query) ||
                      (account.description && account.description.toLowerCase().includes(query))
                    );
                  });
                  
  // Calculate totals
  const totalDebits = ledgerEntries.reduce((sum, entry) => sum + (entry.debitAmount || 0), 0);
  const totalCredits = ledgerEntries.reduce((sum, entry) => sum + (entry.creditAmount || 0), 0);
  const closingBalance = summary.closingBalance !== undefined ? summary.closingBalance : (summary.openingBalance || 0) + totalDebits - totalCredits;
                  
                  return (
    <div className="space-y-4">
      {/* Filter Header Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 no-print">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Account Dropdown */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">Account</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Select account..."
                value={accountSearchQuery}
                onChange={(e) => {
                  setAccountSearchQuery(e.target.value);
                  setShowAccountDropdown(true);
                }}
                onFocus={() => setShowAccountDropdown(true)}
                className="input w-full"
              />
              {showAccountDropdown && filteredAccounts.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {filteredAccounts.slice(0, 50).map((account) => (
                        <button
                          key={account._id}
                          onClick={() => handleAccountSelect(account)}
                      className={`w-full text-left px-4 py-2 hover:bg-gray-50 ${
                        selectedAccount?._id === account._id ? 'bg-orange-50' : ''
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900">{account.accountName || account.accountCode}</div>
                      {account.accountName && (
                        <div className="text-xs text-gray-500">{account.accountCode}</div>
                      )}
                        </button>
                      ))}
                  </div>
                )}
          </div>
        </div>

          {/* From Date */}
                  <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
                    <input
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="input w-full"
                    />
                  </div>

          {/* To Date */}
                  <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
                    <input
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="input w-full"
                    />
                  </div>

          {/* View Button */}
                  <div>
                    <button
              onClick={handleView}
              className="btn btn-primary w-full"
              disabled={!selectedAccount}
                    >
              View
                    </button>
                  </div>
                </div>
              </div>

      {/* Ledger Report */}
          {selectedAccount && (
        <div className="bg-white border border-gray-200 rounded-lg">
          {/* Report Header */}
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold italic text-center mb-2">Account Ledger</h2>
            <div className="text-center">
              <p className="text-lg font-bold italic">{selectedAccount.accountName || selectedAccount.accountCode}</p>
                  {filters.startDate && filters.endDate && (
                <p className="text-sm text-gray-600 mt-1">
                  From: {formatDate(filters.startDate)} To: {formatDate(filters.endDate)}
                      </p>
                    )}
                </div>
              </div>

          {/* Ledger Table */}
          <div className="overflow-x-auto">
              {ledgerLoading ? (
                <div className="flex justify-center items-center py-12">
                  <LoadingSpinner />
                </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Voucher No</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Particular</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Debits</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Credits</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Balance</th>
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
                      {formatCurrency(Math.abs(summary.openingBalance || 0))}
                    </td>
                  </tr>

                  {/* Transaction Rows */}
                  {ledgerEntries.map((entry, index) => {
                    // Build the particular text with customer/supplier info
                    let particularText = entry.description || '';
                    
                    // Add customer information if available
                    if (entry.customer) {
                      const customerName = typeof entry.customer === 'string' 
                        ? entry.customer 
                        : (entry.customer.businessName || 
                           `${entry.customer.firstName || ''} ${entry.customer.lastName || ''}`.trim() ||
                           entry.customer.displayName ||
                           entry.customer.name);
                      
                      if (customerName) {
                        particularText = particularText 
                          ? `${particularText} - ${customerName}`
                          : customerName;
                      }
                    }
                    
                    // Add supplier information if available
                    if (entry.supplier) {
                      const supplierName = typeof entry.supplier === 'string'
                        ? entry.supplier
                        : (entry.supplier.companyName || 
                           entry.supplier.contactPerson?.name ||
                           entry.supplier.name ||
                           `${entry.supplier.firstName || ''} ${entry.supplier.lastName || ''}`.trim());
                      
                      if (supplierName) {
                        particularText = particularText 
                          ? `${particularText} - ${supplierName}`
                          : supplierName;
                      }
                    }
                    
                    return (
                        <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{formatDate(entry.date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{entry.reference || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {particularText || '-'}
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
                    );
                  })}

                  {/* Total Row */}
                  {ledgerEntries.length > 0 && (
                    <tr className="bg-gray-100 font-bold">
                      <td className="px-4 py-3 text-sm text-gray-900"></td>
                      <td className="px-4 py-3 text-sm text-gray-900"></td>
                      <td className="px-4 py-3 text-sm text-gray-900">Total</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {formatCurrency(totalDebits)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {formatCurrency(totalCredits)}
                          </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {formatCurrency(Math.abs(closingBalance))}
                          </td>
                        </tr>
                  )}
                    </tbody>
                  </table>
              )}
            </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 flex justify-between text-xs text-gray-600">
            <div>Print Date: {new Date().toLocaleString('en-US', { 
              year: 'numeric', 
              month: '2-digit', 
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            })}</div>
            <div>Page: 1 of 1</div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!selectedAccount && !ledgerLoading && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Select an account and click View to see ledger entries</p>
      </div>
      )}
    </div>
  );
};

export default AccountLedger;

