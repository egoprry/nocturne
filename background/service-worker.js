/* global importScripts, chrome, Nocturne */
importScripts(
  '../shared/defaults.js',
  '../shared/patterns.js',
  '../shared/schedule.js',
  '../shared/storage.js'
);

'use strict';

const N = globalThis.Nocturne;
const SCHEDULE_ALARM = 'nocturne-schedule-check';
let settingsWrite = Promise.resolve();
let alarmRefreshTimer = null;

async function configureScheduleAlarm(input) {
  const settings = input || await N.getSettings();
  await chrome.alarms.clear(SCHEDULE_ALARM).catch(() => false);
  if (!settings.enabled) return null;
  const boundary = N.nextScheduleBoundary(settings.schedule, new Date());
  if (!boundary) return null;
  const when = Math.max(Date.now() + 1000, boundary.getTime() + 1200);
  await chrome.alarms.create(SCHEDULE_ALARM, { when });
  return when;
}

async function ensureInitialized() {
  const settings = await N.getSettings();
  await configureScheduleAlarm(settings);
}

function serialSettingsUpdate(mutator) {
  settingsWrite = settingsWrite
    .catch(() => {})
    .then(async () => {
      const updated = await N.updateSettings(mutator);
      await configureScheduleAlarm(updated);
      return updated;
    });
  return settingsWrite;
}

async function saveSettings(input) {
  const saved = await N.saveSettings(input);
  await configureScheduleAlarm(saved);
  return saved;
}

async function broadcast(message) {
  const tabs = await chrome.tabs.query({}).catch(() => []);
  await Promise.allSettled(
    tabs.filter((tab) => Number.isInteger(tab.id)).map((tab) => chrome.tabs.sendMessage(tab.id, message))
  );
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
  return tabs[0] || null;
}

function exactRuleIndex(settings, url) {
  const pattern = N.sitePatternFromUrl(url, false);
  if (!pattern) return { index: -1, pattern: '' };
  const index = settings.rules.findIndex((rule) => N.normalizePatternInput(rule.pattern) === pattern);
  return { index, pattern };
}

function createSiteRule(pattern) {
  return {
    id: N.makeId('site'),
    pattern,
    enabled: null,
    mode: 'inherit',
    respectNativeDark: null,
    appearance: {},
    customCSS: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

async function patchSiteRule(url, patch) {
  return serialSettingsUpdate((settings) => {
    const { index, pattern } = exactRuleIndex(settings, url);
    if (!pattern) return settings;
    const rule = index >= 0 ? settings.rules[index] : createSiteRule(pattern);

    if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) rule.enabled = patch.enabled;
    if (Object.prototype.hasOwnProperty.call(patch, 'mode')) rule.mode = patch.mode;
    if (Object.prototype.hasOwnProperty.call(patch, 'respectNativeDark')) rule.respectNativeDark = patch.respectNativeDark;
    if (patch.appearance && typeof patch.appearance === 'object') {
      rule.appearance = N.deepMerge(rule.appearance || {}, patch.appearance);
    }
    if (Array.isArray(patch.clearAppearance)) {
      for (const key of patch.clearAppearance) delete rule.appearance[key];
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'customCSS')) rule.customCSS = String(patch.customCSS || '');
    rule.updatedAt = Date.now();

    if (index >= 0) settings.rules[index] = rule;
    else settings.rules.push(rule);
    return settings;
  });
}

async function removeSiteRule(url) {
  return serialSettingsUpdate((settings) => {
    const { pattern } = exactRuleIndex(settings, url);
    settings.rules = settings.rules.filter((rule) => N.normalizePatternInput(rule.pattern) !== pattern);
    return settings;
  });
}

async function toggleSite(url) {
  const settings = await N.getSettings();
  const effective = N.getEffectiveSettings(settings, url);
  return patchSiteRule(url, { enabled: !effective.siteEnabled });
}

async function cycleSiteMode(url, reportBroken) {
  const settings = await N.getSettings();
  const effective = N.getEffectiveSettings(settings, url);
  const order = ['dynamic', 'static', 'filter'];
  let nextMode;
  let nextEnabled = true;

  if (!effective.siteEnabled) nextMode = 'dynamic';
  else {
    const index = order.indexOf(effective.mode);
    if (index < order.length - 1) nextMode = order[index + 1];
    else {
      nextMode = effective.mode;
      nextEnabled = false;
    }
  }

  const updated = await patchSiteRule(url, { enabled: nextEnabled, mode: nextMode });
  if (reportBroken) {
    let origin = '';
    try { origin = new URL(url).origin; } catch (_error) { origin = ''; }
    await N.appendIssueLog({
      origin,
      previousMode: effective.siteEnabled ? effective.mode : 'off',
      nextMode: nextEnabled ? nextMode : 'off'
    });
  }
  return { settings: updated, mode: nextEnabled ? nextMode : 'off' };
}

async function updateAction(tabId, state) {
  if (!Number.isInteger(tabId)) return;
  const status = state && state.status || 'unknown';
  const mode = state && state.mode || '';
  let badge = '';
  let title = 'Nocturne — Adaptive Dark Mode';
  let badgeColor = '#536071';

  if (status === 'active' && mode === 'static') {
    badge = 'S';
    title += '\nStatic mode active';
    badgeColor = '#775da6';
  } else if (status === 'active' && mode === 'filter') {
    badge = 'F';
    title += '\nFilter fallback active';
    badgeColor = '#9a6b2f';
  } else if (status === 'active') {
    title += '\nDynamic mode active';
  } else if (status === 'native-dark') {
    badge = 'N';
    title += '\nNative site dark mode detected';
    badgeColor = '#34705d';
  } else if (status === 'scheduled-off') {
    badge = 'AUTO';
    title += '\nWaiting for schedule';
  } else if (status === 'forced-colors') {
    badge = 'HC';
    title += '\nPaused for system high-contrast mode';
  } else if (status === 'disabled') {
    badge = 'OFF';
    title += '\nDisabled on this site';
  } else if (status === 'error') {
    badge = '!';
    title += '\nPage engine error';
    badgeColor = '#a74242';
  }

  await Promise.allSettled([
    chrome.action.setBadgeText({ tabId, text: badge }),
    chrome.action.setBadgeBackgroundColor({ tabId, color: badgeColor }),
    chrome.action.setTitle({ tabId, title })
  ]);
}

async function requestTabState(tabId) {
  if (!Number.isInteger(tabId)) return;
  try {
    const state = await chrome.tabs.sendMessage(tabId, { type: 'GET_STATE' });
    await updateAction(tabId, state);
  } catch (_error) {
    await updateAction(tabId, { status: 'unknown' });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureInitialized().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  ensureInitialized().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SCHEDULE_ALARM) return;
  Promise.allSettled([
    broadcast({ type: 'SCHEDULE_TICK' }),
    configureScheduleAlarm()
  ]).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  const settingsChanged =
    (areaName === 'sync' && changes[N.SETTINGS_KEY]) ||
    (areaName === 'local' && changes[N.FALLBACK_SETTINGS_KEY]);
  if (!settingsChanged) return;
  clearTimeout(alarmRefreshTimer);
  alarmRefreshTimer = setTimeout(() => configureScheduleAlarm().catch(() => {}), 120);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-global') {
    await serialSettingsUpdate((settings) => {
      settings.enabled = !settings.enabled;
      return settings;
    });
  } else if (command === 'toggle-site') {
    const tab = await activeTab();
    if (tab && tab.url) await toggleSite(tab.url);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => requestTabState(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') requestTabState(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  if (message.type === 'CONTENT_STATE') {
    if (sender.tab && Number.isInteger(sender.tab.id)) updateAction(sender.tab.id, message.state).catch(() => {});
    return false;
  }

  const asyncResponse = (async () => {
    switch (message.type) {
      case 'GET_SETTINGS':
        return { ok: true, settings: await N.getSettings() };
      case 'SAVE_SETTINGS':
        return { ok: true, settings: await saveSettings(message.settings) };
      case 'TOGGLE_GLOBAL':
        return {
          ok: true,
          settings: await serialSettingsUpdate((settings) => {
            settings.enabled = !settings.enabled;
            return settings;
          })
        };
      case 'PATCH_SITE_RULE':
        return { ok: true, settings: await patchSiteRule(message.url, message.patch || {}) };
      case 'REMOVE_SITE_RULE':
        return { ok: true, settings: await removeSiteRule(message.url) };
      case 'TOGGLE_SITE':
        return { ok: true, settings: await toggleSite(message.url) };
      case 'CYCLE_SITE_MODE':
        return { ok: true, ...(await cycleSiteMode(message.url, Boolean(message.reportBroken))) };
      case 'OPEN_OPTIONS':
        await chrome.runtime.openOptionsPage();
        return { ok: true };
      case 'CLEAR_CACHE':
        return { ok: true, removed: await N.clearPaletteCache() };
      default:
        return { ok: false, error: 'Unknown request.' };
    }
  })();

  asyncResponse.then(sendResponse).catch((error) => sendResponse({
    ok: false,
    error: error && error.message ? error.message : String(error)
  }));
  return true;
});

ensureInitialized().catch(() => {});
