// ─────────────────────────────────────────────────────────────────────────────
// SyncStatusIndicator — Persistent offline/online + sync state indicator
// ─────────────────────────────────────────────────────────────────────────────
// Polls the edge server's /api/edge/sync/status every 15 seconds.
// Shows one of three states:
//   - Online — all synced (green dot)
//   - Online — syncing N records (yellow dot, animated)
//   - Offline — billing works, sync pending (red dot)
//
// Also checks edge server health for database recovery warnings.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, Cloud, CheckCircle2 } from 'lucide-react';
import { isEdgeAvailable, edgeFetch } from '../../services/edgeHealth';

export default function SyncStatusIndicator() {
  const [state, setState] = useState('checking');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [recoveryMessage, setRecoveryMessage] = useState(null);
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const health = await edgeFetch('/health');
      if (health.databaseRecovered && health.recoveryMessage) {
        setRecoveryMessage(health.recoveryMessage);
        setShowRecoveryBanner(true);
      }

      if (!health.sessionValid) {
        setState('offline');
        return;
      }

      try {
        const status = await edgeFetch('/api/edge/sync/status');
        setPendingCount(status.pendingCount || 0);
        setLastSync(status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleTimeString() : null);

        if (status.pendingCount > 0) {
          setState('syncing');
        } else if (status.consecutiveFailures > 0) {
          setState('offline');
        } else {
          setState('online');
        }
      } catch {
        // Sync status endpoint failed — edge is up but session may be invalid
        setState('offline');
      }
    } catch {
      // Edge server not reachable
      setState('offline');
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 15000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const config = {
    online: {
      icon: CheckCircle2,
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'Online — all synced',
    },
    syncing: {
      icon: RefreshCw,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: `Syncing ${pendingCount} record${pendingCount !== 1 ? 's' : ''}...`,
      spin: true,
    },
    offline: {
      icon: WifiOff,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'Offline — billing works, sync pending',
    },
    checking: {
      icon: RefreshCw,
      color: 'text-gray-400',
      bg: 'bg-gray-50',
      border: 'border-gray-200',
      text: 'Checking connection...',
      spin: true,
    },
  };

  const c = config[state] || config.checking;
  const Icon = c.icon;

  return (
    <>
      {/* Recovery banner — shown once after corruption recovery */}
      {showRecoveryBanner && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-orange-500 text-white px-4 py-2 text-sm font-medium flex items-center gap-2 shadow-lg">
          <AlertTriangle size={16} className="flex-shrink-0" />
          <span className="flex-1">{recoveryMessage}</span>
          <button
            onClick={() => setShowRecoveryBanner(false)}
            className="text-white/80 hover:text-white font-bold text-xs px-2 py-0.5 rounded hover:bg-white/20"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Persistent status pill — bottom right corner */}
      <div className={`fixed bottom-3 right-3 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full border ${c.bg} ${c.border} shadow-sm text-xs font-bold ${c.color}`}>
        <Icon size={14} className={c.spin ? 'animate-spin' : ''} />
        <span>{c.text}</span>
        {lastSync && state === 'online' && (
          <span className="text-gray-400 font-normal hidden sm:inline">· {lastSync}</span>
        )}
      </div>
    </>
  );
}
