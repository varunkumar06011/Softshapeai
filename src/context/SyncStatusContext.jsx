import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { subscribeSyncStatus, initSyncEngine, syncPendingActions, getSyncStatus } from '../utils/syncEngine';
import { subscribeConflicts, clearConflict, clearAllConflicts } from '../utils/conflictResolver';

const SyncStatusContext = createContext(null);

export function SyncStatusProvider({ children }) {
  const [status, setStatus] = useState({
    syncStatus: 'idle',
    pendingCount: 0,
    lastSyncAt: null,
    lastError: null,
    isOnline: navigator.onLine,
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

    // Track online/offline status
    const handleOnline = () => {
      setStatus((prev) => ({ ...prev, isOnline: true }));
    };
    const handleOffline = () => {
      setStatus((prev) => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial online status
    setStatus((prev) => ({ ...prev, isOnline: navigator.onLine }));

    return () => {
      unsubscribe();
      unsubscribeConflicts();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
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

  const value = {
    ...status,
    isOffline: !status.isOnline,
    hasPending: status.pendingCount > 0,
    hasConflicts: conflicts.length > 0,
    conflicts,
    triggerSync,
    dismissConflict,
    dismissAllConflicts,
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
      isOnline: navigator.onLine,
      isOffline: !navigator.onLine,
      hasPending: false,
      hasConflicts: false,
      conflicts: [],
      triggerSync: () => {},
      dismissConflict: () => {},
      dismissAllConflicts: () => {},
    };
  }
  return ctx;
}
