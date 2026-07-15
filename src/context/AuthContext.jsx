// ─────────────────────────────────────────────────────────────────────────────
// AuthContext — Client-side authentication state management
// ─────────────────────────────────────────────────────────────────────────────
// Provides global auth state via React Context:
//   - user: decoded JWT payload (id, role, restaurantId, etc.)
//   - token: JWT string stored in localStorage
//   - setAuth(token): stores token, decodes user, persists to localStorage
//   - logout(): clears token and user from state + localStorage
//
// Token validation:
//   - Client-side expiry check (UX only — NOT security validation)
//   - Backend always verifies JWT signature on every request
//   - This check prevents showing logged-in UI with an obviously expired token
//
// Usage: Wrap app in <AuthProvider>, then useAuth() in any component.
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useState } from 'react';

// React Context for auth state — null until AuthProvider wraps the app
const AuthContext = createContext(null);

/**
 * Client-side token expiry check — UX only, NOT security validation.
 * A malicious token with a forged expiry could pass this check.
 * The backend always verifies the signature; this just prevents showing
 * a logged-in UI with an obviously expired token.
 */
function isTokenValid(token) {
  if (!token) return false;
  // Edge server local tokens (offline PIN login) are not JWTs — always valid
  // until explicit logout. They have the form "edge-local-<timestamp>".
  if (token.startsWith('edge-local-')) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.exp) return true;
    return Date.now() < payload.exp * 1000;
  } catch {
    return false;
  }
}

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => {
    const saved = localStorage.getItem('ss_token');
    if (!isTokenValid(saved)) {
      localStorage.removeItem('ss_token');
      localStorage.removeItem('ss_user');
      localStorage.removeItem('ss_restaurant');
      localStorage.removeItem('ss_preauth_token');
      localStorage.removeItem('ss_accessible_outlets');
      return null;
    }
    return saved;
  });
  const [user, setUser] = useState(() => {
    if (!token) return null;
    const saved = localStorage.getItem('ss_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [restaurant, setRestaurantState] = useState(() => {
    if (!token) return null;
    const saved = localStorage.getItem('ss_restaurant');
    return saved ? JSON.parse(saved) : null;
  });

  const setAuth = ({ token: newToken, user: newUser, restaurant: newRestaurant }) => {
    setToken(newToken);
    setUser(newUser);
    setRestaurantState(newRestaurant);
    if (newToken) localStorage.setItem('ss_token', newToken);
    if (newUser) localStorage.setItem('ss_user', JSON.stringify(newUser));
    if (newRestaurant) localStorage.setItem('ss_restaurant', JSON.stringify(newRestaurant));
  };

  const setRestaurant = (updatedRestaurant) => {
    setRestaurantState(updatedRestaurant);
    if (updatedRestaurant) {
      localStorage.setItem('ss_restaurant', JSON.stringify(updatedRestaurant));
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setRestaurantState(null);
    localStorage.removeItem('ss_token');
    localStorage.removeItem('ss_preauth_token');
    localStorage.removeItem('ss_user');
    localStorage.removeItem('ss_restaurant');
    localStorage.removeItem('ss_accessible_outlets');
  };

  return (
    <AuthContext.Provider value={{ token, user, restaurant, setAuth, setRestaurant, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Returns whether a given module is enabled for the current restaurant.
 * `enabledModules` is a JSON object with lowercase keys, e.g.
 * { dashboard: true, bar: true, venue: false, inventory: true, ... }.
 *
 * Legacy-safe: if the restaurant has no enabledModules (not yet migrated),
 * or a specific key is absent, default to `true` so nothing is hidden.
 *
 * @param {string} moduleName - module key (case-insensitive), e.g. 'bar', 'venue'
 * @returns {boolean}
 */
export const useFeature = (moduleName) => {
  const { restaurant } = useAuth();
  if (!restaurant?.enabledModules) return true; // legacy-safe default: show everything
  return restaurant.enabledModules[String(moduleName).toLowerCase()] ?? true;
};
