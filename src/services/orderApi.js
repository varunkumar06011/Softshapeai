import { apiUrl } from "./apiConfig";
import { RESTAURANT_ID } from "./tableApi";

async function parseResponse(res) {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function toOrderItems(items) {
  return (items || []).map((item) => ({
    menuItemId: String(item.id || item.menuItemId || item.n || item.name),
    name: item.name || item.n,
    price: Number(item.price ?? item.p ?? 0),
    quantity: Number(item.quantity ?? item.q ?? 1),
    notes: item.notes || null,
    menuType: (item.menuType || item.type || "FOOD").toUpperCase() === "LIQUOR" ? "LIQUOR" : "FOOD",
  }));
}

export async function createOrder({ tableId, items, restaurantId = RESTAURANT_ID }) {
  const res = await fetch(apiUrl("/api/orders"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tableId, restaurantId, items: toOrderItems(items) }),
  });
  return parseResponse(res);
}

export async function fetchOrders({ restaurantId = RESTAURANT_ID, status } = {}) {
  const qs = new URLSearchParams({ restaurantId });
  if (status) qs.set("status", status);
  const res = await fetch(apiUrl(`/api/orders?${qs.toString()}`), {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  return parseResponse(res);
}

export async function fetchTableOrder(tableId) {
  const res = await fetch(apiUrl(`/api/orders/table/${tableId}`), {
    cache: "no-store",
  });
  return parseResponse(res);
}

export async function updateOrderItems(orderId, items) {
  const res = await fetch(apiUrl(`/api/orders/${orderId}/items`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: toOrderItems(items) }),
  });
  return parseResponse(res);
}

export async function updateOrderStatus(orderId, status) {
  const res = await fetch(apiUrl(`/api/orders/${orderId}/status`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  return parseResponse(res);
}

export async function requestBilling(orderId) {
  const res = await fetch(apiUrl(`/api/orders/${orderId}/request-billing`), {
    method: "POST",
  });
  return parseResponse(res);
}

export async function markOrderPaid(orderId) {
  const res = await fetch(apiUrl(`/api/orders/${orderId}/pay`), {
    method: "POST",
  });
  return parseResponse(res);
}

export async function settleOrder(orderId, removedItemIds, removedBy = 'Cashier') {
  const res = await fetch(apiUrl(`/api/orders/${orderId}/settle`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ removedItemIds, removedBy }),
  });
  return parseResponse(res);
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
}) {
  const res = await fetch(apiUrl('/api/transactions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurantId,
      orderId,
      tableNumber,
      captainId,
      amount,
      method,
      itemCount,
      items,
    }),
  });
  return parseResponse(res);
}

export async function fetchTransactions(restaurantId, limit = 100, date = null, month = null) {
  const qs = new URLSearchParams({ restaurantId, limit: String(limit) });
  if (date)  qs.set('date',  date);   // 'YYYY-MM-DD'
  if (month) qs.set('month', month);  // 'YYYY-MM'
  const res = await fetch(apiUrl(`/api/transactions?${qs}`), {
    cache: 'no-store',
  });
  return parseResponse(res);
}

export async function cancelOrderItem(orderId, orderItemId, cancelledBy, tableNumber) {
  const res = await fetch(apiUrl(`/api/orders/${orderId}/cancel-item`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderItemId, cancelledBy, tableNumber }),
  });
  return parseResponse(res);
}
