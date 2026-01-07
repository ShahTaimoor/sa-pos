import React from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOffline } from '../hooks/useOffline';

export const OfflineIndicator = () => {
  const isOffline = useOffline();

  if (!isOffline) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2 animate-pulse">
      <WifiOff className="h-5 w-5" />
      <span className="text-sm font-medium">You're offline</span>
    </div>
  );
};

export default OfflineIndicator;

