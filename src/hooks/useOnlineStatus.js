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
import { isBackendReachable, subscribeReachability } from '../services/apiConfig';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(isBackendReachable());

  useEffect(() => {
    // Subscribe to the shared reachability state from apiConfig.
    // This replaces the old duplicate 30s polling interval — apiConfig
    // runs a single interval and notifies all subscribers.
    const unsubscribe = subscribeReachability((reachable) => {
      setIsOnline(reachable);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return isOnline;
}
