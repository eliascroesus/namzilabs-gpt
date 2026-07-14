"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

export type AppTheme = "light" | "dark";

const storageKey = "namzi-app-theme";
const ThemeContext = createContext<{
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
} | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore<AppTheme>(
    (notify) => {
      window.addEventListener("storage", notify);
      window.addEventListener("namzi-theme-change", notify);
      return () => {
        window.removeEventListener("storage", notify);
        window.removeEventListener("namzi-theme-change", notify);
      };
    },
    () => {
      const saved = window.localStorage.getItem(storageKey);
      return saved === "light" ? "light" : "dark";
    },
    () => "dark" as AppTheme,
  );

  function setTheme(next: AppTheme) {
    window.localStorage.setItem(storageKey, next);
    window.dispatchEvent(new Event("namzi-theme-change"));
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div className={`app-theme app-theme-${theme}`}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useAppTheme must be used inside AppThemeProvider");
  return context;
}
