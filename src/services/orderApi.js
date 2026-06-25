import { apiUrl, getAuthHeaders } from "./apiConfig";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";
import { withRetry, RETRY_CONFIG, logCriticalError } from "../utils/resilience";
import { authService } from "./authService";
import { addPendingAction } from "../utils/offlineDB";

async function parseResponse(res) {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    const err = new Error(message);
    err.status = res.status;
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

export async function createOrder({ tableId, tableNumber, items, restaurantId = getCurrentRestaurantId(), requestId = null, captainName = null, isExtraTable = false, sectionTag = null }) {
  const orderData = { tableId, tableNumber, restaurantId, items: toOrderItems(items) };
  if (requestId) orderData.requestId = requestId;
  if (captainName) orderData.captainName = captainName;
  if (isExtraTable) { orderData.isExtraTable = true; }
  if (sectionTag) { orderData.sectionTag = sectionTag; }

  // Offline queueing — store action in IndexedDB, sync engine will flush on reconnect
  if (!navigator.onLine) {
    await addPendingAction({
      url: '/api/orders',
      method: 'POST',
      body: orderData,
    });
    if (import.meta.env.DEV) {
      console.log('[Offline] Order queued for sync:', orderData.tableNumber || orderData.tableId);
    }
    return { id: `offline-${Date.now()}`, ...orderData, offline: true };
  }

  return withRetry(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
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

export async function updateOrderItems(orderId, items, requestId = null, captainName = null, isExtraTable = false, tableNumber = null, lastUpdatedAt = null) {
  return withRetry(
    async () => {
      const body = { items: toOrderItems(items) };
      if (requestId) body.requestId = requestId;
      if (captainName) body.captainName = captainName;
      if (isExtraTable) { body.isExtraTable = true; }
      if (tableNumber) { body.tableNumber = tableNumber; }
      if (lastUpdatedAt) { body.lastUpdatedAt = lastUpdatedAt; }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

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

export async function settleOrder(orderId, removedItemIds, removedBy = 'Cashier') {
  return withRetry(
    async () => {
      const res = await fetch(apiUrl(`/api/orders/${orderId}/settle`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ removedItemIds, removedBy }),
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
  return withRetry(
    async () => {
      const res = await fetch(apiUrl(`/api/orders/${orderId}/cancel-item`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ orderItemId, cancelledBy, tableNumber, cancelQuantity, requestId }),
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

export async function cancelOrderItems(orderId, items, cancelledBy, tableNumber, requestId = null) {
  // items: Array<{ orderItemId: string, cancelQuantity: number }>
  return withRetry(
    async () => {
      const res = await fetch(apiUrl(`/api/orders/${orderId}/cancel-items`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ items, cancelledBy, tableNumber, requestId }),
      });
      return parseResponse(res);
    },
    { maxRetries: 1, baseDelayMs: 600, maxDelayMs: 2000, shouldRetry: (err) => err.status !== 409 }
  );
}
