const DB_NAME = 'softshape-offline';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('pendingActions')) {
        db.createObjectStore('pendingActions', { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('menuCache')) {
        db.createObjectStore('menuCache', { keyPath: 'restaurantId' });
      }

      if (!db.objectStoreNames.contains('tableCache')) {
        db.createObjectStore('tableCache', { keyPath: 'restaurantId' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addPendingAction(action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingActions', 'readwrite');
    tx.objectStore('pendingActions').add({ ...action, createdAt: Date.now() });
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

export async function removePendingAction(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingActions', 'readwrite');
    tx.objectStore('pendingActions').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

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
