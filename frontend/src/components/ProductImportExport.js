import React, { useState } from 'react';
import { 
  Download, 
  Upload, 
  FileText, 
  FileSpreadsheet, 
  AlertCircle,
  CheckCircle,
  X,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Database
} from 'lucide-react';
import { productsAPI } from '../services/api';
import { LoadingButton } from './LoadingSpinner';
import { handleApiError, showSuccessToast, showErrorToast, showWarningToast } from '../utils/errorHandler';
import toast from 'react-hot-toast';
import { useLoadingState } from '../utils/loadingStates';
import { validateFile, validateCSVData, sanitizeCSVData } from '../utils/validation';
import { sanitizeCSVData as sanitizeCSVDataUtil } from '../utils/sanitization';

const ProductImportExport = ({ onImportComplete, filters = {} }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResults, setImportResults] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importType, setImportType] = useState('csv');

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const response = await productsAPI.exportCSV(filters);
      
      // Download the file
      const downloadResponse = await productsAPI.downloadFile(response.data.filename);
      
      // Create blob and download
      const blob = new Blob([downloadResponse.data], { 
        type: 'text/csv;charset=utf-8;' 
      });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', response.data.filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showSuccessToast(`Exported ${response.data.recordCount} products to CSV`);
    } catch (error) {
      handleApiError(error, 'CSV Export');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const response = await productsAPI.exportExcel(filters);
      
      // Download the file
      const downloadResponse = await productsAPI.downloadFile(response.data.filename);
      
      // Create blob and download
      const blob = new Blob([downloadResponse.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', response.data.filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showSuccessToast(`Exported ${response.data.recordCount} products to Excel`);
    } catch (error) {
      handleApiError(error, 'Excel Export');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      const validTypes = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];
      
      // Use enhanced file validation
      const fileError = validateFile(file, {
        allowedTypes: validTypes,
        maxSizeInMB: 10,
        required: true
      });
      
      if (fileError) {
        showErrorToast(fileError);
        event.target.value = ''; // Clear the file input
        return;
      }
      
      setImportFile(file);
      setImportType(file.type.includes('csv') ? 'csv' : 'excel');
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error('Please select a file to import');
      return;
    }

    try {
      setIsImporting(true);
      const response = importType === 'csv' 
        ? await productsAPI.importCSV(importFile)
        : await productsAPI.importExcel(importFile);
      
      setImportResults(response.data.results);
      
      if (response.data.results.success > 0) {
        showSuccessToast(`Successfully imported ${response.data.results.success} products`);
        if (onImportComplete) {
          onImportComplete();
        }
      }
      
      if (response.data.results.errors.length > 0) {
        showWarningToast(`${response.data.results.errors.length} products failed to import`);
      }
      
    } catch (error) {
      handleApiError(error, 'Product Import');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await productsAPI.downloadTemplate();
      
      // Create blob and download
      const blob = new Blob([response.data], { 
        type: 'text/csv;charset=utf-8;' 
      });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'product_template.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showSuccessToast('Template downloaded successfully');
    } catch (error) {
      handleApiError(error, 'Template Download');
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setImportResults(null);
    setShowImportModal(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Collapsible Header */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          <Database className="h-5 w-5 text-gray-600" />
          <span className="font-medium text-gray-900">Import / Export Products</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowImportModal(true);
            }}
            className="btn btn-primary btn-sm"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import Products
          </button>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="border-t border-gray-200 p-4">

      {/* Export Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center mb-3">
            <FileText className="h-5 w-5 text-blue-600 mr-2" />
            <h4 className="font-medium text-gray-900">Export to CSV</h4>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Export all products to a CSV file for backup or analysis.
          </p>
          <LoadingButton
            onClick={handleExportCSV}
            isLoading={isExporting}
            className="btn btn-secondary btn-sm w-full"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </LoadingButton>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center mb-3">
            <FileSpreadsheet className="h-5 w-5 text-green-600 mr-2" />
            <h4 className="font-medium text-gray-900">Export to Excel</h4>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Export all products to an Excel file with formatting.
          </p>
          <LoadingButton
            onClick={handleExportExcel}
            isLoading={isExporting}
            className="btn btn-secondary btn-sm w-full"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </LoadingButton>
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <HelpCircle className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900 mb-2">Import Guidelines</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Download the template to see the required format</li>
              <li>• Required fields: Product Name, Category</li>
              <li>• Supported formats: CSV, Excel (.xlsx)</li>
              <li>• Maximum file size: 10MB</li>
              <li>• Products with duplicate names will be skipped</li>
            </ul>
            <button
              onClick={handleDownloadTemplate}
              className="btn btn-primary btn-xs mt-3"
            >
              <Download className="h-3 w-3 mr-1" />
              Download Template
            </button>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Import Products</h3>
              <button
                onClick={resetImport}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              {!importResults ? (
                <div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select File
                    </label>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileSelect}
                      className="input w-full"
                    />
                  </div>

                  {importFile && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <FileText className="h-4 w-4 text-gray-600 mr-2" />
                        <span className="text-sm text-gray-700">{importFile.name}</span>
                        <span className="text-xs text-gray-500 ml-auto">
                          {(importFile.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={resetImport}
                      className="btn btn-secondary btn-sm"
                    >
                      Cancel
                    </button>
                    <LoadingButton
                      onClick={handleImport}
                      isLoading={isImporting}
                      disabled={!importFile}
                      className="btn btn-primary btn-sm"
                    >
                      Import Products
                    </LoadingButton>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 mb-3">Import Results</h4>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-1" />
                        <div className="text-lg font-semibold text-green-600">
                          {importResults.success}
                        </div>
                        <div className="text-sm text-green-700">Success</div>
                      </div>
                      
                      <div className="text-center p-3 bg-red-50 rounded-lg">
                        <AlertCircle className="h-6 w-6 text-red-600 mx-auto mb-1" />
                        <div className="text-lg font-semibold text-red-600">
                          {importResults.errors.length}
                        </div>
                        <div className="text-sm text-red-700">Errors</div>
                      </div>
                    </div>

                    {importResults.errors.length > 0 && (
                      <div className="max-h-40 overflow-y-auto">
                        <h5 className="font-medium text-gray-900 mb-2">Errors:</h5>
                        <div className="space-y-2">
                          {importResults.errors.slice(0, 10).map((error, index) => (
                            <div key={index} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                              Row {error.row}: {error.error}
                            </div>
                          ))}
                          {importResults.errors.length > 10 && (
                            <div className="text-sm text-gray-500">
                              ... and {importResults.errors.length - 10} more errors
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={resetImport}
                      className="btn btn-primary btn-sm"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
};

export default ProductImportExport;
