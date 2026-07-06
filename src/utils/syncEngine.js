// ─────────────────────────────────────────────────────────────────────────────
// Sync Engine — Offline action replay engine with conflict resolution
// ─────────────────────────────────────────────────────────────────────────────
// Processes pending offline actions when connectivity is restored:
//
// Key functions:
//   - syncPendingActions(): replays all queued actions from IndexedDB to backend
//     - Sends actions in bulk via /api/orders/sync-bulk for efficiency
//     - Falls back to individual sync if bulk fails
//     - Handles conflicts via conflictResolver.js
//     - Updates action status (syncing, synced, failed, conflict)
//     - Prunes old actions past max age
//   - syncSingleAction(action): replays a single action
//   - getSyncStatus(): returns current sync state (idle, syncing, error)
//   - subscribeToSyncStatus(callback): pub/sub for sync status updates
//
// Action types: KOT_SEND, ORDER_UPDATE, ORDER_SETTLE, TABLE_STATUS, etc.
// Each action contains: { type, method, url, body, entityId, requestId, createdAt }
//
// Uses resilience.js for retry logic and conflictResolver.js for conflict handling.
// ─────────────────────────────────────────────────────────────────────────────

import {
  getPendingActions,
  getPendingActionsByEntity,
  removePendingAction,
  updatePendingAction,
  getPendingCount,
  getPendingActionByRequestId,
  pruneOldPendingActions,
  setSyncMeta,
  getSyncMeta,
  markOfflineTransactionSynced,
} from './offlineDB';
import { API_BASE, getAuthHeaders, isBackendReachable, checkBackendReachability } from '../services/apiConfig';
import { resolveConflict, addConflict, clearConflict } from './conflictResolver';
import { finalizeSettlementAudit } from './settlementAuditLog';
import { markKitchenItemsSynced } from './kitchenQueue';

const LOW_QUOTA_RATIO = 0.8;

/**
 * Warn if IndexedDB is using more than 80% of the estimated storage quota.
 * Returns true if the quota looks healthy, false if the app is close to full.
 */
export async function checkStorageQuota() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return { ok: true };
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 1;
    const ratio = usage / quota;
    if (ratio > LOW_QUOTA_RATIO) {
      return {
        ok: false,
        usage,
        quota,
        message: `Storage is ${Math.round(ratio * 100)}% full. Sync now to free space.`,
      };
    }
    return { ok: true, usage, quota };
  } catch (err) {
    return { ok: true, error: err.message };
  }
}

/**
 * Returns true if the device is on battery power and below a low threshold.
 * On desktop/unknown, returns false so sync keeps running normally.
 */
export function shouldDeferSyncOnBattery() {
  try {
    const battery = navigator.getBattery ? navigator.getBattery() : null;
    if (!battery) return false;
    return battery.then ? battery.then(b => !b.charging && b.level < 0.15) : false;
  } catch {
    return false;
  }
}

// ── Status tracking ──────────────────────────────────────────────────────────

let syncing = false;
let syncStatus = 'idle'; // idle | syncing | error | paused
let pendingCount = 0;
let lastSyncAt = null;
let lastError = null;
let authExpired = false;

const statusListeners = new Set();

export function getSyncStatus() {
  return { syncStatus, pendingCount, lastSyncAt, lastError, authExpired };
}

export function subscribeSyncStatus(callback) {
  statusListeners.add(callback);
  callback(getSyncStatus());
  return () => statusListeners.delete(callback);
}

export function clearAuthExpired() {
  authExpired = false;
  lastError = null;
  notifyStatusListeners();
}

function notifyStatusListeners() {
  const status = getSyncStatus();
  statusListeners.forEach(cb => {
    try { cb(status); } catch (e) { /* listener error — ignore */ }
  });
}

function setSyncStatus(newStatus) {
  syncStatus = newStatus;
  notifyStatusListeners();
}

async function refreshPendingCount() {
  pendingCount = await getPendingCount();
  notifyStatusListeners();
}

// ── Backoff helpers ──────────────────────────────────────────────────────────

function getBackoffDelay(attempts) {
  const base = Math.min(1000 * Math.pow(2, attempts), 30000); // cap at 30s
  const jitter = Math.random() * 0.3 * base; // 0-30% jitter
  return base + jitter;
}

// ── Offline ID mapping ───────────────────────────────────────────────────────
// Maps temporary offline order IDs (e.g. "offline-1709123456789") to real server
// order IDs returned after a successful create-order sync. This allows subsequent
// actions (update-items, settle, cancel-items, print-bill) that reference the
// offline ID to be patched with the real ID before being sent to the backend.

async function loadOfflineIdMap() {
  try {
    const map = await getSyncMeta('offlineIdMap');
    return new Map(map ? Object.entries(map) : []);
  } catch {
    return new Map();
  }
}

async function saveOfflineIdMap(map) {
  try {
    await setSyncMeta('offlineIdMap', Object.fromEntries(map));
  } catch (e) {
    console.warn('[SyncEngine] Failed to save offline ID map:', e.message);
  }
}

function patchActionWithRealId(action, offlineIdMap) {
  let patched = false;
  const patchedAction = { ...action, body: { ...action.body } };

  // Patch entityId
  if (offlineIdMap.has(patchedAction.entityId)) {
    patchedAction.entityId = offlineIdMap.get(patchedAction.entityId);
    patched = true;
  }

  // Patch URL (e.g. /api/orders/offline-xxx/items → /api/orders/real-uuid/items)
  if (patchedAction.url) {
    for (const [offlineId, realId] of offlineIdMap) {
      if (patchedAction.url.includes(offlineId)) {
        patchedAction.url = patchedAction.url.replace(offlineId, realId);
        patched = true;
        break;
      }
    }
  }

  // Patch body.orderId if present
  if (patchedAction.body?.orderId && offlineIdMap.has(patchedAction.body.orderId)) {
    patchedAction.body.orderId = offlineIdMap.get(patchedAction.body.orderId);
    patched = true;
  }

  return { action: patchedAction, patched };
}

// ── Bulk sync via /api/orders/offline-sync ───────────────────────────────────

async function bulkSync(actions) {
  const payload = {
    actions: actions.map(a => ({
      requestId: a.requestId,
      actionType: a.actionType,
      orderId: a.entityId,
      url: a.url,
      method: a.method,
      body: a.body,
      deviceId: a.deviceId || null,
    })),
  };

  const res = await fetch(`${API_BASE}/api/orders/offline-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Bulk sync failed: ${res.status}`);
  }

  const data = await res.json();
  return data.results || [];
}

// ── Individual action sync (fallback) ────────────────────────────────────────

async function syncSingleAction(action) {
  let url = action.url;
  // Append requestId as query param for GET-like endpoints, or into body for POST/PATCH
  if (action.method === 'POST' || action.method === 'PATCH') {
    action.body = { ...action.body, requestId: action.requestId };
  } else {
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}requestId=${encodeURIComponent(action.requestId)}`;
  }

  const res = await fetch(`${API_BASE}${url}`, {
    method: action.method,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: action.body ? JSON.stringify(action.body) : undefined,
  });

  if (res.ok) {
    return { requestId: action.requestId, status: 'success', statusCode: res.status, data: await res.json().catch(() => ({})) };
  }

  const errBody = await res.json().catch(() => ({}));

  // 409 Conflict — order already paid, already printed, etc.
  if (res.status === 409) {
    return { requestId: action.requestId, status: 'conflict', statusCode: 409, error: errBody.error || 'Conflict' };
  }

  // 401 — auth expired, pause sync
  if (res.status === 401) {
    return { requestId: action.requestId, status: 'auth_error', statusCode: 401, error: 'Authentication expired' };
  }

  return { requestId: action.requestId, status: 'error', statusCode: res.status, error: errBody.error || `Server returned ${res.status}` };
}

// ── Main sync function ───────────────────────────────────────────────────────

export async function syncPendingActions() {
  if (syncing) return;
  if (!isBackendReachable()) return;

  const quota = await checkStorageQuota();
  if (!quota.ok) {
    lastError = quota.message;
    setSyncStatus('error');
    console.warn('[SyncEngine] Sync paused:', quota.message);
    return;
  }

  const deferForBattery = await shouldDeferSyncOnBattery();
  if (deferForBattery) {
    console.log('[SyncEngine] Sync deferred due to low battery.');
    return;
  }

  syncing = true;
  setSyncStatus('syncing');

  try {
    const actions = await getPendingActions();
    if (actions.length === 0) {
      setSyncStatus('idle');
      return;
    }

    // Sort by createdAt to preserve global ordering
    actions.sort((a, b) => a.createdAt - b.createdAt);

    console.log(`[SyncEngine] Syncing ${actions.length} pending action(s)`);

    // Load existing offline ID map (from previous syncs)
    const offlineIdMap = await loadOfflineIdMap();

    // Patch all actions with real IDs from previous syncs
    for (let i = 0; i < actions.length; i++) {
      const { action: patchedAction, patched } = patchActionWithRealId(actions[i], offlineIdMap);
      if (patched) {
        await updatePendingAction(actions[i].id, {
          url: patchedAction.url,
          entityId: patchedAction.entityId,
          body: patchedAction.body,
        });
        actions[i] = patchedAction;
      }
    }

    // Two-phase sync: create-order actions first, then the rest
    const createActions = actions.filter(a => a.actionType === 'create-order');
    const otherActions = actions.filter(a => a.actionType !== 'create-order');

    let createResults = [];
    if (createActions.length > 0) {
      console.log(`[SyncEngine] Phase 1: Syncing ${createActions.length} create-order action(s)`);
      try {
        createResults = await bulkSync(createActions);
      } catch (bulkErr) {
        console.warn('[SyncEngine] Phase 1 bulk sync failed, falling back to individual:', bulkErr.message);
        createResults = await syncIndividually(createActions);
      }

      // Build ID mapping from successful create-order results
      const createResultMap = new Map((createResults || []).map(r => [r.requestId, r]));
      for (const action of createActions) {
        const result = createResultMap.get(action.requestId);
        if (result && (result.status === 'success' || result.status === 'skipped')) {
          const realOrderId = result.data?.order?.id || result.data?.id || result.data?.orderId;
          const offlineOrderId = action.body?.offlineOrderId;
          if (realOrderId && offlineOrderId) {
            offlineIdMap.set(offlineOrderId, realOrderId);
            console.log(`[SyncEngine] Mapped ${offlineOrderId} → ${realOrderId}`);
          }
        }
      }
      await saveOfflineIdMap(offlineIdMap);

      // Patch other actions with newly discovered real IDs
      for (let i = 0; i < otherActions.length; i++) {
        const { action: patchedAction, patched } = patchActionWithRealId(otherActions[i], offlineIdMap);
        if (patched) {
          await updatePendingAction(otherActions[i].id, {
            url: patchedAction.url,
            entityId: patchedAction.entityId,
            body: patchedAction.body,
          });
          otherActions[i] = patchedAction;
        }
      }
    }

    // Phase 2: Sync remaining actions
    let otherResults = [];
    if (otherActions.length > 0) {
      console.log(`[SyncEngine] Phase 2: Syncing ${otherActions.length} remaining action(s)`);
      try {
        otherResults = await bulkSync(otherActions);
      } catch (bulkErr) {
        console.warn('[SyncEngine] Phase 2 bulk sync failed, falling back to individual:', bulkErr.message);
        otherResults = await syncIndividually(otherActions);
      }
    }

    // Combine results from both phases
    const results = [...(createResults || []), ...(otherResults || [])];

    // Build a result map by requestId so out-of-order bulk-sync results cannot be
    // misapplied to the wrong action (backend processes entity groups concurrently).
    const resultMap = new Map((results || []).map(r => [r.requestId, r]));

    // Process results
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    let hadAuthError = false;
    let hadConflict = false;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      let result = resultMap.get(action.requestId) || { status: 'error', error: 'No result returned' };

      // Normalize bulk sync results: map statusCode to status for conflict detection
      if (result.statusCode === 409 && result.status !== 'conflict') {
        result = { ...result, status: 'conflict' };
      } else if (result.statusCode === 401 && result.status !== 'auth_error') {
        result = { ...result, status: 'auth_error', error: result.error || 'Authentication expired' };
      }

      if (result.status === 'success' || result.status === 'skipped') {
        await removePendingAction(action.id);
        // Clear any previous conflict for this action
        clearConflict(action.id);
        if (action.actionType === 'settle') {
          finalizeSettlementAudit(action.requestId, { status: result.status });
          if (action.body?.localTxnId) {
            markOfflineTransactionSynced(action.body.localTxnId, result.data || {}).catch(() => {});
          }
        }
        if (action.actionType === 'create-order' || action.actionType === 'update-items') {
          markKitchenItemsSynced(action.body?.tableId || action.entityId, action.requestId).catch(() => {});
        }
        succeeded++;
      } else if (result.status === 'conflict') {
        // Conflict — use conflictResolver to determine policy
        const resolution = resolveConflict(action, result);
        // 'skip' and 'adopt_server' are auto-resolved: remove the pending action.
        // The conflict is still surfaced in the UI so the cashier knows server state was adopted.
        const autoResolved = resolution.resolution === 'skip' || resolution.resolution === 'adopt_server';
        await updatePendingAction(action.id, {
          status: autoResolved ? 'synced' : 'conflict',
          lastError: resolution.message,
          attempts: (action.attempts || 0) + 1,
        });
        if (autoResolved) {
          await removePendingAction(action.id);
          // Keep conflict visible until user dismisses it, then clear it
          addConflict({
            actionId: action.id,
            requestId: action.requestId,
            actionType: action.actionType,
            ...resolution,
          });
          if (action.actionType === 'settle') {
            finalizeSettlementAudit(action.requestId, { status: 'skipped' });
            if (action.body?.localTxnId) {
              markOfflineTransactionSynced(action.body.localTxnId, result.data || {}).catch(() => {});
            }
          }
          succeeded++;
        } else {
          // Store conflict for UI surfacing (manual / merge / keep_local)
          addConflict({
            actionId: action.id,
            requestId: action.requestId,
            actionType: action.actionType,
            ...resolution,
          });
          if (action.actionType === 'settle') {
            finalizeSettlementAudit(action.requestId, { status: 'conflict', error: resolution.message });
            if (action.body?.localTxnId) {
              markOfflineTransactionSynced(action.body.localTxnId, result.data || {}).catch(() => {});
            }
          }
          hadConflict = true;
          failed++;
        }
      } else if (result.status === 'auth_error') {
        hadAuthError = true;
        await updatePendingAction(action.id, {
          status: 'auth_error',
          lastError: result.error,
          attempts: (action.attempts || 0) + 1,
        });
        failed++;
        break; // Stop syncing — need re-login
      } else {
        // Generic error — increment attempts, keep for retry
        await updatePendingAction(action.id, {
          status: 'error',
          lastError: result.error,
          attempts: (action.attempts || 0) + 1,
        });
        if (action.actionType === 'settle') {
          finalizeSettlementAudit(action.requestId, { status: 'error', error: result.error });
        }
        failed++;
      }
    }

    lastSyncAt = Date.now();
    await setSyncMeta('lastSyncAt', lastSyncAt);

    if (hadAuthError) {
      authExpired = true;
      setSyncStatus('paused');
      lastError = 'Authentication expired — please log in again';
    } else if (failed > 0 && succeeded === 0) {
      authExpired = false;
      setSyncStatus('error');
      lastError = `${failed} action(s) failed to sync`;
    } else if (hadConflict) {
      authExpired = false;
      setSyncStatus('error');
      lastError = `${failed} action(s) need conflict resolution`;
    } else {
      authExpired = false;
      setSyncStatus('idle');
      lastError = null;
    }

    // Prune old synced actions
    await pruneOldPendingActions();

    // Flush any queued offline print jobs now that we're online
    try {
      const { flushQueuedPrintJobs } = await import('./printOffline');
      await flushQueuedPrintJobs();
    } catch (e) {
      // printOffline may not be available in all environments
    }

    console.log(`[SyncEngine] Sync complete: ${succeeded} succeeded, ${skipped} skipped, ${failed} failed`);
  } catch (err) {
    console.warn('[SyncEngine] Sync failed:', err.message);
    lastError = err.message;
    setSyncStatus('error');
  } finally {
    syncing = false;
    await refreshPendingCount();
  }
}

// ── Individual sync fallback (per-entity ordering) ───────────────────────────

async function syncIndividually(actions) {
  // Group by entityId
  const entityGroups = new Map();
  for (const action of actions) {
    const entityId = action.entityId || action.body?.tableId || `ungrouped-${action.requestId}`;
    if (!entityGroups.has(entityId)) {
      entityGroups.set(entityId, []);
    }
    entityGroups.get(entityId).push(action);
  }

  // Process groups in parallel, actions within group sequentially
  const groupResults = new Map(); // action.id -> result

  const groupPromises = Array.from(entityGroups.entries()).map(async ([_entityId, groupActions]) => {
    for (const action of groupActions) {
      try {
        const result = await syncSingleAction(action);
        groupResults.set(action.id, result);

        if (result.status === 'auth_error') {
          break; // Stop this group — auth expired
        }
      } catch (err) {
        groupResults.set(action.id, { status: 'error', error: err.message });
        break; // Network error — stop this group
      }
    }
  });

  await Promise.all(groupPromises);

  // Return results in the same order as input actions
  return actions.map(a => groupResults.get(a.id) || { status: 'error', error: 'No result' });
}

// ── Initialization ───────────────────────────────────────────────────────────

let initialized = false;
let syncIntervalId = null;
const SYNC_INTERVAL_MS = 30000; // 30 seconds

export function initSyncEngine() {
  if (initialized) return;
  initialized = true;

  // Listen for online/offline events
  window.addEventListener('online', async () => {
    const reachable = await checkBackendReachability();
    if (reachable) {
      console.log('[SyncEngine] Backend reachable — flushing pending actions');
      // Small delay to let network stabilize
      setTimeout(() => syncPendingActions(), 500);
    } else {
      console.log('[SyncEngine] Browser reports online but backend not reachable — pausing sync');
      setSyncStatus('idle');
    }
  });

  window.addEventListener('offline', () => {
    console.log('[SyncEngine] Gone offline — pausing sync');
    setSyncStatus('idle');
  });

  // Periodic sync when backend is reachable
  syncIntervalId = setInterval(() => {
    if (isBackendReachable() && !syncing) {
      syncPendingActions();
    }
  }, SYNC_INTERVAL_MS);

  // Initial sync if backend is reachable
  if (isBackendReachable()) {
    setTimeout(() => syncPendingActions(), 1000);
  }

  // Initial pending count
  refreshPendingCount();
}

export function stopSyncEngine() {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
  initialized = false;
}

// ── Dedup helper ─────────────────────────────────────────────────────────────

export async function isDuplicateRequest(requestId) {
  if (!requestId) return false;
  const existing = await getPendingActionByRequestId(requestId);
  return !!existing;
}
