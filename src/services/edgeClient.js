// ─────────────────────────────────────────────────────────────────────────────
// edgeClient.js — Edge server detection and routing
// ─────────────────────────────────────────────────────────────────────────────
// Detects whether the SoftShape Edge Server is running on localhost (bundled
// with the Tauri app) and provides utilities to route hot-path API calls
// to the edge server instead of the cloud backend.
//
// Routing strategy:
//   1. Hot-path calls (order creation, KOT printing, table reads) → edge server
//   2. Everything else (auth, reports, settings) → cloud backend
//   3. If edge server is down → fall back to cloud (transparent degradation)
//
// Edge server URL: http://localhost:3100 (configurable via VITE_EDGE_URL)
// ─────────────────────────────────────────────────────────────────────────────

const EDGE_URL =
  import.meta.env.VITE_EDGE_URL ||
  (typeof window !== 'undefined' && window.__SOFTSHAPE_EDGE_URL__) ||
  'http://localhost:3100';

// ── Edge availability state ──────────────────────────────────────────────────

let edgeAvailable = false;
let edgeCheckInProgress = false;
let lastEdgeCheckAt = 0;
let consecutiveEdgeFailures = 0;

const EDGE_CHECK_INTERVAL_MS = 15_000; // Check every 15s
const EDGE_CHECK_TIMEOUT_MS = 2_000;   // 2s timeout — edge is localhost, should be instant
const EDGE_FAILURE_THRESHOLD = 2;      // Require 2 failures before marking unavailable

// ── Route mapping: cloud paths → edge paths ──────────────────────────────────

const EDGE_ROUTE_MAP = {
  // Hot-path write operations
  'POST /api/orders': '/api/edge/order',
  'POST /api/orders/cancel': '/api/edge/order/cancel',
  'POST /api/orders/reprint-kot': '/api/edge/kot/reprint',

  // Hot-path read operations
  'GET /api/tables': '/api/edge/tables',
  'GET /api/tables/flat': '/api/edge/tables/flat',
  'GET /api/sections': '/api/edge/sections',
  'GET /api/menu': '/api/edge/menu',
  'GET /api/menu/items': '/api/edge/menu/items',
  'GET /api/venues': '/api/edge/venues',
};

// Paths that should ONLY go to edge (no cloud fallback for reads — they're
// only used when edge is confirmed available). Writes always have cloud fallback.
const EDGE_ONLY_READS = new Set([
  '/api/edge/tables',
  '/api/edge/tables/flat',
  '/api/edge/sections',
  '/api/edge/menu',
  '/api/edge/menu/items',
  '/api/edge/venues',
  '/api/edge/outlet',
]);

// ── Public API ───────────────────────────────────────────────────────────────

/** Get the edge server base URL */
export function getEdgeUrl() {
  return EDGE_URL;
}

/** Synchronous check — is edge server available? (cached) */
export function isEdgeAvailable() {
  return edgeAvailable;
}

/** Get edge route for a cloud path + method, or null if not mapped */
export function getEdgeRoute(method, cloudPath) {
  const key = `${method.toUpperCase()} ${cloudPath}`;
  return EDGE_ROUTE_MAP[key] || null;
}

/** Check if a path is an edge-only read (no cloud fallback) */
export function isEdgeOnlyRead(path) {
  return EDGE_ONLY_READS.has(path);
}

// ── Edge health check ────────────────────────────────────────────────────────

const edgeSubscribers = new Set();

function notifyEdgeSubscribers() {
  edgeSubscribers.forEach((cb) => {
    try { cb(edgeAvailable); } catch { /* ignore */ }
  });
}

/** Subscribe to edge availability changes. Returns unsubscribe function. */
export function subscribeEdgeAvailability(callback) {
  edgeSubscribers.add(callback);
  return () => edgeSubscribers.delete(callback);
}

/** Async check: ping edge server /health endpoint */
export async function checkEdgeAvailability() {
  if (edgeCheckInProgress) return edgeAvailable;

  // Throttle: don't check more than once per 5 seconds
  const now = Date.now();
  if (now - lastEdgeCheckAt < 5_000) return edgeAvailable;

  edgeCheckInProgress = true;
  lastEdgeCheckAt = now;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EDGE_CHECK_TIMEOUT_MS);

  try {
    const res = await fetch(`${EDGE_URL}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      // Verify it's actually our edge server (not some other service on :3100)
      if (data.service === 'softshape-edge-server' || data.status === 'ok') {
        consecutiveEdgeFailures = 0;
        if (!edgeAvailable) {
          console.log('[EdgeClient] Edge server available — routing hot-path calls locally');
        }
        edgeAvailable = true;
        notifyEdgeSubscribers();
        return true;
      }
    }
    throw new Error('Invalid edge server response');
  } catch {
    consecutiveEdgeFailures++;
    if (consecutiveEdgeFailures >= EDGE_FAILURE_THRESHOLD && edgeAvailable) {
      console.warn(`[EdgeClient] Edge server unavailable after ${consecutiveEdgeFailures} failures — falling back to cloud`);
      edgeAvailable = false;
      notifyEdgeSubscribers();
    }
    return false;
  } finally {
    clearTimeout(timeout);
    edgeCheckInProgress = false;
  }
}

// ── Edge fetch — routes to edge server with auth ─────────────────────────────

/**
 * Fetch wrapper that sends requests to the edge server.
 * Automatically includes auth token from localStorage.
 *
 * @param {string} edgePath - Edge API path (e.g. '/api/edge/order')
 * @param {object} options - Fetch options (method, body, etc.)
 * @returns {Promise<any>} - Parsed JSON response
 */
export async function edgeFetch(edgePath, options = {}) {
  const token = localStorage.getItem('ss_token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutMs = Number(options.timeout) || 8000; // Edge is local — 8s max
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${EDGE_URL}${edgePath}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      let message = `Edge request failed (HTTP ${response.status})`;
      try {
        const body = await response.json();
        if (body.error) message = body.error;
      } catch { /* ignore */ }
      throw new Error(message);
    }

    return response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Edge server request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Smart router: try edge first, fall back to cloud ─────────────────────────

/**
 * Smart request router for hot-path calls.
 * If edge is available, routes to edge server.
 * If edge fails or is unavailable, falls back to cloud apiFetch.
 *
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} cloudPath - Cloud API path (e.g. '/api/orders')
 * @param {object} options - Request options { body, timeout, ... }
 * @param {function} cloudFetch - Cloud fetch function (apiFetch from apiConfig.js)
 * @returns {Promise<any>} - Parsed response
 */
export async function smartRoute(method, cloudPath, options, cloudFetch) {
  const edgePath = getEdgeRoute(method, cloudPath);

  // If no edge route exists for this path, go straight to cloud
  if (!edgePath) {
    return cloudFetch(cloudPath, options);
  }

  // If edge is not available, go to cloud
  if (!edgeAvailable) {
    return cloudFetch(cloudPath, options);
  }

  // Try edge server first
  try {
    const fetchOptions = {
      method: method.toUpperCase(),
      ...options,
    };

    // Transform body for edge format if needed
    if (options.body && typeof options.body === 'string') {
      fetchOptions.body = options.body; // Edge accepts same body format
    }

    return await edgeFetch(edgePath, fetchOptions);
  } catch (edgeErr) {
    // Edge failed — check if it's still alive
    if (edgeAvailable) {
      checkEdgeAvailability(); // Async recheck, don't block
    }

    // For reads (GET), if edge fails, don't fall back to cloud — the data
    // might be stale. Only fall back for writes (POST).
    if (method.toUpperCase() === 'GET' && isEdgeOnlyRead(edgePath)) {
      throw edgeErr;
    }

    // For writes, fall back to cloud
    console.warn(`[EdgeClient] Edge failed for ${method} ${cloudPath}, falling back to cloud:`, edgeErr.message);
    return cloudFetch(cloudPath, options);
  }
}

// ── Auto-start edge health check loop ────────────────────────────────────────

if (typeof window !== 'undefined') {
  // Initial check after 2s (let app settle)
  setTimeout(checkEdgeAvailability, 2_000);

  // Periodic check every 15s
  setInterval(checkEdgeAvailability, EDGE_CHECK_INTERVAL_MS);

  // Recheck immediately on online event
  window.addEventListener('online', () => {
    setTimeout(checkEdgeAvailability, 1_000);
  });
}

console.log('[EdgeClient] Edge server URL:', EDGE_URL);
