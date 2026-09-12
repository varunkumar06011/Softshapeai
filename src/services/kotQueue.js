// ─────────────────────────────────────────────────────────────────────────────
// kotQueue.js — Captain KOT local queue with retry + duplicate detection
// ─────────────────────────────────────────────────────────────────────────────
// When a KOT send fails (WiFi dead/weak), the KOT is saved to localStorage.
// A background loop retries every 5 seconds. Before sending, it checks if the
// table already has an active order on the edge server (cashier may have sent
// it manually). If items match, the queued KOT is discarded (no double food).
// If items differ, the caller is notified to show a confirmation dialog.
//
// This mirrors Petpooja's "syncs with the POS" behavior — the edge server is
// the source of truth, not the phone's local queue.
// ─────────────────────────────────────────────────────────────────────────────

const QUEUE_KEY = 'captain_kot_queue';
const RETRY_INTERVAL_MS = 5000;
const MAX_QUEUE_AGE_MS = 5 * 60 * 1000; // 5 min — after this, surface as error

let _retryTimer = null;
let _onStatusChange = null; // callback: ({ tableId, status, message }) => void
let _onDuplicateDetected = null; // callback: ({ tableId, queuedItems, serverItems }) => void
let _isFlushing = false;

// ── Queue persistence ────────────────────────────────────────────────────────

function _loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function _saveQueue(queue) {
  try {
    if (queue.length > 0) {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } else {
      localStorage.removeItem(QUEUE_KEY);
    }
  } catch { /* non-fatal */ }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function enqueueKot(entry) {
  const queue = _loadQueue();
  // Avoid duplicate entries for the same requestId
  const existing = queue.findIndex(q => q.requestId === entry.requestId);
  if (existing >= 0) {
    queue[existing] = { ...queue[existing], ...entry, retryCount: queue[existing].retryCount || 0 };
  } else {
    queue.push({ ...entry, retryCount: 0, queuedAt: Date.now() });
  }
  _saveQueue(queue);
  _notifyStatusChange(entry.tableId, 'queued', 'Sending... will deliver when connection returns');
  _ensureRetryLoop();
  return entry.requestId;
}

export function removeFromQueue(requestId) {
  const queue = _loadQueue();
  const filtered = queue.filter(q => q.requestId !== requestId);
  _saveQueue(filtered);
  if (filtered.length === 0) _stopRetryLoop();
}

export function getQueuedKots() {
  return _loadQueue();
}

export function hasQueuedKots() {
  return _loadQueue().length > 0;
}

export function setQueueCallbacks({ onStatusChange, onDuplicateDetected }) {
  _onStatusChange = onStatusChange;
  _onDuplicateDetected = onDuplicateDetected;
}

// ── Duplicate detection ──────────────────────────────────────────────────────
// Before sending a queued KOT, check if the table already has an active order
// on the edge server. If items match, discard (cashier already sent it).
// If items differ, notify the caller to show a confirmation dialog.

function _itemsMatch(queuedItems, serverItems) {
  if (!serverItems || serverItems.length === 0) return false;
  // Compare by menuItemId + quantity — notes can differ slightly
  const normalize = (items) => items.map(i => ({
    id: String(i.menuItemId || i.id || ''),
    q: Number(i.quantity || i.q || 1),
  })).sort((a, b) => a.id.localeCompare(b.id));

  const q = normalize(queuedItems);
  const s = normalize(serverItems);
  if (q.length !== s.length) return false;
  return q.every((qi, i) => qi.id === s[i].id && qi.q === s[i].q);
}

function _diffItems(queuedItems, serverItems) {
  // Return items in queue that are NOT in the server order
  const serverIds = new Map();
  for (const s of (serverItems || [])) {
    const sid = String(s.menuItemId || s.id || '');
    serverIds.set(sid, (serverIds.get(sid) || 0) + Number(s.quantity || s.q || 1));
  }
  return queuedItems.filter(qi => {
    const qid = String(qi.menuItemId || qi.id || '');
    const serverQty = serverIds.get(qid) || 0;
    const queueQty = Number(qi.quantity || qi.q || 1);
    return queueQty > serverQty; // item missing or qty is higher on server
  });
}

// ── Retry loop ───────────────────────────────────────────────────────────────

function _ensureRetryLoop() {
  if (_retryTimer) return;
  _retryTimer = setInterval(_flushQueue, RETRY_INTERVAL_MS);
  // Also try immediately
  setTimeout(_flushQueue, 100);
}

function _stopRetryLoop() {
  if (_retryTimer) {
    clearInterval(_retryTimer);
    _retryTimer = null;
  }
}

async function _flushQueue() {
  if (_isFlushing) return;
  const queue = _loadQueue();
  if (queue.length === 0) {
    _stopRetryLoop();
    return;
  }
  _isFlushing = true;
  try {
    // Process one at a time to avoid parallel sends
    const entry = queue[0];
    const age = Date.now() - (entry.queuedAt || Date.now());

    // If queued for >5 min, surface as error — captain should check with kitchen
    if (age > MAX_QUEUE_AGE_MS) {
      _notifyStatusChange(entry.tableId, 'failed', 'KOT could not be delivered — check with kitchen');
      removeFromQueue(entry.requestId);
      return;
    }

    _notifyStatusChange(entry.tableId, 'sending', 'Sending...');

    // Duplicate detection: check if table already has an active order
    if (entry.checkDuplicate && entry.fetchActiveOrder) {
      try {
        const activeOrder = await entry.fetchActiveOrder(entry.tableId);
        if (activeOrder && activeOrder.items && activeOrder.items.length > 0) {
          if (_itemsMatch(entry.items, activeOrder.items)) {
            // Cashier already sent the same items — discard queued KOT
            console.log('[KOT Queue] Table already has matching order — discarding duplicate');
            _notifyStatusChange(entry.tableId, 'discarded', 'KOT was already sent from cashier. Duplicate discarded.');
            removeFromQueue(entry.requestId);
            return;
          }
          // Items differ — check if there are genuinely new items to send
          const newItems = _diffItems(entry.items, activeOrder.items);
          if (newItems.length === 0) {
            // All items already on server — discard
            _notifyStatusChange(entry.tableId, 'discarded', 'All items already on the order. Duplicate discarded.');
            removeFromQueue(entry.requestId);
            return;
          }
          // There are additional items — notify caller to show confirmation
          if (_onDuplicateDetected) {
            _onDuplicateDetected({
              tableId: entry.tableId,
              requestId: entry.requestId,
              queuedItems: entry.items,
              serverItems: activeOrder.items,
              newItems,
              existingOrderId: activeOrder.id,
            });
          }
          // Pause this entry — caller will decide to send or discard
          return;
        }
      } catch (err) {
        // Can't reach edge to check — continue with send attempt
        console.warn('[KOT Queue] Duplicate check failed, proceeding with send:', err.message);
      }
    }

    // Attempt to send
    try {
      const result = await entry.sendFn(entry);
      // Success — remove from queue and notify
      _notifyStatusChange(entry.tableId, 'sent', 'KOT Sent ✓');
      removeFromQueue(entry.requestId);
      if (entry.onSuccess) entry.onSuccess(result);
    } catch (err) {
      // If the order was already created by someone else (e.g., the cashier
      // sent the same items while this KOT was queued for retry), the API
      // returns 409 with existingOrderId. Discard the queued KOT — the
      // kitchen already received the order. Re-sending would create a
      // duplicate KOT print (the kitchen prepares the same food twice).
      if ((err?.statusCode === 409 || err?.status === 409) && err?.existingOrderId) {
        console.log('[KOT Queue] Order already exists (409) — discarding duplicate');
        _notifyStatusChange(entry.tableId, 'discarded', 'KOT was already sent from cashier. Duplicate discarded.');
        removeFromQueue(entry.requestId);
        if (entry.onSuccess) entry.onSuccess({ id: err.existingOrderId, duplicate: true });
        return;
      }
      // Still failing — increment retry count, keep in queue
      entry.retryCount = (entry.retryCount || 0) + 1;
      _saveQueue(queue);
      _notifyStatusChange(entry.tableId, 'queued', `Sending... (retry ${entry.retryCount})`);
    }
  } finally {
    _isFlushing = false;
  }
}

function _notifyStatusChange(tableId, status, message) {
  if (_onStatusChange) {
    _onStatusChange({ tableId, status, message });
  }
}

// ── Cleanup on module load (remove stale entries from previous session) ──────

// Remove entries older than 30 minutes on startup — they're stale
(function _cleanupStaleEntries() {
  const queue = _loadQueue();
  const fresh = queue.filter(q => Date.now() - (q.queuedAt || 0) < 30 * 60 * 1000);
  if (fresh.length !== queue.length) {
    _saveQueue(fresh);
  }
})();
