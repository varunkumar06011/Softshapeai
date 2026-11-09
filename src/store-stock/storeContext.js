// storeContext.js — shared state for the Store Stock portal (kept apart from components).
import { createContext, useContext } from 'react';

export const StoreCtx = createContext(null);
export const useStore = () => useContext(StoreCtx);
