// Phase 2 US4: bootstrap + apply the chosen theme to <html data-theme="...">.
// Persists the last value in localStorage so first paint isn't wrong.

const KEY = 'masslab.theme';

export function applyTheme(theme) {
  if (theme !== 'dark' && theme !== 'light') return;
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* SSR or storage disabled */
  }
}

export function readStoredTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

export function bootstrapTheme() {
  applyTheme(readStoredTheme());
}
