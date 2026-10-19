// ─────────────────────────────────────────────────────────────────────────────
// captainEdgeOnly — the captain app talks to its outlet's billing PC only
// ─────────────────────────────────────────────────────────────────────────────
// Captains log in, read tables/menu, send KOTs and print through the edge
// server on their outlet's billing PC. The cloud is never used: no cloud
// login, no cloud fallback for reads or writes, no cloud discovery and no
// queue that replays to the cloud later.
//
// The switch is the /captain route, so the cashier and admin screens (which
// share these services) keep their behaviour unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE, CLOUD_API_BASE } from './apiConfig';

/** True while the captain screens are open. */
export function isCaptainEdgeOnly() {
  if (typeof window === 'undefined') return false;
  return /^\/captain(\/|$)/.test(window.location?.pathname || '');
}

/** The error a captain sees when an action could not reach the billing PC. */
export function edgeUnreachableError(message = 'Billing PC not reachable — check that this phone is on the restaurant WiFi and the billing PC is on.') {
  const err = new Error(message);
  err.code = 'EDGE_UNREACHABLE';
  return err;
}

function isCloudUrl(url) {
  return [API_BASE, CLOUD_API_BASE].some(base => base && /^https?:\/\//.test(base) && url.startsWith(base));
}

let _guardInstalled = false;

/**
 * Refuse every request to the cloud API while the captain screens are open.
 * Services that still have a cloud path fail at once (as if offline) and use
 * their edge / cached data, instead of waiting on a cloud timeout or writing
 * to the cloud.
 */
export function installCaptainCloudGuard() {
  if (_guardInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  _guardInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (isCaptainEdgeOnly()) {
      const url = typeof input === 'string' ? input : (input?.url || String(input));
      if (isCloudUrl(url)) {
        const err = new TypeError('Cloud is not used by the captain app');
        err.cloudDisabled = true;
        return Promise.reject(err);
      }
    }
    return originalFetch(input, init);
  };
}
