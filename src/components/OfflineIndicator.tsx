import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC<{ pendingCount?: number }> = ({ pendingCount = 0 }) => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-950/95 border border-amber-500/50 px-3.5 py-2 text-xs font-semibold text-amber-200 shadow-lg">
      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
      <span>
        Offline Mode — Screening decisions are queued locally
        {pendingCount > 0 ? ` (${pendingCount} pending sync)` : ''}.
      </span>
    </div>
  );
};
