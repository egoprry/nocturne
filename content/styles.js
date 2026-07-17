(function initNocturneStyles(root, factory) {
  const api = factory(root.Nocturne || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Nocturne = Object.assign(root.Nocturne || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function stylesFactory(N) {
  'use strict';

  const {
    parseColor,
    toCssColor,
    mixRgb,
    effectiveBackgroundBase,
    mapBorder,
    mapAccent
  } = N;

  function decodeCssEscapes(input) {
    return String(input || '').replace(/\\([0-9a-f]{1,6})(?:\s)?|\\(.)/gi, (_match, hex, character) => {
      if (hex) {
        const codePoint = Number.parseInt(hex, 16);
        return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : '';
      }
      return character || '';
    });
  }

  function sanitizeCustomCSS(input) {
    let css = String(input || '').replace(/\/\*[\s\S]*?\*\//g, '');
    const decoded = decodeCssEscapes(css);
    const dangerousFunction = /(?:^|[^-\w])(?:url|image|image-set|-webkit-image-set|cross-fade|src)\s*\(/i;
    const decodedImport = /@import\b/i.test(decoded);
    const plainImport = /@import\b/i.test(css);
    const decodedDanger = dangerousFunction.test(decoded);
    const plainDanger = dangerousFunction.test(css);

    if ((decodedImport && !plainImport) || (decodedDanger && !plainDanger)) {
      return '/* Nocturne blocked obfuscated network-capable CSS. */';
    }

    css = css.replace(
      /@import\s+(?:url\(\s*)?(?:"[^"]*"|'[^']*'|[^;\s)]+)\s*\)?[^;]*;/gi,
      '/* Nocturne blocked an external @import rule. */'
    );
    css = css.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (match, _quote, value) => {
      const target = String(value || '').trim();
      return /^(?:data:|blob:|#)/i.test(target) ? match : 'none';
    });

    if (/(?:^|[^-\w])(?:image|image-set|-webkit-image-set|cross-fade|src)\s*\(/i.test(css)) {
      return '/* Nocturne blocked network-capable image CSS. */';
    }
    return css;
  }

  function themePalette(appearance) {
    const background = effectiveBackgroundBase(appearance);
    const text = parseColor(appearance.text);
    const border = mapBorder('#d7d7d7', background, appearance);
    const accent = mapAccent(appearance.accent, background, appearance);
    const muted = mixRgb(text, background, 0.34);
    const raised = mixRgb(background, text, 0.065);
    const elevated = mixRgb(background, text, 0.105);
    const hover = mixRgb(background, text, 0.14);
    const active = mixRgb(background, text, 0.19);
    const input = mixRgb(background, text, 0.08);
    const disabled = mixRgb(background, text, 0.045);
    const selection = parseColor(appearance.selection) || mixRgb(background, accent, 0.45);
    return {
      background: toCssColor(background),
      text: toCssColor(text),
      border: toCssColor(border),
      accent: toCssColor(accent),
      muted: toCssColor(muted),
      raised: toCssColor(raised),
      elevated: toCssColor(elevated),
      hover: toCssColor(hover),
      active: toCssColor(active),
      input: toCssColor(input),
      disabled: toCssColor(disabled),
      selection: toCssColor(selection)
    };
  }

  function variablesCSS(appearance) {
    const palette = themePalette(appearance);
    return Object.entries(palette)
      .map(([key, value]) => `--nocturne-${key}: ${value};`)
      .join('\n');
  }

  function boostedAttribute(attribute) {
    return `:is(#__nocturne_specificity_anchor__, [${attribute}])[${attribute}]`;
  }

  function pendingControlCSS(scope) {
    const prefix = scope ? `${scope} ` : '';
    return `
      ${prefix}:where(input, textarea, select, option, optgroup)[data-nocturne-pending-control="field"] {
        background-color: var(--nocturne-input) !important;
        color: var(--nocturne-text) !important;
        border-color: var(--nocturne-border) !important;
        caret-color: var(--nocturne-accent) !important;
      }
      ${prefix}:where(button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"])[data-nocturne-pending-control="button"] {
        background-color: var(--nocturne-raised) !important;
        color: var(--nocturne-text) !important;
        border-color: var(--nocturne-border) !important;
      }
      ${prefix}:where(button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"])[data-nocturne-pending-control="button"]:hover:not(:disabled):not([aria-disabled="true"]) {
        background-color: var(--nocturne-hover) !important;
      }
      ${prefix}:where(button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"])[data-nocturne-pending-control="button"]:active:not(:disabled):not([aria-disabled="true"]) {
        background-color: var(--nocturne-active) !important;
      }
      ${prefix}:where(dialog, [role="dialog"], [role="menu"], [role="listbox"], [popover])[data-nocturne-pending-control="surface"] {
        background-color: var(--nocturne-elevated) !important;
        color: var(--nocturne-text) !important;
        border-color: var(--nocturne-border) !important;
      }
    `;
  }

  function pseudoDynamicRules(scope, pseudo) {
    const prefix = `data-nocturne-${pseudo}`;
    const variable = `--nocturne-${pseudo}`;
    const selector = (suffix) => `${scope} ${boostedAttribute(`${prefix}-${suffix}`)}::${pseudo}`;
    return `
      ${selector('bg')} { background-color: var(${variable}-bg) !important; }
      ${selector('gradient')} { background-image: var(${variable}-bg-image) !important; }
      ${selector('color')} {
        color: var(${variable}-color) !important;
        caret-color: var(${variable}-color) !important;
      }
      ${selector('border')} {
        border-top-color: var(${variable}-border-top) !important;
        border-right-color: var(${variable}-border-right) !important;
        border-bottom-color: var(${variable}-border-bottom) !important;
        border-left-color: var(${variable}-border-left) !important;
        outline-color: var(${variable}-outline) !important;
        text-decoration-color: var(${variable}-decoration) !important;
      }
      ${selector('shadow')} {
        box-shadow: var(${variable}-shadow) !important;
        text-shadow: var(${variable}-text-shadow) !important;
      }
    `;
  }

  function sharedChromeCSS(effective) {
    const { advanced, appearance } = effective;
    const scrollbar = advanced.styleScrollbars ? `
      html[data-nocturne-active] { scrollbar-color: var(--nocturne-border) var(--nocturne-background) !important; }
      html[data-nocturne-active] ::-webkit-scrollbar { width: 12px; height: 12px; }
      html[data-nocturne-active] ::-webkit-scrollbar-track { background: var(--nocturne-background); }
      html[data-nocturne-active] ::-webkit-scrollbar-thumb { background: var(--nocturne-border); border: 3px solid var(--nocturne-background); border-radius: 999px; }
      html[data-nocturne-active] ::-webkit-scrollbar-thumb:hover { background: var(--nocturne-muted); }
    ` : '';
    const dim = Number(appearance.dimMedia || 0);
    const mediaFilters = [];
    if (!advanced.protectMedia) {
      mediaFilters.push(`brightness(${Math.max(0.7, Math.min(1.3, appearance.brightness / 100))})`);
      mediaFilters.push(`contrast(${Math.max(0.7, Math.min(1.3, appearance.contrast / 100))})`);
      mediaFilters.push(`saturate(${Math.max(0, Math.min(1.5, appearance.saturation / 100))})`);
      mediaFilters.push(`sepia(${Math.max(0, Math.min(1, appearance.sepia / 100))})`);
    }
    if (dim > 0) mediaFilters.push(`brightness(${Math.max(0.4, 1 - dim / 100)})`);
    const mediaDimming = mediaFilters.length ? `
      html[data-nocturne-active] :where(img, video, canvas, picture, object, embed) {
        filter: ${mediaFilters.join(' ')} !important;
      }
    ` : '';

    return `
      html[data-nocturne-active] {
        ${variablesCSS(appearance)}
        color-scheme: dark !important;
        accent-color: var(--nocturne-accent) !important;
      }
      html[data-nocturne-active] ::selection {
        background: var(--nocturne-selection) !important;
        color: var(--nocturne-text) !important;
      }
      html[data-nocturne-active] :where(input, textarea, select, option, optgroup, button, dialog) {
        color-scheme: dark !important;
      }
      html[data-nocturne-active] :where(input, textarea, select) {
        caret-color: var(--nocturne-accent) !important;
      }
      html[data-nocturne-active] :where(option, optgroup) {
        background-color: var(--nocturne-input) !important;
        color: var(--nocturne-text) !important;
      }
      html[data-nocturne-active] :where(input, textarea)::placeholder {
        color: var(--nocturne-muted) !important;
        opacity: 1 !important;
      }
      html[data-nocturne-active] :where(input, textarea, select, button, [tabindex], [contenteditable="true"]):focus-visible {
        outline-color: var(--nocturne-accent) !important;
      }
      html[data-nocturne-active] :where(input, textarea, select):-webkit-autofill,
      html[data-nocturne-active] :where(input, textarea, select):-webkit-autofill:hover,
      html[data-nocturne-active] :where(input, textarea, select):-webkit-autofill:focus {
        -webkit-text-fill-color: var(--nocturne-item-color, var(--nocturne-text)) !important;
        caret-color: var(--nocturne-item-color, var(--nocturne-text)) !important;
        -webkit-box-shadow: 0 0 0 1000px var(--nocturne-item-bg, var(--nocturne-input)) inset !important;
        box-shadow: 0 0 0 1000px var(--nocturne-item-bg, var(--nocturne-input)) inset !important;
        transition: background-color 999999s 0s, color 999999s 0s !important;
      }
      html[data-nocturne-active] :where(input, textarea, select, button):disabled,
      html[data-nocturne-active] :where([aria-disabled="true"]) {
        opacity: 0.72 !important;
      }
      html[data-nocturne-starting] *,
      html[data-nocturne-starting] *::before,
      html[data-nocturne-starting] *::after {
        transition-duration: 0s !important;
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
      }
      html[data-nocturne-active="dynamic"] [data-nocturne-interacting],
      html[data-nocturne-active="dynamic"] [data-nocturne-interacting]::before,
      html[data-nocturne-active="dynamic"] [data-nocturne-interacting]::after {
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        animation-duration: 0.001ms !important;
        animation-delay: 0s !important;
        animation-iteration-count: 1 !important;
      }
      ${scrollbar}
      ${mediaDimming}
    `;
  }

  function buildDynamicStyles(effective) {
    const scope = 'html[data-nocturne-active="dynamic"]';
    return `
      ${sharedChromeCSS(effective)}
      ${scope} {
        background-color: var(--nocturne-background) !important;
      }
      ${scope} body {
        background-color: var(--nocturne-background) !important;
        color: var(--nocturne-text) !important;
      }
      ${pendingControlCSS(scope)}
      ${scope} ${boostedAttribute('data-nocturne-bg')} {
        background-color: var(--nocturne-item-bg) !important;
      }
      ${scope} ${boostedAttribute('data-nocturne-color')} {
        color: var(--nocturne-item-color) !important;
        caret-color: var(--nocturne-item-color) !important;
      }
      ${scope} ${boostedAttribute('data-nocturne-border')} {
        border-top-color: var(--nocturne-border-top) !important;
        border-right-color: var(--nocturne-border-right) !important;
        border-bottom-color: var(--nocturne-border-bottom) !important;
        border-left-color: var(--nocturne-border-left) !important;
        outline-color: var(--nocturne-outline) !important;
        text-decoration-color: var(--nocturne-decoration) !important;
      }
      ${scope} ${boostedAttribute('data-nocturne-gradient')} {
        background-image: var(--nocturne-item-bg-image) !important;
      }
      ${scope} ${boostedAttribute('data-nocturne-shadow')} {
        box-shadow: var(--nocturne-shadow) !important;
        text-shadow: var(--nocturne-text-shadow) !important;
      }
      ${scope} ${boostedAttribute('data-nocturne-fill')} { fill: var(--nocturne-fill) !important; }
      ${scope} ${boostedAttribute('data-nocturne-stroke')} { stroke: var(--nocturne-stroke) !important; }
      ${scope} ${boostedAttribute('data-nocturne-accent')} { accent-color: var(--nocturne-item-accent) !important; }
      ${scope} :where(a:any-link) { text-decoration-color: color-mix(in srgb, currentColor 62%, transparent) !important; }
      ${pseudoDynamicRules(scope, 'before')}
      ${pseudoDynamicRules(scope, 'after')}
      ${pseudoDynamicRules(scope, 'backdrop')}
    `;
  }

  function buildStaticStyles(effective) {
    return `
      ${sharedChromeCSS(effective)}
      html[data-nocturne-active="static"],
      html[data-nocturne-active="static"] body {
        background: var(--nocturne-background) !important;
        color: var(--nocturne-text) !important;
      }
      html[data-nocturne-active="static"] :where(
        main, section, article, aside, nav, header, footer, div, form, fieldset,
        table, thead, tbody, tfoot, tr, td, th, ul, ol, li, dialog, details,
        summary, pre, code, blockquote, [role="dialog"], [role="menu"], [role="listbox"]
      ):not(:where(img, picture, video, canvas, iframe, object, embed, svg)) {
        background-color: var(--nocturne-background) !important;
        color: var(--nocturne-text) !important;
        border-color: var(--nocturne-border) !important;
      }
      html[data-nocturne-active="static"] :where(input, textarea, select, option, button) {
        background-color: var(--nocturne-input) !important;
        color: var(--nocturne-text) !important;
        border-color: var(--nocturne-border) !important;
      }
      html[data-nocturne-active="static"] :where(button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]) {
        background-color: var(--nocturne-raised) !important;
      }
      html[data-nocturne-active="static"] :where(button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]):hover:not(:disabled):not([aria-disabled="true"]) {
        background-color: var(--nocturne-hover) !important;
      }
      html[data-nocturne-active="static"] :where(button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]):active:not(:disabled):not([aria-disabled="true"]) {
        background-color: var(--nocturne-active) !important;
      }
      html[data-nocturne-active="static"] :where(pre, code, kbd, samp) {
        background-color: var(--nocturne-raised) !important;
      }
      html[data-nocturne-active="static"] :where(a:any-link) { color: var(--nocturne-accent) !important; }
      html[data-nocturne-active="static"] :where(hr) { border-color: var(--nocturne-border) !important; }
      html[data-nocturne-active="static"] :where(img, picture, video, canvas, iframe, object, embed) {
        color-scheme: normal !important;
      }
    `;
  }

  function buildFilterStyles(effective) {
    const brightness = Math.max(0.7, Math.min(1.3, effective.appearance.brightness / 100));
    const contrast = Math.max(0.7, Math.min(1.3, effective.appearance.contrast / 100));
    const saturation = Math.max(0, Math.min(1.5, effective.appearance.saturation / 100));
    const sepia = Math.max(0, Math.min(1, effective.appearance.sepia / 100));
    const reverseBrightness = Math.max(0.77, Math.min(1.43, 1 / brightness));
    const reverseContrast = Math.max(0.77, Math.min(1.43, 1 / contrast));
    const protectedMedia = effective.advanced.protectMedia ? `
      html[data-nocturne-active="filter"] :where(img, picture, video, canvas, iframe, object, embed, svg image) {
        filter: invert(1) hue-rotate(180deg) brightness(${reverseBrightness}) contrast(${reverseContrast}) saturate(${Math.max(0.67, 1 / Math.max(saturation, 0.01))}) !important;
      }
    ` : '';
    return `
      ${sharedChromeCSS(effective)}
      html[data-nocturne-active="filter"] {
        background: var(--nocturne-background) !important;
        filter: invert(1) hue-rotate(180deg) brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) sepia(${sepia}) !important;
      }
      ${protectedMedia}
      html[data-nocturne-active="filter"] :where(video, iframe) { background: #000 !important; }
    `;
  }

  function buildShadowDynamicStyles(effective) {
    const scope = ':host-context(html[data-nocturne-active="dynamic"])';
    const localScope = '';
    return `
      :host {
        ${variablesCSS(effective.appearance)}
        color-scheme: dark !important;
        accent-color: var(--nocturne-accent) !important;
      }
      ${pendingControlCSS(localScope)}
      ${boostedAttribute('data-nocturne-bg')} { background-color: var(--nocturne-item-bg) !important; }
      ${boostedAttribute('data-nocturne-gradient')} { background-image: var(--nocturne-item-bg-image) !important; }
      ${boostedAttribute('data-nocturne-color')} { color: var(--nocturne-item-color) !important; caret-color: var(--nocturne-item-color) !important; }
      ${boostedAttribute('data-nocturne-border')} {
        border-top-color: var(--nocturne-border-top) !important;
        border-right-color: var(--nocturne-border-right) !important;
        border-bottom-color: var(--nocturne-border-bottom) !important;
        border-left-color: var(--nocturne-border-left) !important;
        outline-color: var(--nocturne-outline) !important;
        text-decoration-color: var(--nocturne-decoration) !important;
      }
      ${boostedAttribute('data-nocturne-shadow')} { box-shadow: var(--nocturne-shadow) !important; text-shadow: var(--nocturne-text-shadow) !important; }
      ${boostedAttribute('data-nocturne-fill')} { fill: var(--nocturne-fill) !important; }
      ${boostedAttribute('data-nocturne-stroke')} { stroke: var(--nocturne-stroke) !important; }
      ${boostedAttribute('data-nocturne-accent')} { accent-color: var(--nocturne-item-accent) !important; }
      :where(input, textarea, select, option, optgroup, button) { color-scheme: dark !important; }
      :where(input, textarea)::placeholder { color: var(--nocturne-muted) !important; opacity: 1 !important; }
      ::selection { background: var(--nocturne-selection) !important; color: var(--nocturne-text) !important; }
      ${pseudoDynamicRules(localScope, 'before')}
      ${pseudoDynamicRules(localScope, 'after')}
      ${pseudoDynamicRules(localScope, 'backdrop')}
    `;
  }

  function buildModeStyles(mode, effective) {
    if (mode === 'static') return buildStaticStyles(effective);
    if (mode === 'filter') return buildFilterStyles(effective);
    return buildDynamicStyles(effective);
  }

  return {
    sanitizeCustomCSS,
    themePalette,
    variablesCSS,
    buildDynamicStyles,
    buildStaticStyles,
    buildFilterStyles,
    buildShadowDynamicStyles,
    buildModeStyles
  };
});
