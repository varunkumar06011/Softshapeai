/**
 * Temporary V1 compatibility adapter.
 *
 * Purpose: Translate legacy V1 API calls into Runtime V2 command
 * workflows during the migration period.
 *
 * Rules:
 * - The adapter orchestrates command sequencing. If step 2 fails,
 *   step 3 is not called.
 * - The adapter contains NO business logic, NO calculations, NO
 *   validation. All business logic stays in Runtime command handlers.
 * - The adapter returns a V1-shaped response for comparison.
 * - V2 shadow execution failures are caught and never thrown to caller.
 *
 * Remove after V1 cutover.
 */

import { sendRuntimeCommand, queryRuntime, RuntimeV2Error } from '../runtimeV2Client.js';

// ── ID helpers ───────────────────────────────────────────────────────────────

function v2Id(v1EntityId, prefix) {
  return `v2-shadow-${prefix}-${v1EntityId}`;
}

function v2RequestId(v1RequestId, suffix) {
  return `v2-shadow-${v1RequestId}-${suffix}`;
}

// ── Workflow: Create Order ───────────────────────────────────────────────────
// V1 createOrder combines order + items + KOT in one call.
// V2 separates into CREATE_ORDER + ADD_ORDER_ITEMS + SEND_KOT.

export async function shadowCreateOrder(v1Request) {
  const orderId = v2Id(v1Request.requestId, 'order');
  const startTime = performance.now();
  const events = [];

  // Step 1: Create order
  const createResult = await sendRuntimeCommand('CREATE_ORDER', {
    orderId,
    tableId: v1Request.tableId,
    captainId: v1Request.captainName || null,
    platform: v1Request.platform || 'DINE_IN',
  }, v2RequestId(v1Request.requestId, 'create'));

  if (!createResult.ok) {
    return { ok: false, error: createResult.error, events, durationMs: performance.now() - startTime };
  }
  events.push('ORDER_CREATED');

  // Step 2: Add items (if any)
  if (v1Request.items && v1Request.items.length > 0) {
    const items = v1Request.items.map((item, idx) => ({
      id: v2Id(`${v1Request.requestId}-${idx}`, 'item'),
      menuItemId: item.menuItemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      notes: item.notes || null,
    }));

    const addResult = await sendRuntimeCommand('ADD_ORDER_ITEMS', {
      orderId,
      items,
    }, v2RequestId(v1Request.requestId, 'additems'));

    if (!addResult.ok) {
      return { ok: false, error: addResult.error, orderId, events, durationMs: performance.now() - startTime };
    }
    events.push('ORDER_ITEMS_ADDED');
  }

  // Step 3: Send KOT (if requested — V1 always sends KOT with order creation)
  if (v1Request.preReservedKotNumber !== undefined || v1Request.items) {
    const kotId = v2Id(v1Request.requestId, 'kot');
    const kotResult = await sendRuntimeCommand('SEND_KOT', {
      kotId,
      orderId,
      tableId: v1Request.tableId,
    }, v2RequestId(v1Request.requestId, 'kot'));

    if (!kotResult.ok) {
      return { ok: false, error: kotResult.error, orderId, events, durationMs: performance.now() - startTime };
    }
    events.push('KOT_SENT');
  }

  return {
    ok: true,
    orderId,
    kotId: v2Id(v1Request.requestId, 'kot'),
    events,
    eventIds: events,
    durationMs: performance.now() - startTime,
  };
}

// ── Workflow: Add Order Items ────────────────────────────────────────────────

export async function shadowAddOrderItems(v1Request) {
  const startTime = performance.now();
  const orderId = v2Id(v1Request.orderId || v1Request.requestId, 'order');
  const events = [];

  const items = (v1Request.items || []).map((item, idx) => ({
    id: v2Id(`${v1Request.requestId}-${idx}`, 'item'),
    menuItemId: item.menuItemId,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    notes: item.notes || null,
  }));

  const result = await sendRuntimeCommand('ADD_ORDER_ITEMS', {
    orderId,
    items,
  }, v2RequestId(v1Request.requestId, 'additems'));

  if (!result.ok) {
    return {
      ok: false,
      orderId,
      events,
      durationMs: performance.now() - startTime,
      error: result.error,
    };
  }
  events.push('ORDER_ITEMS_ADDED');

  // V1 updateOrderItems also sends a KOT — chain SEND_KOT if KOT was requested
  if (v1Request.preReservedKotNumber !== undefined || v1Request.kotEventIds) {
    const kotId = v2Id(v1Request.requestId, 'kot');
    const kotResult = await sendRuntimeCommand('SEND_KOT', {
      kotId,
      orderId,
      tableId: v1Request.tableId || '',
    }, v2RequestId(v1Request.requestId, 'kot'));

    if (!kotResult.ok) {
      return {
        ok: false,
        orderId,
        events,
        durationMs: performance.now() - startTime,
        error: kotResult.error,
      };
    }
    events.push('KOT_SENT');
  }

  return {
    ok: true,
    orderId,
    events,
    eventIds: events,
    durationMs: performance.now() - startTime,
  };
}

// ── Workflow: Cancel Order Item ──────────────────────────────────────────────

export async function shadowCancelOrderItem(v1Request) {
  const startTime = performance.now();
  const orderId = v2Id(v1Request.orderId || v1Request.requestId, 'order');
  const orderItemId = v2Id(v1Request.orderItemId || v1Request.itemId, 'item');

  const result = await sendRuntimeCommand('CANCEL_ORDER_ITEM', {
    orderId,
    orderItemId,
  }, v2RequestId(v1Request.requestId, 'cancel'));

  return {
    ok: result.ok,
    orderId,
    orderItemId,
    events: result.ok ? ['ORDER_ITEM_CANCELLED'] : [],
    eventIds: result.ok ? ['ORDER_ITEM_CANCELLED'] : [],
    durationMs: performance.now() - startTime,
    error: result.ok ? null : result.error,
  };
}

// ── Workflow: Send KOT ───────────────────────────────────────────────────────

export async function shadowSendKot(v1Request) {
  const startTime = performance.now();
  const orderId = v2Id(v1Request.orderId || v1Request.requestId, 'order');
  const kotId = v2Id(v1Request.kotId || v1Request.requestId, 'kot');

  const result = await sendRuntimeCommand('SEND_KOT', {
    kotId,
    orderId,
    tableId: v1Request.tableId,
  }, v2RequestId(v1Request.requestId, 'kot'));

  return {
    ok: result.ok,
    kotId,
    orderId,
    events: result.ok ? ['KOT_SENT'] : [],
    eventIds: result.ok ? ['KOT_SENT'] : [],
    durationMs: performance.now() - startTime,
    error: result.ok ? null : result.error,
  };
}

// ── Workflow: Generate Bill ──────────────────────────────────────────────────

export async function shadowGenerateBill(v1Request) {
  const startTime = performance.now();
  const orderId = v2Id(v1Request.orderId || v1Request.requestId, 'order');
  const billId = v2Id(v1Request.billId || v1Request.requestId, 'bill');

  const result = await sendRuntimeCommand('GENERATE_BILL', {
    billId,
    orderId,
    taxRate: v1Request.taxRate ?? 5,
    serviceChargePercent: v1Request.serviceChargePercent ?? 0,
  }, v2RequestId(v1Request.requestId, 'bill'));

  return {
    ok: result.ok,
    billId,
    orderId,
    events: result.ok ? ['BILL_GENERATED'] : [],
    eventIds: result.ok ? ['BILL_GENERATED'] : [],
    durationMs: performance.now() - startTime,
    error: result.ok ? null : result.error,
    result: result.ok ? result.result : null,
  };
}

// ── Query V2 state for comparison ────────────────────────────────────────────

export async function queryV2OrderState(orderId) {
  try {
    const orderRes = await queryRuntime('order', { orderId });
    const itemsRes = await queryRuntime('order-items', { orderId });
    const kotsRes = await queryRuntime('kots-for-order', { orderId });
    const billRes = await queryRuntime('bill-for-order', { orderId });

    return {
      order: orderRes?.data || null,
      items: itemsRes?.data || [],
      kots: kotsRes?.data || [],
      bill: billRes?.data || null,
    };
  } catch (err) {
    if (err instanceof RuntimeV2Error) {
      return { order: null, items: [], kots: [], bill: null, error: err.message };
    }
    throw err;
  }
}

// ── V1 Shadow Executors (M2.6A — cutover mode) ───────────────────────────────
// These functions call V1 edge endpoints in shadow mode. Used when V2 is
// primary and V1 is the comparison engine. Built now but NOT activated until
// cutover deployment (migrationMode = "cutover").
//
// The V1 shadow executor calls the same V1 edge endpoints that orderApi.js
// normally calls, but in a read-only/shadow capacity — it does NOT drive the
// UI or trigger printing.

import { getEdgeUrl, getStoredEdgeRuntimeToken } from '../edgeHealth.js';

async function v1EdgeRequest(path, body) {
  const runtimeToken = getStoredEdgeRuntimeToken();
  if (!runtimeToken) {
    return { ok: false, error: 'No runtime token for V1 shadow' };
  }

  const startTime = performance.now();
  try {
    const res = await fetch(`${getEdgeUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${runtimeToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      ...data,
      durationMs: performance.now() - startTime,
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'V1 shadow request failed',
      durationMs: performance.now() - startTime,
    };
  }
}

export async function executeV1ShadowCreateOrder(v2Request) {
  return await v1EdgeRequest('/api/edge/orders', {
    tableId: v2Request.tableId,
    tableNumber: v2Request.tableNumber,
    items: v2Request.items || [],
    requestId: v2Request.requestId,
    captainName: v2Request.captainName,
    isExtraTable: v2Request.isExtraTable || false,
    sectionTag: v2Request.sectionTag,
    platform: v2Request.platform,
  });
}

export async function executeV1ShadowAddOrderItems(v2Request) {
  return await v1EdgeRequest('/api/edge/orders/update-items', {
    orderId: v2Request.orderId,
    items: v2Request.items || [],
    requestId: v2Request.requestId,
  });
}

export async function executeV1ShadowCancelOrderItem(v2Request) {
  return await v1EdgeRequest('/api/edge/orders/cancel-item', {
    orderId: v2Request.orderId,
    orderItemId: v2Request.orderItemId,
    requestId: v2Request.requestId,
  });
}

export async function executeV1ShadowSendKot(v2Request) {
  return await v1EdgeRequest('/api/edge/orders/send-kot', {
    orderId: v2Request.orderId,
    kotId: v2Request.kotId,
    requestId: v2Request.requestId,
  });
}

export async function executeV1ShadowGenerateBill(v2Request) {
  return await v1EdgeRequest('/api/edge/orders/generate-bill', {
    orderId: v2Request.orderId,
    billId: v2Request.billId,
    taxRate: v2Request.taxRate,
    serviceChargePercent: v2Request.serviceChargePercent,
    requestId: v2Request.requestId,
  });
}
