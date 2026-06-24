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
    localStorage.setItem('tenant_token', data.token);
    localStorage.setItem('tenant_user', JSON.stringify(data.user));
    if (data.user?.restaurantId) {
      localStorage.setItem('tenant_restaurantId', data.user.restaurantId);
    }
    if (data.restaurant?.slug) {
      localStorage.setItem('tenant_slug', data.restaurant.slug);
    }
    if (data.user?.restaurantCode || data.restaurant?.restaurantCode) {
      localStorage.setItem('tenant_restaurantCode', data.user?.restaurantCode || data.restaurant?.restaurantCode);
    }
    if (data.restaurant) {
      localStorage.setItem('tenant_restaurant_config', JSON.stringify({
        logoUrl: data.restaurant.logoUrl ?? null,
        receiptHeader: data.restaurant.receiptHeader ?? null,
        receiptSubHeader: data.restaurant.receiptSubHeader ?? null,
        themePrimary: data.restaurant.themePrimary ?? null,
        printerConfig: data.restaurant.printerConfig ?? null,
        barUnitMl: data.restaurant.barUnitMl ?? 30,
        fullBottleMl: data.restaurant.fullBottleMl ?? 750,
        plan: data.restaurant.plan ?? 'starter',
        billingStatus: data.restaurant.billingStatus ?? 'trialing',
        features: data.restaurant.features ?? null,
      }));
    }
    return data.user;
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
    localStorage.setItem('tenant_token', data.token);
    localStorage.setItem('tenant_user', JSON.stringify(data.user));
    if (data.user?.restaurantId) {
      localStorage.setItem('tenant_restaurantId', data.user.restaurantId);
    }
    if (data.restaurant?.slug) {
      localStorage.setItem('tenant_slug', data.restaurant.slug);
    }
    if (data.user?.restaurantCode || data.restaurant?.restaurantCode) {
      localStorage.setItem('tenant_restaurantCode', data.user?.restaurantCode || data.restaurant?.restaurantCode);
    }
    if (data.restaurant) {
      localStorage.setItem('tenant_restaurant_config', JSON.stringify({
        logoUrl: data.restaurant.logoUrl ?? null,
        receiptHeader: data.restaurant.receiptHeader ?? null,
        receiptSubHeader: data.restaurant.receiptSubHeader ?? null,
        themePrimary: data.restaurant.themePrimary ?? null,
        printerConfig: data.restaurant.printerConfig ?? null,
        barUnitMl: data.restaurant.barUnitMl ?? 30,
        fullBottleMl: data.restaurant.fullBottleMl ?? 750,
        plan: data.restaurant.plan ?? 'starter',
        billingStatus: data.restaurant.billingStatus ?? 'trialing',
        features: data.restaurant.features ?? null,
      }));
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
    localStorage.removeItem('tenant_restaurantCode');
    localStorage.removeItem('tenant_restaurant_config');
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
