import { createContext, useContext } from "react";
import { useMenuSync } from "../hooks/useMenuSync";

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
