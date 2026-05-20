export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme-preference';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

export function getStoredThemePreference(): ThemeMode | null {
  if (typeof window === 'undefined') return null;

  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(value) ? value : null;
  } catch {
    return null;
  }
}

export function getThemePreference(): ThemeMode {
  return getStoredThemePreference() ?? 'light';
}

export function applyThemePreference(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const isDark = theme === 'dark';

  root.classList.toggle('dark', isDark);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function persistThemePreference(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.dispatchEvent(new CustomEvent('airtrust:theme-updated', { detail: theme }));
  } catch {
    // Ignore storage errors in privacy mode / blocked storage environments.
  }
}

export function initializeThemePreference(): ThemeMode {
  const theme = getThemePreference();
  applyThemePreference(theme);
  return theme;
}
