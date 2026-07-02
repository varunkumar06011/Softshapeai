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
} from "../utils/offlineDB";
import { queueKitchenItems } from "../utils/kitchenQueue";

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

export async function reserveKotNumber() {
  return apiFetch('/api/orders/reserve-kot-number', { method: 'POST', timeout: 5000 });
}

export async function createOrder({ tableId, tableNumber, items, restaurantId = getCurrentRestaurantId(), requestId = null, captainName = null, isExtraTable = false, sectionTag = null, platform = null, timeoutMs = 45000, localPrinted = false, preReservedKotNumber = null }) {
  const orderData = { tableId, tableNumber, restaurantId, items: toOrderItems(items) };
  if (requestId) orderData.requestId = requestId;
  if (captainName) orderData.captainName = captainName;
  if (isExtraTable) { orderData.isExtraTable = true; }
  if (sectionTag) { orderData.sectionTag = sectionTag; }
  if (platform) { orderData.platform = platform; }
  if (localPrinted) { orderData.localPrinted = true; }
  if (preReservedKotNumber != null) { orderData.preReservedKotNumber = preReservedKotNumber; }

  // Offline queueing — store action in IndexedDB, sync engine will flush on reconnect
  if (!isBackendReachable()) {
    const offlineRequestId = requestId || generateRequestId();
    orderData.requestId = offlineRequestId;
    await addPendingAction({
      requestId: offlineRequestId,
      entityId: tableId,
      entityType: 'order',
      actionType: 'create-order',
      url: '/api/orders',
      method: 'POST',
      body: orderData,
    });
    // Queue KOT items locally so the kitchen display still works during KDS outage
    const kitchenItems = orderData.items.filter(i => (i.menuType || 'FOOD') !== 'LIQUOR');
    await queueKitchenItems({
      orderId: `offline-${Date.now()}`,
      tableId,
      tableNumber: orderData.tableNumber || tableId,
      items: kitchenItems,
      requestId: offlineRequestId,
    }).catch(err => console.error('[Offline] Kitchen queue failed:', err.message));
    if (import.meta.env.DEV) {
      console.log('[Offline] Order queued for sync:', orderData.tableNumber || orderData.tableId);
    }
    return { id: `offline-${Date.now()}`, ...orderData, offline: true };
  }

  return withRetry(
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
  });
  return parseResponse(res);
}

export async function updateOrderItems(orderId, items, requestId = null, captainName = null, isExtraTable = false, tableNumber = null, lastUpdatedAt = null, timeoutMs = 45000, localPrinted = false, preReservedKotNumber = null) {
  const body = { items: toOrderItems(items) };
  if (requestId) body.requestId = requestId;
  if (captainName) body.captainName = captainName;
  if (isExtraTable) { body.isExtraTable = true; }
  if (tableNumber) { body.tableNumber = tableNumber; }
  if (lastUpdatedAt) { body.lastUpdatedAt = lastUpdatedAt; }
  if (localPrinted) { body.localPrinted = true; }
  if (preReservedKotNumber != null) { body.preReservedKotNumber = preReservedKotNumber; }

  // Offline queueing — store action in IndexedDB, sync engine will flush on reconnect
  if (!isBackendReachable()) {
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
    });
    // Queue KOT items locally so the kitchen display still works during KDS outage
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

  return withRetry(
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
    });
    return { offline: true };
  }
  const res = await fetch(apiUrl(`/api/orders/${orderId}/request-billing`), {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

export async function markOrderPaid(orderId, paymentMethod = 'CASH') {
  const res = await fetch(apiUrl(`/api/orders/${orderId}/pay`), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ paymentMethod }),
  });
  return parseResponse(res);
}

export async function settleOrder(orderId, removedItemIds, removedBy = 'Cashier', requestId = null, extraSettleData = {}) {
  const body = { removedItemIds, removedBy, ...extraSettleData };
  const settleRequestId = requestId || generateRequestId();
  body.requestId = settleRequestId;

  if (!isBackendReachable()) {
    await addPendingAction({
      requestId: settleRequestId,
      entityId: orderId,
      entityType: 'order',
      actionType: 'settle',
      url: `/api/orders/${orderId}/settle`,
      method: 'POST',
      body,
    });
    // Store local transaction record for offline history
    await addOfflineTransaction({
      localId: `offline-txn-${Date.now()}`,
      orderId,
      requestId: settleRequestId,
      ...extraSettleData,
      synced: false,
      createdAt: Date.now(),
    });
    if (import.meta.env.DEV) {
      console.log('[Offline] Settlement queued for sync:', orderId);
    }
    return { offline: true, transaction: { id: `offline-txn-${Date.now()}`, ...body } };
  }

  return withRetry(
    async () => {
      const res = await fetch(apiUrl(`/api/orders/${orderId}/settle`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      return parseResponse(res);
    },
    { ...RETRY_CONFIG.SETTLE, shouldRetry: (err) => err.status !== 409 }
  );
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
  sectionId,
  sectionTag,
  billNumber,
  platform,
}) {
  const res = await fetch(apiUrl('/api/transactions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authService.getAuthHeader() },
    body: JSON.stringify({
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
      sectionId,
      sectionTag,
      billNumber,
      platform,
    }),
  });
  return parseResponse(res);
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

export async function cancelOrderItem(orderId, orderItemId, cancelledBy, tableNumber, cancelQuantity = 1, requestId = null) {
  const cancelRequestId = requestId || generateRequestId();

  if (!isBackendReachable()) {
    await addPendingAction({
      requestId: cancelRequestId,
      entityId: orderId,
      entityType: 'order',
      actionType: 'cancel-item',
      url: `/api/orders/${orderId}/cancel-item`,
      method: 'PATCH',
      body: { orderItemId, cancelledBy, tableNumber, cancelQuantity, requestId: cancelRequestId },
    });
    if (import.meta.env.DEV) {
      console.log('[Offline] Cancel item queued for sync:', orderId, orderItemId);
    }
    return { offline: true };
  }

  return withRetry(
    async () => {
      const res = await fetch(apiUrl(`/api/orders/${orderId}/cancel-item`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ orderItemId, cancelledBy, tableNumber, cancelQuantity, requestId: cancelRequestId }),
      });
      return parseResponse(res);
    },
    { maxRetries: 2, baseDelayMs: 600, maxDelayMs: 2000, shouldRetry: (err) => err.status !== 409 }
  );
}

export async function swapTable(sourceTableBackendId, targetTableBackendId, swappedBy, restaurantId) {
  return withRetry(
    async () => {
      const res = await fetch(apiUrl(`/api/tables/${sourceTableBackendId}/swap`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ targetTableId: targetTableBackendId, swappedBy, restaurantId }),
      });
      return parseResponse(res);
    },
    RETRY_CONFIG.TABLE_UPDATE
  );
}

export async function editBill(orderId, { removedItemIds = [], editQuantities = {}, addedItems = [], editedBy = 'Cashier' }) {
  if (!isBackendReachable()) {
    const requestId = generateRequestId();
    await addPendingAction({
      requestId,
      entityId: orderId,
      entityType: 'order',
      actionType: 'bill-edit',
      url: `/api/orders/${orderId}/bill-edit`,
      method: 'PATCH',
      body: { removedItemIds, editQuantities, addedItems, editedBy, requestId },
    });
    if (import.meta.env.DEV) {
      console.log('[Offline] Bill edit queued for sync:', orderId);
    }
    return { offline: true };
  }

  const res = await fetch(apiUrl(`/api/orders/${orderId}/bill-edit`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ removedItemIds, editQuantities, addedItems, editedBy }),
  });
  return parseResponse(res);
}

export async function transferItems(sourceTableBackendId, targetTableBackendId, itemIds, transferredBy, restaurantId) {
  return withRetry(
    async () => {
      const res = await fetch(apiUrl(`/api/tables/${sourceTableBackendId}/transfer-items`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ targetTableId: targetTableBackendId, itemIds, transferredBy, restaurantId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to transfer items');
      }
      return res.json();
    },
    RETRY_CONFIG.TABLE_UPDATE
  );
}

export async function deleteTransaction(transactionId, restaurantId) {
  const res = await fetch(apiUrl(`/api/transactions/${transactionId}?restaurantId=${restaurantId}`), {
    method: 'DELETE',
    headers: { ...authService.getAuthHeader() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete transaction');
  }
  return res.json();
}

export async function printBill(orderId, { restaurantId, tableNumber, discountPercent, kotNumbers, requestId = null } = {}) {
  const printRequestId = requestId || generateRequestId();
  const qs = new URLSearchParams({ restaurantId: restaurantId || '', requestId: printRequestId });
  if (tableNumber) qs.set('tableNumber', tableNumber);
  if (discountPercent) qs.set('discountPercent', String(discountPercent));
  if (kotNumbers) qs.set('kotNumbers', kotNumbers);

  if (!isBackendReachable()) {
    await addPendingAction({
      requestId: printRequestId,
      entityId: orderId,
      entityType: 'order',
      actionType: 'print-bill',
      url: `/api/orders/${orderId}/print-bill?${qs.toString()}`,
      method: 'POST',
      body: { restaurantId, tableNumber, discountPercent, kotNumbers, requestId: printRequestId },
    });
    // Queue a local print job so the receipt prints immediately via local print agent
    await addOfflinePrintJob({
      id: `offline-print-${Date.now()}`,
      orderId,
      requestId: printRequestId,
      jobType: 'final-bill',
      status: 'pending',
      createdAt: Date.now(),
      data: { restaurantId, tableNumber, discountPercent, kotNumbers },
    });
    if (import.meta.env.DEV) {
      console.log('[Offline] Print bill queued for sync:', orderId);
    }
    return {
      offline: true,
      billNumber: `OFFLINE-${printRequestId.slice(0, 8).toUpperCase()}`,
      order: { id: orderId },
    };
  }

  const res = await fetch(apiUrl(`/api/orders/${orderId}/print-bill?${qs.toString()}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
  });
  return parseResponse(res);
}

export { generateRequestId };

export async function cancelOrderItems(orderId, items, cancelledBy, tableNumber, requestId = null) {
  // items: Array<{ orderItemId: string, cancelQuantity: number }>
  const cancelRequestId = requestId || generateRequestId();

  if (!isBackendReachable()) {
    await addPendingAction({
      requestId: cancelRequestId,
      entityId: orderId,
      entityType: 'order',
      actionType: 'cancel-items',
      url: `/api/orders/${orderId}/cancel-items`,
      method: 'PATCH',
      body: { items, cancelledBy, tableNumber, requestId: cancelRequestId },
    });
    if (import.meta.env.DEV) {
      console.log('[Offline] Cancel items queued for sync:', orderId);
    }
    return { offline: true };
  }

  return withRetry(
    async () => {
      const res = await fetch(apiUrl(`/api/orders/${orderId}/cancel-items`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ items, cancelledBy, tableNumber, requestId: cancelRequestId }),
      });
      return parseResponse(res);
    },
    { maxRetries: 1, baseDelayMs: 600, maxDelayMs: 2000, shouldRetry: (err) => err.status !== 409 }
  );
}
