import React, { createContext, useContext, useState } from 'react';

const OutletContext = createContext({ outlet: 'restaurant', setOutlet: () => {} });

export function OutletProvider({ children }) {
  const [outlet, setOutlet] = useState(
    () => localStorage.getItem('softshape_active_outlet') || 'restaurant'
  );

  const switchOutlet = (next) => {
    setOutlet(next);
    localStorage.setItem('softshape_active_outlet', next);
  };

  return (
    <OutletContext.Provider value={{ outlet, switchOutlet }}>
      {children}
    </OutletContext.Provider>
  );
}

export function useOutlet() {
  return useContext(OutletContext);
}
