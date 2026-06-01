(function () {
  'use strict';

  const KEY = 'kstTheme';
  const THEMES = new Set(['light', 'dark', 'auto']);

  function normalizeTheme(value) {
    return THEMES.has(value) ? value : 'auto';
  }

  function applyThemeToDocument(value) {
    const theme = normalizeTheme(value);
    const root = document.documentElement;
    if (theme === 'auto') {
      delete root.dataset.theme;
      root.style.colorScheme = '';
    } else {
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
    }
    return theme;
  }

  let storedTheme = 'auto';
  try {
    storedTheme = localStorage.getItem(KEY);
  } catch (_) {
    storedTheme = 'auto';
  }

  applyThemeToDocument(storedTheme);

  window.__KST_THEME__ = {
    KEY,
    normalizeTheme,
    applyThemeToDocument,
  };
})();
