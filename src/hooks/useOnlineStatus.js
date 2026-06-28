// ─────────────────────────────────────────────────────────────────────────────
// useOnlineStatus — Hook for detecting browser online/offline status
// ─────────────────────────────────────────────────────────────────────────────
// Listens to browser 'online' and 'offline' events and also performs
// a backend reachability check (via apiConfig) when the browser reports
// 'online'. This catches cases where the browser has network but the
// backend server is down.
//
// Returns: boolean (true if both browser and backend are reachable)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { isBackendReachable, checkBackendReachability } from '../services/apiConfig';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(isBackendReachable());

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(await checkBackendReachability());
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Refresh reachability periodically
    const interval = setInterval(async () => {
      const reachable = await checkBackendReachability();
      setIsOnline(prev => (prev !== reachable ? reachable : prev));
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return isOnline;
}
