import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Edit,
  Trash2, 
  Package,
  AlertTriangle,
  Filter,
  RefreshCw,
  Tag,
  TrendingUp,
  X,
  Camera,
  Barcode,
  Printer,
  MessageSquare
} from 'lucide-react';
import { productsAPI, categoriesAPI, investorsAPI } from '../services/api';
import { useFuzzySearch } from '../hooks/useFuzzySearch';
import { handleApiError, showSuccessToast, showErrorToast } from '../utils/errorHandler';
import toast from 'react-hot-toast';
import { useLoadingState } from '../utils/loadingStates';
import { useResponsive, ResponsiveContainer, ResponsiveGrid } from '../components/ResponsiveContainer';
import ResponsiveTable from '../components/ResponsiveTable';
import { LoadingSpinner, LoadingButton, LoadingCard, LoadingGrid, LoadingPage } from '../components/LoadingSpinner';
import { DeleteConfirmationDialog } from '../components/ConfirmationDialog';
import { useDeleteConfirmation } from '../hooks/useConfirmation';
import ValidatedInput, { ValidatedTextarea, ValidatedSelect } from '../components/ValidatedInput';
import { useFormValidation } from '../hooks/useFormValidation';
import { FIELD_VALIDATORS } from '../utils/validation';
import ValidationSummary from '../components/ValidationSummary';
import ProductImportExport from '../components/ProductImportExport';
import IntegratedSearchFilters from '../components/IntegratedSearchFilters';
import { useTab } from '../contexts/TabContext';
import { useBulkOperations } from '../hooks/useBulkOperations';
import BulkOperationsBar from '../components/BulkOperationsBar';
import BulkUpdateModal from '../components/BulkUpdateModal';
import { Checkbox } from '../components/Checkbox';
import { getComponentInfo } from '../utils/componentUtils';
import BarcodeScanner from '../components/BarcodeScanner';
import BarcodeGenerator from '../components/BarcodeGenerator';
import BarcodeLabelPrinter from '../components/BarcodeLabelPrinter';
import NotesPanel from '../components/NotesPanel';

// Custom hook for keyboard shortcuts
const useKeyboardShortcuts = (shortcuts) => {
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Check if event.key exists before calling toLowerCase
      if (!event.key) return;
      
      // Don't interfere with input fields, textareas, or contenteditable elements
      const target = event.target;
      const isInputField = target.tagName === 'INPUT' || 
                          target.tagName === 'TEXTAREA' || 
                          target.contentEditable === 'true' ||
                          target.isContentEditable;
      
      // Only process shortcuts when not in input fields
      if (isInputField) return;
      
      const key = event.key.toLowerCase();
      const ctrlKey = event.ctrlKey || event.metaKey; // Support both Ctrl and Cmd
      
      // Create shortcut key
      const shortcutKey = ctrlKey ? `ctrl+${key}` : key;
      
      // Check if shortcut exists and execute
      if (shortcuts[shortcutKey]) {
        event.preventDefault();
        shortcuts[shortcutKey]();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
};

// Helper function to check if product is low stock
const isLowStock = (product) => {
  return product.inventory.currentStock <= product.inventory.reorderPoint;
};

// Helper function to check if product is expired or expiring soon
const getExpiryStatus = (product) => {
  if (!product.expiryDate) return null;
  
  const expiryDate = new Date(product.expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiryDate.setHours(0, 0, 0, 0);
  
  const diffTime = expiryDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return { status: 'expired', days: Math.abs(diffDays) };
  } else if (diffDays <= 7) {
    return { status: 'expiring_soon', days: diffDays };
  } else {
    return { status: 'valid', days: diffDays };
  }
};

// SKU and barcode generation functions removed - using product name as unique identifier


const ProductModal = ({ product, isOpen, onClose, onSave, isSubmitting, allProducts = [], onEditExisting, categories = [] }) => {
  // Use simple state instead of complex validation
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    status: 'active',
    expiryDate: '',
    pricing: {
      cost: '',
      retail: '',
      wholesale: ''
    },
    inventory: {
      currentStock: '',
      reorderPoint: ''
    }
  });
  
  // State for showing similar product names
  const [showSimilarProducts, setShowSimilarProducts] = useState(false);
  const [similarProducts, setSimilarProducts] = useState([]);
  
  // State for exact match checking
  const [exactMatch, setExactMatch] = useState(null);

  // Removed problematic useEffect that was causing infinite loop

  const [errors, setErrors] = useState({});

  // Simple handleChange function
  const handleChange = React.useCallback((event) => {
    const { name, value, type, checked } = event.target;
    let fieldValue = type === 'checkbox' ? checked : value;
    
    if (name.includes('.')) {
      // Handle nested fields like pricing.cost
      const [parent, child] = name.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: fieldValue
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: fieldValue
      }));
    }
    
    // Check for similar product names when name changes (for new products only)
    if (name === 'name' && value.length > 2 && !product) {
      // Check for exact match first
      const exact = allProducts.find(p => 
        p.name.toLowerCase() === value.toLowerCase()
      );
      
      if (exact) {
        setExactMatch(exact);
        setShowSimilarProducts(false);
        setSimilarProducts([]);
      } else {
        setExactMatch(null);
        const similar = allProducts.filter(p => 
          p.name.toLowerCase().includes(value.toLowerCase())
        ).slice(0, 3);
        
        if (similar.length > 0) {
          setSimilarProducts(similar);
          setShowSimilarProducts(true);
        } else {
          setShowSimilarProducts(false);
          setSimilarProducts([]);
        }
      }
    } else if (name === 'name') {
      setShowSimilarProducts(false);
      setSimilarProducts([]);
      setExactMatch(null);
    }
    
    // Clear error when user starts typing
    setErrors(prev => {
      if (prev[name]) {
        return { ...prev, [name]: null };
      }
      return prev;
    });
  }, [product, allProducts]);

  const handleBlur = React.useCallback((event) => {
    const { name, value } = event.target;
    
    // Simple validation
    if (name === 'name' && (!value || value.trim() === '')) {
      setErrors(prev => ({ ...prev, [name]: 'Product name is required' }));
    } else if (name === 'name' && value.length < 2) {
      setErrors(prev => ({ ...prev, [name]: 'Product name must be at least 2 characters' }));
    } else {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  }, []);

  const validateForm = React.useCallback(() => {
    const newErrors = {};
    
    if (!formData.name || formData.name.trim() === '') {
      newErrors.name = 'Product name is required';
    } else if (formData.name.length < 2) {
      newErrors.name = 'Product name must be at least 2 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData.name]);

  const resetForm = React.useCallback((newData = {}) => {
    // Format expiry date for input field (YYYY-MM-DD format)
    let expiryDateValue = '';
    if (newData.expiryDate) {
      const expiryDate = new Date(newData.expiryDate);
      if (!isNaN(expiryDate.getTime())) {
        expiryDateValue = expiryDate.toISOString().split('T')[0];
      }
    }
    
    setFormData({
      name: newData.name || '',
      description: newData.description || '',
      category: newData.category || '',
      status: newData.status || 'active',
      expiryDate: expiryDateValue,
      barcode: newData.barcode || '',
      sku: newData.sku || '',
      brand: newData.brand || '',
      pricing: {
        cost: newData.pricing?.cost || '',
        retail: newData.pricing?.retail || '',
        wholesale: newData.pricing?.wholesale || ''
      },
      inventory: {
        currentStock: newData.inventory?.currentStock || '',
        reorderPoint: newData.inventory?.reorderPoint || ''
      }
    });
    setErrors({});
  }, []);

  React.useEffect(() => {
    if (product) {
      resetForm(product);
    } else {
      resetForm({});
    }
  }, [product, resetForm]);

  React.useEffect(() => {
    // Auto-focus the first input field when modal opens
    if (isOpen) {
      setTimeout(() => {
        const firstInput = document.querySelector('input[name="name"]');
        if (firstInput) {
          firstInput.focus();
        }
      }, 100);
    }
  }, [isOpen]);

  const onSubmit = (e) => {
    e.preventDefault();
    
    // Validate form with auto-focus on first error
    const isValid = validateForm();
    
    if (!isValid) {
      // Focus on first error field
      const firstErrorField = Object.keys(errors).find(key => errors[key]);
      if (firstErrorField) {
        setTimeout(() => {
          const fieldElement = document.querySelector(`[name="${firstErrorField}"], #${firstErrorField}`);
          if (fieldElement) {
            fieldElement.focus();
            fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
      return; // Prevent submission
    }
    
    onSave(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <form onSubmit={onSubmit}>
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {product ? 'Edit Product' : 'Add New Product'}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Product Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={formData.name || ''}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Enter product name"
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                      errors.name ? 'border-red-300' : 'border-gray-300'
                    }`}
                    autoComplete="off"
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                  )}
                  
                  {/* Exact Match Warning */}
                  {exactMatch && (
                    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-red-800">
                            ⚠️ This product already exists!
                          </p>
                          <p className="text-xs text-red-600 mt-1">
                            Product: "{exactMatch.name}"
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            setTimeout(() => {
                              if (onEditExisting) {
                                onEditExisting(exactMatch);
                              }
                            }, 100);
                          }}
                          className="text-red-600 hover:text-red-800 underline text-xs font-medium"
                        >
                          Edit Existing
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Similar Products Suggestion */}
                  {showSimilarProducts && similarProducts.length > 0 && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-sm font-medium text-blue-800 mb-2">
                        Similar existing products:
                      </p>
                      <ul className="space-y-1">
                        {similarProducts.map((similar, index) => (
                          <li key={index} className="flex items-center justify-between text-sm text-blue-700">
                            <span>• {similar.name}</span>
                            <button
                              type="button"
                              onClick={() => {
                                // Close modal and edit the existing product
                                onClose();
                                setTimeout(() => {
                                  if (onEditExisting) {
                                    onEditExisting(similar);
                                  }
                                }, 100);
                              }}
                              className="text-blue-600 hover:text-blue-800 underline text-xs"
                            >
                              Edit
                            </button>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-blue-600 mt-2">
                        Choose a unique name to avoid duplicates, or edit an existing product.
                      </p>
                    </div>
                  )}
                  <p className="mt-1 text-sm text-gray-500">
                    Product name must be unique - no duplicates allowed
                  </p>
                  
                  {/* Debug Panel - Remove in production */}
                  {formData.name && (
                    <div className="mt-2 p-2 bg-gray-100 border border-gray-300 rounded text-xs">
                      <p className="font-medium text-gray-700">Debug Info:</p>
                      <p>Input: "{formData.name}"</p>
                      <p>Normalized: "{formData.name?.trim().toLowerCase().replace(/\s+/g, ' ')}"</p>
                      <p>Total Products: {allProducts?.length || 0}</p>
                      
                      {/* Show exact matches */}
                      {allProducts?.filter(p => 
                        p.name?.trim().toLowerCase().replace(/\s+/g, ' ') === formData.name?.trim().toLowerCase().replace(/\s+/g, ' ')
                      ).length > 0 && (
                        <div className="mt-1 p-1 bg-red-100 rounded">
                          <p className="text-red-700 font-medium">EXACT MATCHES FOUND:</p>
                          {allProducts?.filter(p => 
                            p.name?.trim().toLowerCase().replace(/\s+/g, ' ') === formData.name?.trim().toLowerCase().replace(/\s+/g, ' ')
                          ).map((match, idx) => (
                            <p key={idx} className="text-red-600">• "{match.name}" (ID: {match._id})</p>
                          ))}
                        </div>
                      )}
                      
                      {/* Show similar products */}
                      <p>Similar Products: {allProducts?.filter(p => 
                        p.name?.toLowerCase().includes(formData.name?.toLowerCase())
                      ).length || 0}</p>
                    </div>
                  )}
                </div>
                
                <div>
                  <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    id="category"
                    name="category"
                    value={formData.category || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Select a category</option>
                    {categories?.map((category) => (
                      <option key={category._id} value={category._id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    Optional product category
                  </p>
                  
                  {/* Debug info for categories */}
                  {process.env.NODE_ENV === 'development' && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                      <p className="font-medium text-blue-700">Categories Debug:</p>
                      <p>Total Categories: {categories?.length || 0}</p>
                      {categories?.length > 0 && (
                        <div>
                          <p className="font-medium">Available Categories:</p>
                          <ul className="text-blue-600">
                            {categories.map((cat, idx) => (
                              <li key={idx}>• {cat.name} (ID: {cat._id})</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description || ''}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Enter product description"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Optional description of the product
                  </p>
                </div>
                
                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    id="status"
                    name="status"
                    value={formData.status || 'active'}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive (Disabled)</option>
                    <option value="discontinued">Discontinued</option>
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    {formData.status === 'active' && 'Product is active and available for sale'}
                    {formData.status === 'inactive' && 'Product is disabled and hidden from sales'}
                    {formData.status === 'discontinued' && 'Product is discontinued and no longer available'}
                  </p>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="pricing.cost" className="block text-sm font-medium text-gray-700 mb-1">
                      Cost Price
                    </label>
                    <input
                      id="pricing.cost"
                      name="pricing.cost"
                      type="number"
                      step="0.01"
                      value={formData.pricing.cost || ''}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="mt-1 text-sm text-gray-500">Product cost</p>
                  </div>
                  <div>
                    <label htmlFor="pricing.retail" className="block text-sm font-medium text-gray-700 mb-1">
                      Retail Price
                    </label>
                    <input
                      id="pricing.retail"
                      name="pricing.retail"
                      type="number"
                      step="0.01"
                      value={formData.pricing.retail || ''}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="mt-1 text-sm text-gray-500">Retail selling price</p>
                  </div>
                  <div>
                    <label htmlFor="pricing.wholesale" className="block text-sm font-medium text-gray-700 mb-1">
                      Wholesale Price
                    </label>
                    <input
                      id="pricing.wholesale"
                      name="pricing.wholesale"
                      type="number"
                      step="0.01"
                      value={formData.pricing.wholesale || ''}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="mt-1 text-sm text-gray-500">Wholesale selling price</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="inventory.currentStock" className="block text-sm font-medium text-gray-700 mb-1">
                      Current Stock
                    </label>
                    <input
                      id="inventory.currentStock"
                      name="inventory.currentStock"
                      type="number"
                      value={formData.inventory.currentStock || ''}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="mt-1 text-sm text-gray-500">Current inventory quantity</p>
                  </div>
                  <div>
                    <label htmlFor="inventory.reorderPoint" className="block text-sm font-medium text-gray-700 mb-1">
                      Reorder Point
                    </label>
                    <input
                      id="inventory.reorderPoint"
                      name="inventory.reorderPoint"
                      type="number"
                      value={formData.inventory.reorderPoint || ''}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="mt-1 text-sm text-gray-500">Minimum stock level for reordering</p>
                  </div>
                </div>
                
                <div>
                  <label htmlFor="expiryDate" className="block text-sm font-medium text-gray-700 mb-1">
                    Expiry Date
                  </label>
                  <input
                    id="expiryDate"
                    name="expiryDate"
                    type="date"
                    value={formData.expiryDate || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Optional expiry date for the product. Leave empty if product does not expire.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="barcode" className="block text-sm font-medium text-gray-700 mb-1">
                      Barcode
                    </label>
                    <div className="flex space-x-2">
                      <input
                        id="barcode"
                        name="barcode"
                        type="text"
                        value={formData.barcode || ''}
                        onChange={handleChange}
                        placeholder="Enter or scan barcode"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          // This will be handled by parent component
                          if (window.scanBarcode) {
                            window.scanBarcode((barcode) => {
                              handleChange({ target: { name: 'barcode', value: barcode } });
                            });
                          }
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                        title="Scan barcode"
                      >
                        <Camera className="h-4 w-4 text-gray-600" />
                      </button>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">Product barcode for scanning</p>
                  </div>
                  <div>
                    <label htmlFor="sku" className="block text-sm font-medium text-gray-700 mb-1">
                      SKU
                    </label>
                    <input
                      id="sku"
                      name="sku"
                      type="text"
                      value={formData.sku || ''}
                      onChange={handleChange}
                      placeholder="Enter SKU"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="mt-1 text-sm text-gray-500">Stock Keeping Unit</p>
                  </div>
                </div>

                <div>
                  <label htmlFor="brand" className="block text-sm font-medium text-gray-700 mb-1">
                    Brand
                  </label>
                  <input
                    id="brand"
                    name="brand"
                    type="text"
                    value={formData.brand || ''}
                    onChange={handleChange}
                    placeholder="Enter brand name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="mt-1 text-sm text-gray-500">Product brand name</p>
                </div>
              </div>
              
              {/* Validation Summary */}
              {Object.keys(errors).some(key => errors[key]) && (
                <ValidationSummary
                  errors={errors}
                  title="Please fix the following errors before submitting:"
                  onFieldClick={(fieldName) => {
                    const fieldElement = document.querySelector(`[name="${fieldName}"], #${fieldName}`);
                    if (fieldElement) {
                      fieldElement.focus();
                      fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                />
              )}
            </div>
            
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <LoadingButton
                type="submit"
                isLoading={isSubmitting}
                disabled={!formData.name || isSubmitting || Object.keys(errors).some(key => errors[key])}
                className="btn btn-primary btn-md w-full sm:w-auto sm:ml-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {product ? 'Update Product' : 'Create Product'}
              </LoadingButton>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="btn btn-secondary btn-md w-full sm:w-auto mt-3 sm:mt-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Product Investors Modal Component
const ProductInvestorsModal = ({ product, isOpen, onClose, onSave }) => {
  const [linkedInvestors, setLinkedInvestors] = useState([]);
  const [selectedInvestor, setSelectedInvestor] = useState('');
  const [sharePercentage, setSharePercentage] = useState(30);
  const { data: investorsData, isLoading: investorsLoading } = useQuery(
    ['investors'],
    () => investorsAPI.getInvestors({}).then(res => res.data),
    { 
      enabled: isOpen,
      refetchOnMount: true,
      staleTime: 0, // Always fetch fresh data when modal opens
      cacheTime: 0 // Don't cache to ensure fresh data
    }
  );

  // Backend returns: { success: true, data: [investors] }
  // After .then(res => res.data): { success: true, data: [investors] }
  // So investorsData.data is the array of investors
  const investors = Array.isArray(investorsData?.data) ? investorsData.data : Array.isArray(investorsData) ? investorsData : [];


  React.useEffect(() => {
    if (product && isOpen) {
      // Load existing investors linked to this product
      const existingInvestors = (product.investors || []).map(inv => ({
        investorId: inv.investor?._id || inv.investor,
        investorName: inv.investor?.name || 'Unknown',
        sharePercentage: inv.sharePercentage || 30
      }));
      setLinkedInvestors(existingInvestors);
    }
  }, [product, isOpen]);

  const handleAddInvestor = () => {
    if (!selectedInvestor) {
      toast.error('Please select an investor');
      return;
    }

    const investor = investors.find(inv => inv._id === selectedInvestor);
    if (!investor) return;

    // Check if already added
    if (linkedInvestors.some(inv => inv.investorId === selectedInvestor)) {
      toast.error('This investor is already linked to this product');
      return;
    }

    setLinkedInvestors([
      ...linkedInvestors,
      {
        investorId: selectedInvestor,
        investorName: investor.name,
        sharePercentage: sharePercentage
      }
    ]);

    setSelectedInvestor('');
    setSharePercentage(30); // Reset to default
  };

  const handleRemoveInvestor = (investorId) => {
    setLinkedInvestors(linkedInvestors.filter(inv => inv.investorId !== investorId));
  };

  const handleUpdatePercentage = (investorId, newPercentage) => {
    setLinkedInvestors(linkedInvestors.map(inv =>
      inv.investorId === investorId
        ? { ...inv, sharePercentage: parseFloat(newPercentage) || 0 }
        : inv
    ));
  };

  const handleSave = () => {
    if (linkedInvestors.length === 0) {
      toast.error('Please add at least one investor');
      return;
    }

    const investorsToSave = linkedInvestors.map(inv => ({
      investor: inv.investorId,
      sharePercentage: inv.sharePercentage
    }));

    onSave(product._id, investorsToSave);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Manage Investors - {product?.name}
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Add Investor Form */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Add Investor</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <select
                    value={selectedInvestor}
                    onChange={(e) => setSelectedInvestor(e.target.value)}
                    disabled={investorsLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {investorsLoading ? 'Loading investors...' : 'Select Investor'}
                    </option>
                    {!investorsLoading && investors.length === 0 ? (
                      <option value="" disabled>No investors available. Create one from the Investors page.</option>
                    ) : (
                      investors.map(inv => (
                        <option key={inv._id} value={inv._id}>{inv.name}</option>
                      ))
                    )}
                  </select>
                </div>
                <div className="col-span-1 flex gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={sharePercentage}
                    onChange={(e) => setSharePercentage(parseFloat(e.target.value) || 0)}
                    placeholder="%"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddInvestor}
                    className="btn btn-primary px-4"
                  >
                    Add
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Set the profit share percentage for this product. This determines what % of profit goes to investors (split among all linked investors), with the remainder going to the company.
              </p>
            </div>

            {/* Linked Investors List */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">
                Linked Investors ({linkedInvestors.length})
              </h4>
              {linkedInvestors.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  No investors linked. Add investors above.
                </p>
              ) : (
                <div className="space-y-2">
                  {linkedInvestors.map((linkedInv) => (
                    <div
                      key={linkedInv.investorId}
                      className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {linkedInv.investorName}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={linkedInv.sharePercentage}
                            onChange={(e) => handleUpdatePercentage(linkedInv.investorId, e.target.value)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <span className="text-sm text-gray-600">%</span>
                        </div>
                        <button
                          onClick={() => handleRemoveInvestor(linkedInv.investorId)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={handleSave}
              className="btn btn-primary btn-md w-full sm:w-auto sm:ml-3"
            >
              Save Investors
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary btn-md w-full sm:w-auto mt-3 sm:mt-0"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Products = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedProductForInvestors, setSelectedProductForInvestors] = useState(null);
  const [isInvestorsModalOpen, setIsInvestorsModalOpen] = useState(false);
  const [bulkUpdateType, setBulkUpdateType] = useState(null);
  const [showBulkUpdateModal, setShowBulkUpdateModal] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showBarcodeGenerator, setShowBarcodeGenerator] = useState(false);
  const [showLabelPrinter, setShowLabelPrinter] = useState(false);
  const [barcodeScanTarget, setBarcodeScanTarget] = useState(null); // 'form' or 'search'
  const [showNotes, setShowNotes] = useState(false);
  const [notesEntity, setNotesEntity] = useState(null);
  const { isMobile, isTablet } = useResponsive();
  const queryClient = useQueryClient();
  const { openTab } = useTab();

  // Function to refresh categories data
  const refreshCategories = () => {
    queryClient.invalidateQueries(['categories']);
    toast.success('Categories refreshed');
  };

  // Keyboard shortcuts
  const shortcuts = {
    'ctrl+n': () => {
      setIsModalOpen(true);
      toast.success('Creating new product...');
    },
    'ctrl+f': () => {
      // Focus search field
      const searchInput = document.querySelector('input[placeholder*="Search products"]');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    },
    'ctrl+i': () => {
      toast.success('Import functionality coming soon!');
    },
    'escape': () => {
      if (isModalOpen) {
        setIsModalOpen(false);
        setSelectedProduct(null);
        toast.success('Cancelled');
      }
    },
    'f1': () => {
      toast.success('Keyboard Shortcuts: Ctrl+N (New Product), Ctrl+F (Search), Ctrl+I (Import), Esc (Cancel)');
    }
  };

  useKeyboardShortcuts(shortcuts);

  // Combine search term with filters - convert to API format
  const queryParams = {};
  
  // Set limit to get all products (remove pagination)
  queryParams.limit = 999999;
  
  // Only add search if there's a search term (at least 1 character after trim)
  const trimmedSearchTerm = searchTerm?.trim();
  if (trimmedSearchTerm && trimmedSearchTerm.length > 0) {
    queryParams.search = trimmedSearchTerm;
    // Ensure searchFields is a valid JSON array
    try {
      const searchFieldsArray = ['name', 'description', 'sku', 'barcode', 'brand'];
      queryParams.searchFields = JSON.stringify(searchFieldsArray);
    } catch (e) {
      console.error('Error stringifying searchFields:', e);
      // Fallback to default fields without JSON.stringify if needed
      queryParams.searchFields = JSON.stringify(['name', 'description']);
    }
  }

  // Convert filter format for API - only add valid values
  if (filters.category) {
    if (Array.isArray(filters.category) && filters.category.length > 0) {
      queryParams.categories = JSON.stringify(filters.category);
    } else if (typeof filters.category === 'string' && filters.category.trim()) {
      queryParams.category = filters.category.trim();
    }
  }
  if (filters.status) {
    if (Array.isArray(filters.status) && filters.status.length > 0) {
      queryParams.statuses = JSON.stringify(filters.status);
    } else if (typeof filters.status === 'string' && filters.status.trim()) {
      queryParams.status = filters.status.trim();
    }
  }
  if (filters.priceRange) {
    if (filters.priceRange.min !== undefined && filters.priceRange.min !== null && !isNaN(filters.priceRange.min)) {
      queryParams.minPrice = parseFloat(filters.priceRange.min);
    }
    if (filters.priceRange.max !== undefined && filters.priceRange.max !== null && !isNaN(filters.priceRange.max)) {
      queryParams.maxPrice = parseFloat(filters.priceRange.max);
    }
    if (filters.priceRange.field && ['retail', 'wholesale', 'cost'].includes(filters.priceRange.field)) {
      queryParams.priceField = filters.priceRange.field;
    }
  }
  if (filters.stockLevel) {
    if (filters.stockLevel.min !== undefined && filters.stockLevel.min !== null && !isNaN(filters.stockLevel.min)) {
      queryParams.minStock = parseInt(filters.stockLevel.min);
    }
    if (filters.stockLevel.max !== undefined && filters.stockLevel.max !== null && !isNaN(filters.stockLevel.max)) {
      queryParams.maxStock = parseInt(filters.stockLevel.max);
    }
  }
  if (filters.dateRange) {
    if (filters.dateRange.from && typeof filters.dateRange.from === 'string') {
      queryParams.dateFrom = filters.dateRange.from;
    }
    if (filters.dateRange.to && typeof filters.dateRange.to === 'string') {
      queryParams.dateTo = filters.dateRange.to;
    }
    if (filters.dateRange.field && ['createdAt', 'updatedAt'].includes(filters.dateRange.field)) {
      queryParams.dateField = filters.dateRange.field;
    }
  }
  
  // Add other filters that might be set
  if (filters.brand && typeof filters.brand === 'string' && filters.brand.trim()) {
    queryParams.brand = filters.brand.trim();
  }
  if (filters.stockStatus && ['lowStock', 'outOfStock', 'inStock'].includes(filters.stockStatus)) {
    queryParams.stockStatus = filters.stockStatus;
  }
  if (filters.lowStock === true || filters.lowStock === 'true') {
    queryParams.lowStock = true;
  }

  const { data, isLoading, error, refetch } = useQuery(
    ['products', queryParams],
    () => productsAPI.getProducts(queryParams),
    {
      keepPreviousData: true,
      retry: (failureCount, error) => {
        // Don't retry on validation errors (400) or client errors (4xx)
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          return false;
        }
        // Retry up to 2 times for network/server errors
        return failureCount < 2;
      },
      retryDelay: 1000,
      onError: (error) => {
        console.error('Products query error:', error);
        // Only show toast for search-related errors, not for initial load failures
        if (searchTerm && error?.response?.status === 400) {
          const errorMessage = error?.response?.data?.message || 'Invalid search parameters. Please try again.';
          showErrorToast(errorMessage);
        }
      }
    }
  );

  // Fetch categories for filter dropdown
  const { data: categoriesData } = useQuery(
    'categories',
    () => categoriesAPI.getCategories(),
    {
      select: (response) => response.data?.categories || [],
      onError: (error) => {
        console.error('Categories fetch error:', error);
        // Silently fail for categories - it's not critical
      },
      staleTime: 0, // Always fetch fresh data
      cacheTime: 0  // Don't cache to ensure fresh data
    }
  );

  const createMutation = useMutation(productsAPI.createProduct, {
    onSuccess: () => {
      // Invalidate all product queries to refresh the list
      queryClient.invalidateQueries(['products']);
      // Also invalidate categories to ensure fresh data
      queryClient.invalidateQueries(['categories']);
      // Also manually refetch as backup
      refetch();
      showSuccessToast('Product created successfully');
    },
    onError: (error) => {
      console.error('Product creation error:', error);
      console.error('Error response:', error.response?.data);
      
      // Handle specific error cases
      if (error.response?.data?.code === 'DUPLICATE_PRODUCT_NAME' || 
          error.response?.data?.message?.includes('already exists')) {
        showErrorToast('A product with this name already exists. Please choose a different name or edit the existing product.');
      } else {
        handleApiError(error, 'Product Creation');
      }
    },
  });

  const updateMutation = useMutation(
    ({ id, data }) => productsAPI.updateProduct(id, data),
    {
      onSuccess: () => {
        // Invalidate all product queries to refresh the list
        queryClient.invalidateQueries(['products']);
        // Also invalidate categories to ensure fresh data
        queryClient.invalidateQueries(['categories']);
        showSuccessToast('Product updated successfully');
      },
      onError: (error) => {
        console.error('Product update error:', error);
        console.error('Error response:', error.response?.data);
        
        // Handle specific error cases
        if (error.response?.data?.code === 'DUPLICATE_PRODUCT_NAME' || 
            error.response?.data?.message?.includes('already exists')) {
          showErrorToast('A product with this name already exists. Please choose a different name.');
        } else {
          handleApiError(error, 'Product Update');
        }
      },
    }
  );

  const deleteMutation = useMutation(productsAPI.deleteProduct, {
    onSuccess: () => {
      // Invalidate all product queries to refresh the list
      queryClient.invalidateQueries(['products']);
      showSuccessToast('Product deleted successfully');
    },
    onError: (error) => {
      handleApiError(error, 'Product Deletion');
    },
  });

  const handleEdit = (product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleEditExisting = (existingProduct) => {
    setSelectedProduct(existingProduct);
    setIsModalOpen(true);
  };

  const { confirmation, confirmDelete, handleConfirm, handleCancel } = useDeleteConfirmation();

  const handleDelete = (product) => {
    confirmDelete(product.name, 'Product', async () => {
      deleteMutation.mutate(product._id);
    });
  };

  const handleSave = (data) => {
    // Convert string values to numbers for pricing and inventory
    // Handle expiry date: convert to Date or null
    let expiryDate = null;
    if (data.expiryDate && data.expiryDate.trim() !== '') {
      const date = new Date(data.expiryDate);
      if (!isNaN(date.getTime())) {
        expiryDate = date.toISOString();
      }
    }
    
    const processedData = {
      ...data,
      status: data.status || 'active',
      expiryDate: expiryDate,
      pricing: {
        cost: parseFloat(data.pricing.cost) || 0,
        retail: parseFloat(data.pricing.retail) || 0,
        wholesale: parseFloat(data.pricing.wholesale) || 0
      },
      inventory: {
        currentStock: parseInt(data.inventory.currentStock) || 0,
        reorderPoint: parseInt(data.inventory.reorderPoint) || 10
      }
    };
    
    // Check if product name already exists (for new products only)
    if (!selectedProduct) {
      // Normalize the input name (trim whitespace and handle special characters)
      const normalizedInputName = data.name?.trim().toLowerCase().replace(/\s+/g, ' ');
      
      const existingProduct = products?.find(p => {
        // Normalize the existing product name the same way
        const normalizedExistingName = p.name?.trim().toLowerCase().replace(/\s+/g, ' ');
        return normalizedExistingName === normalizedInputName;
      });
      
      if (existingProduct) {
        showErrorToast(`A product named "${data.name}" already exists. Please choose a different name.`);
        return;
      }
    }
    
    if (selectedProduct) {
      updateMutation.mutate({ id: selectedProduct._id, data: processedData });
    } else {
      createMutation.mutate(processedData);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProduct(null);
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setFilters({});
  };

  // Get all products from API
  const allProducts = data?.data?.products || [];
  
  // Apply fuzzy search on client side for better UX
  // Hook must be called before any early returns
  const products = useFuzzySearch(
    allProducts,
    searchTerm,
    ['name', 'description', 'brand', 'category.name'],
    {
      threshold: 0.4,
      minScore: 0.3,
      limit: null // Show all matches
    }
  );

  // Bulk operations hook
  const bulkOps = useBulkOperations(products, {
    idField: '_id',
    enableUndo: true
  });

  // Bulk update handler
  const handleBulkUpdate = async (updates) => {
    const selectedItems = bulkOps.getSelectedItems();
    if (selectedItems.length === 0) return;

    const productIds = selectedItems.map(item => item._id);
    
    // Execute with progress tracking
    await bulkOps.executeBulkOperation('update', updates);
    
    try {
      // Call API for bulk update
      await productsAPI.bulkUpdateProducts(productIds, updates);
      queryClient.invalidateQueries(['products']);
      showSuccessToast(`Successfully updated ${selectedItems.length} products`);
      setShowBulkUpdateModal(false);
      setBulkUpdateType(null);
    } catch (error) {
      handleApiError(error, 'Bulk Update');
    }
  };

  // Bulk delete handler
  const handleBulkDelete = async () => {
    const selectedItems = bulkOps.getSelectedItems();
    if (selectedItems.length === 0) return;

    if (!window.confirm(`Are you sure you want to delete ${selectedItems.length} products? This action cannot be undone.`)) {
      return;
    }

    const productIds = selectedItems.map(item => item._id);
    try {
      await productsAPI.bulkDeleteProducts(productIds);
      queryClient.invalidateQueries(['products']);
      showSuccessToast(`Successfully deleted ${selectedItems.length} products`);
      bulkOps.deselectAll();
    } catch (error) {
      handleApiError(error, 'Bulk Delete');
    }
  };

  // Bulk export handler
  const handleBulkExport = () => {
    const selectedItems = bulkOps.getSelectedItems();
    if (selectedItems.length === 0) return;

    // Convert to CSV
    const headers = ['Name', 'Description', 'SKU', 'Stock', 'Cost', 'Retail', 'Wholesale', 'Category', 'Status'];
    const rows = selectedItems.map(item => [
      item.name || '',
      item.description || '',
      item.sku || '',
      item.inventory?.currentStock || 0,
      item.pricing?.cost || 0,
      item.pricing?.retail || 0,
      item.pricing?.wholesale || 0,
      item.category?.name || '',
      item.status || ''
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showSuccessToast(`Exported ${selectedItems.length} products`);
  };

  // Show loading only on initial load (when there's no previous data)
  if (isLoading && !data) {
    return <LoadingPage message="Loading products..." />;
  }

  // Only show full error page if it's not a search-related error and we have no data
  // For search errors, we'll show the previous data and display a toast instead
  if (error && !data) {
    // Extract error message from response
    let errorMessage = 'Unable to load products. Please try again.';
    if (error?.response?.data?.errors) {
      // Validation errors from backend
      const validationErrors = error.response.data.errors;
      errorMessage = validationErrors.map(err => err.msg || err.message).join(', ');
    } else if (error?.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error?.message) {
      errorMessage = error.message;
    }

    return (
      <div className="text-center py-12">
        <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Failed to Load Products
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {errorMessage}
        </p>
        <button
          onClick={() => refetch()}
          className="btn btn-primary btn-md"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </button>
      </div>
    );
  }

  // If there's an error but we have previous data, show a warning but keep displaying products
  if (error && data) {
    // Error toast is already shown in onError handler
    // Continue to show previous data
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-600">Manage your product catalog</p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-3">
          <button
            onClick={() => {
              const componentInfo = getComponentInfo('/categories');
              if (componentInfo) {
                openTab({
                  title: 'Add Product Category',
                  path: '/categories?action=add',
                  component: componentInfo.component,
                  icon: componentInfo.icon,
                  allowMultiple: true,
                  props: { action: 'add' }
                });
              }
            }}
            className="btn btn-outline btn-md w-full sm:w-auto"
          >
            <Tag className="h-4 w-4 mr-2" />
            Add Product Category
          </button>
          <button
            onClick={refreshCategories}
            className="btn btn-outline btn-md w-full sm:w-auto"
            title="Refresh categories list"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Categories
          </button>
          <button
            onClick={() => setShowBarcodeScanner(true)}
            className="btn btn-outline btn-md w-full sm:w-auto"
            title="Scan barcode to search product"
          >
            <Camera className="h-4 w-4 mr-2" />
            Scan Barcode
          </button>
          <button
            onClick={() => setShowLabelPrinter(true)}
            className="btn btn-outline btn-md w-full sm:w-auto"
            title="Print barcode labels"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print Labels
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn btn-primary btn-md w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </button>
        </div>
      </div>

      {/* Show error banner if search failed but we have previous data */}
      {error && data && searchTerm && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
            <div className="flex-1">
              <p className="text-sm text-yellow-800">
                Search failed. Showing previous results. Please try adjusting your search terms.
              </p>
            </div>
            <button
              onClick={() => {
                setSearchTerm('');
                setFilters({});
              }}
              className="text-sm text-yellow-600 hover:text-yellow-800 underline"
            >
              Clear Search
            </button>
          </div>
        </div>
      )}

      {/* Advanced Search and Filters */}
      <IntegratedSearchFilters
        onSearch={(term, activeFilters) => {
          setSearchTerm(term);
          setFilters(activeFilters);
        }}
        onFiltersChange={(newFilters) => {
          setFilters(prev => ({ ...prev, ...newFilters }));
        }}
        searchFields={['name', 'description', 'sku', 'barcode', 'brand']}
        availableFields={[
          { value: 'name', label: 'Product Name' },
          { value: 'description', label: 'Description' },
          { value: 'sku', label: 'SKU' },
          { value: 'barcode', label: 'Barcode' },
          { value: 'brand', label: 'Brand' },
          { value: 'category', label: 'Category' },
          { value: 'status', label: 'Status' },
          { value: 'pricing.retail', label: 'Retail Price' },
          { value: 'pricing.wholesale', label: 'Wholesale Price' },
          { value: 'pricing.cost', label: 'Cost Price' },
          { value: 'inventory.currentStock', label: 'Current Stock' },
          { value: 'inventory.reorderPoint', label: 'Reorder Point' },
          { value: 'createdAt', label: 'Created Date' },
          { value: 'updatedAt', label: 'Updated Date' }
        ]}
        categories={categoriesData || []}
        statusOptions={[
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
          { value: 'discontinued', label: 'Discontinued' }
        ]}
        quickFilters={[
          { key: 'stockStatus', value: 'lowStock', label: 'Low Stock' },
          { key: 'stockStatus', value: 'outOfStock', label: 'Out of Stock' },
          { key: 'status', value: 'active', label: 'Active Only' }
        ]}
      />

      {/* Import/Export Section */}
      <ProductImportExport 
        onImportComplete={() => queryClient.invalidateQueries('products')}
        filters={queryParams}
      />


      {/* Bulk Operations Bar */}
      <BulkOperationsBar
        selectedCount={bulkOps.selectedCount}
        isOperationInProgress={bulkOps.isOperationInProgress}
        operationProgress={bulkOps.operationProgress}
        canUndo={bulkOps.canUndo}
        onBulkUpdate={() => {
          setBulkUpdateType('update');
          setShowBulkUpdateModal(true);
        }}
        onBulkDelete={handleBulkDelete}
        onBulkExport={handleBulkExport}
        onBulkStatusChange={() => {
          setBulkUpdateType('status');
          setShowBulkUpdateModal(true);
        }}
        onBulkCategoryChange={() => {
          setBulkUpdateType('category');
          setShowBulkUpdateModal(true);
        }}
        onBulkPriceUpdate={() => {
          setBulkUpdateType('price');
          setShowBulkUpdateModal(true);
        }}
        onBulkStockAdjust={() => {
          setBulkUpdateType('stock');
          setShowBulkUpdateModal(true);
        }}
        onUndo={bulkOps.undoLastOperation}
        onClearSelection={bulkOps.deselectAll}
        availableActions={['update', 'delete', 'export', 'status', 'category', 'price', 'stock']}
      />

      {/* Bulk Update Modal */}
      <BulkUpdateModal
        isOpen={showBulkUpdateModal}
        onClose={() => {
          setShowBulkUpdateModal(false);
          setBulkUpdateType(null);
        }}
        selectedCount={bulkOps.selectedCount}
        updateType={bulkUpdateType}
        onConfirm={handleBulkUpdate}
        categories={categoriesData || []}
        statusOptions={[
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
          { value: 'discontinued', label: 'Discontinued' }
        ]}
        isLoading={bulkOps.isOperationInProgress}
      />

      {/* Products Grid */}
      {products.length === 0 ? (
        <div className="text-center py-12">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No products found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm ? 'Try adjusting your search terms.' : 'Get started by adding a new product.'}
          </p>
        </div>
      ) : (
        <div className="card w-full">
          <div className="card-content p-0 w-full">
            {/* Table Header */}
            <div className="bg-gray-50 px-8 py-6 border-b border-gray-200">
              <div className="grid grid-cols-12 gap-6 items-center">
                <div className="col-span-1">
                  <Checkbox
                    checked={bulkOps.isSelectAll}
                    onChange={() => bulkOps.toggleSelectAll(products)}
                  />
                </div>
                <div className="col-span-4">
                  <h3 className="text-base font-medium text-gray-700">Product Name</h3>
                  <p className="text-sm text-gray-500">Description</p>
                </div>
                <div className="col-span-1">
                  <h3 className="text-base font-medium text-gray-700">Stock</h3>
                </div>
                <div className="col-span-1">
                  <h3 className="text-base font-medium text-gray-700">Cost</h3>
                </div>
                <div className="col-span-1">
                  <h3 className="text-base font-medium text-gray-700">Retail</h3>
                </div>
                <div className="col-span-1">
                  <h3 className="text-base font-medium text-gray-700">Wholesale</h3>
                </div>
                <div className="col-span-1">
                  <h3 className="text-base font-medium text-gray-700">Category</h3>
                </div>
                <div className="col-span-1">
                  <h3 className="text-base font-medium text-gray-700">Status</h3>
                </div>
                <div className="col-span-1">
                  <h3 className="text-base font-medium text-gray-700">Actions</h3>
                </div>
              </div>
            </div>

            {/* Product Rows */}
            <div className="divide-y divide-gray-200">
              {products.map((product) => (
                <div key={product._id} className="px-8 py-6 hover:bg-gray-50">
                  <div className="grid grid-cols-12 gap-6 items-center">
                    {/* Checkbox */}
                    <div className="col-span-1">
                      <Checkbox
                        checked={bulkOps.isSelected(product._id)}
                        onChange={() => bulkOps.toggleSelection(product._id)}
                      />
                    </div>
                    {/* Product Name & Description */}
                    <div className="col-span-4">
                      <div className="flex items-center space-x-4">
                        <Package className="h-6 w-6 text-gray-400" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-medium text-gray-900">
                              {product.name}
                            </h3>
                            {product.expiryDate && (() => {
                              const expiryStatus = getExpiryStatus(product);
                              if (expiryStatus?.status === 'expired') {
                                return (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800" title={`Expired ${expiryStatus.days} day${expiryStatus.days > 1 ? 's' : ''} ago`}>
                                    Expired
                                  </span>
                                );
                              } else if (expiryStatus?.status === 'expiring_soon') {
                                return (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800" title={`Expires in ${expiryStatus.days} day${expiryStatus.days > 1 ? 's' : ''}`}>
                                    Expires Soon
                                  </span>
                                );
                              } else if (expiryStatus) {
                                return (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800" title={`Expires in ${expiryStatus.days} day${expiryStatus.days > 1 ? 's' : ''}`}>
                                    {new Date(product.expiryDate).toLocaleDateString()}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          <p className="text-xs text-gray-400 font-mono">
                            ID: {product._id}
                          </p>
                          <p className="text-sm text-gray-500">
                            {product.description || 'No description'}
                          </p>
                          {product.expiryDate && (
                            <p className="text-xs text-gray-400 mt-1">
                              Expiry: {new Date(product.expiryDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stock */}
                    <div className="col-span-1">
                      <p className={`text-sm font-medium ${
                        isLowStock(product) ? 'text-danger-600' : 'text-gray-600'
                      }`}>
                        {product.inventory?.currentStock || 0}
                      </p>
                      {isLowStock(product) && (
                        <p className="text-xs text-danger-600">Low Stock</p>
                      )}
                    </div>

                    {/* Cost */}
                    <div className="col-span-1">
                      <p className="text-sm text-gray-600">{Math.round(product.pricing?.cost || 0)}</p>
                    </div>

                    {/* Retail Price */}
                    <div className="col-span-1">
                      <p className="text-sm text-gray-600">{Math.round(product.pricing?.retail || 0)}</p>
                    </div>

                    {/* Wholesale Price */}
                    <div className="col-span-1">
                      <p className="text-sm text-gray-600">{Math.round(product.pricing?.wholesale || 0)}</p>
                    </div>

                    {/* Category */}
                    <div className="col-span-1">
                      <p className="text-sm text-gray-600">{product.category?.name || '-'}</p>
                    </div>

                    {/* Status */}
                    <div className="col-span-1">
                      <span className={`badge ${
                        product.status === 'active' ? 'badge-success' : 'badge-gray'
                      }`}>
                        {product.status}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="col-span-1">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => {
                            setSelectedProduct(product);
                            setShowBarcodeGenerator(true);
                          }}
                          className="text-green-600 hover:text-green-800"
                          title="Generate Barcode"
                        >
                          <Barcode className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedProductForInvestors(product);
                            setIsInvestorsModalOpen(true);
                          }}
                          className="text-blue-600 hover:text-blue-800"
                          title="Manage Investors"
                        >
                          <TrendingUp className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleEdit(product)}
                          className="text-primary-600 hover:text-primary-800"
                          title="Edit Product"
                        >
                          <Edit className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(product)}
                          className="text-danger-600 hover:text-danger-800"
                          title="Delete Product"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                      {product.hasInvestors && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-2">
                          Has Investors
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Product Modal */}
      <ProductModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        isSubmitting={createMutation.isLoading || updateMutation.isLoading}
        allProducts={products || []}
        onEditExisting={handleEditExisting}
        categories={categoriesData || []}
      />
      
      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={confirmation.isOpen}
        onClose={handleCancel}
        onConfirm={handleConfirm}
        itemName={confirmation.message?.match(/"([^"]*)"/)?.[1] || ''}
        itemType="Product"
        isLoading={deleteMutation.isLoading}
      />

      {/* Product Investors Modal */}
      {selectedProductForInvestors && (
        <ProductInvestorsModal
          product={selectedProductForInvestors}
          isOpen={isInvestorsModalOpen}
          onClose={() => {
            setIsInvestorsModalOpen(false);
            setSelectedProductForInvestors(null);
          }}
          onSave={async (productId, investors) => {
            try {
              await productsAPI.linkInvestors(productId, investors);
              toast.success('Investors linked successfully!');
              queryClient.invalidateQueries(['products']);
              setIsInvestorsModalOpen(false);
              setSelectedProductForInvestors(null);
            } catch (error) {
              handleApiError(error, 'Link Investors');
            }
          }}
        />
      )}

      {/* Barcode Scanner Modal */}
      <BarcodeScanner
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={(barcodeValue) => {
          // Search for product by barcode
          setSearchTerm(barcodeValue);
          setFilters({ barcode: barcodeValue });
          setShowBarcodeScanner(false);
          toast.success(`Searching for barcode: ${barcodeValue}`);
        }}
        scanMode="both"
      />

      {/* Barcode Generator Modal */}
      {showBarcodeGenerator && selectedProduct && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-75 flex items-center justify-center p-4">
          <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full">
            <BarcodeGenerator
              product={selectedProduct}
              barcodeValue={selectedProduct.barcode}
              onClose={() => {
                setShowBarcodeGenerator(false);
                setSelectedProduct(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Barcode Label Printer Modal */}
      {showLabelPrinter && (
        <BarcodeLabelPrinter
          products={products || []}
          onClose={() => setShowLabelPrinter(false)}
        />
      )}

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
