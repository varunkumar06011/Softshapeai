/** Strip trailing slashes — avoids https://host.app//api/... (breaks DNS/fetch) */
export function normalizeApiBase(url) {
  if (!url || typeof url !== "string") return "";
  return url.trim().replace(/\/+$/, "");
}

export const API_BASE = normalizeApiBase(
  import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"
);

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
    await fetch(apiUrl('/api/health'), { method: 'GET', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}

// ── Cached backend reachability (more reliable than navigator.onLine in Tauri) ─
// null = unknown (fall back to navigator.onLine), true/false = last ping result.
let backendReachable = null;

export async function checkBackendReachability() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(apiUrl('/api/health'), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    backendReachable = res.ok;
  } catch {
    backendReachable = false;
  } finally {
    clearTimeout(timeout);
  }
  return backendReachable;
}

/** Synchronous cached check. Falls back to navigator.onLine until the first ping completes. */
export function isBackendReachable() {
  return backendReachable ?? navigator.onLine;
}

export function setBackendReachable(value) {
  backendReachable = value;
}

console.log("[API] Backend base:", API_BASE);

// Keep Render backend warm — ping every 10 minutes
(function startKeepAlive() {
  const ping = () => fetch(apiUrl('/api/health'), { method: 'GET', cache: 'no-store' }).catch(() => {});
  ping(); // immediate ping on load
  setInterval(ping, 10 * 60 * 1000);
})();

// In browser/Tauri, refresh reachability on network events and periodically.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => checkBackendReachability());
  window.addEventListener('offline', () => { backendReachable = false; });
  // First ping after a short delay so tests that import the module early don't get
  // an immediate fetch racing against their mocks.
  setTimeout(checkBackendReachability, 1000);
  setInterval(checkBackendReachability, 30000);
}
