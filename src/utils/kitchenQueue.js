import {
  addKitchenQueueItem,
  getKitchenQueueItems,
  updateKitchenQueueItem,
  removeKitchenQueueItem,
  pruneKitchenQueue,
} from './offlineDB';
import { isBackendReachable } from '../services/apiConfig';

/**
 * Enqueue KOT items locally when the kitchen/KDS backend is unreachable.
 * The kitchen display can still show these items from IndexedDB.
 */
export async function queueKitchenItems({ orderId, tableId, tableNumber, items, requestId, deviceId }) {
  if (!items || items.length === 0) return [];
  const localIds = [];
  for (const item of items) {
    const id = await addKitchenQueueItem({
      orderId,
      tableId,
      tableNumber,
      requestId,
      deviceId,
      name: item.name,
      quantity: item.quantity,
      notes: item.notes || null,
      menuType: item.menuType || 'FOOD',
      status: 'pending',
    });
    localIds.push(id);
  }
  return localIds;
}

/**
 * Load pending kitchen queue items for display.
 */
export async function loadKitchenQueue() {
  return getKitchenQueueItems({ status: 'pending' });
}

/**
 * Mark a kitchen queue item as done (served/prepared).
 */
export async function markKitchenItemDone(localId) {
  return updateKitchenQueueItem(localId, { status: 'done' });
}

/**
 * Mark kitchen queue items as synced once the backend confirms the KOT.
 */
export async function markKitchenItemsSynced(orderId, requestId) {
  const items = await getKitchenQueueItems({ orderId, status: 'pending' });
  for (const item of items) {
    if (!requestId || item.requestId === requestId) {
      await updateKitchenQueueItem(item.localId, { status: 'synced', synced: true });
    }
  }
}

/**
 * Remove synced/cancelled items older than the retention window.
 */
export async function cleanupKitchenQueue() {
  return pruneKitchenQueue();
}

/**
 * Returns true if the kitchen queue should be used as the KDS fallback.
 */
export function shouldUseKitchenQueueFallback() {
  return !isBackendReachable();
}
