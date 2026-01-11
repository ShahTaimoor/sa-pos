import React, { useState, useEffect, useRef } from 'react';
import { X, Search, RefreshCw, Calendar, ArrowUpDown } from 'lucide-react';
import { formatDate, formatCurrency } from '../utils/formatters';

const DashboardReportModal = ({ 
  isOpen, 
  onClose, 
  title, 
  columns, 
  data = [], 
  isLoading = false,
  dateFrom,
  dateTo,
  onDateChange,
  filters = {},
  onFilterChange
}) => {
  const [localFilters, setLocalFilters] = useState(() => filters || {});
  const [localDateFrom, setLocalDateFrom] = useState(() => dateFrom);
  const [localDateTo, setLocalDateTo] = useState(() => dateTo);

  // Use refs to track previous values and avoid unnecessary updates
  const prevFiltersRef = useRef(JSON.stringify(filters || {}));
  const prevDateFromRef = useRef(dateFrom);
  const prevDateToRef = useRef(dateTo);

  useEffect(() => {
    // Only update if dateFrom actually changed
    if (dateFrom !== prevDateFromRef.current) {
      setLocalDateFrom(dateFrom);
      prevDateFromRef.current = dateFrom;
    }
  }, [dateFrom]);

  useEffect(() => {
    // Only update if dateTo actually changed
    if (dateTo !== prevDateToRef.current) {
      setLocalDateTo(dateTo);
      prevDateToRef.current = dateTo;
    }
  }, [dateTo]);

  useEffect(() => {
    // Only update if filters object actually changed (deep comparison using JSON)
    const currentFiltersStr = JSON.stringify(filters || {});
    const prevFiltersStr = prevFiltersRef.current;
    
    if (currentFiltersStr !== prevFiltersStr) {
      setLocalFilters(filters || {});
      prevFiltersRef.current = currentFiltersStr;
    }
  }, [filters]);

  if (!isOpen) return null;

  const handleSearch = () => {
    if (onDateChange) {
      onDateChange(localDateFrom, localDateTo);
    }
    if (onFilterChange) {
      onFilterChange(localFilters);
    }
  };

  const handleFilterChange = (key, value) => {
    setLocalFilters(prev => ({ ...prev, [key]: value }));
  };

  const getFilterInput = (column) => {
    if (column.filterType === 'date') {
      return (
        <input
          type="date"
          value={localFilters[column.key] || ''}
          onChange={(e) => handleFilterChange(column.key, e.target.value)}
          className="input text-xs w-full"
          placeholder="Equals:"
        />
      );
    } else if (column.filterType === 'number') {
      return (
        <input
          type="number"
          value={localFilters[column.key] || ''}
          onChange={(e) => handleFilterChange(column.key, e.target.value)}
          className="input text-xs w-full"
          placeholder="Equals:"
        />
      );
    } else {
      return (
        <input
          type="text"
          value={localFilters[column.key] || ''}
          onChange={(e) => handleFilterChange(column.key, e.target.value)}
          className="input text-xs w-full"
          placeholder="Contains:"
        />
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-6 border w-[95%] max-w-7xl shadow-lg rounded-lg bg-white">
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600 mt-1">
              From: {formatDate(localDateFrom)} To: {formatDate(localDateTo)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Date Range and Filters */}
        <div className="mb-4 space-y-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <label className="text-sm font-medium text-gray-600">From:</label>
              <input
                type="date"
                value={localDateFrom}
                onChange={(e) => setLocalDateFrom(e.target.value)}
                className="input text-sm w-40"
              />
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-600">To:</label>
              <input
                type="date"
                value={localDateTo}
                onChange={(e) => setLocalDateTo(e.target.value)}
                className="input text-sm w-40"
              />
            </div>
            <button
              onClick={handleSearch}
              className="btn btn-primary flex items-center space-x-2 px-4 py-2"
            >
              <Search className="h-4 w-4" />
              <span>Search</span>
            </button>
          </div>

        </div>

        {/* Grouping Hint */}
        <div className="mb-4 p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
          Drag a column here to group by this column.
        </div>

        {/* Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      <div className="flex items-center space-x-1">
                        <span>{column.label}</span>
                        {column.sortable && (
                          <ArrowUpDown className="h-3 w-3 text-gray-400" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-8 text-center">
                      <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                      <p className="mt-2 text-gray-500">Loading data...</p>
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-8 text-center text-gray-500">
                      No data found for the selected criteria.
                    </td>
                  </tr>
                ) : (
                  data.map((row, index) => (
                    <tr
                      key={row._id || row.id || index}
                      className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className="px-4 py-3 whitespace-nowrap text-sm text-gray-900"
                        >
                          {column.render
                            ? column.render(row[column.key], row)
                            : column.format === 'currency'
                            ? formatCurrency(row[column.key] || 0)
                            : column.format === 'date'
                            ? formatDate(row[column.key])
                            : row[column.key] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-between items-center">
          <p className="text-sm text-gray-600">
            Showing {data.length} record{data.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardReportModal;
