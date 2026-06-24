import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../services/apiConfig';

const OutletContext = createContext({ outlet: 'restaurant', setOutlet: () => {}, enabledModules: null });

const LEGACY_DEFAULT_MODULES = {
  dashboard: true, tables: true, menu: true, orders: true, transactions: true,
  reports: true, captains: true, settings: true, payroll: true, marketing: true,
  bar: true, inventory: true, pricing: true, venue: true, surveillance: false,
};

export function OutletProvider({ children }) {
  const [outlet, setOutlet] = useState(
    () => localStorage.getItem('softshape_active_outlet') || 'restaurant'
  );
  const [enabledModules, setEnabledModules] = useState(null);

  useEffect(() => {
    const fetchModules = async () => {
      try {
        const data = await apiFetch('/api/restaurant/me');
        if (data?.restaurant?.enabledModules) {
          setEnabledModules(data.restaurant.enabledModules);
        } else {
          setEnabledModules(LEGACY_DEFAULT_MODULES);
        }
      } catch {
        setEnabledModules(LEGACY_DEFAULT_MODULES);
      }
    };
    fetchModules();
  }, []);

  const switchOutlet = (next) => {
    setOutlet(next);
    localStorage.setItem('softshape_active_outlet', next);
  };

  return (
    <OutletContext.Provider value={{ outlet, switchOutlet, enabledModules }}>
      {children}
    </OutletContext.Provider>
  );
}

export function useOutlet() {
  return useContext(OutletContext);
}
