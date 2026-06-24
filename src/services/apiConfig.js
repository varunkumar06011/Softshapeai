/** Strip trailing slashes — avoids https://host.app//api/... (breaks DNS/fetch) */
export function normalizeApiBase(url) {
  if (!url || typeof url !== "string") return "";
  return url.trim().replace(/\/+$/, "");
}

export const API_BASE = normalizeApiBase(
  import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || ""
);

/** Build API URL: base + path (path must start with /) */
export function apiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

/** Returns auth headers object with Bearer token if available */
export function getAuthHeaders() {
  const token = localStorage.getItem('tenant_token');
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/** Fetch wrapper with Bearer token support */
export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('tenant_token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

