(() => {
  'use strict';

  if (globalThis.__NOCTURNE_BOOTSTRAP__) return;

  const root = document.documentElement;
  if (!root) return;

  let completed = false;
  const failOpenTimer = setTimeout(() => {
    if (completed) return;
    root.setAttribute('data-nocturne-ready', '');
    root.setAttribute('data-nocturne-revealed', '');
    root.removeAttribute('data-nocturne-sampling-site');
  }, 2200);

  globalThis.__NOCTURNE_BOOTSTRAP__ = {
    setBackground(color) {
      if (typeof color === 'string' && color.trim()) {
        root.style.setProperty('--nocturne-bootstrap-bg', color.trim());
      }
    },
    hold() {
      if (completed) return;
      root.removeAttribute('data-nocturne-revealed');
    },
    makeInspectable() {
      root.setAttribute('data-nocturne-ready', '');
    },
    beginSiteSample() {
      root.setAttribute('data-nocturne-ready', '');
      root.setAttribute('data-nocturne-sampling-site', '');
    },
    endSiteSample() {
      root.removeAttribute('data-nocturne-sampling-site');
    },
    reveal() {
      completed = true;
      clearTimeout(failOpenTimer);
      root.setAttribute('data-nocturne-ready', '');
      root.setAttribute('data-nocturne-revealed', '');
      root.removeAttribute('data-nocturne-sampling-site');
    }
  };
})();
