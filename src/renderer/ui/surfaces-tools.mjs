import { CHANGELOG, CREATE_TEMPLATES, RELEASE_INFO, surfaceById } from './catalog.mjs';
import { escapeAttribute, escapeHtml, renderSearchBox, surfaceLabel } from './helpers.mjs';

function localized(ctx, english, cantonese, facts = {}) {
  if (ctx.l) return ctx.l(english, cantonese, facts);
  return english.replace(/\{([A-Za-z][A-Za-z0-9_.-]*)\}/g, (token, name) => Object.hasOwn(facts, name) ? String(facts[name]) : token);
}

function surfaceHeader(ctx, { eyebrow, title, description, actions = '' }) {
  return `<header class="surface-header"><div class="title-block"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${actions ? `<div class="surface-actions">${actions}</div>` : ''}</header>`;
}

function emptyState(glyph, title, body, action = '') {
  return `<div class="empty-state"><span class="empty-glyph" aria-hidden="true">${glyph}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p>${action}</div>`;
}

function renderDateRangeControl(ctx, scope) {
  const runtime = ctx.state.runtime ?? {};
  const from = runtime[`${scope}From`] ?? '';
  const to = runtime[`${scope}To`] ?? '';
  const fromInput = runtime[`${scope}FromInput`] ?? from;
  const toInput = runtime[`${scope}ToInput`] ?? to;
  const validation = runtime[`${scope}DateValidation`] ?? null;
  const bound = validation?.bound === 'from' ? localized(ctx, 'start', '開始') : localized(ctx, 'end', '結束');
  const validationText = validation?.status === 'partial'
    ? localized(ctx, 'Finish the {bound} date; your typed value is preserved and has not been applied.', '請完成{bound}日期；輸入內容已保留，暫時未套用。', { bound })
    : validation?.status === 'invalid'
      ? localized(ctx, 'The {bound} date is invalid. Use your locale format or YYYY-MM-DD; the typed value is preserved.', '{bound}日期無效。請使用地區格式或 YYYY-MM-DD；輸入內容已保留。', { bound })
      : validation?.status === 'order'
        ? localized(ctx, 'The start date must not be after the end date. Both typed values are preserved.', '開始日期唔可以遲過結束日期；兩個輸入值都已保留。')
        : localized(ctx, 'Type a locale date or YYYY-MM-DD, or open the calendar.', '輸入地區格式日期或 YYYY-MM-DD，亦可以開啟日曆。');
  return `<div class="date-range-editor" data-date-range-scope="${escapeAttribute(scope)}"><div class="date-range-fields"><label class="field"><span>${escapeHtml(localized(ctx, 'From', '由'))}</span><input type="text" inputmode="numeric" autocomplete="off" value="${escapeAttribute(fromInput)}" data-action="date-range-input" data-date-scope="${escapeAttribute(scope)}" data-date-bound="from" aria-describedby="${scope}-date-validation"></label><label class="field"><span>${escapeHtml(localized(ctx, 'To', '至'))}</span><input type="text" inputmode="numeric" autocomplete="off" value="${escapeAttribute(toInput)}" data-action="date-range-input" data-date-scope="${escapeAttribute(scope)}" data-date-bound="to" aria-describedby="${scope}-date-validation"></label><button class="icon-button" type="button" data-action="open-date-range" data-date-scope="${escapeAttribute(scope)}" aria-label="${escapeAttribute(localized(ctx, 'Open advanced date-range calendar', '開啟進階日期範圍日曆'))}" aria-expanded="false">▣</button></div><p id="${scope}-date-validation" class="validation${validation ? ' error' : ''}" data-date-validation="${escapeAttribute(scope)}" aria-live="polite">${escapeHtml(validationText)}</p></div>`;
}

export function renderHome(ctx) {
  const { state, t } = ctx;
  const documents = state.documents ?? [];
  const recentSearch = state.searches?.recent ?? {};
  const visible = ctx.filterCollection(
    documents,
    recentSearch,
    (document) => `${document.title} ${document.type} ${document.nativeFileName ?? ''}`
  );
  return `<section class="surface" data-surface="home" data-appearance-id="surface:home">
    ${surfaceHeader(ctx, { eyebrow: t('home.eyebrow'), title: t('home.title'), description: t('home.description'), actions: `<button class="button-label outlined" data-action="open-file">▱ ${escapeHtml(t('action.open'))}</button><button class="button-label filled" data-action="new-document">＋ ${escapeHtml(t('action.new'))}</button>` })}
    <div class="surface-content">
      <div class="hero-grid">
        <article class="hero-card" data-appearance-id="home-hero"><h2>${escapeHtml(t('home.heroTitle'))}</h2><p>${escapeHtml(t('home.heroBody'))}</p><div class="hero-actions"><button class="button-label filled" data-action="new-document">＋ ${escapeHtml(t('action.createDocument'))}</button><button class="button-label outlined" data-action="edit-libreoffice">${escapeHtml(t('action.openLibreOffice'))}</button></div></article>
        <aside class="card"><div class="card-header"><h2>${escapeHtml(t('home.quickCreate'))}</h2></div><div class="quick-create">${CREATE_TEMPLATES.map((template) => `<button class="create-button" data-action="create-type" data-type="${template.type}"><span class="app-glyph" aria-hidden="true">${template.glyph}</span><span><strong>${escapeHtml(localized(ctx, template.label, template.yueLabel ?? template.label))}</strong><small>${escapeHtml(localized(ctx, template.subtitle, template.yueSubtitle ?? template.subtitle))}</small></span></button>`).join('')}</div></aside>
      </div>
      <div class="section-heading"><h2>${escapeHtml(t('home.recent'))}</h2><p>${documents.length} ${escapeHtml(t('home.items'))}</p><div style="min-width:min(360px,45vw)">${renderSearchBox({ id: 'recent', value: state.searches?.recent?.query, placeholder: t('search.recent'), label: t('search.recent'), regexState: state.searches?.recent, localize: ctx.l })}</div></div>
      ${visible.length ? `<div class="card-grid">${visible.map((document) => `<button class="document-card" data-action="open-document" data-document-id="${escapeAttribute(document.id)}"><span class="document-preview"><span class="sheet-paper"><span class="sheet-line"></span><span class="sheet-line"></span><span class="sheet-line"></span><span class="sheet-line"></span></span></span><span class="document-meta"><strong>${escapeHtml(document.title)}</strong><span>${escapeHtml(surfaceLabel(surfaceById(document.type), state.preferences?.language))} · ${escapeHtml(ctx.formatRelativeTime(document.updatedAt))}</span></span></button>`).join('')}</div>` : emptyState('▱', t('home.emptyTitle'), t('home.emptyBody'), `<button class="button-label filled" data-action="new-document">＋ ${escapeHtml(t('action.new'))}</button>`)}
    </div>
  </section>`;
}

export function renderComponents(ctx) {
  const { state, t } = ctx;
  const demo = state.runtime?.componentDemo ?? { check: true, radio: 'design', toggle: true, slider: 62, field: '' };
  const swatches = [
    ['Primary', 'var(--primary)', 'var(--on-primary)'], ['Primary container', 'var(--primary-container)', 'var(--on-primary-container)'],
    ['Surface', 'var(--surface)', 'var(--on-surface)'], ['Surface container', 'var(--surface-container)', 'var(--on-surface)'],
    ['Secondary container', 'var(--secondary-container)', 'var(--on-secondary-container)'], ['Error', 'var(--error-container)', 'var(--on-error-container)']
  ];
  return `<section class="surface" data-surface="components" data-appearance-id="surface:components">
    ${surfaceHeader(ctx, { eyebrow: t('components.eyebrow'), title: t('components.title'), description: t('components.description'), actions: `<button class="button-label outlined" data-action="open-appearance" data-target="surface:components">${escapeHtml(t('action.editAppearance'))}</button>` })}
    <div class="surface-content component-grid">
      <article class="component-demo" data-appearance-id="component:buttons"><h2>${escapeHtml(t('components.buttons'))}</h2><div class="demo-row"><button class="button-label filled" data-action="demo-toast">${escapeHtml(localized(ctx, 'Filled', '填滿'))}</button><button class="button-label tonal" data-action="demo-toast">${escapeHtml(localized(ctx, 'Tonal', '色調'))}</button><button class="button-label outlined" data-action="demo-toast">${escapeHtml(localized(ctx, 'Outlined', '外框'))}</button><button class="button-label text" data-action="demo-toast">${escapeHtml(localized(ctx, 'Text', '文字'))}</button><button class="button-label filled" disabled>${escapeHtml(localized(ctx, 'Disabled', '已停用'))}</button></div></article>
      <article class="component-demo" data-appearance-id="component:selection"><h2>${escapeHtml(t('components.selection'))}</h2><div class="demo-row"><label><input type="checkbox" data-action="demo-check" ${demo.check ? 'checked' : ''}> ${escapeHtml(localized(ctx, 'Checkbox', '核取方塊'))}</label><button class="switch" role="switch" aria-checked="${demo.toggle}" data-action="demo-switch" aria-label="${escapeAttribute(localized(ctx, 'Demo switch', '示範開關'))}"></button></div><fieldset style="border:0;padding:0"><legend class="sr-only">${escapeHtml(localized(ctx, 'Demo choice', '示範選擇'))}</legend><div class="demo-row">${[['design', 'design', '設計'], ['native', 'native', '原生'], ['accessible', 'accessible', '無障礙']].map(([value, en, yue]) => `<label><input type="radio" name="demo-radio" value="${value}" data-action="demo-radio" ${demo.radio === value ? 'checked' : ''}> ${escapeHtml(localized(ctx, en, yue))}</label>`).join('')}</div></fieldset></article>
      <article class="component-demo" data-appearance-id="component:fields"><h2>${escapeHtml(t('components.fields'))}</h2><label class="field"><span>${escapeHtml(localized(ctx, 'Project name', '專案名稱'))}</span><input value="${escapeAttribute(demo.field)}" data-action="demo-field" placeholder="Material Office"></label><label class="field"><span>${escapeHtml(localized(ctx, 'Density', '密度'))}</span><select data-action="set-density"><option value="compact">${escapeHtml(localized(ctx, 'Compact', '精簡'))}</option><option value="comfortable">${escapeHtml(localized(ctx, 'Comfortable', '舒適'))}</option></select></label></article>
      <article class="component-demo" data-appearance-id="component:progress"><h2>${escapeHtml(t('components.progress'))}</h2><label class="field"><span>${escapeHtml(localized(ctx, 'Progress · {value}%', '進度 · {value}%', { value: Number(demo.slider) }))}</span><input type="range" min="0" max="100" value="${Number(demo.slider)}" data-action="demo-slider"></label><progress max="100" value="${Number(demo.slider)}" style="width:100%;accent-color:var(--primary)"></progress></article>
      <article class="component-demo" data-appearance-id="component:tokens" style="grid-column:1/-1"><h2>${escapeHtml(t('components.tokens'))}</h2><div class="card-grid">${swatches.map(([name, background, color]) => `<button class="card" data-action="copy-token" data-token="${escapeAttribute(name)}" style="min-height:92px;padding:14px;background:${background};color:${color};text-align:left"><strong>${escapeHtml(name)}</strong><small style="display:block;margin-top:6px">${escapeHtml(background)}</small></button>`).join('')}</div></article>
    </div>
  </section>`;
}

export function renderCommands(ctx) {
  const { state, t, features } = ctx;
  const scope = state.runtime?.commandScope ?? 'all';
  const queryState = state.searches?.commands ?? {};
  const matches = ctx.filterCollection(features, queryState, (feature) => `${feature.name} ${feature.scope} ${feature.area} ${feature.command}`)
    .filter((feature) => scope === 'all' || feature.scope === scope);
  const selectedId = state.runtime?.selectedCommandId ?? matches[0]?.id;
  const selected = features.find((feature) => feature.id === selectedId) ?? matches[0];
  const scopes = ['all', ...new Set(features.map((feature) => feature.scope))];
  return `<section class="surface" data-surface="commands">
    <div class="commands-layout">
      <nav class="surface-nav" aria-label="${escapeAttribute(localized(ctx, 'Command scopes', '指令範圍'))}"><h2>${escapeHtml(t('commands.scopes'))}</h2>${scopes.map((value) => `<button class="nav-item" data-action="command-scope" data-scope="${escapeAttribute(value)}" aria-current="${scope === value}"><span>${escapeHtml(value === 'all' ? localized(ctx, 'All features', '所有功能') : value)}</span><span style="margin-left:auto">${value === 'all' ? features.length : features.filter((feature) => feature.scope === value).length}</span></button>`).join('')}</nav>
      <div class="data-pane"><div class="section-heading"><h2>${escapeHtml(t('commands.title'))}</h2><p>${matches.length} / ${features.length}</p></div>${renderSearchBox({ id: 'commands', value: queryState.query, placeholder: t('search.commands'), label: t('search.commands'), regexState: queryState, localize: ctx.l })}<div class="command-list" style="margin-top:14px">${matches.slice(0, 500).map((feature) => `<button class="command-row" data-action="command-select" data-command-id="${escapeAttribute(feature.id)}" aria-selected="${feature.id === selected?.id}"><span><strong>${escapeHtml(feature.name)}</strong><small style="display:block;color:var(--on-surface-variant);margin-top:3px">${escapeHtml(feature.area)}</small></span><span class="scope-chip">${escapeHtml(feature.scope)}</span></button>`).join('')}${matches.length > 500 ? `<p style="text-align:center;color:var(--on-surface-variant)">${escapeHtml(t('commands.refine'))}</p>` : ''}</div></div>
      <aside class="detail-pane">${selected ? `<p class="eyebrow">${escapeHtml(selected.scope)} · ${escapeHtml(selected.area)}</p><h2>${escapeHtml(selected.name)}</h2><p>${escapeHtml(t('commands.detail'))}</p><div class="command-uri">${escapeHtml(selected.command)}</div><div class="property-group"><p>${escapeHtml(ctx.libreOffice?.available ? t('libreoffice.available') : t('libreoffice.unavailable'))}</p><button class="button-label filled" data-action="run-command" data-command-id="${escapeAttribute(selected.id)}" ${ctx.libreOffice?.available ? '' : 'disabled'}>▶ ${escapeHtml(t('commands.run'))}</button></div>` : emptyState('⌘', t('commands.noMatch'), t('commands.noMatchBody'))}</aside>
    </div>
  </section>`;
}

export function renderHistory(ctx) {
  const { state, t } = ctx;
  const history = state.history?.entries ?? [];
  const search = state.searches?.history ?? {};
  const actions = [...new Set(history.map((entry) => entry.action))].map((action) => ({ action, count: history.filter((entry) => entry.action === action).length }));
  const activeActions = state.runtime?.historyActions ?? [];
  const from = state.runtime?.historyFrom ?? '';
  const to = state.runtime?.historyTo ?? '';
  const matches = ctx.filterCollection(history, search, (entry) => `${entry.action} ${entry.displayLabel ?? entry.label ?? ''} ${entry.entityTitle ?? ''}`)
    .filter((entry) => !activeActions.length || activeActions.includes(entry.action))
    .filter((entry) => !from || new Date(entry.createdAt) >= new Date(from))
    .filter((entry) => !to || new Date(entry.createdAt) <= new Date(`${to}T23:59:59`));
  const selectedId = state.runtime?.historySelected ?? matches[0]?.id;
  const selected = history.find((entry) => entry.id === selectedId) ?? matches[0];
  const selectedLabel = selected?.displayLabel ?? selected?.label ?? selected?.action ?? localized(ctx, 'Workspace snapshot', '工作間快照');
  const diff = selected && ctx.historyView?.revision === (selected.hash || selected.id) ? ctx.historyView : null;
  const diffBody = !selected ? '' : diff?.loading
    ? `<section class="history-diff" id="history-diff-panel" tabindex="-1" role="status"><p>${escapeHtml(localized(ctx, 'Comparing this revision with the current workspace…', '正將呢個版本同目前工作間比較…'))}</p></section>`
    : diff?.error
      ? `<section class="history-diff" id="history-diff-panel" tabindex="-1" role="alert"><h3>${escapeHtml(localized(ctx, 'Comparison unavailable', '比較暫時不可用'))}</h3><p>${escapeHtml(diff.error)}</p></section>`
      : diff?.diff
        ? `<section class="history-diff" id="history-diff-panel" tabindex="-1" aria-label="${escapeAttribute(localized(ctx, 'Revision comparison', '版本比較'))}"><h3>${escapeHtml(localized(ctx, 'Changes from this revision to now', '由呢個版本到目前嘅變更'))}</h3>${diff.diff.unchanged ? `<p>${escapeHtml(localized(ctx, 'No differences were found.', '冇發現差異。'))}</p>` : `<div class="history-diff-counts"><span>${escapeHtml(localized(ctx, '{count} added', '新增 {count} 項', { count: diff.diff.counts.added }))}</span><span>${escapeHtml(localized(ctx, '{count} removed', '移除 {count} 項', { count: diff.diff.counts.removed }))}</span><span>${escapeHtml(localized(ctx, '{count} modified', '修改 {count} 項', { count: diff.diff.counts.modified }))}</span></div><div class="history-change-list">${diff.diff.changes.map((change) => `<article class="history-change"><header><strong>${escapeHtml(change.path)}</strong><span class="scope-chip">${escapeHtml(localized(ctx, change.kind, ({ added: '新增', removed: '移除', modified: '修改' })[change.kind] ?? change.kind))}</span></header>${change.oldPreview !== null ? `<div><small>${escapeHtml(localized(ctx, 'Then', '當時'))}</small><pre>${escapeHtml(change.oldPreview)}</pre></div>` : ''}${change.newPreview !== null ? `<div><small>${escapeHtml(localized(ctx, 'Now', '目前'))}</small><pre>${escapeHtml(change.newPreview)}</pre></div>` : ''}${change.previewTruncated ? `<p class="field-help">${escapeHtml(localized(ctx, 'This preview was shortened to stay safe and responsive.', '呢個預覽已縮短，確保安全同反應順暢。'))}</p>` : ''}</article>`).join('')}</div>${diff.diff.truncated ? `<p class="validation">${escapeHtml(localized(ctx, 'The comparison is truncated; the totals include changes not shown here.', '比較結果已截短；總數包括未顯示嘅變更。'))}</p>` : ''}`}</section>`
        : '';
  return `<section class="surface" data-surface="history"><div class="history-layout">
    <nav class="surface-nav" aria-label="${escapeAttribute(localized(ctx, 'History filters', '版本紀錄篩選'))}"><h2>${escapeHtml(t('history.filters'))}</h2>${renderSearchBox({ id: 'history', value: search.query, placeholder: t('search.history'), label: t('search.history'), regexState: search, localize: ctx.l })}<div class="property-group"><h3>${escapeHtml(t('history.date'))}</h3>${renderDateRangeControl(ctx, 'history')}</div><div class="property-group"><h3>${escapeHtml(t('history.actions'))}</h3>${actions.map(({ action, count }) => `<label style="display:flex;gap:8px;margin:8px 0"><input type="checkbox" data-action="history-action" value="${escapeAttribute(action)}" ${activeActions.includes(action) ? 'checked' : ''}>${escapeHtml(action)} <span style="margin-left:auto">${count}</span></label>`).join('')}</div></nav>
    <div class="data-pane"><div class="section-heading"><h2>${escapeHtml(t('history.title'))}</h2><p>${matches.length} ${escapeHtml(t('history.revisions'))}</p></div>${matches.length ? matches.map((entry) => `<button class="history-row" data-action="history-select" data-history-id="${escapeAttribute(entry.id)}" aria-selected="${entry.id === selected?.id}"><span class="history-dot"></span><span><strong>${escapeHtml(entry.displayLabel ?? entry.label ?? entry.action)}</strong><small style="display:block;color:var(--on-surface-variant);margin-top:4px">${escapeHtml(ctx.formatDateTime(entry.createdAt))} · ${escapeHtml(entry.action)}</small></span></button>`).join('') : emptyState('↺', t('history.noMatch'), t('history.noMatchBody'))}</div>
    <aside class="detail-pane">${selected ? `<p class="eyebrow">${escapeHtml(selected.action)}</p><h2>${escapeHtml(selectedLabel)}</h2><p>${escapeHtml(selected.entityTitle ?? '')}</p><div class="command-uri">${escapeHtml(selected.hash ?? selected.id)}</div><div class="property-group history-actions"><button class="button-label filled" data-action="history-restore" data-history-id="${escapeAttribute(selected.id)}" ${selected.current ? 'disabled' : ''}>↺ ${escapeHtml(t('history.restore'))}</button><button class="button-label outlined" data-action="history-diff" data-history-id="${escapeAttribute(selected.id)}" ${diff?.loading ? 'disabled' : ''}>⇄ ${escapeHtml(localized(ctx, 'Compare with current', '同目前版本比較'))}</button><button class="button-label outlined" data-action="history-label" data-history-id="${escapeAttribute(selected.id)}">✎ ${escapeHtml(localized(ctx, 'Edit label…', '編輯標籤…'))}</button><button class="button-label outlined" data-action="history-export" data-history-id="${escapeAttribute(selected.id)}">⇩ ${escapeHtml(t('action.export'))}</button></div>${diffBody}` : ''}</aside>
  </div></section>`;
}

export function renderDialogs(ctx) {
  const { state, t } = ctx;
  const selected = state.runtime?.dialogDemo ?? 'options';
  const historyAvailable = Boolean(ctx.capabilities?.localHistory);
  const historyHealthy = historyAvailable && ctx.historyHealth !== 'degraded';
  const tabs = [['options', t('dialogs.options')], ['save', t('dialogs.save')], ['print', t('dialogs.print')]];
  let body = '';
  if (selected === 'save') {
    const document = ctx.document;
    const defaultName = state.runtime?.dialogFileName ?? document?.title?.replace(/\.[^.]+$/, '') ?? localized(ctx, 'Untitled', '未命名');
    const format = state.runtime?.dialogFileType ?? 'portable';
    body = `<div class="setting-section"><label class="field"><span>${escapeHtml(t('dialogs.fileName'))}</span><input value="${escapeAttribute(defaultName)}" maxlength="128" data-dialog-field="filename"></label><label class="field"><span>${escapeHtml(t('dialogs.fileType'))}</span><select data-dialog-field="filetype"><option value="portable" ${format === 'portable' ? 'selected' : ''}>${escapeHtml(localized(ctx, 'Portable editable export', '可攜式可編輯匯出'))}</option><option value="json" ${format === 'json' ? 'selected' : ''}>Material Office JSON</option><option value="pdf" ${format === 'pdf' ? 'selected' : ''}>${escapeHtml(localized(ctx, 'PDF through Windows print', '經 Windows 列印輸出 PDF'))}</option></select></label><p class="field-help">${escapeHtml(localized(ctx, 'Portable export uses HTML for Writer, CSV for Calc and Base, and structured JSON for the other in-app editors. Native office formats are created or converted only by LibreOffice.', '可攜匯出會為 Writer 使用 HTML、為 Calc 同 Base 使用 CSV，其他內置編輯器就使用結構化 JSON。原生辦公格式只會由 LibreOffice 建立或轉換。'))}</p><div class="dialog-actions"><button class="button-label outlined" data-action="dialog-cancel">${escapeHtml(t('action.cancel'))}</button><button class="button-label filled" data-action="dialog-save-as">${escapeHtml(t('action.save'))}</button></div></div>`;
  } else if (selected === 'print') {
    body = `<div class="setting-section"><div class="hero-grid"><div class="document-preview" style="min-height:260px;border-radius:var(--r-container)"><span class="sheet-paper" style="width:130px;height:185px"><span class="sheet-line"></span><span class="sheet-line"></span><span class="sheet-line"></span></span></div><div><h2>${escapeHtml(localized(ctx, 'Windows print', 'Windows 列印'))}</h2><p>${escapeHtml(localized(ctx, 'The native Windows print surface owns the printer, copies, page range, paper, and PDF destination. Material Office opens that authoritative surface instead of showing decorative controls that cannot affect the job.', '原生 Windows 列印畫面負責印表機、份數、頁面範圍、紙張同 PDF 目的地。Material Office 會開啟呢個權威畫面，唔會擺啲影響唔到工作嘅裝飾控制。'))}</p></div></div><div class="dialog-actions"><button class="button-label outlined" data-action="dialog-cancel">${escapeHtml(t('action.cancel'))}</button><button class="button-label filled" data-action="print">${escapeHtml(t('action.print'))}</button></div></div>`;
  } else {
    body = `<div class="setting-section"><div class="setting-row"><span class="setting-copy"><strong>${escapeHtml(t('settings.language'))}</strong><small>${escapeHtml(t('settings.languageDescription'))}</small></span><span class="setting-control"><select data-action="set-language"><option value="en" ${state.preferences?.language === 'en' ? 'selected' : ''}>English</option><option value="yue" ${state.preferences?.language === 'yue' ? 'selected' : ''}>廣東話</option><option value="bilingual" ${state.preferences?.language === 'bilingual' ? 'selected' : ''}>English · 廣東話</option></select></span></div><div class="setting-row"><span class="setting-copy"><strong>${escapeHtml(t('settings.theme'))}</strong><small>${escapeHtml(t('settings.themeDescription'))}</small></span><span class="setting-control"><button class="button-label tonal" data-action="toggle-theme">${escapeHtml(state.preferences?.theme)}</button></span></div><div class="setting-row"><span class="setting-copy"><strong>${escapeHtml(historyAvailable ? localized(ctx, 'Protected local history', '受保護本機版本紀錄') : localized(ctx, 'Local history unavailable', '本機版本紀錄不可用'))}</strong><small>${escapeHtml(historyAvailable ? localized(ctx, 'Every app-owned change is snapshotted beside application data. Restores append a new revision, so undoing an undo remains possible.', '每項由 app 管理嘅變更都會喺應用程式資料旁邊建立快照。還原會新增版本，所以連復原都可以再復原。') : localized(ctx, 'This runtime cannot record Git-backed revisions. Current changes remain in the workspace without restore protection.', '呢個執行環境未能記錄 Git 版本；目前修改仍留喺工作間，但冇還原保護。'))}</small></span><span class="setting-control"><span class="scope-chip">${escapeHtml(historyHealthy ? localized(ctx, 'Protected', '受保護') : historyAvailable ? localized(ctx, 'Degraded', '已降級') : localized(ctx, 'Unavailable', '不可用'))}</span></span></div><div class="dialog-actions"><button class="button-label text" data-action="reset-settings">${escapeHtml(t('action.reset'))}</button><button class="button-label outlined" data-action="dialog-cancel">${escapeHtml(t('action.cancel'))}</button><button class="button-label filled" data-action="save-settings">${escapeHtml(t('action.save'))}</button></div></div>`;
  }
  return `<section class="surface" data-surface="dialogs">${surfaceHeader(ctx, { eyebrow: t('dialogs.eyebrow'), title: t('dialogs.title'), description: t('dialogs.description') })}<div class="surface-content"><div class="appearance-tabs" role="tablist" aria-label="${escapeAttribute(localized(ctx, 'Dialog examples', '對話框範例'))}">${tabs.map(([id, label]) => `<button id="dialog-demo-tab-${id}" role="tab" tabindex="${selected === id ? '0' : '-1'}" aria-selected="${selected === id}" aria-controls="dialog-demo-panel-${id}" data-action="dialog-demo" data-dialog="${id}">${escapeHtml(label)}</button>`).join('')}</div><div id="dialog-demo-panel-${selected}" role="tabpanel" aria-labelledby="dialog-demo-tab-${selected}" tabindex="0">${body}</div></div></section>`;
}

function changelogText(entry) {
  return [entry.sections, entry.sectionsYue].filter(Boolean).flatMap((sections) => Object.entries(sections).flatMap(([category, items]) => [`## ${category}`, ...items.map((item) => `- ${item}`)])).join('\n');
}

export function renderChangelog(ctx) {
  const { state, t } = ctx;
  const search = state.searches?.changelog ?? {};
  const from = state.runtime?.changelogFrom ?? '';
  const to = state.runtime?.changelogTo ?? '';
  const matches = ctx.filterCollection(CHANGELOG, search, (entry) => `${entry.version} ${entry.date ?? ''} ${entry.buildDate ?? ''} ${entry.status ?? ''} ${entry.codeName} ${changelogText(entry)}`)
    .filter((entry) => !from || (entry.date && entry.date >= from)).filter((entry) => !to || (entry.date && entry.date <= to));
  return `<section class="surface" data-surface="changelog">
    ${surfaceHeader(ctx, { eyebrow: t('changelog.eyebrow'), title: t('changelog.title'), description: t('changelog.description'), actions: `<button class="button-label outlined" data-action="copy-changelog">⧉ ${escapeHtml(t('action.copy'))}</button><button class="button-label filled" data-action="export-changelog">⇩ ${escapeHtml(t('action.export'))}</button>` })}
    <div class="surface-content"><div class="setting-section"><div class="setting-row"><span>${renderSearchBox({ id: 'changelog', value: search.query, placeholder: t('search.changelog'), label: t('search.changelog'), regexState: search, localize: ctx.l })}</span><span class="setting-control">${renderDateRangeControl(ctx, 'changelog')}</span></div></div>
      ${matches.length ? matches.map((entry) => `<article class="setting-section"><div class="hero-grid" style="grid-template-columns:minmax(0,1fr) 180px"><div><p class="eyebrow">${escapeHtml(entry.date ?? localized(ctx, 'Unpublished {status} · local build {date}', '未發布 {status} · 本機 build {date}', { status: entry.status ?? 'build', date: entry.buildDate ?? localized(ctx, 'date unavailable', '日期未提供') }))}</p><h2>v${escapeHtml(entry.version)} ${entry.status === 'prerelease' ? escapeHtml(localized(ctx, 'prerelease', '預發布')) : ''} · ${escapeHtml(entry.codeName)}</h2>${Object.entries(entry.sections).map(([category, items]) => `<h3>${escapeHtml(localized(ctx, category, ({ Added: '新增', Accessibility: '無障礙', Security: '安全性' })[category] ?? category))}</h3><ul>${items.map((item, index) => `<li>${escapeHtml(localized(ctx, item, entry.sectionsYue?.[category]?.[index] ?? item))}</li>`).join('')}</ul>`).join('')}</div><img src="${escapeAttribute(RELEASE_INFO.image)}" alt="${escapeAttribute(RELEASE_INFO.alt)}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--r-container)"></div></article>`).join('') : emptyState('✦', t('changelog.noMatch'), t('changelog.noMatchBody'))}
    </div>
  </section>`;
}

function settingsRow(title, description, control, keywords = '') {
  return `<div class="setting-row" data-setting-keywords="${escapeAttribute(`${title} ${description} ${keywords}`)}"><span class="setting-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span><span class="setting-control">${control}</span></div>`;
}

export function renderSettings(ctx) {
  const { state, t } = ctx;
  const section = state.runtime?.settingsSection ?? 'language';
  const queryState = state.searches?.[`settings-${section}`] ?? {};
  const language = state.preferences?.language ?? 'en';
  const historyAvailable = Boolean(ctx.capabilities?.localHistory);
  const historyHealthy = historyAvailable && ctx.historyHealth !== 'degraded';
  const sections = [
    ['language', t('settings.language'), '文'], ['appearance', t('settings.appearance'), '◐'], ['tabs', t('settings.tabs'), '▱'],
    ['history', t('settings.history'), '↺'], ['integration', t('settings.integration'), '⌘'], ['notifications', t('settings.notifications'), '♢'], ['accessibility', t('settings.accessibility'), '◎']
  ];
  let rows = '';
  if (section === 'language') {
    rows += settingsRow(t('settings.language'), t('settings.languageDescription'), `<select data-action="set-language"><option value="en" ${language === 'en' ? 'selected' : ''}>English</option><option value="yue" ${language === 'yue' ? 'selected' : ''}>廣東話</option><option value="bilingual" ${language === 'bilingual' ? 'selected' : ''}>English · 廣東話</option></select>`);
    rows += settingsRow(t('settings.englishFunny'), t('settings.funnyDisclosure'), `<input type="range" min="1" max="5" value="${Number(state.preferences?.funny?.en ?? 2)}" data-action="funny-level" data-language="en" aria-label="${escapeAttribute(t('settings.englishFunny'))}"><output>${Number(state.preferences?.funny?.en ?? 2)}</output>`);
    rows += settingsRow(t('settings.yueFunny'), t('settings.funnyDisclosure'), `<input type="range" min="1" max="5" value="${Number(state.preferences?.funny?.yue ?? 3)}" data-action="funny-level" data-language="yue" aria-label="${escapeAttribute(t('settings.yueFunny'))}"><output>${Number(state.preferences?.funny?.yue ?? 3)}</output>`);
  } else if (section === 'appearance') {
    rows += settingsRow(t('settings.theme'), t('settings.themeDescription'), `<select data-action="set-theme"><option value="light" ${state.preferences?.theme === 'light' ? 'selected' : ''}>${escapeHtml(localized(ctx, 'Light', '淺色'))}</option><option value="dark" ${state.preferences?.theme === 'dark' ? 'selected' : ''}>${escapeHtml(localized(ctx, 'Dark', '深色'))}</option><option value="system" ${state.preferences?.theme === 'system' ? 'selected' : ''}>${escapeHtml(localized(ctx, 'System', '跟隨系統'))}</option></select>`);
    rows += settingsRow(t('settings.density'), t('settings.densityDescription'), `<select data-action="set-density"><option value="compact" ${state.preferences?.density === 'compact' ? 'selected' : ''}>${escapeHtml(localized(ctx, 'Compact', '精簡'))}</option><option value="comfortable" ${state.preferences?.density === 'comfortable' ? 'selected' : ''}>${escapeHtml(localized(ctx, 'Comfortable', '舒適'))}</option></select>`);
    rows += settingsRow(t('settings.accent'), t('settings.accentDescription'), `<input type="color" value="${escapeAttribute(state.preferences?.accent ?? '#6750a4')}" data-action="set-accent"><button class="button-label outlined" data-action="open-color-picker">${escapeHtml(t('action.advanced'))}</button>`);
    rows += settingsRow(t('settings.font'), t('settings.fontDescription'), `<input value="${escapeAttribute(state.preferences?.fontFamily ?? 'Segoe UI Variable')}" data-action="set-font" list="font-options"><datalist id="font-options"><option>Segoe UI Variable</option><option>Segoe UI</option><option>Arial</option><option>Georgia</option><option>Consolas</option></datalist>`);
    rows += settingsRow(t('settings.everyElement'), t('settings.everyElementDescription'), `<button class="button-label filled" data-action="open-appearance" data-target="surface:settings">${escapeHtml(t('action.editAppearance'))}</button>`);
  } else if (section === 'tabs') {
    rows += settingsRow(t('settings.tabPersistence'), t('settings.tabPersistenceDescription'), `<span class="scope-chip">${escapeHtml(localized(ctx, 'Persisted', '已保存'))}</span>`);
    rows += settingsRow(t('settings.masterTabSearch'), t('settings.masterTabSearchDescription'), `<button class="button-label outlined" data-action="open-tab-search">⌕ ${escapeHtml(t('tabs.search'))}</button>`);
    rows += settingsRow(t('settings.bulkClose'), t('settings.bulkCloseDescription'), `<button class="button-label outlined" data-action="tab-bulk-close">${escapeHtml(t('tabs.bulkClose'))}</button>`);
  } else if (section === 'history') {
    rows += settingsRow(t('settings.localHistory'), historyAvailable ? t('settings.localHistoryDescription') : localized(ctx, 'Git-backed revisions are unavailable in this runtime. Current workspace changes do not gain restore protection.', '呢個執行環境冇 Git 版本紀錄；目前工作間修改唔會獲得還原保護。'), `<span class="scope-chip">${escapeHtml(historyHealthy ? localized(ctx, 'Protected', '受保護') : historyAvailable ? localized(ctx, 'Degraded', '已降級') : localized(ctx, 'Unavailable', '不可用'))}</span>`);
    rows += settingsRow(t('settings.retention'), t('settings.retentionDescription'), `<input type="number" min="10" max="10000" value="${Number(state.preferences?.historyRetention ?? 1000)}" data-action="history-retention" aria-label="${escapeAttribute(t('settings.retention'))}"><button class="button-label outlined" data-action="history-prune-review">${escapeHtml(t('settings.pruneNow'))}</button>`);
    rows += settingsRow(t('settings.exportHistory'), t('settings.exportHistoryDescription'), `<button class="button-label outlined" data-action="history-export-all">⇩ ${escapeHtml(t('action.export'))}</button>`);
  } else if (section === 'integration') {
    rows += settingsRow('LibreOffice', ctx.libreOffice?.available ? t('libreoffice.available') : t('libreoffice.unavailable'), `<button class="button-label outlined" data-action="refresh-libreoffice">↻ ${escapeHtml(t('action.refresh'))}</button><button class="button-label filled" data-action="choose-libreoffice">${escapeHtml(t('action.choose'))}</button>`);
    rows += settingsRow(t('settings.externalEditor'), t('settings.externalEditorDescription'), `<select data-action="external-editor">${(ctx.externalEditors ?? []).map((editor) => `<option value="${escapeAttribute(editor.id)}" ${editor.id === state.preferences?.preferredEditorId ? 'selected' : ''}>${escapeHtml(editor.name)}</option>`).join('')}<option value="custom">${escapeHtml(localized(ctx, 'Choose executable…', '選擇執行檔…'))}</option></select><button class="button-label outlined" data-action="open-external-editor">${escapeHtml(localized(ctx, 'Open active file', '開啟目前檔案'))}</button>`);
  } else if (section === 'notifications') {
    rows += settingsRow(t('settings.notificationHistory'), t('settings.notificationHistoryDescription'), `<button class="button-label outlined" data-action="open-notifications">${escapeHtml(t('nav.notifications'))}</button>`);
    rows += settingsRow(t('settings.dimSum'), t('settings.dimSumDescription'), `<button class="switch" role="switch" aria-label="${escapeAttribute(t('settings.dimSum'))}" aria-checked="${state.preferences?.dimSumSurprise !== false}" data-action="toggle-setting" data-setting="dimSumSurprise"></button>`);
    rows += settingsRow(t('settings.narrator'), t('settings.narratorDescription'), `<button class="switch" role="switch" aria-label="${escapeAttribute(t('settings.narrator'))}" aria-checked="${Boolean(state.preferences?.narrator?.enabled)}" data-action="toggle-narrator"></button><select data-action="narrator-language" aria-label="${escapeAttribute(localized(ctx, 'Narrator language', '旁白語言'))}"><option value="en" ${state.preferences?.narrator?.language === 'en' ? 'selected' : ''}>English</option><option value="yue" ${state.preferences?.narrator?.language === 'yue' ? 'selected' : ''}>廣東話</option><option value="bilingual" ${state.preferences?.narrator?.language === 'bilingual' ? 'selected' : ''}>${escapeHtml(localized(ctx, 'Both', '兩種語言'))}</option></select>`);
  } else {
    rows += settingsRow(t('settings.reducedMotion'), t('settings.reducedMotionDescription'), `<button class="switch" role="switch" aria-label="${escapeAttribute(t('settings.reducedMotion'))}" aria-checked="${Boolean(state.preferences?.reducedMotion)}" data-action="toggle-setting" data-setting="reducedMotion"></button>`);
    rows += settingsRow(t('settings.scale'), t('settings.scaleDescription'), `<input type="range" min="100" max="200" step="25" value="${Number(state.preferences?.scale ?? 100)}" data-action="set-scale" aria-label="${escapeAttribute(t('settings.scale'))}"><output>${Number(state.preferences?.scale ?? 100)}%</output>`);
    rows += settingsRow(t('settings.highContrast'), t('settings.highContrastDescription'), `<button class="button-label outlined" data-action="open-windows-contrast">${escapeHtml(t('action.openWindowsSettings'))}</button>`);
  }
  return `<section class="surface" data-surface="settings" data-appearance-id="surface:settings"><div class="settings-layout">
    <nav class="surface-nav" aria-label="${escapeAttribute(localized(ctx, 'Settings sections', '設定分類'))}"><h2>${escapeHtml(t('nav.settings'))}</h2>${sections.map(([id, label, glyph]) => `<button class="nav-item" data-action="settings-section" data-section="${id}" aria-current="${section === id}"><span>${glyph}</span>${escapeHtml(label)}</button>`).join('')}</nav>
    <div class="settings-content"><div class="section-heading"><h1>${escapeHtml(sections.find(([id]) => id === section)?.[1] ?? t('nav.settings'))}</h1><button class="button-label text" data-action="reset-settings">${escapeHtml(t('action.reset'))}</button></div><div style="max-width:900px;margin:0 auto 16px">${renderSearchBox({ id: `settings-${section}`, value: queryState.query, placeholder: t('search.settings'), label: t('search.settings'), regexState: queryState, localize: ctx.l })}</div><section class="setting-section" data-settings-rows="${section}">${rows}</section></div>
  </div></section>`;
}
