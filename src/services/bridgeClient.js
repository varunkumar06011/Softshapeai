// ─────────────────────────────────────────────────────────────────────────────
// bridgeClient.js — Centralized bridge (edge server) client for POS hot paths
// ─────────────────────────────────────────────────────────────────────────────
// Single entry point for all edge server communication used by Captain and
// Cashier. Wraps edgeFetch with tenant binding, readiness checks, and
// normalized response shapes. POS components should use this instead of
// calling edgeFetch directly.
//
// Responsibilities:
//   - Health/session status
//   - Menu snapshot fetch (flat POS items)
//   - Tables/sections/venues reads
//   - Outlet settings
//   - Staff listing
//   - Config version metadata
//
// Does NOT handle order creation, billing, or print jobs — those remain in
// their existing service modules until later phases migrate them.
// ─────────────────────────────────────────────────────────────────────────────

import { edgeFetch, isEdgeAvailable, getEdgeUrl, isEdgeLocalAuth, waitForEdgeReady, EDGE_READ_TIMEOUT_MS } from './edgeHealth';

// ── Bridge status ────────────────────────────────────────────────────────────

export async function getBridgeStatus() {
  return edgeFetch('/api/edge/status', { timeoutMs: EDGE_READ_TIMEOUT_MS });
}

export async function isBridgeReady() {
  const available = await isEdgeAvailable();
  if (!available) return false;
  try {
    const status = await getBridgeStatus();
    return !!(status?.registered && status?.sessionValid && status?.localStats?.menuItems > 0);
  } catch {
    return false;
  }
}

export async function waitForBridge(timeoutMs = 15_000) {
  return waitForEdgeReady(timeoutMs);
}

// ── Config version ───────────────────────────────────────────────────────────

let _cachedConfigVersion = null;

export function getCachedConfigVersion() {
  return _cachedConfigVersion;
}

export async function getConfigVersion() {
  try {
    const version = await edgeFetch('/api/edge/config/version', { timeoutMs: EDGE_READ_TIMEOUT_MS });
    _cachedConfigVersion = {
      ...version,
      fetchedAt: Date.now(),
    };
    return _cachedConfigVersion;
  } catch {
    return _cachedConfigVersion;
  }
}

// ── Menu snapshot ────────────────────────────────────────────────────────────

export async function fetchBridgeMenuItems(venueId) {
  const params = venueId ? `?venueId=${encodeURIComponent(venueId)}` : '';
  return edgeFetch(`/api/edge/menu/items${params}`, { timeoutMs: EDGE_READ_TIMEOUT_MS });
}

export async function fetchBridgeFullMenu(venueId) {
  const params = venueId ? `?venueId=${encodeURIComponent(venueId)}` : '';
  return edgeFetch(`/api/edge/menu${params}`, { timeoutMs: EDGE_READ_TIMEOUT_MS });
}

// ── Tables / sections / venues ───────────────────────────────────────────────

export async function fetchBridgeTables() {
  return edgeFetch('/api/edge/tables', { timeoutMs: EDGE_READ_TIMEOUT_MS });
}

export async function fetchBridgeTablesFlat() {
  return edgeFetch('/api/edge/tables/flat', { timeoutMs: EDGE_READ_TIMEOUT_MS });
}

export async function fetchBridgeSections() {
  return edgeFetch('/api/edge/sections', { timeoutMs: EDGE_READ_TIMEOUT_MS });
}

export async function fetchBridgeVenues() {
  return edgeFetch('/api/edge/venues', { timeoutMs: EDGE_READ_TIMEOUT_MS });
}

// ── Outlet settings ──────────────────────────────────────────────────────────

export async function fetchBridgeOutlet() {
  return edgeFetch('/api/edge/outlet', { timeoutMs: EDGE_READ_TIMEOUT_MS });
}

// ── Staff ────────────────────────────────────────────────────────────────────

export async function fetchBridgeStaff() {
  return edgeFetch('/api/edge/staff', { timeoutMs: EDGE_READ_TIMEOUT_MS });
}

// ── Tenant binding ───────────────────────────────────────────────────────────

let _tenantRestaurantId = null;

export function setTenantRestaurantId(restaurantId) {
  _tenantRestaurantId = restaurantId;
}

export function getTenantRestaurantId() {
  return _tenantRestaurantId;
}

export function getBridgeUrl() {
  return getEdgeUrl();
}

export function isBridgeLocalAuth() {
  return isEdgeLocalAuth();
}

// ── Print job queue management ───────────────────────────────────────────────

export async function fetchBridgePrintJobs({ status, orderId, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (orderId) params.set('orderId', orderId);
  params.set('limit', String(limit));
  return edgeFetch(`/api/edge/print-jobs?${params.toString()}`, { timeoutMs: EDGE_READ_TIMEOUT_MS });
}

export async function retryBridgePrintJobs() {
  return edgeFetch('/api/edge/print-jobs/retry', { method: 'POST' });
}

export async function cancelBridgePrintJob(eventId) {
  return edgeFetch('/api/edge/print-jobs/cancel', {
    method: 'POST',
    body: JSON.stringify({ eventId }),
  });
}

export async function reprintBridgePrintJob(eventId, newEventId) {
  return edgeFetch('/api/edge/print-jobs/reprint', {
    method: 'POST',
    body: JSON.stringify({ eventId, newEventId }),
  });
}

export async function testBridgePrint(printerName) {
  return edgeFetch('/api/edge/print-jobs/test', {
    method: 'POST',
    body: JSON.stringify({ printerName }),
  });
}
