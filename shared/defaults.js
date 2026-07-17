(function initNocturneDefaults(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Nocturne = Object.assign(root.Nocturne || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function defaultsFactory() {
  'use strict';

  const SETTINGS_VERSION = 1;
  const SETTINGS_KEY = 'nocturneSettings';
  const FALLBACK_SETTINGS_KEY = 'nocturneSettingsFallback';
  const CACHE_PREFIX = 'nocturnePalette:';
  const CACHE_INDEX_KEY = 'nocturnePaletteIndex';
  const ISSUE_LOG_KEY = 'nocturneIssueLog';

  const DEFAULT_SETTINGS = Object.freeze({
    version: SETTINGS_VERSION,
    enabled: true,
    defaultMode: 'dynamic',
    appearance: {
      background: '#121419',
      text: '#e7e9ee',
      accent: '#8ab4f8',
      selection: '#365b86',
      darkness: 72,
      brightness: 100,
      contrast: 100,
      saturation: 92,
      sepia: 0,
      minContrast: 4.5,
      dimMedia: 0
    },
    schedule: {
      mode: 'always',
      start: '19:00',
      end: '07:00',
      latitude: null,
      longitude: null,
      sunsetOffset: 0,
      sunriseOffset: 0
    },
    advanced: {
      respectNativeDark: true,
      nativeDetection: 'balanced',
      protectMedia: true,
      protectBackgroundImages: true,
      processShadowDOM: true,
      styleScrollbars: true,
      reduceTransitions: true,
      cacheEnabled: true,
      cacheMaxSites: 50,
      maxElementsPerSlice: 55,
      rootMargin: 700,
      disableInForcedColors: true,
      disableOnPrint: true,
      diagnostics: true
    },
    globalCustomCSS: '',
    rules: []
  });

  const VALID_MODES = Object.freeze(['dynamic', 'static', 'filter']);
  const VALID_SCHEDULE_MODES = Object.freeze(['always', 'system', 'custom', 'sun']);

  function isPlainObject(value) {
    if (!value || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function deepClone(value) {
    if (Array.isArray(value)) return value.map(deepClone);
    if (isPlainObject(value)) {
      const output = {};
      for (const [key, item] of Object.entries(value)) output[key] = deepClone(item);
      return output;
    }
    return value;
  }

  function deepMerge(base, override) {
    const output = deepClone(base);
    if (!isPlainObject(override)) return output;

    for (const [key, value] of Object.entries(override)) {
      if (Array.isArray(value)) output[key] = deepClone(value);
      else if (isPlainObject(value) && isPlainObject(output[key])) output[key] = deepMerge(output[key], value);
      else output[key] = deepClone(value);
    }
    return output;
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function normalizeHex(value, fallback) {
    const text = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(text)) {
      return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`.toLowerCase();
    }
    return fallback;
  }

  function normalizeTime(value, fallback) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return fallback;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  function makeId(prefix) {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return `${prefix || 'id'}-${globalThis.crypto.randomUUID()}`;
    }
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix || 'id'}-${Date.now().toString(36)}-${random}`;
  }

  function normalizeRule(rule, index) {
    if (!isPlainObject(rule)) return null;
    const pattern = String(rule.pattern || '').trim();
    if (!pattern) return null;

    const normalized = {
      id: String(rule.id || makeId(`rule${index || 0}`)),
      pattern,
      enabled: typeof rule.enabled === 'boolean' ? rule.enabled : null,
      mode: VALID_MODES.includes(rule.mode) ? rule.mode : 'inherit',
      respectNativeDark: typeof rule.respectNativeDark === 'boolean' ? rule.respectNativeDark : null,
      appearance: {},
      customCSS: typeof rule.customCSS === 'string' ? rule.customCSS : '',
      createdAt: Number.isFinite(Number(rule.createdAt)) ? Number(rule.createdAt) : Date.now(),
      updatedAt: Number.isFinite(Number(rule.updatedAt)) ? Number(rule.updatedAt) : Date.now()
    };

    if (isPlainObject(rule.appearance)) {
      const source = rule.appearance;
      if (source.background != null) normalized.appearance.background = normalizeHex(source.background, DEFAULT_SETTINGS.appearance.background);
      if (source.text != null) normalized.appearance.text = normalizeHex(source.text, DEFAULT_SETTINGS.appearance.text);
      if (source.accent != null) normalized.appearance.accent = normalizeHex(source.accent, DEFAULT_SETTINGS.appearance.accent);
      if (source.selection != null) normalized.appearance.selection = normalizeHex(source.selection, DEFAULT_SETTINGS.appearance.selection);
      for (const [name, min, max] of [
        ['darkness', 0, 100],
        ['brightness', 70, 130],
        ['contrast', 70, 130],
        ['saturation', 0, 150],
        ['sepia', 0, 100],
        ['dimMedia', 0, 60]
      ]) {
        if (source[name] != null) normalized.appearance[name] = clamp(source[name], min, max, DEFAULT_SETTINGS.appearance[name]);
      }
      if (source.minContrast != null) normalized.appearance.minContrast = clamp(source.minContrast, 3, 12, DEFAULT_SETTINGS.appearance.minContrast);
    }

    return normalized;
  }

  function normalizeSettings(input) {
    const settings = deepMerge(DEFAULT_SETTINGS, isPlainObject(input) ? input : {});
    settings.version = SETTINGS_VERSION;
    settings.enabled = Boolean(settings.enabled);
    settings.defaultMode = VALID_MODES.includes(settings.defaultMode) ? settings.defaultMode : DEFAULT_SETTINGS.defaultMode;

    const a = settings.appearance;
    a.background = normalizeHex(a.background, DEFAULT_SETTINGS.appearance.background);
    a.text = normalizeHex(a.text, DEFAULT_SETTINGS.appearance.text);
    a.accent = normalizeHex(a.accent, DEFAULT_SETTINGS.appearance.accent);
    a.selection = normalizeHex(a.selection, DEFAULT_SETTINGS.appearance.selection);
    a.darkness = clamp(a.darkness, 0, 100, DEFAULT_SETTINGS.appearance.darkness);
    a.brightness = clamp(a.brightness, 70, 130, DEFAULT_SETTINGS.appearance.brightness);
    a.contrast = clamp(a.contrast, 70, 130, DEFAULT_SETTINGS.appearance.contrast);
    a.saturation = clamp(a.saturation, 0, 150, DEFAULT_SETTINGS.appearance.saturation);
    a.sepia = clamp(a.sepia, 0, 100, DEFAULT_SETTINGS.appearance.sepia);
    a.minContrast = clamp(a.minContrast, 3, 12, DEFAULT_SETTINGS.appearance.minContrast);
    a.dimMedia = clamp(a.dimMedia, 0, 60, DEFAULT_SETTINGS.appearance.dimMedia);

    const s = settings.schedule;
    s.mode = VALID_SCHEDULE_MODES.includes(s.mode) ? s.mode : DEFAULT_SETTINGS.schedule.mode;
    s.start = normalizeTime(s.start, DEFAULT_SETTINGS.schedule.start);
    s.end = normalizeTime(s.end, DEFAULT_SETTINGS.schedule.end);
    s.latitude = s.latitude === null || s.latitude === '' ? null : clamp(s.latitude, -90, 90, null);
    s.longitude = s.longitude === null || s.longitude === '' ? null : clamp(s.longitude, -180, 180, null);
    s.sunsetOffset = clamp(s.sunsetOffset, -180, 180, 0);
    s.sunriseOffset = clamp(s.sunriseOffset, -180, 180, 0);

    const x = settings.advanced;
    x.respectNativeDark = Boolean(x.respectNativeDark);
    x.nativeDetection = ['conservative', 'balanced', 'aggressive'].includes(x.nativeDetection)
      ? x.nativeDetection
      : DEFAULT_SETTINGS.advanced.nativeDetection;
    x.protectMedia = Boolean(x.protectMedia);
    x.protectBackgroundImages = Boolean(x.protectBackgroundImages);
    x.processShadowDOM = Boolean(x.processShadowDOM);
    x.styleScrollbars = Boolean(x.styleScrollbars);
    x.reduceTransitions = Boolean(x.reduceTransitions);
    x.cacheEnabled = Boolean(x.cacheEnabled);
    x.cacheMaxSites = Math.round(clamp(x.cacheMaxSites, 5, 200, DEFAULT_SETTINGS.advanced.cacheMaxSites));
    x.maxElementsPerSlice = Math.round(clamp(x.maxElementsPerSlice, 10, 250, DEFAULT_SETTINGS.advanced.maxElementsPerSlice));
    x.rootMargin = Math.round(clamp(x.rootMargin, 0, 3000, DEFAULT_SETTINGS.advanced.rootMargin));
    x.disableInForcedColors = Boolean(x.disableInForcedColors);
    x.disableOnPrint = Boolean(x.disableOnPrint);
    x.diagnostics = Boolean(x.diagnostics);

    settings.globalCustomCSS = typeof settings.globalCustomCSS === 'string' ? settings.globalCustomCSS : '';
    settings.rules = Array.isArray(settings.rules)
      ? settings.rules.map(normalizeRule).filter(Boolean).slice(0, 500)
      : [];

    return settings;
  }

  function settingsFingerprint(settings) {
    const a = normalizeSettings(settings).appearance;
    return [
      SETTINGS_VERSION,
      a.background,
      a.text,
      a.accent,
      a.darkness,
      a.brightness,
      a.contrast,
      a.saturation,
      a.sepia,
      a.minContrast
    ].join('|');
  }

  return {
    SETTINGS_VERSION,
    SETTINGS_KEY,
    FALLBACK_SETTINGS_KEY,
    CACHE_PREFIX,
    CACHE_INDEX_KEY,
    ISSUE_LOG_KEY,
    DEFAULT_SETTINGS,
    VALID_MODES,
    VALID_SCHEDULE_MODES,
    isPlainObject,
    deepClone,
    deepMerge,
    clamp,
    normalizeHex,
    normalizeTime,
    makeId,
    normalizeRule,
    normalizeSettings,
    settingsFingerprint
  };
});
