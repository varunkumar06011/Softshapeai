function getApiBase() {
  return (
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    'https://softshape-backend.onrender.com'
  );
}

export const authService = {
  async login(email, password) {
    const res = await fetch(`${getApiBase()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid credentials');
    }
    localStorage.setItem('tenant_token', data.token);
    localStorage.setItem('tenant_user', JSON.stringify(data.user));
    if (data.user?.restaurantId) {
      localStorage.setItem('tenant_restaurantId', data.user.restaurantId);
    }
    if (data.restaurant?.slug) {
      localStorage.setItem('tenant_slug', data.restaurant.slug);
    }
    return data.user;
  },

  async captainLogin(restaurantId, userId, pin) {
    const res = await fetch(`${getApiBase()}/api/auth/captain-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId, userId, pin }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid credentials');
    }
    localStorage.setItem('tenant_token', data.token);
    localStorage.setItem('tenant_user', JSON.stringify(data.user));
    if (data.user?.restaurantId) {
      localStorage.setItem('tenant_restaurantId', data.user.restaurantId);
    }
    if (data.restaurant?.slug) {
      localStorage.setItem('tenant_slug', data.restaurant.slug);
    }
    return data.user;
  },

  async logout() {
    const token = localStorage.getItem('tenant_token');
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
    localStorage.removeItem('tenant_token');
    localStorage.removeItem('tenant_user');
    localStorage.removeItem('tenant_restaurantId');
    localStorage.removeItem('tenant_slug');
  },

  getToken() {
    return localStorage.getItem('tenant_token');
  },

  getUser() {
    try {
      const raw = localStorage.getItem('tenant_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  isAuthenticated() {
    const token = localStorage.getItem('tenant_token');
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
    const token = localStorage.getItem('tenant_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
};
