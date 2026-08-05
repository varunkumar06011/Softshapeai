// ─────────────────────────────────────────────────────────────────────────────
// runtimeV2Client.js — Thin client for the versioned Softshape Runtime API
// ─────────────────────────────────────────────────────────────────────────────
// This is transport only. It does not validate business commands, retry
// mutations, write IndexedDB, or fall back directly to cloud. The Runtime is
// the operational authority; when it is unavailable callers must enter their
// read-only/degraded state.
// ─────────────────────────────────────────────────────────────────────────────

import { getEdgeUrl, getStoredEdgeRuntimeToken } from './edgeHealth';
import secureStorage from '../utils/secureStorage';

const V2_BASE = '/runtime/v2';
const STAFF_TOKEN_KEY = 'ss_edge_staff_token';
const DEFAULT_TIMEOUT_MS = 5000;

export class RuntimeV2Error extends Error {
  constructor(message, { code = 'RUNTIME_ERROR', status = 0, retryable = false } = {}) {
    super(message);
    this.name = 'RuntimeV2Error';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Public liveness check used to decide whether the UI can leave degraded mode.
 * It intentionally does not require or return a token.
 */
export async function pingRuntime({ timeoutMs = 1500 } = {}) {
  const response = await request(`${V2_BASE}/ping`, { method: 'GET', timeoutMs, auth: false });
  return response;
}

/**
 * Authenticated operational health snapshot. No token is returned by Runtime.
 */
export async function getRuntimeV2Status(options = {}) {
  return request(`${V2_BASE}/status`, { method: 'GET', ...options });
}

/**
 * Send a Runtime command. Existing UI adapters should map to this method, but
 * must not add business validation or a second retry/queue implementation.
 */
export async function sendRuntimeCommand(commandType, input, requestId, options = {}) {
  if (!commandType || !requestId) {
    throw new RuntimeV2Error('commandType and requestId are required', { code: 'VALIDATION_FAILED' });
  }

  return request(`${V2_BASE}/commands`, {
    method: 'POST',
    body: { commandType, requestId, input },
    ...options,
  });
}

export async function queryRuntime(queryName, query = {}, options = {}) {
  if (!queryName) throw new RuntimeV2Error('queryName is required', { code: 'VALIDATION_FAILED' });
  const params = new URLSearchParams(query);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request(`${V2_BASE}/queries/${encodeURIComponent(queryName)}${suffix}`, {
    method: 'GET',
    ...options,
  });
}

async function request(path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const runtimeToken = getStoredEdgeRuntimeToken();
    if (!runtimeToken) {
      throw new RuntimeV2Error('Runtime token is unavailable', {
        code: 'UNAUTHENTICATED',
        retryable: true,
      });
    }
    headers.Authorization = `Bearer ${runtimeToken}`;
    const staffToken = secureStorage.getItem(STAFF_TOKEN_KEY);
    if (staffToken) headers['X-Staff-Token'] = staffToken;
  }

  let response;
  try {
    // Runtime v2 has its own explicit auth perimeter; this transport must not
    // fall back to cloud or the legacy edge queue.
    // eslint-disable-next-line no-restricted-syntax
    response = await fetch(`${getEdgeUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new RuntimeV2Error(error?.message || 'Runtime is unavailable', {
      code: 'RUNTIME_NOT_READY',
      retryable: true,
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new RuntimeV2Error('Runtime returned an invalid response', {
      status: response.status,
      retryable: response.status >= 500,
    });
  }

  if (!response.ok || payload?.ok === false) {
    throw new RuntimeV2Error(payload?.error || `Runtime request failed (${response.status})`, {
      code: payload?.code || 'RUNTIME_ERROR',
      status: response.status,
      retryable: payload?.retryable === true || response.status >= 500,
    });
  }

  return payload;
}
