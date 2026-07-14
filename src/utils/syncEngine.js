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
  setOrderIdMapping,
  getRealOrderId,
  getAllOrderIdMappings,
  updatePendingActionEntityIds,
  restoreLocalInventory,
} from './offlineDB';
import { API_BASE, getAuthHeaders, isBackendReachable, checkBackendReachability } from '../services/apiConfig';
import { httpFetch } from './httpClient';
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
export async function shouldDeferSyncOnBattery() {
  try {
    if (!navigator.getBattery) return false;
    const battery = await navigator.getBattery();
    return !battery.charging && battery.level < 0.15;
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
let stuckCount = 0;

const statusListeners = new Set();
const stuckActionListeners = new Set();

export function getSyncStatus() {
  return { syncStatus, pendingCount, lastSyncAt, lastError, authExpired, stuckCount };
}

export function getStuckCount() {
  return stuckCount;
}

export function subscribeStuckActions(callback) {
  stuckActionListeners.add(callback);
  callback(stuckCount);
  return () => stuckActionListeners.delete(callback);
}

function notifyStuckActionListeners() {
  stuckActionListeners.forEach(cb => {
    try { cb(stuckCount); } catch (e) { console.debug('[SyncEngine] stuckAction listener error:', e); }
  });
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
    try { cb(status); } catch (e) { console.debug('[SyncEngine] status listener error:', e); }
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
    actions: actions.map(a => {
      const body = { ...a.body };
      // Fix B: Strip preReservedKotNumber for offline-origin orders to avoid
      // @@unique([restaurantId, kotNumber]) violation when two devices sync
      // the same local KOT number. Let the backend allocate its own number.
      // Check both entityId (child actions) and offlineOrderId (create-order actions).
      const isOfflineOrigin = (a.entityId && String(a.entityId).startsWith('offline-')) || a.offlineOrderId;
      if (isOfflineOrigin) {
        delete body.preReservedKotNumber;
      }
      return {
        requestId: a.requestId,
        actionType: a.actionType,
        orderId: a.entityId,
        url: a.url,
        method: a.method,
        body,
        deviceId: a.deviceId || null,
      };
    }),
  };

  const res = await httpFetch(`${API_BASE}/api/orders/offline-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  }, { timeoutMs: 30_000, retries: 1 });

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
  let body = action.body ? { ...action.body } : action.body;
  // Fix B: Strip preReservedKotNumber for offline-origin orders in fallback path too
  const isOfflineOrigin = (action.entityId && String(action.entityId).startsWith('offline-')) || action.offlineOrderId;
  if (isOfflineOrigin && body) {
    delete body.preReservedKotNumber;
  }
  // Append requestId as query param for GET-like endpoints, or into body for POST/PATCH
  if (action.method === 'POST' || action.method === 'PATCH') {
    body = { ...(body || {}), requestId: action.requestId };
  } else {
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}requestId=${encodeURIComponent(action.requestId)}`;
  }

  const res = await httpFetch(`${API_BASE}${url}`, {
    method: action.method,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  }, { timeoutMs: 30_000, retries: 1 });

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
    const allActions = await getPendingActions();
    if (allActions.length === 0) {
      setSyncStatus('idle');
      return;
    }

    // Sort by createdAt to preserve global ordering
    allActions.sort((a, b) => a.createdAt - b.createdAt);

    // Fix A: Dependency-aware batching — partition actions into ready and blocked.
    // Actions with dependsOnOrderId referencing an unresolved offline- ID are held
    // back until their parent create-order action has synced and the real ID is
    // written to orderIdMap in IndexedDB.
    const mappings = await getAllOrderIdMappings();
    const resolvedOfflineIds = new Set(mappings.map(m => m.offlineId));

    const readyActions = [];
    const blockedActions = [];

    for (const action of allActions) {
      if (action.dependsOnOrderId && String(action.dependsOnOrderId).startsWith('offline-')) {
        if (resolvedOfflineIds.has(action.dependsOnOrderId)) {
          // Parent has synced — update this action's entityId to the real ID
          const mapping = mappings.find(m => m.offlineId === action.dependsOnOrderId);
          if (mapping) {
            action.entityId = mapping.realId;
            if (action.body?.orderId === action.dependsOnOrderId) {
              action.body.orderId = mapping.realId;
            }
            if (action.url && action.url.includes(action.dependsOnOrderId)) {
              action.url = action.url.replace(action.dependsOnOrderId, mapping.realId);
            }
            action.dependsOnOrderId = null;
          }
          readyActions.push(action);
        } else {
          blockedActions.push(action);
        }
      } else {
        readyActions.push(action);
      }
    }

    if (readyActions.length === 0) {
      console.log(`[SyncEngine] ${blockedActions.length} action(s) blocked on parent order sync — waiting`);
      setSyncStatus('idle');
      return;
    }

    console.log(`[SyncEngine] Syncing ${readyActions.length} ready action(s), ${blockedActions.length} blocked on parent`);

    // Try bulk sync first (more efficient, handles per-entity ordering server-side)
    let results;
    try {
      results = await bulkSync(readyActions);
    } catch (bulkErr) {
      console.warn('[SyncEngine] Bulk sync failed, falling back to individual sync:', bulkErr.message);
      // Fallback: sync individually, grouped by entity
      results = await syncIndividually(readyActions);
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

    for (let i = 0; i < readyActions.length; i++) {
      const action = readyActions[i];
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
        if (action.actionType === 'settle' || action.actionType === 'quick-settle') {
          finalizeSettlementAudit(action.requestId, { status: result.status });
          if (action.body?.localTxnId) {
            markOfflineTransactionSynced(action.body.localTxnId, result.data || {}).catch(() => {});
          }
        }
        if (action.actionType === 'create-order' || action.actionType === 'update-items') {
          markKitchenItemsSynced(action.body?.tableId || action.entityId, action.requestId).catch(() => {});
        }
        // Fix A: After a successful create-order, store the offline→real ID mapping
        // and update all child actions that were blocked on this offline ID.
        if (action.actionType === 'create-order' && action.offlineOrderId) {
          const realId = result.data?.order?.id || result.data?.id;
          if (realId) {
            await setOrderIdMapping(action.offlineOrderId, realId);
            await updatePendingActionEntityIds(action.offlineOrderId, realId);
            console.log(`[SyncEngine] Mapped ${action.offlineOrderId} → ${realId}, updated child actions`);
          }
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
          if (action.actionType === 'settle' || action.actionType === 'quick-settle') {
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
          if (action.actionType === 'settle' || action.actionType === 'quick-settle') {
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
        const newAttempts = (action.attempts || 0) + 1;
        await updatePendingAction(action.id, {
          status: 'error',
          lastError: result.error,
          attempts: newAttempts,
        });
        if (action.actionType === 'settle' || action.actionType === 'quick-settle') {
          finalizeSettlementAudit(action.requestId, { status: 'error', error: result.error });
        }
        // Fix E: Inventory rollback on permanent failure (5+ attempts)
        if (newAttempts >= 5 && (action.actionType === 'create-order' || action.actionType === 'update-items')) {
          const items = action.body?.items || [];
          for (const item of items) {
            if (item.menuItemId) {
              await restoreLocalInventory(item.menuItemId, item.quantity || 1).catch(() => {});
            }
          }
          await updatePendingAction(action.id, { status: 'failed-permanent' });
          console.warn(`[SyncEngine] Action ${action.requestId} permanently failed after ${newAttempts} attempts — inventory restored`);

          // Cancel orphaned child actions that depend on this failed create-order
          if (action.actionType === 'create-order' && action.offlineOrderId) {
            const allPending = await getPendingActions();
            const children = allPending.filter(a =>
              a.dependsOnOrderId === action.offlineOrderId &&
              a.id !== action.id
            );
            for (const child of children) {
              await updatePendingAction(child.id, { status: 'failed-permanent', lastError: 'Parent order creation failed' });
              console.warn(`[SyncEngine] Child action ${child.requestId} marked failed — parent ${action.offlineOrderId} permanently failed`);
            }
          }
        }
        failed++;
      }
    }

    // Fix A: Second pass — if any create-order succeeded and unblocked child actions,
    // run a second bulk sync with the newly-ready actions.
    const newlyUnblocked = [];
    for (const action of blockedActions) {
      if (!action.dependsOnOrderId) {
        newlyUnblocked.push(action);
        continue;
      }
      const realId = await getRealOrderId(action.dependsOnOrderId);
      if (realId) {
        action.entityId = realId;
        if (action.body?.orderId === action.dependsOnOrderId) {
          action.body.orderId = realId;
        }
        if (action.url && action.url.includes(action.dependsOnOrderId)) {
          action.url = action.url.replace(action.dependsOnOrderId, realId);
        }
        action.dependsOnOrderId = null;
        newlyUnblocked.push(action);
      }
    }

    if (newlyUnblocked.length > 0) {
      console.log(`[SyncEngine] Second pass: syncing ${newlyUnblocked.length} newly-unblocked action(s)`);
      let pass2Results;
      try {
        pass2Results = await bulkSync(newlyUnblocked);
      } catch {
        pass2Results = await syncIndividually(newlyUnblocked);
      }
      const pass2Map = new Map((pass2Results || []).map(r => [r.requestId, r]));
      for (const action of newlyUnblocked) {
        let result = pass2Map.get(action.requestId) || { status: 'error', error: 'No result returned' };
        if (result.statusCode === 409 && result.status !== 'conflict') {
          result = { ...result, status: 'conflict' };
        } else if (result.statusCode === 401 && result.status !== 'auth_error') {
          result = { ...result, status: 'auth_error', error: result.error || 'Authentication expired' };
        }
        if (result.status === 'success' || result.status === 'skipped') {
          await removePendingAction(action.id);
          clearConflict(action.id);
          if (action.actionType === 'settle' && action.body?.localTxnId) {
            markOfflineTransactionSynced(action.body.localTxnId, result.data || {}).catch(() => {});
          }
          succeeded++;
        } else if (result.status === 'conflict') {
          const resolution = resolveConflict(action, result);
          const autoResolved = resolution.resolution === 'skip' || resolution.resolution === 'adopt_server';
          await updatePendingAction(action.id, {
            status: autoResolved ? 'synced' : 'conflict',
            lastError: resolution.message,
            attempts: (action.attempts || 0) + 1,
          });
          if (autoResolved) {
            await removePendingAction(action.id);
            succeeded++;
          } else {
            addConflict({ actionId: action.id, requestId: action.requestId, actionType: action.actionType, ...resolution });
            hadConflict = true;
            failed++;
          }
        } else if (result.status === 'auth_error') {
          hadAuthError = true;
          await updatePendingAction(action.id, { status: 'auth_error', lastError: result.error, attempts: (action.attempts || 0) + 1 });
          failed++;
          break;
        } else {
          await updatePendingAction(action.id, { status: 'error', lastError: result.error, attempts: (action.attempts || 0) + 1 });
          failed++;
        }
      }
    }

    // Fix D: Detect stuck actions — status 'error' with 3+ attempts and older than 5 minutes
    const allRemaining = await getPendingActions();
    const stuck = allRemaining.filter(a =>
      (a.status === 'error' || a.status === 'failed-permanent') &&
      (a.attempts || 0) >= 3 &&
      a.createdAt < Date.now() - 5 * 60 * 1000
    );
    if (stuck.length !== stuckCount) {
      stuckCount = stuck.length;
      notifyStuckActionListeners();
      if (stuckCount > 0) {
        console.warn(`[SyncEngine] ${stuckCount} action(s) stuck (3+ failed attempts, 5+ min old)`);
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
