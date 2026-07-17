(function initNocturneColor(root, factory) {
  const api = factory(root.Nocturne || (typeof require === 'function' ? require('./defaults.js') : {}));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Nocturne = Object.assign(root.Nocturne || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function colorFactory(core) {
  'use strict';

  const { clamp, normalizeHex } = core;

  function color(r, g, b, a) {
    return {
      r: clamp(r, 0, 255, 0),
      g: clamp(g, 0, 255, 0),
      b: clamp(b, 0, 255, 0),
      a: clamp(a == null ? 1 : a, 0, 1, 1)
    };
  }

  function parseHex(input) {
    const value = input.slice(1);
    if (![3, 4, 6, 8].includes(value.length) || !/^[0-9a-f]+$/i.test(value)) return null;
    const expanded = value.length <= 4 ? value.split('').map((char) => char + char).join('') : value;
    return color(
      parseInt(expanded.slice(0, 2), 16),
      parseInt(expanded.slice(2, 4), 16),
      parseInt(expanded.slice(4, 6), 16),
      expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1
    );
  }

  function parseRgbComponent(value) {
    const text = String(value).trim();
    if (text.endsWith('%')) return clamp(parseFloat(text) * 2.55, 0, 255, 0);
    return clamp(parseFloat(text), 0, 255, 0);
  }

  function parseAlpha(value) {
    const text = String(value == null ? '1' : value).trim();
    if (text.endsWith('%')) return clamp(parseFloat(text) / 100, 0, 1, 1);
    return clamp(parseFloat(text), 0, 1, 1);
  }

  function hslToRgb(h, s, l, a) {
    const hue = ((h % 360) + 360) % 360 / 360;
    const saturation = clamp(s, 0, 1, 0);
    const lightness = clamp(l, 0, 1, 0);
    if (saturation === 0) return color(lightness * 255, lightness * 255, lightness * 255, a);

    const hue2rgb = (p, q, tInput) => {
      let t = tInput;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;
    return color(
      hue2rgb(p, q, hue + 1 / 3) * 255,
      hue2rgb(p, q, hue) * 255,
      hue2rgb(p, q, hue - 1 / 3) * 255,
      a
    );
  }

  function parseColor(input) {
    if (input && typeof input === 'object' && ['r', 'g', 'b'].every((key) => key in input)) {
      return color(input.r, input.g, input.b, input.a);
    }

    const value = String(input || '').trim().toLowerCase();
    if (!value) return null;
    if (value === 'transparent') return color(0, 0, 0, 0);
    if (value.startsWith('#')) return parseHex(value);

    const rgbMatch = /^rgba?\((.*)\)$/.exec(value);
    if (rgbMatch) {
      const body = rgbMatch[1].trim();
      let components;
      let alpha = 1;
      if (body.includes(',')) {
        components = body.split(',').map((part) => part.trim());
        if (components.length === 4) alpha = parseAlpha(components.pop());
      } else {
        const slashParts = body.split('/');
        components = slashParts[0].trim().split(/\s+/);
        if (slashParts.length > 1) alpha = parseAlpha(slashParts[1]);
      }
      if (components.length !== 3) return null;
      return color(
        parseRgbComponent(components[0]),
        parseRgbComponent(components[1]),
        parseRgbComponent(components[2]),
        alpha
      );
    }

    const hslMatch = /^hsla?\((.*)\)$/.exec(value);
    if (hslMatch) {
      const body = hslMatch[1].trim();
      let components;
      let alpha = 1;
      if (body.includes(',')) {
        components = body.split(',').map((part) => part.trim());
        if (components.length === 4) alpha = parseAlpha(components.pop());
      } else {
        const slashParts = body.split('/');
        components = slashParts[0].trim().split(/\s+/);
        if (slashParts.length > 1) alpha = parseAlpha(slashParts[1]);
      }
      if (components.length !== 3) return null;
      const h = parseFloat(components[0]);
      const s = parseFloat(components[1]) / 100;
      const l = parseFloat(components[2]) / 100;
      if (![h, s, l].every(Number.isFinite)) return null;
      return hslToRgb(h, s, l, alpha);
    }

    return null;
  }

  function channelToLinear(channel) {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  }

  function channelFromLinear(channel) {
    const value = clamp(channel, 0, 1, 0);
    return 255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055);
  }

  function relativeLuminance(input) {
    const value = parseColor(input);
    if (!value) return 0;
    const r = channelToLinear(value.r);
    const g = channelToLinear(value.g);
    const b = channelToLinear(value.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrastRatio(first, second) {
    const a = relativeLuminance(first);
    const b = relativeLuminance(second);
    const lighter = Math.max(a, b);
    const darker = Math.min(a, b);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function composite(foregroundInput, backgroundInput) {
    const fg = parseColor(foregroundInput);
    const bg = parseColor(backgroundInput);
    if (!fg || !bg) return fg || bg;
    const outAlpha = fg.a + bg.a * (1 - fg.a);
    if (outAlpha <= 0) return color(0, 0, 0, 0);
    return color(
      (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / outAlpha,
      (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / outAlpha,
      (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / outAlpha,
      outAlpha
    );
  }

  function rgbToOklab(input) {
    const value = parseColor(input) || color(0, 0, 0, 1);
    const r = channelToLinear(value.r);
    const g = channelToLinear(value.g);
    const b = channelToLinear(value.b);

    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

    const lRoot = Math.cbrt(l);
    const mRoot = Math.cbrt(m);
    const sRoot = Math.cbrt(s);

    return {
      L: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
      a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
      b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
      alpha: value.a
    };
  }

  function oklabToRgb(input) {
    const L = Number(input.L || 0);
    const a = Number(input.a || 0);
    const b = Number(input.b || 0);

    const lRoot = L + 0.3963377774 * a + 0.2158037573 * b;
    const mRoot = L - 0.1055613458 * a - 0.0638541728 * b;
    const sRoot = L - 0.0894841775 * a - 1.291485548 * b;

    const l = lRoot * lRoot * lRoot;
    const m = mRoot * mRoot * mRoot;
    const s = sRoot * sRoot * sRoot;

    const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

    return color(
      channelFromLinear(r),
      channelFromLinear(g),
      channelFromLinear(blue),
      input.alpha == null ? 1 : input.alpha
    );
  }

  function oklabToOklch(lab) {
    const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
    let hue = Math.atan2(lab.b, lab.a) * 180 / Math.PI;
    if (hue < 0) hue += 360;
    return { L: lab.L, C: chroma, h: hue, alpha: lab.alpha };
  }

  function oklchToOklab(lch) {
    const hue = Number.isFinite(lch.h) ? lch.h * Math.PI / 180 : 0;
    return {
      L: lch.L,
      a: lch.C * Math.cos(hue),
      b: lch.C * Math.sin(hue),
      alpha: lch.alpha == null ? 1 : lch.alpha
    };
  }

  function rgbToOklch(input) {
    return oklabToOklch(rgbToOklab(input));
  }

  function oklchToRgb(input) {
    return oklabToRgb(oklchToOklab(input));
  }

  function mixRgb(firstInput, secondInput, amount) {
    const first = parseColor(firstInput) || color(0, 0, 0, 1);
    const second = parseColor(secondInput) || color(0, 0, 0, 1);
    const t = clamp(amount, 0, 1, 0);
    const r = channelFromLinear(channelToLinear(first.r) * (1 - t) + channelToLinear(second.r) * t);
    const g = channelFromLinear(channelToLinear(first.g) * (1 - t) + channelToLinear(second.g) * t);
    const b = channelFromLinear(channelToLinear(first.b) * (1 - t) + channelToLinear(second.b) * t);
    return color(r, g, b, first.a * (1 - t) + second.a * t);
  }

  function toCssColor(input) {
    const value = parseColor(input);
    if (!value) return '';
    const r = Math.round(value.r);
    const g = Math.round(value.g);
    const b = Math.round(value.b);
    if (value.a >= 0.999) return `rgb(${r}, ${g}, ${b})`;
    return `rgba(${r}, ${g}, ${b}, ${Math.round(value.a * 1000) / 1000})`;
  }

  function toHex(input) {
    const value = parseColor(input);
    if (!value) return '#000000';
    const hex = [value.r, value.g, value.b]
      .map((part) => Math.round(part).toString(16).padStart(2, '0'))
      .join('');
    return `#${hex}`;
  }

  function applyTone(lch, appearance, strength) {
    const sepia = clamp(appearance.sepia, 0, 100, 0) / 100;
    if (sepia <= 0) return lch;
    const amount = sepia * (strength == null ? 0.45 : strength);
    const targetHue = 75;
    const hueDelta = ((((targetHue - lch.h) % 360) + 540) % 360) - 180;
    return {
      ...lch,
      h: (lch.h + hueDelta * amount + 360) % 360,
      C: Math.max(lch.C * (1 - amount * 0.25), 0.025 * amount)
    };
  }

  function effectiveBackgroundBase(appearance) {
    const base = parseColor(normalizeHex(appearance.background, '#121419'));
    const darkness = clamp(appearance.darkness, 0, 100, 72);
    if (darkness >= 50) return mixRgb(base, color(0, 0, 0, 1), ((darkness - 50) / 50) * 0.58);
    return mixRgb(base, color(50, 54, 62, 1), ((50 - darkness) / 50) * 0.8);
  }

  function mapBackground(sourceInput, appearance) {
    const source = parseColor(sourceInput);
    if (!source || source.a < 0.015) return null;
    const sourceLch = rgbToOklch(source);
    const base = effectiveBackgroundBase(appearance);
    const baseLch = rgbToOklch(base);
    const saturation = clamp(appearance.saturation, 0, 150, 92) / 100;
    const contrast = clamp(appearance.contrast, 70, 130, 100) / 100;

    if (sourceLch.L < 0.38) {
      const preserved = applyTone({
        L: clamp(sourceLch.L * (0.88 + (1 - contrast) * 0.25), 0.025, 0.34),
        C: Math.min(sourceLch.C * saturation * 0.72, 0.12),
        h: sourceLch.h,
        alpha: source.a
      }, appearance, 0.28);
      return oklchToRgb(preserved);
    }

    const hierarchy = Math.pow(1 - clamp(sourceLch.L, 0.38, 1), 0.82);
    const targetL = clamp(baseLch.L + hierarchy * 0.13 * contrast, 0.035, 0.42);
    const sourceChroma = Math.min(sourceLch.C * saturation * 0.32, 0.065);
    const chroma = Math.max(sourceChroma, baseLch.C * 0.6);
    const hue = sourceLch.C < 0.025 ? baseLch.h : sourceLch.h;
    const mapped = applyTone({ L: targetL, C: chroma, h: hue, alpha: source.a }, appearance, 0.38);
    return oklchToRgb(mapped);
  }

  function ensureContrast(foregroundInput, backgroundInput, minimum) {
    const foreground = parseColor(foregroundInput);
    const background = parseColor(backgroundInput);
    if (!foreground || !background) return foreground;
    const target = clamp(minimum, 1, 21, 4.5);
    if (contrastRatio(foreground, background) >= target) return foreground;

    const bgLum = relativeLuminance(background);
    const lch = rgbToOklch(foreground);
    const direction = bgLum < 0.4 ? 1 : -1;
    let best = foreground;
    for (let step = 1; step <= 40; step += 1) {
      const candidate = oklchToRgb({
        ...lch,
        L: clamp(lch.L + direction * step * 0.018, 0.01, 0.99)
      });
      best = candidate;
      if (contrastRatio(candidate, background) >= target) return candidate;
    }
    return best;
  }

  function mapText(sourceInput, backgroundInput, appearance) {
    const source = parseColor(sourceInput);
    const background = parseColor(backgroundInput) || effectiveBackgroundBase(appearance);
    if (!source || source.a < 0.02) return null;

    const sourceLch = rgbToOklch(source);
    const baseText = parseColor(normalizeHex(appearance.text, '#e7e9ee'));
    const baseLch = rgbToOklch(baseText);
    const brightness = (clamp(appearance.brightness, 70, 130, 100) - 100) / 100;
    const saturation = clamp(appearance.saturation, 0, 150, 92) / 100;
    const isChromatic = sourceLch.C > 0.045;

    let target;
    if (sourceLch.L > 0.72 && contrastRatio(source, background) >= clamp(appearance.minContrast, 3, 12, 4.5)) {
      target = {
        L: clamp(sourceLch.L + brightness * 0.09, 0.56, 0.98),
        C: Math.min(sourceLch.C * saturation, 0.22),
        h: sourceLch.h,
        alpha: source.a
      };
    } else if (isChromatic) {
      target = {
        L: clamp(0.72 + (0.5 - Math.min(sourceLch.L, 0.7)) * 0.16 + brightness * 0.1, 0.62, 0.92),
        C: Math.min(Math.max(sourceLch.C * saturation, 0.07), 0.23),
        h: sourceLch.h,
        alpha: source.a
      };
    } else {
      target = {
        L: clamp(baseLch.L - Math.min(sourceLch.L, 0.68) * 0.21 + brightness * 0.1, 0.58, 0.98),
        C: Math.min(baseLch.C * saturation, 0.05),
        h: baseLch.h,
        alpha: source.a
      };
    }

    const toned = applyTone(target, appearance, isChromatic ? 0.2 : 0.55);
    return ensureContrast(oklchToRgb(toned), background, appearance.minContrast);
  }

  function mapBorder(sourceInput, backgroundInput, appearance) {
    const source = parseColor(sourceInput);
    const background = parseColor(backgroundInput) || effectiveBackgroundBase(appearance);
    if (!source || source.a < 0.02) return null;
    const sourceLch = rgbToOklch(source);
    const bgLch = rgbToOklch(background);
    const contrast = clamp(appearance.contrast, 70, 130, 100) / 100;
    const hierarchy = sourceLch.L > 0.5 ? 0.095 : 0.145;
    const mapped = applyTone({
      L: clamp(bgLch.L + hierarchy * contrast, 0.16, 0.52),
      C: Math.min(sourceLch.C * 0.3, 0.055),
      h: sourceLch.h,
      alpha: source.a
    }, appearance, 0.25);
    return oklchToRgb(mapped);
  }

  function mapAccent(sourceInput, backgroundInput, appearance) {
    const source = parseColor(sourceInput) || parseColor(appearance.accent);
    const background = parseColor(backgroundInput) || effectiveBackgroundBase(appearance);
    const sourceLch = rgbToOklch(source);
    const mapped = applyTone({
      L: clamp(Math.max(sourceLch.L, 0.68) + (appearance.brightness - 100) * 0.002, 0.62, 0.9),
      C: Math.min(Math.max(sourceLch.C * appearance.saturation / 100, 0.08), 0.24),
      h: sourceLch.h,
      alpha: source.a
    }, appearance, 0.15);
    return ensureContrast(oklchToRgb(mapped), background, Math.min(appearance.minContrast, 4.5));
  }

  function transformColorTokens(value, transform) {
    if (!value || value === 'none') return value;
    return String(value).replace(/rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}\b/gi, (token) => {
      const parsed = parseColor(token);
      if (!parsed) return token;
      const mapped = transform(parsed);
      return mapped ? toCssColor(mapped) : token;
    });
  }

  function isDark(input, threshold) {
    return relativeLuminance(input) < (threshold == null ? 0.22 : threshold);
  }

  function colorKey(input) {
    const value = parseColor(input);
    if (!value) return '';
    return `${Math.round(value.r)},${Math.round(value.g)},${Math.round(value.b)},${Math.round(value.a * 255)}`;
  }

  return {
    color,
    parseColor,
    relativeLuminance,
    contrastRatio,
    composite,
    rgbToOklab,
    oklabToRgb,
    rgbToOklch,
    oklchToRgb,
    mixRgb,
    toCssColor,
    toHex,
    effectiveBackgroundBase,
    mapBackground,
    mapText,
    mapBorder,
    mapAccent,
    ensureContrast,
    transformColorTokens,
    isDark,
    colorKey
  };
});
