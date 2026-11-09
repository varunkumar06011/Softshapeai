// storeApi.js — talks to /api/store-stock/:code/* (the outlet code is in the URL path).
// Standalone: does not use the app's auth token, edge server, or offline queue.
import { API_BASE } from '../services/apiConfig';

const url = (code, path) => `${API_BASE}/api/store-stock/${encodeURIComponent(code)}${path}`;

async function call(code, path, method = 'GET', body) {
  let res;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    // Standalone module on purpose: own 25 s timeout via AbortController; no retry so a write is never repeated.
    // eslint-disable-next-line no-restricted-syntax
    res = await fetch(url(code, path), {
      signal: ctl.signal,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const e = new Error('No connection. Check the internet and try again.');
    e.offline = true;
    throw e;
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const e = new Error((data && data.error) || 'Something went wrong. Please try again.');
    e.status = res.status;
    throw e;
  }
  return data;
}

export const storeApi = {
  state: (code) => call(code, '/state'),
  addItem: (code, body) => call(code, '/items', 'POST', body),
  renameItem: (code, id, body) => call(code, `/items/${encodeURIComponent(id)}`, 'PATCH', body),
  addEntry: (code, body) => call(code, '/entries', 'POST', body),
  countMatch: (code, body) => call(code, '/count-match', 'POST', body),
  setDepartments: (code, body) => call(code, '/departments', 'PUT', body),
};
