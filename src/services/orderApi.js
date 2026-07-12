// ─────────────────────────────────────────────────────────────────────────────
// Order API — Order lifecycle API client with offline support and retry logic
// ─────────────────────────────────────────────────────────────────────────────
// The largest frontend service — handles all order-related API calls:
//   - fetchOrders() — list orders with filters (status, date, table)
//   - createOrder() — create a new order
//   - updateOrderStatus() — transition order status (PENDING → CONFIRMED → ...)
//   - addOrderItems() — add items to an existing order
//   - updateOrderItem() — modify an order item (quantity, notes)
//   - removeOrderItem() — remove an item from an order
//   - settleOrder() — settle the bill (creates a transaction)
//   - cancelOrder() — cancel an order
//   - transferOrder() — transfer order to another table
//   - mergeOrders() — merge orders from multiple tables
//
// Offline support:
//   - When backend is unreachable, actions are queued in IndexedDB (offlineDB)
//   - Pending actions are synced when connectivity is restored (syncEngine)
//   - Offline transactions and print jobs are also queued
//
// Retry logic:
//   - Uses withRetry wrapper with exponential backoff
//   - Request IDs generated for idempotency
// ─────────────────────────────────────────────────────────────────────────────

import { apiUrl, getAuthHeaders, isBackendReachable, apiFetch } from "./apiConfig";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";
import { withRetry, RETRY_CONFIG, logCriticalError } from "../utils/resilience";
import { authService } from "./authService";
import {
  addPendingAction,
  addOfflineTransaction,
  addOfflinePrintJob,
  getNextOfflineKotNumber,
} from "../utils/offlineDB";
import { queueKitchenItems } from "../utils/kitchenQueue";
import { printLocal } from "../utils/printOffline";
import { getRestaurantName } from "../utils/getRestaurantConfig";

// Generate a unique request ID for idempotency tracking
function generateRequestId() {
  return (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36));
}

async function parseResponse(res) {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let body = null;
    try {
      body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    const err = new Error(message);
    err.status = res.status;
    err.statusCode = res.status;
    if (body?.existingOrderId) err.existingOrderId = body.existingOrderId;
    if (body?.missing) err.missing = body.missing;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

async function printOfflineKot({ tableId, tableNumber, items, captainName, kotNumber, requestId }) {
  if (!items || items.length === 0) return;
  try {
    const restaurantName = getRestaurantName();
    const foodItems = items.filter(i => (i.menuType || 'FOOD') !== 'LIQUOR');
    const liquorItems = items.filter(i => (i.menuType || 'FOOD') === 'LIQUOR');

    if (foodItems.length > 0) {
      await printLocal({
        jobType: 'KOT',
        data: {
          orderId: tableId,
          tableNumber: tableNumber || tableId,
          items: foodItems,
          kotNumber,
          restaurantName,
          captainName,
          requestId,
        },
      });
    }

    if (liquorItems.length > 0) {
      await printLocal({
        jobType: 'BAR_KOT',
        data: {
          orderId: tableId,
          tableNumber: tableNumber || tableId,
          items: liquorItems,
          kotNumber,
          restaurantName,
          captainName,
          requestId,
        },
      });
    }
  } catch (err) {
    console.error('[Offline] Local KOT print failed:', err);
  }
}

export function toOrderItems(items) {
  return (items || [])
    .map((item) => ({
      menuItemId: String(item.id || item.menuItemId || ''),  // never fall back to name
      name: item.name || item.n,
      price: Number(item.p ?? item.price ?? 0),
      quantity: Number(item.q ?? item.quantity ?? 1),
      notes: item.notes || null,
      menuType: ['LIQUOR', 'BAR'].includes(String(item.menuType || 'FOOD').toUpperCase()) ? 'LIQUOR' : 'FOOD',
    }))
    .filter(i => !!i.menuItemId);  // drop items with no valid DB ID
}

export async function reserveKotNumber(requestId = null) {
  // Fast path: if backend is known unreachable, skip API and use local counter instantly.
  // This avoids a 10s timeout wait when internet is completely down.
  if (!isBackendReachable()) {
    const kotNumber = await getNextOfflineKotNumber();
    return { kotNumber, offline: true };
  }
  // Try API first — isBackendReachable() can be falsely negative on slow mobile networks.
  // The catch block handles the offline fallback.
  try {
    const body = {};
    if (requestId) body.requestId = requestId;
    return await apiFetch('/api/orders/reserve-kot-number', { method: 'POST', timeout: 3000, body: JSON.stringify(body) });
  } catch (err) {
    // If the API failed because we went offline mid-call, fall back to local number
    if (!isBackendReachable()) {
      const kotNumber = await getNextOfflineKotNumber();
      return { kotNumber, offline: true };
    }
    throw err;
  }
}

export async function createOrder({ tableId, tableNumber, items, restaurantId = getCurrentRestaurantId(), requestId = null, captainName = null, isExtraTable = false, sectionTag = null, platform = null, timeoutMs = 12000, localPrinted = false, preReservedKotNumber = null, kotEventIds = null }) {
  const orderData = { tableId, tableNumber, restaurantId, items: toOrderItems(items) };
  if (requestId) orderData.requestId = requestId;
  if (captainName) orderData.captainName = captainName;
  if (isExtraTable) { orderData.isExtraTable = true; }
  if (sectionTag) { orderData.sectionTag = sectionTag; }
  if (platform) { orderData.platform = platform; }
  if (localPrinted) { orderData.localPrinted = true; }
  if (preReservedKotNumber != null) { orderData.preReservedKotNumber = preReservedKotNumber; }
  if (kotEventIds) { orderData.kotEventIds = kotEventIds; }

  // Fast path: if backend is known unreachable, skip API and queue offline instantly.
  // This avoids 45s × 3 retries = 135s of waiting when internet is completely down.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing to offline queue');
    const offlineRequestId = requestId || generateRequestId();
    const offlineOrderId = `offline-${Date.now()}`;
    orderData.requestId = offlineRequestId;
    await addPendingAction({
      requestId: offlineRequestId,
      entityId: tableId,
      entityType: 'order',
      actionType: 'create-order',
      url: '/api/orders',
      method: 'POST',
      body: orderData,
      offlineOrderId,
    });
    const kitchenItems = orderData.items.filter(i => (i.menuType || 'FOOD') !== 'LIQUOR');
    await queueKitchenItems({
      orderId: offlineOrderId,
      tableId,
      tableNumber: orderData.tableNumber || tableId,
      items: kitchenItems,
      requestId: offlineRequestId,
    }).catch(err => console.error('[Offline] Kitchen queue failed:', err.message));
    if (import.meta.env.DEV) {
      console.log('[Offline] Order fast-pathed to offline queue:', orderData.tableNumber || orderData.tableId, 'offlineId:', offlineOrderId);
    }
    return { id: offlineOrderId, ...orderData, offline: true };
  }

  // Try API first — isBackendReachable() can be falsely negative on slow mobile networks.
  // Only fall back to offline queue if the API call actually fails after retries.
  try {
    return await withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(apiUrl("/api/orders"), {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authService.getAuthHeader() },
            body: JSON.stringify(orderData),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          return parseResponse(res);
        } catch (error) {
          clearTimeout(timeoutId);
          if (error.name === 'AbortError') {
            throw new Error("KOT request timed out — please retry");
          }
          throw error;
        }
      },
      RETRY_CONFIG.KOT
    );
  } catch (apiErr) {
    // API call failed after retries — fall back to offline queue if backend is unreachable
    if (!isBackendReachable()) {
      console.warn('[Offline] API failed, queuing order for sync:', apiErr.message);
      const offlineRequestId = requestId || generateRequestId();
      const offlineOrderId = `offline-${Date.now()}`;
      orderData.requestId = offlineRequestId;
      await addPendingAction({
        requestId: offlineRequestId,
        entityId: tableId,
        entityType: 'order',
        actionType: 'create-order',
        url: '/api/orders',
        method: 'POST',
        body: orderData,
        offlineOrderId,
      });
      const kitchenItems = orderData.items.filter(i => (i.menuType || 'FOOD') !== 'LIQUOR');
      await queueKitchenItems({
        orderId: offlineOrderId,
        tableId,
        tableNumber: orderData.tableNumber || tableId,
        items: kitchenItems,
        requestId: offlineRequestId,
      }).catch(err => console.error('[Offline] Kitchen queue failed:', err.message));
      if (import.meta.env.DEV) {
        console.log('[Offline] Order queued for sync:', orderData.tableNumber || orderData.tableId, 'offlineId:', offlineOrderId);
      }
      return { id: offlineOrderId, ...orderData, offline: true };
    }
    throw apiErr;
  }
}

export async function fetchOrders({ restaurantId = getCurrentRestaurantId(), status } = {}) {
  const qs = new URLSearchParams({ restaurantId });
  if (status) qs.set("status", status);
  const res = await fetch(apiUrl(`/api/orders?${qs.toString()}`), {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache", ...authService.getAuthHeader() },
  });
  return parseResponse(res);
}

export async function fetchTableOrder(tableId) {
  const res = await fetch(apiUrl(`/api/orders/table/${tableId}`), {
    cache: "no-store",
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(10000),
  });
  return parseResponse(res);
}

export async function updateOrderItems(orderId, items, requestId = null, captainName = null, isExtraTable = false, tableNumber = null, lastUpdatedAt = null, timeoutMs = 12000, localPrinted = false, preReservedKotNumber = null, kotEventIds = null) {
  const body = { items: toOrderItems(items) };
  if (requestId) body.requestId = requestId;
  if (captainName) body.captainName = captainName;
  if (isExtraTable) { body.isExtraTable = true; }
  if (tableNumber) { body.tableNumber = tableNumber; }
  if (lastUpdatedAt) { body.lastUpdatedAt = lastUpdatedAt; }
  if (localPrinted) { body.localPrinted = true; }
  if (preReservedKotNumber != null) { body.preReservedKotNumber = preReservedKotNumber; }
  if (kotEventIds) { body.kotEventIds = kotEventIds; }

  // Fast path: if backend is known unreachable, skip API and queue offline instantly.
  // This avoids 45s × 3 retries = 135s of waiting when internet is completely down.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing update to offline queue');
    const offlineRequestId = requestId || generateRequestId();
    body.requestId = offlineRequestId;
    await addPendingAction({
      requestId: offlineRequestId,
      entityId: orderId,
      entityType: 'order',
      actionType: 'update-items',
      url: `/api/orders/${orderId}/items`,
      method: 'PATCH',
      body,
      dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
    });
    const kitchenItems = body.items.filter(i => (i.menuType || 'FOOD') !== 'LIQUOR');
    await queueKitchenItems({
      orderId,
      tableId: orderId,
      tableNumber: tableNumber || orderId,
      items: kitchenItems,
      requestId: offlineRequestId,
    }).catch(err => console.error('[Offline] Kitchen queue failed:', err.message));
    if (import.meta.env.DEV) {
      console.log('[Offline] Update items fast-pathed to offline queue:', orderId);
    }
    return { id: orderId, offline: true, order: { id: orderId, items: body.items } };
  }

  // Try API first — isBackendReachable() can be falsely negative on slow mobile networks.
  // Only fall back to offline queue if the API call actually fails after retries.
  try {
    return await withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const res = await fetch(apiUrl(`/api/orders/${orderId}/items`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (res.status === 409) {
            const data = await res.json().catch(() => ({}));
            const err = new Error(data.error || "Order was modified by another user. Please refresh and try again.");
            err.status = 409;
            err.serverUpdatedAt = data.serverUpdatedAt;
            throw err;
          }
          return parseResponse(res);
        } catch (error) {
          clearTimeout(timeoutId);
          if (error.name === 'AbortError') {
            throw new Error("KOT request timed out — please retry");
          }
          throw error;
        }
      },
      { ...RETRY_CONFIG.KOT, shouldRetry: (err) => err.status !== 409 }
    );
  } catch (apiErr) {
    // API call failed after retries — fall back to offline queue if backend is unreachable
    if (!isBackendReachable()) {
      console.warn('[Offline] API failed, queuing update for sync:', apiErr.message);
      const offlineRequestId = requestId || generateRequestId();
      body.requestId = offlineRequestId;
      await addPendingAction({
        requestId: offlineRequestId,
        entityId: orderId,
        entityType: 'order',
        actionType: 'update-items',
        url: `/api/orders/${orderId}/items`,
        method: 'PATCH',
        body,
        dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
      });
      const kitchenItems = body.items.filter(i => (i.menuType || 'FOOD') !== 'LIQUOR');
      await queueKitchenItems({
        orderId,
        tableId: orderId,
        tableNumber: tableNumber || orderId,
        items: kitchenItems,
        requestId: offlineRequestId,
      }).catch(err => console.error('[Offline] Kitchen queue failed:', err.message));
      if (import.meta.env.DEV) {
        console.log('[Offline] Update order items queued for sync:', orderId);
      }
      return { id: orderId, offline: true, order: { id: orderId, items: body.items } };
    }
    throw apiErr;
  }
}

export async function updateOrderStatus(orderId, status) {
  return withRetry(
    async () => {
      const res = await fetch(apiUrl(`/api/orders/${orderId}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ status }),
      });
      return parseResponse(res);
    },
    RETRY_CONFIG.TABLE_UPDATE
  );
}

export async function requestBilling(orderId) {
  // Fast path: if backend is known unreachable, queue instantly.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing request-billing');
    const requestId = generateRequestId();
    await addPendingAction({
      requestId,
      entityId: orderId,
      entityType: 'order',
      actionType: 'request-billing',
      url: `/api/orders/${orderId}/request-billing`,
      method: 'POST',
      body: {},
      dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
    });
    return { offline: true };
  }
<<<<<<< HEAD
  // Try API first — isBackendReachable() can be falsely negative on slow networks.
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(apiUrl(`/api/orders/${orderId}/request-billing`), {
        method: "POST",
        headers: getAuthHeaders(),
        signal: controller.signal,
      });
      return parseResponse(res);
    } finally { clearTimeout(timeoutId); }
  } catch (err) {
    if (!isBackendReachable()) {
      const requestId = generateRequestId();
      await addPendingAction({
        requestId,
        entityId: orderId,
        entityType: 'order',
        actionType: 'request-billing',
        url: `/api/orders/${orderId}/request-billing`,
        method: 'POST',
        body: {},
        dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
      });
      return { offline: true };
    }
    throw err;
  }
=======
  const res = await fetch(apiUrl(`/api/orders/${orderId}/request-billing`), {
    method: "POST",
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(10000),
  });
  return parseResponse(res);
>>>>>>> e6031be (start of heian era)
}

export async function markOrderPaid(orderId, paymentMethod = 'CASH') {
  // Fast path: if backend is known unreachable, queue instantly.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing mark-paid');
    const requestId = generateRequestId();
    await addPendingAction({
      requestId,
      entityId: orderId,
      entityType: 'order',
      actionType: 'mark-paid',
      url: `/api/orders/${orderId}/pay`,
      method: 'POST',
      body: { paymentMethod, requestId },
      dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
    });
    return { offline: true };
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(apiUrl(`/api/orders/${orderId}/pay`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ paymentMethod }),
        signal: controller.signal,
      });
      return parseResponse(res);
    } finally { clearTimeout(timeoutId); }
  } catch (err) {
    if (!isBackendReachable()) {
      const requestId = generateRequestId();
      await addPendingAction({
        requestId,
        entityId: orderId,
        entityType: 'order',
        actionType: 'mark-paid',
        url: `/api/orders/${orderId}/pay`,
        method: 'POST',
        body: { paymentMethod, requestId },
        dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
      });
      return { offline: true };
    }
    throw err;
  }
}

export async function settleOrder(orderId, removedItemIds, removedBy = 'Cashier', requestId = null, extraSettleData = {}) {
  const body = { removedItemIds, removedBy, ...extraSettleData };
  const settleRequestId = requestId || generateRequestId();
  body.requestId = settleRequestId;

  // Fast path: if backend is known unreachable, queue instantly without API wait.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing settle to offline queue');
    await addPendingAction({
      requestId: settleRequestId,
      entityId: orderId,
      entityType: 'order',
      actionType: 'settle',
      url: `/api/orders/${orderId}/settle`,
      method: 'POST',
      body,
      dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
    });
    const localId = `offline-txn-${Date.now()}`;
    body.localTxnId = localId;
    await addOfflineTransaction({
      localId, orderId, requestId: settleRequestId,
      ...extraSettleData, synced: false, createdAt: Date.now(),
    });
    return { offline: true, transaction: { id: localId, ...body } };
  }

<<<<<<< HEAD
  // Try API first — isBackendReachable() can be falsely negative on slow networks.
  // Only fall back to offline queue if the API call actually fails after retries.
  try {
    return await withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);
        try {
          const res = await fetch(apiUrl(`/api/orders/${orderId}/settle`), {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          return parseResponse(res);
        } finally { clearTimeout(timeoutId); }
      },
      { ...RETRY_CONFIG.SETTLE, shouldRetry: (err) => err.status !== 409 }
    );
  } catch (apiErr) {
    if (!isBackendReachable()) {
      console.warn('[Offline] Settle API failed, queuing for sync:', apiErr.message);
      await addPendingAction({
        requestId: settleRequestId,
        entityId: orderId,
        entityType: 'order',
        actionType: 'settle',
        url: `/api/orders/${orderId}/settle`,
        method: 'POST',
        body,
        dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
=======
  return withRetry(
    async () => {
      const res = await fetch(apiUrl(`/api/orders/${orderId}/settle`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      return parseResponse(res);
    },
    { ...RETRY_CONFIG.SETTLE, shouldRetry: (err) => err.status !== 409 }
  );
}

export async function quickSettleOrder(orderId, { paymentMethod, tipAmount, cashAmount, cardAmount, discountPercent, tableNumber, isExtraTable, grandTotal, subtotal, discountAmount, cgst, sgst, items, requestId, printRequestId } = {}) {
  const body = { paymentMethod, tipAmount, cashAmount, cardAmount, discountPercent, tableNumber, isExtraTable, grandTotal, subtotal, discountAmount, cgst, sgst, items, requestId, printRequestId };
  const settleRequestId = requestId || generateRequestId();
  body.requestId = settleRequestId;

  if (!isBackendReachable()) {
    await addPendingAction({
      requestId: settleRequestId,
      entityId: orderId,
      entityType: 'order',
      actionType: 'quick-settle',
      url: `/api/orders/${orderId}/quick-settle`,
      method: 'POST',
      body,
      synced: false,
      createdAt: Date.now(),
    });
    return { offline: true };
  }

  return withRetry(
    async () => {
      const res = await fetch(apiUrl(`/api/orders/${orderId}/quick-settle`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
>>>>>>> e6031be (start of heian era)
      });
      // Store local transaction record for offline history
      const localId = `offline-txn-${Date.now()}`;
      body.localTxnId = localId;
      await addOfflineTransaction({
        localId,
        orderId,
        requestId: settleRequestId,
        ...extraSettleData,
        synced: false,
        createdAt: Date.now(),
      });
      if (import.meta.env.DEV) {
        console.log('[Offline] Settlement queued for sync:', orderId);
      }
      return { offline: true, transaction: { id: localId, ...body } };
    }
    throw apiErr;
  }
}

export async function saveTransaction({
  restaurantId,
  orderId,
  tableNumber,
  captainId,
  amount,
  method,
  itemCount,
  items,
  subtotal,
  discountPercent,
  discountAmount,
  cgst,
  sgst,
  grandTotal,
  roundOff,
  tipAmount,
  sectionId,
  sectionTag,
  billNumber,
  platform,
}) {
  const txnBody = {
    restaurantId, orderId, tableNumber, captainId, amount, method,
    itemCount, items, subtotal, discountPercent, discountAmount,
    cgst, sgst, grandTotal, roundOff, tipAmount, sectionId, sectionTag,
    billNumber, platform,
  };

  // Fast path: if backend is known unreachable, queue instantly.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing save-transaction');
    const requestId = generateRequestId();
    txnBody.requestId = requestId;
    await addPendingAction({
      requestId,
      entityId: orderId || `walkin-${Date.now()}`,
      entityType: 'transaction',
      actionType: 'save-transaction',
      url: '/api/transactions',
      method: 'POST',
      body: txnBody,
      dependsOnOrderId: orderId && String(orderId).startsWith('offline-') ? orderId : null,
    });
    const localId = `offline-txn-${Date.now()}`;
    await addOfflineTransaction({
      localId, orderId, requestId, ...txnBody, synced: false, createdAt: Date.now(),
    });
    return { offline: true, id: localId, transaction: { id: localId, ...txnBody, paidAt: new Date().toISOString() } };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(apiUrl('/api/transactions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authService.getAuthHeader() },
        body: JSON.stringify(txnBody),
        signal: controller.signal,
      });
      return parseResponse(res);
    } finally { clearTimeout(timeoutId); }
  } catch (err) {
    if (!isBackendReachable()) {
      console.warn('[Offline] Save transaction API failed, queuing for sync:', err.message);
      const requestId = generateRequestId();
      txnBody.requestId = requestId;
      await addPendingAction({
        requestId,
        entityId: orderId || `walkin-${Date.now()}`,
        entityType: 'transaction',
        actionType: 'save-transaction',
        url: '/api/transactions',
        method: 'POST',
        body: txnBody,
        dependsOnOrderId: orderId && String(orderId).startsWith('offline-') ? orderId : null,
      });
      const localId = `offline-txn-${Date.now()}`;
      await addOfflineTransaction({
        localId, orderId, requestId, ...txnBody, synced: false, createdAt: Date.now(),
      });
      return { offline: true, id: localId, transaction: { id: localId, ...txnBody, paidAt: new Date().toISOString() } };
    }
    throw err;
  }
}

export async function fetchTransactions(restaurantId, limit = 2000, date = null, month = null) {
  const qs = new URLSearchParams({ restaurantId });
  if (limit != null && limit > 0) qs.set('limit', String(limit));
  if (date)  qs.set('date',  date);   // 'YYYY-MM-DD'
  if (month) qs.set('month', month);  // 'YYYY-MM'
  // Cache-bust so every request bypasses stale backend cache
  qs.set('_cb', String(Date.now()));
  const res = await fetch(apiUrl(`/api/transactions?${qs}`), {
    cache: 'no-store',
    headers: { ...authService.getAuthHeader() },
  });
  return parseResponse(res);
}

// Wrap fetchTransactions with retry logic for Bill Finder
export async function fetchTransactionsWithRetry(restaurantId, limit = 2000, date = null, month = null) {
  return withRetry(
    () => fetchTransactions(restaurantId, limit, date, month),
    RETRY_CONFIG.TRANSACTIONS
  );
}

export async function cancelOrderItem(orderId, orderItemId, cancelledBy, tableNumber, cancelQuantity = 1, requestId = null, localPrinted = false) {
  const cancelRequestId = requestId || generateRequestId();

  // Fast path: if backend is known unreachable, queue instantly.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing cancel-item');
    await addPendingAction({
      requestId: cancelRequestId,
      entityId: orderId,
      entityType: 'order',
      actionType: 'cancel-item',
      url: `/api/orders/${orderId}/cancel-item`,
      method: 'PATCH',
<<<<<<< HEAD
      body: { orderItemId, cancelledBy, tableNumber, cancelQuantity, requestId: cancelRequestId },
      dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
=======
      body: { orderItemId, cancelledBy, tableNumber, cancelQuantity, requestId: cancelRequestId, localPrinted },
>>>>>>> e6031be (start of heian era)
    });
    return { offline: true };
  }

  // Try API first — isBackendReachable() can be falsely negative on slow networks.
  try {
    return await withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);
        try {
          const res = await fetch(apiUrl(`/api/orders/${orderId}/cancel-item`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ orderItemId, cancelledBy, tableNumber, cancelQuantity, requestId: cancelRequestId }),
            signal: controller.signal,
          });
          return parseResponse(res);
        } finally { clearTimeout(timeoutId); }
      },
      { maxRetries: 2, baseDelayMs: 600, maxDelayMs: 2000, shouldRetry: (err) => err.status !== 409 }
    );
  } catch (apiErr) {
    if (!isBackendReachable()) {
      console.warn('[Offline] Cancel item API failed, queuing for sync:', apiErr.message);
      await addPendingAction({
        requestId: cancelRequestId,
        entityId: orderId,
        entityType: 'order',
        actionType: 'cancel-item',
        url: `/api/orders/${orderId}/cancel-item`,
        method: 'PATCH',
<<<<<<< HEAD
        body: { orderItemId, cancelledBy, tableNumber, cancelQuantity, requestId: cancelRequestId },
        dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
=======
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ orderItemId, cancelledBy, tableNumber, cancelQuantity, requestId: cancelRequestId, localPrinted }),
>>>>>>> e6031be (start of heian era)
      });
      if (import.meta.env.DEV) {
        console.log('[Offline] Cancel item queued for sync:', orderId, orderItemId);
      }
      return { offline: true };
    }
    throw apiErr;
  }
}

export async function swapTable(sourceTableBackendId, targetTableBackendId, swappedBy, restaurantId) {
  // Fast path: if backend is known unreachable, queue instantly.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing table swap');
    const requestId = generateRequestId();
    await addPendingAction({
      requestId,
      entityId: sourceTableBackendId,
      entityType: 'table',
      actionType: 'swap-table',
      url: `/api/tables/${sourceTableBackendId}/swap`,
      method: 'POST',
      body: { targetTableId: targetTableBackendId, swappedBy, restaurantId, requestId },
    });
    return { offline: true };
  }
  try {
    return await withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);
        try {
          const res = await fetch(apiUrl(`/api/tables/${sourceTableBackendId}/swap`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ targetTableId: targetTableBackendId, swappedBy, restaurantId }),
            signal: controller.signal,
          });
          return parseResponse(res);
        } finally { clearTimeout(timeoutId); }
      },
      RETRY_CONFIG.TABLE_UPDATE
    );
  } catch (apiErr) {
    if (!isBackendReachable()) {
      console.warn('[Offline] Swap table API failed, queuing for sync:', apiErr.message);
      const requestId = generateRequestId();
      await addPendingAction({
        requestId,
        entityId: sourceTableBackendId,
        entityType: 'table',
        actionType: 'swap-table',
        url: `/api/tables/${sourceTableBackendId}/swap`,
        method: 'POST',
        body: { targetTableId: targetTableBackendId, swappedBy, restaurantId, requestId },
      });
      return { offline: true };
    }
    throw apiErr;
  }
}

export async function editBill(orderId, { removedItemIds = [], editQuantities = {}, addedItems = [], editedBy = 'Cashier' }) {
  // Fast path: if backend is known unreachable, queue instantly.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing bill edit');
    const requestId = generateRequestId();
    await addPendingAction({
      requestId,
      entityId: orderId,
      entityType: 'order',
      actionType: 'bill-edit',
      url: `/api/orders/${orderId}/bill-edit`,
      method: 'PATCH',
      body: { removedItemIds, editQuantities, addedItems, editedBy, requestId },
      dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
    });
    return { offline: true };
  }
  // Try API first — isBackendReachable() can be falsely negative on slow networks.
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(apiUrl(`/api/orders/${orderId}/bill-edit`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ removedItemIds, editQuantities, addedItems, editedBy }),
        signal: controller.signal,
      });
      return parseResponse(res);
    } finally { clearTimeout(timeoutId); }
  } catch (err) {
    if (!isBackendReachable()) {
      console.warn('[Offline] Bill edit API failed, queuing for sync:', err.message);
      const requestId = generateRequestId();
      await addPendingAction({
        requestId,
        entityId: orderId,
        entityType: 'order',
        actionType: 'bill-edit',
        url: `/api/orders/${orderId}/bill-edit`,
        method: 'PATCH',
        body: { removedItemIds, editQuantities, addedItems, editedBy, requestId },
        dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
      });
      if (import.meta.env.DEV) {
        console.log('[Offline] Bill edit queued for sync:', orderId);
      }
      return { offline: true };
    }
    throw err;
  }
}

export async function transferItems(sourceTableBackendId, targetTableBackendId, itemIds, transferredBy, restaurantId) {
  // Fast path: if backend is known unreachable, queue instantly.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing item transfer');
    const requestId = generateRequestId();
    await addPendingAction({
      requestId,
      entityId: sourceTableBackendId,
      entityType: 'table',
      actionType: 'transfer-items',
      url: `/api/tables/${sourceTableBackendId}/transfer-items`,
      method: 'POST',
      body: { targetTableId: targetTableBackendId, itemIds, transferredBy, restaurantId, requestId },
    });
    return { offline: true };
  }
  try {
    return await withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);
        try {
          const res = await fetch(apiUrl(`/api/tables/${sourceTableBackendId}/transfer-items`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ targetTableId: targetTableBackendId, itemIds, transferredBy, restaurantId }),
            signal: controller.signal,
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to transfer items');
          }
          return res.json();
        } finally { clearTimeout(timeoutId); }
      },
      RETRY_CONFIG.TABLE_UPDATE
    );
  } catch (apiErr) {
    if (!isBackendReachable()) {
      console.warn('[Offline] Transfer items API failed, queuing for sync:', apiErr.message);
      const requestId = generateRequestId();
      await addPendingAction({
        requestId,
        entityId: sourceTableBackendId,
        entityType: 'table',
        actionType: 'transfer-items',
        url: `/api/tables/${sourceTableBackendId}/transfer-items`,
        method: 'POST',
        body: { targetTableId: targetTableBackendId, itemIds, transferredBy, restaurantId, requestId },
      });
      return { offline: true };
    }
    throw apiErr;
  }
}

export async function deleteTransaction(transactionId, restaurantId) {
  // Fast path: if backend is known unreachable, queue instantly.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing delete-transaction');
    const requestId = generateRequestId();
    await addPendingAction({
      requestId,
      entityId: transactionId,
      entityType: 'transaction',
      actionType: 'delete-transaction',
      url: `/api/transactions/${transactionId}?restaurantId=${restaurantId}`,
      method: 'DELETE',
      body: { restaurantId, requestId },
    });
    return { offline: true };
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(apiUrl(`/api/transactions/${transactionId}?restaurantId=${restaurantId}`), {
        method: 'DELETE',
        headers: { ...authService.getAuthHeader() },
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete transaction');
      }
      return res.json();
    } finally { clearTimeout(timeoutId); }
  } catch (err) {
    if (!isBackendReachable()) {
      console.warn('[Offline] Delete transaction API failed, queuing for sync:', err.message);
      const requestId = generateRequestId();
      await addPendingAction({
        requestId,
        entityId: transactionId,
        entityType: 'transaction',
        actionType: 'delete-transaction',
        url: `/api/transactions/${transactionId}?restaurantId=${restaurantId}`,
        method: 'DELETE',
        body: { restaurantId, requestId },
      });
      return { offline: true };
    }
    throw err;
  }
}

export async function confirmPayment(transactionId, { paymentMethod = 'CASH', cashAmount, cardAmount, tipAmount } = {}) {
  const body = { paymentMethod };
  if (paymentMethod === 'MIXED') {
    body.cashAmount = cashAmount != null ? Number(cashAmount) : 0;
    body.cardAmount = cardAmount != null ? Number(cardAmount) : 0;
  } else if (paymentMethod === 'CASH' && cashAmount != null) {
    body.cashAmount = Number(cashAmount);
  }
  if (tipAmount != null) body.tipAmount = Number(tipAmount);

  // Fast path: if backend is known unreachable, queue instantly.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing confirm-payment');
    const requestId = generateRequestId();
    await addPendingAction({
      requestId,
      entityId: transactionId,
      entityType: 'transaction',
      actionType: 'confirm-payment',
      url: `/api/transactions/${transactionId}/confirm-payment`,
      method: 'POST',
      body: { ...body, requestId },
    });
    return { offline: true };
  }
  try {
    const res = await fetch(apiUrl(`/api/transactions/${transactionId}/confirm-payment`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authService.getAuthHeader() },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to confirm payment');
    }
    return res.json();
  } catch (err) {
    if (!isBackendReachable()) {
      console.warn('[Offline] Confirm payment API failed, queuing for sync:', err.message);
      const requestId = generateRequestId();
      await addPendingAction({
        requestId,
        entityId: transactionId,
        entityType: 'transaction',
        actionType: 'confirm-payment',
        url: `/api/transactions/${transactionId}/confirm-payment`,
        method: 'POST',
        body: { ...body, requestId },
      });
      return { offline: true };
    }
    throw err;
  }
}

export async function printBill(orderId, { restaurantId, tableNumber, discountPercent, kotNumbers, requestId = null, localPrinted = false, billEventId = null } = {}) {
  const printRequestId = requestId || generateRequestId();
  const qs = new URLSearchParams({ restaurantId: restaurantId || '', requestId: printRequestId });
  if (tableNumber) qs.set('tableNumber', tableNumber);
  if (discountPercent) qs.set('discountPercent', String(discountPercent));
  if (kotNumbers) qs.set('kotNumbers', kotNumbers);
  if (localPrinted) qs.set('localPrinted', 'true');
  if (billEventId) qs.set('billEventId', billEventId);

  // Fast path: if backend is known unreachable, queue instantly without API wait.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing print-bill to offline queue');
    await addPendingAction({
      requestId: printRequestId,
      entityId: orderId,
      entityType: 'order',
      actionType: 'print-bill',
      url: `/api/orders/${orderId}/print-bill?${qs.toString()}`,
      method: 'POST',
      body: { restaurantId, tableNumber, discountPercent, kotNumbers, requestId: printRequestId, localPrinted, billEventId },
      dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
    });
    if (!localPrinted) {
      await addOfflinePrintJob({
        id: `offline-print-${Date.now()}`,
        orderId, requestId: printRequestId,
        jobType: 'FINAL_BILL', status: 'pending', createdAt: Date.now(),
        data: { restaurantId, tableNumber, discountPercent, kotNumbers },
      });
    }
    return { offline: true, billNumber: `OFFLINE-${printRequestId.slice(0, 8).toUpperCase()}`, order: { id: orderId } };
  }

<<<<<<< HEAD
  // Try API first — isBackendReachable() can be falsely negative on slow networks.
  // Only fall back to offline queue if the API call actually fails.
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(apiUrl(`/api/orders/${orderId}/print-bill?${qs.toString()}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        signal: controller.signal,
      });
      return parseResponse(res);
    } finally { clearTimeout(timeoutId); }
  } catch (apiErr) {
    if (!isBackendReachable()) {
      console.warn('[Offline] Print bill API failed, queuing for sync:', apiErr.message);
      await addPendingAction({
        requestId: printRequestId,
        entityId: orderId,
        entityType: 'order',
        actionType: 'print-bill',
        url: `/api/orders/${orderId}/print-bill?${qs.toString()}`,
        method: 'POST',
        body: { restaurantId, tableNumber, discountPercent, kotNumbers, requestId: printRequestId, localPrinted, billEventId },
        dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
      });
      // Only queue a local print job if the local printer did not already print it.
      // CashierDashboard calls printLocal before this, so localPrinted=true means it already printed.
      if (!localPrinted) {
        await addOfflinePrintJob({
          id: `offline-print-${Date.now()}`,
          orderId,
          requestId: printRequestId,
          jobType: 'final-bill',
          status: 'pending',
          createdAt: Date.now(),
          data: { restaurantId, tableNumber, discountPercent, kotNumbers },
        });
      }
      if (import.meta.env.DEV) {
        console.log('[Offline] Print bill queued for sync:', orderId);
      }
      return {
        offline: true,
        billNumber: `OFFLINE-${printRequestId.slice(0, 8).toUpperCase()}`,
        order: { id: orderId },
      };
    }
    throw apiErr;
  }
=======
  const res = await fetch(apiUrl(`/api/orders/${orderId}/print-bill?${qs.toString()}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    signal: AbortSignal.timeout(15000),
  });
  return parseResponse(res);
>>>>>>> e6031be (start of heian era)
}

export { generateRequestId };

export async function cancelOrderItems(orderId, items, cancelledBy, tableNumber, requestId = null, localPrinted = false) {
  // items: Array<{ orderItemId: string, cancelQuantity: number }>
  const cancelRequestId = requestId || generateRequestId();

  // Fast path: if backend is known unreachable, queue instantly.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing cancel-items');
    await addPendingAction({
      requestId: cancelRequestId,
      entityId: orderId,
      entityType: 'order',
      actionType: 'cancel-items',
      url: `/api/orders/${orderId}/cancel-items`,
      method: 'PATCH',
<<<<<<< HEAD
      body: { items, cancelledBy, tableNumber, requestId: cancelRequestId },
      dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
=======
      body: { items, cancelledBy, tableNumber, requestId: cancelRequestId, localPrinted },
>>>>>>> e6031be (start of heian era)
    });
    return { offline: true };
  }

  // Try API first — isBackendReachable() can be falsely negative on slow networks.
  try {
    return await withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);
        try {
          const res = await fetch(apiUrl(`/api/orders/${orderId}/cancel-items`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ items, cancelledBy, tableNumber, requestId: cancelRequestId }),
            signal: controller.signal,
          });
          return parseResponse(res);
        } finally { clearTimeout(timeoutId); }
      },
      { maxRetries: 1, baseDelayMs: 600, maxDelayMs: 2000, shouldRetry: (err) => err.status !== 409 }
    );
  } catch (apiErr) {
    if (!isBackendReachable()) {
      console.warn('[Offline] Cancel items API failed, queuing for sync:', apiErr.message);
      await addPendingAction({
        requestId: cancelRequestId,
        entityId: orderId,
        entityType: 'order',
        actionType: 'cancel-items',
        url: `/api/orders/${orderId}/cancel-items`,
        method: 'PATCH',
<<<<<<< HEAD
        body: { items, cancelledBy, tableNumber, requestId: cancelRequestId },
        dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
=======
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ items, cancelledBy, tableNumber, requestId: cancelRequestId, localPrinted }),
>>>>>>> e6031be (start of heian era)
      });
      if (import.meta.env.DEV) {
        console.log('[Offline] Cancel items queued for sync:', orderId);
      }
      return { offline: true };
    }
    throw apiErr;
  }
}
