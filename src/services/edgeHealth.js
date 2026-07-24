// ─────────────────────────────────────────────────────────────────────────────
// edgeHealth.js — Shared edge server availability check
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for edge server detection. Used by orderApi.js,
// tableApi.js, menuService.js, and any other service that needs to check
// if the local edge server (Bun sidecar) is running.
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE, getAuthHeaders } from "./apiConfig";
import secureStorage from "../utils/secureStorage";

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

// Diagnostic reason for the last failed LAN discovery. Survives cache
// invalidation (invalidateEdgeHealthCache does NOT clear this) because it's
// a user-facing diagnostic, not a cached health result. Only cleared on a
// successful discovery or at the start of a new attempt.
let _discoveryFailReason = null;

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
  // Intentionally does NOT clear _discoveryFailReason — it's a diagnostic,
  // not a health cache. See comment at the variable declaration.
}

/**
 * Returns the diagnostic reason for the last failed LAN discovery, or null
 * if the last discovery succeeded or hasn't been attempted yet. Used by the
 * captain UI to show an actionable error instead of a blank "Edge Offline".
 */
export function getEdgeDiscoveryFailReason() {
  return _discoveryFailReason;
}

/**
 * Pre-warm the edge health cache. Call once on app startup so the first
 * data fetch doesn't pay the health check latency.
 */
export function prewarmEdgeHealth() {
  isEdgeAvailable().catch(() => {});
}

/**
 * Wait for the edge server to become fully operational (isOperational: true).
 * The Runtime returns isOperational=false while BOOTING/STARTING (downloading
 * config, warming cache). This helper polls until the runtime is READY
 * or the timeout expires, so callers don't read an empty menu from a
 * half-synced DB.
 *
 * @param {number} timeoutMs — max time to wait (default 15s)
 * @param {number} intervalMs — poll interval (default 1s)
 * @returns {Promise<boolean>} true if edge is operational, false on timeout
 */
export async function waitForEdgeReady(timeoutMs = 15_000, intervalMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const edgeUrl = getEdgeUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), EDGE_CHECK_TIMEOUT_MS);
      const res = await fetch(`${edgeUrl}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const health = await res.json().catch(() => ({}));
        // isOperational is the single source of truth from RuntimeManager.
        // It's true only when runtimeState === READY — the HTTP server is
        // listening AND config sync has completed AND local data is available.
        // The old status === "ok" fallback is removed because it was true
        // during STARTING, causing the UI to read empty/half-synced data.
        if (health.isOperational === true) {
          _edgeAvailable = true;
          _edgeLastCheck = Date.now();
          return true;
        }
      }
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
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
    const token = secureStorage.getItem('ss_token');
    return !!token && token.startsWith('edge-local-');
  } catch {
    return false;
  }
}

/**
 * LAN discovery: probe common LAN IPs to find the edge server.
 * Tries the local network gateway + likely host IPs across all RFC 1918
 * ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x).
 *
 * @param {{ force?: boolean }} [opts] — force: true bypasses the failure
 *   cooldown (used by the Auto-Discover button so a manual retry always
 *   runs a fresh scan instead of being throttled).
 * Returns the discovered edge URL or null.
 */
export async function discoverEdgeOnLAN({ force = false } = {}) {
  if (_discoveryInProgress) {
    if (!force) return _discoveryInProgress;
    // Forced (Auto-Discover button): wait for in-flight passive scan to
    // drain, then re-scan fresh. Avoids concurrent probes on the same IPs.
    await _discoveryInProgress.catch(() => {});
  }

  _discoveryInProgress = (async () => {
    // Skip discovery if user has manually configured a URL
    try {
      if (localStorage.getItem(EDGE_URL_STORAGE_KEY)) {
        return null;
      }
    } catch { /* ignore */ }

    // Cooldown: recent discovery failed. Fast-fail without re-scanning.
    // _discoveryFailReason persists so the UI can still show why.
    // Bypassed by force: true (Auto-Discover button).
    if (!force && Date.now() - _discoveryLastFailed < DISCOVERY_FAILURE_COOLDOWN_MS) {
      return null;
    }

    // Clear fail reason at the start of a fresh attempt
    _discoveryFailReason = null;

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

    // ── Capacitor native plugin: read local IP via ConnectivityManager ──
    // On Android, WebRTC is often disabled in the WebView. This native
    // plugin reads the actual local IP via ConnectivityManager/LinkProperties
    // (API 21+, only ACCESS_NETWORK_STATE — no location permission needed).
    // Falls back to NetworkInterface enumeration (preferring wlan interfaces)
    // if ConnectivityManager returns null.
    if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
      try {
        const { registerPlugin } = await import('@capacitor/core');
        const LocalNetwork = registerPlugin('LocalNetwork');
        const result = await LocalNetwork.getLocalIp();
        if (result?.ip) {
          const parts = result.ip.split('.');
          if (parts.length === 4 && !parts[0].startsWith('0') && !parts[0].startsWith('127')) {
            candidates.push(`http://${parts[0]}.${parts[1]}.${parts[2]}.1:3101`);
            candidates.push(`http://${parts[0]}.${parts[1]}.${parts[2]}.100:3101`);
            for (let i = 2; i <= 254; i++) {
              candidates.push(`http://${parts[0]}.${parts[1]}.${parts[2]}.${i}:3101`);
            }
          }
        }
      } catch { /* plugin not available or failed */ }
    }

    // Fallback: try common router/host IPs across all RFC 1918 ranges.
    // This is a guess-list, not real discovery — it covers SOHO defaults
    // and common POS-vendor/mesh router IPs. For arbitrary 10.x/172.x
    // subnets, the user must enter the Edge URL manually in Settings.
    const commonGateways = [
      // 192.168.x.x — home/SOHO routers
      'http://192.168.0.1:3101',
      'http://192.168.0.2:3101',
      'http://192.168.0.100:3101',
      'http://192.168.1.1:3101',
      'http://192.168.1.2:3101',
      'http://192.168.1.100:3101',
      'http://192.168.2.1:3101',
      'http://192.168.2.100:3101',
      'http://192.168.10.1:3101',
      'http://192.168.10.100:3101',
      'http://192.168.100.1:3101',
      'http://192.168.100.100:3101',
      'http://192.168.254.1:3101',
      // 10.x.x.x — enterprise/POS-vendor/mesh defaults
      'http://10.0.0.1:3101',
      'http://10.0.0.2:3101',
      'http://10.0.0.100:3101',
      'http://10.0.1.1:3101',
      'http://10.0.10.1:3101',
      'http://10.0.90.1:3101',
      'http://10.1.1.1:3101',
      'http://10.10.10.10:3101',
      'http://10.90.0.1:3101',
      'http://10.255.255.1:3101',
      // 172.16-31.x.x — Docker/corporate/POS defaults
      'http://172.16.0.1:3101',
      'http://172.16.0.2:3101',
      'http://172.16.0.100:3101',
      'http://172.17.0.1:3101',
      'http://172.20.0.1:3101',
      'http://172.30.0.1:3101',
      'http://172.31.0.1:3101',
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
          _discoveryFailReason = null;
          console.log('[Edge] Discovered edge server on LAN:', r.value);
          return r.value;
        }
      }
    }

    // All candidates exhausted — arm cooldown and set diagnostic reason.
    // This covers every failure exit: WebRTC unavailable + fallback list
    // exhausted, or WebRTC succeeded but no edge server on the probed /24.
    _discoveryLastFailed = Date.now();
    _discoveryFailReason =
      'Could not find the cashier PC on this LAN. If your network uses ' +
      '10.x.x.x or 172.16-31.x.x, enter the Edge URL manually in Settings.';
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
    if (res.ok) {
      // The Runtime returns isOperational=true when runtimeState === READY.
      // This is the single source of truth — status "ok" alone may be sent
      // during STARTING if the HTTP server is listening but config sync
      // hasn't completed yet. Only isOperational guarantees local data is ready.
      const health = await res.json().catch(() => ({}));
      _edgeAvailable = health.isOperational === true;
    } else {
      _edgeAvailable = false;
    }
    if (_edgeAvailable) return true;
  } catch {
    _edgeAvailable = false;
  }

  // If health check failed, try discovery regardless of whether we're using
  // DEFAULT_EDGE_URL or a stale discovered URL. This handles DHCP IP changes
  // where the cashier desktop gets a new LAN IP and the old discovered URL
  // becomes unreachable.
  if (!_edgeAvailable) {
    // Skip discovery if it recently failed — avoids re-probing on every poll cycle.
    if (Date.now() - _discoveryLastFailed < DISCOVERY_FAILURE_COOLDOWN_MS) {
      return _edgeAvailable;
    }

    // If using a stale discovered URL, reset it so discovery can find the new one
    if (edgeUrl !== DEFAULT_EDGE_URL && _discoveredEdgeUrl === edgeUrl) {
      _discoveredEdgeUrl = null;
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
            const health = await res.json().catch(() => ({}));
            if (health.isOperational === true) {
              _edgeAvailable = true;
              // Sync connectivity state so the UI immediately reflects the
              // discovered edge server, instead of waiting for the next
              // getEdgeConnectivityState() poll cycle.
              if (health.sessionValid) {
                _connectivityState = 'edge_reachable';
              } else {
                _connectivityState = 'edge_not_ready';
              }
              _connectivityLastCheck = Date.now();
              return true;
            }
          }
        } catch { /* fall through to LAN scan */ }
      }
    } catch { /* fall through to LAN scan */ }

    // Fall back to LAN scanning if backend discovery didn't work
    try {
      const discovered = await discoverEdgeOnLAN();
      if (discovered) {
        // Verify the discovered server is actually ready (not just initializing)
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), EDGE_CHECK_TIMEOUT_MS);
          const res = await fetch(`${discovered}/health`, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) {
            const health = await res.json().catch(() => ({}));
            _edgeAvailable = health.isOperational === true;
            if (_edgeAvailable) {
              // Sync connectivity state for the UI
              if (health.sessionValid) {
                _connectivityState = 'edge_reachable';
              } else {
                _connectivityState = 'edge_not_ready';
              }
              _connectivityLastCheck = Date.now();
              return true;
            }
          }
        } catch { /* discovered server not reachable */ }
        _discoveryLastFailed = Date.now();
      } else {
        _discoveryLastFailed = Date.now();
      }
    } catch {
      _discoveryLastFailed = Date.now();
    }
  }

  return _edgeAvailable;
}

// ── Connectivity state machine ───────────────────────────────────────────────
// Returns a richer state than just boolean isEdgeAvailable:
//   'edge_reachable'    — edge server is online and session is valid
//   'edge_not_ready'    — edge server is reachable but session invalid/not registered
//   'cloud_reachable'   — edge unreachable but cloud backend is reachable
//   'fully_offline'     — neither edge nor cloud is reachable
//   'checking'          — still determining

let _connectivityState = 'checking';
let _connectivityLastCheck = 0;
const CONNECTIVITY_CHECK_INTERVAL_MS = 10_000;

export async function getEdgeConnectivityState() {
  const now = Date.now();
  if (now - _connectivityLastCheck < CONNECTIVITY_CHECK_INTERVAL_MS) {
    return _connectivityState;
  }
  _connectivityLastCheck = now;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EDGE_CHECK_TIMEOUT_MS);
    const res = await fetch(`${getEdgeUrl()}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const health = await res.json().catch(() => ({}));
      if (health.isOperational === true && health.sessionValid) {
        _connectivityState = 'edge_reachable';
        // Sync isEdgeAvailable cache so print routing (orderApi.js) sees the
        // same result as the UI. Without this, isEdgeAvailable() could return
        // a stale false for up to 30s while the UI already shows Edge Connected.
        _edgeAvailable = true;
        _edgeLastCheck = now;
      } else {
        _connectivityState = 'edge_not_ready';
        _edgeAvailable = false;
      }
      return _connectivityState;
    }
  } catch { /* edge unreachable */ }

  // Edge unreachable — check if cloud is reachable
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    _connectivityState = res.ok ? 'cloud_reachable' : 'fully_offline';
  } catch {
    _connectivityState = 'fully_offline';
  }

  // Trigger background discovery if not yet attempted
  if (_connectivityState === 'cloud_reachable' || _connectivityState === 'fully_offline') {
    isEdgeAvailable().catch(() => {});
  }

  return _connectivityState;
}

export function getConnectivityState() {
  return _connectivityState;
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

      // If the edge server rejected our API key (or we never had one), try to
      // fetch a fresh key from the cloud and retry once. The edge server
      // requires the key for all POS routes, so without it every call fails.
      if (res.status === 401) {
        let body = null;
        try { body = await res.json(); } catch { /* ignore */ }
        const isKeyError = body?.error && /edge api key/i.test(body.error);
        if (isKeyError || !edgeApiKey) {
          console.warn('[edgeFetch] Edge API key missing or rejected — refreshing from cloud');
          // Don't remove the existing key until we have a fresh one.
          // If ensureEdgeApiKey() fails (cloud unreachable, no auth token),
          // wiping the key would permanently break all edge access.
          const freshKey = await ensureEdgeApiKey().catch(() => null);
          if (freshKey && freshKey !== edgeApiKey) {
            setStoredEdgeApiKey(freshKey);
            const retryHeaders = { ...headers, 'X-Edge-Key': freshKey };
            res = await _edgeFetchWithKey(path, fetchOptions, retryHeaders, timeoutMs);
          } else if (!freshKey && edgeApiKey) {
            // Refresh failed but we still have the old key — it might be
            // stale on the edge server side. Surface the original 401 error
            // instead of silently wiping the key.
            console.warn('[edgeFetch] Could not refresh edge API key — keeping existing key');
          }
        }
      }

      if (!res.ok) {
        let message = `Edge request failed (${res.status})`;
        let body = null;
        try {
          body = await res.json();
          if (body?.error) message = body.error;
        } catch { /* ignore */ }
        const err = new Error(message);
        err.status = res.status;
        err.statusCode = res.status;
        if (body?.orderId) err.existingOrderId = body.orderId;
        if (body?.missing) err.missing = body.missing;
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

let _configResyncInProgress = null;

/**
 * Triggers a config re-sync on the edge server and waits for it to complete.
 * Deduplicates concurrent calls — if a re-sync is already in progress, waits
 * for that one instead of starting another.
 * @returns {Promise<boolean>} true if re-sync succeeded, false otherwise
 */
export async function triggerEdgeConfigResync() {
  if (_configResyncInProgress) return _configResyncInProgress;
  _configResyncInProgress = (async () => {
    try {
      console.warn('[edgeHealth] Triggering edge config re-sync');
      const result = await edgeFetch('/api/edge/config/sync', {
        method: 'POST',
        timeoutMs: 60_000,
      });
      return result?.success === true;
    } catch (err) {
      console.warn('[edgeHealth] Config re-sync failed:', err?.message || err);
      return false;
    } finally {
      _configResyncInProgress = null;
    }
  })();
  return _configResyncInProgress;
}

// ── Runtime event bus listener (replaces polling for state changes) ──────────
// Connects to the Runtime's WebSocket /events endpoint and listens for
// runtime.state_changed, config_sync.state_changed, and connection.state_changed
// events. When a state change arrives, it updates the cached connectivity state
// immediately — no need to wait for the next poll cycle.

let _runtimeWs = null;
let _runtimeWsStarted = false;
let _runtimeWsReconnectDelay = 1_000; // starts at 1s, grows to 30s max
const WS_RECONNECT_MAX_MS = 30_000;
const _runtimeEventListeners = new Set();

export function onRuntimeStateChange(callback) {
  _runtimeEventListeners.add(callback);
  return () => _runtimeEventListeners.delete(callback);
}

export function startRuntimeEventBus() {
  if (_runtimeWsStarted) return;
  _runtimeWsStarted = true;

  const connect = () => {
    const edgeUrl = getEdgeUrl();
    const wsUrl = edgeUrl.replace(/^http/, 'ws') + '/events';

    try {
      _runtimeWs = new WebSocket(wsUrl);
    } catch {
      setTimeout(connect, _runtimeWsReconnectDelay);
      _runtimeWsReconnectDelay = Math.min(_runtimeWsReconnectDelay * 2, WS_RECONNECT_MAX_MS);
      return;
    }

    _runtimeWs.onopen = () => {
      // Reset reconnect backoff on successful connection
      _runtimeWsReconnectDelay = 1_000;
      // Authenticate with the runtime token (stored as edge API key)
      const token = getStoredEdgeApiKey();
      if (token) {
        _runtimeWs.send(JSON.stringify({ type: 'auth', token }));
      }
    };

    _runtimeWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'auth' && msg.ok === false) return;

        // Handle runtime events
        if (msg.event) {
          switch (msg.event) {
            case 'runtime.state_changed':
              handleRuntimeStateChanged(msg.data);
              break;
            case 'config_sync.state_changed':
              handleConfigSyncStateChanged(msg.data);
              break;
            case 'connection.state_changed':
              handleConnectionStateChanged(msg.data);
              break;
            case 'config_sync.progress':
              // Notify listeners of progress
              for (const cb of _runtimeEventListeners) {
                try { cb({ type: 'config_sync.progress', data: msg.data }); } catch { /* ignore */ }
              }
              break;
          }
        }
      } catch { /* ignore malformed messages */ }
    };

    _runtimeWs.onclose = () => {
      _runtimeWs = null;
      // Reconnect with exponential backoff if the app is still running.
      // 1s → 2s → 4s → 8s → 15s → 30s, capped at 30s. Resets to 1s on
      // successful connect (onopen). Prevents noisy reconnect storms when
      // the edge server is down for an extended period.
      if (_runtimeWsStarted) {
        setTimeout(connect, _runtimeWsReconnectDelay);
        _runtimeWsReconnectDelay = Math.min(_runtimeWsReconnectDelay * 2, WS_RECONNECT_MAX_MS);
      }
    };

    _runtimeWs.onerror = () => {
      try { _runtimeWs?.close(); } catch { /* ignore */ }
    };
  };

  connect();
}

export function stopRuntimeEventBus() {
  _runtimeWsStarted = false;
  if (_runtimeWs) {
    try { _runtimeWs.close(); } catch { /* ignore */ }
    _runtimeWs = null;
  }
}

function handleRuntimeStateChanged(data) {
  if (!data) return;
  const { newState, isOperational } = data;

  // Update cached availability immediately
  if (isOperational) {
    _edgeAvailable = true;
    _edgeLastCheck = Date.now();
  } else {
    _edgeAvailable = false;
  }

  // Update connectivity state
  if (isOperational) {
    _connectivityState = 'edge_reachable';
  } else {
    _connectivityState = 'edge_not_ready';
  }
  _connectivityLastCheck = Date.now();

  // Notify listeners
  for (const cb of _runtimeEventListeners) {
    try { cb({ type: 'runtime.state_changed', data }); } catch { /* ignore */ }
  }
}

function handleConfigSyncStateChanged(data) {
  if (!data) return;
  for (const cb of _runtimeEventListeners) {
    try { cb({ type: 'config_sync.state_changed', data }); } catch { /* ignore */ }
  }
}

function handleConnectionStateChanged(data) {
  if (!data) return;
  for (const cb of _runtimeEventListeners) {
    try { cb({ type: 'connection.state_changed', data }); } catch { /* ignore */ }
  }
}
