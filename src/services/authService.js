import { purgeLegacyCaches, clearTenantCaches } from '../utils/cacheKeys';
import { disconnectSocket } from '../hooks/useSocket';

function getApiBase() {
  return (
    import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || ''
  );
}

export const authService = {
  async login(email, password, restaurantCode) {
    const res = await fetch(`${getApiBase()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, restaurantCode }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid credentials');
    }
    localStorage.setItem('ss_token', data.token);
    localStorage.setItem('ss_user', JSON.stringify(data.user));
    if (data.restaurant) {
      localStorage.setItem('ss_restaurant', JSON.stringify(data.restaurant));
    }
    purgeLegacyCaches();
    return data;
  },

  async captainLogin(restaurantId, userId, pin, restaurantCode) {
    const res = await fetch(`${getApiBase()}/api/auth/captain-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId, userId, pin, restaurantCode }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid credentials');
    }
    localStorage.setItem('ss_token', data.token);
    localStorage.setItem('ss_user', JSON.stringify(data.user));
    if (data.restaurant) {
      localStorage.setItem('ss_restaurant', JSON.stringify(data.restaurant));
    }
    purgeLegacyCaches();
    return data;
  },

  async logout() {
    const token = localStorage.getItem('ss_token');
    try {
      if (token) {
        await fetch(`${getApiBase()}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // ignore network errors on logout
    }
    const restaurantId = this.getRestaurantId();
    disconnectSocket();
    localStorage.removeItem('ss_token');
    localStorage.removeItem('ss_user');
    localStorage.removeItem('ss_restaurant');
    clearTenantCaches(restaurantId);
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
    const res = await fetch(`${getApiBase()}/api/auth/crew?restaurantId=${encodeURIComponent(restaurantId)}`, {
      headers: this.getAuthHeader(),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch crew');
    }
    return data;
  },
};
