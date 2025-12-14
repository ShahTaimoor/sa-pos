import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useForm } from 'react-hook-form';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Building2,
  CreditCard,
  X,
  Phone,
  MapPin,
  DollarSign,
  CheckCircle
} from 'lucide-react';
import { banksAPI } from '../services/api';
import toast from 'react-hot-toast';
import { LoadingSpinner, LoadingButton, LoadingCard, LoadingGrid, LoadingPage, LoadingInline } from '../components/LoadingSpinner';
import { DeleteConfirmationDialog } from '../components/ConfirmationDialog';
import { useDeleteConfirmation } from '../hooks/useConfirmation';

const BankFormModal = ({ bank, onSave, onCancel, isSubmitting }) => {
  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    defaultValues: bank || {
      accountName: '',
      accountNumber: '',
      bankName: '',
      branchName: '',
      branchAddress: {
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'US'
      },
      accountType: 'checking',
      routingNumber: '',
      swiftCode: '',
      iban: '',
      openingBalance: 0,
      isActive: true,
      notes: ''
    }
  });

  const onSubmit = (data) => {
    onSave(data);
    reset();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              {bank ? 'Edit Bank Account' : 'Add New Bank Account'}
            </h2>
            <button
              onClick={onCancel}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Bank Information */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bank Name *
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  {...register('bankName', { required: 'Bank name is required' })}
                  className="input pl-10"
                  placeholder="Enter bank name"
                />
              </div>
              {errors.bankName && (
                <p className="text-red-500 text-sm mt-1">{errors.bankName.message}</p>
              )}
            </div>

            {/* Account Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account Name *
                </label>
                <input
                  {...register('accountName', { required: 'Account name is required' })}
                  className="input"
                  placeholder="e.g., Main Operating Account"
                />
                {errors.accountName && (
                  <p className="text-red-500 text-sm mt-1">{errors.accountName.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account Number *
                </label>
                <input
                  {...register('accountNumber', { required: 'Account number is required' })}
                  className="input"
                  placeholder="Enter account number"
                />
                {errors.accountNumber && (
                  <p className="text-red-500 text-sm mt-1">{errors.accountNumber.message}</p>
                )}
              </div>
            </div>

            {/* Branch Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Branch Name
                </label>
                <input
                  {...register('branchName')}
                  className="input"
                  placeholder="Enter branch name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account Type *
                </label>
                <select
                  {...register('accountType', { required: 'Account type is required' })}
                  className="input"
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="current">Current</option>
                  <option value="other">Other</option>
                </select>
                {errors.accountType && (
                  <p className="text-red-500 text-sm mt-1">{errors.accountType.message}</p>
                )}
              </div>
            </div>

            {/* Financial Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Opening Balance
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="number"
                    step="0.01"
                    {...register('openingBalance', { 
                      valueAsNumber: true,
                      min: { value: 0, message: 'Balance must be positive' }
                    })}
                    className="input pl-10"
                    placeholder="0.00"
                  />
                </div>
                {errors.openingBalance && (
                  <p className="text-red-500 text-sm mt-1">{errors.openingBalance.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Routing Number
                </label>
                <input
                  {...register('routingNumber')}
                  className="input"
                  placeholder="Enter routing number"
                />
              </div>
            </div>

            {/* International Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SWIFT Code
                </label>
                <input
                  {...register('swiftCode')}
                  className="input"
                  placeholder="Enter SWIFT code"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  IBAN
                </label>
                <input
                  {...register('iban')}
                  className="input"
                  placeholder="Enter IBAN"
                />
              </div>
            </div>

            {/* Branch Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Branch Address
              </label>
              <div className="space-y-3">
                <input
                  {...register('branchAddress.street')}
                  className="input"
                  placeholder="Street Address"
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    {...register('branchAddress.city')}
                    className="input"
                    placeholder="City"
                  />
                  <input
                    {...register('branchAddress.state')}
                    className="input"
                    placeholder="State"
                  />
                  <input
                    {...register('branchAddress.zipCode')}
                    className="input"
                    placeholder="Zip Code"
                  />
                </div>
                <input
                  {...register('branchAddress.country')}
                  className="input"
                  placeholder="Country"
                />
              </div>
            </div>

            {/* Additional Information */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                {...register('notes')}
                className="input"
                rows={3}
                placeholder="Additional notes about this bank account..."
              />
            </div>

            {/* Status */}
            {bank && (
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register('isActive')}
                    className="checkbox"
                  />
                  <span className="text-sm font-medium text-gray-700">Active</span>
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Inactive bank accounts won't appear in dropdown menus for new transactions
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={onCancel}
                className="btn btn-secondary"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <LoadingButton
                type="submit"
                isLoading={isSubmitting}
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                <Plus className="h-4 w-4 mr-2" />
                {bank ? 'Update Bank' : 'Add Bank'}
              </LoadingButton>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

const Banks = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const { confirmDelete, deleteDialog } = useDeleteConfirmation();

  // Fetch banks - fetch all banks
  const { data, isLoading, error, refetch } = useQuery(
    ['banks'],
    () => banksAPI.getBanks().then((res) => {
      // Axios response structure: res.data = { success: true, data: { banks: [...] } }
      // Extract banks array from response
      const banks = res?.data?.data?.banks || res?.data?.banks || res?.banks || [];
      if (!Array.isArray(banks)) {
        console.warn('Banks API returned unexpected payload:', res);
        return [];
      }
      return banks;
    }),
    {
      // No select needed - data is already transformed in the query function
    }
  );

  // Create mutation
  const createMutation = useMutation(banksAPI.createBank, {
    onSuccess: async () => {
      // Invalidate and refetch to ensure fresh data
      await queryClient.invalidateQueries('banks');
      await refetch();
      setShowModal(false);
      setEditingBank(null);
      toast.success('Bank account added successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to add bank account');
    }
  });

  // Update mutation
  const updateMutation = useMutation(
    ({ id, data }) => banksAPI.updateBank(id, data),
    {
      onSuccess: async () => {
        // Invalidate and refetch to ensure fresh data
        await queryClient.invalidateQueries('banks');
        await refetch();
        setShowModal(false);
        setEditingBank(null);
        toast.success('Bank account updated successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || 'Failed to update bank account');
      }
    }
  );

  // Delete mutation
  const deleteMutation = useMutation(banksAPI.deleteBank, {
    onSuccess: async () => {
      // Invalidate and refetch to ensure fresh data
      await queryClient.invalidateQueries('banks');
      await refetch();
      toast.success('Bank account deleted successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to delete bank account');
    }
  });

  const handleAddNew = () => {
    setEditingBank(null);
    setShowModal(true);
  };

  const handleEdit = (bank) => {
    setEditingBank(bank);
    setShowModal(true);
  };

  const handleSave = (formData) => {
    const payload = editingBank
      ? formData
      : { ...formData, isActive: true };

    if (editingBank) {
      updateMutation.mutate({ id: editingBank._id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = async (bank) => {
    const confirmed = await confirmDelete(`Are you sure you want to delete "${bank.bankName} - ${bank.accountNumber}"?`);
    if (confirmed) {
      deleteMutation.mutate(bank._id);
    }
  };

  // Get banks from query data - data is already an array from the query
  const banksList = Array.isArray(data) ? data : [];

  // Filter banks by search term and show active banks by default
  const filteredBanks = banksList.filter(bank => {
    if (!bank) return false;
    
    const matchesSearch = 
      bank.bankName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bank.accountName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bank.accountNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Show active banks by default (isActive defaults to true if not specified)
    const isActive = bank.isActive !== false;
    
    return matchesSearch && isActive;
  });

  const isSubmitting = createMutation.isLoading || updateMutation.isLoading;

  if (isLoading) {
    return <LoadingPage message="Loading banks..." />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error loading banks</p>
          <button onClick={() => queryClient.invalidateQueries('banks')} className="btn btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bank Accounts</h1>
          <p className="text-gray-600">Manage your bank accounts</p>
        </div>
        <button
          onClick={handleAddNew}
          className="btn btn-primary"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Bank Account
        </button>
      </div>

      {/* Search */}
      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
            placeholder="Search by bank name, account name, or account number..."
          />
        </div>
      </div>

      {/* Banks List */}
      {filteredBanks.length === 0 ? (
        <div className="card text-center py-12">
          <Building2 className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No banks found</h3>
          <p className="mt-2 text-gray-500">
            {searchTerm ? 'Try adjusting your search terms' : 'Get started by adding your first bank account'}
          </p>
          {!searchTerm && (
            <button onClick={handleAddNew} className="btn btn-primary mt-4">
              <Plus className="h-4 w-4 mr-2" />
              Add Bank Account
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bank Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Branch
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Opening Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Routing Number
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredBanks.map((bank) => (
                  <tr key={bank._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {bank.isActive !== false ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Building2 className="h-4 w-4 text-blue-600 mr-2" />
                        <span className="text-sm font-medium text-gray-900">{bank.bankName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{bank.accountName}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{bank.accountNumber}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900 capitalize">{bank.accountType || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{bank.branchName || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-green-600">
                        ${(bank.openingBalance || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{bank.routingNumber || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleEdit(bank)}
                          className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(bank)}
                          className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition-colors"
                          disabled={deleteMutation.isLoading}
                          title="Delete"
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

      {/* Form Modal */}
      {showModal && (
        <BankFormModal
          bank={editingBank}
          onSave={handleSave}
          onCancel={() => {
            setShowModal(false);
            setEditingBank(null);
          }}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteDialog}
    </div>
  );
};

export default Banks;

