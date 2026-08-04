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
import { ensureEdgeApiKey, isEdgeAvailable, edgeFetch, discoverEdgeUrlFromBackend, discoverEdgeOnLAN, getEdgeUrl, getStoredEdgeApiKey, setStoredEdgeApiKey, getStoredEdgeRuntimeToken, setStoredEdgeRuntimeToken, getEdgeConnectivityState, invalidateEdgeHealthCache } from './edgeHealth.js';
import secureStorage from '../utils/secureStorage.js';

const CLOUD_LOGIN_TIMEOUT_MS = 4000;

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
      // Pre-fetch the LAN edge API key while we have cloud access.
      ensureEdgeApiKey().catch(() => {});
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
    try {
      // Run outlet-filtered LAN discovery so we connect to THIS outlet's edge
      // server, not a sibling outlet's server on the same WiFi. Skips
      // automatically if a manual edge URL is configured or discovery is
      // already done. Non-blocking on failure — cloud fallback still works.
      if (restaurantId) {
        await discoverEdgeOnLAN({ expectedRestaurantId: restaurantId }).catch(() => {});
      }
      const connState = await getEdgeConnectivityState();
      if (connState === 'edge_reachable') {
        const edgeResult = await this._tryEdgePinLogin(userId, pin);
        if (edgeResult) return edgeResult;
        // Edge reachable but login returned null — server misconfigured.
        // Fall through to cloud instead of hard-failing.
      }
    } catch (err) {
      if (err?.edgeInvalidCredentials) throw err;
      // Network/timeout errors — fall through to cloud.
    }

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
      return { token: data.token, user: data.user, restaurant: data.restaurant };
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Login timed out — check your internet connection and try again.');
      }
      throw new Error(err.message || 'Login failed — check your connection and try again.');
    }
  },

  async _tryEdgePinLogin(userId, pin) {
    const EDGE_URL = getEdgeUrl();
    try {
      const edgeApiKey = getStoredEdgeApiKey();
      const runtimeToken = getStoredEdgeRuntimeToken();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
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
        setStoredEdgeRuntimeToken(data.runtimeToken);
      }

      // Save the user-bound staff token returned by the edge server.
      // Used for cashier-specific authorization on edge menu-management writes.
      if (data.staffToken) {
        secureStorage.setItem('ss_edge_staff_token', data.staffToken);
      }

      // Save the edge API key returned by the edge server. Captain devices
      // don't do cloud login, so /api/edge/key (requires JWT) is unreachable.
      // The PIN login response now includes edgeApiKey so the phone gets both
      // credentials in one call. Without this, all subsequent edgeFetch() calls
      // get 401 "Missing or invalid edge API key".
      const effectiveApiKey = data.edgeApiKey || edgeApiKey;
      if (data.edgeApiKey) {
        setStoredEdgeApiKey(data.edgeApiKey);
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
    // Pre-fetch the LAN edge API key for the new outlet.
    ensureEdgeApiKey().catch(() => {});
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
    secureStorage.removeItem('ss_edge_staff_token');
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

  async fetchCrew(restaurantId) {
    // ── Edge-first crew fetch with cloud fallback ──────────────────────────────
    // Mirrors captainLogin()'s edge-then-cloud pattern. When the edge server is
    // reachable, fetch crew locally (offline-capable, low latency). Falls through
    // to the cloud /api/auth/crew endpoint if edge is unavailable or errors.
    try {
      if (restaurantId) {
        await discoverEdgeOnLAN({ expectedRestaurantId: restaurantId }).catch(() => {});
      }
      const connState = await getEdgeConnectivityState();
      if (connState === 'edge_reachable') {
        const edgeResult = await this.fetchCrewEdge();
        if (edgeResult) return edgeResult;
      }
    } catch {
      // Network/timeout errors — fall through to cloud.
    }

    const res = await fetch(`${API_BASE}/api/auth/crew?restaurantId=${encodeURIComponent(restaurantId)}`, {
      headers: this.getAuthHeader(),
    });
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
    return data;
  },

  async fetchCrewEdge() {
    const data = await edgeFetch('/api/edge/staff');
    const staff = data.staff || [];
    return {
      captains: staff.filter(u => u.role === 'CAPTAIN'),
      cashiers: staff.filter(u => u.role === 'CASHIER'),
      managers: staff.filter(u => u.role === 'MANAGER'),
      outletId: data.outletId || null,
    };
  },
};
