import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { 
  Calendar, 
  Save, 
  RotateCcw,
  Printer,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { showSuccessToast, showErrorToast, handleApiError } from '../utils/errorHandler';
import { formatCurrency } from '../utils/formatters';
import { customersAPI, cashReceiptsAPI, chartOfAccountsAPI } from '../services/api';

const CashReceiving = () => {
  const queryClient = useQueryClient();

  // Voucher form state
  const [voucherData, setVoucherData] = useState({
    cashAccount: 'CASH IN HAND',
    voucherDate: new Date().toISOString().split('T')[0],
    voucherNo: '',
    paymentType: 'CASH'
  });

  // City selection state
  const [cities, setCities] = useState([]);
  const [selectedCities, setSelectedCities] = useState([]);
  const [showZeroBalance, setShowZeroBalance] = useState(false);

  // Customer grid state
  const [customers, setCustomers] = useState([]);
  const [customerEntries, setCustomerEntries] = useState([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);

  // Fetch cities
  const { data: citiesData, isLoading: citiesLoading } = useQuery(
    'cities',
    () => customersAPI.getCities(),
    {
      select: (data) => data?.data || [],
      onError: (error) => {
        console.error('Error fetching cities:', error);
        showErrorToast(handleApiError(error));
      }
    }
  );

  // Fetch cash accounts from chart of accounts
  const { data: cashAccountsData } = useQuery(
    ['cashAccounts', { accountType: 'asset', accountCategory: 'current_assets' }],
    () => chartOfAccountsAPI.getAccounts({ 
      accountType: 'asset', 
      accountCategory: 'current_assets',
      isActive: 'true'
    }),
    {
      select: (data) => {
        const accounts = data?.data || data?.accounts || [];
        // Filter for cash-related accounts
        return accounts.filter(acc => 
          acc.accountName?.toLowerCase().includes('cash') ||
          acc.accountName?.toLowerCase().includes('bank')
        );
      },
      onError: (error) => {
        console.error('Error fetching cash accounts:', error);
      }
    }
  );

  // Update cities when data is fetched
  useEffect(() => {
    if (citiesData) {
      setCities(citiesData);
    }
  }, [citiesData]);

  // Generate voucher number (you can implement auto-generation logic here)
  useEffect(() => {
    if (!voucherData.voucherNo) {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const random = Math.floor(Math.random() * 10000);
      setVoucherData(prev => ({
        ...prev,
        voucherNo: `CR-${year}${month}${day}${random}`
      }));
    }
  }, [voucherData.voucherNo]);

  // Load customers by selected cities
  const loadCustomers = async () => {
    if (selectedCities.length === 0) {
      showErrorToast('Please select at least one city');
      return;
    }

    setIsLoadingCustomers(true);
    try {
      const citiesParam = selectedCities.join(',');
      const response = await customersAPI.getCustomersByCities({
        cities: citiesParam,
        showZeroBalance: showZeroBalance
      });

      const loadedCustomers = response?.data || [];
      setCustomers(loadedCustomers);

      // Initialize customer entries
      const entries = loadedCustomers.map(customer => ({
        customerId: customer._id,
        accountName: customer.accountName || customer.businessName || customer.name,
        balance: customer.balance || customer.pendingBalance || 0,
        particular: '',
        amount: ''
      }));

      setCustomerEntries(entries);
    } catch (error) {
      console.error('Error loading customers:', error);
      showErrorToast(handleApiError(error));
    } finally {
      setIsLoadingCustomers(false);
    }
  };

  // Handle city selection toggle
  const handleCityToggle = (city) => {
    setSelectedCities(prev => {
      if (prev.includes(city)) {
        return prev.filter(c => c !== city);
      } else {
        return [...prev, city];
      }
    });
  };

  // Handle unselect all cities
  const handleUnselectAll = () => {
    setSelectedCities([]);
    setCustomers([]);
    setCustomerEntries([]);
  };

  // Handle customer entry change
  const handleEntryChange = (index, field, value) => {
    setCustomerEntries(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value
      };
      return updated;
    });
  };

  // Calculate total
  const total = customerEntries.reduce((sum, entry) => {
    const amount = parseFloat(entry.amount) || 0;
    return sum + amount;
  }, 0);

  // Batch create cash receipts mutation
  const createBatchMutation = useMutation(
    (data) => cashReceiptsAPI.createBatchCashReceipts(data),
    {
      onSuccess: (response) => {
        queryClient.invalidateQueries('cashReceipts');
        queryClient.invalidateQueries('customers');
        showSuccessToast(response?.message || `Successfully created ${response?.data?.count || 0} cash receipt(s)`);
        
        // Reset form
        setCustomerEntries(prev => prev.map(entry => ({
          ...entry,
          particular: '',
          amount: ''
        })));
        
        // Generate new voucher number
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const random = Math.floor(Math.random() * 10000);
        setVoucherData(prev => ({
          ...prev,
          voucherNo: `CR-${year}${month}${day}${random}`
        }));
      },
      onError: (error) => {
        showErrorToast(handleApiError(error));
      }
    }
  );

  // Handle save
  const handleSave = () => {
    // Filter entries with amounts
    const entriesWithAmounts = customerEntries.filter(entry => {
      const amount = parseFloat(entry.amount);
      return amount > 0;
    });

    if (entriesWithAmounts.length === 0) {
      showErrorToast('Please enter at least one amount');
      return;
    }

    // Prepare receipts data
    const receipts = entriesWithAmounts.map(entry => ({
      customer: entry.customerId,
      amount: parseFloat(entry.amount),
      particular: entry.particular || 'Cash Receipt'
    }));

    const batchData = {
      voucherDate: voucherData.voucherDate,
      cashAccount: voucherData.cashAccount,
      paymentType: voucherData.paymentType,
      receipts
    };

    createBatchMutation.mutate(batchData);
  };

  // Handle reset
  const handleReset = () => {
    setCustomerEntries(prev => prev.map(entry => ({
      ...entry,
      particular: '',
      amount: ''
    })));
  };

  // Handle print (placeholder)
  const handlePrint = () => {
    showSuccessToast('Print functionality coming soon');
  };

  const cashAccounts = cashAccountsData || [];
  const defaultCashAccount = cashAccounts.find(acc => 
    acc.accountName?.toLowerCase().includes('cash in hand')
  )?.accountName || 'CASH IN HAND';

  return (
    <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Cash Receipt Voucher</h1>

        {/* Voucher Form */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cash Account
              </label>
              <select
                value={voucherData.cashAccount}
                onChange={(e) => setVoucherData(prev => ({ ...prev, cashAccount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="CASH IN HAND">CASH IN HAND</option>
                {cashAccounts.map(account => (
                  <option key={account._id} value={account.accountName}>
                    {account.accountName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Type
              </label>
              <select
                value={voucherData.paymentType}
                onChange={(e) => setVoucherData(prev => ({ ...prev, paymentType: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="CASH">CASH</option>
                <option value="CHECK">CHECK</option>
                <option value="BANK_TRANSFER">BANK TRANSFER</option>
                <option value="OTHER">OTHER</option>
              </select>
            </div>

            <div className="bg-blue-50 p-4 rounded-md">
              <div className="text-sm text-gray-600">Total:</div>
              <div className="text-2xl font-bold text-blue-600">
                {formatCurrency(total)}
              </div>
            </div>
          </div>

          {/* Middle Panel */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Voucher Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={voucherData.voucherDate}
                  onChange={(e) => setVoucherData(prev => ({ ...prev, voucherDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Calendar className="absolute right-3 top-2.5 h-5 w-5 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Voucher No
              </label>
              <input
                type="text"
                value={voucherData.voucherNo}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 focus:outline-none"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="showZeroBalance"
                checked={showZeroBalance}
                onChange={(e) => setShowZeroBalance(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="showZeroBalance" className="text-sm text-gray-700">
                Show Zero Balance
              </label>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={handlePrint}
                className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 flex items-center justify-center"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </button>
              <button
                onClick={handleUnselectAll}
                className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                UnSelect All
              </button>
              <button
                onClick={loadCustomers}
                disabled={isLoadingCustomers || selectedCities.length === 0}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isLoadingCustomers ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Load
              </button>
            </div>
          </div>

          {/* Right Panel - City Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Cities
            </label>
            <div className="border border-gray-300 rounded-md h-64 overflow-y-auto bg-white">
              {citiesLoading ? (
                <div className="p-4 text-center text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Loading cities...
                </div>
              ) : cities.length === 0 ? (
                <div className="p-4 text-center text-gray-500">No cities available</div>
              ) : (
                <div className="p-2">
                  {cities.map((city) => (
                    <div key={city} className="flex items-center p-2 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        id={`city-${city}`}
                        checked={selectedCities.includes(city)}
                        onChange={() => handleCityToggle(city)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-2"
                      />
                      <label
                        htmlFor={`city-${city}`}
                        className="text-sm text-gray-700 cursor-pointer flex-1"
                      >
                        {city}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Customer Grid */}
      {customerEntries.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">Customer Receipts</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Particular
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {customerEntries.map((entry, index) => (
                  <tr
                    key={entry.customerId}
                    className={parseFloat(entry.amount) > 0 ? 'bg-yellow-50' : ''}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {entry.accountName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(entry.balance)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="text"
                        value={entry.particular}
                        onChange={(e) => handleEntryChange(index, 'particular', e.target.value)}
                        placeholder="Enter description"
                        className="w-full px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="number"
                        value={entry.amount}
                        onChange={(e) => handleEntryChange(index, 'amount', e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="w-full px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end space-x-4 bg-white rounded-lg shadow p-6">
        <button
          onClick={handleSave}
          disabled={createBatchMutation.isLoading || total === 0}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {createBatchMutation.isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save
        </button>
        <button
          disabled
          className="px-6 py-2 bg-gray-400 text-white rounded-md cursor-not-allowed flex items-center"
        >
          Update
        </button>
        <button
          onClick={handleReset}
          className="px-6 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 flex items-center"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </button>
      </div>
    </div>
  );
};

export default CashReceiving;

