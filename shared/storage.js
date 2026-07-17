(function initNocturneStorage(root, factory) {
  const api = factory(root.Nocturne || (typeof require === 'function' ? require('./defaults.js') : {}));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Nocturne = Object.assign(root.Nocturne || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function storageFactory(core) {
  'use strict';

  const {
    SETTINGS_VERSION,
    SETTINGS_KEY,
    FALLBACK_SETTINGS_KEY,
    CACHE_PREFIX,
    CACHE_INDEX_KEY,
    ISSUE_LOG_KEY,
    normalizeSettings,
    deepClone
  } = core;

  function hasChromeStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  async function storageGet(area, keys) {
    if (!hasChromeStorage()) return {};
    try {
      return await chrome.storage[area].get(keys);
    } catch (_error) {
      return {};
    }
  }

  async function storageSet(area, values) {
    if (!hasChromeStorage()) return false;
    try {
      await chrome.storage[area].set(values);
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function storageRemove(area, keys) {
    if (!hasChromeStorage()) return false;
    try {
      await chrome.storage[area].remove(keys);
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function getSettings() {
    if (!hasChromeStorage()) return normalizeSettings({});
    const [syncResult, localResult] = await Promise.all([
      chrome.storage.sync ? storageGet('sync', SETTINGS_KEY) : Promise.resolve({}),
      storageGet('local', FALLBACK_SETTINGS_KEY)
    ]);
    const syncValue = syncResult[SETTINGS_KEY];
    const localValue = localResult[FALLBACK_SETTINGS_KEY];
    let raw = syncValue || localValue || {};
    if (syncValue && localValue) {
      const syncTime = Number(syncValue.updatedAt || 0);
      const localTime = Number(localValue.updatedAt || 0);
      if (localTime > syncTime) raw = localValue;
    }
    return normalizeSettings(raw);
  }

  async function saveSettings(input) {
    const settings = normalizeSettings(input);
    settings.updatedAt = Date.now();
    if (!hasChromeStorage()) return settings;

    const localPromise = storageSet('local', { [FALLBACK_SETTINGS_KEY]: settings });
    const syncPromise = chrome.storage.sync
      ? storageSet('sync', { [SETTINGS_KEY]: settings })
      : Promise.resolve(false);
    await Promise.all([localPromise, syncPromise]);
    return settings;
  }

  async function updateSettings(mutator) {
    const current = await getSettings();
    const draft = deepClone(current);
    const result = typeof mutator === 'function' ? await mutator(draft) : draft;
    return saveSettings(result || draft);
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function paletteCacheKey(origin) {
    return `${CACHE_PREFIX}${hashString(origin)}`;
  }

  async function loadPaletteCache(origin, fingerprint) {
    if (!hasChromeStorage() || !origin) return null;
    const key = paletteCacheKey(origin);
    const result = await storageGet('local', key);
    const cache = result[key];
    if (!cache || cache.origin !== origin || cache.version !== SETTINGS_VERSION || cache.fingerprint !== fingerprint) return null;
    return cache;
  }

  async function savePaletteCache(origin, fingerprint, maps, maxSites) {
    if (!hasChromeStorage() || !origin || !maps) return;
    const key = paletteCacheKey(origin);
    const payload = {
      version: SETTINGS_VERSION,
      origin,
      fingerprint,
      updatedAt: Date.now(),
      maps
    };
    await storageSet('local', { [key]: payload });

    const indexResult = await storageGet('local', CACHE_INDEX_KEY);
    const current = Array.isArray(indexResult[CACHE_INDEX_KEY]) ? indexResult[CACHE_INDEX_KEY] : [];
    const next = current.filter((item) => item && item.key !== key);
    next.unshift({ key, origin, updatedAt: payload.updatedAt });

    const limit = Math.max(5, Math.min(200, Number(maxSites) || 50));
    const expired = next.slice(limit).map((item) => item.key);
    await storageSet('local', { [CACHE_INDEX_KEY]: next.slice(0, limit) });
    if (expired.length) await storageRemove('local', expired);
  }

  async function clearPaletteCache() {
    if (!hasChromeStorage()) return 0;
    const all = await storageGet('local', null);
    const keys = Object.keys(all).filter((key) => key.startsWith(CACHE_PREFIX));
    if (keys.length) await storageRemove('local', keys);
    await storageRemove('local', CACHE_INDEX_KEY);
    return keys.length;
  }

  async function getCacheStats() {
    if (!hasChromeStorage()) return { sites: 0, bytes: 0 };
    const result = await storageGet('local', CACHE_INDEX_KEY);
    const index = Array.isArray(result[CACHE_INDEX_KEY]) ? result[CACHE_INDEX_KEY] : [];
    let bytes = 0;
    try {
      bytes = await chrome.storage.local.getBytesInUse(index.map((item) => item.key));
    } catch (_error) {
      bytes = 0;
    }
    return { sites: index.length, bytes };
  }

  async function appendIssueLog(entry) {
    if (!hasChromeStorage()) return;
    const result = await storageGet('local', ISSUE_LOG_KEY);
    const log = Array.isArray(result[ISSUE_LOG_KEY]) ? result[ISSUE_LOG_KEY] : [];
    log.unshift({
      timestamp: Date.now(),
      ...entry
    });
    await storageSet('local', { [ISSUE_LOG_KEY]: log.slice(0, 100) });
  }

  async function getIssueLog() {
    const result = await storageGet('local', ISSUE_LOG_KEY);
    return Array.isArray(result[ISSUE_LOG_KEY]) ? result[ISSUE_LOG_KEY] : [];
  }

  async function clearIssueLog() {
    await storageRemove('local', ISSUE_LOG_KEY);
  }

  async function exportSettingsBundle(options) {
    const settings = await getSettings();
    const bundle = {
      format: 'nocturne-settings',
      version: SETTINGS_VERSION,
      exportedAt: new Date().toISOString(),
      settings
    };
    if (options && options.includeDiagnostics) bundle.issueLog = await getIssueLog();
    return bundle;
  }

  async function importSettingsBundle(bundle) {
    if (!bundle || typeof bundle !== 'object') throw new Error('The selected file does not contain a settings object.');
    const candidate = bundle.format === 'nocturne-settings' ? bundle.settings : bundle.settings || bundle;
    if (!candidate || typeof candidate !== 'object') throw new Error('No compatible Nocturne settings were found.');
    return saveSettings(candidate);
  }

  return {
    storageGet,
    storageSet,
    storageRemove,
    getSettings,
    saveSettings,
    updateSettings,
    hashString,
    paletteCacheKey,
    loadPaletteCache,
    savePaletteCache,
    clearPaletteCache,
    getCacheStats,
    appendIssueLog,
    getIssueLog,
    clearIssueLog,
    exportSettingsBundle,
    importSettingsBundle
  };
});
