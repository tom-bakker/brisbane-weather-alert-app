import {useCallback, useEffect, useState} from 'react';

/** What the user picked. "system" follows the operating system setting. */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Whether to draw dark, given the preference and the OS setting. */
export function isDark(pref: ThemePreference, systemDark: boolean): boolean {
  return pref === 'dark' || (pref === 'system' && systemDark);
}

/** The preference after `pref` when cycling the toggle button. */
export function nextPreference(pref: ThemePreference): ThemePreference {
  if (pref === 'system') return 'light';
  if (pref === 'light') return 'dark';
  return 'system';
}

/** Parses a stored value, defaulting to "system". */
export function parsePreference(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function readStored(): ThemePreference {
  try {
    return parsePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

function store(pref: ThemePreference): void {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage blocked: the choice lasts for this page view only.
  }
}

function systemDark(): boolean {
  return window.matchMedia?.(DARK_QUERY).matches ?? false;
}

/**
 * The theme preference, kept in localStorage and applied as a `dark` class
 * on <html>. Follows OS changes while the preference is "system".
 */
export function useTheme(): {
  preference: ThemePreference;
  cycle: () => void;
} {
  const [preference, setPreference] = useState(readStored);

  useEffect(() => {
    const apply = () =>
      document.documentElement.classList.toggle(
        'dark',
        isDark(preference, systemDark()),
      );
    apply();
    const media = window.matchMedia?.(DARK_QUERY);
    media?.addEventListener('change', apply);
    return () => media?.removeEventListener('change', apply);
  }, [preference]);

  const cycle = useCallback(() => {
    setPreference((p) => {
      const next = nextPreference(p);
      store(next);
      return next;
    });
  }, []);

  return {preference, cycle};
}
