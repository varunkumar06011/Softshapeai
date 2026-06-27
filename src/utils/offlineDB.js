const DB_NAME = 'softshape-offline';
const DB_VERSION = 2;

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
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── pendingActions ──────────────────────────────────────────────────────────

export async function addPendingAction(action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingActions', 'readwrite');
    tx.objectStore('pendingActions').add({
      ...action,
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

export async function getPendingCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingActions', 'readonly');
    const req = tx.objectStore('pendingActions').count();
    req.onsuccess = () => resolve(req.result);
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
