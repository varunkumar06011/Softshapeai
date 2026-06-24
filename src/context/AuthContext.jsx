import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('ss_token'));
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('ss_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [restaurant, setRestaurantState] = useState(() => {
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
