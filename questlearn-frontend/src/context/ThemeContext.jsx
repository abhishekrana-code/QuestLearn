import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'questlearn.theme';
const ThemeContext = createContext(null);

const systemTheme = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';

const readStored = () => {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
};

/**
 * Light / dark / system, persisted and applied to <html>.
 *
 * <p>An inline script in index.html paints the right theme before React boots,
 * so a light-theme user never sees a dark flash. This provider keeps that
 * class in step afterwards and follows the OS while "system" is selected.</p>
 */
export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readStored);
  const [system, setSystem] = useState(systemTheme);

  const resolved = preference === 'system' ? system : preference;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (event) => setSystem(event.matches ? 'light' : 'dark');
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'light' ? '#f6f7fa' : '#080d19');

    // Keep native form controls and scrollbars in step with the theme.
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setTheme = useCallback((next) => {
    setPreference(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode: the theme simply will not persist */
    }
  }, []);

  const value = useMemo(
    () => ({ theme: preference, resolved, setTheme, toggle: () => setTheme(resolved === 'light' ? 'dark' : 'light') }),
    [preference, resolved, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a ThemeProvider');
  return context;
}
