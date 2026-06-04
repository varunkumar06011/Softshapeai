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
  return (items || [])
    .map((item) => ({
      menuItemId: String(item.id || item.menuItemId || ''),  // never fall back to name
      name: item.name || item.n,
      price: Number(item.price ?? item.p ?? 0),
      quantity: Number(item.quantity ?? item.q ?? 1),
      notes: item.notes || null,
      menuType: String(item.menuType || 'FOOD').toUpperCase() === 'LIQUOR' ? 'LIQUOR' : 'FOOD',
    }))
    .filter(i => !!i.menuItemId);  // drop items with no valid DB ID
}

export async function createOrder({ tableId, tableNumber, items, restaurantId = RESTAURANT_ID }) {
  const orderData = { tableId, tableNumber, restaurantId, items: toOrderItems(items) };
  
  console.log("=== ORDER PAYLOAD ===");
  console.log(JSON.stringify(orderData, null, 2));

  const res = await fetch(apiUrl("/api/orders"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderData),
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

export async function updateOrderItems(orderId, items, requestId = null) {
  const body = { items: toOrderItems(items) };
  if (requestId) body.requestId = requestId;
  const res = await fetch(apiUrl(`/api/orders/${orderId}/items`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

export async function markOrderPaid(orderId, paymentMethod = 'CASH') {
  const res = await fetch(apiUrl(`/api/orders/${orderId}/pay`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentMethod }),
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
  subtotal,
  discountPercent,
  discountAmount,
  cgst,
  sgst,
  grandTotal,
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
  const res = await fetch(apiUrl(`/api/transactions?${qs}`), {
    cache: 'no-store',
  });
  return parseResponse(res);
}

export async function cancelOrderItem(orderId, orderItemId, cancelledBy, tableNumber, cancelQuantity = 1) {
  const res = await fetch(apiUrl(`/api/orders/${orderId}/cancel-item`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderItemId, cancelledBy, tableNumber, cancelQuantity }),
  });
  return parseResponse(res);
}

export async function swapTable(sourceTableBackendId, targetTableBackendId, swappedBy, restaurantId) {
  const res = await fetch(apiUrl(`/api/tables/${sourceTableBackendId}/swap`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetTableId: targetTableBackendId, swappedBy, restaurantId }),
  });
  return parseResponse(res);
}

export async function editBill(orderId, { removedItemIds = [], editQuantities = {}, addedItems = [], editedBy = 'Cashier' }) {
  const res = await fetch(apiUrl(`/api/orders/${orderId}/bill-edit`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ removedItemIds, editQuantities, addedItems, editedBy }),
  });
  return parseResponse(res);
}

export async function transferItems(sourceTableBackendId, targetTableBackendId, itemIds, transferredBy, restaurantId) {
  const res = await fetch(apiUrl(`/api/tables/${sourceTableBackendId}/transfer-items`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetTableId: targetTableBackendId, itemIds, transferredBy, restaurantId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to transfer items');
  }
  return res.json();
}

export async function deleteTransaction(transactionId, restaurantId) {
  const res = await fetch(apiUrl(`/api/transactions/${transactionId}?restaurantId=${restaurantId}`), {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete transaction');
  }
  return res.json();
}
