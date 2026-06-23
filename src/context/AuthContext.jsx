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
    if (newToken) localStorage.setItem('tenant_token', newToken);
    if (newUser) localStorage.setItem('tenant_user', JSON.stringify(newUser));
    if (newSlug) localStorage.setItem('tenant_slug', newSlug);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setRestaurantSlug(null);
    localStorage.removeItem('tenant_token');
    localStorage.removeItem('tenant_user');
    localStorage.removeItem('tenant_slug');
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
