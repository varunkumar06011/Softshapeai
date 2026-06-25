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
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(apiUrl(path), {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out — please try again');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

console.log("[API] Backend base:", API_BASE);

// Keep Render backend warm — ping every 10 minutes
(function startKeepAlive() {
  const ping = () => fetch(apiUrl('/api/health'), { method: 'GET', cache: 'no-store' }).catch(() => {});
  ping(); // immediate ping on load
  setInterval(ping, 10 * 60 * 1000);
})();
