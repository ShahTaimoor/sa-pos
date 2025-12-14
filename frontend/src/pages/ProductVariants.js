import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Package,
  Tag,
  X,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { productVariantsAPI, productsAPI } from '../services/api';
import { handleApiError, showSuccessToast, showErrorToast } from '../utils/errorHandler';
import { LoadingSpinner, LoadingButton } from '../components/LoadingSpinner';
import { DeleteConfirmationDialog } from '../components/ConfirmationDialog';
import { useDeleteConfirmation } from '../hooks/useConfirmation';
import ValidatedInput, { ValidatedSelect } from '../components/ValidatedInput';
import { useFormValidation } from '../hooks/useFormValidation';

const ProductVariants = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBaseProduct, setSelectedBaseProduct] = useState('');
  const [variantTypeFilter, setVariantTypeFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState(null);

  // Fetch variants
  const { data: variantsData, isLoading: variantsLoading, refetch } = useQuery(
    ['productVariants', selectedBaseProduct, variantTypeFilter, searchTerm],
    () => productVariantsAPI.getVariants({
      baseProduct: selectedBaseProduct || undefined,
      variantType: variantTypeFilter || undefined,
      search: searchTerm || undefined
    }),
    {
      select: (data) => ({
        variants: data?.variants || []
      })
    }
  );

  // Fetch products for base product selector
  const { data: productsData } = useQuery(
    ['products', 'all'],
    () => productsAPI.getProducts({}),
    {
      select: (data) => ({
        products: data?.data?.products || []
      })
    }
  );

  const variants = variantsData?.variants || [];
  const products = productsData?.products || [];

  // Delete mutation
  const deleteMutation = useMutation(
    (id) => productVariantsAPI.deleteVariant(id),
    {
      onSuccess: () => {
        showSuccessToast('Variant deleted successfully');
        queryClient.invalidateQueries('productVariants');
        refetch();
      },
      onError: (error) => {
        handleApiError(error, 'ProductVariants');
      }
    }
  );

  const { isDeleteDialogOpen, itemToDelete, openDeleteDialog, closeDeleteDialog, confirmDelete } = useDeleteConfirmation(
    deleteMutation.mutate
  );

  const handleEdit = (variant) => {
    setEditingVariant(variant);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingVariant(null);
  };

  const variantTypes = [
    { value: '', label: 'All Types' },
    { value: 'color', label: 'Color' },
    { value: 'warranty', label: 'Warranty' },
    { value: 'size', label: 'Size' },
    { value: 'finish', label: 'Finish' },
    { value: 'custom', label: 'Custom' }
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Product Variants</h1>
            <p className="mt-1 text-sm text-gray-500">Manage product variants and transformations</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Add Variant
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search variants..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
          <ValidatedSelect
            value={selectedBaseProduct}
            onChange={(e) => setSelectedBaseProduct(e.target.value)}
            options={[
              { value: '', label: 'All Products' },
              ...products.map(p => ({ value: p._id, label: p.name }))
            ]}
            className="w-full"
          />
          <ValidatedSelect
            value={variantTypeFilter}
            onChange={(e) => setVariantTypeFilter(e.target.value)}
            options={variantTypes}
            className="w-full"
          />
          <button
            onClick={() => refetch()}
            className="btn btn-secondary flex items-center justify-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Variants Table */}
      {variantsLoading ? (
        <LoadingSpinner />
      ) : variants.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No variants found</h3>
          <p className="text-gray-500 mb-4">Get started by creating a new product variant.</p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn btn-primary"
          >
            Add Variant
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Variant Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Retail Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transformation Cost</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {variants.map((variant) => (
                  <tr key={variant._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {variant.baseProduct?.name || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{variant.displayName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {variant.variantType}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {variant.variantValue}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {variant.inventory?.currentStock || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${variant.pricing?.retail?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${variant.transformationCost?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        variant.status === 'active' ? 'bg-green-100 text-green-800' :
                        variant.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {variant.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(variant)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openDeleteDialog(variant._id, variant.displayName)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Variant Modal */}
      {isModalOpen && (
        <VariantModal
          variant={editingVariant}
          products={products}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onSuccess={() => {
            queryClient.invalidateQueries('productVariants');
            refetch();
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={closeDeleteDialog}
        onConfirm={confirmDelete}
        itemName={itemToDelete?.name || ''}
        itemType="variant"
      />
    </div>
  );
};

// Variant Modal Component
const VariantModal = ({ variant, products, isOpen, onClose, onSuccess }) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    baseProduct: '',
    variantName: '',
    variantType: 'color',
    variantValue: '',
    displayName: '',
    description: '',
    pricing: {
      cost: 0,
      retail: 0,
      wholesale: 0,
      distributor: 0
    },
    transformationCost: 0,
    sku: '',
    status: 'active'
  });

  React.useEffect(() => {
    if (variant) {
      setFormData({
        baseProduct: variant.baseProduct?._id || variant.baseProduct || '',
        variantName: variant.variantName || '',
        variantType: variant.variantType || 'color',
        variantValue: variant.variantValue || '',
        displayName: variant.displayName || '',
        description: variant.description || '',
        pricing: variant.pricing || { cost: 0, retail: 0, wholesale: 0, distributor: 0 },
        transformationCost: variant.transformationCost || 0,
        sku: variant.sku || '',
        status: variant.status || 'active'
      });
    } else {
      setFormData({
        baseProduct: '',
        variantName: '',
        variantType: 'color',
        variantValue: '',
        displayName: '',
        description: '',
        pricing: { cost: 0, retail: 0, wholesale: 0, distributor: 0 },
        transformationCost: 0,
        sku: '',
        status: 'active'
      });
    }
  }, [variant, isOpen]);

  // Auto-generate display name
  React.useEffect(() => {
    if (formData.baseProduct && formData.variantValue) {
      const baseProduct = products.find(p => p._id === formData.baseProduct);
      if (baseProduct && !variant) {
        setFormData(prev => ({
          ...prev,
          displayName: `${baseProduct.name} - ${formData.variantValue}`
        }));
      }
    }
  }, [formData.baseProduct, formData.variantValue, products, variant]);

  // Auto-calculate pricing based on base product
  React.useEffect(() => {
    if (formData.baseProduct && !variant) {
      const baseProduct = products.find(p => p._id === formData.baseProduct);
      if (baseProduct) {
        setFormData(prev => ({
          ...prev,
          pricing: {
            cost: baseProduct.pricing.cost + prev.transformationCost,
            retail: baseProduct.pricing.retail + prev.transformationCost,
            wholesale: baseProduct.pricing.wholesale + prev.transformationCost,
            distributor: baseProduct.pricing.distributor ? baseProduct.pricing.distributor + prev.transformationCost : 0
          }
        }));
      }
    }
  }, [formData.baseProduct, formData.transformationCost, products, variant]);

  const createMutation = useMutation(
    (data) => productVariantsAPI.createVariant(data),
    {
      onSuccess: () => {
        showSuccessToast('Variant created successfully');
        onClose();
        onSuccess();
      },
      onError: (error) => {
        handleApiError(error, 'ProductVariants');
      }
    }
  );

  const updateMutation = useMutation(
    ({ id, data }) => productVariantsAPI.updateVariant(id, data),
    {
      onSuccess: () => {
        showSuccessToast('Variant updated successfully');
        onClose();
        onSuccess();
      },
      onError: (error) => {
        handleApiError(error, 'ProductVariants');
      }
    }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (variant) {
      updateMutation.mutate({ id: variant._id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isSubmitting = createMutation.isLoading || updateMutation.isLoading;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {variant ? 'Edit Variant' : 'Create Variant'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <ValidatedSelect
            label="Base Product"
            value={formData.baseProduct}
            onChange={(e) => setFormData({ ...formData, baseProduct: e.target.value })}
            options={[
              { value: '', label: 'Select Base Product' },
              ...products.map(p => ({ value: p._id, label: p.name }))
            ]}
            required
            disabled={!!variant}
          />

          <ValidatedSelect
            label="Variant Type"
            value={formData.variantType}
            onChange={(e) => setFormData({ ...formData, variantType: e.target.value })}
            options={[
              { value: 'color', label: 'Color' },
              { value: 'warranty', label: 'Warranty' },
              { value: 'size', label: 'Size' },
              { value: 'finish', label: 'Finish' },
              { value: 'custom', label: 'Custom' }
            ]}
            required
            disabled={!!variant}
          />

          <ValidatedInput
            label="Variant Value"
            type="text"
            value={formData.variantValue}
            onChange={(e) => setFormData({ ...formData, variantValue: e.target.value })}
            placeholder="e.g., Red, With Warranty, Large"
            required
            disabled={!!variant}
          />

          <ValidatedInput
            label="Display Name"
            type="text"
            value={formData.displayName}
            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
            placeholder="e.g., Spoiler - Red"
            required
          />

          <ValidatedInput
            label="Transformation Cost (per unit)"
            type="number"
            value={formData.transformationCost}
            onChange={(e) => setFormData({ ...formData, transformationCost: parseFloat(e.target.value) || 0 })}
            min="0"
            step="0.01"
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <ValidatedInput
              label="Retail Price"
              type="number"
              value={formData.pricing.retail}
              onChange={(e) => setFormData({
                ...formData,
                pricing: { ...formData.pricing, retail: parseFloat(e.target.value) || 0 }
              })}
              min="0"
              step="0.01"
              required
            />
            <ValidatedInput
              label="Wholesale Price"
              type="number"
              value={formData.pricing.wholesale}
              onChange={(e) => setFormData({
                ...formData,
                pricing: { ...formData.pricing, wholesale: parseFloat(e.target.value) || 0 }
              })}
              min="0"
              step="0.01"
              required
            />
          </div>

          <ValidatedInput
            label="SKU (optional)"
            type="text"
            value={formData.sku}
            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
            placeholder="Auto-generated if left empty"
          />

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <LoadingButton
              type="submit"
              isLoading={isSubmitting}
              className="btn btn-primary"
            >
              {variant ? 'Update' : 'Create'}
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductVariants;

