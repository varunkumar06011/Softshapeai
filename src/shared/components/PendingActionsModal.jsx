// ─────────────────────────────────────────────────────────────────────────────
// PendingActionsModal — View and manage offline queued actions
// ─────────────────────────────────────────────────────────────────────────────
// Displays pending actions queued while the app was offline:
//   - Lists all pending actions from IndexedDB (offlineDB)
//   - Shows action type, timestamp, and status (pending/failed)
//   - Retry individual actions or sync all
//   - Delete individual actions or clear all
//   - Sync status indicators (syncing, success, error)
//
// Actions are processed by syncEngine which replays them to the backend
// when connectivity is restored.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, Trash2, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { getPendingActions, removePendingAction, updatePendingAction, clearAllPendingActions, clearAllOfflinePrintJobs } from '../../utils/offlineDB';
import { syncPendingActions } from '../../utils/syncEngine';

export default function PendingActionsModal({ open, onClose }) {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadActions = useCallback(async () => {
    try {
      const pending = await getPendingActions();
      setActions(pending);
    } catch (err) {
      console.error('[PendingActionsModal] Failed to load actions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setLoading(true);
      loadActions();
      // Refresh every 3 seconds while open
      const interval = setInterval(loadActions, 3000);
      return () => clearInterval(interval);
    }
  }, [open, loadActions]);

  const handleRetry = async (actionId) => {
    await updatePendingAction(actionId, { status: 'pending', lastError: null, attempts: 0 });
    await loadActions();
    syncPendingActions();
  };

  const handleCancel = async (actionId) => {
    await removePendingAction(actionId);
    await loadActions();
  };

  const handleRetryAll = async () => {
    for (const action of actions) {
      if (action.status === 'error' || action.status === 'conflict') {
        await updatePendingAction(action.id, { status: 'pending', lastError: null, attempts: 0 });
      }
    }
    await loadActions();
    syncPendingActions();
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear all pending actions and print jobs? This cannot be undone.')) {
      return;
    }
    try {
      await clearAllPendingActions();
      await clearAllOfflinePrintJobs();
      await loadActions();
    } catch (err) {
      console.error('[PendingActionsModal] Failed to clear all:', err);
    }
  };

  if (!open) return null;

  const statusColors = {
    pending: 'text-blue-600 bg-blue-50',
    syncing: 'text-purple-600 bg-purple-50',
    synced: 'text-emerald-600 bg-emerald-50',
    error: 'text-red-600 bg-red-50',
    conflict: 'text-amber-600 bg-amber-50',
    auth_error: 'text-red-700 bg-red-100',
  };

  const statusIcons = {
    pending: <Clock size={12} />,
    syncing: <RefreshCw size={12} className="animate-spin" />,
    synced: <CheckCircle size={12} />,
    error: <AlertTriangle size={12} />,
    conflict: <AlertTriangle size={12} />,
    auth_error: <AlertTriangle size={12} />,
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">Pending Offline Actions</h2>
          <div className="flex items-center gap-2">
            {actions.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600 transition-colors"
                title="Clear all pending actions and print jobs"
              >
                <Trash2 size={12} />
                Clear All
              </button>
            )}
            {actions.some(a => a.status === 'error' || a.status === 'conflict') && (
              <button
                onClick={handleRetryAll}
                className="flex items-center gap-1 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-600 transition-colors"
              >
                <RefreshCw size={12} />
                Retry All
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <RefreshCw size={20} className="animate-spin mr-2" />
              Loading...
            </div>
          ) : actions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <CheckCircle size={32} className="mb-2" />
              <p className="text-sm">No pending actions — all synced!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {actions.map((action) => (
                <div
                  key={action.id}
                  className="rounded-lg border border-gray-200 p-3 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-gray-800">{action.actionType}</span>
                        <span
                          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            statusColors[action.status] || statusColors.pending
                          }`}
                        >
                          {statusIcons[action.status] || statusIcons.pending}
                          {action.status || 'pending'}
                        </span>
                        {action.attempts > 0 && (
                          <span className="text-[10px] text-gray-400">
                            {action.attempts} attempt{action.attempts !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {action.method} {action.url}
                      </div>
                      {action.lastError && (
                        <div className="text-xs text-red-500 mt-1">{action.lastError}</div>
                      )}
                      {action.requestId && (
                        <div className="text-[10px] text-gray-400 mt-1">
                          Ref: {action.requestId.slice(0, 16)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {(action.status === 'error' || action.status === 'conflict') && (
                        <button
                          onClick={() => handleRetry(action.id)}
                          className="rounded p-1.5 text-blue-500 hover:bg-blue-50 transition-colors"
                          title="Retry"
                        >
                          <RefreshCw size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => handleCancel(action.id)}
                        className="rounded p-1.5 text-red-400 hover:bg-red-50 transition-colors"
                        title="Cancel"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {actions.length > 0 && (
          <div className="p-3 border-t border-gray-200 text-xs text-gray-500 text-center">
            {actions.length} action{actions.length !== 1 ? 's' : ''} pending —
            will sync automatically when online
          </div>
        )}
      </div>
    </div>
  );
}
