// ─────────────────────────────────────────────────────────────────────────────
// kotQueue.js — Captain KOT resend after a WiFi drop
// ─────────────────────────────────────────────────────────────────────────────
// When a KOT send fails (WiFi dead/weak), it is saved to localStorage and
// resent every 5 seconds — but only for AUTO_SEND_WINDOW_MS. After that it is
// never sent behind the captain's back: the captain sees "KOT NOT SENT" and
// sends it again or discards it.
//
// Duplicates are decided by the billing PC, not guessed here. Every resend
// carries the KOT's first-attempt time; if the cashier (or anyone) added the
// same food to the table since, the PC refuses it with POSSIBLE_DUPLICATE and
// the captain chooses: discard, send only the new items, or send anyway.
// A resend of a KOT that already reached the PC (reply lost) returns the
// earlier result — the requestId is the same, so nothing prints twice.
// ─────────────────────────────────────────────────────────────────────────────

import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';

const QUEUE_KEY = 'captain_kot_queue';
const RETRY_INTERVAL_MS = 5000;
export const AUTO_SEND_WINDOW_MS = 2 * 60 * 1000;

let _retryTimer = null;
let _onStatusChange = null; // ({ tableId, captainId, status, message, requestId, result, items }) => void
let _onDuplicateDetected = null; // ({ tableId, tableLabel, captainId, requestId, conflicts, queuedItems }) => void
let _isFlushing = false;

// Functions cannot survive JSON.stringify, so they are never persisted. Handlers
// live in memory only: per-request ones (from enqueueKot) and the app-level
// default (from setQueueCallbacks) which also covers entries restored after a reload.
const _handlers = new Map(); // requestId -> { sendFn, onSuccess }
let _defaultSendFn = null;
const _awaitingDecision = new Set(); // requestIds paused on the duplicate dialog

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

/**
 * Entry: { requestId, tableId, tableLabel, items, apiItems, existingOrderId,
 * activeTable, restaurantId, captainName, captainId, sectionTag,
 * firstAttemptAt } plus in-memory sendFn / onSuccess.
 */
export function enqueueKot(rawEntry) {
  const { sendFn, onSuccess, ...entry } = rawEntry;
  _handlers.set(entry.requestId, { sendFn, onSuccess });
  const queue = _loadQueue();
  // Avoid duplicate entries for the same requestId
  const existing = queue.findIndex(q => q.requestId === entry.requestId);
  if (existing >= 0) {
    queue[existing] = { ...queue[existing], ...entry, retryCount: queue[existing].retryCount || 0 };
  } else {
    queue.push({ ...entry, retryCount: 0, queuedAt: Date.now() });
  }
  _saveQueue(queue);
  _notifyStatusChange(entry, 'queued', 'Sending... will deliver when WiFi returns');
  _ensureRetryLoop();
  return entry.requestId;
}

export function removeFromQueue(requestId) {
  _handlers.delete(requestId);
  _awaitingDecision.delete(requestId);
  const queue = _loadQueue();
  const filtered = queue.filter(q => q.requestId !== requestId);
  _saveQueue(filtered);
  if (filtered.length === 0) _stopRetryLoop();
}

/** Captain answered the duplicate dialog with "Send anyway" / "Send only new items". */
export function sendQueuedKotAnyway(requestId, { onlyMenuItemIds = null } = {}) {
  const queue = _loadQueue();
  const entry = queue.find(q => q.requestId === requestId);
  if (!entry) return false;
  if (onlyMenuItemIds) {
    const keep = new Set(onlyMenuItemIds.map(String));
    entry.apiItems = (entry.apiItems || []).filter(i => keep.has(String(i.menuItemId)));
    entry.items = (entry.items || []).filter(i => keep.has(String(i.id || i.menuItemId)));
  }
  entry.allowDuplicate = true;
  entry.queuedAt = Date.now(); // a fresh decision gets a fresh send window
  _saveQueue(queue);
  _awaitingDecision.delete(requestId);
  _ensureRetryLoop();
  return true;
}

export function getQueuedKots() {
  return _loadQueue();
}

export function hasQueuedKots() {
  return _loadQueue().length > 0;
}

export function clearQueue() {
  _handlers.clear();
  _awaitingDecision.clear();
  _saveQueue([]);
  _stopRetryLoop();
}

export function setQueueCallbacks({ onStatusChange, onDuplicateDetected, sendFn }) {
  _onStatusChange = onStatusChange;
  _onDuplicateDetected = onDuplicateDetected;
  if (sendFn) _defaultSendFn = sendFn;
  // Entries restored from a previous session can now be delivered (or expired).
  if (_defaultSendFn && hasQueuedKots()) _ensureRetryLoop();
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

/** A real answer from the billing PC (not a network failure) — resending won't change it. */
function _isFinalError(err) {
  const status = err?.statusCode || err?.status;
  return !!status && status >= 400 && status < 500 && status !== 408 && status !== 429;
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
    // Process one at a time to avoid parallel sends. Only this outlet's KOTs:
    // a KOT must never reach another outlet's billing PC.
    const outletId = getCurrentRestaurantId();
    const entry = queue.find(q => !_awaitingDecision.has(q.requestId)
      && (!q.restaurantId || !outletId || q.restaurantId === outletId));
    if (!entry) return;
    const handlers = _handlers.get(entry.requestId) || {};
    const sendFn = handlers.sendFn || _defaultSendFn;
    // App hasn't registered handlers yet (fresh load) — wait.
    if (!sendFn) return;

    // Past the auto-send window: never print an old KOT silently.
    if (Date.now() - (entry.queuedAt || Date.now()) > AUTO_SEND_WINDOW_MS) {
      removeFromQueue(entry.requestId);
      _notifyStatusChange(entry, 'failed', `KOT NOT SENT${entry.tableLabel ? ` — Table ${entry.tableLabel}` : ''}`);
      return;
    }

    _notifyStatusChange(entry, 'sending', 'Sending...');

    try {
      const result = await sendFn(entry);
      removeFromQueue(entry.requestId);
      _notifyStatusChange(entry, 'sent', 'KOT Sent ✓', { result, items: entry.items || [] });
      if (handlers.onSuccess) handlers.onSuccess(result);
    } catch (err) {
      if (err?.code === 'POSSIBLE_DUPLICATE') {
        // The billing PC found the same food added to this table since the
        // first attempt. Pause until the captain decides.
        _awaitingDecision.add(entry.requestId);
        _notifyStatusChange(entry, 'awaiting', 'Same items already on this table — choose what to do');
        _onDuplicateDetected?.({
          tableId: entry.tableId,
          tableLabel: entry.tableLabel,
          captainId: entry.captainId,
          requestId: entry.requestId,
          conflicts: err.conflicts || [],
          queuedItems: entry.items || [],
          source: 'queue',
        });
        return;
      }
      if (_isFinalError(err)) {
        removeFromQueue(entry.requestId);
        _notifyStatusChange(entry, 'failed', err.message || 'KOT NOT SENT');
        return;
      }
      // Network failure — keep trying until the window closes.
      const fresh = _loadQueue();
      const stored = fresh.find(q => q.requestId === entry.requestId);
      if (stored) {
        stored.retryCount = (stored.retryCount || 0) + 1;
        _saveQueue(fresh);
        _notifyStatusChange(entry, 'queued', `Sending... (retry ${stored.retryCount})`);
      }
    }
  } finally {
    _isFlushing = false;
  }
}

function _notifyStatusChange(entry, status, message, extra = {}) {
  _onStatusChange?.({ tableId: entry.tableId, captainId: entry.captainId, requestId: entry.requestId, status, message, ...extra });
}

// ── Cleanup on module load (remove stale entries from previous session) ──────
// Entries older than the send window are left for the first flush, which tells
// the captain they were not sent. Very old ones (app closed for long) are dropped.
(function _cleanupStaleEntries() {
  const queue = _loadQueue();
  const fresh = queue.filter(q => Date.now() - (q.queuedAt || 0) < 30 * 60 * 1000);
  if (fresh.length !== queue.length) {
    _saveQueue(fresh);
  }
})();
