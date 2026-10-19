// ─────────────────────────────────────────────────────────────────────────────
// Auth Service — Authentication API client and token management
// ─────────────────────────────────────────────────────────────────────────────
// Frontend authentication service that handles:
//   - Login (email/password + restaurantCode)
//   - PIN login (captain/cashier quick login)
//   - Token storage in localStorage (key: 'softshape_token')
//   - Auth header generation for API calls
//   - Logout with cache cleanup and socket disconnection
//   - Outlet switching (multi-outlet organizations)
//   - Password reset (forgot/reset flow)
//
// On logout: purges legacy caches, clears tenant-scoped caches, disconnects socket.
// ─────────────────────────────────────────────────────────────────────────────

import { purgeLegacyCaches, clearTenantCaches } from '../utils/cacheKeys';
import { API_BASE } from './apiConfig';
import { ensureEdgeApiKey, isEdgeAvailable, isEdgeAvailableFast, edgeFetch, discoverEdgeUrlFromBackend, discoverEdgeOnLAN, getEdgeUrl, getStoredEdgeApiKey, setStoredEdgeApiKey, getStoredEdgeRuntimeToken, setStoredEdgeRuntimeToken, getConnectivityState, getEdgeRestaurantId, invalidateEdgeHealthCache, rememberOutletAlias, isCurrentEdgeForOutlet, setOutletEdgeHints } from './edgeHealth.js';
import secureStorage from '../utils/secureStorage.js';
import { edgeUnreachableError } from './captainEdgeOnly.js';

const CLOUD_LOGIN_TIMEOUT_MS = 4000;
const CLOUD_CREW_TIMEOUT_MS = 6000;
// How long PIN login waits for edge discovery before trying the cloud in
// parallel. A remembered PC answers in ~100ms; an unknown one shouldn't hold
// the captain for the whole LAN scan.
const LOGIN_EDGE_WAIT_MS = 3000;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function isNetworkError(err) {
  return err?.name === 'AbortError' || err?.name === 'TypeError' || err?.networkError === true;
}

/**
 * True when the edge at getEdgeUrl() is reachable, ready, and — if an outlet
 * is given — bound to that outlet. Guards against a stale URL still pointing
 * at the previous outlet's PC (bar → restaurant on the same WiFi).
 */
async function isEdgeReadyForOutlet(outletIdOrCode) {
  // Direct health check on the current URL. getEdgeConnectivityState() can
  // block on a full unfiltered discovery the first time it runs.
  await isEdgeAvailableFast();
  if (getConnectivityState() !== 'edge_reachable') return false;
  return isCurrentEdgeForOutlet(outletIdOrCode).catch(() => false);
}

export const authService = {
  async login(email, password, restaurantCode) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, restaurantCode }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error(
        `Backend returned non-JSON response (HTTP ${res.status} ${res.statusText}). ` +
        `URL: ${API_BASE}/api/auth/login. Response starts with: ${text.slice(0, 60).replace(/\n/g, ' ')}...`
      );
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid credentials');
    }
    if (data.token) {
      secureStorage.setItem('ss_token', data.token);
      localStorage.setItem('ss_user', JSON.stringify(data.user));
      // Pre-fetch the LAN edge API key while we have cloud access. Forced:
      // a cached key may belong to the outlet this device was on before.
      ensureEdgeApiKey({ force: true }).catch(() => {});
      // Discover edge server LAN URL so captain/cashier on other devices can find it.
      discoverEdgeUrlFromBackend().catch(() => {});
      if (data.restaurant) {
        localStorage.setItem('ss_restaurant', JSON.stringify(data.restaurant));
      }
      if (data.accessibleOutlets) {
        localStorage.setItem('ss_accessible_outlets', JSON.stringify(data.accessibleOutlets));
      }
      if (import.meta.env.DEV) console.log('[AuthService] login stored token, user:', data.user?.role, 'restaurant:', data.restaurant?.id);
      purgeLegacyCaches();
    }
    if (data.preAuthToken) {
      // Clear stale session from previous login so old tokens don't
      // interfere with the outlet selection flow
      secureStorage.removeItem('ss_token');
      localStorage.removeItem('ss_user');
      localStorage.removeItem('ss_restaurant');
      secureStorage.setItem('ss_preauth_token', data.preAuthToken);
      if (data.accessibleOutlets) {
        localStorage.setItem('ss_accessible_outlets', JSON.stringify(data.accessibleOutlets));
      }
    }
    return data;
  },

  async captainLogin(restaurantId, userId, pin, restaurantCode, role) {
    // ── Edge-first PIN login with cloud fallback ────────────────────────────────
    // Try the edge server first (offline-capable, low latency). If edge is
    // unreachable, not onboarded, or returns no result, fall through to the
    // cloud /api/auth/captain-login endpoint. This mirrors sendOutputIntent()'s
    // edge-then-cloud pattern and ensures login works even when edge discovery
    // finds the wrong (non-onboarded) server or the edge server is down.
    //
    // Wrong PIN (401 edgeInvalidCredentials) is terminal — re-throw so the
    // user sees "Invalid PIN" rather than silently succeeding via cloud.
    //
    // Outlet-filtered discovery so we connect to THIS outlet's edge server,
    // not a sibling outlet's on the same WiFi. A remembered PC for the outlet
    // resolves in one probe; otherwise we give the scan LOGIN_EDGE_WAIT_MS,
    // then try the cloud while the scan keeps running in the background.
    // Cashier/manager logins may run on a counter PC that opted out of
    // captains — only captains skip those PCs.
    const forCaptain = !role || String(role).toLowerCase() === 'captain';
    const discovery = restaurantId
      ? discoverEdgeOnLAN({ expectedRestaurantId: restaurantId, forCaptain }).catch(() => null)
      : Promise.resolve(null);
    await Promise.race([discovery, delay(LOGIN_EDGE_WAIT_MS)]);

    const edgeResult = await this._tryEdgePinLoginIfReachable(userId, pin, restaurantId);
    if (edgeResult) return edgeResult;

    try {
      return await this._cloudCaptainLogin(restaurantId, userId, pin, role);
    } catch (err) {
      if (!err?.networkError) throw err;
      // No internet — the outlet's PC is the only way in. Let the scan
      // finish and retry on the edge before giving up.
      if (await discovery) {
        const retry = await this._tryEdgePinLoginIfReachable(userId, pin, restaurantId);
        if (retry) return retry;
      }
      throw err;
    }
  },

  /**
   * Captain app login — edge only. The outlet's billing PC is found on the
   * WiFi, it checks the PIN and hands out the LAN credentials. The cloud is
   * never tried, and a sibling outlet's PC is never used.
   */
  async captainEdgeLogin(outletId, userId, pin) {
    await discoverEdgeOnLAN({ expectedRestaurantId: outletId, forCaptain: true }).catch(() => null);
    if (!(await isCurrentEdgeForOutlet(outletId).catch(() => false))) {
      throw edgeUnreachableError('This outlet\'s billing PC was not found on this WiFi. Check the phone is on the restaurant WiFi and the billing PC is on.');
    }
    // One retry: the PIN check has a short timeout and phone WiFi can be weak.
    const result = await this._tryEdgePinLogin(userId, pin) || await this._tryEdgePinLogin(userId, pin);
    if (!result) throw new Error('The billing PC could not log you in. Ask the cashier to check that the billing PC is set up.');
    return result;
  },

  /** Captains of the outlet whose billing PC is at `edgeUrl` (public LAN endpoint). */
  async fetchCaptainsFromEdge(edgeUrl) {
    const res = await fetch(`${edgeUrl}/api/edge/staff?role=CAPTAIN`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'The billing PC did not return the captain list.');
    return Array.isArray(data.staff) ? data.staff : [];
  },

  async _tryEdgePinLoginIfReachable(userId, pin, restaurantId) {
    try {
      if (!(await isEdgeReadyForOutlet(restaurantId))) return null;
      // Null = edge reachable but misconfigured → caller falls through to cloud.
      return await this._tryEdgePinLogin(userId, pin);
    } catch (err) {
      // Wrong PIN (401) is terminal — surface "Invalid PIN", don't try cloud.
      if (err?.edgeInvalidCredentials) throw err;
      // Network/timeout errors — fall through to cloud.
      return null;
    }
  },

  async _cloudCaptainLogin(restaurantId, userId, pin, role) {
    // Cloud fallback — POST /api/auth/captain-login (already exists on backend)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CLOUD_LOGIN_TIMEOUT_MS);
      const res = await fetch(`${API_BASE}/api/auth/captain-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, userId, pin, role }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Invalid PIN');
      }
      const data = await res.json();
      secureStorage.setItem('ss_token', data.token);
      localStorage.setItem('ss_user', JSON.stringify(data.user));
      if (data.restaurant) {
        localStorage.setItem('ss_restaurant', JSON.stringify(data.restaurant));
      }
      if (data.accessibleOutlets) {
        localStorage.setItem('ss_accessible_outlets', JSON.stringify(data.accessibleOutlets));
      }
      return { token: data.token, user: data.user, restaurant: data.restaurant };
    } catch (err) {
      const wrapped = err.name === 'AbortError'
        ? new Error('Login timed out — check your internet connection and try again.', { cause: err })
        : new Error(err.message || 'Login failed — check your connection and try again.', { cause: err });
      // Lets captainLogin tell "no internet" apart from a rejected PIN.
      if (isNetworkError(err)) wrapped.networkError = true;
      throw wrapped;
    }
  },

  async _tryEdgePinLogin(userId, pin) {
    const EDGE_URL = getEdgeUrl();
    try {
      const edgeApiKey = getStoredEdgeApiKey(EDGE_URL);
      const runtimeToken = getStoredEdgeRuntimeToken(EDGE_URL);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${EDGE_URL}/api/edge/auth/pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(edgeApiKey ? { 'X-Edge-Key': edgeApiKey } : {}),
          ...(runtimeToken ? { 'Authorization': `Bearer ${runtimeToken}` } : {}),
        },
        body: JSON.stringify({ userId, pin }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // 401 could be wrong PIN OR missing/invalid edge API key.
      // Distinguish: if the error mentions "edge api key", it's a key
      // issue — fall through to cloud instead of treating as wrong PIN.
      if (res.status === 401) {
        const body = await res.json().catch(() => ({}));
        const errMsg = (body.error || '').toLowerCase();
        if (errMsg.includes('edge api key') || errMsg.includes('runtime token') || errMsg.includes('not linked locally')) {
          console.warn('[AuthService] Edge auth rejected during PIN login — falling through to cloud');
          return null;
        }
        const err = new Error(body.error || 'Invalid credentials');
        err.status = 401;
        err.edgeInvalidCredentials = true;
        throw err;
      }

      // 5xx / other server errors — edge is reachable but broken; return null
      // so captainLogin can surface the "edge unreachable" error.
      if (!res.ok) return null;

      const data = await res.json();
      if (!data.success) return null;

      // Save the runtime token returned by the edge server so that
      // subsequent edgeFetch() calls can send it as Authorization: Bearer.
      // Captain devices skip EdgeSetupScreen when the edge server is already
      // set up, so this is the only place they can obtain the runtime token.
      if (data.runtimeToken) {
        setStoredEdgeRuntimeToken(data.runtimeToken, { url: EDGE_URL });
      }

      // Save the edge API key returned by the edge server. Captain devices
      // don't do cloud login, so /api/edge/key (requires JWT) is unreachable.
      // The PIN login response now includes edgeApiKey so the phone gets both
      // credentials in one call. Without this, all subsequent edgeFetch() calls
      // get 401 "Missing or invalid edge API key".
      const effectiveApiKey = data.edgeApiKey || edgeApiKey;
      if (data.edgeApiKey) {
        setStoredEdgeApiKey(data.edgeApiKey, { url: EDGE_URL });
      }

      // Store a local session marker — not a cloud JWT, but enough for LAN API calls
      const localToken = `edge-local-${Date.now()}`;
      secureStorage.setItem('ss_token', localToken);
      localStorage.setItem('ss_user', JSON.stringify(data.user));

      // Fetch outlet config from edge server immediately so billing.js
      // has correct GST rates, restaurant details, etc. from the start.
      // Without this, ss_restaurant is null and GST defaults to 5% NON_AC
      // until refreshOutletConfigFromEdge runs (up to 60s later).
      let restaurantConfig = null;
      try {
        const outletRes = await fetch(`${EDGE_URL}/api/edge/outlet`, {
          headers: {
            ...(effectiveApiKey ? { 'X-Edge-Key': effectiveApiKey } : {}),
            ...(data.runtimeToken ? { 'Authorization': `Bearer ${data.runtimeToken}` } : {}),
          },
        });
        if (outletRes.ok) {
          const outlet = await outletRes.json();
          if (outlet && outlet.id) {
            restaurantConfig = {
              id: outlet.id,
              name: outlet.name,
              slug: outlet.slug,
              restaurantCode: outlet.restaurant_code || outlet.restaurantCode,
              gstCategory: outlet.gst_category || outlet.gstCategory || 'NON_AC',
              gstRate: outlet.gst_rate ?? outlet.gstRate ?? null,
              gstRegistered: outlet.gst_registered ?? outlet.gstRegistered ?? true,
              pricesIncludeGst: outlet.prices_include_gst ?? outlet.pricesIncludeGst ?? false,
              serviceChargePercent: outlet.service_charge_percent ?? outlet.serviceChargePercent ?? 0,
              receiptHeader: outlet.receipt_header || outlet.receiptHeader,
              receiptSubHeader: outlet.receipt_sub_header || outlet.receiptSubHeader,
              gstin: outlet.gstin,
              address: outlet.address,
              phone: outlet.phone,
              email: outlet.email,
              fssai: outlet.fssai,
              logoUrl: outlet.logo_url || outlet.logoUrl,
              enabledModules: outlet.enabled_modules || outlet.enabledModules || {},
              restaurantType: outlet.restaurant_type || outlet.restaurantType || null,
            };
            localStorage.setItem('ss_restaurant', JSON.stringify(restaurantConfig));
          }
        }
      } catch (outletErr) {
        console.warn('[AuthService] Failed to fetch outlet config during PIN login:', outletErr.message);
      }

      console.log('[AuthService] Offline PIN login via edge server — user:', data.user?.role);
      return {
        token: localToken,
        user: data.user,
        restaurant: restaurantConfig,
        offline: true,
      };
    } catch (err) {
      // Wrong PIN (401) is terminal — re-throw so captainLogin surfaces it.
      if (err?.edgeInvalidCredentials) throw err;
      // Timeout / network error — edge unreachable; return null so
      // captainLogin surfaces the "edge unreachable" error.
      return null;
    }
  },

  async switchOutlet(outletId) {
    const token = secureStorage.getItem('ss_token') || secureStorage.getItem('ss_preauth_token');
    const res = await fetch(`${API_BASE}/api/auth/switch-outlet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ outletId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to switch outlet');
    }
    secureStorage.setItem('ss_token', data.token);
    secureStorage.removeItem('ss_preauth_token');
    localStorage.setItem('ss_user', JSON.stringify(data.user));
    // Fetch the LAN edge API key for the new outlet (forced — the cached
    // key is the previous outlet's).
    ensureEdgeApiKey({ force: true }).catch(() => {});
    // Discover edge server LAN URL for the new outlet. Try cloud discovery
    // first (outlet-aware via JWT), then filtered LAN scan as fallback so
    // we don't connect to a sibling outlet's edge server on shared WiFi.
    discoverEdgeUrlFromBackend().catch(() => {});
    discoverEdgeOnLAN({ expectedRestaurantId: outletId }).catch(() => {});
    if (data.restaurant) {
      localStorage.setItem('ss_restaurant', JSON.stringify(data.restaurant));
    }
    if (import.meta.env.DEV) console.log('[AuthService] switchOutlet stored token, outlet:', data.restaurant?.id);
    purgeLegacyCaches();
    invalidateEdgeHealthCache();
    return data;
  },

  async logout() {
    const token = secureStorage.getItem('ss_token');
    try {
      if (token) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // ignore network errors on logout
    }
    const restaurantId = this.getRestaurantId();
    secureStorage.removeItem('ss_token');
    secureStorage.removeItem('ss_preauth_token');
    localStorage.removeItem('ss_user');
    localStorage.removeItem('ss_restaurant');
    localStorage.removeItem('ss_accessible_outlets');
    clearTenantCaches(restaurantId);
    try {
      const { disconnectSocket } = await import('../hooks/useSocket');
      disconnectSocket();
    } catch {
      // ignore if socket module fails to load
    }
  },

  getToken() {
    return secureStorage.getItem('ss_token');
  },

  setToken(token) {
    secureStorage.setItem('ss_token', token);
  },

  getUser() {
    try {
      const raw = localStorage.getItem('ss_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  getRestaurantId() {
    try {
      const raw = localStorage.getItem('ss_restaurant');
      return raw ? JSON.parse(raw).id : null;
    } catch {
      return null;
    }
  },

  getAccessibleOutlets() {
    try {
      const raw = localStorage.getItem('ss_accessible_outlets');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  isAuthenticated() {
    const token = secureStorage.getItem('ss_token');
    if (!token) return false;
    // Edge server local tokens (offline PIN login) are not JWTs
    if (token.startsWith('edge-local-')) return true;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (!payload.exp) return true;
      return Date.now() < payload.exp * 1000;
    } catch {
      return false;
    }
  },

  getAuthHeader() {
    const token = secureStorage.getItem('ss_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  },

  async fetchCrew(restaurantId, { forCaptain = false } = {}) {
    // ── Edge-first crew fetch with cloud fallback ──────────────────────────────
    // Mirrors captainLogin()'s edge-then-cloud pattern. When the edge server is
    // reachable, fetch crew locally (offline-capable, low latency). Falls through
    // to the cloud /api/auth/crew endpoint if edge is unavailable or errors.
    //
    // `restaurantId` is usually the outlet code/slug the captain typed.
    // 1. Known PC for that outlet → one fast probe, crew from the edge.
    // 2. Otherwise ask the cloud (resolves code → id and returns the outlet's
    //    PC addresses), and warm up discovery in the background so the PIN
    //    login that follows finds the PC immediately.
    // 3. No internet → full LAN scan for the outlet's PC.
    const tryEdgeCrew = async () => {
      try {
        if (!(await isEdgeReadyForOutlet(restaurantId))) return null;
        return await this.fetchCrewEdge();
      } catch {
        return null;
      }
    };

    if (restaurantId) {
      const known = await discoverEdgeOnLAN({ expectedRestaurantId: restaurantId, forCaptain, fastOnly: true }).catch(() => null);
      if (known) {
        const edgeResult = await tryEdgeCrew();
        if (edgeResult) return edgeResult;
      }
    }

    let res;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CLOUD_CREW_TIMEOUT_MS);
      try {
        res = await fetch(`${API_BASE}/api/auth/crew?restaurantId=${encodeURIComponent(restaurantId)}`, {
          headers: this.getAuthHeader(),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      if (!isNetworkError(err) || !restaurantId) throw err;
      // Offline: the outlet's own PC is the only source of the crew list.
      const found = await discoverEdgeOnLAN({ expectedRestaurantId: restaurantId, forCaptain }).catch(() => null);
      const edgeResult = found ? await tryEdgeCrew() : null;
      if (edgeResult) return edgeResult;
      throw new Error('No internet and this outlet\'s billing PC was not found on this WiFi.', { cause: err });
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error(
        `Backend returned a non-JSON response (HTTP ${res.status}). ` +
        `URL: ${API_BASE}/api/auth/crew. Response starts with: ${text.slice(0, 80).replace(/\s+/g, ' ')}...`
      );
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch crew');
    }
    if (data.outletId) {
      // Next time this code is typed, the outlet's PC is matched by id with
      // no cloud round-trip.
      rememberOutletAlias(restaurantId, data.outletId);
      if (Array.isArray(data.edgeHints)) setOutletEdgeHints(data.outletId, data.edgeHints);
      // Warm up discovery now; captainLogin joins this same scan.
      discoverEdgeOnLAN({ expectedRestaurantId: data.outletId, forCaptain }).catch(() => {});
    }
    return { ...data, restaurantId: data.restaurantId || data.outletId };
  },

  async fetchCrewEdge() {
    const data = await edgeFetch('/api/edge/staff');
    const staff = data.staff || [];
    const outletId = data.outletId || await getEdgeRestaurantId({ force: true }).catch(() => null);
    return {
      captains: staff.filter(u => u.role === 'CAPTAIN'),
      cashiers: staff.filter(u => u.role === 'CASHIER'),
      managers: staff.filter(u => u.role === 'MANAGER'),
      outletId: outletId || null,
      // CaptainApp reads restaurantId to route the PIN login to this outlet.
      restaurantId: outletId || null,
    };
  },
};
