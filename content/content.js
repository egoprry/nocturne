(function startNocturneContent(N) {
  'use strict';

  if (!N || !document.documentElement) return;
  if (globalThis.__NOCTURNE_CONTENT_STARTED__) return;
  globalThis.__NOCTURNE_CONTENT_STARTED__ = true;

  class NocturneController {
    constructor() {
      this.root = document.documentElement;
      this.settings = null;
      this.effective = null;
      this.engine = null;
      this.engineStyle = null;
      this.customStyle = null;
      this.generation = 0;
      this.reapplyTimer = null;
      this.scheduleTimer = null;
      this.cacheSaveTimer = null;
      this.lastUrl = location.href;
      this.systemScheme = matchMedia('(prefers-color-scheme: dark)');
      this.forcedColors = matchMedia('(forced-colors: active)');
      this.printSuspended = false;
      this.bootstrap = globalThis.__NOCTURNE_BOOTSTRAP__ || {
        setBackground: (color) => this.root.style.setProperty('--nocturne-bootstrap-bg', color),
        hold: () => this.root.removeAttribute('data-nocturne-revealed'),
        makeInspectable: () => this.root.setAttribute('data-nocturne-ready', ''),
        beginSiteSample: () => {
          this.root.setAttribute('data-nocturne-ready', '');
          this.root.setAttribute('data-nocturne-sampling-site', '');
        },
        endSiteSample: () => this.root.removeAttribute('data-nocturne-sampling-site'),
        reveal: () => {
          this.root.setAttribute('data-nocturne-ready', '');
          this.root.setAttribute('data-nocturne-revealed', '');
          this.root.removeAttribute('data-nocturne-sampling-site');
        }
      };
      this.state = {
        status: 'loading',
        mode: null,
        reason: '',
        nativeInfo: null,
        fallbackReason: '',
        effective: null
      };
    }

    async init() {
      this.bootstrap.hold();
      this.installListeners();
      await this.apply('startup');
    }

    installListeners() {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync' && changes[N.SETTINGS_KEY]) this.scheduleApply('settings');
        if (areaName === 'local' && changes[N.FALLBACK_SETTINGS_KEY]) this.scheduleApply('settings-fallback');
      });

      const schemeListener = () => {
        if (this.settings && (
          this.settings.schedule.mode === 'system' ||
          (this.effective && this.effective.respectNativeDark)
        )) this.scheduleApply('system-theme');
      };
      if (this.systemScheme.addEventListener) this.systemScheme.addEventListener('change', schemeListener);
      else this.systemScheme.addListener(schemeListener);

      const forcedListener = () => this.scheduleApply('forced-colors');
      if (this.forcedColors.addEventListener) this.forcedColors.addEventListener('change', forcedListener);
      else this.forcedColors.addListener(forcedListener);

      window.addEventListener('popstate', () => this.onPossibleNavigation());
      window.addEventListener('hashchange', () => this.onPossibleNavigation());
      if (globalThis.navigation && typeof globalThis.navigation.addEventListener === 'function') {
        globalThis.navigation.addEventListener('navigate', () => setTimeout(() => this.onPossibleNavigation(), 0));
      }

      window.addEventListener('beforeprint', () => {
        if (this.effective && this.effective.advanced.disableOnPrint) {
          this.printSuspended = true;
          this.cleanup(false);
          this.bootstrap.reveal();
          this.state.status = 'print';
          this.reportState();
        }
      });
      window.addEventListener('afterprint', () => {
        if (this.printSuspended) {
          this.printSuspended = false;
          this.scheduleApply('after-print');
        }
      });

      window.addEventListener('pagehide', () => this.saveCurrentCache(true));

      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!message || typeof message !== 'object') return false;
        if (message.type === 'GET_STATE') {
          if (window.top !== window) return false;
          sendResponse(this.publicState());
          return false;
        }
        if (message.type === 'REFRESH' || message.type === 'SCHEDULE_TICK') {
          this.scheduleApply(message.type.toLowerCase());
          sendResponse({ ok: true });
          return false;
        }
        if (message.type === 'GET_DIAGNOSTICS') {
          sendResponse(this.engine ? this.engine.diagnostics() : null);
          return false;
        }
        return false;
      });
    }

    onPossibleNavigation() {
      if (location.href === this.lastUrl) return;
      this.lastUrl = location.href;
      this.scheduleApply('navigation');
    }

    scheduleApply(reason) {
      clearTimeout(this.reapplyTimer);
      this.reapplyTimer = setTimeout(() => this.apply(reason), 70);
    }

    async waitUntilInspectable() {
      if (document.body && document.readyState !== 'loading') {
        await this.nextPaintBoundary();
        return;
      }
      await Promise.race([
        new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true })),
        new Promise((resolve) => setTimeout(resolve, 350))
      ]);
      await this.nextPaintBoundary();
    }

    nextPaintBoundary() {
      return Promise.race([
        new Promise((resolve) => requestAnimationFrame(resolve)),
        new Promise((resolve) => setTimeout(resolve, 48))
      ]);
    }

    installStyle(text, attribute) {
      const style = document.createElement('style');
      style.setAttribute(attribute, '');
      style.textContent = text;
      (document.head || this.root).appendChild(style);
      return style;
    }

    setBootstrapBackground(effective) {
      try {
        const palette = N.themePalette(effective.appearance);
        this.bootstrap.setBackground(palette.background);
      } catch (_error) {
        this.bootstrap.setBackground(effective.appearance.background || '#121419');
      }
    }

    setProvisionalTheme(effective) {
      this.cleanup(false);
      this.engineStyle = this.installStyle(N.buildDynamicStyles(effective), 'data-nocturne-engine-style');
      this.root.setAttribute('data-nocturne-active', 'dynamic');
      this.bootstrap.makeInspectable();
    }

    async apply(reason) {
      const generation = ++this.generation;
      clearTimeout(this.scheduleTimer);
      this.settings = await N.getSettings();
      if (generation !== this.generation) return;

      this.effective = N.getEffectiveSettings(this.settings, location.href);
      this.setBootstrapBackground(this.effective);
      const scheduled = N.isScheduleActive(this.effective.schedule, new Date(), this.systemScheme.matches);
      const blockedByForcedColors = this.effective.advanced.disableInForcedColors && this.forcedColors.matches;

      this.state = {
        status: 'loading',
        mode: null,
        reason,
        nativeInfo: null,
        fallbackReason: '',
        effective: {
          enabled: this.effective.enabled,
          globalEnabled: this.effective.globalEnabled,
          siteEnabled: this.effective.siteEnabled,
          mode: this.effective.mode,
          respectNativeDark: this.effective.respectNativeDark,
          appearance: this.effective.appearance,
          matchedPatterns: this.effective.matchedPatterns
        }
      };

      if (!this.effective.enabled || !scheduled || blockedByForcedColors || this.printSuspended) {
        this.cleanup(false);
        this.bootstrap.reveal();
        this.state.status = !this.effective.enabled
          ? 'disabled'
          : !scheduled
            ? 'scheduled-off'
            : blockedByForcedColors
              ? 'forced-colors'
              : 'print';
        this.state.reason = reason;
        this.armScheduleTimer();
        this.reportState();
        return;
      }

      this.setProvisionalTheme(this.effective);
      await this.waitUntilInspectable();
      if (generation !== this.generation) return;

      if (this.effective.respectNativeDark) {
        this.engineStyle.remove();
        this.engineStyle = null;
        this.root.removeAttribute('data-nocturne-active');

        let nativeInfo;
        this.bootstrap.beginSiteSample();
        try {
          nativeInfo = N.detectNativeDark(this.effective.advanced.nativeDetection);
        } finally {
          this.bootstrap.endSiteSample();
        }
        this.state.nativeInfo = nativeInfo;

        if (nativeInfo.detected) {
          this.cleanup(false);
          const customCSS = N.sanitizeCustomCSS(this.effective.customCSS);
          if (customCSS.trim()) {
            this.customStyle = this.installStyle(customCSS, 'data-nocturne-custom-style');
          }
          this.state.status = 'native-dark';
          this.state.mode = 'native';
          this.bootstrap.reveal();
          this.armScheduleTimer();
          this.reportState();
          return;
        }

        // Keep a dark underlying surface while a palette cache is read. The
        // startup curtain remains in place on a new document; this also avoids
        // a light frame during a later settings refresh.
        this.engineStyle = this.installStyle(N.buildDynamicStyles(this.effective), 'data-nocturne-engine-style');
        this.root.setAttribute('data-nocturne-active', 'dynamic');
      }

      const installed = await this.installMode(this.effective.mode, generation);
      if (!installed || generation !== this.generation) return;
      this.armScheduleTimer();
      this.reportState();
    }

    async installMode(requestedMode, generation) {
      let mode = requestedMode;
      let cache = null;

      if (mode === 'dynamic' && this.effective.advanced.cacheEnabled) {
        const fingerprint = N.settingsFingerprint({ appearance: this.effective.appearance });
        cache = await N.loadPaletteCache(this.cacheOrigin(), fingerprint);
        if (generation !== this.generation) return false;
      }

      this.cleanup(false);
      try {
        this.engineStyle = this.installStyle(N.buildModeStyles(mode, this.effective), 'data-nocturne-engine-style');
        const customCSS = N.sanitizeCustomCSS(this.effective.customCSS);
        if (customCSS.trim()) {
          this.customStyle = this.installStyle(customCSS, 'data-nocturne-custom-style');
        }
        this.root.setAttribute('data-nocturne-active', mode);
        this.bootstrap.makeInspectable();
        if (this.effective.advanced.reduceTransitions) {
          this.root.setAttribute('data-nocturne-starting', '');
          setTimeout(() => this.root.removeAttribute('data-nocturne-starting'), 180);
        }

        if (mode === 'dynamic') {
          this.engine = new N.DynamicEngine(this.effective, {
            cache,
            shadowStyleText: N.buildShadowDynamicStyles(this.effective)
          }).start();
          this.engine.primeViewport();
          this.scheduleCacheSave();
        }

        await this.nextPaintBoundary();
        if (generation !== this.generation) return false;
      } catch (error) {
        this.cleanup(false);
        if (mode === 'dynamic') {
          mode = 'static';
          this.state.fallbackReason = error && error.message ? error.message : 'Dynamic engine error';
          this.engineStyle = this.installStyle(N.buildStaticStyles(this.effective), 'data-nocturne-engine-style');
          this.root.setAttribute('data-nocturne-active', 'static');
          this.bootstrap.makeInspectable();
          await this.nextPaintBoundary();
          if (generation !== this.generation) return false;
        } else {
          throw error;
        }
      }

      this.state.status = 'active';
      this.state.mode = mode;
      this.bootstrap.reveal();
      return true;
    }

    cacheOrigin() {
      try {
        if (location.origin && location.origin !== 'null') return location.origin;
        return `${location.protocol}//${location.pathname.split('/').slice(0, 2).join('/')}`;
      } catch (_error) {
        return location.href;
      }
    }

    scheduleCacheSave() {
      clearTimeout(this.cacheSaveTimer);
      this.cacheSaveTimer = setTimeout(() => this.saveCurrentCache(false), 2800);
    }

    async saveCurrentCache(force) {
      if (window.top !== window || !this.engine || !this.effective || !this.effective.advanced.cacheEnabled) return;
      const snapshot = this.engine.cacheSnapshot();
      if (!snapshot.dirty && !force) return;
      const fingerprint = N.settingsFingerprint({ appearance: this.effective.appearance });
      await N.savePaletteCache(
        this.cacheOrigin(),
        fingerprint,
        snapshot.maps,
        this.effective.advanced.cacheMaxSites
      );
    }

    armScheduleTimer() {
      clearTimeout(this.scheduleTimer);
      if (!this.effective) return;
      const boundary = N.nextScheduleBoundary(this.effective.schedule, new Date());
      if (!boundary) return;
      const delay = Math.max(1000, Math.min(2147483647, boundary.getTime() - Date.now() + 1200));
      this.scheduleTimer = setTimeout(() => this.apply('schedule-boundary'), delay);
    }

    cleanup(saveCache) {
      clearTimeout(this.cacheSaveTimer);
      if (saveCache) this.saveCurrentCache(false);
      if (this.engine) {
        this.engine.stop();
        this.engine = null;
      }
      if (this.engineStyle) {
        this.engineStyle.remove();
        this.engineStyle = null;
      }
      if (this.customStyle) {
        this.customStyle.remove();
        this.customStyle = null;
      }
      this.root.removeAttribute('data-nocturne-active');
      this.root.removeAttribute('data-nocturne-starting');
      this.root.removeAttribute('data-nocturne-sampling-site');
    }

    publicState() {
      return {
        ...this.state,
        url: location.href,
        hostname: location.hostname,
        topFrame: window.top === window,
        diagnostics: this.engine && this.effective && this.effective.advanced.diagnostics
          ? this.engine.diagnostics()
          : null
      };
    }

    reportState() {
      if (window.top !== window) return;
      chrome.runtime.sendMessage({
        type: 'CONTENT_STATE',
        state: this.publicState()
      }).catch(() => {});
    }
  }

  const controller = new NocturneController();
  controller.init().catch((error) => {
    controller.cleanup(false);
    controller.bootstrap.reveal();
    document.documentElement.removeAttribute('data-nocturne-active');
    chrome.runtime.sendMessage({
      type: 'CONTENT_STATE',
      state: {
        status: 'error',
        mode: null,
        reason: error && error.message ? error.message : String(error)
      }
    }).catch(() => {});
  });
})(globalThis.Nocturne);
