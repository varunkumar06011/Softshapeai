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

    // Try bulk sync first (more efficient, handles per-entity ordering server-side)
    let results;
    try {
      results = await bulkSync(actions);
    } catch (bulkErr) {
      console.warn('[SyncEngine] Bulk sync failed, falling back to individual sync:', bulkErr.message);
      // Fallback: sync individually, grouped by entity
      results = await syncIndividually(actions);
    }

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
        }
        if (action.actionType === 'create-order' || action.actionType === 'update-items') {
          markKitchenItemsSynced(action.body?.tableId || action.entityId, action.requestId).catch(() => {});
        }
        succeeded++;
      } else if (result.status === 'conflict') {
        // Conflict — use conflictResolver to determine policy
        const resolution = resolveConflict(action, result);
        await updatePendingAction(action.id, {
          status: resolution.resolution === 'skip' ? 'synced' : 'conflict',
          lastError: resolution.message,
          attempts: (action.attempts || 0) + 1,
        });
        if (resolution.resolution === 'skip') {
          await removePendingAction(action.id);
          clearConflict(action.id);
          if (action.actionType === 'settle') {
            finalizeSettlementAudit(action.requestId, { status: 'skipped' });
          }
          succeeded++;
        } else {
          // Store conflict for UI surfacing
          addConflict({
            actionId: action.id,
            requestId: action.requestId,
            actionType: action.actionType,
            ...resolution,
          });
          if (action.actionType === 'settle') {
            finalizeSettlementAudit(action.requestId, { status: 'conflict', error: resolution.message });
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
