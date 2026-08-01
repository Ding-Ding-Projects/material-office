import { APP_SURFACES, FORMAT_TOOLBAR, MENU_ITEMS, MENUS, STANDARD_TOOLBAR, surfaceById } from './catalog.mjs';
import { staticCommandCapability, unsupportedCommandReason } from '../core/command-capabilities.mjs';

const YUE_LABELS = Object.freeze({
  File: '檔案', Edit: '編輯', View: '檢視', Insert: '插入', Format: '格式', Styles: '樣式', Table: '表格', Form: '表單', Tools: '工具', Window: '視窗', Help: '說明', Sheet: '工作表', Data: '資料', Slide: '投影片', 'Slide Show': '投影片放映', Page: '頁面', Shape: '圖形',
  New: '新增', 'Open…': '開啟…', 'Recent documents': '最近文件', Save: '儲存', 'Save as…': '另存新檔…', 'Export…': '匯出…', 'Export as PDF…': '匯出做 PDF…', 'Print…': '列印…', 'Close tab': '關閉分頁', Undo: '復原', Redo: '取消復原', Cut: '剪下', Copy: '複製', Paste: '貼上', 'Find & replace…': '尋找同取代…', 'Select all': '全部選取',
  Normal: '一般', Web: '網頁', 'Zoom in': '放大', 'Zoom out': '縮小', 'Toggle properties': '切換內容面板', 'Toggle status bar': '切換狀態列', 'Image…': '圖片…', 'Chart…': '圖表…', 'Table…': '表格…', 'Text box': '文字方塊', 'Page break': '分頁', 'Special character…': '特殊字元…', 'Hyperlink…': '超連結…',
  'Character…': '字元…', 'Paragraph…': '段落…', 'Bullets and numbering…': '項目符號同編號…', 'Page style…': '頁面樣式…', 'Clear direct formatting': '清除直接格式', 'Default paragraph style': '預設段落樣式', 'Heading 1': '標題 1', 'Heading 2': '標題 2', 'Manage styles': '管理樣式',
  'Insert table…': '插入表格…', 'Insert row above': '喺上面插入列', 'Insert column before': '喺前面插入欄', 'Merge cells': '合併儲存格', 'Split cells…': '分割儲存格…', 'Design mode': '設計模式', 'Check box': '核取方塊', 'Push button': '按鈕', 'Insert rows above': '喺上面插入列', 'Insert columns before': '喺前面插入欄', 'Delete rows': '刪除列', 'Named ranges…': '命名範圍…',
  'Sort…': '排序…', AutoFilter: '自動篩選', 'Standard filter…': '標準篩選…', 'Pivot table…': '樞紐分析表…', 'Group and outline': '群組同大綱', 'New slide': '新增投影片', 'Duplicate slide': '複製投影片', 'Delete slide': '刪除投影片', 'Slide properties…': '投影片內容…', 'Slide layout': '投影片版面', 'Start from first slide': '由第一張開始', 'Start from current slide': '由目前投影片開始', 'Slide show settings…': '投影片放映設定…',
  'Page properties…': '頁面內容…', 'Insert page': '插入頁面', 'Rename page…': '重新命名頁面…', 'Rotate or flip': '旋轉或翻轉', Arrange: '排列', Group: '群組', 'Delete selected': '刪除已選物件', 'Spelling…': '拼字檢查…', 'Word count…': '字數統計…', 'AutoCorrect options…': '自動校正選項…', Macros: '巨集', 'Options…': '選項…', 'New window': '新增視窗', 'Close window': '關閉視窗',
  'Material Office help': 'Material Office 說明', "What's this?": '呢個係乜？', 'About Material Office': '關於 Material Office', Open: '開啟', 'Export PDF': '匯出 PDF', Print: '列印', Find: '尋找', Spelling: '拼字檢查', Pinned: '已固定', 'Pinned group': '已固定群組', 'Unsaved changes': '未儲存變更', 'Tab actions': '分頁操作', Zoom: '縮放'
});

function localized(ctx, english, cantonese = YUE_LABELS[english] ?? english, facts = {}) {
  if (ctx?.l) return ctx.l(english, cantonese, facts);
  return english.replace(/\{([A-Za-z][A-Za-z0-9_.-]*)\}/g, (token, name) => Object.hasOwn(facts, name) ? String(facts[name]) : token);
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function escapeAttribute(value = '') {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

export function makeId(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function getActiveTab(state) {
  return state.tabs?.items?.find((tab) => tab.id === state.tabs.activeId) ?? state.tabs?.items?.[0] ?? null;
}

export function getActiveDocument(state) {
  const tab = getActiveTab(state);
  if (!tab?.documentId) return null;
  return state.documents?.find((document) => document.id === tab.documentId) ?? null;
}

export function surfaceLabel(surface, language = 'en') {
  if (language === 'yue') return surface.yue;
  if (language === 'bilingual') return `${surface.label} · ${surface.yue}`;
  return surface.label;
}

export function renderSearchBox({ id, value = '', placeholder = 'Search', label = placeholder, regexState = {}, localize = null }) {
  const regexLabel = localize ? localize('Open regular expression builder for {label}', '開啟「{label}」嘅 regular expression 建立器', { label }) : `Open regular expression builder for ${label}`;
  const regexTitle = localize ? localize('Regular expression builder', 'Regular expression 建立器') : 'Regular expression builder';
  return `
    <div class="search-box" data-search-box="${escapeAttribute(id)}">
      <span class="search-icon" aria-hidden="true">⌕</span>
      <input
        id="search-${escapeAttribute(id)}"
        type="search"
        data-search-id="${escapeAttribute(id)}"
        value="${escapeAttribute(value)}"
        placeholder="${escapeAttribute(placeholder)}"
        aria-label="${escapeAttribute(label)}"
        autocomplete="off"
        spellcheck="false"
      />
      <button
        class="regex-launch"
        type="button"
        data-action="open-regex"
        data-search-id="${escapeAttribute(id)}"
        aria-label="${escapeAttribute(regexLabel)}"
        aria-expanded="${regexState.open ? 'true' : 'false'}"
        title="${escapeAttribute(regexTitle)}"
      >.*</button>
    </div>`;
}

export function renderTopBar(ctx) {
  const { state, t } = ctx;
  const mode = state.preferences?.language ?? 'en';
  const notifications = state.notifications?.filter((item) => !item.read).length ?? 0;
  return `
    <header class="top-app-bar" data-appearance-id="top-app-bar">
      <button class="brand-button" type="button" data-action="navigate" data-surface="home" aria-label="${escapeAttribute(t('nav.home'))}">
        <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
        <span class="brand-copy"><strong>Material Office</strong><span>${escapeHtml(t('app.subtitle'))}</span></span>
      </button>
      <div class="global-search">
        ${renderSearchBox({ id: 'global', value: state.searches?.global?.query, placeholder: t('search.global'), label: t('search.global'), regexState: state.searches?.global, localize: ctx.l })}
      </div>
      <div class="app-actions">
        <button class="button-label filled optional-action" type="button" data-action="new-document"><span aria-hidden="true">＋</span><span class="action-copy">${escapeHtml(t('action.new'))}</span></button>
        <button class="icon-button" type="button" data-action="open-file" aria-label="${escapeAttribute(t('action.open'))}" title="${escapeAttribute(t('action.open'))}">▱</button>
        <button class="icon-button" type="button" data-action="toggle-theme" aria-label="${escapeAttribute(t('action.theme'))}" title="${escapeAttribute(t('action.theme'))}">${state.preferences?.theme === 'dark' ? '☀' : '◐'}</button>
        <button class="icon-button" type="button" data-action="open-notifications" aria-label="${escapeAttribute(t('nav.notifications'))}" title="${escapeAttribute(t('nav.notifications'))}">♢${notifications ? `<span class="sr-only">${escapeHtml(localized(ctx, '{count} unread', '{count} 個未讀', { count: notifications }))}</span>` : ''}</button>
        <button class="icon-button" type="button" data-action="navigate" data-surface="settings" aria-label="${escapeAttribute(t('nav.settings'))}" title="${escapeAttribute(t('nav.settings'))}">⚙</button>
      </div>
    </header>`;
}

function renderTab(tab, state, language, ctx) {
  const active = tab.id === state.tabs.activeId;
  const surface = surfaceById(tab.surface ?? 'home');
  const label = tab.label || surfaceLabel(surface, language);
  const groupPinned = Boolean(tab.groupId && state.tabs?.groups?.some((group) => group.id === tab.groupId && group.pinned));
  const effectivelyPinned = Boolean(tab.pinned || groupPinned);
  return `
    <div class="workspace-tab-item${active ? ' selected' : ''}" role="presentation">
      <button
        class="workspace-tab"
        type="button"
        role="tab"
        tabindex="${active ? '0' : '-1'}"
        aria-selected="${active ? 'true' : 'false'}"
        aria-controls="workspace"
        draggable="true"
        data-tab-id="${escapeAttribute(tab.id)}"
        data-appearance-id="tab:${escapeAttribute(tab.id)}"
        title="${escapeAttribute(label)}${effectivelyPinned ? ` · ${escapeAttribute(localized(ctx, 'Pinned'))}` : ''}"
      >
        <span aria-hidden="true">${escapeHtml(surface.glyph)}</span>
        <span class="tab-label">${escapeHtml(label)}</span>
        ${tab.unsaved ? `<span class="tab-dirty" aria-label="${escapeAttribute(localized(ctx, 'Unsaved changes'))}"></span>` : ''}
        ${effectivelyPinned ? `<span class="tab-pin" aria-label="${escapeAttribute(localized(ctx, 'Pinned'))}" title="${escapeAttribute(localized(ctx, 'Pinned'))}">⌖</span>` : ''}
      </button>
      ${effectivelyPinned ? '' : `<button class="tab-close" type="button" data-action="close-tab" data-tab-id="${escapeAttribute(tab.id)}" aria-label="${escapeAttribute(localized(ctx, 'Close {label}', '關閉 {label}', { label }))}">×</button>`}
    </div>`;
}

function renderTabGroup(group, tabs, state, language, ctx) {
  const orderedTabs = [...tabs].sort((left, right) => Number(right.pinned) - Number(left.pinned));
  const activeTab = orderedTabs.find((tab) => tab.id === state.tabs.activeId);
  const visibleTabs = group.collapsed ? (activeTab ? [activeTab] : []) : orderedTabs;
  const groupColor = /^#[0-9a-f]{6}$/i.test(group.color ?? '') ? group.color : '#6750a4';
  return `<section class="tab-group ${group.collapsed ? 'collapsed' : ''} ${group.pinned ? 'pinned' : ''}" data-tab-group-id="${escapeAttribute(group.id)}" data-appearance-id="group:${escapeAttribute(group.id)}" style="--group-color:${escapeAttribute(groupColor)}">
    <button class="tab-group-header" type="button" data-action="toggle-tab-group" data-group-id="${escapeAttribute(group.id)}" aria-expanded="${!group.collapsed}" aria-label="${escapeAttribute(localized(ctx, '{name}, {count} tabs{pinned}', '{name}，{count} 個分頁{pinned}', { name: group.name, count: orderedTabs.length, pinned: group.pinned ? localized(ctx, ', pinned group', '，已固定群組') : '' }))}" draggable="true">
      <span class="group-color" aria-hidden="true"></span><span class="group-name">${escapeHtml(group.name)}</span><span class="group-count">${orderedTabs.length}</span>${group.pinned ? `<span aria-label="${escapeAttribute(localized(ctx, 'Pinned group'))}">⌖</span>` : ''}<span aria-hidden="true">${group.collapsed ? '›' : '⌄'}</span>
    </button>
    <div class="tab-group-members" role="group" aria-label="${escapeAttribute(localized(ctx, 'Tabs in {name}', '{name} 入面嘅分頁', { name: group.name }))}">${visibleTabs.map((tab) => renderTab(tab, state, language, ctx)).join('')}</div>
  </section>`;
}

export function renderTabStrip(ctx) {
  const { state, t } = ctx;
  const language = state.preferences?.language ?? 'en';
  const items = state.tabs?.items ?? [];
  const groups = [...(state.tabs?.groups ?? [])].sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));
  const groupIds = new Set(groups.map((group) => group.id));
  const pinned = items.filter((tab) => tab.pinned && (!tab.groupId || !groupIds.has(tab.groupId)));
  const regular = items.filter((tab) => !tab.pinned && (!tab.groupId || !groupIds.has(tab.groupId)));
  const pinnedGroups = groups.filter((group) => group.pinned);
  const regularGroups = groups.filter((group) => !group.pinned);
  return `
    <nav class="tab-chrome" aria-label="${escapeAttribute(t('tabs.label'))}" data-appearance-id="tab-strip">
      <div class="tab-strip" role="tablist" aria-label="${escapeAttribute(localized(ctx, 'Open workspaces', '已開啟工作間'))}">
        ${(pinned.length || pinnedGroups.length) ? `<div class="tab-region pinned">${pinned.map((tab) => renderTab(tab, state, language, ctx)).join('')}${pinnedGroups.map((group) => renderTabGroup(group, items.filter((tab) => tab.groupId === group.id), state, language, ctx)).join('')}</div>` : ''}
        <div class="tab-region regular">${regular.map((tab) => renderTab(tab, state, language, ctx)).join('')}${regularGroups.map((group) => renderTabGroup(group, items.filter((tab) => tab.groupId === group.id), state, language, ctx)).join('')}</div>
      </div>
      <button class="icon-button" type="button" data-action="new-document" aria-label="${escapeAttribute(t('action.newTab'))}" title="${escapeAttribute(t('action.newTab'))}">＋</button>
      <button class="icon-button" type="button" data-action="open-tab-search" aria-label="${escapeAttribute(t('tabs.search'))}" title="${escapeAttribute(t('tabs.search'))}">⌕</button>
      <button class="icon-button" type="button" data-action="tab-overflow" aria-label="${escapeAttribute(localized(ctx, 'Tab actions'))}" title="${escapeAttribute(localized(ctx, 'Tab actions'))}">⋮</button>
    </nav>`;
}

export function renderRail(ctx) {
  const { state, t } = ctx;
  const active = getActiveTab(state)?.surface ?? 'home';
  const language = state.preferences?.language ?? 'en';
  const visible = APP_SURFACES.filter((surface) => !['settings', 'changelog'].includes(surface.id));
  return `
    <nav class="suite-rail" aria-label="${escapeAttribute(t('nav.apps'))}" data-appearance-id="suite-rail">
      ${visible.map((surface) => `
        <button
          class="rail-button"
          type="button"
          data-action="navigate"
          data-surface="${surface.id}"
          aria-current="${active === surface.id ? 'page' : 'false'}"
          title="${escapeAttribute(surfaceLabel(surface, language))}"
        ><span class="glyph" aria-hidden="true">${escapeHtml(surface.glyph)}</span><span class="rail-label">${escapeHtml(surfaceLabel(surface, language))}</span></button>`).join('')}
      <span class="rail-spacer"></span>
      <button class="rail-button" type="button" data-action="navigate" data-surface="changelog" aria-current="${active === 'changelog' ? 'page' : 'false'}"><span class="glyph" aria-hidden="true">✦</span><span class="rail-label">${escapeHtml(t('nav.changelog'))}</span></button>
    </nav>`;
}

export function renderMenuBar(surface, openMenu, ctx = null) {
  const menus = MENUS[surface] ?? [];
  return `<div class="menu-bar" role="menubar" aria-label="${escapeAttribute(localized(ctx, 'Application menu', '應用程式選單'))}">${menus.map((menu) => `
    <button class="menu-button" type="button" role="menuitem" data-action="toggle-menu" data-menu="${escapeAttribute(menu)}" aria-haspopup="menu" aria-expanded="${openMenu === menu ? 'true' : 'false'}">${escapeHtml(localized(ctx, menu))}</button>
  `).join('')}</div>`;
}

export function renderMenuPopover(menu, anchor = {}, ctx = null) {
  const items = MENU_ITEMS[menu] ?? [];
  const surface = ctx?.activeTab?.surface ?? null;
  return `
    <div class="context-menu" role="menu" data-menu-popover="${escapeAttribute(menu)}" style="left:${clamp(anchor.x ?? 12, 8, innerWidth - 260)}px;top:${clamp(anchor.y ?? 80, 8, innerHeight - 420)}px">
      ${items.map((item) => {
        if (item === null) return '<div class="separator" role="separator"></div>';
        const command = staticCommandCapability(item[1], surface);
        const reason = command.enabled ? '' : unsupportedCommandReason(item[1], surface, ctx?.l);
        return `<button type="button" role="menuitem" data-action="${escapeAttribute(item[1])}" ${command.enabled ? '' : `disabled aria-disabled="true" aria-description="${escapeAttribute(reason)}" title="${escapeAttribute(reason)}"`}><span>${escapeHtml(localized(ctx, item[0]))}</span>${reason ? `<small class="command-reason">${escapeHtml(reason)}</small>` : item[2] ? `<span style="margin-left:auto;color:var(--on-surface-variant);font-family:var(--font-mono);font-size:.7rem">${escapeHtml(item[2])}</span>` : ''}</button>`;
      }).join('')}
    </div>`;
}

export function renderToolbar(surface, state, ctx = null) {
  const formatItems = FORMAT_TOOLBAR[surface] ?? [];
  const activeFormats = state.runtime?.activeFormats ?? [];
  const standard = STANDARD_TOOLBAR.map((item) => {
    if (item === null) return '<span class="toolbar-separator" role="separator"></span>';
    const command = staticCommandCapability(item[2], surface);
    const reason = command.enabled ? '' : unsupportedCommandReason(item[2], surface, ctx?.l);
    return `<button class="toolbar-button textual" type="button" data-action="${escapeAttribute(item[2])}" aria-label="${escapeAttribute(localized(ctx, item[1]))}" ${command.enabled ? `title="${escapeAttribute(localized(ctx, item[1]))}"` : `disabled aria-disabled="true" aria-description="${escapeAttribute(reason)}" title="${escapeAttribute(reason)}"`}>${escapeHtml(item[0])}</button>`;
  }).join('');
  const format = formatItems.map((item) => {
    if (item === null) return '<span class="toolbar-separator" role="separator"></span>';
    const [kind, action, label] = item;
    const command = staticCommandCapability(action, surface);
    const reason = command.enabled ? '' : unsupportedCommandReason(action, surface, ctx?.l);
    if (kind === 'select') {
      const options = action === 'font-size' ? ['8', '9', '10', '11', '12', '14', '16', '18', '24', '32', '48']
        : action === 'font-family' ? ['Segoe UI', 'Aptos', 'Arial', 'Georgia', 'Consolas']
          : ['Default paragraph style', 'Title', 'Heading 1', 'Heading 2', 'Body text'];
      return `<select class="toolbar-select" data-action="${escapeAttribute(action)}" aria-label="${escapeAttribute(localized(ctx, action.replaceAll('-', ' '), action.replaceAll('-', ' ')))}" ${command.enabled ? '' : `disabled aria-disabled="true" aria-description="${escapeAttribute(reason)}" title="${escapeAttribute(reason)}"`}>${options.map((option) => `<option ${option === label ? 'selected' : ''}>${escapeHtml(localized(ctx, option))}</option>`).join('')}</select>`;
    }
    return `<button class="toolbar-button" type="button" data-action="${escapeAttribute(action)}" aria-label="${escapeAttribute(localized(ctx, action.replaceAll('-', ' '), action.replaceAll('-', ' ')))}" aria-pressed="${activeFormats.includes(action) ? 'true' : 'false'}" ${command.enabled ? '' : `disabled aria-disabled="true" aria-description="${escapeAttribute(reason)}" title="${escapeAttribute(reason)}"`}>${escapeHtml(label)}</button>`;
  }).join('');
  return `<div class="toolbar" role="toolbar" aria-label="${escapeAttribute(localized(ctx, 'Standard commands', '標準指令'))}">${standard}</div><div class="toolbar" role="toolbar" aria-label="${escapeAttribute(localized(ctx, 'Formatting commands', '格式指令'))}">${format}</div>`;
}

export function renderStatusBar(ctx, parts = []) {
  const { state } = ctx;
  if (state.preferences?.statusBar === false) return '';
  const zoom = state.runtime?.zoom ?? 100;
  return `<footer class="status-bar" data-appearance-id="status-bar">${parts.map((part) => `<span>${escapeHtml(part)}</span>`).join('')}<span class="spacer"></span><label class="zoom-control"><span>${zoom}%</span><input type="range" min="50" max="200" step="10" value="${zoom}" data-action="zoom-range" aria-label="${escapeAttribute(localized(ctx, 'Zoom'))}"></label></footer>`;
}

export function renderShell(ctx, surfaceHtml) {
  return `<div class="app-shell">${renderTopBar(ctx)}${renderTabStrip(ctx)}<div class="shell-body">${renderRail(ctx)}<main id="workspace" class="workspace" role="tabpanel" tabindex="-1">${surfaceHtml}</main></div></div>`;
}
