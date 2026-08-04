// ─────────────────────────────────────────────────────────────────────────────
// API Client — Thin wrappers around apiFetch from apiConfig.js
// ─────────────────────────────────────────────────────────────────────────────
// All auth, 401 token-refresh, timeout, and error handling now lives in
// apiFetch (apiConfig.js). These helpers provide convenient method-specific
// wrappers so callers don't need to pass method/options manually.
//
// Exports:
//   apiGet(url)        — GET request with auth
//   apiPost(url, body) — POST request with auth
//   apiPatch(url, body) — PATCH request with auth
//   apiDelete(url)     — DELETE request with auth
// ─────────────────────────────────────────────────────────────────────────────

import { apiFetch } from './apiConfig';

export function apiGet(url) {
  return apiFetch(url, { method: 'GET' });
}

export function apiPost(url, body) {
  return apiFetch(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
}

export function apiPatch(url, body) {
  return apiFetch(url, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
}

export function apiDelete(url) {
  return apiFetch(url, { method: 'DELETE' });
}
