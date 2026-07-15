// ─────────────────────────────────────────────────────────────────────────────
// edgeHealth.js — Shared edge server availability check
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for edge server detection. Used by orderApi.js,
// tableApi.js, menuService.js, and any other service that needs to check
// if the local edge server (Bun sidecar) is running.
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE, getAuthHeaders } from "./apiConfig";

const EDGE_API_KEY_STORAGE_KEY = "softshape_edge_api_key";
const EDGE_URL_STORAGE_KEY = "softshape_edge_url";

const DEFAULT_EDGE_URL = 'http://localhost:3100';
const EDGE_CHECK_TIMEOUT_MS = 6000;
const EDGE_CHECK_INTERVAL_MS = 10_000;
const LAN_DISCOVERY_TIMEOUT_MS = 800;

let _edgeAvailable = false;
let _edgeLastCheck = 0;
let _discoveredEdgeUrl = null;
let _discoveryInProgress = null;

/**
 * Returns the current edge URL.
 * Priority: localStorage (user configured) > LAN discovery > default localhost.
 */
export function getEdgeUrl() {
  try {
    const stored = localStorage.getItem(EDGE_URL_STORAGE_KEY);
    if (stored) return stored;
  } catch { /* ignore */ }
  if (_discoveredEdgeUrl) return _discoveredEdgeUrl;
  return DEFAULT_EDGE_URL;
}

/**
 * Manually set the edge URL (used by captain settings UI).
 */
export function setEdgeUrl(url) {
  try {
    if (url) {
      localStorage.setItem(EDGE_URL_STORAGE_KEY, url);
    } else {
      localStorage.removeItem(EDGE_URL_STORAGE_KEY);
    }
    resetEdgeCache();
  } catch { /* ignore */ }
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

/**
 * LAN discovery: probe common LAN IPs to find the edge server.
 * Tries the local network gateway + likely host IPs (192.168.x.x, 10.0.x.x).
 * Returns the discovered edge URL or null.
 */
export async function discoverEdgeOnLAN() {
  if (_discoveryInProgress) return _discoveryInProgress;

  _discoveryInProgress = (async () => {
    // Skip discovery if user has manually configured a URL
    try {
      if (localStorage.getItem(EDGE_URL_STORAGE_KEY)) {
        return null;
      }
    } catch { /* ignore */ }

    // If we already have a working edge URL, don't rediscover
    const currentUrl = getEdgeUrl();
    if (currentUrl !== DEFAULT_EDGE_URL && _edgeAvailable) {
      return currentUrl;
    }

    // Build candidate IPs to probe
    const candidates = [];

    // Try to infer local subnet from this device's network info
    if (typeof window !== 'undefined' && window.RTCPeerConnection) {
      try {
        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        // Wait briefly for ICE gathering
        await new Promise(resolve => setTimeout(resolve, 500));
        const lines = pc.localDescription?.sdp?.split('\n') || [];
        for (const line of lines) {
          const match = line.match(/a=candidate.*\b(\d+\.\d+\.\d+\.\d+)\b/);
          if (match) {
            const ip = match[1];
            if (!ip.startsWith('0.') && !ip.startsWith('127.')) {
              const parts = ip.split('.');
              candidates.push(`http://${parts[0]}.${parts[1]}.${parts[2]}.1:3100`);
              candidates.push(`http://${parts[0]}.${parts[1]}.${parts[2]}.100:3100`);
              // Also try the device's own subnet range
              for (let i = 2; i <= 20; i++) {
                candidates.push(`http://${parts[0]}.${parts[1]}.${parts[2]}.${i}:3100`);
              }
            }
          }
        }
        pc.close();
      } catch { /* WebRTC not available */ }
    }

    // Fallback: try common router IPs
    const commonGateways = [
      'http://192.168.1.1:3100',
      'http://192.168.0.1:3100',
      'http://192.168.1.100:3100',
      'http://192.168.0.100:3100',
      'http://192.168.1.2:3100',
      'http://192.168.0.2:3100',
      'http://10.0.0.1:3100',
      'http://10.0.0.2:3100',
      'http://10.0.1.1:3100',
    ];
    for (const c of commonGateways) {
      if (!candidates.includes(c)) candidates.push(c);
    }

    // Probe candidates in parallel (batch of 5 at a time)
    const BATCH_SIZE = 5;
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(async (url) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), LAN_DISCOVERY_TIMEOUT_MS);
        try {
          const res = await fetch(`${url}/health`, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) return url;
        } catch {
          clearTimeout(timeoutId);
        }
        return null;
      }));

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          _discoveredEdgeUrl = r.value;
          console.log('[Edge] Discovered edge server on LAN:', r.value);
          return r.value;
        }
      }
    }

    return null;
  })();

  try {
    return await _discoveryInProgress;
  } finally {
    _discoveryInProgress = null;
  }
}

export async function isEdgeAvailable() {
  const now = Date.now();
  if (now - _edgeLastCheck < EDGE_CHECK_INTERVAL_MS) return _edgeAvailable;
  _edgeLastCheck = now;

  const edgeUrl = getEdgeUrl();

  // Try the current edge URL health check first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EDGE_CHECK_TIMEOUT_MS);
    const res = await fetch(`${edgeUrl}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    _edgeAvailable = res.ok;
    if (_edgeAvailable) return true;
  } catch {
    _edgeAvailable = false;
  }

  // If health check failed and we're using default localhost, try LAN discovery
  if (!_edgeAvailable && edgeUrl === DEFAULT_EDGE_URL) {
    try {
      const discovered = await discoverEdgeOnLAN();
      if (discovered) {
        _edgeAvailable = true;
        return true;
      }
    } catch { /* discovery failed */ }
  }

  return _edgeAvailable;
}

const EDGE_FETCH_TIMEOUT_MS = 30_000;

export async function edgeFetch(path, options = {}) {
  const edgeApiKey = getStoredEdgeApiKey();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (edgeApiKey) {
    headers['X-Edge-Key'] = edgeApiKey;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EDGE_FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${getEdgeUrl()}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      throw new Error(`Edge request to ${path} timed out after ${EDGE_FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  }
  clearTimeout(timeoutId);
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
