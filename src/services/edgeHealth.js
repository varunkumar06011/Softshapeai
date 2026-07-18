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

const DEFAULT_EDGE_URL = 'http://127.0.0.1:3101';
const EDGE_CHECK_TIMEOUT_MS = 3000;
const EDGE_CHECK_INTERVAL_MS = 30_000;
const LAN_DISCOVERY_TIMEOUT_MS = 1500;

let _edgeAvailable = false;
let _edgeLastCheck = 0;
let _discoveredEdgeUrl = null;
let _discoveryInProgress = null;
let _discoveryLastFailed = 0;
const DISCOVERY_FAILURE_COOLDOWN_MS = 30_000;

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
 * Manually invalidate the edge health cache. Call this after a known edge server
 * restart or when the user manually changes the edge URL.
 */
export function invalidateEdgeHealthCache() {
  _edgeLastCheck = 0;
  _edgeAvailable = false;
  _discoveredEdgeUrl = null;
  _discoveryLastFailed = 0;
}

/**
 * Pre-warm the edge health cache. Call once on app startup so the first
 * data fetch doesn't pay the health check latency.
 */
export function prewarmEdgeHealth() {
  isEdgeAvailable().catch(() => {});
}

/**
 * Discover the edge server URL from the cloud backend.
 * The backend stores the print agent's LAN IP when it registers.
 * The edge server runs on port 3101 on the same machine as the print agent.
 * Call this after login so the captain app on a different device can find
 * the edge server without relying on 127.0.0.1 (which only works on the
 * cashier PC itself).
 */
export async function discoverEdgeUrlFromBackend() {
  try {
    // Don't overwrite a user-configured URL
    const stored = localStorage.getItem(EDGE_URL_STORAGE_KEY);
    if (stored) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API_BASE}/api/print/agent-endpoint`, {
      headers: getAuthHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.lanIp) {
      const edgeUrl = `http://${data.lanIp}:3101`;
      // Don't persist to localStorage — keep it in-memory so it refreshes
      // on each login. But set it as the discovered URL so getEdgeUrl() returns it.
      _discoveredEdgeUrl = edgeUrl;
      _edgeLastCheck = 0; // force re-check
      console.log('[edgeHealth] Discovered edge server at', edgeUrl, 'from backend');
      return edgeUrl;
    }
  } catch (err) {
    console.debug('[edgeHealth] Backend edge URL discovery failed:', err.message);
  }
  return null;
}

/**
 * Returns true if the current session was established via offline edge PIN
 * login (the stored token is an `edge-local-*` marker, not a real JWT).
 * In this state, cloud API fallback calls will always fail because the
 * cloud backend cannot verify the fake token. Read functions should check
 * this before attempting a cloud fallback and surface a clear error instead.
 */
export function isEdgeLocalAuth() {
  try {
    const token = localStorage.getItem('ss_token');
    return !!token && token.startsWith('edge-local-');
  } catch {
    return false;
  }
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
              candidates.push(`http://${parts[0]}.${parts[1]}.${parts[2]}.1:3101`);
              candidates.push(`http://${parts[0]}.${parts[1]}.${parts[2]}.100:3101`);
              // Probe the full subnet range — routers assign IPs across 2-254
              for (let i = 2; i <= 254; i++) {
                candidates.push(`http://${parts[0]}.${parts[1]}.${parts[2]}.${i}:3101`);
              }
            }
          }
        }
        pc.close();
      } catch { /* WebRTC not available */ }
    }

    // Fallback: try common router IPs
    const commonGateways = [
      'http://192.168.1.1:3101',
      'http://192.168.0.1:3101',
      'http://192.168.1.100:3101',
      'http://192.168.0.100:3101',
      'http://192.168.1.2:3101',
      'http://192.168.0.2:3101',
      'http://10.0.0.1:3101',
      'http://10.0.0.2:3101',
      'http://10.0.1.1:3101',
    ];
    for (const c of commonGateways) {
      if (!candidates.includes(c)) candidates.push(c);
    }

    // Probe candidates in parallel (batch of 20 for full-subnet scan)
    const BATCH_SIZE = 20;
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

  // If health check failed and we're using default localhost, try backend discovery first
  // (fast — single API call), then fall back to LAN scanning (slow — probes 254 IPs)
  if (!_edgeAvailable && edgeUrl === DEFAULT_EDGE_URL) {
    // Skip discovery if it recently failed — avoids re-probing on every poll cycle.
    if (Date.now() - _discoveryLastFailed < DISCOVERY_FAILURE_COOLDOWN_MS) {
      return _edgeAvailable;
    }
    // Try backend discovery first (cashier's LAN IP from print agent heartbeat)
    try {
      const backendDiscovered = await discoverEdgeUrlFromBackend();
      if (backendDiscovered) {
        // Re-check health with the discovered URL
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), EDGE_CHECK_TIMEOUT_MS);
          const res = await fetch(`${backendDiscovered}/health`, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) {
            _edgeAvailable = true;
            return true;
          }
        } catch { /* fall through to LAN scan */ }
      }
    } catch { /* fall through to LAN scan */ }

    // Fall back to LAN scanning if backend discovery didn't work
    try {
      const discovered = await discoverEdgeOnLAN();
      if (discovered) {
        _edgeAvailable = true;
        return true;
      }
      _discoveryLastFailed = Date.now();
    } catch {
      _discoveryLastFailed = Date.now();
    }
  }

  return _edgeAvailable;
}

export const EDGE_FETCH_TIMEOUT_MS = 30_000;
export const EDGE_READ_TIMEOUT_MS = 3_000; // Fast-fail for reads (tables/sections/venues)

async function _edgeFetchWithKey(path, options, headers, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
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
      throw new Error(`Edge request to ${path} timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  }
  clearTimeout(timeoutId);
  return res;
}

export async function edgeFetch(path, options = {}) {
  const edgeApiKey = getStoredEdgeApiKey();
  // Allow callers to override timeout — reads use 3s, writes keep 30s.
  const timeoutMs = options.timeoutMs ?? EDGE_FETCH_TIMEOUT_MS;
  const fetchOptions = { ...options };
  delete fetchOptions.timeoutMs; // don't pass to native fetch
  const headers = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers || {}),
  };
  if (edgeApiKey) {
    headers['X-Edge-Key'] = edgeApiKey;
  }

  // Retry on network errors (not HTTP error statuses). The edge server is a
  // separate process that survives page reloads — a transient failure usually
  // means the sidecar is still starting up or a brief network blip. Retry up
  // to 2 times with 1s delay before giving up and letting the caller fall
  // through to cloud.
  const MAX_RETRIES = 2;
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      let res = await _edgeFetchWithKey(path, fetchOptions, headers, timeoutMs);

      // If the edge server rejected our API key, the stored key is stale.
      // Clear it and retry once without the key — the edge server only rejects
      // a wrong key, not a missing one (unless EDGE_REQUIRE_KEY=true, which is
      // not the default). This fixes tables not loading when localStorage has
      // an outdated key from a prior registration or outlet switch.
      if (res.status === 401 && edgeApiKey) {
        let body = null;
        try { body = await res.json(); } catch { /* ignore */ }
        if (body?.error && /edge api key/i.test(body.error)) {
          console.warn('[edgeFetch] Stored edge API key was rejected — clearing and retrying without key');
          try { localStorage.removeItem(EDGE_API_KEY_STORAGE_KEY); } catch { /* ignore */ }
          const retryHeaders = { ...headers };
          delete retryHeaders['X-Edge-Key'];
          res = await _edgeFetchWithKey(path, fetchOptions, retryHeaders, timeoutMs);
        }
      }

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
    } catch (err) {
      lastError = err;
      // Only retry on network errors (not HTTP error statuses which throw
      // with a .status property). AbortError (timeout) also retries since
      // the edge server may be slow to respond during startup.
      if (err?.status) throw err; // HTTP error — don't retry
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000));
        // Reset edge availability cache so isEdgeAvailable() re-checks
        _edgeLastCheck = 0;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ── Frontend auto-recovery (Tauri desktop only) ──────────────────────────────
// Polls edge health every 30 seconds. If the edge server is unreachable AND
// we're running inside the Tauri desktop app, auto-invokes restart_edge_server.
// This is a fallback for the Rust-side watchdog — if the watchdog somehow
// misses a crash (e.g. the process is alive but hung), the frontend catches it.
// Avoids rapid restart loops with a 60-second cooldown between restart attempts.

let _autoRecoveryStarted = false;
let _lastRestartAttempt = 0;
const AUTO_RECOVERY_INTERVAL_MS = 30_000;
const AUTO_RECOVERY_COOLDOWN_MS = 60_000;

function getTauriInvoke() {
  if (typeof window === 'undefined') return null;
  return window.__TAURI__?.core?.invoke
    || window.__TAURI__?.invoke
    || window.__TAURI_INTERNALS__?.invoke
    || null;
}

export function startEdgeAutoRecovery() {
  if (_autoRecoveryStarted) return;
  _autoRecoveryStarted = true;

  setInterval(async () => {
    const invoke = getTauriInvoke();
    if (!invoke) return; // Not running in Tauri desktop app

    try {
      const available = await isEdgeAvailable();
      if (available) return;

      const now = Date.now();
      if (now - _lastRestartAttempt < AUTO_RECOVERY_COOLDOWN_MS) return;
      _lastRestartAttempt = now;

      console.warn('[EdgeAutoRecovery] Edge server unreachable — auto-restarting via Tauri');
      await invoke('restart_edge_server');
      invalidateEdgeHealthCache();
    } catch (err) {
      console.warn('[EdgeAutoRecovery] Restart attempt failed:', err?.message || err);
    }
  }, AUTO_RECOVERY_INTERVAL_MS);
}
