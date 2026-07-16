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
import { ensureEdgeApiKey, isEdgeAvailable, edgeFetch } from './edgeHealth.js';

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
    // ── Edge-first: if the local edge server is available, try PIN login there ──
    // The local SQLite user DB is authoritative once the device is linked.
    // A wrong PIN must NOT silently retry against cloud — that would make
    // offline and online login behave differently for the same credentials.
    if (await isEdgeAvailable()) {
      const edgeResult = await this._tryEdgePinLogin(userId, pin);
      if (edgeResult) return edgeResult;
      // _tryEdgePinLogin returns null for both "wrong PIN" (terminal) and
      // "edge reachable but errored unexpectedly" (fall through). Distinguish
      // them: a 401 from the edge server is a definitive "invalid credentials"
      // and must not fall through to cloud. Other failures (5xx, timeout,
      // network) fall through.
      // The distinction is handled inside _tryEdgePinLogin via a thrown error
      // with `status` set — see below.
    }

    // ── Cloud fallback (edge not available, or edge errored unexpectedly) ──────
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CLOUD_LOGIN_TIMEOUT_MS);
      const res = await fetch(`${API_BASE}/api/auth/captain-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, userId, pin, restaurantCode, role }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }
      localStorage.setItem('ss_token', data.token);
      localStorage.setItem('ss_user', JSON.stringify(data.user));
      // Pre-fetch the LAN edge API key while we have cloud access.
      ensureEdgeApiKey().catch(() => {});
      if (data.restaurant) {
        localStorage.setItem('ss_restaurant', JSON.stringify(data.restaurant));
      }
      if (import.meta.env.DEV) console.log('[AuthService] captainLogin stored token, user:', data.user?.role, 'restaurant:', data.restaurant?.id);
      purgeLegacyCaches();
      return data;
    } catch (err) {
      // If the edge server was available but returned an unexpected error,
      // and the cloud fetch also fails, surface the cloud error.
      if (err.name === 'AbortError') {
        throw new Error('Login timed out — check your internet connection and try again.', { cause: err });
      }
      throw err;
    }
  },

  async _tryEdgePinLogin(userId, pin) {
    const EDGE_URL = import.meta.env.VITE_EDGE_URL || 'http://127.0.0.1:3101';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${EDGE_URL}/api/edge/auth/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, pin }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // 401 = wrong PIN / invalid credentials — terminal, do not fall through.
      // Throw with status so captainLogin can distinguish from edge errors.
      if (res.status === 401) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.error || 'Invalid credentials');
        err.status = 401;
        err.edgeInvalidCredentials = true;
        throw err;
      }

      // 5xx / other server errors — edge is reachable but broken; fall through.
      if (!res.ok) return null;

      const data = await res.json();
      if (!data.success) return null;

      // Store a local session marker — not a cloud JWT, but enough for LAN API calls
      const localToken = `edge-local-${Date.now()}`;
      localStorage.setItem('ss_token', localToken);
      localStorage.setItem('ss_local_token', localToken);
      localStorage.setItem('ss_user', JSON.stringify(data.user));
      console.log('[AuthService] Offline PIN login via edge server — user:', data.user?.role);
      return {
        token: localToken,
        user: data.user,
        restaurant: null,
        offline: true,
      };
    } catch (err) {
      // Wrong PIN (401) is terminal — re-throw so captainLogin surfaces it.
      if (err?.edgeInvalidCredentials) throw err;
      // Timeout / network error — edge unreachable or broken; return null to
      // signal captainLogin to fall through to cloud.
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
