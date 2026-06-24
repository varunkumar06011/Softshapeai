import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('tenant_token'));
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('tenant_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [restaurantSlug, setRestaurantSlug] = useState(() => localStorage.getItem('tenant_slug'));
  const [restaurantCode, setRestaurantCode] = useState(() => localStorage.getItem('tenant_restaurantCode'));

  const setAuth = (newToken, newUser, newSlug, newCode) => {
    setToken(newToken);
    setUser(newUser);
    setRestaurantSlug(newSlug);
    setRestaurantCode(newCode);
    if (newToken) localStorage.setItem('tenant_token', newToken);
    if (newUser) localStorage.setItem('tenant_user', JSON.stringify(newUser));
    if (newSlug) localStorage.setItem('tenant_slug', newSlug);
    if (newUser?.restaurantId) localStorage.setItem('tenant_restaurantId', newUser.restaurantId);
    if (newCode || newUser?.restaurantCode) localStorage.setItem('tenant_restaurantCode', newCode || newUser?.restaurantCode);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setRestaurantSlug(null);
    setRestaurantCode(null);
    localStorage.removeItem('tenant_token');
    localStorage.removeItem('tenant_user');
    localStorage.removeItem('tenant_slug');
    localStorage.removeItem('tenant_restaurantId');
    localStorage.removeItem('tenant_restaurantCode');
  };

  return (
    <AuthContext.Provider value={{ token, user, restaurantSlug, restaurantCode, setAuth, logout }}>
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
