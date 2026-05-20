import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  applyThemePreference,
  getThemePreference,
  persistThemePreference,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from './theme';

interface ThemeContextValue {
  isDark: boolean;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => getThemePreference());

  useEffect(() => {
    applyThemePreference(theme);
    persistThemePreference(theme);
  }, [theme]);

  useEffect(() => {
    const syncTheme = (event: Event) => {
      const customEvent = event as CustomEvent<ThemeMode>;
      const nextTheme = customEvent.detail ?? getThemePreference();
      setThemeState(nextTheme);
    };

    const syncThemeFromStorage = (event: StorageEvent) => {
      if (event.key && event.key !== THEME_STORAGE_KEY) return;
      setThemeState(getThemePreference());
    };

    window.addEventListener('airtrust:theme-updated', syncTheme as EventListener);
    window.addEventListener('storage', syncThemeFromStorage);

    return () => {
      window.removeEventListener('airtrust:theme-updated', syncTheme as EventListener);
      window.removeEventListener('storage', syncThemeFromStorage);
    };
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      isDark: theme === 'dark',
      theme,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((current) => (current === 'dark' ? 'light' : 'dark')),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}
