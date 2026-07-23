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
import { ensureEdgeApiKey, isEdgeAvailable, edgeFetch, discoverEdgeUrlFromBackend, getEdgeUrl, getStoredEdgeApiKey } from './edgeHealth.js';

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
      localStorage.setItem('ss_token', data.token);
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
      localStorage.removeItem('ss_token');
      localStorage.removeItem('ss_user');
      localStorage.removeItem('ss_restaurant');
      localStorage.setItem('ss_preauth_token', data.preAuthToken);
      if (data.accessibleOutlets) {
        localStorage.setItem('ss_accessible_outlets', JSON.stringify(data.accessibleOutlets));
      }
    }
    return data;
  },

  async captainLogin(restaurantId, userId, pin, restaurantCode, role) {
    // ── Edge-only PIN login ─────────────────────────────────────────────────────
    // The edge server's local SQLite user DB is the single source of truth for
    // staff PIN verification. No cloud fallback — if the edge server is down,
    // login fails. This ensures consistent behavior online and offline.
    if (await isEdgeAvailable()) {
      const edgeResult = await this._tryEdgePinLogin(userId, pin);
      if (edgeResult) return edgeResult;
      // _tryEdgePinLogin returns null for both "wrong PIN" (terminal) and
      // "edge reachable but errored unexpectedly" (fall through). Distinguish
      // them: a 401 from the edge server is a definitive "invalid credentials"
      // and must not fall through. Other failures (5xx, timeout,
      // network) fall through.
      // The distinction is handled inside _tryEdgePinLogin via a thrown error
      // with `status` set — see below.
    }

    // Edge server unreachable — no cloud fallback.
    throw new Error('Edge server unreachable — check the restaurant server machine. PIN login requires the edge server to be running.');
  },

  async _tryEdgePinLogin(userId, pin) {
    const EDGE_URL = getEdgeUrl();
    try {
      const edgeApiKey = getStoredEdgeApiKey();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${EDGE_URL}/api/edge/auth/pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(edgeApiKey ? { 'X-Edge-Key': edgeApiKey } : {}),
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
        if (errMsg.includes('edge api key')) {
          console.warn('[AuthService] Edge API key rejected during PIN login — falling through to cloud');
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

      // Store a local session marker — not a cloud JWT, but enough for LAN API calls
      const localToken = `edge-local-${Date.now()}`;
      localStorage.setItem('ss_token', localToken);
      localStorage.setItem('ss_local_token', localToken);
      localStorage.setItem('ss_user', JSON.stringify(data.user));

      // Fetch outlet config from edge server immediately so billing.js
      // has correct GST rates, restaurant details, etc. from the start.
      // Without this, ss_restaurant is null and GST defaults to 5% NON_AC
      // until refreshOutletConfigFromEdge runs (up to 60s later).
      let restaurantConfig = null;
      try {
        const outletRes = await fetch(`${EDGE_URL}/api/edge/outlet`, {
          headers: { ...(edgeApiKey ? { 'X-Edge-Key': edgeApiKey } : {}) },
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
    const token = localStorage.getItem('ss_token') || localStorage.getItem('ss_preauth_token');
    const res = await fetch(`${API_BASE}/api/auth/switch-outlet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ outletId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to switch outlet');
    }
    localStorage.setItem('ss_token', data.token);
    localStorage.removeItem('ss_preauth_token');
    localStorage.setItem('ss_user', JSON.stringify(data.user));
    // Pre-fetch the LAN edge API key for the new outlet.
    ensureEdgeApiKey().catch(() => {});
    // Discover edge server LAN URL for the new outlet.
    discoverEdgeUrlFromBackend().catch(() => {});
    if (data.restaurant) {
      localStorage.setItem('ss_restaurant', JSON.stringify(data.restaurant));
    }
    if (import.meta.env.DEV) console.log('[AuthService] switchOutlet stored token, outlet:', data.restaurant?.id);
    purgeLegacyCaches();
    return data;
  },

  async logout() {
    const token = localStorage.getItem('ss_token');
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
    localStorage.removeItem('ss_token');
    localStorage.removeItem('ss_preauth_token');
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
    return localStorage.getItem('ss_token');
  },

  setToken(token) {
    localStorage.setItem('ss_token', token);
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
    const token = localStorage.getItem('ss_token');
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
    const token = localStorage.getItem('ss_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  },

  async fetchCrew(restaurantId) {
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
      outletId: null,
    };
  },
};
