(function popupMain(N) {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    statusDot: $('#statusDot'),
    statusText: $('#statusText'),
    statusDetail: $('#statusDetail'),
    globalToggle: $('#globalToggle'),
    siteToggle: $('#siteToggle'),
    hostname: $('#hostname'),
    favicon: $('#favicon'),
    faviconFallback: $('#faviconFallback'),
    restrictedMessage: $('#restrictedMessage'),
    siteControls: $('#siteControls'),
    modePicker: $('#modePicker'),
    modeHint: $('#modeHint'),
    darkness: $('#darkness'),
    darknessValue: $('#darknessValue'),
    brightness: $('#brightness'),
    brightnessValue: $('#brightnessValue'),
    sepia: $('#sepia'),
    sepiaValue: $('#sepiaValue'),
    nativeToggle: $('#nativeToggle'),
    fixSite: $('#fixSite'),
    resetSite: $('#resetSite'),
    openOptions: $('#openOptions'),
    detailsToggle: $('#detailsToggle'),
    detailsPanel: $('#detailsPanel'),
    detailsSummary: $('#detailsSummary'),
    detailStatus: $('#detailStatus'),
    detailProcessed: $('#detailProcessed'),
    detailCache: $('#detailCache'),
    detailRules: $('#detailRules'),
    toast: $('#toast')
  };

  let tab = null;
  let settings = N.normalizeSettings({});
  let pageState = null;
  let restricted = true;
  let appearancePatch = {};
  let patchTimer = null;
  let toastTimer = null;

  async function worker(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response || !response.ok) throw new Error(response && response.error || 'Extension service unavailable.');
    return response;
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  async function getPageState() {
    if (!tab || !Number.isInteger(tab.id) || restricted) return null;
    try {
      return await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATE' });
    } catch (_error) {
      return null;
    }
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 2200);
  }

  function exactRule() {
    if (!tab || !tab.url) return null;
    return N.findExactSiteRule(settings, tab.url);
  }

  function effective() {
    return tab && tab.url ? N.getEffectiveSettings(settings, tab.url) : N.getEffectiveSettings(settings, 'https://invalid.local/');
  }

  function setStatus(kind, title, detail) {
    elements.statusDot.className = `status-dot${kind ? ` ${kind}` : ''}`;
    elements.statusText.textContent = title;
    elements.statusDetail.textContent = detail;
  }

  function statusCopy(eff) {
    if (restricted) return ['', 'Page not available', 'Brave does not allow extensions to change this browser page.'];
    if (!eff.globalEnabled) return ['', 'Nocturne is off', 'Use the main switch to enable dark mode everywhere.'];
    if (!eff.siteEnabled) return ['', 'Disabled on this site', 'This domain is in your site exceptions.'];

    const status = pageState && pageState.status;
    if (status === 'active') {
      const modeName = pageState.mode === 'dynamic' ? 'Adaptive theme active' : `${pageState.mode[0].toUpperCase()}${pageState.mode.slice(1)} fallback active`;
      return ['active', modeName, pageState.mode === 'dynamic'
        ? 'Colors are remapped locally while media stays untouched.'
        : 'This site is using a compatibility rendering strategy.'];
    }
    if (status === 'native-dark') return ['active', 'Native dark theme', 'The site is already dark, so Nocturne is staying out of the way.'];
    if (status === 'scheduled-off') return ['warning', 'Waiting for schedule', 'Dark mode will activate at the next scheduled boundary.'];
    if (status === 'forced-colors') return ['warning', 'Paused for high contrast', 'Windows forced-colors mode takes priority for accessibility.'];
    if (status === 'error') return ['error', 'Page engine error', pageState.reason || 'Try a fallback mode for this site.'];
    if (!pageState) return ['warning', 'Reload this page', 'The extension was installed after the tab opened, or this page blocks content scripts.'];
    return ['', 'Ready', 'Nocturne is evaluating this page.'];
  }

  function renderFavicon() {
    const host = N.hostnameFromUrl(tab && tab.url) || 'Web page';
    elements.hostname.textContent = host;
    elements.faviconFallback.textContent = host.charAt(0).toUpperCase() || 'W';
    const candidate = tab && tab.favIconUrl || '';
    const source = /^(?:data:|chrome-extension:)/i.test(candidate) ? candidate : '';
    if (!source) {
      elements.favicon.hidden = true;
      elements.faviconFallback.hidden = false;
      return;
    }
    elements.favicon.onload = () => {
      elements.favicon.hidden = false;
      elements.faviconFallback.hidden = true;
    };
    elements.favicon.onerror = () => {
      elements.favicon.hidden = true;
      elements.faviconFallback.hidden = false;
    };
    elements.favicon.src = source;
  }

  function render() {
    const eff = effective();
    const rule = exactRule();
    const [kind, title, detail] = statusCopy(eff);
    setStatus(kind, title, detail);

    elements.globalToggle.checked = settings.enabled;
    elements.siteToggle.checked = eff.siteEnabled;
    elements.siteToggle.disabled = restricted || !settings.enabled;
    elements.restrictedMessage.hidden = !restricted;
    elements.siteControls.hidden = restricted;
    elements.fixSite.disabled = restricted || !settings.enabled;
    elements.resetSite.disabled = !rule;

    renderFavicon();

    for (const button of elements.modePicker.querySelectorAll('[data-mode]')) {
      const selected = button.dataset.mode === eff.mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-checked', String(selected));
      button.disabled = !settings.enabled || !eff.siteEnabled;
    }
    elements.modeHint.textContent = eff.mode === 'dynamic'
      ? 'Best quality and media protection'
      : eff.mode === 'static'
        ? 'CSS-only compatibility mode'
        : 'Fastest emergency fallback';

    const appearance = eff.appearance;
    elements.darkness.value = appearance.darkness;
    elements.darknessValue.value = String(Math.round(appearance.darkness));
    elements.brightness.value = appearance.brightness;
    elements.brightnessValue.value = `${Math.round(appearance.brightness)}%`;
    elements.sepia.value = appearance.sepia;
    elements.sepiaValue.value = `${Math.round(appearance.sepia)}%`;
    elements.nativeToggle.checked = eff.respectNativeDark;

    for (const input of [elements.darkness, elements.brightness, elements.sepia, elements.nativeToggle]) {
      input.disabled = !settings.enabled || !eff.siteEnabled;
    }

    const diagnostics = pageState && pageState.diagnostics;
    elements.detailStatus.textContent = pageState ? `${pageState.status}${pageState.mode ? ` · ${pageState.mode}` : ''}` : 'Unavailable';
    elements.detailProcessed.textContent = diagnostics ? diagnostics.processed.toLocaleString() : '—';
    elements.detailCache.textContent = diagnostics ? `${diagnostics.cacheHits.toLocaleString()} hits · ${diagnostics.cacheMisses.toLocaleString()} new` : '—';
    elements.detailRules.textContent = eff.matchedPatterns.length ? eff.matchedPatterns.join(', ') : 'None';
    elements.detailsSummary.textContent = diagnostics ? `${diagnostics.processed.toLocaleString()} elements` : 'Local processing only';
  }

  async function refresh(options) {
    const response = await worker({ type: 'GET_SETTINGS' });
    settings = response.settings;
    if (!options || options.pageState !== false) pageState = await getPageState();
    render();
  }

  function queueAppearancePatch(name, value) {
    appearancePatch[name] = value;
    clearTimeout(patchTimer);
    patchTimer = setTimeout(async () => {
      const patch = appearancePatch;
      appearancePatch = {};
      try {
        const response = await worker({
          type: 'PATCH_SITE_RULE',
          url: tab.url,
          patch: { appearance: patch }
        });
        settings = response.settings;
        render();
        setTimeout(async () => {
          pageState = await getPageState();
          render();
        }, 260);
      } catch (error) {
        showToast(error.message);
      }
    }, 150);
  }

  function bindEvents() {
    elements.globalToggle.addEventListener('change', async () => {
      try {
        const response = await worker({ type: 'TOGGLE_GLOBAL' });
        settings = response.settings;
        setTimeout(refresh, 180);
        render();
      } catch (error) { showToast(error.message); }
    });

    elements.siteToggle.addEventListener('change', async () => {
      try {
        const response = await worker({ type: 'TOGGLE_SITE', url: tab.url });
        settings = response.settings;
        render();
        setTimeout(refresh, 200);
      } catch (error) { showToast(error.message); }
    });

    elements.modePicker.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-mode]');
      if (!button) return;
      try {
        const response = await worker({
          type: 'PATCH_SITE_RULE',
          url: tab.url,
          patch: { enabled: true, mode: button.dataset.mode }
        });
        settings = response.settings;
        render();
        setTimeout(refresh, 220);
      } catch (error) { showToast(error.message); }
    });

    elements.darkness.addEventListener('input', () => {
      elements.darknessValue.value = elements.darkness.value;
      queueAppearancePatch('darkness', Number(elements.darkness.value));
    });
    elements.brightness.addEventListener('input', () => {
      elements.brightnessValue.value = `${elements.brightness.value}%`;
      queueAppearancePatch('brightness', Number(elements.brightness.value));
    });
    elements.sepia.addEventListener('input', () => {
      elements.sepiaValue.value = `${elements.sepia.value}%`;
      queueAppearancePatch('sepia', Number(elements.sepia.value));
    });

    elements.nativeToggle.addEventListener('change', async () => {
      try {
        const response = await worker({
          type: 'PATCH_SITE_RULE',
          url: tab.url,
          patch: { respectNativeDark: elements.nativeToggle.checked }
        });
        settings = response.settings;
        render();
        setTimeout(refresh, 220);
      } catch (error) { showToast(error.message); }
    });

    elements.fixSite.addEventListener('click', async () => {
      try {
        const response = await worker({
          type: 'CYCLE_SITE_MODE',
          url: tab.url,
          reportBroken: true
        });
        settings = response.settings;
        showToast(response.mode === 'off' ? 'Disabled Nocturne on this site.' : `Switched this site to ${response.mode} mode.`);
        render();
        setTimeout(refresh, 230);
      } catch (error) { showToast(error.message); }
    });

    elements.resetSite.addEventListener('click', async () => {
      try {
        const response = await worker({ type: 'REMOVE_SITE_RULE', url: tab.url });
        settings = response.settings;
        showToast('Site-specific settings removed.');
        render();
        setTimeout(refresh, 230);
      } catch (error) { showToast(error.message); }
    });

    elements.openOptions.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });

    elements.detailsToggle.addEventListener('click', () => {
      const open = elements.detailsToggle.getAttribute('aria-expanded') === 'true';
      elements.detailsToggle.setAttribute('aria-expanded', String(!open));
      elements.detailsPanel.hidden = open;
    });
  }

  async function init() {
    bindEvents();
    tab = await getActiveTab();
    restricted = !tab || !tab.url || N.isRestrictedUrl(tab.url) || /chrome(?:webstore|\.google\.com\/webstore)/i.test(tab.url);
    const response = await worker({ type: 'GET_SETTINGS' });
    settings = response.settings;
    pageState = await getPageState();
    render();
  }

  init().catch((error) => {
    setStatus('error', 'Unable to start', error.message || String(error));
  });
})(globalThis.Nocturne);
