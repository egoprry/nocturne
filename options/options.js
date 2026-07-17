(function optionsMain(N) {
  'use strict';

  const $ = (selector, scope) => (scope || document).querySelector(selector);
  const $$ = (selector, scope) => Array.from((scope || document).querySelectorAll(selector));

  const sectionMeta = {
    appearance: ['Appearance', 'Choose how pages are remapped and tune the global palette.'],
    automation: ['Automation', 'Follow the system, use fixed hours, or calculate sunset locally.'],
    sites: ['Site rules', 'Override rendering, colors, paths, and CSS for specific websites.'],
    advanced: ['Advanced', 'Tune compatibility, protection, detection, and processing budgets.'],
    data: ['Data & privacy', 'Manage local caches, backups, diagnostics, and privacy controls.']
  };

  const presets = {
    neutral: { background: '#121419', text: '#e7e9ee', accent: '#8ab4f8', selection: '#365b86', darkness: 72, brightness: 100, contrast: 100, saturation: 92, sepia: 0 },
    oled: { background: '#050607', text: '#eceff4', accent: '#86adff', selection: '#294b77', darkness: 100, brightness: 98, contrast: 108, saturation: 90, sepia: 0 },
    warm: { background: '#181411', text: '#eee3d4', accent: '#e0a46c', selection: '#61452f', darkness: 65, brightness: 98, contrast: 96, saturation: 82, sepia: 38 },
    cool: { background: '#10151b', text: '#e2eaf2', accent: '#73c7d9', selection: '#285260', darkness: 75, brightness: 101, contrast: 102, saturation: 88, sepia: 0 }
  };

  let settings = N.normalizeSettings({});
  let saveTimer = null;
  let toastTimer = null;
  let activeSection = 'appearance';

  function getPath(object, path) {
    return String(path).split('.').reduce((value, key) => value == null ? undefined : value[key], object);
  }

  function setPath(object, path, value) {
    const parts = String(path).split('.');
    let current = object;
    for (let index = 0; index < parts.length - 1; index += 1) {
      if (!current[parts[index]] || typeof current[parts[index]] !== 'object') current[parts[index]] = {};
      current = current[parts[index]];
    }
    current[parts[parts.length - 1]] = value;
  }

  function saveState(kind, text) {
    const element = $('#saveState');
    element.className = `save-state${kind ? ` ${kind}` : ''}`;
    element.lastChild.textContent = text;
  }

  function queueSave(delay) {
    clearTimeout(saveTimer);
    saveState('saving', 'Saving…');
    saveTimer = setTimeout(async () => {
      try {
        settings = await N.saveSettings(settings);
        saveState('', 'Saved');
        $('#ruleCount').textContent = String(settings.rules.length);
      } catch (error) {
        saveState('error', 'Could not save');
        showToast(error.message || String(error));
      }
    }, delay == null ? 180 : delay);
  }

  function showToast(message) {
    const toast = $('#toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
  }

  function inputValue(input) {
    if (input.type === 'checkbox') return input.checked;
    if (input.type === 'number' || input.type === 'range') {
      if (input.value === '') return null;
      return Number(input.value);
    }
    return input.value;
  }

  function formatOutput(input, value) {
    const suffix = input.dataset.suffix || '';
    const numeric = Number(value);
    if (input.step && input.step.includes('.')) return `${numeric.toFixed(1)}${suffix}`;
    return `${Math.round(numeric)}${suffix}`;
  }

  function populateControls() {
    for (const input of $$('[data-path]')) {
      const value = getPath(settings, input.dataset.path);
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else input.value = value == null ? '' : value;
      const output = $(`[data-output="${input.dataset.path}"]`);
      if (output && value != null) output.value = formatOutput(input, value);
    }
    for (const label of $$('[data-color-label]')) {
      label.textContent = getPath(settings, label.dataset.colorLabel);
    }
    for (const button of $$('#defaultMode [data-value]')) {
      button.classList.toggle('active', button.dataset.value === settings.defaultMode);
    }
    for (const button of $$('#scheduleMode [data-value]')) {
      button.classList.toggle('active', button.dataset.value === settings.schedule.mode);
    }
    updateScheduleVisibility();
    updatePreview();
    renderRules();
  }

  function updatePreview() {
    const appearance = settings.appearance;
    const palette = N.themePalette(appearance);
    const preview = $('#themePreview');
    preview.style.setProperty('--preview-bg', palette.background);
    preview.style.setProperty('--preview-text', palette.text);
    preview.style.setProperty('--preview-accent', palette.accent);
    preview.style.setProperty('--preview-muted', palette.muted);
    preview.style.setProperty('--preview-raised', palette.raised);
    preview.style.setProperty('--preview-border', palette.border);
    const media = $('.preview-media', preview);
    media.style.filter = appearance.dimMedia > 0 ? `brightness(${1 - appearance.dimMedia / 100})` : 'none';

    for (const label of $$('[data-color-label]')) {
      label.textContent = getPath(settings, label.dataset.colorLabel);
    }
  }

  function updateScheduleVisibility() {
    $('#customScheduleCard').classList.toggle('visible', settings.schedule.mode === 'custom');
    $('#sunScheduleCard').classList.toggle('visible', settings.schedule.mode === 'sun');
    updateSunSummary();
  }

  function updateSunSummary() {
    const summary = $('#sunSummary');
    const schedule = settings.schedule;
    const sun = N.getSunTimes(new Date(), schedule.latitude, schedule.longitude);
    if (!sun) {
      summary.textContent = 'Enter coordinates';
      return;
    }
    if (sun.polarState === 'day') {
      summary.textContent = 'Polar daylight';
      return;
    }
    if (sun.polarState === 'night') {
      summary.textContent = 'Polar night';
      return;
    }
    const sunrise = new Date(sun.sunrise.getTime() + schedule.sunriseOffset * 60000);
    const sunset = new Date(sun.sunset.getTime() + schedule.sunsetOffset * 60000);
    summary.textContent = `${N.formatLocalTime(sunset)} → ${N.formatLocalTime(sunrise)}`;
  }

  function makeField(labelText, control) {
    const label = document.createElement('label');
    label.className = 'field';
    const span = document.createElement('span');
    span.textContent = labelText;
    label.append(span, control);
    return label;
  }

  function makeSelect(options, value) {
    const select = document.createElement('select');
    for (const [optionValue, label] of options) {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = label;
      select.appendChild(option);
    }
    select.value = value;
    return select;
  }

  function updateRule(rule, callback, delay) {
    callback(rule);
    rule.updatedAt = Date.now();
    queueSave(delay);
    $('#ruleCount').textContent = String(settings.rules.length);
  }

  function ruleAppearanceControl(rule, key, labelText, type, min, max) {
    const wrapper = document.createElement('label');
    wrapper.className = 'rule-color';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = Object.prototype.hasOwnProperty.call(rule.appearance, key);
    const input = document.createElement('input');
    input.type = type;
    if (type === 'range') {
      input.min = min;
      input.max = max;
      input.step = '1';
    }
    input.value = toggle.checked ? rule.appearance[key] : settings.appearance[key];
    input.disabled = !toggle.checked;
    const span = document.createElement('span');
    span.textContent = labelText;

    toggle.addEventListener('change', () => {
      updateRule(rule, () => {
        if (toggle.checked) rule.appearance[key] = type === 'range' ? Number(input.value) : input.value;
        else delete rule.appearance[key];
        input.disabled = !toggle.checked;
      });
    });
    input.addEventListener('input', () => {
      if (!toggle.checked) return;
      updateRule(rule, () => {
        rule.appearance[key] = type === 'range' ? Number(input.value) : input.value;
        if (type === 'range') span.textContent = `${labelText}: ${input.value}`;
      });
    });
    if (type === 'range') span.textContent = `${labelText}${toggle.checked ? `: ${input.value}` : ''}`;
    wrapper.append(toggle, input, span);
    return wrapper;
  }

  function createRuleCard(rule) {
    const card = document.createElement('article');
    card.className = 'rule-card';
    card.dataset.ruleId = rule.id;

    const main = document.createElement('div');
    main.className = 'rule-main';

    const patternInput = document.createElement('input');
    patternInput.type = 'text';
    patternInput.value = rule.pattern;
    patternInput.autocomplete = 'off';
    const patternField = makeField('URL pattern', patternInput);
    const validation = document.createElement('div');
    validation.className = 'rule-validation';
    patternField.appendChild(validation);

    patternInput.addEventListener('input', () => {
      const result = N.validatePattern(patternInput.value);
      validation.textContent = result.valid ? '' : result.error;
      updateRule(rule, () => { rule.pattern = patternInput.value; }, 320);
    });
    patternInput.addEventListener('blur', () => {
      const result = N.validatePattern(patternInput.value);
      if (result.valid) {
        patternInput.value = result.normalized;
        updateRule(rule, () => { rule.pattern = result.normalized; });
      }
    });

    const stateValue = rule.enabled === null ? 'inherit' : rule.enabled ? 'on' : 'off';
    const stateSelect = makeSelect([['inherit', 'Inherit'], ['on', 'On'], ['off', 'Off']], stateValue);
    stateSelect.addEventListener('change', () => updateRule(rule, () => {
      rule.enabled = stateSelect.value === 'inherit' ? null : stateSelect.value === 'on';
    }));

    const modeSelect = makeSelect([['inherit', 'Inherit'], ['dynamic', 'Dynamic'], ['static', 'Static'], ['filter', 'Filter']], rule.mode);
    modeSelect.addEventListener('change', () => updateRule(rule, () => { rule.mode = modeSelect.value; }));

    const nativeValue = rule.respectNativeDark === null ? 'inherit' : rule.respectNativeDark ? 'respect' : 'force';
    const nativeSelect = makeSelect([['inherit', 'Inherit'], ['respect', 'Respect native'], ['force', 'Force theme']], nativeValue);
    nativeSelect.addEventListener('change', () => updateRule(rule, () => {
      rule.respectNativeDark = nativeSelect.value === 'inherit' ? null : nativeSelect.value === 'respect';
    }));

    const remove = document.createElement('button');
    remove.className = 'rule-remove';
    remove.type = 'button';
    remove.title = 'Delete rule';
    remove.setAttribute('aria-label', `Delete rule ${rule.pattern}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      settings.rules = settings.rules.filter((item) => item.id !== rule.id);
      queueSave();
      renderRules();
      showToast('Site rule removed.');
    });

    main.append(patternField, makeField('State', stateSelect), makeField('Mode', modeSelect), makeField('Native theme', nativeSelect), remove);

    const expand = document.createElement('button');
    expand.className = 'rule-expand';
    expand.type = 'button';
    expand.setAttribute('aria-expanded', 'false');
    expand.innerHTML = '<span>Per-site colors and custom CSS</span><span>⌄</span>';

    const advanced = document.createElement('div');
    advanced.className = 'rule-advanced';
    advanced.hidden = true;
    const appearanceGrid = document.createElement('div');
    appearanceGrid.className = 'rule-advanced-grid';
    appearanceGrid.append(
      ruleAppearanceControl(rule, 'background', 'Background', 'color'),
      ruleAppearanceControl(rule, 'text', 'Text', 'color'),
      ruleAppearanceControl(rule, 'accent', 'Accent', 'color'),
      ruleAppearanceControl(rule, 'darkness', 'Darkness', 'range', 0, 100),
      ruleAppearanceControl(rule, 'brightness', 'Brightness', 'range', 70, 130),
      ruleAppearanceControl(rule, 'sepia', 'Warmth', 'range', 0, 100)
    );

    const css = document.createElement('textarea');
    css.className = 'rule-css';
    css.spellcheck = false;
    css.placeholder = '/* CSS applied only to this pattern */';
    css.value = rule.customCSS || '';
    css.addEventListener('input', () => updateRule(rule, () => { rule.customCSS = css.value; }, 400));
    advanced.append(appearanceGrid, css);

    expand.addEventListener('click', () => {
      const open = expand.getAttribute('aria-expanded') === 'true';
      expand.setAttribute('aria-expanded', String(!open));
      advanced.hidden = open;
    });

    card.append(main, expand, advanced);
    return card;
  }

  function renderRules() {
    const list = $('#rulesList');
    const empty = $('#emptyRules');
    const query = ($('#ruleSearch').value || '').trim().toLowerCase();
    const filtered = settings.rules.filter((rule) => !query || rule.pattern.toLowerCase().includes(query));
    list.replaceChildren(...filtered.map(createRuleCard));
    empty.hidden = settings.rules.length !== 0;
    list.hidden = filtered.length === 0;
    $('#ruleCount').textContent = String(settings.rules.length);
  }

  async function refreshDataPanel() {
    const [cache, log] = await Promise.all([N.getCacheStats(), N.getIssueLog()]);
    $('#cacheSites').textContent = `${cache.sites} site${cache.sites === 1 ? '' : 's'}`;
    $('#cacheBytes').textContent = `${Math.max(0, cache.bytes / 1024).toFixed(cache.bytes > 10240 ? 0 : 1)} KB stored locally`;

    const logContainer = $('#issueLog');
    logContainer.replaceChildren(...log.map((item) => {
      const row = document.createElement('div');
      row.className = 'issue-item';
      const origin = document.createElement('strong');
      origin.textContent = item.origin || 'Unknown site';
      const transition = document.createElement('span');
      transition.textContent = `${item.previousMode || 'unknown'} → ${item.nextMode || 'unknown'}`;
      const time = document.createElement('time');
      time.dateTime = new Date(item.timestamp).toISOString();
      time.textContent = new Date(item.timestamp).toLocaleString();
      row.append(origin, transition, time);
      return row;
    }));
    $('#emptyIssueLog').hidden = log.length > 0;
  }

  function switchSection(name) {
    activeSection = name;
    for (const button of $$('.nav-item')) button.classList.toggle('active', button.dataset.section === name);
    for (const panel of $$('.settings-section')) panel.classList.toggle('active', panel.dataset.panel === name);
    const [title, description] = sectionMeta[name];
    $('#pageTitle').textContent = title;
    $('#pageDescription').textContent = description;
    history.replaceState(null, '', `#${name}`);
    if (name === 'data') refreshDataPanel();
  }

  function bindGenericControls() {
    for (const input of $$('[data-path]')) {
      const eventName = ['checkbox', 'select-one', 'time'].includes(input.type) ? 'change' : 'input';
      input.addEventListener(eventName, () => {
        const value = inputValue(input);
        setPath(settings, input.dataset.path, value);
        const output = $(`[data-output="${input.dataset.path}"]`);
        if (output && value != null) output.value = formatOutput(input, value);
        if (input.dataset.path.startsWith('appearance.')) updatePreview();
        if (input.dataset.path.startsWith('schedule.')) updateScheduleVisibility();
        queueSave(input.tagName === 'TEXTAREA' ? 400 : 180);
      });
    }
  }

  function bindEvents() {
    for (const button of $$('.nav-item')) button.addEventListener('click', () => switchSection(button.dataset.section));

    $('#defaultMode').addEventListener('click', (event) => {
      const button = event.target.closest('[data-value]');
      if (!button) return;
      settings.defaultMode = button.dataset.value;
      for (const candidate of $$('#defaultMode [data-value]')) candidate.classList.toggle('active', candidate === button);
      queueSave();
    });

    $('#scheduleMode').addEventListener('click', (event) => {
      const button = event.target.closest('[data-value]');
      if (!button) return;
      settings.schedule.mode = button.dataset.value;
      for (const candidate of $$('#scheduleMode [data-value]')) candidate.classList.toggle('active', candidate === button);
      updateScheduleVisibility();
      queueSave();
    });

    $('#presets').addEventListener('click', (event) => {
      const button = event.target.closest('[data-preset]');
      if (!button) return;
      Object.assign(settings.appearance, presets[button.dataset.preset]);
      populateControls();
      queueSave();
      showToast(`${button.textContent} palette applied.`);
    });

    $('#addRuleForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const result = N.validatePattern($('#newRulePattern').value);
      const error = $('#ruleFormError');
      if (!result.valid) {
        error.textContent = result.error;
        error.hidden = false;
        return;
      }
      if (settings.rules.some((rule) => N.normalizePatternInput(rule.pattern) === result.normalized)) {
        error.textContent = 'A rule for this exact pattern already exists.';
        error.hidden = false;
        return;
      }
      error.hidden = true;
      const state = $('#newRuleState').value;
      settings.rules.push(N.normalizeRule({
        id: N.makeId('rule'),
        pattern: result.normalized,
        enabled: state === 'inherit' ? null : state === 'on',
        mode: $('#newRuleMode').value,
        respectNativeDark: null,
        appearance: {},
        customCSS: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }, settings.rules.length));
      $('#newRulePattern').value = '';
      $('#newRuleState').value = 'inherit';
      $('#newRuleMode').value = 'inherit';
      queueSave();
      renderRules();
      showToast('Site rule added.');
    });

    $('#ruleSearch').addEventListener('input', renderRules);

    $('#clearCache').addEventListener('click', async () => {
      const count = await N.clearPaletteCache();
      await refreshDataPanel();
      showToast(`Cleared ${count} cached palette${count === 1 ? '' : 's'}.`);
    });

    $('#exportSettings').addEventListener('click', async () => {
      const bundle = await N.exportSettingsBundle({ includeDiagnostics: true });
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `nocturne-settings-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Settings exported.');
    });

    $('#importSettings').addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error('The selected file is too large.');
        const bundle = JSON.parse(await file.text());
        settings = await N.importSettingsBundle(bundle);
        populateControls();
        showToast('Settings imported.');
      } catch (error) {
        showToast(error.message || 'Could not import this file.');
      } finally {
        event.target.value = '';
      }
    });

    $('#resetSettings').addEventListener('click', async () => {
      if (!confirm('Reset all Nocturne settings, site rules, and custom CSS?')) return;
      settings = await N.saveSettings(N.deepClone(N.DEFAULT_SETTINGS));
      await N.clearPaletteCache();
      await N.clearIssueLog();
      populateControls();
      await refreshDataPanel();
      showToast('Nocturne was reset to defaults.');
    });

    $('#clearIssueLog').addEventListener('click', async () => {
      await N.clearIssueLog();
      await refreshDataPanel();
      showToast('Compatibility log cleared.');
    });
  }

  async function init() {
    settings = await N.getSettings();
    bindGenericControls();
    bindEvents();
    populateControls();
    const requested = location.hash.slice(1);
    switchSection(sectionMeta[requested] ? requested : 'appearance');
    await refreshDataPanel();
  }

  init().catch((error) => {
    saveState('error', 'Unable to load');
    showToast(error.message || String(error));
  });
})(globalThis.Nocturne);
