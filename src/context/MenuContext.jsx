// ─────────────────────────────────────────────────────────────────────────────
// MenuContext — Menu data context provider
// ─────────────────────────────────────────────────────────────────────────────
// Wraps the useMenuSync hook and exposes its value via React Context.
// Provides menu items, categories, and sync status to all child components
// without prop drilling.
//
// Usage: Wrap app in <MenuProvider>, then useMenu() in any component.
// Throws if useMenu() is called outside MenuProvider.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext } from "react";
import { useMenuSync } from "../hooks/useMenuSync";

// React Context for menu data — null until MenuProvider wraps the app
const MenuContext = createContext(null);

export function MenuProvider({ children }) {
  const value = useMenuSync();
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

export function useMenu() {
  const ctx = useContext(MenuContext);
  if (!ctx) {
    throw new Error("useMenu must be used within MenuProvider");
  }
  return ctx;
}
