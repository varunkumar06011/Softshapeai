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
  getPendingActionsByType,
  removePendingAction,
} from "../utils/offlineDB";
import { queueKitchenItems } from "../utils/kitchenQueue";
import { isEdgeAvailable, edgeFetch, isEdgeLocalAuth } from "./edgeHealth.js";

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

export async function reserveKotNumber(requestId = null) {
  // ── Edge server first (local daily_counter) ─────────────────────────────────
  // For edge-local (PIN) auth, the edge server assigns KOT numbers locally
  // during order creation and prints KOTs directly to the designated printers.
  // No pre-reservation or local print is needed — return null so the caller
  // skips the local print block and lets the edge server handle everything.
  if (isEdgeLocalAuth() || await isEdgeAvailable()) {
    return { kotNumber: null, edge: true };
  }

  // Fast path: if backend is known unreachable, skip API and use local counter instantly.
  if (!isBackendReachable()) {
    const kotNumber = await getNextOfflineKotNumber();
    return { kotNumber, offline: true };
  }
  // Try API first — isBackendReachable() can be falsely negative on slow mobile networks.
  try {
    const body = {};
    if (requestId) body.requestId = requestId;
    return await apiFetch('/api/orders/reserve-kot-number', { method: 'POST', timeout: 3000, body: JSON.stringify(body) });
  } catch (err) {
    if (!isBackendReachable()) {
      const kotNumber = await getNextOfflineKotNumber();
      return { kotNumber, offline: true };
    }
    throw err;
  }
}

export async function releaseKotNumber(requestId) {
  if (!requestId) return;
  try {
    await apiFetch('/api/orders/release-kot-number', { method: 'POST', timeout: 3000, body: JSON.stringify({ requestId }) });
  } catch {
    // Best-effort — ignore errors
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

  // ── Path 1: Edge server (local SQLite hub) — primary path ──────────────────
  // Edge server writes to local SQLite, prints KOT, enqueues sync — all local, ~15-40ms.
  // For edge-local (PIN) auth, go straight to edgeFetch bypassing the health check.
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const edgeBody = {
        tableId,
        items: orderData.items,
        captainName,
        requestId: requestId || generateRequestId(),
        platform,
        orderByRole: authService.getUserRole?.() || undefined,
        localPrinted: localPrinted || false,
        preReservedKotNumber: preReservedKotNumber ?? null,
        kotEventIds: kotEventIds || null,
      };
      const result = await edgeFetch('/api/edge/order', {
        method: 'POST',
        body: JSON.stringify(edgeBody),
      });
      if (result.success !== false) {
        return {
          id: result.orderId,
          kotNumber: result.kotNumber,
          kotId: result.kotId,
          ...result.order,
          edge: true,
          printResults: result.printResults || null,
        };
      }
    } catch (edgeErr) {
      // Propagate business-logic errors (409/404/400) so the caller can handle
      // them (e.g. retry as update on 409). Only network errors (no statusCode)
      // should queue offline / fall through to cloud.
      if (edgeErr?.statusCode) throw edgeErr;
      if (useEdgeDirect) {
        // Edge-local auth: queue offline instead of cloud fallback (cloud will reject fake token)
        console.warn('[Edge] createOrder edge failed, queuing offline:', edgeErr.message);
        const offlineRequestId = requestId || generateRequestId();
        const offlineOrderId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
        return { id: offlineOrderId, ...orderData, offline: true };
      }
      console.warn('[Edge] Edge server failed, falling through to cloud:', edgeErr.message);
    }
  }

  // ── Path 2: Cloud backend — secondary path ─────────────────────────────────
  // Fast path: if backend is known unreachable, skip API and queue offline instantly.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing to offline queue');
    const offlineRequestId = requestId || generateRequestId();
    const offlineOrderId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      const offlineOrderId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  // ── Edge server first (local SQLite) ────────────────────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      const path = qs.toString() ? `/api/edge/orders?${qs.toString()}` : '/api/edge/orders';
      const edgeData = await edgeFetch(path);
      return edgeData || [];
    } catch (e) {
      if (useEdgeDirect) throw e;
      console.debug('[orderApi] edge fetch orders failed, falling through to cloud:', e);
    }
  }

  const qs = new URLSearchParams({ restaurantId });
  if (status) qs.set("status", status);
  return withRetry(
    async () => {
      const res = await fetch(apiUrl(`/api/orders?${qs.toString()}`), {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache", ...authService.getAuthHeader() },
        signal: AbortSignal.timeout(10000),
      });
      return parseResponse(res);
    },
    { ...RETRY_CONFIG.TABLE_UPDATE, retries: 2 }
  );
}

export async function fetchTableOrder(tableId) {
  // For edge-local (PIN) auth, use the edge server — fetch all tables and find
  // the one with matching tableId to extract its active order.
  if (isEdgeLocalAuth()) {
    try {
      const allTables = await edgeFetch('/api/edge/tables');
      if (Array.isArray(allTables)) {
        for (const section of allTables) {
          const table = (section.tables || []).find(t => t.id === tableId || t.backendId === tableId);
          if (table?.activeOrder) return table.activeOrder;
          if (table?.orders && table.orders.length > 0) return table.orders[0];
        }
      }
      return null;
    } catch (e) {
      throw e;
    }
  }
  // Edge server doesn't have a per-table-order endpoint yet.
  // fetchTables (plural) returns all tables with active orders — callers that need
  // a single table's order should use fetchTables and filter, or use cloud directly.
  const res = await fetch(apiUrl(`/api/orders/table/${tableId}`), {
    cache: "no-store",
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(10000),
  });
  return parseResponse(res);
}

export async function updateOrderItems(orderId, items, requestId = null, captainName = null, isExtraTable = false, tableNumber = null, lastUpdatedAt = null, timeoutMs = 12000, localPrinted = false, preReservedKotNumber = null, kotEventIds = null, tableId = null) {
  const body = { items: toOrderItems(items) };
  if (requestId) body.requestId = requestId;
  if (captainName) body.captainName = captainName;
  if (isExtraTable) { body.isExtraTable = true; }
  if (tableNumber) { body.tableNumber = tableNumber; }
  if (lastUpdatedAt) { body.lastUpdatedAt = lastUpdatedAt; }
  if (localPrinted) { body.localPrinted = true; }
  if (preReservedKotNumber != null) { body.preReservedKotNumber = preReservedKotNumber; }
  if (kotEventIds) { body.kotEventIds = kotEventIds; }

  // ── Path 1: Edge server (local SQLite hub) — primary path ──────────────────
  // Edge server needs the actual tableId to find/create the order.
  // If tableId is not provided, skip edge path — can't route without it.
  const useEdgeDirect = isEdgeLocalAuth();
  if (tableId && (useEdgeDirect || await isEdgeAvailable())) {
    try {
      const edgeBody = {
        orderId,
        tableId,
        items: body.items,
        captainName,
        requestId: requestId || generateRequestId(),
        orderByRole: authService.getUserRole?.() || undefined,
        localPrinted: localPrinted || false,
        preReservedKotNumber: preReservedKotNumber ?? null,
        kotEventIds: kotEventIds || null,
      };
      const result = await edgeFetch('/api/edge/order/update', {
        method: 'POST',
        body: JSON.stringify(edgeBody),
      });
      if (result.success !== false) {
        return {
          id: result.orderId || orderId,
          kotNumber: result.kotNumber,
          kotId: result.kotId,
          ...result.order,
          edge: true,
          printResults: result.printResults || null,
        };
      }
    } catch (edgeErr) {
      // Propagate business-logic errors (409/404/400) so the caller can handle
      // them. Only network errors (no statusCode) should queue offline / fall
      // through to cloud.
      if (edgeErr?.statusCode) throw edgeErr;
      if (useEdgeDirect) {
        // Edge-local auth: queue offline instead of cloud fallback
        console.warn('[Edge] updateOrderItems edge failed, queuing offline:', edgeErr.message);
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
          tableId,
          tableNumber: tableNumber || orderId,
          items: kitchenItems,
          requestId: offlineRequestId,
        }).catch(err => console.error('[Offline] Kitchen queue failed:', err.message));
        return { id: orderId, offline: true, order: { id: orderId, items: body.items } };
      }
      console.warn('[Edge] Edge server failed for update, falling through to cloud:', edgeErr.message);
    }
  }

  // ── Path 2: Cloud backend — secondary path ─────────────────────────────────
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
  // ── Edge server first (local SQLite, instant) ───────────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const result = await edgeFetch('/api/edge/order/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status }),
      });
      if (result && result.success) return result.order || result;
    } catch (edgeErr) {
      if (edgeErr?.statusCode) throw edgeErr;
      if (useEdgeDirect) {
        console.warn('[Edge] updateOrderStatus edge failed, queuing offline:', edgeErr.message);
        const requestId = generateRequestId();
        await addPendingAction({
          requestId,
          entityId: orderId,
          entityType: 'order',
          actionType: 'update-status',
          url: `/api/orders/${orderId}/status`,
          method: 'PATCH',
          body: { status },
          dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
        });
        return { id: orderId, offline: true, status };
      }
      console.warn('[Edge] updateOrderStatus failed, falling through:', edgeErr.message);
    }
  }
  if (!isBackendReachable()) {
    const requestId = generateRequestId();
    await addPendingAction({
      requestId,
      entityId: orderId,
      entityType: 'order',
      actionType: 'update-status',
      url: `/api/orders/${orderId}/status`,
      method: 'PATCH',
      body: { status },
      dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
    });
    return { id: orderId, offline: true, status };
  }
  try {
    return await withRetry(
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
  } catch (apiErr) {
    if (!isBackendReachable()) {
      const requestId = generateRequestId();
      await addPendingAction({
        requestId,
        entityId: orderId,
        entityType: 'order',
        actionType: 'update-status',
        url: `/api/orders/${orderId}/status`,
        method: 'PATCH',
        body: { status },
        dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
      });
      return { id: orderId, offline: true, status };
    }
    throw apiErr;
  }
}

export async function requestBilling(orderId) {
  // ── Edge server first (local SQLite, instant) ───────────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const result = await edgeFetch('/api/edge/order/request-billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      if (result && result.success) return result.order || result;
    } catch (edgeErr) {
      if (edgeErr?.statusCode) throw edgeErr;
      if (useEdgeDirect) {
        console.warn('[Edge] requestBilling edge failed, queuing offline:', edgeErr.message);
        const requestId = generateRequestId();
        await addPendingAction({
          requestId,
          entityId: orderId,
          entityType: 'order',
          actionType: 'request-billing',
          url: `/api/orders/${orderId}/request-billing`,
          method: 'POST',
          body: { requestId },
          dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
        });
        return { offline: true };
      }
      console.warn('[Edge] requestBilling failed, falling through:', edgeErr.message);
    }
  }
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
}

export async function markOrderPaid(orderId, paymentMethod = 'CASH') {
  // ── Edge server first (local SQLite, instant) ───────────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const result = await edgeFetch('/api/edge/order/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, paymentMethod }),
      });
      if (result && result.success) return result.order || result;
    } catch (edgeErr) {
      if (edgeErr?.statusCode) throw edgeErr;
      if (useEdgeDirect) {
        console.warn('[Edge] markOrderPaid edge failed, queuing offline:', edgeErr.message);
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
      console.warn('[Edge] markOrderPaid failed, falling through:', edgeErr.message);
    }
  }

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
  const settleRequestId = requestId || generateRequestId();

  // ── Edge server only (local SQLite, instant) ───────────────────────────────
  // Settlement must be edge-first — no queuing, no cloud fallback.
  // Cloud sync happens later via the edge sync worker.
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const edgeBody = {
        orderId,
        requestId: settleRequestId,
        removedItemIds: removedItemIds || [],
        removedBy,
        ...extraSettleData,
      };
      console.log('[settleOrder] Sending to edge:', { orderId, requestId: settleRequestId, paymentMethod: extraSettleData.paymentMethod });
      const result = await edgeFetch('/api/edge/order/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edgeBody),
      });
      if (result && result.success) {
        console.log('[settleOrder] Edge settle success:', orderId);
        return result;
      }
      console.warn('[settleOrder] Edge settle non-success:', result);
      return { success: false, error: result?.error || 'Settle failed on edge', offline: false };
    } catch (edgeErr) {
      if (edgeErr?.status) {
        console.warn('[settleOrder] Edge rejected:', edgeErr.status, edgeErr.message);
        return { success: false, error: edgeErr.message, offline: false };
      }
      console.warn('[settleOrder] Edge unreachable:', edgeErr.message);
    }
  }

  console.warn('[settleOrder] Edge server unreachable — queuing settlement for retry');
  try {
    await addPendingAction({
      requestId: settleRequestId,
      entityId: orderId,
      entityType: 'settlement',
      actionType: 'settle-order',
      url: '/api/edge/order/settle',
      method: 'POST',
      body: {
        orderId,
        requestId: settleRequestId,
        removedItemIds: removedItemIds || [],
        removedBy,
        ...extraSettleData,
      },
      createdAt: Date.now(),
      status: 'pending',
    });
    return { success: false, error: 'Edge server unreachable — settlement queued for retry', offline: true, queued: true };
  } catch (queueErr) {
    console.error('[settleOrder] Failed to queue settlement:', queueErr);
    return { success: false, error: 'Edge server unreachable', offline: false };
  }
}

// ── Settlement queue: retry queued settlements when edge comes back ──────────
// When edge is briefly down (restart, crash), settlements are queued in
// IndexedDB. This function drains the queue by retrying each settlement.
// Called periodically from the cashier dashboard.

export async function drainSettlementQueue() {
  const actions = await getPendingActionsByType('settle-order');
  if (actions.length === 0) return { drained: 0, remaining: 0 };

  const edgeUp = isEdgeLocalAuth() || await isEdgeAvailable();
  if (!edgeUp) return { drained: 0, remaining: actions.length };

  let drained = 0;
  for (const action of actions) {
    if (action.status === 'synced') continue;
    try {
      const result = await edgeFetch('/api/edge/order/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.body),
      });
      if (result && result.success) {
        await removePendingAction(action.id);
        drained++;
        console.log(`[settleQueue] Drained settlement for orderId=${action.body.orderId}`);
      }
    } catch (err) {
      console.warn(`[settleQueue] Retry failed for orderId=${action.body.orderId}:`, err.message);
      break; // edge went down again — stop draining
    }
  }

  return { drained, remaining: actions.length - drained };
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

  // ── Edge server first (local SQLite, instant) ───────────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const result = await edgeFetch('/api/edge/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txnBody),
      });
      if (result && result.success) return { id: result.transaction.id, transaction: result.transaction };
    } catch (edgeErr) {
      if (edgeErr?.statusCode) throw edgeErr;
      if (useEdgeDirect) {
        console.warn('[Edge] saveTransaction edge failed, queuing offline:', edgeErr.message);
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
      console.warn('[Edge] saveTransaction failed, falling through:', edgeErr.message);
    }
  }

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

export async function fetchTransactions(restaurantId, limit = 2000, date = null, month = null, outletId = null) {
  // For edge-local (PIN) auth, fetch settled orders + walk-in transactions
  // from the edge server's local SQLite via GET /api/edge/transactions.
  if (isEdgeLocalAuth()) {
    try {
      const qs = new URLSearchParams();
      if (limit != null && limit > 0) qs.set('limit', String(limit));
      if (date) qs.set('date', date);
      if (month) qs.set('month', month);
      const data = await edgeFetch(`/api/edge/transactions?${qs}`);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('[fetchTransactions] Edge fetch failed:', err.message);
      return [];
    }
  }
  const qs = new URLSearchParams({ restaurantId });
  if (limit != null && limit > 0) qs.set('limit', String(limit));
  if (date)  qs.set('date',  date);   // 'YYYY-MM-DD'
  if (outletId) qs.set('outletId', outletId);
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

  // ── Edge server first (local SQLite, instant) ───────────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const result = await edgeFetch('/api/edge/order/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, orderItemId, cancelledBy, tableNumber, cancelQuantity, requestId: cancelRequestId, localPrinted }),
      });
      if (result && result.success) return result;
    } catch (edgeErr) {
      if (edgeErr?.statusCode) throw edgeErr;
      if (useEdgeDirect) {
        console.warn('[Edge] cancelOrderItem edge failed, queuing offline:', edgeErr.message);
        await addPendingAction({
          requestId: cancelRequestId,
          entityId: orderId,
          entityType: 'order',
          actionType: 'cancel-item',
          url: `/api/orders/${orderId}/cancel-item`,
          method: 'PATCH',
          body: { orderItemId, cancelledBy, tableNumber, cancelQuantity, requestId: cancelRequestId, localPrinted },
          dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
        });
        return { offline: true };
      }
      console.warn('[Edge] cancelOrderItem failed, falling through:', edgeErr.message);
    }
  }

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
      body: { orderItemId, cancelledBy, tableNumber, cancelQuantity, requestId: cancelRequestId, localPrinted },
      dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
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
            body: JSON.stringify({ orderItemId, cancelledBy, tableNumber, cancelQuantity, requestId: cancelRequestId, localPrinted }),
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
        body: { orderItemId, cancelledBy, tableNumber, cancelQuantity, requestId: cancelRequestId, localPrinted },
        dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
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
  const cloudRequestId = generateRequestId();
  // ── Edge server first (local SQLite, instant) ───────────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const result = await edgeFetch('/api/edge/order/swap-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceTableId: sourceTableBackendId, targetTableId: targetTableBackendId, swappedBy, requestId: cloudRequestId }),
      });
      if (result && result.success) return result;
    } catch (edgeErr) {
      if (edgeErr?.statusCode) throw edgeErr;
      if (useEdgeDirect) {
        console.warn('[Edge] swapTable edge failed, queuing offline:', edgeErr.message);
        await addPendingAction({
          requestId: cloudRequestId,
          entityId: sourceTableBackendId,
          entityType: 'table',
          actionType: 'swap-table',
          url: `/api/tables/${sourceTableBackendId}/swap`,
          method: 'POST',
          body: { targetTableId: targetTableBackendId, swappedBy, restaurantId, requestId: cloudRequestId },
        });
        return { offline: true };
      }
      console.warn('[Edge] swapTable failed, falling through:', edgeErr.message);
    }
  }
  // Fast path: if backend is known unreachable, queue instantly.
  if (!isBackendReachable()) {
    console.warn('[Offline] Backend unreachable — fast-pathing table swap');
    await addPendingAction({
      requestId: cloudRequestId,
      entityId: sourceTableBackendId,
      entityType: 'table',
      actionType: 'swap-table',
      url: `/api/tables/${sourceTableBackendId}/swap`,
      method: 'POST',
      body: { targetTableId: targetTableBackendId, swappedBy, restaurantId, requestId: cloudRequestId },
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
            body: JSON.stringify({ targetTableId: targetTableBackendId, swappedBy, restaurantId, requestId: cloudRequestId }),
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
      await addPendingAction({
        requestId: cloudRequestId,
        entityId: sourceTableBackendId,
        entityType: 'table',
        actionType: 'swap-table',
        url: `/api/tables/${sourceTableBackendId}/swap`,
        method: 'POST',
        body: { targetTableId: targetTableBackendId, swappedBy, restaurantId, requestId: cloudRequestId },
      });
      return { offline: true };
    }
    throw apiErr;
  }
}

export async function editBill(orderId, { removedItemIds = [], editQuantities = {}, addedItems = [], editedBy = 'Cashier' }) {
  // ── Edge server first (local SQLite, instant) ───────────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const result = await edgeFetch('/api/edge/order/edit-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, removedItemIds, editQuantities, addedItems, editedBy }),
      });
      if (result && result.success) return result;
    } catch (edgeErr) {
      if (edgeErr?.statusCode) throw edgeErr;
      if (useEdgeDirect) {
        console.warn('[Edge] editBill edge failed, queuing offline:', edgeErr.message);
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
      console.warn('[Edge] editBill failed, falling through:', edgeErr.message);
    }
  }
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
  // ── Edge server first (local SQLite, instant) ───────────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const result = await edgeFetch('/api/edge/order/transfer-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceTableId: sourceTableBackendId, targetTableId: targetTableBackendId, orderItemIds: itemIds, transferredBy }),
      });
      if (result && result.success) return result;
    } catch (edgeErr) {
      if (edgeErr?.statusCode) throw edgeErr;
      if (useEdgeDirect) {
        console.warn('[Edge] transferItems edge failed, queuing offline:', edgeErr.message);
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
      console.warn('[Edge] transferItems failed, falling through:', edgeErr.message);
    }
  }
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

export async function deleteTransaction(transactionId, restaurantId, password) {
  // Password-gated deletes must never be silently queued offline; require a live server.
  if (!password) {
    throw new Error('Password is required to delete a transaction');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(apiUrl(`/api/transactions/${transactionId}?restaurantId=${restaurantId}`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authService.getAuthHeader() },
      body: JSON.stringify({ password }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete transaction');
    }
    return res.json();
  } finally { clearTimeout(timeoutId); }
}

export async function confirmPayment(transactionId, { paymentMethod = 'CASH', cashAmount, cardAmount, tipAmount, cashTipAmount, cardTipAmount } = {}) {
  const body = { paymentMethod };
  if (paymentMethod === 'MIXED') {
    body.cashAmount = cashAmount != null ? Number(cashAmount) : 0;
    body.cardAmount = cardAmount != null ? Number(cardAmount) : 0;
  } else if (paymentMethod === 'CASH' && cashAmount != null) {
    body.cashAmount = Number(cashAmount);
  }
  if (tipAmount != null) body.tipAmount = Number(tipAmount);
  if (cashTipAmount != null) body.cashTipAmount = Number(cashTipAmount);
  if (cardTipAmount != null) body.cardTipAmount = Number(cardTipAmount);

  // ── Edge server first (local SQLite, instant) ───────────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const result = await edgeFetch('/api/edge/order/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, ...body }),
      });
      if (result && result.success) return result;
    } catch (edgeErr) {
      if (edgeErr?.statusCode) throw edgeErr;
      if (useEdgeDirect) {
        console.warn('[Edge] confirmPayment edge failed, queuing offline:', edgeErr.message);
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
      console.warn('[Edge] confirmPayment failed, falling through:', edgeErr.message);
    }
  }

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

  // ── Edge server only (local SQLite, assigns real bill number + prints) ──────
  // Edge-first: print bill must go directly to edge — no queuing, no cloud fallback.
  // Cloud sync happens later via the edge sync worker, not during print.
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      console.log('[printBill] Sending to edge:', { orderId, restaurantId, localPrinted });
      const edgeResult = await edgeFetch('/api/edge/order/print-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, restaurantId, tableNumber, discountPercent, kotNumbers, localPrinted, billEventId }),
      });
      if (edgeResult && edgeResult.success) {
        return edgeResult;
      }
      return { success: false, error: edgeResult?.error || 'Print bill failed on edge', offline: false, localPrinted, order: { id: orderId } };
    } catch (edgeErr) {
      if (edgeErr?.status) {
        console.warn('[Edge] printBill edge rejected:', edgeErr.status, edgeErr.message);
        return { success: false, error: edgeErr.message, offline: false, localPrinted, order: { id: orderId } };
      }
      console.warn('[Edge] printBill edge unreachable:', edgeErr.message);
    }
  }

  console.warn('[Edge] Edge server unreachable for print-bill — returning error (no queue)');
  return { success: false, error: 'Edge server unreachable', offline: false, localPrinted, order: { id: orderId } };
}

export { generateRequestId };

export async function cancelOrderItems(orderId, items, cancelledBy, tableNumber, requestId = null, localPrinted = false) {
  // items: Array<{ orderItemId: string, cancelQuantity: number }>
  const cancelRequestId = requestId || generateRequestId();

  // ── Edge server first (local SQLite, instant) ───────────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const result = await edgeFetch('/api/edge/order/cancel-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, items, cancelledBy, tableNumber, requestId: cancelRequestId, localPrinted }),
      });
      if (result && result.success) return result;
    } catch (edgeErr) {
      if (edgeErr?.statusCode) throw edgeErr;
      if (useEdgeDirect) {
        console.warn('[Edge] cancelOrderItems edge failed, queuing offline:', edgeErr.message);
        await addPendingAction({
          requestId: cancelRequestId,
          entityId: orderId,
          entityType: 'order',
          actionType: 'cancel-items',
          url: `/api/orders/${orderId}/cancel-items`,
          method: 'PATCH',
          body: { items, cancelledBy, tableNumber, requestId: cancelRequestId, localPrinted },
          dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
        });
        return { offline: true };
      }
      console.warn('[Edge] cancelOrderItems failed, falling through:', edgeErr.message);
    }
  }

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
      body: { items, cancelledBy, tableNumber, requestId: cancelRequestId, localPrinted },
      dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
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
            body: JSON.stringify({ items, cancelledBy, tableNumber, requestId: cancelRequestId, localPrinted }),
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
        body: { items, cancelledBy, tableNumber, requestId: cancelRequestId, localPrinted },
        dependsOnOrderId: String(orderId).startsWith('offline-') ? orderId : null,
      });
      if (import.meta.env.DEV) {
        console.log('[Offline] Cancel items queued for sync:', orderId);
      }
      return { offline: true };
    }
    throw apiErr;
  }
}
