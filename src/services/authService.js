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
import { ensureEdgeApiKey } from './edgeHealth.js';

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
    try {
      const res = await fetch(`${API_BASE}/api/auth/captain-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, userId, pin, restaurantCode, role }),
      });
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
      // ── Offline fallback: try edge server local PIN verification ────────────
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        const edgeResult = await this._tryEdgePinLogin(userId, pin);
        if (edgeResult) return edgeResult;
      }
      throw err;
    }
  },

  async _tryEdgePinLogin(userId, pin) {
    const EDGE_URL = import.meta.env.VITE_EDGE_URL || 'http://localhost:3100';
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
    } catch {
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
};
