// ─────────────────────────────────────────────────────────────────────────────
// edgeHealth.js — Shared edge server availability check
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for edge server detection. Used by orderApi.js,
// tableApi.js, menuService.js, and any other service that needs to check
// if the local edge server (Bun sidecar) is running.
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE, getAuthHeaders } from "./apiConfig";

const EDGE_API_KEY_STORAGE_KEY = "softshape_edge_api_key";

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

export function getStoredEdgeApiKey() {
  try {
    return localStorage.getItem(EDGE_API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredEdgeApiKey(key) {
  try {
    localStorage.setItem(EDGE_API_KEY_STORAGE_KEY, key);
  } catch {
    // Ignore storage errors (e.g., private mode)
  }
}

export async function ensureEdgeApiKey() {
  const cached = getStoredEdgeApiKey();
  if (cached) return cached;

  try {
    const res = await fetch(`${API_BASE}/api/edge/key`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { edgeApiKey } = await res.json();
    setStoredEdgeApiKey(edgeApiKey);
    return edgeApiKey;
  } catch (err) {
    console.warn("[Edge] Failed to fetch edge API key:", err.message);
    return null;
  }
}

export function resetEdgeCache() {
  _edgeLastCheck = 0;
  _edgeAvailable = false;
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
  const edgeApiKey = getStoredEdgeApiKey();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (edgeApiKey) {
    headers['X-Edge-Key'] = edgeApiKey;
  }

  const res = await fetch(`${EDGE_URL}${path}`, {
    ...options,
    headers,
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
