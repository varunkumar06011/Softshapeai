// ─────────────────────────────────────────────────────────────────────────────
// API Client — Core HTTP client with JWT auth and automatic token refresh
// ─────────────────────────────────────────────────────────────────────────────
// Wraps the native fetch API with:
//   - Automatic JWT auth header injection (via authService.getAuthHeader())
//   - 401 handling: on first 401, attempts to refresh the token and retry once
//   - Consistent error handling with JSON error parsing
//
// Exports:
//   apiGet(url)     — GET request with auth
//   apiPost(url, body) — POST request with auth
//   apiPatch(url, body) — PATCH request with auth
//   apiDelete(url)  — DELETE request with auth
// ─────────────────────────────────────────────────────────────────────────────

import { authService } from './authService';

// Resolves the backend base URL from Vite env vars
function getApiBase() {
  return (
    import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || ''
  );
}

async function request(method, url, body, isRetry = false) {
  const headers = {
    'Content-Type': 'application/json',
    ...authService.getAuthHeader(),
  };

  const res = await fetch(`${getApiBase()}${url}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401 && !isRetry) {
    // Attempt sliding refresh before giving up
    try {
      const refreshRes = await fetch(`${getApiBase()}/api/auth/refresh`, {
        method: 'POST',
        headers: authService.getAuthHeader(),
      });
      if (refreshRes.ok) {
        const { token } = await refreshRes.json();
        authService.setToken(token); // store new token
        return request(method, url, body, true); // retry once
      }
    } catch {
      /* refresh failed — fall through to logout */
    }
    await authService.logout();
    window.location.href = '/';
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// Existing direct fetch calls can be migrated to these helpers gradually.
// Don't migrate them now — only new calls should use apiClient.

export function apiGet(url) {
  return request('GET', url);
}

export function apiPost(url, body) {
  return request('POST', url, body);
}

export function apiPatch(url, body) {
  return request('PATCH', url, body);
}

export function apiDelete(url) {
  return request('DELETE', url);
}
