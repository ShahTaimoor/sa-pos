import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useForm } from 'react-hook-form';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Users,
  Building,
  User,
  X,
  Mail,
  Phone,
  MapPin,
  MessageSquare
} from 'lucide-react';
import { customersAPI, chartOfAccountsAPI, citiesAPI } from '../services/api';
import { useFuzzySearch } from '../hooks/useFuzzySearch';
import toast from 'react-hot-toast';
import { LoadingSpinner, LoadingButton, LoadingCard, LoadingGrid, LoadingPage, LoadingInline } from '../components/LoadingSpinner';
import { DeleteConfirmationDialog } from '../components/ConfirmationDialog';
import { useDeleteConfirmation } from '../hooks/useConfirmation';
import CustomerImportExport from '../components/CustomerImportExport';
import CustomerFilters from '../components/CustomerFilters';
import NotesPanel from '../components/NotesPanel';


const defaultCustomerValues = {
  name: '',
  email: '',
  phone: '',
  businessName: '',
  businessType: 'wholesale',
  customerTier: 'bronze',
  creditLimit: 0,
  openingBalance: 0,
  status: 'active',
  ledgerAccount: '',
  addresses: [{
    type: 'both',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
    isDefault: true
  }]
};

const CustomerFormModal = ({ customer, onSave, onCancel, isSubmitting }) => {
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch, setError, clearErrors } = useForm({
    defaultValues: defaultCustomerValues
  });

  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [cityFormData, setCityFormData] = useState({
    name: '',
    state: '',
    country: 'US',
    description: '',
    isActive: true
  });
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailExists, setEmailExists] = useState(false);
  const [businessNameChecking, setBusinessNameChecking] = useState(false);
  const [businessNameExists, setBusinessNameExists] = useState(false);
  const queryClient = useQueryClient();

  const addresses = watch('addresses') || defaultCustomerValues.addresses;
  const emailValue = watch('email');
  const businessNameValue = watch('businessName');

  // Email validation effect
  useEffect(() => {
    // Skip validation if email is empty or invalid format
    if (!emailValue || emailValue.trim() === '') {
      setEmailExists(false);
      clearErrors('email');
      return;
    }

    // Basic email format validation
    const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    if (!emailRegex.test(emailValue)) {
      setEmailExists(false);
      return;
    }

    // Skip check if editing and email hasn't changed
    if (customer && customer.email && customer.email.toLowerCase() === emailValue.toLowerCase()) {
      setEmailExists(false);
      clearErrors('email');
      return;
    }

    // Debounce email check
    const timeoutId = setTimeout(async () => {
      try {
        setEmailChecking(true);
        const excludeId = customer?._id || null;
        const response = await customersAPI.checkEmail(emailValue, excludeId);
        
        if (response.data?.exists) {
          setEmailExists(true);
          setError('email', {
            type: 'manual',
            message: 'Email already exists'
          });
        } else {
          setEmailExists(false);
          clearErrors('email');
        }
      } catch (error) {
        console.error('Error checking email:', error);
        // Don't block form submission on API error
        setEmailExists(false);
      } finally {
        setEmailChecking(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [emailValue, customer, setError, clearErrors]);

  // Business name validation effect
  useEffect(() => {
    // Skip validation if business name is empty
    if (!businessNameValue || businessNameValue.trim() === '') {
      setBusinessNameExists(false);
      clearErrors('businessName');
      return;
    }

    // Skip check if editing and business name hasn't changed
    if (customer && customer.businessName && customer.businessName.trim().toLowerCase() === businessNameValue.trim().toLowerCase()) {
      setBusinessNameExists(false);
      clearErrors('businessName');
      return;
    }

    // Debounce business name check
    const timeoutId = setTimeout(async () => {
      try {
        setBusinessNameChecking(true);
        const excludeId = customer?._id || null;
        const response = await customersAPI.checkBusinessName(businessNameValue, excludeId);
        
        if (response.data?.exists) {
          setBusinessNameExists(true);
          setError('businessName', {
            type: 'manual',
            message: 'Business name already exists'
          });
        } else {
          setBusinessNameExists(false);
          clearErrors('businessName');
        }
      } catch (error) {
        console.error('Error checking business name:', error);
        // Don't block form submission on API error
        setBusinessNameExists(false);
      } finally {
        setBusinessNameChecking(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [businessNameValue, customer, setError, clearErrors]);

  useEffect(() => {
    if (customer) {
      reset({
        ...defaultCustomerValues,
        ...customer,
        openingBalance: typeof customer.openingBalance === 'number'
          ? customer.openingBalance
          : (customer.pendingBalance || 0),
        ledgerAccount: customer.ledgerAccount?._id || customer.ledgerAccount || '',
        addresses: customer.addresses?.length ? customer.addresses : defaultCustomerValues.addresses
      });
      setEmailExists(false);
      setBusinessNameExists(false);
      clearErrors('email');
      clearErrors('businessName');
    } else {
      reset(defaultCustomerValues);
      setEmailExists(false);
      setBusinessNameExists(false);
      clearErrors('email');
      clearErrors('businessName');
    }
  }, [customer, reset, clearErrors]);

  const handleAddressChange = (index, field, value) => {
    const newAddresses = [...addresses];
    newAddresses[index] = { ...newAddresses[index], [field]: value };
    setValue('addresses', newAddresses, { shouldValidate: false });
  };

  const { data: ledgerAccounts = [], isLoading: ledgerAccountsLoading } = useQuery(
    ['customer-ledger-accounts'],
    () =>
      chartOfAccountsAPI.getAccounts({
        accountType: 'asset',
        accountCategory: 'current_assets',
        includePartyAccounts: 'true',
        isActive: 'true'
      }),
    {
      select: (data) => {
        const rawAccounts = data?.data?.accounts ?? data?.data ?? data?.accounts ?? data ?? [];
        if (Array.isArray(rawAccounts)) {
          return rawAccounts;
        }
        if (rawAccounts?.accounts && Array.isArray(rawAccounts.accounts)) {
          return rawAccounts.accounts;
        }
        return [];
      },
      onError: (error) => {
        console.error('Error fetching ledger accounts:', error);
      }
    }
  );

  // Fetch active cities for dropdown
  const { data: citiesData = [], isLoading: citiesLoading } = useQuery(
    ['active-cities'],
    () => citiesAPI.getActiveCities(),
    {
      select: (response) => {
        // Extract data from response - handle different response structures
        const data = response?.data?.data || response?.data || response || [];
        return Array.isArray(data) ? data : [];
      },
      onError: (error) => {
        console.error('Error fetching cities:', error);
      }
    }
  );

  // City creation mutation
  const createCityMutation = useMutation(citiesAPI.createCity, {
    onSuccess: (response) => {
      queryClient.invalidateQueries(['active-cities']);
      queryClient.refetchQueries(['active-cities']);
      toast.success('City created successfully');
      setIsCityModalOpen(false);
      setCityFormData({
        name: '',
        state: '',
        country: 'US',
        description: '',
        isActive: true
      });
      // Auto-select the newly created city
      if (response?.data?.data?.name) {
        const newCityName = response.data.data.name;
        const currentAddresses = addresses;
        if (currentAddresses.length > 0) {
          handleAddressChange(0, 'city', newCityName);
        }
      }
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to create city');
    },
  });

  const handleCitySubmit = (e) => {
    e.preventDefault();
    if (!cityFormData.name.trim()) {
      toast.error('City name is required');
      return;
    }
    createCityMutation.mutate(cityFormData);
  };

  const ledgerOptions = useMemo(() => {
    if (!Array.isArray(ledgerAccounts)) return [];

    // First, find exact "Accounts Receivable" match
    const exactMatch = ledgerAccounts.find((account) => {
      const name = (account.accountName || account.name || '').toLowerCase();
      return name === 'accounts receivable';
    });

    // Then find any accounts with "receivable" in the name
    const prioritized = ledgerAccounts.filter((account) => {
      const name = (account.accountName || account.name || '').toLowerCase();
      const tags = Array.isArray(account.tags) ? account.tags : [];
      return (
        name.includes('receivable') ||
        tags.includes('customer') ||
        tags.includes('accounts_receivable') ||
        (account.accountCode && account.accountCode.startsWith('11'))
      );
    });

    const directPosting = ledgerAccounts.filter(
      (account) => account.allowDirectPosting !== false
    );

    // Prioritize exact "Accounts Receivable" match first
    let source = [];
    if (exactMatch) {
      source = [exactMatch, ...prioritized.filter(a => a._id !== exactMatch._id && a.id !== exactMatch.id)];
    } else if (prioritized.length > 0) {
      source = prioritized;
    } else if (directPosting.length > 0) {
      source = directPosting;
    } else {
      source = ledgerAccounts;
    }

    return [...source].sort((a, b) => {
      // Keep exact match first
      if (exactMatch) {
        if (a._id === exactMatch._id || a.id === exactMatch.id) return -1;
        if (b._id === exactMatch._id || b.id === exactMatch.id) return 1;
      }
      // Then sort by account code
      const codeA = (a.accountCode || '').toString();
      const codeB = (b.accountCode || '').toString();
      return codeA.localeCompare(codeB, undefined, { numeric: true });
    });
  }, [ledgerAccounts]);

  // Auto-link to Accounts Receivable account
  useEffect(() => {
    if (ledgerOptions.length > 0) {
      // Explicitly look for "Accounts Receivable" first (by name or code 1130)
      const accountsReceivable = ledgerOptions.find((account) => {
        const name = (account.accountName || account.name || '').toLowerCase();
        return name === 'accounts receivable' || account.accountCode === '1130';
      }) || ledgerOptions[0];
      
      if (accountsReceivable && (!customer || !customer.ledgerAccount)) {
        // Only auto-set if creating new customer or customer doesn't have ledger account
        const accountId = accountsReceivable._id || accountsReceivable.id;
        if (accountId) {
          setValue('ledgerAccount', accountId, { shouldValidate: false });
        }
      }
    }
  }, [customer, ledgerOptions, setValue]);

  const onSubmit = (data) => {
    // Prevent submission if email exists
    if (emailExists) {
      toast.error('Please use a different email address');
      return;
    }
    // Prevent submission if business name exists
    if (businessNameExists) {
      toast.error('Please use a different business name');
      return;
    }
    onSave(data);
    reset(defaultCustomerValues);
    setEmailExists(false);
    setBusinessNameExists(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              {customer ? 'Edit Customer' : 'Add New Customer'}
            </h2>
            <button
              onClick={onCancel}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Business Name on top */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Business Name *
              </label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  {...register('businessName', { required: 'Business name is required' })}
                  className={`input pl-10 ${businessNameExists ? 'border-red-500' : ''}`}
                  placeholder="Enter business name"
                />
                {businessNameChecking && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <LoadingInline size="sm" />
                  </div>
                )}
              </div>
              {errors.businessName && (
                <p className="text-red-500 text-sm mt-1">{errors.businessName.message}</p>
              )}
              {businessNameExists && !errors.businessName && (
                <p className="text-red-500 text-sm mt-1">Business name already exists</p>
              )}
            </div>

            {/* Basic Information */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contact Person *
              </label>
              <input
                {...register('name', { required: 'Contact person is required' })}
                className="input"
                placeholder="Enter contact person name"
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
              )}
            </div>

            {/* Contact Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    {...register('email', { 
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'Invalid email address'
                      }
                    })}
                    type="text"
                    className={`input pl-10 ${emailExists ? 'border-red-500' : ''}`}
                    placeholder="Enter email address (optional)"
                  />
                  {emailChecking && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <LoadingInline size="sm" />
                    </div>
                  )}
                </div>
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
                )}
                {emailExists && !errors.email && (
                  <p className="text-red-500 text-sm mt-1">Email already exists</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    {...register('phone')}
                    type="tel"
                    className="input pl-10"
                    placeholder="Enter phone number"
                  />
                </div>
              </div>
            </div>

            {/* Business Information */}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Business Type
                </label>
                <select {...register('businessType')} className="input">
                  <option value="individual">Individual</option>
                  <option value="retail">Retail</option>
                  <option value="wholesale">Wholesale</option>
                  <option value="distributor">Distributor</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Tier
                </label>
                <select {...register('customerTier')} className="input">
                  <option value="bronze">Bronze</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                  <option value="platinum">Platinum</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Credit Limit ($)
                </label>
                <input
                  {...register('creditLimit', { 
                    valueAsNumber: true,
                    min: { value: 0, message: 'Credit limit must be positive' }
                  })}
                  type="number"
                  step="0.01"
                  className="input"
                  placeholder="0.00"
                />
                {errors.creditLimit && (
                  <p className="text-red-500 text-sm mt-1">{errors.creditLimit.message}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Opening Balance ($)
                </label>
                <input
                  {...register('openingBalance', { valueAsNumber: true })}
                  type="number"
                  step="0.01"
                  className="input"
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Positive means the customer owes you. Use a negative value if you owe the customer.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select {...register('status')} className="input">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>

            {/* Address */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Address</h3>
              <div className="space-y-4">
                {addresses.map((address, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Street Address
                        </label>
                        <input
                          type="text"
                          value={address.street || ''}
                          onChange={(e) => handleAddressChange(index, 'street', e.target.value)}
                          className="input"
                          placeholder="123 Main St"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          City *
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={address.city || ''}
                            onChange={(e) => handleAddressChange(index, 'city', e.target.value)}
                            className="input flex-1"
                            required
                            disabled={citiesLoading}
                          >
                            <option value="">Select a city</option>
                            {citiesData.map((city) => (
                              <option key={city._id || city.name} value={city.name}>
                                {city.name}{city.state ? `, ${city.state}` : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setIsCityModalOpen(true)}
                            className="btn btn-secondary px-3 py-2 whitespace-nowrap"
                            title="Add New City"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        {citiesLoading && (
                          <p className="text-xs text-gray-500 mt-1">Loading cities...</p>
                        )}
                        {!citiesLoading && citiesData.length === 0 && (
                          <p className="text-xs text-amber-600 mt-1">
                            No cities available. Please add cities first.
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          State
                        </label>
                        <input
                          type="text"
                          value={address.state || ''}
                          onChange={(e) => handleAddressChange(index, 'state', e.target.value)}
                          className="input"
                          placeholder="State"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          ZIP Code
                        </label>
                        <input
                          type="text"
                          value={address.zipCode || ''}
                          onChange={(e) => handleAddressChange(index, 'zipCode', e.target.value)}
                          className="input"
                          placeholder="12345"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ledger Account (Read-only, Auto-linked) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ledger Account <span className="text-gray-400 text-xs">(Auto-linked)</span>
              </label>
              {ledgerAccountsLoading ? (
                <div className="input bg-gray-50 text-gray-500">
                  Loading ledger account...
                </div>
              ) : (() => {
                const currentLedgerId = watch('ledgerAccount');
                const accountsReceivable = ledgerOptions.find((account) => {
                  const accountId = account._id || account.id;
                  return accountId === currentLedgerId || 
                         (account.accountName || account.name || '').toLowerCase() === 'accounts receivable' ||
                         account.accountCode === '1130';
                }) || ledgerOptions[0];
                
                const displayValue = accountsReceivable 
                  ? `${accountsReceivable.accountCode || '1130'} - ${accountsReceivable.accountName || accountsReceivable.name || 'Accounts Receivable'}`
                  : '1130 - Accounts Receivable';
                
                return (
                  <>
                    <input
                      type="text"
                      value={displayValue}
                      className="input bg-gray-50 text-gray-700 cursor-not-allowed"
                      readOnly
                      disabled
                    />
                    <input
                      type="hidden"
                      {...register('ledgerAccount')}
                    />
                    <p className="text-xs text-blue-600 mt-1">
                      <span className="font-medium">ℹ️ Information:</span> Customers are automatically linked to the "Accounts Receivable" account (1130) for accounting purposes. This cannot be changed.
                    </p>
                  </>
                );
              })()}
            </div>

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onCancel}
                className="btn btn-secondary"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : (customer ? 'Update Customer' : 'Add Customer')}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* City Form Modal */}
      {isCityModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  Add New City
                </h2>
                <button
                  onClick={() => {
                    setIsCityModalOpen(false);
                    setCityFormData({
                      name: '',
                      state: '',
                      country: 'US',
                      description: '',
                      isActive: true
                    });
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCitySubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    City Name *
                  </label>
                  <input
                    type="text"
                    value={cityFormData.name}
                    onChange={(e) => setCityFormData({ ...cityFormData, name: e.target.value })}
                    className="input"
                    placeholder="Enter city name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    State
                  </label>
                  <input
                    type="text"
                    value={cityFormData.state}
                    onChange={(e) => setCityFormData({ ...cityFormData, state: e.target.value })}
                    className="input"
                    placeholder="Enter state"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Country
                  </label>
                  <input
                    type="text"
                    value={cityFormData.country}
                    onChange={(e) => setCityFormData({ ...cityFormData, country: e.target.value })}
                    className="input"
                    placeholder="Enter country"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="cityIsActive"
                    checked={cityFormData.isActive}
                    onChange={(e) => setCityFormData({ ...cityFormData, isActive: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="cityIsActive" className="ml-2 block text-sm text-gray-700">
                    Active
                  </label>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCityModalOpen(false);
                      setCityFormData({
                        name: '',
                        state: '',
                        country: 'US',
                        description: '',
                        isActive: true
                      });
                    }}
                    className="btn btn-secondary"
                    disabled={createCityMutation.isLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={createCityMutation.isLoading}
                  >
                    {createCityMutation.isLoading ? 'Adding...' : 'Add City'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const Customers = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showNotes, setShowNotes] = useState(false);
  const [notesEntity, setNotesEntity] = useState(null);
  const queryClient = useQueryClient();

  const queryParams = { 
    search: searchTerm,
    ...filters
  };

  const { data, isLoading, error } = useQuery(
    ['customers', queryParams],
    () => customersAPI.getCustomers(queryParams),
    {
      keepPreviousData: true,
    }
  );

  const createMutation = useMutation(customersAPI.createCustomer, {
    onSuccess: () => {
      queryClient.invalidateQueries('customers');
      toast.success('Customer created successfully');
      setIsModalOpen(false);
      setSelectedCustomer(null);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to create customer');
    },
  });

  const updateMutation = useMutation(
    ({ id, data }) => customersAPI.updateCustomer(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('customers');
        toast.success('Customer updated successfully');
        setIsModalOpen(false);
        setSelectedCustomer(null);
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || 'Failed to update customer');
      },
    }
  );

  const deleteMutation = useMutation(customersAPI.deleteCustomer, {
    onSuccess: () => {
      queryClient.invalidateQueries('customers');
      toast.success('Customer deleted successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to delete customer');
    },
  });

  const handleEdit = (customer) => {
    setSelectedCustomer(customer);
    setIsModalOpen(true);
  };

  const { confirmation, confirmDelete, handleConfirm, handleCancel } = useDeleteConfirmation();

  const handleDelete = (customer) => {
    const customerName = customer.displayName || customer.businessName || customer.name || customer.email || 'Unknown Customer';
    confirmDelete(customerName, 'Customer', async () => {
      deleteMutation.mutate(customer._id);
    });
  };

  const handleSave = (data) => {
    if (selectedCustomer) {
      updateMutation.mutate({ id: selectedCustomer._id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
  };

  const handleClearFilters = () => {
    setFilters({});
    setSearchTerm('');
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedCustomer(null);
  };

  // Get all customers from API
  const allCustomers = data?.data?.customers || [];
  
  // Apply fuzzy search on client side for better UX
  // Hook must be called before any early returns
  const customers = useFuzzySearch(
    allCustomers,
    searchTerm,
    ['name', 'businessName', 'email', 'phone', 'displayName'],
    {
      threshold: 0.4,
      minScore: 0.3,
      limit: null // Show all matches
    }
  );

  if (isLoading) {
    return <LoadingPage message="Loading customers..." />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-danger-600">Failed to load customers</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full ">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-600">Manage your customer database</p>
        </div>
        <div className="flex-shrink-0">
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn btn-primary btn-md w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Customer
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Import/Export Section */}
      <CustomerImportExport 
        onImportComplete={() => queryClient.invalidateQueries('customers')}
        filters={queryParams}
      />

      {/* Advanced Filters */}
      <CustomerFilters 
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onClearFilters={handleClearFilters}
      />

      {/* Customers Grid */}
      {customers.length === 0 ? (
        <div className="text-center py-12">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No customers found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm ? 'Try adjusting your search terms.' : 'Get started by adding a new customer.'}
          </p>
        </div>
      ) : (
        <div className="card w-full">
          <div className="card-content p-0 w-full">
            {/* Table Header */}
            <div className="bg-gray-50 px-8 py-6 border-b border-gray-200">
              <div className="grid grid-cols-12 gap-4 items-center">
                <div className="col-span-1">
                  <h3 className="text-base font-medium text-gray-700">ID</h3>
                </div>
                <div className="col-span-3">
                  <h3 className="text-base font-medium text-gray-700">Business Name</h3>
                  <p className="text-sm text-gray-500">Contact Person</p>
                </div>
                <div className="col-span-2">
                  <h3 className="text-base font-medium text-gray-700">Email</h3>
                </div>
                <div className="col-span-1">
                  <h3 className="text-base font-medium text-gray-700">Phone</h3>
                </div>
                <div className="col-span-1">
                  <h3 className="text-base font-medium text-gray-700">Status</h3>
                </div>
                <div className="col-span-1">
                  <h3 className="text-base font-medium text-gray-700">Type</h3>
                </div>
                <div className="col-span-1">
                  <h3 className="text-base font-medium text-gray-700">Tier</h3>
                </div>
                <div className="col-span-1">
                  <h3 className="text-base font-medium text-gray-700">Credit</h3>
                </div>
                <div className="col-span-1">
                  <h3 className="text-base font-medium text-gray-700">Actions</h3>
                </div>
              </div>
            </div>

            {/* Customer Rows */}
            <div className="divide-y divide-gray-200">
              {customers.map((customer) => (
                <div key={customer._id} className="px-8 py-6 hover:bg-gray-50">
                  <div className="grid grid-cols-12 gap-4 items-center">
                    {/* Customer ID */}
                    <div className="col-span-1">
                      <p 
                        className="text-xs text-gray-500 font-mono cursor-help" 
                        title={customer._id}
                      >
                        {customer._id.slice(-6)}
                      </p>
                    </div>

                    {/* Business Name & Contact Person */}
                    <div className="col-span-3">
                      <div className="flex items-center space-x-4">
                        {customer.businessType === 'individual' ? (
                          <User className="h-6 w-6 text-gray-400" />
                        ) : (
                          <Building className="h-6 w-6 text-gray-400" />
                        )}
                        <div>
                          <h3 className="text-base font-medium text-gray-900">
                            {customer.businessName || customer.displayName}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {customer.name}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Email */}
                    <div className="col-span-2">
                      <p className="text-sm text-gray-600">{customer.email}</p>
                    </div>

                    {/* Phone */}
                    <div className="col-span-1">
                      <p className="text-sm text-gray-600">{customer.phone || '-'}</p>
                    </div>

                    {/* Status */}
                    <div className="col-span-1">
                      <span className={`badge ${
                        customer.status === 'active' ? 'badge-success' : 'badge-gray'
                      }`}>
                        {customer.status}
                      </span>
                    </div>

                    {/* Type */}
                    <div className="col-span-1">
                      <span className={`badge ${
                        customer.businessType === 'wholesale' ? 'badge-info' : 'badge-gray'
                      }`}>
                        {customer.businessType}
                      </span>
                    </div>

                    {/* Tier */}
                    <div className="col-span-1">
                      <span className={`badge ${
                        customer.customerTier === 'gold' ? 'badge-warning' :
                        customer.customerTier === 'platinum' ? 'badge-info' : 'badge-gray'
                      }`}>
                        {customer.customerTier}
                      </span>
                    </div>

                    {/* Credit */}
                    <div className="col-span-1">
                      <p className="text-sm text-gray-600">{Math.round(customer.creditLimit)}</p>
                    </div>

                    {/* Actions */}
                    <div className="col-span-1">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => {
                            setNotesEntity({ type: 'Customer', id: customer._id, name: customer.businessName || customer.name });
                            setShowNotes(true);
                          }}
                          className="text-green-600 hover:text-green-800"
                          title="Notes"
                        >
                          <MessageSquare className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleEdit(customer)}
                          className="text-primary-600 hover:text-primary-800"
                        >
                          <Edit className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(customer)}
                          className="text-danger-600 hover:text-danger-800"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Customer Form Modal */}
      {isModalOpen && (
        <CustomerFormModal
          customer={selectedCustomer}
          onSave={handleSave}
          onCancel={handleCloseModal}
          isSubmitting={createMutation.isLoading || updateMutation.isLoading}
        />
      )}
      
      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={confirmation.isOpen}
        onClose={handleCancel}
        onConfirm={handleConfirm}
        itemName={confirmation.message?.match(/"([^"]*)"/)?.[1] || ''}
        itemType="Customer"
        isLoading={deleteMutation.isLoading}
      />

      {/* Notes Panel */}
      {showNotes && notesEntity && (
        <NotesPanel
          entityType={notesEntity.type}
          entityId={notesEntity.id}
          entityName={notesEntity.name}
          onClose={() => {
            setShowNotes(false);
            setNotesEntity(null);
          }}
        />
      )}
    </div>
  );
};
