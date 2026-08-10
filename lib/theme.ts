export type AppTheme = 'white' | 'dark' | 'plum';
export const THEME_KEY = 'commute-battle:theme';

export function loadTheme(): AppTheme {
  if (typeof window === 'undefined') return 'white';
  const value = localStorage.getItem(THEME_KEY);
  return value === 'dark' || value === 'plum' ? value : 'white';
}

export function applyTheme(theme: AppTheme) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
}

export function saveTheme(theme: AppTheme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent('commute-theme-change', { detail: theme }));
}
