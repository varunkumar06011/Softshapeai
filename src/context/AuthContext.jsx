import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

/**
 * Client-side token expiry check — UX only, NOT security validation.
 * A malicious token with a forged expiry could pass this check.
 * The backend always verifies the signature; this just prevents showing
 * a logged-in UI with an obviously expired token.
 */
function isTokenValid(token) {
  if (!token) return false;
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
      return null;
    }
    return saved;
  });
  const [user, setUser] = useState(() => {
    const savedToken = localStorage.getItem('ss_token');
    if (!isTokenValid(savedToken)) {
      return null;
    }
    const saved = localStorage.getItem('ss_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [restaurant, setRestaurantState] = useState(() => {
    const savedToken = localStorage.getItem('ss_token');
    if (!isTokenValid(savedToken)) {
      return null;
    }
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
    localStorage.removeItem('ss_user');
    localStorage.removeItem('ss_restaurant');
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
