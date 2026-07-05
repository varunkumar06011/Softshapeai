// ─────────────────────────────────────────────────────────────────────────────
// Offline DB — IndexedDB wrapper for offline action queueing and print jobs
// ─────────────────────────────────────────────────────────────────────────────
// Manages persistent storage for offline-first functionality using IndexedDB:
//
// Object stores:
//   - pendingActions: queued API actions (KOT, order updates, settlements)
//     replayed by syncEngine when connectivity is restored
//   - offlinePrintJobs: queued print jobs (KOT, receipts) printed when
//     printer or backend becomes available
//
// Key functions:
//   - addPendingAction(action): enqueue an offline action
//   - getPendingActions(): retrieve all queued actions
//   - removePendingAction(id): dequeue after successful sync
//   - updatePendingAction(id, updates): update status/retry count
//   - getPendingCount(): quick count for UI badge
//   - pruneOldPendingActions(maxAgeMs): cleanup stale actions
//   - addOfflinePrintJob(job) / getOfflinePrintJobs() / updateOfflinePrintJob()
//   - getLocalPrinterMapping() / getPrintAgentUrl(): printer config
//   - setSyncMeta(key, value) / getSyncMeta(key): sync metadata
//
// DB schema versioned (v2) with upgrade migration support.
// ─────────────────────────────────────────────────────────────────────────────
import { getDeviceId } from './deviceId';

const DB_NAME = 'softshape-offline';
const DB_VERSION = 4;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const oldVersion = e.oldVersion;

      // v1 stores
      if (!db.objectStoreNames.contains('pendingActions')) {
        const store = db.createObjectStore('pendingActions', { keyPath: 'id', autoIncrement: true });
        store.createIndex('entityId', 'entityId', { unique: false });
        store.createIndex('requestId', 'requestId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('actionType', 'actionType', { unique: false });
      } else if (oldVersion < 2) {
        // Upgrade existing store with indexes
        const store = e.target.transaction.objectStore('pendingActions');
        if (!store.indexNames.contains('entityId')) store.createIndex('entityId', 'entityId', { unique: false });
        if (!store.indexNames.contains('requestId')) store.createIndex('requestId', 'requestId', { unique: false });
        if (!store.indexNames.contains('status')) store.createIndex('status', 'status', { unique: false });
        if (!store.indexNames.contains('actionType')) store.createIndex('actionType', 'actionType', { unique: false });
      }

      if (!db.objectStoreNames.contains('menuCache')) {
        db.createObjectStore('menuCache', { keyPath: 'restaurantId' });
      }

      if (!db.objectStoreNames.contains('tableCache')) {
        db.createObjectStore('tableCache', { keyPath: 'restaurantId' });
      }

      // v2 stores
      if (!db.objectStoreNames.contains('offlineTransactions')) {
        const store = db.createObjectStore('offlineTransactions', { keyPath: 'localId' });
        store.createIndex('orderId', 'orderId', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }

      if (!db.objectStoreNames.contains('offlineTables')) {
        db.createObjectStore('offlineTables', { keyPath: 'tableId' });
      }

      if (!db.objectStoreNames.contains('offlinePrintJobs')) {
        const store = db.createObjectStore('offlinePrintJobs', { keyPath: 'id', autoIncrement: true });
        store.createIndex('orderId', 'orderId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains('authCache')) {
        db.createObjectStore('authCache', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('syncMeta')) {
        db.createObjectStore('syncMeta', { keyPath: 'key' });
      }

      // v3 stores
      if (!db.objectStoreNames.contains('settlementAuditLog')) {
        const store = db.createObjectStore('settlementAuditLog', { keyPath: 'localId', autoIncrement: true });
        store.createIndex('orderId', 'orderId', { unique: false });
        store.createIndex('requestId', 'requestId', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }

      // v4 stores — offline kitchen queue for KDS outage fallback
      if (!db.objectStoreNames.contains('kitchenQueue')) {
        const store = db.createObjectStore('kitchenQueue', { keyPath: 'localId', autoIncrement: true });
        store.createIndex('orderId', 'orderId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── pendingActions ──────────────────────────────────────────────────────────

const MAX_PENDING_ACTIONS = 200;

export async function getPendingCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingActions', 'readonly');
    const req = tx.objectStore('pendingActions').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addPendingAction(action) {
  const count = await getPendingCount();
  if (count >= MAX_PENDING_ACTIONS) {
    const err = new Error(`Offline queue is full (${MAX_PENDING_ACTIONS} actions). Please connect to the internet to sync before taking more orders.`);
    err.code = 'QUEUE_FULL';
    throw err;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingActions', 'readwrite');
    tx.objectStore('pendingActions').add({
      ...action,
      deviceId: action.deviceId || getDeviceId(),
      status: action.status || 'pending',
      createdAt: action.createdAt || Date.now(),
      attempts: 0,
      lastError: null,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingActions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingActions', 'readonly');
    const req = tx.objectStore('pendingActions').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingActionsByEntity(entityId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingActions', 'readonly');
    const idx = tx.objectStore('pendingActions').index('entityId');
    const req = idx.getAll(entityId);
    req.onsuccess = () => {
      const actions = req.result;
      actions.sort((a, b) => a.createdAt - b.createdAt);
      resolve(actions);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function updatePendingAction(id, updates) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingActions', 'readwrite');
    const store = tx.objectStore('pendingActions');
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) { resolve(null); return; }
      store.put({ ...existing, ...updates });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removePendingAction(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingActions', 'readwrite');
    tx.objectStore('pendingActions').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingActionByRequestId(requestId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingActions', 'readonly');
    const idx = tx.objectStore('pendingActions').index('requestId');
    const req = idx.get(requestId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function pruneOldPendingActions(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingActions', 'readwrite');
    const store = tx.objectStore('pendingActions');
    const cutoff = Date.now() - maxAgeMs;
    const req = store.getAll();
    req.onsuccess = () => {
      const toDelete = req.result.filter(a => a.createdAt < cutoff && a.status === 'synced');
      for (const action of toDelete) {
        store.delete(action.id);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── menuCache ───────────────────────────────────────────────────────────────

export async function cacheMenu(restaurantId, menuItems) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('menuCache', 'readwrite');
    tx.objectStore('menuCache').put({ restaurantId, menuItems, cachedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedMenu(restaurantId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('menuCache', 'readonly');
    const req = tx.objectStore('menuCache').get(restaurantId);
    req.onsuccess = () => resolve(req.result?.menuItems || null);
    req.onerror = () => reject(req.error);
  });
}

// ── tableCache ──────────────────────────────────────────────────────────────

export async function cacheTables(restaurantId, tables) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tableCache', 'readwrite');
    tx.objectStore('tableCache').put({ restaurantId, tables, cachedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedTables(restaurantId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tableCache', 'readonly');
    const req = tx.objectStore('tableCache').get(restaurantId);
    req.onsuccess = () => resolve(req.result?.tables || null);
    req.onerror = () => reject(req.error);
  });
}

// ── offlineTransactions ─────────────────────────────────────────────────────

export async function addOfflineTransaction(txn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineTransactions', 'readwrite');
    tx.objectStore('offlineTransactions').put({
      ...txn,
      synced: false,
      createdAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOfflineTransactions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineTransactions', 'readonly');
    const req = tx.objectStore('offlineTransactions').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function markOfflineTransactionSynced(localId, serverData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineTransactions', 'readwrite');
    const store = tx.objectStore('offlineTransactions');
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) return;
      store.put({ ...existing, synced: true, serverData, syncedAt: Date.now() });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function pruneOfflineTransactions(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineTransactions', 'readwrite');
    const store = tx.objectStore('offlineTransactions');
    const cutoff = Date.now() - maxAgeMs;
    const req = store.getAll();
    req.onsuccess = () => {
      const toDelete = req.result.filter(t => t.synced && t.createdAt < cutoff);
      for (const txn of toDelete) {
        store.delete(txn.localId);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── offlineTables ───────────────────────────────────────────────────────────

export async function cacheOfflineTable(table) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineTables', 'readwrite');
    tx.objectStore('offlineTables').put({ ...table, cachedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOfflineTables() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineTables', 'readonly');
    const req = tx.objectStore('offlineTables').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── offlinePrintJobs ────────────────────────────────────────────────────────

export async function addOfflinePrintJob(job) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlinePrintJobs', 'readwrite');
    tx.objectStore('offlinePrintJobs').add({
      ...job,
      status: 'pending',
      createdAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOfflinePrintJobs() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlinePrintJobs', 'readonly');
    const req = tx.objectStore('offlinePrintJobs').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function updateOfflinePrintJob(id, updates) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlinePrintJobs', 'readwrite');
    const store = tx.objectStore('offlinePrintJobs');
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) return;
      store.put({ ...existing, ...updates });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── authCache ───────────────────────────────────────────────────────────────

export async function cacheAuth(key, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('authCache', 'readwrite');
    tx.objectStore('authCache').put({ key, data, cachedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedAuth(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('authCache', 'readonly');
    const req = tx.objectStore('authCache').get(key);
    req.onsuccess = () => resolve(req.result?.data || null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearCachedAuth(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('authCache', 'readwrite');
    tx.objectStore('authCache').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── syncMeta ────────────────────────────────────────────────────────────────

export async function getSyncMeta(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncMeta', 'readonly');
    const req = tx.objectStore('syncMeta').get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function setSyncMeta(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncMeta', 'readwrite');
    tx.objectStore('syncMeta').put({ key, value, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── settlement guards ───────────────────────────────────────────────────────
// Persisted across app restarts so a queued offline settlement cannot be
// double-submitted and settled tables cannot be resurrected by stale sync events.

const SETTLED_ORDERS_KEY = 'settledOrderIds';
const SETTLED_TABLES_KEY = 'settledTableIds';

export async function getSettledOrderIds() {
  const value = await getSyncMeta(SETTLED_ORDERS_KEY);
  return Array.isArray(value) ? new Set(value) : new Set();
}

export async function setSettledOrderIds(ids) {
  return setSyncMeta(SETTLED_ORDERS_KEY, Array.from(ids));
}

export async function clearSettledOrderId(id) {
  const ids = await getSettledOrderIds();
  ids.delete(id);
  return setSettledOrderIds(ids);
}

export async function getSettledTableIds() {
  const value = await getSyncMeta(SETTLED_TABLES_KEY);
  return Array.isArray(value) ? new Set(value) : new Set();
}

export async function setSettledTableIds(ids) {
  return setSyncMeta(SETTLED_TABLES_KEY, Array.from(ids));
}

export async function clearSettledTableId(id) {
  const ids = await getSettledTableIds();
  ids.delete(id);
  return setSettledTableIds(ids);
}

export async function clearAllSettlementGuards() {
  await setSyncMeta(SETTLED_ORDERS_KEY, []);
  await setSyncMeta(SETTLED_TABLES_KEY, []);
}

// ── settlement audit log ────────────────────────────────────────────────────

export async function addSettlementAuditLog(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settlementAuditLog', 'readwrite');
    const store = tx.objectStore('settlementAuditLog');
    const request = store.add({
      ...entry,
      createdAt: entry.createdAt || Date.now(),
      synced: entry.synced || false,
    });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function updateSettlementAuditLog(localId, updates) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settlementAuditLog', 'readwrite');
    const store = tx.objectStore('settlementAuditLog');
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        resolve(null);
        return;
      }
      const request = store.put({ ...existing, ...updates, localId });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function getSettlementAuditLogs(filter = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settlementAuditLog', 'readonly');
    const store = tx.objectStore('settlementAuditLog');
    const results = [];
    const request = store.openCursor();
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const entry = cursor.value;
        if (
          (!filter.orderId || entry.orderId === filter.orderId) &&
          (!filter.requestId || entry.requestId === filter.requestId) &&
          (filter.synced === undefined || entry.synced === filter.synced)
        ) {
          results.push(entry);
        }
        cursor.continue();
      } else {
        resolve(results.sort((a, b) => b.createdAt - a.createdAt));
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// ── kitchen queue (KDS outage fallback) ────────────────────────────────────

export async function addKitchenQueueItem(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kitchenQueue', 'readwrite');
    const store = tx.objectStore('kitchenQueue');
    const request = store.add({
      ...item,
      status: item.status || 'pending',
      createdAt: item.createdAt || Date.now(),
      updatedAt: item.updatedAt || Date.now(),
    });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getKitchenQueueItems(filter = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kitchenQueue', 'readonly');
    const store = tx.objectStore('kitchenQueue');
    const results = [];
    const request = store.openCursor();
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const entry = cursor.value;
        if (
          (!filter.orderId || entry.orderId === filter.orderId) &&
          (!filter.status || entry.status === filter.status) &&
          (filter.synced === undefined || entry.synced === filter.synced)
        ) {
          results.push(entry);
        }
        cursor.continue();
      } else {
        resolve(results.sort((a, b) => b.createdAt - a.createdAt));
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function updateKitchenQueueItem(localId, updates) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kitchenQueue', 'readwrite');
    const store = tx.objectStore('kitchenQueue');
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        resolve(null);
        return;
      }
      const request = store.put({
        ...existing,
        ...updates,
        updatedAt: Date.now(),
        localId,
      });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function removeKitchenQueueItem(localId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kitchenQueue', 'readwrite');
    const request = tx.objectStore('kitchenQueue').delete(localId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function pruneKitchenQueue(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const db = await openDB();
  const cutoff = Date.now() - maxAgeMs;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kitchenQueue', 'readwrite');
    const store = tx.objectStore('kitchenQueue');
    const request = store.openCursor();
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const entry = cursor.value;
        if (entry.createdAt < cutoff && (entry.status === 'synced' || entry.status === 'cancelled')) {
          cursor.delete();
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// ── local printer config ────────────────────────────────────────────────────
// Stores printer mapping locally for offline-first printing. The backend printer
// config remains authoritative, but a local copy is kept for offline resilience.

const PRINTER_CONFIG_KEY = 'localPrinterConfig';

export async function getLocalPrinterConfig() {
  const value = await getSyncMeta(PRINTER_CONFIG_KEY);
  return value || {};
}

export async function setLocalPrinterConfig(config) {
  return setSyncMeta(PRINTER_CONFIG_KEY, config);
}

export async function getLocalPrinterMapping() {
  const config = await getLocalPrinterConfig();
  return config.mapping || {};
}

export async function setLocalPrinterMapping(mapping) {
  const config = await getLocalPrinterConfig();
  return setLocalPrinterConfig({ ...config, mapping, updatedAt: Date.now() });
}

export async function getPrintAgentUrl() {
  const config = await getLocalPrinterConfig();
  return config.printAgentUrl || 'http://localhost:3100';
}

export async function setPrintAgentUrl(url) {
  const config = await getLocalPrinterConfig();
  return setLocalPrinterConfig({ ...config, printAgentUrl: url, updatedAt: Date.now() });
}

// ── offline KOT number counter ───────────────────────────────────────────────
// Used when backend is unreachable so KOTs can still be printed locally.
// Counter is stored per day in syncMeta and resets at IST midnight to match
// the backend's dailyCounter. The backend uses this as preReservedKotNumber
// when the queued action syncs, so the printed number matches the DB number.
// NOTE: in multi-device offline scenarios, two devices could reserve the same
// local number; this is a rare edge case and accepted for now.

function getIstDateString() {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export async function getNextOfflineKotNumber() {
  const db = await openDB();
  const key = `offlineKotCounter:${getIstDateString()}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncMeta', 'readwrite');
    const store = tx.objectStore('syncMeta');
    const req = store.get(key);
    req.onsuccess = () => {
      const current = req.result?.value || 0;
      const next = current + 1;
      store.put({ key, value: next, updatedAt: Date.now() });
      resolve(next);
    };
    req.onerror = () => reject(req.error);
  });
}
