// ─────────────────────────────────────────────────────────────────────────────
// edgeHealth.js — Shared edge server availability check
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for edge server detection. Used by orderApi.js,
// tableApi.js, menuService.js, and any other service that needs to check
// if the local edge server (Bun sidecar) is running.
// ─────────────────────────────────────────────────────────────────────────────

const EDGE_URL =
  import.meta.env.VITE_EDGE_URL ||
  (typeof window !== 'undefined' && window.__SOFTSHAPE_EDGE_URL__) ||
  'http://localhost:3100';

const EDGE_CHECK_TIMEOUT_MS = 1500;
const EDGE_CHECK_INTERVAL_MS = 10_000;

let _edgeAvailable = false;
let _edgeLastCheck = 0;

export function getEdgeUrl() {
  return EDGE_URL;
}

export async function isEdgeAvailable() {
  const now = Date.now();
  if (now - _edgeLastCheck < EDGE_CHECK_INTERVAL_MS) return _edgeAvailable;
  _edgeLastCheck = now;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EDGE_CHECK_TIMEOUT_MS);
    const res = await fetch(`${EDGE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    _edgeAvailable = res.ok;
  } catch {
    _edgeAvailable = false;
  }
  return _edgeAvailable;
}

export async function edgeFetch(path, options = {}) {
  const res = await fetch(`${EDGE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) {
    let message = `Edge request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch { /* ignore */ }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}
