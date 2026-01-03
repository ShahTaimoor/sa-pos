import React from 'react';
import { Users, Building, User, Edit, Trash2, MessageSquare } from 'lucide-react';

export const CustomerList = ({ 
  customers, 
  searchTerm,
  onEdit,
  onDelete,
  onShowNotes
}) => {
  if (customers.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No customers found</h3>
        <p className="mt-1 text-sm text-gray-500">
          {searchTerm ? 'Try adjusting your search terms.' : 'Get started by adding a new customer.'}
        </p>
      </div>
    );
  }

  return (
    <div className="card w-full">
      <div className="card-content p-0 w-full">
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

        <div className="divide-y divide-gray-200">
          {customers.map((customer) => (
            <div key={customer._id} className="px-8 py-6 hover:bg-gray-50">
              <div className="grid grid-cols-12 gap-4 items-center">
                <div className="col-span-1">
                  <p 
                    className="text-xs text-gray-500 font-mono cursor-help" 
                    title={customer._id}
                  >
                    {customer._id.slice(-6)}
                  </p>
                </div>

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

                <div className="col-span-2">
                  <p className="text-sm text-gray-600">{customer.email}</p>
                </div>

                <div className="col-span-1">
                  <p className="text-sm text-gray-600">{customer.phone || '-'}</p>
                </div>

                <div className="col-span-1">
                  <span className={`badge ${
                    customer.status === 'active' ? 'badge-success' : 'badge-gray'
                  }`}>
                    {customer.status}
                  </span>
                </div>

                <div className="col-span-1">
                  <span className={`badge ${
                    customer.businessType === 'wholesale' ? 'badge-info' : 'badge-gray'
                  }`}>
                    {customer.businessType}
                  </span>
                </div>

                <div className="col-span-1">
                  <span className={`badge ${
                    customer.customerTier === 'gold' ? 'badge-warning' :
                    customer.customerTier === 'platinum' ? 'badge-info' : 'badge-gray'
                  }`}>
                    {customer.customerTier}
                  </span>
                </div>

                <div className="col-span-1">
                  <p className="text-sm text-gray-600">{Math.round(customer.creditLimit)}</p>
                </div>

                <div className="col-span-1">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => onShowNotes(customer)}
                      className="text-green-600 hover:text-green-800"
                      title="Notes"
                    >
                      <MessageSquare className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => onEdit(customer)}
                      className="text-primary-600 hover:text-primary-800"
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => onDelete(customer)}
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
  );
};

