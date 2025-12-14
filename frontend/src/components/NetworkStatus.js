import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { showWarningToast, showSuccessToast } from '../utils/errorHandler';

const NetworkStatus = () => {
  const [isBackendOnline, setIsBackendOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    // Check backend server connection
    const checkBackendConnection = async () => {
      try {
        const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        const response = await fetch(`${API_BASE_URL}/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        if (response.ok) {
          if (!isBackendOnline) {
            setIsBackendOnline(true);
            if (wasOffline) {
              showSuccessToast('Backend server connection restored!');
              setWasOffline(false);
            }
          }
        } else {
          throw new Error('Backend not responding');
        }
      } catch (error) {
        if (isBackendOnline) {
          setIsBackendOnline(false);
          setWasOffline(true);
          showWarningToast('Backend server is not reachable. Please ensure the server is running.');
        }
      }
    };

    // Check immediately on mount
    checkBackendConnection();

    // Then check every 30 seconds
    const interval = setInterval(checkBackendConnection, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [isBackendOnline, wasOffline]);

  if (isBackendOnline) {
    return null; // Don't show anything when backend is online
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-2 text-center text-sm">
      <div className="flex items-center justify-center space-x-2">
        <WifiOff className="h-4 w-4" />
        <span>Backend server is not running. Please start the server at localhost:5000</span>
      </div>
    </div>
  );
};

export default NetworkStatus;
