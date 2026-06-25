import { createContext, useContext } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const OnlineStatusContext = createContext(true);

export function OnlineStatusProvider({ children }) {
  const isOnline = useOnlineStatus();
  return (
    <OnlineStatusContext.Provider value={isOnline}>
      {children}
      {!isOnline && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          Offline — actions will sync when reconnected
        </div>
      )}
    </OnlineStatusContext.Provider>
  );
}

export function useOnlineStatusContext() {
  return useContext(OnlineStatusContext);
}
