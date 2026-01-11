import React, { useState, useEffect } from 'react';
import { 
  X, 
  Tag, 
  Percent, 
  TrendingUp, 
  Calendar, 
  Users, 
  Package, 
  AlertCircle,
  CheckCircle,
  Clock,
  HelpCircle,
  RefreshCw
} from 'lucide-react';
import {
  useCreateDiscountMutation,
  useGenerateCodeSuggestionsMutation,
  useCheckCodeAvailabilityQuery,
} from '../store/services/discountsApi';
import { useGetProductsQuery } from '../store/services/productsApi';
import { useGetCategoriesQuery } from '../store/services/categoriesApi';
import { useGetCustomersQuery } from '../store/services/customersApi';
import { showSuccessToast, showErrorToast, handleApiError } from '../utils/errorHandler';
import { LoadingSpinner } from '../components/LoadingSpinner';

const CreateDiscountModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    code: '',
    type: 'percentage',
    value: 0,
    maximumDiscount: '',
    minimumOrderAmount: 0,
    applicableTo: 'all',
    applicableProducts: [],
    applicableCategories: [],
    applicableCustomers: [],
    customerTiers: [],
    businessTypes: [],
    usageLimit: '',
    usageLimitPerCustomer: '',
    validFrom: new Date().toISOString().split('T')[0],
    validUntil: '',
    combinableWithOtherDiscounts: false,
    combinableDiscounts: [],
    priority: 0,
    conditions: {
      minimumQuantity: 1,
      maximumQuantity: '',
      daysOfWeek: [],
      timeOfDay: {
        start: '',
        end: ''
      },
      firstTimeCustomersOnly: false,
      returningCustomersOnly: false
    }
  });
  
  const [errors, setErrors] = useState({});
  const [activeTab, setActiveTab] = useState('basic');
  const [codeSuggestions, setCodeSuggestions] = useState([]);
  const [showCodeSuggestions, setShowCodeSuggestions] = useState(false);

  // Fetch data for dropdowns
  const { data: productsData } = useGetProductsQuery({ limit: 1000 });
  const { data: categoriesData } = useGetCategoriesQuery({ limit: 1000 });
  const { data: customersData } = useGetCustomersQuery({ limit: 1000 });
  
  const products = productsData?.data?.products || productsData?.products || [];
  const categories = categoriesData?.data?.categories || categoriesData?.categories || [];
  const customers = customersData?.data?.customers || customersData?.customers || [];
  
  const [createDiscount, { isLoading: isCreating }] = useCreateDiscountMutation();
  const [generateCodeSuggestionsMutation] = useGenerateCodeSuggestionsMutation();

  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: Tag },
    { id: 'applicability', label: 'Applicability', icon: Users },
    { id: 'conditions', label: 'Conditions', icon: AlertCircle },
    { id: 'advanced', label: 'Advanced', icon: HelpCircle }
  ];

  const daysOfWeek = [
    { value: 'monday', label: 'Monday' },
    { value: 'tuesday', label: 'Tuesday' },
    { value: 'wednesday', label: 'Wednesday' },
    { value: 'thursday', label: 'Thursday' },
    { value: 'friday', label: 'Friday' },
    { value: 'saturday', label: 'Saturday' },
    { value: 'sunday', label: 'Sunday' }
  ];

  const customerTiers = [
    { value: 'bronze', label: 'Bronze' },
    { value: 'silver', label: 'Silver' },
    { value: 'gold', label: 'Gold' },
    { value: 'platinum', label: 'Platinum' }
  ];

  const businessTypes = [
    { value: 'retail', label: 'Retail' },
    { value: 'wholesale', label: 'Wholesale' },
    { value: 'distributor', label: 'Distributor' }
  ];

  // Generate code suggestions when name or type changes
  useEffect(() => {
    if (formData.name && formData.type) {
      generateCodeSuggestions();
    }
  }, [formData.name, formData.type]);

  const generateCodeSuggestions = async () => {
    try {
      const response = await generateCodeSuggestionsMutation({
        name: formData.name,
        type: formData.type
      }).unwrap();
      setCodeSuggestions(response?.suggestions || response?.data?.suggestions || []);
    } catch (error) {
      // Error generating code suggestions - silent fail
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Basic validation
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.code.trim()) {
      newErrors.code = 'Code is required';
    } else if (!/^[A-Z0-9-_]+$/.test(formData.code)) {
      newErrors.code = 'Code can only contain uppercase letters, numbers, hyphens, and underscores';
    }

    if (formData.value <= 0) {
      newErrors.value = 'Value must be greater than 0';
    }

    if (formData.type === 'percentage' && formData.value > 100) {
      newErrors.value = 'Percentage cannot exceed 100%';
    }

    if (!formData.validFrom) {
      newErrors.validFrom = 'Valid from date is required';
    }

    if (!formData.validUntil) {
      newErrors.validUntil = 'Valid until date is required';
    } else if (new Date(formData.validUntil) <= new Date(formData.validFrom)) {
      newErrors.validUntil = 'Valid until date must be after valid from date';
    }

    // Applicability validation
    if (formData.applicableTo === 'products' && formData.applicableProducts.length === 0) {
      newErrors.applicableProducts = 'At least one product must be selected';
    }

    if (formData.applicableTo === 'categories' && formData.applicableCategories.length === 0) {
      newErrors.applicableCategories = 'At least one category must be selected';
    }

    if (formData.applicableTo === 'customers' && formData.applicableCustomers.length === 0) {
      newErrors.applicableCustomers = 'At least one customer must be selected';
    }

    // Usage limits validation
    if (formData.usageLimit && formData.usageLimitPerCustomer && 
        parseInt(formData.usageLimitPerCustomer) > parseInt(formData.usageLimit)) {
      newErrors.usageLimitPerCustomer = 'Per-customer limit cannot exceed total limit';
    }

    // Conditions validation
    if (formData.conditions.minimumQuantity && formData.conditions.maximumQuantity &&
        parseInt(formData.conditions.minimumQuantity) > parseInt(formData.conditions.maximumQuantity)) {
      newErrors.maximumQuantity = 'Maximum quantity cannot be less than minimum quantity';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setActiveTab('basic'); // Go to first tab with errors
      return;
    }

    try {
      // Prepare data for submission
      const submitData = {
        ...formData,
        code: formData.code.toUpperCase(),
        value: parseFloat(formData.value),
        maximumDiscount: formData.maximumDiscount ? parseFloat(formData.maximumDiscount) : null,
        minimumOrderAmount: parseFloat(formData.minimumOrderAmount),
        usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : null,
        usageLimitPerCustomer: formData.usageLimitPerCustomer ? parseInt(formData.usageLimitPerCustomer) : null,
        priority: parseInt(formData.priority),
        conditions: {
          ...formData.conditions,
          minimumQuantity: parseInt(formData.conditions.minimumQuantity),
          maximumQuantity: formData.conditions.maximumQuantity ? parseInt(formData.conditions.maximumQuantity) : null
        }
      };

      await createDiscount(submitData).unwrap();
      showSuccessToast('Discount created successfully');
      onSuccess();
    } catch (error) {
      handleApiError(error, 'Create Discount');
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleConditionChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      conditions: {
        ...prev.conditions,
        [field]: value
      }
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleTimeChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      conditions: {
        ...prev.conditions,
        timeOfDay: {
          ...prev.conditions.timeOfDay,
          [field]: value
        }
      }
    }));
  };

  const handleArrayChange = (field, value, checked) => {
    setFormData(prev => ({
      ...prev,
      [field]: checked 
        ? [...prev[field], value]
        : prev[field].filter(item => item !== value)
    }));
  };

  const handleCodeSuggestionSelect = (suggestion) => {
    setFormData(prev => ({
      ...prev,
      code: suggestion
    }));
    setShowCodeSuggestions(false);
  };

  const { data: codeAvailabilityData } = useCheckCodeAvailabilityQuery(
    formData.code,
    { skip: formData.code.length < 3 }
  );
  
  useEffect(() => {
    if (codeAvailabilityData && !codeAvailabilityData.available) {
      setErrors(prev => ({
        ...prev,
        code: 'This code is already taken'
      }));
    } else if (codeAvailabilityData && codeAvailabilityData.available) {
      setErrors(prev => {
        const newErrors = { ...prev };
        if (newErrors.code === 'This code is already taken') {
          delete newErrors.code;
        }
        return newErrors;
      });
    }
  }, [codeAvailabilityData]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <div className="p-3 bg-blue-50 rounded-lg mr-4">
              <Tag className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Create Discount</h3>
              <p className="text-sm text-gray-500">Create a new percentage or fixed amount discount</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isCreating}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {activeTab === 'basic' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
                      errors.name ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="e.g., Summer Sale 2024"
                    disabled={isCreating}
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.name}
                    </p>
                  )}
                </div>

                {/* Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Code <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase();
                        handleChange('code', value);
                        // Code availability is checked automatically via useCheckCodeAvailabilityQuery
                      }}
                      onFocus={() => setShowCodeSuggestions(true)}
                      className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
                        errors.code ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="e.g., SUMMER2024"
                      disabled={isCreating}
                    />
                    <button
                      type="button"
                      onClick={generateCodeSuggestions}
                      className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                      disabled={isCreating}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>
                  
                  {/* Code Suggestions */}
                  {showCodeSuggestions && codeSuggestions.length > 0 && (
                    <div className="mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10">
                      {codeSuggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleCodeSuggestionSelect(suggestion)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 first:rounded-t-md last:rounded-b-md"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {errors.code && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.code}
                    </p>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  rows={3}
                  placeholder="Describe the discount..."
                  disabled={isCreating}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => handleChange('type', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    disabled={isCreating}
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed_amount">Fixed Amount</option>
                  </select>
                </div>

                {/* Value */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Value <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    {formData.type === 'percentage' ? (
                      <>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={formData.value}
                          onChange={(e) => handleChange('value', parseFloat(e.target.value) || 0)}
                          className={`block w-full pr-10 pl-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
                            errors.value ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder="10"
                          disabled={isCreating}
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                          <Percent className="h-4 w-4 text-gray-400" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <TrendingUp className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.value}
                          onChange={(e) => handleChange('value', parseFloat(e.target.value) || 0)}
                          className={`block w-full pl-10 pr-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
                            errors.value ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder="10.00"
                          disabled={isCreating}
                        />
                      </>
                    )}
                  </div>
                  {errors.value && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.value}
                    </p>
                  )}
                </div>
              </div>

              {/* Maximum Discount (for percentage) */}
              {formData.type === 'percentage' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Maximum Discount Amount (Optional)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <TrendingUp className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.maximumDiscount}
                      onChange={(e) => handleChange('maximumDiscount', e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="50.00"
                      disabled={isCreating}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Maximum amount that can be discounted (e.g., 50 max for 20% discount)
                  </p>
                </div>
              )}

              {/* Minimum Order Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum Order Amount
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <TrendingUp className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.minimumOrderAmount}
                    onChange={(e) => handleChange('minimumOrderAmount', parseFloat(e.target.value) || 0)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="0.00"
                    disabled={isCreating}
                  />
                </div>
              </div>

              {/* Validity Period */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Valid From <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Calendar className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="date"
                      value={formData.validFrom}
                      onChange={(e) => handleChange('validFrom', e.target.value)}
                      className={`block w-full pl-10 pr-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
                        errors.validFrom ? 'border-red-300' : 'border-gray-300'
                      }`}
                      disabled={isCreating}
                    />
                  </div>
                  {errors.validFrom && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.validFrom}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Valid Until <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Calendar className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="date"
                      value={formData.validUntil}
                      onChange={(e) => handleChange('validUntil', e.target.value)}
                      className={`block w-full pl-10 pr-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
                        errors.validUntil ? 'border-red-300' : 'border-gray-300'
                      }`}
                      disabled={isCreating}
                    />
                  </div>
                  {errors.validUntil && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.validUntil}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'applicability' && (
            <div className="space-y-6">
              {/* Applicable To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Applicable To <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.applicableTo}
                  onChange={(e) => handleChange('applicableTo', e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  disabled={isCreating}
                >
                  <option value="all">All Orders</option>
                  <option value="products">Specific Products</option>
                  <option value="categories">Specific Categories</option>
                  <option value="customers">Specific Customers</option>
                </select>
              </div>

              {/* Products Selection */}
              {formData.applicableTo === 'products' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Products
                  </label>
                  <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-md p-3">
                    {products?.data?.products?.map((product) => (
                      <label key={product._id} className="flex items-center space-x-2 py-1">
                        <input
                          type="checkbox"
                          checked={formData.applicableProducts.includes(product._id)}
                          onChange={(e) => handleArrayChange('applicableProducts', product._id, e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          disabled={isCreating}
                        />
                        <span className="text-sm text-gray-900">
                          {product.name} ({product.category || 'N/A'})
                        </span>
                      </label>
                    ))}
                  </div>
                  {errors.applicableProducts && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.applicableProducts}
                    </p>
                  )}
                </div>
              )}

              {/* Categories Selection */}
              {formData.applicableTo === 'categories' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Categories
                  </label>
                  <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-md p-3">
                    {categories?.data?.categories?.map((category) => (
                      <label key={category._id} className="flex items-center space-x-2 py-1">
                        <input
                          type="checkbox"
                          checked={formData.applicableCategories.includes(category._id)}
                          onChange={(e) => handleArrayChange('applicableCategories', category._id, e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          disabled={isCreating}
                        />
                        <span className="text-sm text-gray-900">{category.name}</span>
                      </label>
                    ))}
                  </div>
                  {errors.applicableCategories && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.applicableCategories}
                    </p>
                  )}
                </div>
              )}

              {/* Customers Selection */}
              {formData.applicableTo === 'customers' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Customers
                  </label>
                  <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-md p-3">
                    {customers?.data?.customers?.map((customer) => (
                      <label key={customer._id} className="flex items-center space-x-2 py-1">
                        <input
                          type="checkbox"
                          checked={formData.applicableCustomers.includes(customer._id)}
                          onChange={(e) => handleArrayChange('applicableCustomers', customer._id, e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          disabled={isCreating}
                        />
                        <span className="text-sm text-gray-900">
                          {customer.displayName} ({customer.email})
                        </span>
                      </label>
                    ))}
                  </div>
                  {errors.applicableCustomers && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.applicableCustomers}
                    </p>
                  )}
                </div>
              )}

              {/* Customer Tiers */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Tiers (Optional)
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {customerTiers.map((tier) => (
                    <label key={tier.value} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.customerTiers.includes(tier.value)}
                        onChange={(e) => handleArrayChange('customerTiers', tier.value, e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        disabled={isCreating}
                      />
                      <span className="text-sm text-gray-900 capitalize">{tier.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Business Types */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Business Types (Optional)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {businessTypes.map((type) => (
                    <label key={type.value} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.businessTypes.includes(type.value)}
                        onChange={(e) => handleArrayChange('businessTypes', type.value, e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        disabled={isCreating}
                      />
                      <span className="text-sm text-gray-900 capitalize">{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'conditions' && (
            <div className="space-y-6">
              {/* Quantity Conditions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minimum Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.conditions.minimumQuantity}
                    onChange={(e) => handleConditionChange('minimumQuantity', parseInt(e.target.value) || 1)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    disabled={isCreating}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Maximum Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.conditions.maximumQuantity}
                    onChange={(e) => handleConditionChange('maximumQuantity', e.target.value)}
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
                      errors.maximumQuantity ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Leave empty for no limit"
                    disabled={isCreating}
                  />
                  {errors.maximumQuantity && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.maximumQuantity}
                    </p>
                  )}
                </div>
              </div>

              {/* Days of Week */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Days of Week (Optional)
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {daysOfWeek.map((day) => (
                    <label key={day.value} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.conditions.daysOfWeek.includes(day.value)}
                        onChange={(e) => {
                          const currentDays = formData.conditions.daysOfWeek;
                          const newDays = e.target.checked
                            ? [...currentDays, day.value]
                            : currentDays.filter(d => d !== day.value);
                          handleConditionChange('daysOfWeek', newDays);
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        disabled={isCreating}
                      />
                      <span className="text-sm text-gray-900">{day.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Time of Day */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time of Day (Optional)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={formData.conditions.timeOfDay.start}
                      onChange={(e) => handleTimeChange('start', e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      disabled={isCreating}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={formData.conditions.timeOfDay.end}
                      onChange={(e) => handleTimeChange('end', e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      disabled={isCreating}
                    />
                  </div>
                </div>
              </div>

              {/* Customer Type Restrictions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Restrictions (Optional)
                </label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.conditions.firstTimeCustomersOnly}
                      onChange={(e) => handleConditionChange('firstTimeCustomersOnly', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      disabled={isCreating}
                    />
                    <span className="text-sm text-gray-900">First-time customers only</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.conditions.returningCustomersOnly}
                      onChange={(e) => handleConditionChange('returningCustomersOnly', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      disabled={isCreating}
                    />
                    <span className="text-sm text-gray-900">Returning customers only</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="space-y-6">
              {/* Usage Limits */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total Usage Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.usageLimit}
                    onChange={(e) => handleChange('usageLimit', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Leave empty for unlimited"
                    disabled={isCreating}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Usage Limit Per Customer
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.usageLimitPerCustomer}
                    onChange={(e) => handleChange('usageLimitPerCustomer', e.target.value)}
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
                      errors.usageLimitPerCustomer ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Leave empty for unlimited"
                    disabled={isCreating}
                  />
                  {errors.usageLimitPerCustomer && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.usageLimitPerCustomer}
                    </p>
                  )}
                </div>
              </div>

              {/* Combination Rules */}
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.combinableWithOtherDiscounts}
                    onChange={(e) => handleChange('combinableWithOtherDiscounts', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    disabled={isCreating}
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Combinable with other discounts
                  </span>
                </label>
                <p className="mt-1 text-xs text-gray-500">
                  Allow this discount to be used together with other active discounts
                </p>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.priority}
                  onChange={(e) => handleChange('priority', parseInt(e.target.value) || 0)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="0"
                  disabled={isCreating}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Higher numbers have higher priority when multiple discounts apply
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-6 border-t border-gray-200">
            <div className="flex space-x-2">
              {activeTab !== 'basic' && (
                <button
                  type="button"
                  onClick={() => {
                    const currentIndex = tabs.findIndex(tab => tab.id === activeTab);
                    if (currentIndex > 0) {
                      setActiveTab(tabs[currentIndex - 1].id);
                    }
                  }}
                  className="btn btn-secondary"
                  disabled={isCreating}
                >
                  Previous
                </button>
              )}
              {activeTab !== 'advanced' && (
                <button
                  type="button"
                  onClick={() => {
                    const currentIndex = tabs.findIndex(tab => tab.id === activeTab);
                    if (currentIndex < tabs.length - 1) {
                      setActiveTab(tabs[currentIndex + 1].id);
                    }
                  }}
                  className="btn btn-secondary"
                  disabled={isCreating}
                >
                  Next
                </button>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isCreating}
              >
                {isCreating ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating...
                  </div>
                ) : (
                  'Create Discount'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateDiscountModal;
