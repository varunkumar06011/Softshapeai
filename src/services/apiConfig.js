// ─────────────────────────────────────────────────────────────────────────────
// API Config — Backend URL resolution, auth headers, and reachability checks
// ─────────────────────────────────────────────────────────────────────────────
// Central configuration for all backend API calls:
//   - API_BASE: normalized backend URL (strips trailing slashes to avoid //)
//   - apiUrl(path): builds full URL from base + path
//   - getAuthHeaders(): returns { Authorization: 'Bearer <token>' } from localStorage
//   - isBackendReachable(): sync check (cached result from last health check)
//   - checkBackendReachability(): async health check against /api/health
//
// The reachability check is used by useOnlineStatus hook and SyncStatusContext
// to detect when the backend is down (even if the browser has network).
// ─────────────────────────────────────────────────────────────────────────────

/** Strip trailing slashes — avoids https://host.app//api/... (breaks DNS/fetch) */
export function normalizeApiBase(url) {
  if (!url || typeof url !== "string") return "";
  return url.trim().replace(/\/+$/, "");
}

const _rawApiBase =
  import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

// If the baked-in URL is localhost but we're running on a different origin
// (e.g. Android Capacitor app loading from https://www.softshape.in), use the
// current origin as the API base. This prevents "failed to fetch backend"
// errors on mobile when the build was done with a dev .env.
//
// Tauri desktop apps load from custom origins (tauri://localhost or
// https://tauri.localhost) which are NOT the backend, so we must not use them
// as the API base. Otherwise login requests hit the local app bundle and get
// the SPA index.html back, producing the "<!DOCTYPE... is not valid JSON"
// error seen on the cashier desktop terminal.
function isTauriOrigin(origin) {
  return /^tauri:\/\//i.test(origin) || /^https?:\/\/tauri\.localhost/i.test(origin);
}

function resolveApiBase(raw) {
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(raw);
  if (
    isLocalhost &&
    typeof window !== "undefined" &&
    window.location &&
    /^https?:$/i.test(window.location.protocol) &&
    !isTauriOrigin(window.location.origin) &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(window.location.origin)
  ) {
    return window.location.origin;
  }
  return raw;
}

export const API_BASE = normalizeApiBase(resolveApiBase(_rawApiBase));

/** Build API URL: base + path (path must start with /) */
export function apiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

/** Returns auth headers object with Bearer token if available */
export function getAuthHeaders() {
  const token = localStorage.getItem('ss_token');
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/** Fetch wrapper with Bearer token support */
export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('ss_token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutMs = Number(options.timeout) || 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl(path), {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (response.status === 401 && !options._isRetry) {
      // If no token was used for this request, don't attempt refresh or
      // redirect — the caller is likely a background service running before
      // login completes. Just surface the 401 error.
      if (!token) {
        throw new Error('Authentication required');
      }

      // If a newer token was stored since this request started (e.g. user
      // just logged in), retry with the new token instead of wiping session.
      const currentToken = localStorage.getItem('ss_token');
      if (currentToken && currentToken !== token) {
        return apiFetch(path, { ...options, _isRetry: true });
      }

      try {
        const refreshRes = await fetch(apiUrl('/api/auth/refresh'), {
          method: 'POST',
          headers: getAuthHeaders(),
        });
        if (refreshRes.ok) {
          const { token: newToken } = await refreshRes.json();
          localStorage.setItem('ss_token', newToken);
          return apiFetch(path, { ...options, _isRetry: true });
        }
      } catch {
        // refresh failed — fall through to error
      }
      // Only clear+redirect if the failed token is still the current one
      // (otherwise a newer login already replaced it — don't wipe that)
      if (localStorage.getItem('ss_token') === token) {
        localStorage.removeItem('ss_token');
        localStorage.removeItem('ss_user');
        localStorage.removeItem('ss_restaurant');
        if (typeof window !== 'undefined') {
          window.location.href = '/';
        }
      }
      throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
      } catch {
        errorText = '';
      }
      let message = `Request failed (HTTP ${response.status})`;
      if (errorText) {
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.error) message = parsed.error;
        } catch {
          message = errorText.length > 200 ? `${errorText.slice(0, 200)}...` : errorText;
        }
      }
      throw new Error(message);
    }

    return response.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out — please try again');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Ping the backend to wake it up. Useful before heavy requests. */
export async function pingBackend() {
  try {
    await fetch(apiUrl('/health'), { method: 'GET', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}

// ── Cached backend reachability (more reliable than navigator.onLine in Tauri) ─
// null = unknown (fall back to navigator.onLine), true/false = last ping result.
let backendReachable = null;

// ── Grace period: require 1 consecutive failure before declaring offline ──
// Changed from 2 to 1 for instant offline detection. Transient slowness is handled
// by the 10s timeout per check; a single timeout means the backend is genuinely unreachable.
let consecutiveFailures = 0;
const FAILURE_THRESHOLD = 1;

// ── Shared reachability pub/sub ──
// Single source of truth for reachability. useOnlineStatus and SyncStatusContext
// subscribe to this instead of running their own duplicate polling intervals.
const reachabilitySubscribers = new Set();

function notifyReachabilitySubscribers() {
  const value = backendReachable ?? navigator.onLine;
  reachabilitySubscribers.forEach((cb) => {
    try { cb(value); } catch { /* ignore subscriber errors */ }
  });
}

/** Subscribe to reachability changes. Returns an unsubscribe function. */
export function subscribeReachability(callback) {
  reachabilitySubscribers.add(callback);
  return () => reachabilitySubscribers.delete(callback);
}

export async function checkBackendReachability() {
  const controller = new AbortController();
  // 3s timeout — fast offline detection. If backend is truly down, cashier should know immediately.
  // The 10s timeout was too slow for offline scenarios; transient slowness is rare in production.
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    // Use /health (no DB query, instant) instead of /api/health (does SELECT 1).
    // /health returns 200 in ~50ms even under max load; /api/health queues
    // behind 30 active DB connections and can take >3s during rush hours.
    const res = await fetch(apiUrl('/health'), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (res.ok) {
      consecutiveFailures = 0; // reset on success
      backendReachable = true;
    } else {
      consecutiveFailures++;
      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        backendReachable = false;
      }
    }
  } catch {
    consecutiveFailures++;
    // Only declare offline after 2 consecutive failures (grace period).
    // A single timeout or network blip should NOT take the cashier offline.
    if (consecutiveFailures >= FAILURE_THRESHOLD) {
      backendReachable = false;
    }
  } finally {
    clearTimeout(timeout);
  }
  notifyReachabilitySubscribers();
  return backendReachable;
}

/** Synchronous cached check. Falls back to navigator.onLine until the first ping completes. */
export function isBackendReachable() {
  return backendReachable ?? navigator.onLine;
}

export function setBackendReachable(value) {
  backendReachable = value;
  if (value) consecutiveFailures = 0;
  notifyReachabilitySubscribers();
}

console.log("[API] Backend base:", API_BASE);

// Keep backend warm — ping every 10 minutes (use lightweight /health)
(function startKeepAlive() {
  const ping = () => fetch(apiUrl('/health'), { method: 'GET', cache: 'no-store' }).catch(() => {});
  ping(); // immediate ping on load
  setInterval(ping, 10 * 60 * 1000);
})();

// In browser/Tauri, refresh reachability on network events and periodically.
// SINGLE polling source — useOnlineStatus and SyncStatusContext subscribe via subscribeReachability().
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => checkBackendReachability());
  window.addEventListener('offline', () => {
    consecutiveFailures = FAILURE_THRESHOLD; // immediate offline on browser offline event
    backendReachable = false;
    notifyReachabilitySubscribers();
  });
  // First ping after a short delay so tests that import the module early don't get
  // an immediate fetch racing against their mocks.
  setTimeout(checkBackendReachability, 1000);
  // Single 30s interval — subscribers are notified, no need for duplicate intervals.
  setInterval(checkBackendReachability, 30000);
}
