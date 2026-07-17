(function initNocturneNativeDetection(root, factory) {
  const api = factory(root.Nocturne || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Nocturne = Object.assign(root.Nocturne || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function nativeDetectionFactory(N) {
  'use strict';

  const { parseColor, composite, relativeLuminance, contrastRatio } = N;

  function getOpaqueBackground(element) {
    let current = element instanceof Element ? element : document.body || document.documentElement;
    let accumulated = parseColor('rgba(0, 0, 0, 0)');
    let steps = 0;
    while (current && steps < 14) {
      const style = getComputedStyle(current);
      const background = parseColor(style.backgroundColor);
      if (background && background.a > 0) {
        accumulated = composite(accumulated, background);
        if (accumulated.a > 0.97) return accumulated;
      }
      current = current.parentElement;
      steps += 1;
    }
    return composite(accumulated, parseColor('#ffffff'));
  }

  function detectDarkMediaRule() {
    let visited = 0;
    const scanRules = (rules) => {
      if (!rules) return false;
      for (const rule of rules) {
        visited += 1;
        if (visited > 500) return false;
        const condition = String(rule.conditionText || rule.media && rule.media.mediaText || '').toLowerCase();
        if (condition.includes('prefers-color-scheme') && condition.includes('dark')) return true;
        if (rule.cssRules && scanRules(rule.cssRules)) return true;
      }
      return false;
    };

    for (const sheet of Array.from(document.styleSheets).slice(0, 30)) {
      try {
        if (scanRules(sheet.cssRules)) return true;
      } catch (_error) {
        // Cross-origin stylesheets intentionally remain opaque.
      }
      if (visited > 500) break;
    }
    return false;
  }

  function sampleViewport() {
    const width = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const height = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
    if (!width || !height) return { darkRatio: 0, lightRatio: 0, samples: 0 };

    const xs = [0.08, 0.27, 0.5, 0.73, 0.92];
    const ys = [0.1, 0.3, 0.55, 0.8, 0.94];
    let dark = 0;
    let light = 0;
    let samples = 0;

    for (const y of ys) {
      for (const x of xs) {
        const element = document.elementFromPoint(Math.floor(width * x), Math.floor(height * y));
        if (!element) continue;
        const background = getOpaqueBackground(element);
        const luminance = relativeLuminance(background);
        if (luminance < 0.22) dark += 1;
        if (luminance > 0.48) light += 1;
        samples += 1;
      }
    }

    return {
      darkRatio: samples ? dark / samples : 0,
      lightRatio: samples ? light / samples : 0,
      samples
    };
  }

  function detectNativeDark(level) {
    const rootElement = document.documentElement;
    const body = document.body || rootElement;
    const rootStyle = getComputedStyle(rootElement);
    const bodyStyle = getComputedStyle(body);
    const bodyBackground = getOpaqueBackground(body);
    const bodyText = parseColor(bodyStyle.color || rootStyle.color);
    const bodyLuminance = relativeLuminance(bodyBackground);
    const viewport = sampleViewport();
    const meta = document.querySelector('meta[name="color-scheme"]');
    const metaSignal = Boolean(meta && /\bdark\b/i.test(meta.content || ''));
    const propertySignal = /\bdark\b/i.test(`${rootStyle.colorScheme || ''} ${bodyStyle.colorScheme || ''}`);
    const mediaSignal = detectDarkMediaRule();
    const readableDarkBody = bodyLuminance < 0.24 && bodyText && contrastRatio(bodyText, bodyBackground) >= 3;

    let score = 0;
    if (readableDarkBody) score += 3;
    if (viewport.darkRatio >= 0.72) score += 4;
    else if (viewport.darkRatio >= 0.5) score += 2;
    else if (viewport.darkRatio >= 0.35) score += 1;
    if (viewport.lightRatio >= 0.55) score -= 4;
    else if (viewport.lightRatio >= 0.38) score -= 2;
    if (metaSignal) score += 1;
    if (propertySignal) score += 1;
    if (mediaSignal) score += 1;

    const threshold = level === 'conservative' ? 6 : level === 'aggressive' ? 3 : 4;
    return {
      detected: score >= threshold,
      score,
      threshold,
      bodyLuminance,
      viewportDarkRatio: viewport.darkRatio,
      viewportLightRatio: viewport.lightRatio,
      metaSignal,
      propertySignal,
      mediaSignal
    };
  }

  return {
    getOpaqueBackground,
    detectDarkMediaRule,
    sampleViewport,
    detectNativeDark
  };
});
