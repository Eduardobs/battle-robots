// Apply the saved palette before the first paint.
(() => {
  const key = 'battle-robots-theme';
  const root = document.documentElement;
  const browserColor = document.querySelector('meta[name="theme-color"]');

  function apply(dark) {
    root.dataset.theme = dark ? 'dark' : 'light';
    browserColor.content = dark ? '#14191b' : '#f3f3ee';
  }

  let dark = false;
  try {
    dark = localStorage.getItem(key) === 'dark';
  } catch {
    // Start in light mode when storage is unavailable.
  }
  apply(dark);

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('theme');
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.addEventListener('click', () => {
      dark = !dark;
      apply(dark);
      toggle.setAttribute('aria-pressed', String(dark));
      try {
        localStorage.setItem(key, root.dataset.theme);
      } catch {
        // The selection still applies to this session.
      }
    });
  });
})();
