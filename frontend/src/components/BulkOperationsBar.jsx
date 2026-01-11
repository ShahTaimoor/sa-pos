/**
 * Bulk Operations Bar Component
 * Displays bulk action buttons and selection info
 */

import React from 'react';
import { 
  Edit, 
  Trash2, 
  Download, 
  Tag, 
  Package, 
  TrendingUp, 
  CheckSquare,
  X,
  Undo2
} from 'lucide-react';

export const BulkOperationsBar = ({
  selectedCount,
  isOperationInProgress,
  operationProgress,
  canUndo,
  onBulkUpdate,
  onBulkDelete,
  onBulkExport,
  onBulkStatusChange,
  onBulkCategoryChange,
  onBulkPriceUpdate,
  onBulkStockAdjust,
  onUndo,
  onClearSelection,
  availableActions = ['update', 'delete', 'export', 'status', 'category', 'price', 'stock'],
  className = ''
}) => {
  if (selectedCount === 0 && !isOperationInProgress) {
    return null;
  }

  return (
    <div className={`bg-primary-50 border border-primary-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Selection Info */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <CheckSquare className="h-5 w-5 text-primary-600" />
            <span className="text-sm font-medium text-gray-900">
              {selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected
            </span>
          </div>
          
          {isOperationInProgress && (
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent"></div>
              <span className="text-sm text-gray-600">
                {operationProgress.message || 'Processing...'} ({operationProgress.current}/{operationProgress.total})
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 flex-wrap">
          {canUndo && (
            <button
              onClick={onUndo}
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              title="Undo last operation"
            >
              <Undo2 className="h-4 w-4 mr-1" />
              Undo
            </button>
          )}

          {availableActions.includes('update') && onBulkUpdate && (
            <button
              onClick={onBulkUpdate}
              disabled={isOperationInProgress}
              className="flex items-center px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Edit className="h-4 w-4 mr-1" />
              Update
            </button>
          )}

          {availableActions.includes('status') && onBulkStatusChange && (
            <button
              onClick={onBulkStatusChange}
              disabled={isOperationInProgress}
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckSquare className="h-4 w-4 mr-1" />
              Change Status
            </button>
          )}

          {availableActions.includes('category') && onBulkCategoryChange && (
            <button
              onClick={onBulkCategoryChange}
              disabled={isOperationInProgress}
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Tag className="h-4 w-4 mr-1" />
              Change Category
            </button>
          )}

          {availableActions.includes('price') && onBulkPriceUpdate && (
            <button
              onClick={onBulkPriceUpdate}
              disabled={isOperationInProgress}
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TrendingUp className="h-4 w-4 mr-1" />
              Update Prices
            </button>
          )}

          {availableActions.includes('stock') && onBulkStockAdjust && (
            <button
              onClick={onBulkStockAdjust}
              disabled={isOperationInProgress}
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Package className="h-4 w-4 mr-1" />
              Adjust Stock
            </button>
          )}

          {availableActions.includes('export') && onBulkExport && (
            <button
              onClick={onBulkExport}
              disabled={isOperationInProgress}
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4 mr-1" />
              Export
            </button>
          )}

          {availableActions.includes('delete') && onBulkDelete && (
            <button
              onClick={onBulkDelete}
              disabled={isOperationInProgress}
              className="flex items-center px-3 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </button>
          )}

          <button
            onClick={onClearSelection}
            disabled={isOperationInProgress}
            className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {isOperationInProgress && operationProgress.total > 0 && (
        <div className="mt-4">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(operationProgress.current / operationProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkOperationsBar;

