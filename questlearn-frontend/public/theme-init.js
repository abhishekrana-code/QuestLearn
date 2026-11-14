/*
 * Paint the right theme before React mounts. Light is the product default; an
 * explicit choice or the OS preference wins from there.
 *
 * This lives in its own file rather than inline in index.html so the production
 * Content-Security-Policy can be `script-src 'self'` without `'unsafe-inline'`,
 * which is the difference between a policy that blocks injected scripts and one
 * that only narrows them. It must stay a classic blocking script in <head>, or a
 * light page flashes dark before React takes over.
 */
(function () {
  try {
    var stored = localStorage.getItem('questlearn.theme');
    var prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    var theme;
    if (stored === 'light' || stored === 'dark') {
      theme = stored;
    } else if (stored === 'system') {
      theme = prefersLight ? 'light' : 'dark';
    } else {
      theme = 'light';
    }
    var root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.style.colorScheme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#FAF6F0' : '#141212');
  } catch (error) {
    /* storage blocked: keep the light default */
  }
})();
