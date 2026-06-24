import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('tenant_token'));
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('tenant_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [restaurantSlug, setRestaurantSlug] = useState(() => localStorage.getItem('tenant_slug'));

  const setAuth = (newToken, newUser, newSlug) => {
    setToken(newToken);
    setUser(newUser);
    setRestaurantSlug(newSlug);
    if (newToken) {
      localStorage.setItem('tenant_token', newToken);
      localStorage.setItem('ss_auth_token', newToken);
    }
    if (newUser) {
      const str = JSON.stringify(newUser);
      localStorage.setItem('tenant_user', str);
      localStorage.setItem('ss_auth_user', str);
    }
    if (newSlug) localStorage.setItem('tenant_slug', newSlug);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setRestaurantSlug(null);
    [
      'tenant_token', 'tenant_user', 'tenant_slug',
      'ss_auth_token', 'ss_auth_user'
    ].forEach(k => localStorage.removeItem(k));
  };

  return (
    <AuthContext.Provider value={{ token, user, restaurantSlug, setAuth, logout }}>
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
