// ─────────────────────────────────────────────────────────────────────────────
// edgeApi.js — Edge-first API wrappers for hot-path operations
// ─────────────────────────────────────────────────────────────────────────────
// Wraps the captain app's hot-path API calls with automatic edge server routing.
// When the edge server is available (localhost:3100), these functions route
// to it for instant local responses. When edge is down, they transparently
// fall back to the cloud backend via apiFetch.
//
// Usage:
//   import { edgeCreateOrder, edgeGetTables, edgeGetMenu, ... } from './edgeApi';
//
//   // Instead of:  const result = await createOrder({ ... });
//   // Use:         const result = await edgeCreateOrder({ ... });
//
// The edge server handles:
//   - Order creation + KOT printing (15-40ms vs 500-800ms cloud)
//   - Table reads with active orders + KOTs
//   - Menu reads with venue-specific pricing
//   - KOT cancel + reprint
// ─────────────────────────────────────────────────────────────────────────────

import { apiFetch } from './apiConfig';
import { smartRoute, edgeFetch, isEdgeAvailable, getEdgeUrl } from './edgeClient';
import { toOrderItems } from './orderApi';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';

// ── Generate unique request ID for idempotency ───────────────────────────────

function generateRequestId() {
  return (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36));
}

// ── Order creation (the critical hot path) ───────────────────────────────────

/**
 * Create order via edge server (or cloud fallback).
 * This is the fastest path: edge writes to local SQLite + prints KOT directly.
 *
 * @param {object} params - Same params as orderApi.createOrder
 * @returns {Promise<object>} - Order result with orderId, kotNumber, printResults
 */
export async function edgeCreateOrder({
  tableId,
  tableNumber,
  items,
  restaurantId = getCurrentRestaurantId(),
  requestId = null,
  captainName = null,
  captainId = null,
  isExtraTable = false,
  sectionTag = null,
  platform = null,
  timeoutMs = 8000,
  localPrinted = false,
  preReservedKotNumber = null,
  kotEventIds = null,
  orderByRole = null,
}) {
  const orderData = {
    tableId,
    items: toOrderItems(items),
    requestId: requestId || generateRequestId(),
  };

  if (captainName) orderData.captainName = captainName;
  if (captainId) orderData.captainId = captainId;
  if (platform) orderData.platform = platform;
  if (orderByRole) orderData.orderByRole = orderByRole;

  // Use smartRoute — tries edge first, falls back to cloud apiFetch
  return smartRoute('POST', '/api/orders', {
    method: 'POST',
    body: JSON.stringify(orderData),
    timeout: timeoutMs,
  }, apiFetch);
}

// ── Cancel KOT item ──────────────────────────────────────────────────────────

export async function edgeCancelKotItem({
  orderId,
  orderItemId,
  cancelQuantity,
  cancelledBy = 'Staff',
  tableNumber,
  requestId = null,
}) {
  const body = {
    orderId,
    orderItemId,
    cancelQuantity,
    cancelledBy,
    tableNumber,
    requestId: requestId || generateRequestId(),
  };

  return smartRoute('POST', '/api/orders/cancel', {
    method: 'POST',
    body: JSON.stringify(body),
    timeout: 8000,
  }, apiFetch);
}

// ── Reprint KOT ──────────────────────────────────────────────────────────────

export async function edgeReprintKot({ orderId, kotNumber = null }) {
  const body = { orderId };
  if (kotNumber) body.kotNumber = kotNumber;

  return smartRoute('POST', '/api/orders/reprint-kot', {
    method: 'POST',
    body: JSON.stringify(body),
    timeout: 8000,
  }, apiFetch);
}

// ── Table reads ──────────────────────────────────────────────────────────────

/**
 * Get all tables with sections, active orders, and KOTs.
 * Routes to edge server for instant local read when available.
 */
export async function edgeGetTables() {
  return smartRoute('GET', '/api/tables', {
    method: 'GET',
  }, apiFetch);
}

/**
 * Get flat list of all tables.
 */
export async function edgeGetTablesFlat() {
  return smartRoute('GET', '/api/tables/flat', {
    method: 'GET',
  }, apiFetch);
}

// ── Section reads ────────────────────────────────────────────────────────────

export async function edgeGetSections() {
  return smartRoute('GET', '/api/sections', {
    method: 'GET',
  }, apiFetch);
}

// ── Menu reads ───────────────────────────────────────────────────────────────

/**
 * Get full menu with categories, items, variants, addons.
 * @param {string} venueId - Optional venue ID for venue-specific pricing
 */
export async function edgeGetMenu(venueId = null) {
  const path = venueId ? `/api/menu?venueId=${venueId}` : '/api/menu';
  return smartRoute('GET', path, {
    method: 'GET',
  }, apiFetch);
}

/**
 * Get lean flat menu items list for POS.
 * @param {string} venueId - Optional venue ID for venue-specific pricing
 */
export async function edgeGetMenuItems(venueId = null) {
  const path = venueId ? `/api/menu/items?venueId=${venueId}` : '/api/menu/items';
  return smartRoute('GET', path, {
    method: 'GET',
  }, apiFetch);
}

// ── Venue reads ──────────────────────────────────────────────────────────────

export async function edgeGetVenues() {
  return smartRoute('GET', '/api/venues', {
    method: 'GET',
  }, apiFetch);
}

// ── Outlet settings ──────────────────────────────────────────────────────────

export async function edgeGetOutlet() {
  if (!isEdgeAvailable()) return null;
  try {
    return await edgeFetch('/api/edge/outlet', { method: 'GET' });
  } catch {
    return null;
  }
}

// ── Edge sync status (edge-only, no cloud fallback) ──────────────────────────

export async function edgeGetSyncStatus() {
  if (!isEdgeAvailable()) return null;
  try {
    return await edgeFetch('/api/edge/sync/status', { method: 'GET' });
  } catch {
    return null;
  }
}

export async function edgeGetSocketStatus() {
  if (!isEdgeAvailable()) return null;
  try {
    return await edgeFetch('/api/edge/sync/socket', { method: 'GET' });
  } catch {
    return null;
  }
}

export async function edgeManualSyncPush() {
  if (!isEdgeAvailable()) return { ok: false, error: 'Edge not available' };
  try {
    return await edgeFetch('/api/edge/sync/push', { method: 'POST' });
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Batch convenience: preload all hot-path data from edge ───────────────────

/**
 * Preload all hot-path data from the edge server in parallel.
 * Useful for initial app load — gets tables, menu, sections, venues in one round.
 * Falls back to cloud for each if edge is unavailable.
 *
 * @param {string} venueId - Optional venue ID for menu pricing
 * @returns {Promise<{ tables, menu, sections, venues }>}
 */
export async function edgePreloadAll(venueId = null) {
  const [tables, menu, sections, venues] = await Promise.allSettled([
    edgeGetTables(),
    edgeGetMenu(venueId),
    edgeGetSections(),
    edgeGetVenues(),
  ]);

  return {
    tables: tables.status === 'fulfilled' ? tables.value : null,
    menu: menu.status === 'fulfilled' ? menu.value : null,
    sections: sections.status === 'fulfilled' ? sections.value : null,
    venues: venues.status === 'fulfilled' ? venues.value : null,
  };
}

// ── Export edge client utilities for components that need them ───────────────

export { isEdgeAvailable, getEdgeUrl, subscribeEdgeAvailability } from './edgeClient';
