// t1Api.js — talks to /api/t1/:code/* (the outlet code is in the URL path).
// Standalone: its own session token (not the app's), no edge server, no offline queue.
import { API_BASE } from '../services/apiConfig';

const LS_TOKEN = 'softshape.t1.token';
export function getToken() { try { return localStorage.getItem(LS_TOKEN) || ''; } catch { return ''; } }
export function setToken(t) { try { if (t) localStorage.setItem(LS_TOKEN, t); else localStorage.removeItem(LS_TOKEN); } catch { /* private mode */ } }

const url = (code, path) => `${API_BASE}/api/t1/${encodeURIComponent(code)}${path}`;

async function call(code, path, method = 'GET', body) {
  let res;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const tok = getToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  try {
    // Standalone module on purpose: own 25 s timeout; no retry so a save is never sent twice.
    // eslint-disable-next-line no-restricted-syntax
    res = await fetch(url(code, path), { signal: ctl.signal, method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    const e = new Error('No connection. Your entries are kept on this device; save again when online.');
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
    e.data = data;
    throw e;
  }
  return data;
}

// NSNC (AI assistant) lives at /api/nsnc/:code/* and needs a longer wait: it may
// read several data sources before answering. Same token, no retry.
async function nsncCall(code, path, method = 'GET', body) {
  let res;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 170000);
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const tok = getToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  try {
    // eslint-disable-next-line no-restricted-syntax
    res = await fetch(`${API_BASE}/api/nsnc/${encodeURIComponent(code)}${path}`, { signal: ctl.signal, method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (err) {
    const e = new Error(err?.name === 'AbortError' ? 'NSNC took too long. Try a shorter date range or a simpler question.' : 'No connection. Check the internet and try again.');
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

export const nsncApi = {
  status: (code) => nsncCall(code, '/status'),
  ask: (code, question, history) => nsncCall(code, '/ask', 'POST', { question, history }),
};

const rp = (date, branch) => `/reports/${encodeURIComponent(date)}/${encodeURIComponent(branch)}`;

export const t1Api = {
  info: (code) => call(code, '/info'),
  login: (code, body) => call(code, '/login', 'POST', body),
  me: (code) => call(code, '/me'),
  listReports: (code, from, to) => call(code, `/reports?from=${from || ''}&to=${to || ''}`),
  getReport: (code, date, branch) => call(code, rp(date, branch)),
  saveReport: (code, date, branch, data, baseVersion) => call(code, rp(date, branch), 'PUT', { data, baseVersion }),
  history: (code, date, branch) => call(code, `${rp(date, branch)}/history`),
  ownerList: (code, owner) => call(code, '/owner/accountants/list', 'POST', owner),
  ownerCreate: (code, body) => call(code, '/owner/accountants', 'POST', body),
  ownerUpdate: (code, id, body) => call(code, `/owner/accountants/${encodeURIComponent(id)}`, 'POST', body),
};
