import { API_BASE, apiUrl, getAuthHeaders } from "../services/apiConfig";
import secureStorage from "./secureStorage.js";

/**
 * Shared HTTP client for the frontend.
 * Consolidates fetchWithRetry (tableApi.js) and apiFetch (apiConfig.js) into one utility.
 *
 * Features:
 *   - AbortController-based timeout (default 15s)
 *   - Automatic retry with exponential backoff (default 2 retries)
 *   - External signal linking (for React component unmount aborts)
 *   - Auth header injection via getAuthHeaders()
 *   - 401 token-refresh handling (delegates to apiConfig's refresh logic)
 *
 * Usage:
 *   import { http } from '../utils/httpClient';
 *   const res = await http('/api/tables', { method: 'GET' });
 *   const data = await res.json();
 *
 *   // Or with full URL (for non-API calls):
 *   import { httpFetch } from '../utils/httpClient';
 *   const res = await httpFetch('https://example.com/data', { method: 'GET' });
 */

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 2;
const BACKOFF_BASE_MS = 1000;

/**
 * Core fetch with timeout + retry. Works with any URL (not just API paths).
 * @param {string} url — full URL to fetch
 * @param {object} options — standard fetch options
 * @param {object} config — { timeoutMs, retries, skipAuth }
 * @returns {Promise<Response>}
 */
export async function httpFetch(url, options = {}, config = {}) {
  const timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
  const retries = config.retries ?? DEFAULT_RETRIES;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Link external signal so component unmounts can abort
  const externalSignal = options?.signal;
  const onExternalAbort = externalSignal ? () => controller.abort() : null;
  if (externalSignal && !externalSignal.aborted) {
    externalSignal.addEventListener('abort', onExternalAbort);
  } else if (externalSignal?.aborted) {
    controller.abort();
  }

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    if (onExternalAbort) externalSignal.removeEventListener('abort', onExternalAbort);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (onExternalAbort) externalSignal.removeEventListener('abort', onExternalAbort);

    // Don't retry on intentional aborts
    const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
    if (isAbort && externalSignal?.aborted) {
      // External abort — caller intentionally cancelled, don't retry
      throw err;
    }
    if (isAbort) {
      // Timeout abort — retry with backoff
      console.warn(`[httpClient] Timeout after ${timeoutMs}ms: ${url}`);
    } else {
      console.warn(`[httpClient] Fetch error: ${url} — ${err.message}`);
    }

    if (retries > 0) {
      const backoff = BACKOFF_BASE_MS * Math.pow(2, DEFAULT_RETRIES - retries);
      await new Promise(r => setTimeout(r, backoff));
      const { signal: _removed, ...retryOptions } = options;
      return httpFetch(url, retryOptions, { ...config, retries: retries - 1 });
    }
    throw err;
  }
}

/**
 * API-path fetch with auth headers + 401 token refresh.
 * Use this for all calls to the SoftShape backend API.
 *
 * @param {string} path — API path (e.g. '/api/tables'), will be prefixed with API_BASE
 * @param {object} options — standard fetch options + { timeout, retries }
 * @returns {Promise<Response>}
 */
export async function http(path, options = {}) {
  const timeoutMs = Number(options.timeout) || DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const token = secureStorage.getItem('ss_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await httpFetch(apiUrl(path), { ...options, headers }, { timeoutMs, retries });

  // 401 token refresh handling
  if (res.status === 401 && !options._isRetry) {
    if (!token) {
      throw new Error('Authentication required');
    }

    // If a newer token was stored since this request started, retry with it
    const currentToken = secureStorage.getItem('ss_token');
    if (currentToken && currentToken !== token) {
      return http(path, { ...options, _isRetry: true });
    }

    // Attempt token refresh
    try {
      const refreshRes = await httpFetch(apiUrl('/api/auth/refresh'), {
        method: 'POST',
        headers: getAuthHeaders(),
      }, { timeoutMs: 10000, retries: 0 });

      if (refreshRes.ok) {
        const { token: newToken } = await refreshRes.json();
        secureStorage.setItem('ss_token', newToken);
        return http(path, { ...options, _isRetry: true });
      }
    } catch {
      // refresh failed — fall through to session cleanup
    }

    // Only clear+redirect if the failed token is still the current one
    if (secureStorage.getItem('ss_token') === token) {
      secureStorage.removeItem('ss_token');
      localStorage.removeItem('ss_user');
      localStorage.removeItem('ss_restaurant');
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }
    throw new Error('Session expired. Please log in again.');
  }

  return res;
}

/**
 * Convenience: http() + parse JSON + throw on non-OK.
 * @param {string} path — API path
 * @param {object} options — fetch options + { timeout, retries }
 * @returns {Promise<any>} — parsed JSON response
 */
export async function httpJson(path, options = {}) {
  const res = await http(path, options);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response wasn't JSON
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export { API_BASE };
