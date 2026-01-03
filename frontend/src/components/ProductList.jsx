import React from 'react';
import { Package, Edit, Trash2, Barcode, TrendingUp } from 'lucide-react';
import { Checkbox } from './Checkbox';
import { isLowStock, getExpiryStatus } from '../utils/productHelpers';

export const ProductList = ({ 
  products, 
  searchTerm,
  bulkOps,
  onEdit,
  onDelete,
  onManageInvestors,
  onGenerateBarcode
}) => {
  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No products found</h3>
        <p className="mt-1 text-sm text-gray-500">
          {searchTerm ? 'Try adjusting your search terms.' : 'Get started by adding a new product.'}
        </p>
      </div>
    );
  }

  return (
    <div className="card w-full">
      <div className="card-content p-0 w-full">
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

        <div className="divide-y divide-gray-200">
          {products.map((product) => (
            <div key={product._id} className="px-8 py-6 hover:bg-gray-50">
              <div className="grid grid-cols-12 gap-6 items-center">
                <div className="col-span-1">
                  <Checkbox
                    checked={bulkOps.isSelected(product._id)}
                    onChange={() => bulkOps.toggleSelection(product._id)}
                  />
                </div>
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

                <div className="col-span-1">
                  <p className="text-sm text-gray-600">{Math.round(product.pricing?.cost || 0)}</p>
                </div>

                <div className="col-span-1">
                  <p className="text-sm text-gray-600">{Math.round(product.pricing?.retail || 0)}</p>
                </div>

                <div className="col-span-1">
                  <p className="text-sm text-gray-600">{Math.round(product.pricing?.wholesale || 0)}</p>
                </div>

                <div className="col-span-1">
                  <p className="text-sm text-gray-600">{product.category?.name || '-'}</p>
                </div>

                <div className="col-span-1">
                  <span className={`badge ${
                    product.status === 'active' ? 'badge-success' : 'badge-gray'
                  }`}>
                    {product.status}
                  </span>
                </div>

                <div className="col-span-1">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => onGenerateBarcode(product)}
                      className="text-green-600 hover:text-green-800"
                      title="Generate Barcode"
                    >
                      <Barcode className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => onManageInvestors(product)}
                      className="text-blue-600 hover:text-blue-800"
                      title="Manage Investors"
                    >
                      <TrendingUp className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => onEdit(product)}
                      className="text-primary-600 hover:text-primary-800"
                      title="Edit Product"
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => onDelete(product)}
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
  );
};

