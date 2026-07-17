(function initNocturneDynamicEngine(root, factory) {
  const api = factory(root.Nocturne || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Nocturne = Object.assign(root.Nocturne || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function dynamicEngineFactory(N) {
  'use strict';

  const {
    parseColor,
    toCssColor,
    relativeLuminance,
    composite,
    mixRgb,
    colorKey,
    mapBackground,
    mapText,
    mapBorder,
    mapAccent,
    effectiveBackgroundBase,
    transformColorTokens
  } = N;

  const BASE_DATA_ATTRIBUTES = [
    'data-nocturne-bg',
    'data-nocturne-color',
    'data-nocturne-border',
    'data-nocturne-shadow',
    'data-nocturne-fill',
    'data-nocturne-stroke',
    'data-nocturne-accent',
    'data-nocturne-gradient'
  ];

  const BASE_CSS_PROPERTIES = [
    '--nocturne-item-bg',
    '--nocturne-item-color',
    '--nocturne-border-top',
    '--nocturne-border-right',
    '--nocturne-border-bottom',
    '--nocturne-border-left',
    '--nocturne-outline',
    '--nocturne-decoration',
    '--nocturne-shadow',
    '--nocturne-text-shadow',
    '--nocturne-fill',
    '--nocturne-stroke',
    '--nocturne-item-accent',
    '--nocturne-item-bg-image'
  ];

  const PSEUDO_NAMES = ['before', 'after', 'backdrop'];
  const PSEUDO_ATTRIBUTE_SUFFIXES = ['bg', 'color', 'border', 'shadow', 'gradient'];
  const PSEUDO_PROPERTY_SUFFIXES = [
    'bg', 'color', 'border-top', 'border-right', 'border-bottom', 'border-left',
    'outline', 'decoration', 'shadow', 'text-shadow', 'bg-image'
  ];
  const PSEUDO_DATA_ATTRIBUTES = PSEUDO_NAMES.flatMap((pseudo) =>
    PSEUDO_ATTRIBUTE_SUFFIXES.map((suffix) => `data-nocturne-${pseudo}-${suffix}`)
  );
  const PSEUDO_CSS_PROPERTIES = PSEUDO_NAMES.flatMap((pseudo) =>
    PSEUDO_PROPERTY_SUFFIXES.map((suffix) => `--nocturne-${pseudo}-${suffix}`)
  );
  const THEME_DATA_ATTRIBUTES = [...BASE_DATA_ATTRIBUTES, ...PSEUDO_DATA_ATTRIBUTES];
  const CLEANUP_DATA_ATTRIBUTES = [
    ...THEME_DATA_ATTRIBUTES,
    'data-nocturne-media',
    'data-nocturne-pending-control',
    'data-nocturne-processed',
    'data-nocturne-interacting'
  ];
  const CSS_PROPERTIES = [...BASE_CSS_PROPERTIES, ...PSEUDO_CSS_PROPERTIES];

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'TITLE', 'BASE', 'NOSCRIPT',
    'TEMPLATE', 'SOURCE', 'TRACK', 'PARAM', 'BR', 'WBR'
  ]);
  const MEDIA_TAGS = new Set(['IMG', 'PICTURE', 'VIDEO', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED']);
  const TEXT_CONTROL_TAGS = new Set([
    'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'OPTGROUP', 'BUTTON', 'LABEL', 'A', 'SUMMARY',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LI', 'TD', 'TH', 'CODE', 'PRE', 'KBD'
  ]);
  const BUTTON_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'image']);
  const BUTTON_ROLES = new Set([
    'button', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option',
    'switch', 'checkbox', 'radio', 'treeitem'
  ]);
  const SURFACE_ROLES = new Set(['dialog', 'alertdialog', 'menu', 'listbox', 'tooltip']);
  const OBSERVED_ATTRIBUTES = [
    'class', 'style', 'hidden', 'open', 'disabled', 'checked', 'selected', 'readonly',
    'required', 'value', 'type', 'role', 'tabindex', 'contenteditable', 'popover',
    'aria-expanded', 'aria-selected', 'aria-pressed', 'aria-checked', 'aria-disabled',
    'aria-current', 'aria-hidden', 'data-state', 'data-theme', 'data-mode'
  ];
  const INTERACTION_EVENTS = [
    'pointerover', 'pointerout', 'pointerdown', 'pointerup', 'pointercancel',
    'focusin', 'focusout', 'input', 'change', 'keydown', 'keyup',
    'transitionend', 'animationend'
  ];

  function requestIdle(callback) {
    if (typeof requestIdleCallback === 'function') return requestIdleCallback(callback, { timeout: 180 });
    return setTimeout(() => callback({ timeRemaining: () => 8, didTimeout: true }), 16);
  }

  function cancelIdle(handle) {
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(handle);
    else clearTimeout(handle);
  }

  function requestFrame(callback) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
    return setTimeout(callback, 0);
  }

  function cancelFrame(handle) {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
    else clearTimeout(handle);
  }

  function hasDirectText(element) {
    if (TEXT_CONTROL_TAGS.has(element.tagName)) return true;
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue && node.nodeValue.trim()) return true;
    }
    return false;
  }

  function differs(first, second) {
    if (!first || !second) return false;
    return Math.abs(first.r - second.r) + Math.abs(first.g - second.g) + Math.abs(first.b - second.b) > 5 || Math.abs(first.a - second.a) > 0.02;
  }

  function isSvgTextElement(element) {
    return typeof SVGTextElement !== 'undefined' && element instanceof SVGTextElement;
  }

  function isSvgMedia(element) {
    const svg = element.tagName === 'SVG' ? element : element.ownerSVGElement;
    if (!svg) return false;
    if (svg.querySelector('image')) return true;
    const rect = svg.getBoundingClientRect();
    return rect.width > 220 && rect.height > 160;
  }

  function isVisibleStyle(style) {
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.001;
  }

  function controlKind(element) {
    if (!(element instanceof Element)) return '';
    const tag = element.tagName;
    if (tag === 'INPUT') {
      const type = String(element.getAttribute('type') || 'text').toLowerCase();
      if (type === 'hidden') return '';
      return BUTTON_INPUT_TYPES.has(type) ? 'button' : 'field';
    }
    if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION' || tag === 'OPTGROUP') return 'field';
    if (tag === 'BUTTON') return 'button';
    if (tag === 'DIALOG' || element.hasAttribute('popover')) return 'surface';

    const role = String(element.getAttribute('role') || '').toLowerCase();
    if (BUTTON_ROLES.has(role)) return 'button';
    if (SURFACE_ROLES.has(role)) return 'surface';
    if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') return 'field';
    return '';
  }

  function isInteractionCandidate(element) {
    if (!(element instanceof Element)) return false;
    if (controlKind(element)) return true;
    if (element.tagName === 'A' && element.hasAttribute('href')) return true;
    return element.tagName === 'SUMMARY' || element.hasAttribute('tabindex');
  }

  function shouldInspectPseudo(element, force) {
    if (force || isInteractionCandidate(element)) return true;
    try {
      return element.matches(':hover, :focus, :focus-within, :active');
    } catch (_error) {
      return false;
    }
  }

  function hasThemeAttributes(element) {
    return THEME_DATA_ATTRIBUTES.some((attribute) => element.hasAttribute(attribute));
  }

  class DynamicEngine {
    constructor(effective, options) {
      this.effective = effective;
      this.appearance = effective.appearance;
      this.advanced = effective.advanced;
      this.shadowStyleText = options && options.shadowStyleText || '';
      this.baseBackground = effectiveBackgroundBase(this.appearance);
      this.roots = new Set();
      this.observers = new Set();
      this.shadowStyles = new Map();
      this.metadata = new WeakMap();
      this.registeredElements = new WeakSet();
      this.queue = [];
      this.queued = new WeakSet();
      this.urgentElements = new Set();
      this.urgentFrame = null;
      this.interactionImmediate = new Set();
      this.interactionSettle = new Set();
      this.interactionLate = new Set();
      this.interactionFrame = null;
      this.interactionSettleTimer = null;
      this.interactionLateTimer = null;
      this.interactionLocks = new Map();
      this.idleHandles = new Set();
      this.stopped = false;
      this.cacheDirty = false;
      this.onInteractiveState = (event) => this.handleInteractiveState(event);
      this.maps = {
        background: Object.assign({}, options && options.cache && options.cache.maps && options.cache.maps.background),
        text: Object.assign({}, options && options.cache && options.cache.maps && options.cache.maps.text),
        border: Object.assign({}, options && options.cache && options.cache.maps && options.cache.maps.border),
        accent: Object.assign({}, options && options.cache && options.cache.maps && options.cache.maps.accent)
      };
      this.stats = {
        registered: 0,
        queued: 0,
        urgent: 0,
        processed: 0,
        interactionRefreshes: 0,
        pseudoElements: 0,
        mediaProtected: 0,
        shadowRoots: 0,
        cacheHits: 0,
        cacheMisses: 0,
        primedElements: 0,
        primeMs: 0,
        startedAt: performance.now(),
        lastSliceMs: 0
      };

      this.intersectionObserver = typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) this.enqueue(entry.target);
          }
        }, { rootMargin: `${this.advanced.rootMargin || 700}px` })
        : null;
    }

    start() {
      this.addRoot(document);
      for (const type of INTERACTION_EVENTS) {
        document.addEventListener(type, this.onInteractiveState, true);
      }
      const html = document.documentElement;
      if (html) this.processElement(html, true);
      if (document.body) this.processElement(document.body, true);
      else document.addEventListener('DOMContentLoaded', () => {
        if (!this.stopped && document.body) this.processElement(document.body, true);
      }, { once: true });
      return this;
    }

    addRoot(rootNode) {
      if (!rootNode || this.roots.has(rootNode) || this.stopped) return;
      this.roots.add(rootNode);

      if (rootNode instanceof ShadowRoot) {
        this.stats.shadowRoots += 1;
        if (this.shadowStyleText) {
          const style = document.createElement('style');
          style.setAttribute('data-nocturne-shadow-style', '');
          style.textContent = this.shadowStyleText;
          rootNode.appendChild(style);
          this.shadowStyles.set(rootNode, style);
        }
      }

      const observer = new MutationObserver((mutations) => this.onMutations(mutations));
      observer.observe(rootNode, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeOldValue: false,
        attributeFilter: OBSERVED_ATTRIBUTES
      });
      this.observers.add(observer);
      this.registerSubtree(rootNode);
    }

    onMutations(mutations) {
      if (this.stopped) return;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            this.primeAddedSubtree(node);
            this.registerSubtree(node);
          }
        } else if (mutation.type === 'attributes') {
          const element = mutation.target;
          if (!(element instanceof Element) || element.hasAttribute('data-nocturne-applying')) continue;
          this.observeElement(element);
          this.enqueueUrgent(element);
        }
      }
    }

    primeAddedSubtree(rootElement) {
      if (!(rootElement instanceof Element) || this.stopped) return;
      const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_ELEMENT);
      let current = rootElement;
      let count = 0;
      while (current && count < 80) {
        this.observeElement(current);
        this.enqueueUrgent(current);
        current = walker.nextNode();
        count += 1;
      }
    }

    registerSubtree(rootNode) {
      if (this.stopped) return;
      const isContainerRoot = rootNode instanceof Document || rootNode instanceof ShadowRoot;
      const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT);
      let current = isContainerRoot ? walker.nextNode() : rootNode;
      if (!current) return;
      const step = (deadline) => {
        if (this.stopped) return;
        let count = 0;
        while (current && count < 550 && (deadline.didTimeout || deadline.timeRemaining() > 1)) {
          this.observeElement(current);
          current = walker.nextNode();
          count += 1;
        }
        if (current && !this.stopped) {
          const handle = requestIdle((nextDeadline) => {
            this.idleHandles.delete(handle);
            step(nextDeadline);
          });
          this.idleHandles.add(handle);
        }
      };
      const handle = requestIdle((deadline) => {
        this.idleHandles.delete(handle);
        step(deadline);
      });
      this.idleHandles.add(handle);
    }

    observeElement(element) {
      if (!(element instanceof Element) || SKIP_TAGS.has(element.tagName)) return;
      if (this.registeredElements.has(element)) return;
      this.registeredElements.add(element);
      this.stats.registered += 1;

      if (this.advanced.processShadowDOM && element.shadowRoot) this.addRoot(element.shadowRoot);

      if (this.advanced.protectMedia && MEDIA_TAGS.has(element.tagName)) {
        element.setAttribute('data-nocturne-media', '');
        this.stats.mediaProtected += 1;
        return;
      }

      const kind = controlKind(element);
      if (kind) {
        element.setAttribute('data-nocturne-pending-control', kind);
        this.enqueueUrgent(element);
      }

      if (this.intersectionObserver) this.intersectionObserver.observe(element);
      else this.enqueue(element);
    }

    enqueue(element) {
      if (this.stopped || !(element instanceof Element) || this.queued.has(element)) return;
      this.queued.add(element);
      this.queue.push(element);
      this.stats.queued += 1;
      if (this.queue.length === 1) this.scheduleDrain();
    }

    enqueueUrgent(element) {
      if (this.stopped || !(element instanceof Element) || SKIP_TAGS.has(element.tagName)) return;
      this.urgentElements.add(element);
      this.stats.urgent += 1;
      if (this.urgentFrame != null) return;
      this.urgentFrame = requestFrame(() => {
        this.urgentFrame = null;
        const elements = Array.from(this.urgentElements);
        this.urgentElements.clear();
        for (const item of elements) {
          if (item.isConnected) this.processElement(item, true);
        }
      });
    }

    scheduleDrain() {
      const handle = requestIdle((deadline) => {
        this.idleHandles.delete(handle);
        this.drain(deadline);
      });
      this.idleHandles.add(handle);
    }

    drain(deadline) {
      if (this.stopped) return;
      const started = performance.now();
      const limit = this.advanced.maxElementsPerSlice || 55;
      let count = 0;
      while (this.queue.length && count < limit && (deadline.didTimeout || deadline.timeRemaining() > 1)) {
        const element = this.queue.shift();
        this.queued.delete(element);
        if (element.isConnected) this.processElement(element, false);
        count += 1;
      }
      this.stats.lastSliceMs = performance.now() - started;
      if (this.queue.length) this.scheduleDrain();
    }

    collectInteractionElements(event) {
      const elements = [];
      const seen = new Set();
      const add = (value) => {
        if (!(value instanceof Element) || seen.has(value) || SKIP_TAGS.has(value.tagName)) return;
        seen.add(value);
        elements.push(value);
      };

      const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
      for (const value of path) {
        add(value);
        if (elements.length >= 8) break;
      }

      let related = event.relatedTarget instanceof Element ? event.relatedTarget : null;
      let depth = 0;
      while (related && depth < 5) {
        add(related);
        related = related.parentElement;
        depth += 1;
      }
      return elements;
    }

    handleInteractiveState(event) {
      if (this.stopped) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.hasAttribute('data-nocturne-applying')) return;
      if ((event.type === 'transitionend' || event.type === 'animationend') && !isInteractionCandidate(target)) {
        try {
          if (!target.matches(':hover, :focus, :focus-within, :active')) return;
        } catch (_error) {
          return;
        }
      }

      const elements = this.collectInteractionElements(event);
      if (!elements.length) return;
      for (const element of elements) {
        this.interactionImmediate.add(element);
        this.interactionSettle.add(element);
        this.interactionLate.add(element);
      }

      if (this.interactionFrame == null) {
        this.interactionFrame = requestFrame(() => {
          this.interactionFrame = null;
          this.flushInteractionSet(this.interactionImmediate);
        });
      }

      clearTimeout(this.interactionSettleTimer);
      this.interactionSettleTimer = setTimeout(() => {
        this.interactionSettleTimer = null;
        this.flushInteractionSet(this.interactionSettle);
      }, 90);

      clearTimeout(this.interactionLateTimer);
      this.interactionLateTimer = setTimeout(() => {
        this.interactionLateTimer = null;
        this.flushInteractionSet(this.interactionLate);
      }, 240);
    }

    lockInteractiveElement(element) {
      element.setAttribute('data-nocturne-interacting', '');
      const previous = this.interactionLocks.get(element);
      if (previous) clearTimeout(previous);
      const timer = setTimeout(() => {
        this.interactionLocks.delete(element);
        if (element.isConnected) element.removeAttribute('data-nocturne-interacting');
      }, 340);
      this.interactionLocks.set(element, timer);
    }

    flushInteractionSet(set) {
      const elements = Array.from(set);
      set.clear();
      for (const element of elements) {
        if (!element.isConnected) continue;
        this.processElement(element, true, true);
        this.stats.interactionRefreshes += 1;
      }
    }

    primeViewport() {
      if (this.stopped) return { processed: 0, examined: 0, elapsedMs: 0 };
      const started = performance.now();
      const maxProcessed = Math.min(900, Math.max(280, (this.advanced.maxElementsPerSlice || 55) * 7));
      const maxExamined = Math.max(1800, maxProcessed * 6);
      const width = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const height = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
      const margin = 160;
      let processed = 0;
      let examined = 0;

      const scanRoot = (rootNode) => {
        const isContainerRoot = rootNode instanceof Document || rootNode instanceof ShadowRoot;
        const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT);
        let current = isContainerRoot ? walker.nextNode() : rootNode;
        while (current && processed < maxProcessed && examined < maxExamined) {
          examined += 1;
          this.observeElement(current);
          if (!SKIP_TAGS.has(current.tagName) && !(this.advanced.protectMedia && MEDIA_TAGS.has(current.tagName))) {
            const kind = controlKind(current);
            let nearViewport = kind || current === document.documentElement || current === document.body;
            if (!nearViewport) {
              try {
                const rect = current.getBoundingClientRect();
                nearViewport = rect.width > 0 && rect.height > 0 &&
                  rect.bottom >= -margin && rect.top <= height + margin &&
                  rect.right >= -margin && rect.left <= width + margin;
              } catch (_error) {
                nearViewport = false;
              }
            }
            if (nearViewport) {
              this.processElement(current, true);
              processed += 1;
            }
          }
          current = walker.nextNode();
        }
      };

      scanRoot(document);
      for (const rootNode of Array.from(this.roots)) {
        if (processed >= maxProcessed || examined >= maxExamined) break;
        if (rootNode instanceof ShadowRoot) scanRoot(rootNode);
      }

      const elapsedMs = performance.now() - started;
      this.stats.primedElements += processed;
      this.stats.primeMs = elapsedMs;
      return { processed, examined, elapsedMs };
    }

    getMappedBackground(element) {
      let current = element.parentElement;
      let steps = 0;
      while (current && steps < 16) {
        const known = this.metadata.get(current);
        if (known && known.mappedBackground) return known.mappedBackground;
        const computed = getComputedStyle(current);
        const source = parseColor(computed.backgroundColor);
        if (source && source.a > 0.05) {
          const mapped = this.cachedMap('background', source, null);
          if (mapped) return source.a < 0.98 ? composite(mapped, this.baseBackground) : mapped;
        }
        current = current.parentElement;
        steps += 1;
      }
      return this.baseBackground;
    }

    cachedMap(role, sourceInput, backgroundInput) {
      const source = parseColor(sourceInput);
      if (!source) return null;
      const background = parseColor(backgroundInput);
      const key = `${colorKey(source)}${background ? `|${colorKey(background)}` : ''}`;
      const bucket = this.maps[role];
      if (bucket && bucket[key]) {
        this.stats.cacheHits += 1;
        return parseColor(bucket[key]);
      }

      let mapped;
      if (role === 'background') mapped = mapBackground(source, this.appearance);
      else if (role === 'text') mapped = mapText(source, background || this.baseBackground, this.appearance);
      else if (role === 'border') mapped = mapBorder(source, background || this.baseBackground, this.appearance);
      else mapped = mapAccent(source, background || this.baseBackground, this.appearance);

      if (mapped && bucket && Object.keys(bucket).length < 420) {
        bucket[key] = toCssColor(mapped);
        this.cacheDirty = true;
      }
      this.stats.cacheMisses += 1;
      return mapped;
    }

    setStyles(element, attributes, properties) {
      element.setAttribute('data-nocturne-applying', '');
      for (const attribute of attributes) element.setAttribute(attribute, '');
      for (const [name, value] of Object.entries(properties)) {
        if (value) element.style.setProperty(name, value);
      }
      element.removeAttribute('data-nocturne-pending-control');
      element.setAttribute('data-nocturne-processed', '');
      setTimeout(() => {
        if (element.isConnected) element.removeAttribute('data-nocturne-applying');
      }, 0);
    }

    resetElement(element) {
      if (!(element instanceof Element)) return;
      element.setAttribute('data-nocturne-applying', '');
      for (const attribute of CLEANUP_DATA_ATTRIBUTES) element.removeAttribute(attribute);
      for (const property of CSS_PROPERTIES) element.style.removeProperty(property);
      this.metadata.delete(element);
      setTimeout(() => {
        if (element.isConnected) element.removeAttribute('data-nocturne-applying');
      }, 0);
    }

    processPseudo(element, pseudo, parentBackground, attributes, properties) {
      if (pseudo === 'backdrop' && element.tagName !== 'DIALOG' && !element.hasAttribute('popover')) return;
      let style;
      try {
        style = getComputedStyle(element, `::${pseudo}`);
      } catch (_error) {
        return;
      }
      if (!style || !isVisibleStyle(style)) return;

      const content = String(style.content || '').toLowerCase();
      const backgroundImage = style.backgroundImage;
      const sourceBackground = parseColor(style.backgroundColor);
      const hasBackgroundImage = backgroundImage && backgroundImage !== 'none';
      const hasBorder = ['Top', 'Right', 'Bottom', 'Left'].some((side) =>
        style[`border${side}Style`] !== 'none' && parseFloat(style[`border${side}Width`]) > 0
      );
      const hasShadow = (style.boxShadow && style.boxShadow !== 'none') || (style.textShadow && style.textShadow !== 'none');
      const hasContent = content !== 'none' && content !== 'normal';
      if (!hasContent && (!sourceBackground || sourceBackground.a <= 0.015) && !hasBackgroundImage && !hasBorder && !hasShadow) return;

      const prefix = `data-nocturne-${pseudo}`;
      const variable = `--nocturne-${pseudo}`;
      let mappedBackground = parentBackground;

      if (sourceBackground && sourceBackground.a > 0.015) {
        const mapped = this.cachedMap('background', sourceBackground, null);
        if (mapped) {
          mappedBackground = sourceBackground.a < 0.98 ? composite(mapped, parentBackground) : mapped;
          if (differs(sourceBackground, mapped)) {
            attributes.push(`${prefix}-bg`);
            properties[`${variable}-bg`] = toCssColor(mapped);
          }
        }
      }

      const containsUrlImage = hasBackgroundImage && /url\(/i.test(backgroundImage);
      const containsGradient = hasBackgroundImage && !containsUrlImage && /gradient\(/i.test(backgroundImage);
      if (containsUrlImage && !this.advanced.protectBackgroundImages) {
        const overlay = toCssColor({ ...this.baseBackground, a: 0.46 });
        attributes.push(`${prefix}-gradient`);
        properties[`${variable}-bg-image`] = `linear-gradient(${overlay}, ${overlay}), ${backgroundImage}`;
      } else if (containsGradient) {
        const transformed = transformColorTokens(backgroundImage, (token) => this.cachedMap('background', token, null));
        if (transformed !== backgroundImage) {
          attributes.push(`${prefix}-gradient`);
          properties[`${variable}-bg-image`] = transformed;
        }
      }

      const sourceText = parseColor(style.color);
      if (sourceText && hasContent) {
        const mapped = this.cachedMap('text', sourceText, mappedBackground);
        if (mapped && differs(sourceText, mapped)) {
          attributes.push(`${prefix}-color`);
          properties[`${variable}-color`] = toCssColor(mapped);
        }
      }

      let mappedBorder = false;
      for (const [side, propertySuffix] of [
        ['Top', 'border-top'], ['Right', 'border-right'], ['Bottom', 'border-bottom'], ['Left', 'border-left']
      ]) {
        if (style[`border${side}Style`] === 'none' || style[`border${side}Style`] === 'hidden' || parseFloat(style[`border${side}Width`]) <= 0) continue;
        const source = parseColor(style[`border${side}Color`]);
        const mapped = source && this.cachedMap('border', source, mappedBackground);
        if (mapped && differs(source, mapped)) {
          properties[`${variable}-${propertySuffix}`] = toCssColor(mapped);
          mappedBorder = true;
        }
      }
      if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) {
        const source = parseColor(style.outlineColor);
        const mapped = source && this.cachedMap('border', source, mappedBackground);
        if (mapped) {
          properties[`${variable}-outline`] = toCssColor(mapped);
          mappedBorder = true;
        }
      }
      if (style.textDecorationLine && style.textDecorationLine !== 'none') {
        const source = parseColor(style.textDecorationColor);
        const mapped = source && this.cachedMap('border', source, mappedBackground);
        if (mapped) {
          properties[`${variable}-decoration`] = toCssColor(mapped);
          mappedBorder = true;
        }
      }
      if (mappedBorder) attributes.push(`${prefix}-border`);

      const shadowTransform = (token) => {
        if (relativeLuminance(token) < 0.22) {
          const dark = mixRgb(mappedBackground, parseColor('#000000'), 0.64);
          dark.a = token.a;
          return dark;
        }
        return this.cachedMap('border', token, mappedBackground);
      };
      let mappedShadow = false;
      if (style.boxShadow && style.boxShadow !== 'none') {
        const mapped = transformColorTokens(style.boxShadow, shadowTransform);
        if (mapped !== style.boxShadow) {
          properties[`${variable}-shadow`] = mapped;
          mappedShadow = true;
        }
      }
      if (style.textShadow && style.textShadow !== 'none') {
        const mapped = transformColorTokens(style.textShadow, shadowTransform);
        if (mapped !== style.textShadow) {
          properties[`${variable}-text-shadow`] = mapped;
          mappedShadow = true;
        }
      }
      if (mappedShadow) attributes.push(`${prefix}-shadow`);

      if (attributes.some((attribute) => attribute.startsWith(prefix))) this.stats.pseudoElements += 1;
    }

    processElement(element, force, interactiveState) {
      if (this.stopped || !(element instanceof Element) || SKIP_TAGS.has(element.tagName)) return;
      if (this.advanced.protectMedia && MEDIA_TAGS.has(element.tagName)) return;
      if (element.hasAttribute('data-nocturne-applying')) return;

      const pendingControl = element.hasAttribute('data-nocturne-pending-control');
      if (force || pendingControl || hasThemeAttributes(element)) {
        this.resetElement(element);
      }
      if (interactiveState) this.lockInteractiveElement(element);

      const style = getComputedStyle(element);
      if (!isVisibleStyle(style)) return;
      if (this.advanced.processShadowDOM && element.shadowRoot) this.addRoot(element.shadowRoot);

      const parentBackground = this.getMappedBackground(element);
      const sourceBackground = parseColor(style.backgroundColor);
      const attributes = [];
      const properties = {};
      let mappedBackground = parentBackground;

      const backgroundImage = style.backgroundImage;
      const containsUrlImage = backgroundImage && backgroundImage !== 'none' && /url\(/i.test(backgroundImage);
      const containsGradient = backgroundImage && backgroundImage !== 'none' && !containsUrlImage && /gradient\(/i.test(backgroundImage);

      if (sourceBackground && sourceBackground.a > 0.015) {
        const mapped = this.cachedMap('background', sourceBackground, null);
        if (mapped) {
          mappedBackground = sourceBackground.a < 0.98 ? composite(mapped, parentBackground) : mapped;
          if (differs(sourceBackground, mapped)) {
            attributes.push('data-nocturne-bg');
            properties['--nocturne-item-bg'] = toCssColor(mapped);
          }
        }
      }

      if (containsUrlImage && !this.advanced.protectBackgroundImages) {
        const overlay = toCssColor({ ...this.baseBackground, a: 0.46 });
        attributes.push('data-nocturne-gradient');
        properties['--nocturne-item-bg-image'] = `linear-gradient(${overlay}, ${overlay}), ${backgroundImage}`;
      } else if (containsGradient) {
        const transformed = transformColorTokens(backgroundImage, (token) => this.cachedMap('background', token, null));
        if (transformed !== backgroundImage) {
          attributes.push('data-nocturne-gradient');
          properties['--nocturne-item-bg-image'] = transformed;
        }
      }

      const sourceText = parseColor(style.color);
      if (sourceText && (hasDirectText(element) || isSvgTextElement(element))) {
        const mapped = this.cachedMap('text', sourceText, mappedBackground);
        if (mapped && differs(sourceText, mapped)) {
          attributes.push('data-nocturne-color');
          properties['--nocturne-item-color'] = toCssColor(mapped);
        }
      }

      const borderProperties = [
        ['Top', 'borderTopStyle', 'borderTopWidth', 'borderTopColor', '--nocturne-border-top'],
        ['Right', 'borderRightStyle', 'borderRightWidth', 'borderRightColor', '--nocturne-border-right'],
        ['Bottom', 'borderBottomStyle', 'borderBottomWidth', 'borderBottomColor', '--nocturne-border-bottom'],
        ['Left', 'borderLeftStyle', 'borderLeftWidth', 'borderLeftColor', '--nocturne-border-left']
      ];
      let hasBorder = false;
      for (const [, styleName, widthName, colorName, variable] of borderProperties) {
        if (style[styleName] === 'none' || style[styleName] === 'hidden' || parseFloat(style[widthName]) <= 0) continue;
        const source = parseColor(style[colorName]);
        const mapped = source && this.cachedMap('border', source, mappedBackground);
        if (mapped && differs(source, mapped)) {
          properties[variable] = toCssColor(mapped);
          hasBorder = true;
        }
      }

      if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) {
        const source = parseColor(style.outlineColor);
        const mapped = source && this.cachedMap('border', source, mappedBackground);
        if (mapped) {
          properties['--nocturne-outline'] = toCssColor(mapped);
          hasBorder = true;
        }
      }

      if (style.textDecorationLine && style.textDecorationLine !== 'none') {
        const source = parseColor(style.textDecorationColor);
        const mapped = source && this.cachedMap('border', source, mappedBackground);
        if (mapped) {
          properties['--nocturne-decoration'] = toCssColor(mapped);
          hasBorder = true;
        }
      }
      if (hasBorder) attributes.push('data-nocturne-border');

      const shadowTransform = (token) => {
        if (relativeLuminance(token) < 0.22) {
          const dark = mixRgb(mappedBackground, parseColor('#000000'), 0.64);
          dark.a = token.a;
          return dark;
        }
        return this.cachedMap('border', token, mappedBackground);
      };
      let hasShadow = false;
      if (style.boxShadow && style.boxShadow !== 'none') {
        const mapped = transformColorTokens(style.boxShadow, shadowTransform);
        if (mapped !== style.boxShadow) {
          properties['--nocturne-shadow'] = mapped;
          hasShadow = true;
        }
      }
      if (style.textShadow && style.textShadow !== 'none') {
        const mapped = transformColorTokens(style.textShadow, shadowTransform);
        if (mapped !== style.textShadow) {
          properties['--nocturne-text-shadow'] = mapped;
          hasShadow = true;
        }
      }
      if (hasShadow) attributes.push('data-nocturne-shadow');

      if (element instanceof SVGElement && (!this.advanced.protectMedia || !isSvgMedia(element))) {
        const fill = parseColor(style.fill);
        if (fill && fill.a > 0.02) {
          const mapped = this.cachedMap('text', fill, mappedBackground);
          if (mapped && differs(fill, mapped)) {
            attributes.push('data-nocturne-fill');
            properties['--nocturne-fill'] = toCssColor(mapped);
          }
        }
        const stroke = parseColor(style.stroke);
        if (stroke && stroke.a > 0.02) {
          const mapped = this.cachedMap('border', stroke, mappedBackground);
          if (mapped && differs(stroke, mapped)) {
            attributes.push('data-nocturne-stroke');
            properties['--nocturne-stroke'] = toCssColor(mapped);
          }
        }
      }

      const accent = parseColor(style.accentColor);
      if (accent) {
        const mapped = this.cachedMap('accent', accent, mappedBackground);
        if (mapped && differs(accent, mapped)) {
          attributes.push('data-nocturne-accent');
          properties['--nocturne-item-accent'] = toCssColor(mapped);
        }
      }

      if (shouldInspectPseudo(element, force)) {
        for (const pseudo of PSEUDO_NAMES) {
          this.processPseudo(element, pseudo, mappedBackground, attributes, properties);
        }
      }

      this.setStyles(element, Array.from(new Set(attributes)), properties);
      this.metadata.set(element, {
        sourceBackground,
        mappedBackground
      });
      this.stats.processed += 1;
    }

    cacheSnapshot() {
      return {
        maps: this.maps,
        dirty: this.cacheDirty
      };
    }

    diagnostics() {
      return {
        ...this.stats,
        activeMs: Math.round(performance.now() - this.stats.startedAt),
        pending: this.queue.length,
        urgentPending: this.urgentElements.size,
        roots: this.roots.size
      };
    }

    stop() {
      this.stopped = true;
      for (const type of INTERACTION_EVENTS) {
        document.removeEventListener(type, this.onInteractiveState, true);
      }
      clearTimeout(this.interactionSettleTimer);
      clearTimeout(this.interactionLateTimer);
      if (this.interactionFrame != null) cancelFrame(this.interactionFrame);
      if (this.urgentFrame != null) cancelFrame(this.urgentFrame);
      this.interactionImmediate.clear();
      this.interactionSettle.clear();
      this.interactionLate.clear();
      for (const timer of this.interactionLocks.values()) clearTimeout(timer);
      this.interactionLocks.clear();
      this.urgentElements.clear();
      if (this.intersectionObserver) this.intersectionObserver.disconnect();
      for (const observer of this.observers) observer.disconnect();
      this.observers.clear();
      for (const handle of this.idleHandles) cancelIdle(handle);
      this.idleHandles.clear();
      this.queue.length = 0;

      const selector = CLEANUP_DATA_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(', ');
      for (const rootNode of this.roots) {
        const scope = rootNode instanceof Document ? rootNode : rootNode;
        if (scope.querySelectorAll) {
          for (const element of scope.querySelectorAll(selector)) this.resetElement(element);
        }
      }
      if (document.documentElement) this.resetElement(document.documentElement);
      if (document.body) this.resetElement(document.body);
      for (const style of this.shadowStyles.values()) style.remove();
      this.shadowStyles.clear();
      this.roots.clear();
      this.registeredElements = new WeakSet();
    }
  }

  return { DynamicEngine };
});
