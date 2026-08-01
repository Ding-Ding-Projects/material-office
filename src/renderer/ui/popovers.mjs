import { evaluateRegex, validateRegexFlags, validateRegexPattern } from '../core/regex.mjs';
import { RegexWorkerEvaluator } from '../core/regex-worker-client.mjs';
import { translateColor } from '../core/colors.mjs';
import { clamp, escapeAttribute, escapeHtml } from './helpers.mjs';

const regexEvaluator = new RegexWorkerEvaluator();
const activeLayerCleanups = new WeakMap();

const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function localized(localize, english, cantonese, facts = {}) {
  if (localize) return localize(english, cantonese, facts);
  return english.replace(/\{([A-Za-z][A-Za-z0-9_.-]*)\}/g, (token, name) => Object.hasOwn(facts, name) ? String(facts[name]) : token);
}

export function positionNearViewport(rect, width, height, viewportWidth, viewportHeight, inset = 10, gap = 8) {
  const boundedWidth = Math.max(0, Math.min(width, viewportWidth - (inset * 2)));
  const boundedHeight = Math.max(0, Math.min(height, viewportHeight - (inset * 2)));
  const maxLeft = Math.max(inset, viewportWidth - boundedWidth - inset);
  const maxTop = Math.max(inset, viewportHeight - boundedHeight - inset);
  const left = clamp(rect.left, inset, maxLeft);
  const below = rect.bottom + gap;
  const above = rect.top - boundedHeight - gap;
  const top = below <= maxTop
    ? below
    : above >= inset
      ? above
      : clamp(below, inset, maxTop);
  return { left, top };
}

function positionNear(anchor, width = 430, height = 560) {
  const rect = anchor?.getBoundingClientRect?.() ?? { left: 16, right: 16, top: 70, bottom: 70, width: 0, height: 0 };
  return positionNearViewport(rect, width, height, innerWidth, innerHeight);
}

function closeLayer(layer) {
  const cleanup = activeLayerCleanups.get(layer);
  if (cleanup) {
    activeLayerCleanups.delete(layer);
    cleanup();
  }
  layer.replaceChildren();
}

function modalFocusableElements(dialog) {
  return [...dialog.querySelectorAll(MODAL_FOCUSABLE_SELECTOR)].filter((element) => (
    !element.hidden
    && element.getAttribute('aria-hidden') !== 'true'
    && !element.closest('[hidden],[inert]')
  ));
}

export function openRegexBuilder({ layer, anchor, searchId, searchState, onChange, onClose, sample = '', localize = null }) {
  const position = positionNear(anchor);
  closeLayer(layer);
  const state = {
    mode: searchState?.mode === 'regex' ? 'regex' : 'plain',
    query: String(searchState?.query ?? ''),
    pattern: String(searchState?.pattern ?? searchState?.query ?? ''),
    flags: String(searchState?.flags ?? 'i'),
    sample: String(searchState?.sample ?? sample ?? '').slice(0, 20_000)
  };
  const root = document.createElement('section');
  root.className = 'popover regex-builder';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  root.setAttribute('aria-label', localized(localize, 'Regular expression builder for {search}', '{search} 嘅 regular expression 建立器', { search: searchId }));
  root.style.left = `${position.left}px`;
  root.style.top = `${position.top}px`;
  root.dataset.searchId = searchId;
  layer.append(root);

  const guided = [
    [localized(localize, 'Literal', '純文字'), 'literal', 'text'], [localized(localize, 'Characters', '字元'), 'class', 'A-Za-z'], [localized(localize, 'Start', '開頭'), 'anchor', '^'], [localized(localize, 'End', '結尾'), 'anchor', '$'],
    [localized(localize, 'Group', '群組'), 'group', '(text)'], [localized(localize, 'Either', '其中一個'), 'alternation', '(?:one|two)'], [localized(localize, 'One+', '一個以上'), 'quantifier', '+'], [localized(localize, 'Optional', '可選'), 'optional', '?']
  ];

  let evaluationSequence = 0;
  let evaluationTimer = null;

  async function evaluate() {
    const sequence = ++evaluationSequence;
    const validation = root.querySelector('[data-regex-validation]');
    const matches = root.querySelector('[data-regex-matches]');
    if (!validation || !matches) return;
    try {
      if (state.mode === 'regex') {
        validateRegexPattern(state.pattern);
        validateRegexFlags(state.flags);
      }
      const request = {
        mode: state.mode,
        query: state.query || state.pattern,
        pattern: state.pattern || state.query,
        flags: state.flags,
        sample: state.sample
      };
      validation.className = 'validation';
      validation.textContent = state.mode === 'regex' ? localized(localize, 'Checking in a deadline-bounded worker…', '正喺有時限嘅 worker 入面檢查…') : localized(localize, 'Checking plain text…', '正喺檢查純文字…');
      const result = state.mode === 'regex'
        ? await regexEvaluator.evaluate(request, { timeoutMs: 250 })
        : evaluateRegex(request, { maxMatches: 100 });
      if (sequence !== evaluationSequence || !root.isConnected) return;
      validation.className = 'validation';
      validation.textContent = localized(localize, '{count} match(es) · JavaScript RegExp', '{count} 個結果 · JavaScript RegExp', { count: result.matches.length });
      matches.innerHTML = result.matches.length
        ? result.matches.slice(0, 30).map((match, index) => `<div><strong>#${index + 1}</strong> [${match.index}, ${match.end}) ${escapeHtml(match.value || '∅')}${match.captures.length ? ` · captures: ${match.captures.map((capture) => escapeHtml(capture.value ?? 'undefined')).join(', ')}` : ''}</div>`).join('')
        : `<span>${escapeHtml(localized(localize, 'No matches in the sample.', '範例文字入面冇符合結果。'))}</span>`;
    } catch (error) {
      if (sequence !== evaluationSequence || !root.isConnected) return;
      validation.className = 'validation error';
      validation.textContent = error.message;
      matches.innerHTML = `<span>${escapeHtml(localized(localize, 'Fix the pattern to preview matches.', '修正 pattern 先可以預覽結果。'))}</span>`;
    }
  }

  function scheduleEvaluation() {
    clearTimeout(evaluationTimer);
    evaluationTimer = setTimeout(evaluate, 80);
  }

  function render() {
    root.innerHTML = `
      <header class="popover-header"><h2>${escapeHtml(localized(localize, 'Regular expression builder', 'Regular expression 建立器'))}</h2><button class="icon-button" type="button" data-close aria-label="${escapeAttribute(localized(localize, 'Close', '關閉'))}">×</button></header>
      <p style="margin:-4px 0 12px;color:var(--on-surface-variant);font-size:.78rem;line-height:1.45">${escapeHtml(localized(localize, 'Plain text stays the default. Regex evaluation is local, length-bounded, isolated in a worker, and terminated at its deadline.', '預設仍然係純文字。Regex 會喺本機、有長度限制同獨立 worker 入面運算，到時限就會停止。'))}</p>
      <div class="appearance-tabs" role="tablist" aria-label="${escapeAttribute(localized(localize, 'Search mode', '搜尋模式'))}"><button id="regex-mode-tab-plain" role="tab" tabindex="${state.mode === 'plain' ? '0' : '-1'}" aria-controls="regex-mode-panel" data-mode="plain" aria-selected="${state.mode === 'plain'}">${escapeHtml(localized(localize, 'Plain text', '純文字'))}</button><button id="regex-mode-tab-regex" role="tab" tabindex="${state.mode === 'regex' ? '0' : '-1'}" aria-controls="regex-mode-panel" data-mode="regex" aria-selected="${state.mode === 'regex'}">Regular expression</button></div>
      <section id="regex-mode-panel" role="tabpanel" aria-labelledby="regex-mode-tab-${state.mode}">
      <label class="field"><span>${escapeHtml(state.mode === 'plain' ? localized(localize, 'Search text', '搜尋文字') : localized(localize, 'Pattern', 'Pattern'))}</span><input data-pattern value="${escapeAttribute(state.mode === 'plain' ? state.query : state.pattern)}" spellcheck="false" autocomplete="off"></label>
      <label class="field"><span>${escapeHtml(localized(localize, 'Flags', '旗標'))}</span><input data-flags value="${escapeAttribute(state.flags)}" maxlength="8" spellcheck="false" ${state.mode === 'plain' ? 'disabled' : ''}></label>
      <div class="field"><span>${escapeHtml(localized(localize, 'Guided construction', '引導式建立'))}</span><div class="token-row">${guided.map(([label, token, value]) => `<button class="token-chip" type="button" data-token="${token}" data-value="${escapeAttribute(value)}">${escapeHtml(label)}</button>`).join('')}</div></div>
      <label class="field"><span>${escapeHtml(localized(localize, 'Sample text', '範例文字'))}</span><textarea data-sample maxlength="20000" spellcheck="false">${escapeHtml(state.sample)}</textarea></label>
      <div class="validation" data-regex-validation></div>
      <div class="match-list" data-regex-matches aria-live="polite"></div>
      <div class="dialog-actions" style="padding:14px 0 0"><button class="button-label text" type="button" data-copy>${escapeHtml(localized(localize, 'Copy pattern', '複製 pattern'))}</button><button class="button-label outlined" type="button" data-export>${escapeHtml(localized(localize, 'Export', '匯出'))}</button><button class="button-label filled" type="button" data-apply>${escapeHtml(localized(localize, 'Apply', '套用'))}</button></div></section>`;
    root.querySelector('[data-close]').addEventListener('click', () => { clearTimeout(evaluationTimer); evaluationSequence += 1; closeLayer(layer); onClose?.(); anchor?.focus?.(); });
    root.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => {
      state.mode = button.dataset.mode;
      if (state.mode === 'regex' && !state.pattern) state.pattern = state.query;
      render();
    }));
    root.querySelector('[data-pattern]').addEventListener('input', (event) => {
      if (state.mode === 'plain') state.query = event.target.value;
      else state.pattern = event.target.value;
      scheduleEvaluation();
    });
    root.querySelector('[data-flags]').addEventListener('input', (event) => { state.flags = event.target.value; scheduleEvaluation(); });
    root.querySelector('[data-sample]').addEventListener('input', (event) => { state.sample = event.target.value.slice(0, 20_000); scheduleEvaluation(); });
    root.querySelectorAll('[data-token]').forEach((button) => button.addEventListener('click', () => {
      const input = root.querySelector('[data-pattern]');
      const at = input.selectionStart ?? input.value.length;
      const snippets = { literal: button.dataset.value, class: `[${button.dataset.value}]`, anchor: button.dataset.value, group: '(text)', alternation: '(?:one|two)', quantifier: '+', optional: '?' };
      const snippet = snippets[button.dataset.token] ?? '';
      input.value = `${input.value.slice(0, at)}${snippet}${input.value.slice(input.selectionEnd ?? at)}`;
      if (state.mode === 'plain') { state.mode = 'regex'; state.pattern = input.value; } else state.pattern = input.value;
      render();
    }));
    root.querySelector('[data-copy]').addEventListener('click', () => navigator.clipboard.writeText(state.mode === 'plain' ? state.query : state.pattern));
    root.querySelector('[data-export]').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ mode: state.mode, query: state.query, pattern: state.pattern, flags: state.flags }, null, 2)], { type: 'application/json' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${searchId}-regex.json`; link.click(); URL.revokeObjectURL(link.href);
    });
    root.querySelector('[data-apply]').addEventListener('click', () => {
      onChange?.({ mode: state.mode, query: state.mode === 'plain' ? state.query : state.pattern, pattern: state.pattern, flags: state.flags, sample: state.sample, open: false });
      closeLayer(layer); anchor?.focus?.();
    });
    scheduleEvaluation();
    queueMicrotask(() => root.querySelector('[data-pattern]')?.focus());
  }
  render();
  return root;
}

export function openAppearanceEditor({ layer, anchor, targetId, current = {}, presets = {}, onApply, onSavePreset, onResetAll, onClose, localize = null }) {
  const position = positionNear(anchor, 520, 650);
  closeLayer(layer);
  const defaults = {
    color: '#1d1b20', background: '#fffbfe', borderColor: '#79747e', borderStyle: 'solid',
    fontFamily: 'Segoe UI Variable', fontSize: 16, fontWeight: 400, fontStyle: 'normal', fontVariantCaps: 'normal',
    fontVariationSettings: 'normal', textTransform: 'none', underline: 'none', strikeStyle: 'none', overline: false,
    decorationColor: '#1d1b20', letterSpacing: 0, wordSpacing: 0, lineHeight: 1.4, baseline: 'normal', baselineOffset: 0,
    textAlign: 'start', direction: 'inherit', outlineWidth: 0, outlineColor: '#1d1b20', shadowX: 0, shadowY: 2,
    shadowBlur: 0, shadowColor: '#00000066', glowBlur: 0, glowColor: '#6750a4', radius: 12, padding: 8,
    margin: 0, borderWidth: 1, opacity: 1, hoverColor: '#1d1b20', hoverBackground: '#f3edf7', focusColor: '#6750a4'
  };
  const state = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (['string', 'number', 'boolean'].includes(typeof current[key])) state[key] = current[key];
  }
  const builtInPresets = {
    'Material default': defaults,
    'High contrast': { ...defaults, color: '#ffffff', background: '#000000', borderColor: '#ffffff', outlineColor: '#ffffff', focusColor: '#ffff00' },
    'Calm document': { ...defaults, color: '#24312b', background: '#f8fbf7', borderColor: '#8c9b92', fontFamily: 'Georgia', radius: 6, lineHeight: 1.65 },
    'Midnight focus': { ...defaults, color: '#f4efff', background: '#211f26', borderColor: '#938f99', focusColor: '#d0bcff', glowColor: '#d0bcff' }
  };
  let activePanel = 'type';
  let status = localized(localize, 'Every value is local, persisted, resettable, and included in theme export.', '每個值都留喺本機、會保存、可以重設，亦會包括喺主題匯出。');
  let fontFamilies = ['Segoe UI Variable', 'Segoe UI', 'Aptos', 'Arial', 'Georgia', 'Consolas', 'Microsoft JhengHei UI'];
  const root = document.createElement('section');
  root.className = 'popover appearance-editor';
  root.dataset.appearanceId = 'appearance-editor';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  root.setAttribute('aria-label', localized(localize, 'Edit appearance for {target}', '編輯 {target} 嘅外觀', { target: targetId }));
  root.style.left = `${position.left}px`;
  root.style.top = `${position.top}px`;
  layer.append(root);

  const selected = (value, expected) => value === expected ? ' selected' : '';
  const checked = (value) => value ? ' checked' : '';
  const colorReport = (value) => {
    try { return translateColor(value, { background: state.background }); } catch { return null; }
  };
  const colorHex = (value, fallback = '#000000') => colorReport(value)?.formats?.hex ?? fallback;
  const acceptedAppearance = (candidate) => {
    const source = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
    const clean = {};
    for (const key of Object.keys(defaults)) {
      if (['string', 'number', 'boolean'].includes(typeof source[key])) clean[key] = source[key];
    }
    return clean;
  };

  function translationMarkup() {
    const report = colorReport(state.color);
    if (!report) return `<span>${escapeHtml(localized(localize, 'Enter a valid CSS color to see translations without losing the typed value.', '輸入有效 CSS 色彩就可以睇轉換結果，而且唔會丟失已輸入嘅值。'))}</span>`;
    const rows = Object.entries(report.formats ?? {}).filter(([, value]) => value !== null).slice(0, 14);
    const metadata = report.metadata ?? {};
    const contrast = report.contrast ?? {};
    return `<p class="wide appearance-status"><strong>${escapeHtml(metadata.activeColorSpace ?? 'color')}</strong> · ${escapeHtml(metadata.gamut ?? 'unknown gamut')} · alpha ${escapeHtml(String(metadata.alpha ?? 1))} · contrast ${escapeHtml(String(contrast.ratio ?? '—'))}:1${metadata.warning ? ` · ${escapeHtml(metadata.warning)}` : ''}</p>${rows.map(([space, value]) => `<button type="button" data-copy-value="${escapeAttribute(String(value))}" title="Copy ${escapeAttribute(space)}"><strong>${escapeHtml(space)}</strong><br>${escapeHtml(String(value))}</button>`).join('')}`;
  }

  function previewStyle() {
    const decorations = [state.underline !== 'none' ? 'underline' : '', state.strikeStyle !== 'none' ? 'line-through' : '', state.overline ? 'overline' : ''].filter(Boolean).join(' ');
    const shadows = [];
    if (state.shadowBlur || state.shadowX || state.shadowY) shadows.push(`${state.shadowX}px ${state.shadowY}px ${state.shadowBlur}px ${state.shadowColor}`);
    if (state.glowBlur) shadows.push(`0 0 ${state.glowBlur}px ${state.glowColor}`);
    return [
      `color:${state.color}`, `background:${state.background}`, `border:${state.borderWidth}px ${state.borderStyle} ${state.borderColor}`,
      `border-radius:${state.radius}px`, `padding:${state.padding}px`, `margin:${state.margin}px`, `opacity:${state.opacity}`,
      `font-family:${state.fontFamily}, "Microsoft JhengHei UI", sans-serif`, `font-size:${state.fontSize}px`, `font-weight:${state.fontWeight}`,
      `font-style:${state.fontStyle}`, `font-variant-caps:${state.fontVariantCaps}`, `font-variation-settings:${state.fontVariationSettings}`,
      `text-transform:${state.textTransform}`, `letter-spacing:${state.letterSpacing}px`, `word-spacing:${state.wordSpacing}px`,
      `line-height:${state.lineHeight}`, `text-align:${state.textAlign}`, `direction:${state.direction}`,
      `text-decoration-line:${decorations || 'none'}`, `text-decoration-style:${state.underline !== 'none' ? state.underline : state.strikeStyle === 'double' ? 'double' : 'solid'}`,
      `text-decoration-color:${state.decorationColor}`, `vertical-align:${state.baseline === 'normal' ? 'baseline' : state.baseline}`,
      `position:${state.baselineOffset ? 'relative' : 'static'}`, `top:${-Number(state.baselineOffset)}px`,
      `-webkit-text-stroke:${state.outlineWidth}px ${state.outlineColor}`, `text-shadow:${shadows.join(', ') || 'none'}`
    ].join(';');
  }

  function render() {
    const presetNames = [...Object.keys(builtInPresets), ...Object.keys(presets).filter((name) => !Object.hasOwn(builtInPresets, name))];
    root.innerHTML = `
      <header class="popover-header"><h2>${escapeHtml(localized(localize, 'Edit appearance…', '編輯外觀…'))}</h2><button class="icon-button" type="button" data-close aria-label="${escapeAttribute(localized(localize, 'Close appearance editor', '關閉外觀編輯器'))}">×</button></header>
      <p style="margin:-5px 0 13px;color:var(--on-surface-variant);font-size:.76rem">${escapeHtml(localized(localize, 'Target: {target}. The preview updates immediately; Apply commits the values to this exact appearance-ID element.', '目標：{target}。預覽會即時更新；「套用」會將值寫入呢個有 appearance ID 嘅指定元件。', { target: targetId }))}</p>
      <div class="appearance-controls"><label class="field"><span>${escapeHtml(localized(localize, 'Named preset', '命名預設'))}</span><select data-preset><option value="">${escapeHtml(localized(localize, 'Choose…', '選擇…'))}</option>${presetNames.map((name) => `<option value="${escapeAttribute(name)}">${escapeHtml(name)}</option>`).join('')}</select></label><label class="field"><span>${escapeHtml(localized(localize, 'Save current as', '將目前設定另存為'))}</span><span style="display:flex;gap:6px"><input data-preset-name maxlength="60" placeholder="${escapeAttribute(localized(localize, 'Theme name', '主題名稱'))}"><button class="button-label tonal" type="button" data-save-preset>${escapeHtml(localized(localize, 'Save', '儲存'))}</button></span></label></div>
      <div class="appearance-tabs" role="tablist" aria-label="${escapeAttribute(localized(localize, 'Appearance editor sections', '外觀編輯器分類'))}">${[['type', localized(localize, 'Type', '字款')], ['color', localized(localize, 'Color', '色彩')], ['shape', localized(localize, 'Shape', '形狀')], ['states', localized(localize, 'States', '狀態')]].map(([id, label]) => `<button id="appearance-tab-${id}" type="button" role="tab" tabindex="${activePanel === id ? '0' : '-1'}" aria-controls="appearance-panel-${id}" data-panel-tab="${id}" aria-selected="${activePanel === id}">${escapeHtml(label)}</button>`).join('')}</div>

      <section id="appearance-panel-type" class="appearance-panel appearance-controls" role="tabpanel" aria-labelledby="appearance-tab-type" data-panel="type"${activePanel === 'type' ? '' : ' hidden'}>
        <label class="field wide"><span>Installed or bundled font family</span><span style="display:flex;gap:6px"><input data-key="fontFamily" value="${escapeAttribute(state.fontFamily)}" list="appearance-fonts"><button class="button-label tonal" type="button" data-load-fonts>Load installed</button></span></label>
        <datalist id="appearance-fonts">${fontFamilies.map((font) => `<option value="${escapeAttribute(font)}">${escapeHtml(font)}</option>`).join('')}</datalist>
        <label class="field"><span>Font size (free entry)</span><input type="number" min="6" max="144" step=".5" data-key="fontSize" value="${state.fontSize}"></label>
        <label class="field"><span>Font weight</span><input type="number" min="100" max="1000" step="1" data-key="fontWeight" value="${state.fontWeight}"></label>
        <label class="field"><span>Style</span><select data-key="fontStyle"><option${selected(state.fontStyle, 'normal')}>normal</option><option${selected(state.fontStyle, 'italic')}>italic</option><option${selected(state.fontStyle, 'oblique')}>oblique</option></select></label>
        <label class="field"><span>Variable-font axes</span><input data-key="fontVariationSettings" maxlength="128" value="${escapeAttribute(state.fontVariationSettings)}" placeholder='"wght" 550, "wdth" 100'></label>
        <label class="field"><span>Underline</span><select data-key="underline"><option${selected(state.underline, 'none')}>none</option><option${selected(state.underline, 'solid')}>solid</option><option${selected(state.underline, 'double')}>double</option><option${selected(state.underline, 'dotted')}>dotted</option><option${selected(state.underline, 'dashed')}>dashed</option><option${selected(state.underline, 'wavy')}>wavy</option></select></label>
        <label class="field"><span>Strikethrough</span><select data-key="strikeStyle"><option${selected(state.strikeStyle, 'none')}>none</option><option${selected(state.strikeStyle, 'single')}>single</option><option${selected(state.strikeStyle, 'double')}>double</option></select></label>
        <label class="field"><span>Capitalization</span><select data-key="textTransform"><option${selected(state.textTransform, 'none')}>none</option><option${selected(state.textTransform, 'uppercase')}>uppercase</option><option${selected(state.textTransform, 'lowercase')}>lowercase</option><option${selected(state.textTransform, 'capitalize')}>capitalize</option></select></label>
        <label class="field"><span>Small caps</span><select data-key="fontVariantCaps"><option${selected(state.fontVariantCaps, 'normal')}>normal</option><option${selected(state.fontVariantCaps, 'small-caps')}>small-caps</option><option${selected(state.fontVariantCaps, 'all-small-caps')}>all-small-caps</option></select></label>
        <label class="field"><span>Baseline</span><select data-key="baseline"><option${selected(state.baseline, 'normal')}>normal</option><option${selected(state.baseline, 'super')}>super</option><option${selected(state.baseline, 'sub')}>sub</option></select></label>
        <label class="field"><span>Baseline offset (px)</span><input type="number" min="-64" max="64" step=".5" data-key="baselineOffset" value="${state.baselineOffset}"></label>
        <label class="field"><span>Text alignment</span><select data-key="textAlign"><option${selected(state.textAlign, 'start')}>start</option><option${selected(state.textAlign, 'left')}>left</option><option${selected(state.textAlign, 'center')}>center</option><option${selected(state.textAlign, 'right')}>right</option><option${selected(state.textAlign, 'justify')}>justify</option><option${selected(state.textAlign, 'end')}>end</option></select></label>
        <label class="field"><span>Text direction</span><select data-key="direction"><option${selected(state.direction, 'inherit')}>inherit</option><option${selected(state.direction, 'ltr')}>ltr</option><option${selected(state.direction, 'rtl')}>rtl</option></select></label>
        <label class="field"><span>Letter spacing (px)</span><input type="number" min="-4" max="20" step=".1" data-key="letterSpacing" value="${state.letterSpacing}"></label>
        <label class="field"><span>Word spacing (px)</span><input type="number" min="-8" max="48" step=".1" data-key="wordSpacing" value="${state.wordSpacing}"></label>
        <label class="field"><span>Line height</span><input type="number" min=".5" max="4" step=".05" data-key="lineHeight" value="${state.lineHeight}"></label>
        <label class="field"><span>Overline</span><input type="checkbox" data-key="overline"${checked(state.overline)}></label>
        <label class="field"><span>Outline width (px)</span><input type="number" min="0" max="8" step=".25" data-key="outlineWidth" value="${state.outlineWidth}"></label>
        <label class="field"><span>Shadow X / Y / blur</span><span style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px"><input type="number" min="-40" max="40" data-key="shadowX" value="${state.shadowX}" aria-label="Shadow horizontal offset"><input type="number" min="-40" max="40" data-key="shadowY" value="${state.shadowY}" aria-label="Shadow vertical offset"><input type="number" min="0" max="80" data-key="shadowBlur" value="${state.shadowBlur}" aria-label="Shadow blur"></span></label>
        <label class="field"><span>Glow blur (px)</span><input type="number" min="0" max="80" data-key="glowBlur" value="${state.glowBlur}"></label>
      </section>

      <section id="appearance-panel-color" class="appearance-panel" role="tabpanel" aria-labelledby="appearance-tab-color" data-panel="color"${activePanel === 'color' ? '' : ' hidden'}>
        <div class="color-field" aria-label="Continuous text color field"><input type="color" data-key="color" value="${escapeAttribute(colorHex(state.color, '#1d1b20'))}" aria-label="Choose text color continuously"></div>
        <div class="appearance-controls"><label class="field wide"><span>Text color — named, HEX/HEX8, RGB/RGBA, HSL/HSLA, HSV/HSB, HWB, Lab/LCH, OKLab/OKLCH, or CMYK</span><input data-key="color" value="${escapeAttribute(state.color)}"></label><label class="field"><span>Background</span><input data-key="background" value="${escapeAttribute(state.background)}"></label><label class="field"><span>Decoration color</span><input data-key="decorationColor" value="${escapeAttribute(state.decorationColor)}"></label><label class="field"><span>Outline color</span><input data-key="outlineColor" value="${escapeAttribute(state.outlineColor)}"></label><label class="field"><span>Shadow color</span><input data-key="shadowColor" value="${escapeAttribute(state.shadowColor)}"></label><label class="field"><span>Glow color</span><input data-key="glowColor" value="${escapeAttribute(state.glowColor)}"></label></div>
        <div class="color-translations" data-color-translations>${translationMarkup()}</div>
      </section>

      <section id="appearance-panel-shape" class="appearance-panel appearance-controls" role="tabpanel" aria-labelledby="appearance-tab-shape" data-panel="shape"${activePanel === 'shape' ? '' : ' hidden'}>
        <label class="field"><span>Corner radius (px)</span><input type="number" min="0" max="999" data-key="radius" value="${state.radius}"></label>
        <label class="field"><span>Padding (px)</span><input type="number" min="0" max="96" data-key="padding" value="${state.padding}"></label>
        <label class="field"><span>Margin (px)</span><input type="number" min="0" max="96" data-key="margin" value="${state.margin}"></label>
        <label class="field"><span>Border width (px)</span><input type="number" min="0" max="24" step=".5" data-key="borderWidth" value="${state.borderWidth}"></label>
        <label class="field"><span>Border style</span><select data-key="borderStyle"><option${selected(state.borderStyle, 'none')}>none</option><option${selected(state.borderStyle, 'solid')}>solid</option><option${selected(state.borderStyle, 'double')}>double</option><option${selected(state.borderStyle, 'dotted')}>dotted</option><option${selected(state.borderStyle, 'dashed')}>dashed</option></select></label>
        <label class="field"><span>Border color</span><input data-key="borderColor" value="${escapeAttribute(state.borderColor)}"></label>
        <label class="field wide"><span>Opacity ${state.opacity}</span><input type="range" min="0.1" max="1" step=".05" data-key="opacity" value="${state.opacity}"></label>
      </section>

      <section id="appearance-panel-states" class="appearance-panel appearance-controls" role="tabpanel" aria-labelledby="appearance-tab-states" data-panel="states"${activePanel === 'states' ? '' : ' hidden'}>
        <label class="field"><span>Hover text color</span><input data-key="hoverColor" value="${escapeAttribute(state.hoverColor)}"></label>
        <label class="field"><span>Hover background</span><input data-key="hoverBackground" value="${escapeAttribute(state.hoverBackground)}"></label>
        <label class="field"><span>Focus outline color</span><input data-key="focusColor" value="${escapeAttribute(state.focusColor)}"></label>
        <p class="wide appearance-status">Hover and keyboard-focus values are stored per target and applied through scoped state tokens. Unsupported font effects remain visible and preserved instead of silently disappearing.</p>
        <button class="button-label text" type="button" data-reset>${escapeHtml(localized(localize, 'Reset this element', '重設呢個元件'))}</button><button class="button-label outlined" type="button" data-reset-all>${escapeHtml(localized(localize, 'Global appearance reset', '重設全域外觀'))}</button>
      </section>

      <div class="appearance-preview" data-appearance-preview style="${escapeAttribute(previewStyle())}">Material Office live preview · 物料辦公室 · Aa 123</div>
      <p class="appearance-status" data-appearance-status aria-live="polite">${escapeHtml(status)}</p>
      <details><summary>Platform capability notes</summary><p style="font-size:.75rem;line-height:1.45;color:var(--on-surface-variant)">Chromium applies Word-depth typography where CSS and the selected font support it. A requested variable axis or effect that the platform cannot render remains in the exported and persisted schema, with no silent value loss.</p></details>
      <input type="file" accept="application/json,.json" data-import-file hidden>
      <div class="dialog-actions" style="padding:14px 0 0;flex-wrap:wrap"><button class="button-label text" type="button" data-import>${escapeHtml(localized(localize, 'Import theme', '匯入主題'))}</button><button class="button-label outlined" type="button" data-export>${escapeHtml(localized(localize, 'Export theme', '匯出主題'))}</button><button class="button-label filled" type="button" data-apply>${escapeHtml(localized(localize, 'Apply', '套用'))}</button></div>`;

    const updatePreview = () => {
      const preview = root.querySelector('[data-appearance-preview]');
      if (preview) preview.setAttribute('style', previewStyle());
      const translations = root.querySelector('[data-color-translations]');
      if (translations) translations.innerHTML = translationMarkup();
      const statusNode = root.querySelector('[data-appearance-status]');
      if (statusNode) statusNode.textContent = status;
    };

    root.querySelector('[data-close]').addEventListener('click', () => { closeLayer(layer); onClose?.(); anchor?.focus?.(); });
    root.querySelectorAll('[data-panel-tab]').forEach((button) => button.addEventListener('click', () => {
      activePanel = button.dataset.panelTab;
      root.querySelectorAll('[data-panel-tab]').forEach((tab) => { tab.setAttribute('aria-selected', String(tab === button)); tab.tabIndex = tab === button ? 0 : -1; });
      root.querySelectorAll('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== activePanel; });
    }));
    root.querySelectorAll('[data-key]').forEach((control) => control.addEventListener('input', () => {
      const key = control.dataset.key;
      state[key] = control.type === 'number' || control.type === 'range' ? Number(control.value) : control.type === 'checkbox' ? control.checked : control.value;
      for (const peer of root.querySelectorAll(`[data-key="${CSS.escape(key)}"]`)) {
        if (peer === control) continue;
        if (peer.type === 'color') peer.value = colorHex(state[key], peer.value);
        else if (peer.type !== 'checkbox') peer.value = String(state[key]);
      }
      status = localized(localize, '{key} updated in the live preview.', '即時預覽已更新 {key}。', { key });
      updatePreview();
    }));
    root.addEventListener('click', async (event) => {
      const copy = event.target.closest('[data-copy-value]');
      if (copy) { await navigator.clipboard.writeText(copy.dataset.copyValue); status = localized(localize, 'Color representation copied.', '已複製色彩表示方式。'); updatePreview(); return; }
      if (event.target.closest('[data-load-fonts]')) {
        try {
          if (typeof window.queryLocalFonts !== 'function') throw new Error('Installed-font enumeration is not exposed by this Windows runtime. Free font-family entry remains available.');
          const fonts = await window.queryLocalFonts();
          fontFamilies = [...new Set(fonts.flatMap((font) => [font.family, font.fullName]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
          status = localized(localize, '{count} installed font names loaded locally.', '已喺本機載入 {count} 個已安裝字型名稱。', { count: fontFamilies.length });
          render();
        } catch (error) { status = error.message; updatePreview(); }
        return;
      }
      if (event.target.closest('[data-save-preset]')) {
        const name = root.querySelector('[data-preset-name]').value.trim();
        if (!name) { status = localized(localize, 'Enter a preset name before saving.', '儲存之前請輸入預設名稱。'); updatePreview(); return; }
        onSavePreset?.(name.slice(0, 60), { ...state });
        presets[name.slice(0, 60)] = { ...state };
        status = localized(localize, 'Preset “{name}” saved.', '已儲存預設「{name}」。', { name: name.slice(0, 60) });
        render();
        return;
      }
      if (event.target.closest('[data-import]')) { root.querySelector('[data-import-file]').click(); return; }
      if (event.target.closest('[data-export]')) {
        const blob = new Blob([JSON.stringify({ schemaVersion: 1, targetId, appearance: state }, null, 2)], { type: 'application/json' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'material-office-appearance.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0); return;
      }
      if (event.target.closest('[data-reset]')) { onApply?.(targetId, null); closeLayer(layer); anchor?.focus?.(); return; }
      if (event.target.closest('[data-reset-all]')) { onResetAll?.(); closeLayer(layer); anchor?.focus?.(); return; }
      if (event.target.closest('[data-apply]')) { onApply?.(targetId, { ...state }); closeLayer(layer); anchor?.focus?.(); }
    });
    root.querySelector('[data-preset]').addEventListener('change', (event) => {
      const candidate = builtInPresets[event.target.value] ?? presets[event.target.value];
      if (!candidate) return;
      Object.assign(state, defaults, acceptedAppearance(candidate));
      status = localized(localize, 'Preset “{name}” loaded into the preview.', '已將預設「{name}」載入預覽。', { name: event.target.value });
      render();
    });
    root.querySelector('[data-import-file]').addEventListener('change', async (event) => {
      try {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 64 * 1024) throw new Error('Theme files are limited to 64 KiB.');
        const imported = JSON.parse(await file.text());
        if (imported?.schemaVersion !== 1 || !imported?.appearance) throw new Error('This is not a Material Office appearance theme.');
        Object.assign(state, defaults, acceptedAppearance(imported.appearance));
        status = localized(localize, '{name} imported into the live preview.', '已將 {name} 匯入即時預覽。', { name: file.name });
        render();
      } catch (error) { status = localized(localize, 'Theme import failed: {reason}', '主題匯入失敗：{reason}', { reason: error.message }); updatePreview(); }
    });
  }

  render();
  return root;
}

export function openContextMenu({ layer, x, y, items, label = 'Context menu', onClose }) {
  closeLayer(layer);
  const root = document.createElement('div'); root.className = 'context-menu'; root.setAttribute('role', 'menu'); root.setAttribute('aria-label', label);
  root.style.left = `${clamp(x, 8, innerWidth - 260)}px`; root.style.top = `${clamp(y, 8, innerHeight - Math.min(460, items.length * 42 + 20))}px`;
  root.innerHTML = `<label class="context-menu-search"><span aria-hidden="true">⌕</span><input type="search" data-context-menu-search placeholder="Search menu" aria-label="Search menu"></label><div data-context-menu-items>${items.map((item) => item === null ? '<div class="separator" role="separator"></div>' : `<button type="button" role="menuitem" data-menu-action="${escapeAttribute(item.id)}" data-menu-label="${escapeAttribute(item.label)}" ${item.disabled ? 'disabled' : ''}><span>${escapeHtml(item.glyph ?? '')}</span><span>${escapeHtml(item.label)}</span>${item.shortcut ? `<span style="margin-left:auto;color:var(--on-surface-variant);font-size:.7rem">${escapeHtml(item.shortcut)}</span>` : ''}</button>`).join('')}</div>`;
  root.querySelector('[data-context-menu-search]')?.addEventListener('input', (event) => {
    const query = event.target.value.trim().toLocaleLowerCase();
    root.querySelectorAll('[data-menu-action]').forEach((button) => { button.hidden = Boolean(query) && !button.dataset.menuLabel.toLocaleLowerCase().includes(query); });
    root.querySelectorAll('.separator').forEach((separator) => { separator.hidden = Boolean(query); });
  });
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-menu-action]'); if (!button) return;
    const item = items.find((candidate) => candidate?.id === button.dataset.menuAction); item?.action?.(); closeLayer(layer); onClose?.();
  });
  layer.append(root); queueMicrotask(() => root.querySelector('button:not(:disabled)')?.focus());
  return root;
}

export function showModal({ layer, title, body, actions = [], onClose, decision = false, closeLabel = 'Close' }) {
  closeLayer(layer);
  const returnFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  const backdrop = document.createElement('div'); backdrop.className = decision ? 'modal-backdrop' : 'modeless-host';
  backdrop.dataset.modalKind = decision ? 'decision' : 'non-decision';
  backdrop.innerHTML = `<section class="dialog" role="dialog" aria-modal="${decision ? 'true' : 'false'}" aria-labelledby="modal-title" tabindex="-1"><header class="dialog-header"><h2 id="modal-title">${escapeHtml(title)}</h2><button class="icon-button" type="button" data-modal-close aria-label="${escapeAttribute(closeLabel)}">×</button></header><div class="dialog-body">${body}</div><footer class="dialog-actions">${actions.map((action) => `<button class="button-label ${escapeAttribute(action.style ?? 'outlined')}" type="button" data-modal-action="${escapeAttribute(action.id)}" ${action.disabled ? 'disabled' : ''}>${escapeHtml(action.label)}</button>`).join('')}</footer></section>`;
  const dialog = backdrop.querySelector('.dialog');
  const inertSnapshots = [];
  if (decision) {
    const background = layer.parentElement?.children ?? document.body.children;
    for (const element of background) {
      if (element === layer) continue;
      inertSnapshots.push({ element, hadAttribute: element.hasAttribute('inert'), value: Boolean(element.inert) });
      element.inert = true;
      element.setAttribute('inert', '');
    }
  }

  let cleaned = false;
  let observer;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    observer?.disconnect();
    document.removeEventListener('focusin', keepDecisionFocus, true);
    for (const snapshot of inertSnapshots) {
      snapshot.element.inert = snapshot.value;
      if (snapshot.hadAttribute) snapshot.element.setAttribute('inert', '');
      else snapshot.element.removeAttribute('inert');
    }
    onClose?.();
    queueMicrotask(() => {
      if (returnFocus?.isConnected && !returnFocus.closest?.('[inert]')) returnFocus.focus?.();
    });
  };
  const close = () => {
    activeLayerCleanups.delete(layer);
    observer?.disconnect();
    layer.replaceChildren();
    cleanup();
  };

  function focusFirstControl() {
    const autofocus = dialog.querySelector('[autofocus]');
    const bodyControl = dialog.querySelector(`.dialog-body ${MODAL_FOCUSABLE_SELECTOR.split(',').join(',.dialog-body ')}`);
    const action = dialog.querySelector('[data-modal-action]:not(:disabled)');
    (autofocus ?? bodyControl ?? action ?? dialog.querySelector('[data-modal-close]') ?? dialog).focus?.();
  }

  function keepDecisionFocus(event) {
    if (!decision || !backdrop.isConnected || dialog.contains(event.target)) return;
    event.stopPropagation();
    queueMicrotask(focusFirstControl);
  }

  backdrop.querySelector('[data-modal-close]').addEventListener('click', close);
  backdrop.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !decision) { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab' || !decision) return;
    const focusable = modalFocusableElements(dialog);
    if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
    const first = focusable[0]; const last = focusable.at(-1); const current = document.activeElement;
    if ((event.shiftKey && (current === first || !dialog.contains(current))) || (!event.shiftKey && current === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  });
  backdrop.querySelectorAll('[data-modal-action]').forEach((button) => button.addEventListener('click', () => {
    const action = actions.find((candidate) => candidate.id === button.dataset.modalAction); const keep = action?.action?.(); if (keep !== false) close();
  }));
  activeLayerCleanups.set(layer, cleanup);
  observer = new MutationObserver(() => {
    if (backdrop.isConnected) return;
    if (activeLayerCleanups.get(layer) === cleanup) activeLayerCleanups.delete(layer);
    cleanup();
  });
  observer.observe(layer, { childList: true });
  if (decision) document.addEventListener('focusin', keepDecisionFocus, true);
  layer.append(backdrop);
  if (decision) queueMicrotask(focusFirstControl);
  return backdrop;
}
