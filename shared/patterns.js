(function initNocturnePatterns(root, factory) {
  const api = factory(root.Nocturne || (typeof require === 'function' ? require('./defaults.js') : {}));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Nocturne = Object.assign(root.Nocturne || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function patternsFactory(core) {
  'use strict';

  const { deepClone, deepMerge, normalizeSettings, VALID_MODES } = core;
  const compiledPatternCache = new Map();

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizePatternInput(input) {
    let value = String(input || '').trim();
    if (!value) return '';

    if (value === '<all_urls>') return value;
    if (/^(chrome|brave|edge|about|view-source|data|javascript):/i.test(value)) return value;
    if (/^file:\/\//i.test(value)) {
      if (value === 'file://') return 'file:///*';
      return value.includes('*') ? value : `${value.replace(/\/$/, '')}/*`;
    }

    if (!value.includes('://')) value = `*://${value}`;

    const schemeEnd = value.indexOf('://') + 3;
    const rest = value.slice(schemeEnd);
    if (!rest.includes('/')) value += '/*';
    else {
      const slash = value.indexOf('/', schemeEnd);
      const path = value.slice(slash);
      if (path === '/') value += '*';
    }

    return value;
  }

  function compilePattern(input) {
    const normalized = normalizePatternInput(input);
    if (compiledPatternCache.has(normalized)) return compiledPatternCache.get(normalized);

    let result;
    if (normalized === '<all_urls>') {
      result = /^(?:https?|file):\/\//i;
    } else if (/^(chrome|brave|edge|about|view-source|data|javascript):/i.test(normalized)) {
      result = null;
    } else if (normalized.startsWith('file://')) {
      const pathPattern = normalized.slice('file://'.length);
      const pathRegex = escapeRegex(pathPattern).replace(/\\\*/g, '.*');
      result = new RegExp(`^file://${pathRegex}$`, 'i');
    } else {
      const match = /^(\*|https?|file):\/\/([^/]+)(\/.*)$/.exec(normalized);
      if (!match) {
        result = null;
      } else {
        const [, scheme, rawHost, rawPath] = match;
        const schemeRegex = scheme === '*' ? 'https?' : escapeRegex(scheme);
        let hostRegex;

        if (rawHost === '*') hostRegex = '[^/]+';
        else if (rawHost.startsWith('*.')) {
          const apex = escapeRegex(rawHost.slice(2));
          hostRegex = `(?:[^./]+\\.)*${apex}`;
        } else {
          hostRegex = escapeRegex(rawHost).replace(/\\\*/g, '[^./]*');
        }

        const pathRegex = escapeRegex(rawPath).replace(/\\\*/g, '.*');
        result = new RegExp(`^${schemeRegex}://${hostRegex}${pathRegex}$`, 'i');
      }
    }

    compiledPatternCache.set(normalized, result);
    return result;
  }

  function patternMatches(input, url) {
    try {
      const regex = compilePattern(input);
      return Boolean(regex && regex.test(String(url || '')));
    } catch (_error) {
      return false;
    }
  }

  function validatePattern(input) {
    const normalized = normalizePatternInput(input);
    if (!normalized) return { valid: false, normalized, error: 'Enter a site or URL pattern.' };
    if (/^(chrome|brave|edge|about|view-source|data|javascript):/i.test(normalized)) {
      return { valid: false, normalized, error: 'Browser-internal pages cannot be modified by extensions.' };
    }
    const compiled = compilePattern(normalized);
    if (!compiled) return { valid: false, normalized, error: 'Use a pattern such as example.com, *.example.com, or example.com/path/*.' };
    return { valid: true, normalized, error: '' };
  }

  function ruleSpecificity(rule) {
    const pattern = normalizePatternInput(rule && rule.pattern);
    const literal = pattern.replace(/[\*?]/g, '');
    const pathIndex = pattern.indexOf('/', pattern.indexOf('://') + 3);
    const path = pathIndex >= 0 ? pattern.slice(pathIndex) : '';
    const exactScheme = /^https?:\/\//.test(pattern) ? 20 : 0;
    const exactHost = !pattern.slice(pattern.indexOf('://') + 3, pathIndex).includes('*') ? 40 : 0;
    return literal.length + path.length * 2 + exactScheme + exactHost;
  }

  function matchingRules(rules, url) {
    return (Array.isArray(rules) ? rules : [])
      .map((rule, index) => ({ rule, index, specificity: ruleSpecificity(rule) }))
      .filter(({ rule }) => patternMatches(rule.pattern, url))
      .sort((a, b) => a.specificity - b.specificity || a.index - b.index)
      .map(({ rule }) => rule);
  }

  function getEffectiveSettings(rawSettings, url) {
    const settings = normalizeSettings(rawSettings);
    const matches = matchingRules(settings.rules, url);
    const effective = {
      enabled: settings.enabled,
      globalEnabled: settings.enabled,
      siteEnabled: true,
      mode: settings.defaultMode,
      appearance: deepClone(settings.appearance),
      respectNativeDark: settings.advanced.respectNativeDark,
      advanced: deepClone(settings.advanced),
      schedule: deepClone(settings.schedule),
      customCSS: settings.globalCustomCSS || '',
      matchedRuleIds: [],
      matchedPatterns: []
    };

    for (const rule of matches) {
      if (typeof rule.enabled === 'boolean') effective.siteEnabled = rule.enabled;
      if (VALID_MODES.includes(rule.mode)) effective.mode = rule.mode;
      if (typeof rule.respectNativeDark === 'boolean') effective.respectNativeDark = rule.respectNativeDark;
      if (rule.appearance && typeof rule.appearance === 'object') {
        effective.appearance = deepMerge(effective.appearance, rule.appearance);
      }
      if (rule.customCSS) {
        const safeLabel = String(rule.pattern).replace(/\*\//g, '* /');
        effective.customCSS += `\n/* ${safeLabel} */\n${rule.customCSS}`;
      }
      effective.matchedRuleIds.push(rule.id);
      effective.matchedPatterns.push(rule.pattern);
    }

    effective.enabled = effective.globalEnabled && effective.siteEnabled;
    return effective;
  }

  function sitePatternFromUrl(url, includeSubdomains) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return '';
      const host = parsed.hostname;
      if (!host) return '';
      const isIp = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':');
      return `*://${includeSubdomains && !isIp ? `*.${host.replace(/^www\./, '')}` : host}/*`;
    } catch (_error) {
      return '';
    }
  }

  function hostnameFromUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname || parsed.protocol.replace(':', '');
    } catch (_error) {
      return '';
    }
  }

  function isRestrictedUrl(url) {
    try {
      const parsed = new URL(url);
      return !['http:', 'https:', 'file:'].includes(parsed.protocol);
    } catch (_error) {
      return true;
    }
  }

  function findExactSiteRule(settings, url) {
    const pattern = sitePatternFromUrl(url, false);
    if (!pattern) return null;
    return normalizeSettings(settings).rules.find((rule) => normalizePatternInput(rule.pattern) === pattern) || null;
  }

  return {
    normalizePatternInput,
    compilePattern,
    patternMatches,
    validatePattern,
    ruleSpecificity,
    matchingRules,
    getEffectiveSettings,
    sitePatternFromUrl,
    hostnameFromUrl,
    isRestrictedUrl,
    findExactSiteRule
  };
});
