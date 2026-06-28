// ─────────────────────────────────────────────────────────────────────────────
// SyncStatusContext — Offline sync engine status and conflict resolution
// ─────────────────────────────────────────────────────────────────────────────
// Manages the offline-first sync engine state:
//   - syncStatus: 'idle' | 'syncing' | 'success' | 'error'
//   - pendingCount: number of queued actions waiting to sync
//   - lastSyncAt: timestamp of last successful sync
//   - lastError: error message from last failed sync attempt
//   - authExpired: true if JWT expired during sync (triggers re-login)
//   - isOnline: backend reachability status (checked via health endpoint)
//
// Conflict resolution:
//   - Subscribes to conflict events from the conflictResolver
//   - Exposes conflicts array and clearConflict/clearAllConflicts functions
//   - Conflicts occur when offline edits clash with server-side changes
//
// On mount:
//   - Initializes the sync engine
//   - Subscribes to sync status updates
//   - Subscribes to conflict events
//   - Starts periodic backend reachability checks
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { subscribeSyncStatus, initSyncEngine, syncPendingActions, getSyncStatus, clearAuthExpired } from '../utils/syncEngine';
import { subscribeConflicts, clearConflict, clearAllConflicts } from '../utils/conflictResolver';
import { isBackendReachable, checkBackendReachability } from '../services/apiConfig';

const SyncStatusContext = createContext(null);

export function SyncStatusProvider({ children }) {
  const [status, setStatus] = useState({
    syncStatus: 'idle',
    pendingCount: 0,
    lastSyncAt: null,
    lastError: null,
    authExpired: false,
    isOnline: isBackendReachable(),
  });

  const [conflicts, setConflicts] = useState([]);

  useEffect(() => {
    // Initialize the sync engine on mount
    initSyncEngine();

    // Subscribe to sync status updates
    const unsubscribe = subscribeSyncStatus((newStatus) => {
      setStatus((prev) => ({ ...prev, ...newStatus }));
    });

    // Subscribe to conflict updates
    const unsubscribeConflicts = subscribeConflicts((newConflicts) => {
      setConflicts(newConflicts);
    });

    // Track online/offline status based on actual backend reachability
    const handleOnline = async () => {
      const reachable = await checkBackendReachability();
      setStatus((prev) => ({ ...prev, isOnline: reachable }));
    };
    const handleOffline = () => {
      setStatus((prev) => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial online status
    setStatus((prev) => ({ ...prev, isOnline: isBackendReachable() }));

    // Refresh reachability periodically so the UI badge reflects reality
    const reachabilityInterval = setInterval(async () => {
      const reachable = await checkBackendReachability();
      setStatus((prev) => (prev.isOnline !== reachable ? { ...prev, isOnline: reachable } : prev));
    }, 30000);

    return () => {
      unsubscribe();
      unsubscribeConflicts();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(reachabilityInterval);
    };
  }, []);

  const triggerSync = useCallback(() => {
    syncPendingActions();
  }, []);

  const dismissConflict = useCallback((actionId) => {
    clearConflict(actionId);
  }, []);

  const dismissAllConflicts = useCallback(() => {
    clearAllConflicts();
  }, []);

  const dismissAuthExpired = useCallback(() => {
    clearAuthExpired();
  }, []);

  const value = {
    ...status,
    isOffline: !status.isOnline,
    hasPending: status.pendingCount > 0,
    hasConflicts: conflicts.length > 0,
    conflicts,
    triggerSync,
    dismissConflict,
    dismissAllConflicts,
    dismissAuthExpired,
  };

  return (
    <SyncStatusContext.Provider value={value}>
      {children}
    </SyncStatusContext.Provider>
  );
}

export function useSyncStatus() {
  const ctx = useContext(SyncStatusContext);
  if (!ctx) {
    // Return a safe default if used outside provider
    return {
      syncStatus: 'idle',
      pendingCount: 0,
      lastSyncAt: null,
      lastError: null,
      authExpired: false,
      isOnline: isBackendReachable(),
      isOffline: !isBackendReachable(),
      hasPending: false,
      hasConflicts: false,
      conflicts: [],
      triggerSync: () => {},
      dismissConflict: () => {},
      dismissAllConflicts: () => {},
      dismissAuthExpired: () => {},
    };
  }
  return ctx;
}
