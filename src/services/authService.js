const TOKEN_KEY = 'ss_auth_token';
const USER_KEY = 'ss_auth_user';

function getApiBase() {
  return (
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    'https://softshape-backend.onrender.com'
  );
}

export const authService = {
  // Email + password login (OWNER / ADMIN)
  async login(email, password) {
    const res = await fetch(`${getApiBase()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid credentials');
    this._persistAuth(data.token, data.user);
    if (data.restaurant?.slug) localStorage.setItem('tenant_slug', data.restaurant.slug);
    return data.user;
  },

  // PIN login (CAPTAIN / CASHIER) — sends captainId from crew fetch
  async captainLogin(captainId, pin) {
    const res = await fetch(`${getApiBase()}/api/auth/captain-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captainId, pin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid credentials');
    this._persistAuth(data.token, data.user);
    return data.user;
  },

  // Fetch crew list for a restaurant (by slug or DB id)
  async fetchCrew(restaurantId) {
    const res = await fetch(
      `${getApiBase()}/api/auth/crew?restaurantId=${encodeURIComponent(restaurantId)}` 
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load staff');
    // Cache the resolved DB restaurantId for later use
    if (data.restaurantId) {
      const user = this.getUser();
      if (!user?.restaurantId) {
        localStorage.setItem('pending_restaurant_id', data.restaurantId);
      }
    }
    return data; // { captains: [{id,name}], cashiers: [{id,name}], restaurantId }
  },

  async logout() {
    const token = this.getToken();
    try {
      if (token) {
        await fetch(`${getApiBase()}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch { /* ignore network errors */ }
    [
      TOKEN_KEY, USER_KEY,
      'tenant_token', 'tenant_user', 'tenant_slug',
      'captain_auth_v2', 'active_captain',
      'pending_restaurant_id'
    ].forEach(k => localStorage.removeItem(k));
  },

  getToken() {
    return (
      localStorage.getItem(TOKEN_KEY) ||
      localStorage.getItem('tenant_token') ||
      null
    );
  },

  getUser() {
    try {
      const raw =
        localStorage.getItem(USER_KEY) ||
        localStorage.getItem('tenant_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  isAuthenticated() {
    const token = this.getToken();
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
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },

  // Internal: write to both key sets so all consumers stay in sync
  _persistAuth(token, user) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem('tenant_token', token);
    }
    if (user) {
      const str = JSON.stringify(user);
      localStorage.setItem(USER_KEY, str);
      localStorage.setItem('tenant_user', str);
    }
  },
};
