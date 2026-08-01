import {
  RegexWorkerEvaluator,
  SerializedNarrator,
  beginDocumentSave,
  calendarGrid,
  canUsePersistenceCloseApproval,
  createBulkCloseSafetyKey,
  createHistoryHealthState,
  createKeyedSerialTask,
  createWorkspaceSnapshot,
  createJoinableTask,
  dateInRange,
  dateRangePreset,
  discardDocumentChanges as discardDocumentState,
  evaluateSpreadsheetCell,
  filterCollection as filterCollectionSync,
  flushPersistenceBeforeClose,
  hasPendingPersistence,
  htmlLanguageForMode,
  historyAvailabilityFromResult,
  handleRovingTabKey,
  isWorkspaceEnvelope,
  mergeWorkspaceStates,
  normalizeHistoryDiff,
  normalizeHistoryLabel,
  parseCsvRecords,
  parseTypedDate,
  renderLocalizedCopy,
  renderFormulaToMathML,
  resolveDocumentSaveTarget,
  rollbackDocumentSave,
  selectRangeDate,
  staticCommandCapability,
  transitionHistoryHealth,
  unsupportedCommandReason
} from './core/index.mjs';
import {
  APP_SURFACES,
  CHANGELOG,
  DEFAULT_BASE_ROWS,
  DEFAULT_CALC_CELLS,
  DEFAULT_DRAW_SHAPES,
  DEFAULT_SLIDES,
  DEFAULT_WRITER_HTML,
  DOCUMENT_APPS,
  RELEASE_INFO,
  surfaceById
} from './ui/catalog.mjs';
import {
  escapeHtml,
  getActiveDocument,
  getActiveTab,
  makeId,
  renderMenuPopover,
  renderSearchBox,
  renderShell,
  surfaceLabel
} from './ui/helpers.mjs';
import { openAppearanceEditor, openContextMenu, openRegexBuilder, showModal } from './ui/popovers.mjs';
import { registerAppearanceTargets } from './ui/appearance-targets.mjs';
import { renderSurface } from './ui/surfaces.mjs';

const appRoot = document.querySelector('#app');
const regexEvaluator = new RegexWorkerEvaluator();
const regexFilterCache = new WeakMap();
const regexReportedErrors = new WeakMap();
let regexRefreshQueued = false;
const popoverLayer = document.querySelector('#popover-layer');
const dialogLayer = document.querySelector('#dialog-layer');
const toastLayer = document.querySelector('#toast-layer');
const desktop = window.materialOffice ?? null;

const COPY = {
  'app.subtitle': ['Windows office workspace', 'Windows 辦公工作間'],
  'nav.home': ['Home', '主頁'], 'nav.apps': ['Office surfaces', '辦公畫面'], 'nav.settings': ['Settings', '設定'],
  'nav.changelog': ['Changelog', '更新紀錄'], 'nav.notifications': ['Notifications', '通知'],
  'action.new': ['New', '新增'], 'action.newTab': ['New tab', '新增分頁'], 'action.open': ['Open', '開啟'], 'action.close': ['Close', '關閉'],
  'action.save': ['Save', '儲存'], 'action.export': ['Export', '匯出'], 'action.copy': ['Copy', '複製'],
  'action.reset': ['Reset', '重設'], 'action.cancel': ['Cancel', '取消'], 'action.print': ['Print', '列印'], 'action.dismiss': ['Dismiss', '關閉通知'],
  'action.add': ['Add', '新增'], 'action.duplicate': ['Duplicate', '複製一份'], 'action.refresh': ['Refresh', '重新整理'],
  'action.choose': ['Choose', '選擇'], 'action.advanced': ['Advanced…', '進階…'], 'action.openWindowsSettings': ['Open Windows settings', '開啟 Windows 設定'],
  'action.createDocument': ['Create a document', '建立文件'], 'action.openLibreOffice': ['Open LibreOffice', '開啟 LibreOffice'],
  'action.editLibreOffice': ['Edit in LibreOffice', '用 LibreOffice 編輯'], 'action.editAppearance': ['Edit appearance…', '編輯外觀…'],
  'action.importCsv': ['Import CSV', '匯入 CSV'], 'action.exportCsv': ['Export CSV', '匯出 CSV'],
  'action.theme': ['Toggle theme', '切換主題'],
  'search.global': ['Search tabs, commands, settings, and documents', '搜尋分頁、指令、設定同文件'],
  'search.recent': ['Search recent work', '搜尋最近文件'], 'search.records': ['Search records', '搜尋記錄'],
  'search.commands': ['Search all 2,433 commands', '搜尋全部 2,433 個指令'], 'search.history': ['Search version history', '搜尋版本紀錄'],
  'search.changelog': ['Search every release', '搜尋所有版本'], 'search.settings': ['Search this settings section', '搜尋呢個設定頁'],
  'tabs.label': ['Workspace tabs', '工作分頁'], 'tabs.search': ['Search tabs', '搜尋分頁'], 'tabs.bulkClose': ['Bulk close tabs', '批量關閉分頁'],
  'home.eyebrow': ['Start center', '開始中心'], 'home.title': ['Good to see you', '好耐冇見'],
  'home.description': ['Create, find, and continue local work without sending document content anywhere.', '建立、尋找同繼續本機工作，文件內容唔會傳去其他地方。'],
  'home.heroTitle': ['Office work, with a pulse.', '辦公軟件，今次有心跳。'],
  'home.heroBody': ['Material Office keeps the workspace lively while LibreOffice handles authoritative office formats and native editing.', 'Material Office 令工作間生猛啲，而 LibreOffice 就負責正式辦公格式同原生編輯。'],
  'home.quickCreate': ['Quick create', '快速建立'], 'home.recent': ['Recent work', '最近工作'], 'home.items': ['items', '項目'],
  'home.emptyTitle': ['No recent work yet', '仲未有最近文件'], 'home.emptyBody': ['Create a document or open an existing file. Your recent list will grow here.', '建立文件或者開啟現有檔案，最近清單會喺度慢慢長大。'],
  'panel.properties': ['Properties', '內容'], 'property.character': ['Character', '字元'], 'property.paragraph': ['Paragraph', '段落'],
  'property.font': ['Font', '字型'], 'property.spacing': ['Line spacing', '行距'], 'property.integration': ['LibreOffice integration', 'LibreOffice 整合'],
  'libreoffice.available': ['LibreOffice is available through an explicit verified installation path.', '已經用明確而驗證過嘅路徑連接 LibreOffice。'],
  'libreoffice.unavailable': ['LibreOffice is not available. Internal editing works, but native format conversion is disabled.', '搵唔到 LibreOffice。內部編輯照用得，但原生格式轉換暫時停用。'],
  'status.words': ['words', '字'], 'status.sheets': ['sheets', '工作表'], 'status.slide': ['Slide', '投影片'], 'status.objects': ['objects', '物件'],
  'status.selected': ['selected', '已選取'], 'status.noneSelected': ['Nothing selected', '未選取物件'], 'status.records': ['records', '筆記錄'], 'status.formula': ['Formula', '方程式'],
  'slide.new': ['New slide', '新增投影片'], 'slide.layouts': ['Layouts', '版面配置'], 'slide.present': ['Present', '播放簡報'],
  'base.tools': ['Record tools', '記錄工具'], 'base.description': ['Edit cells directly, add or remove records, and move data through CSV without a remote database.', '直接編輯儲存格、加減記錄，同用 CSV 搬資料，唔使遠端資料庫。'],
  'math.symbols': ['Symbols', '符號'], 'math.command': ['Formula command', '方程式指令'],
  'components.eyebrow': ['Material Design 3', 'Material Design 3'], 'components.title': ['Living components', '活生生嘅元件'],
  'components.description': ['Controls with an appearance ID expose the anchored editor; every demo control here responds and persists.', '有 appearance ID 嘅控制會提供錨定外觀編輯器；呢度每個示範控制都識反應同保存。'],
  'components.buttons': ['Buttons', '按鈕'], 'components.selection': ['Selection controls', '選擇控制'], 'components.fields': ['Fields', '欄位'],
  'components.progress': ['Progress and range', '進度同範圍'], 'components.tokens': ['Semantic color roles', '語意色彩角色'],
  'commands.scopes': ['Feature scopes', '功能範圍'], 'commands.title': ['LibreOffice command explorer', 'LibreOffice 指令總覽'],
  'commands.detail': ['The full command URI is the stable identity. Execution is enabled only when the installed LibreOffice broker confirms support.', '完整指令 URI 係穩定身份；只有安裝咗嘅 LibreOffice broker 確認支援先可以執行。'],
  'commands.run': ['Run command', '執行指令'], 'commands.refine': ['Showing the first 500 matches. Refine the search for a shorter list.', '先顯示頭 500 個結果，收窄搜尋就會短啲。'],
  'commands.noMatch': ['No command matches', '冇指令符合'], 'commands.noMatchBody': ['Change the scope, text, or regular expression.', '改下範圍、文字或者 regular expression。'],
  'history.filters': ['Filters', '篩選'], 'history.date': ['Date range', '日期範圍'], 'history.actions': ['Actions', '操作'],
  'history.title': ['Local version history', '本機版本紀錄'], 'history.revisions': ['revisions', '個版本'], 'history.restore': ['Restore as a new revision', '還原做新版本'],
  'history.noMatch': ['No revision matches', '冇版本符合'], 'history.noMatchBody': ['Date, action, and text filters combine. Clear one or more filters to widen the result.', '日期、操作同文字篩選會一齊計；清除部分條件就會多啲結果。'],
  'dialogs.eyebrow': ['Decision surfaces', '決定畫面'], 'dialogs.title': ['Dialogs that do real work', '真係做到嘢嘅對話框'],
  'dialogs.description': ['Save, print, and settings controls use the correct blocking behavior only when a decision is required.', '儲存、列印同設定只會喺真係要你決定時先阻住流程。'],
  'dialogs.options': ['Options', '選項'], 'dialogs.save': ['Save as', '另存新檔'], 'dialogs.print': ['Print', '列印'],
  'dialogs.fileName': ['File name', '檔案名稱'], 'dialogs.fileType': ['File type', '檔案類型'], 'dialogs.password': ['Save with password', '用密碼儲存'],
  'dialogs.printer': ['Printer', '印表機'], 'dialogs.copies': ['Copies', '份數'], 'dialogs.range': ['Range', '範圍'],
  'changelog.eyebrow': ['Every release', '所有版本'], 'changelog.title': ['Changelog', '更新紀錄'],
  'changelog.description': ['Search, filter, copy, or export exactly what is visible. Version facts never change with the humor level.', '搜尋、篩選、複製或者匯出畫面見到嘅內容；版本事實唔會跟幽默程度改變。'],
  'changelog.noMatch': ['No release matches', '冇版本符合'], 'changelog.noMatchBody': ['Change the date range or search query.', '改下日期範圍或者搜尋內容。'],
  'settings.language': ['Language', '語言'], 'settings.languageDescription': ['Choose English, playful Hong Kong Cantonese, or a compact bilingual layout.', '揀英文、玩味香港廣東話，或者精簡雙語版面。'],
  'settings.englishFunny': ['English funny level', '英文幽默程度'], 'settings.yueFunny': ['Cantonese funny level', '廣東話幽默程度'],
  'settings.funnyDisclosure': ['Levels 1–5 style every category of message, including errors and warnings. Facts and available actions stay exact; reset any time.', '1 至 5 級會影響所有訊息類別，包括錯誤同警告；事實同可用操作保持準確，隨時可以重設。'],
  'settings.appearance': ['Appearance', '外觀'], 'settings.theme': ['Theme', '主題'], 'settings.themeDescription': ['Follow light, dark, or the Windows preference.', '跟淺色、深色，或者 Windows 偏好。'],
  'settings.density': ['Density', '密度'], 'settings.densityDescription': ['Compact for keyboard and mouse, comfortable for larger targets.', '精簡版畀鍵盤滑鼠，舒適版就有大啲嘅操作目標。'],
  'settings.accent': ['Accent color', '強調色'], 'settings.accentDescription': ['Choose continuously or enter a precise color value.', '連續揀色或者輸入準確色值。'],
  'settings.font': ['UI font', '介面字型'], 'settings.fontDescription': ['Use an installed font with CJK-safe fallbacks.', '用已安裝字型，同時保留安全中日韓後備字型。'],
  'settings.everyElement': ['Element appearance', '元件外觀'], 'settings.everyElementDescription': ['Rendered elements with an appearance ID expose this editor from their context action. Shift+right-click a tab opens it directly.', '有 appearance ID 嘅畫面元件會喺內容操作提供呢個編輯器；Shift 加右擊分頁會直接開。'],
  'settings.tabs': ['Tabs and groups', '分頁同群組'], 'settings.tabPersistence': ['Restore tabs', '還原分頁'], 'settings.tabPersistenceDescription': ['Persist order, pins, groups, membership, and collapsed state.', '保存次序、固定、群組、成員同收合狀態。'],
  'settings.masterTabSearch': ['Master tab search', '總分頁搜尋'], 'settings.masterTabSearchDescription': ['Search every open tab with location and pin metadata.', '連位置同固定狀態一齊搜尋所有開啟分頁。'],
  'settings.bulkClose': ['Bulk close', '批量關閉'], 'settings.bulkCloseDescription': ['Preview containing/not-containing matches; pinned and unsaved tabs stay protected by default.', '預覽包含或者不包含嘅結果；固定同未儲存分頁預設受保護。'],
  'settings.history': ['History', '版本紀錄'], 'settings.localHistory': ['Local Git-backed history', '本機 Git 版本紀錄'], 'settings.localHistoryDescription': ['Snapshots live beside app data, never inside your document folder.', '快照放喺 app 資料旁邊，唔會塞入你嘅文件資料夾。'],
  'settings.retention': ['Retention', '保留數量'], 'settings.retentionDescription': ['Maximum revisions retained before an explicit prune.', '明確清理之前最多保留幾多版本。'],
  'settings.pruneNow': ['Prune now…', '而家清理…'],
  'settings.exportHistory': ['Export history', '匯出版本紀錄'], 'settings.exportHistoryDescription': ['Create a durable local copy of revision metadata.', '建立一份持久嘅本機版本資料副本。'],
  'settings.integration': ['Integrations', '整合'], 'settings.externalEditor': ['External editor', '外部編輯器'], 'settings.externalEditorDescription': ['Open the current file or project in a detected or chosen Windows editor.', '用偵測到或者自選嘅 Windows 編輯器開啟目前檔案或專案。'],
  'settings.notifications': ['Notifications', '通知'], 'settings.notificationHistory': ['Notification centre', '通知中心'], 'settings.notificationHistoryDescription': ['Dismissed notices remain reviewable until you clear them.', '已關閉通知會保留畀你翻查，直到你清除。'],
  'settings.dimSum': ['1% dim sum surprise', '1% 點心驚喜'], 'settings.dimSumDescription': ['A local, non-blocking startup delight. It never appears on first run and can be turned off.', '本機、唔阻住你嘅開機小驚喜；首次啟動唔會出現，亦可以關掉。'],
  'settings.narrator': ['Spoken narrator', '語音旁白'], 'settings.narratorDescription': ['Off by default. English and Cantonese utterances never overlap.', '預設關閉；英文同廣東話語音永遠唔會重疊。'],
  'settings.accessibility': ['Accessibility', '無障礙'], 'settings.reducedMotion': ['Reduced motion', '減少動態效果'], 'settings.reducedMotionDescription': ['Remove decorative movement while keeping state changes clear.', '移除裝飾動態，但狀態變化仍然清楚。'],
  'settings.scale': ['Interface scale', '介面比例'], 'settings.scaleDescription': ['Validate and use the app at 100%, 125%, 150%, 175%, or 200%.', '用 100%、125%、150%、175% 或 200% 驗證同使用介面。'],
  'settings.highContrast': ['Windows high contrast', 'Windows 高對比'], 'settings.highContrastDescription': ['Native forced-color mode bypasses decorative Material painting.', '原生強制色彩模式會跳過裝飾性 Material 繪製。']
};

function localize(copy, facts = {}, options = {}) {
  return renderLocalizedCopy(copy, {
    mode: state.preferences.language,
    funnyLevels: state.preferences.funny,
    facts,
    ...options
  });
}

function tr(key, facts = {}, options = {}) {
  return localize(COPY[key] ?? [key, key], facts, options);
}

function inlineCopy(english, cantonese, facts = {}, options = {}) {
  return localize([english, cantonese], facts, options);
}

function dialogText(english, cantonese, facts = {}, options = {}) {
  return escapeHtml(inlineCopy(english, cantonese, facts, options));
}

function showAppModal(options) {
  return showModal({ ...options, closeLabel: tr('action.close') });
}

function legacyCopyPair(value, { cantoneseTechnicalFallback = false } = {}) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value;
  const text = String(value ?? '');
  if (text === RELEASE_INFO.codeName || text === RELEASE_INFO.alt) return [text, text];
  const separator = text.indexOf(' · ');
  if (separator > 0 && /[\u3400-\u9fff]/u.test(text.slice(separator + 3))) {
    return [text.slice(0, separator), text.slice(separator + 3)];
  }
  return [text, cantoneseTechnicalFallback && text ? `技術詳情：${text}` : text];
}

function initialSearch() { return { mode: 'plain', query: '', pattern: '', flags: 'i', sample: '', open: false }; }

function sampleDocuments(now = new Date().toISOString()) {
  void now;
  return [];
}

function createDefaultUiState() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    preferences: {
      theme: 'light', density: 'compact', accent: '#6750a4', fontFamily: 'Segoe UI Variable', fontScale: 1, fontWeight: 430,
      language: 'en', funny: { en: 1, yue: 2 }, dimSumSurprise: true, reducedMotion: false, scale: 100,
      statusBar: true, propertiesPanel: true, historyEnabled: true, historyRetention: 1000, narrator: { enabled: false, language: 'en' }, firstRunComplete: false
    },
    tabs: { activeId: 'tab-home', items: [{ id: 'tab-home', surface: 'home', label: 'Home', pinned: true, groupId: null, unsaved: false }], groups: [], searches: { currentStrip: initialSearch(), groupNames: initialSearch(), master: initialSearch(), groups: {} } },
    documents: sampleDocuments(now),
    records: {}, notifications: [], appearance: {}, appearancePresets: {}, history: { entries: [] },
    searches: {
      global: initialSearch(), recent: initialSearch(), base: initialSearch(), commands: initialSearch(), history: initialSearch(), changelog: initialSearch(),
      'settings-language': initialSearch(), 'settings-appearance': initialSearch(), 'settings-tabs': initialSearch(), 'settings-history': initialSearch(),
      'settings-integration': initialSearch(), 'settings-notifications': initialSearch(), 'settings-accessibility': initialSearch()
    },
    runtime: { openMenu: null, menuAnchor: null, zoom: 100, statusMessage: '', settingsSection: 'language', dialogDemo: 'options', commandScope: 'all', componentDemo: { check: true, radio: 'design', toggle: true, slider: 62, field: '' } }
  };
}

let state = createDefaultUiState();
let features = [];
let libreOffice = { available: false, guiAvailable: false, conversionAvailable: false, errors: [] };
let externalEditors = [];
let capabilities = { platform: 'win32', localHistory: Boolean(desktop) };
let persistTimer = null;
let persistGeneration = 0;
let persistedGeneration = 0;
let persistRunning = false;
let workspaceRevision = null;
let workspaceBaseState = null;
let workspaceConflict = null;
let workspaceMergeNoticePending = false;
let workspaceUnavailableNotified = false;
let workspaceReady = false;
let workspaceRestoreRunning = false;
let pendingWorkspaceEnvelope = null;
const knownWorkspaceRevisions = new Set();
let toastTimers = new Map();
let dragState = null;
let lastFocusedElement = null;
let approvedWindowClose = null;
let windowCloseRunning = false;
let windowClosePromptOpen = false;
let windowCloseAttemptCounter = 0;
let activeWindowCloseAttempt = null;
let appearanceObserver = null;
let activeNarrationResolve = null;
let historyHealth = createHistoryHealthState(Boolean(capabilities.localHistory));
let historyView = { revision: null, diff: null, loading: false, error: null };
const MAX_PERSISTENCE_PASSES_PER_FLUSH = 8;

function narrationShouldYield() {
  return !state.preferences.narrator?.enabled
    || !('speechSynthesis' in window)
    || state.preferences.narrator?.quiet === true
    || state.preferences.reducedSound === true
    || document.documentElement.dataset.screenReader === 'active';
}

const narrator = new SerializedNarrator({
  debounceMs: 180,
  cooldownMs: 2400,
  shouldYield: narrationShouldYield,
  cancel: () => {
    window.speechSynthesis?.cancel?.();
    activeNarrationResolve?.();
    activeNarrationResolve = null;
  },
  speak: ({ text, lang }) => new Promise((resolve) => {
    if (narrationShouldYield()) { resolve(); return; }
    const finish = () => {
      if (activeNarrationResolve === finish) activeNarrationResolve = null;
      resolve();
    };
    activeNarrationResolve = finish;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  })
});

function mergeUiState(saved) {
  if (!saved || typeof saved !== 'object' || saved.schemaVersion !== 1) return createDefaultUiState();
  const defaults = createDefaultUiState();
  const merged = {
    ...defaults, ...saved,
    preferences: { ...defaults.preferences, ...(saved.preferences ?? {}), funny: { ...defaults.preferences.funny, ...(saved.preferences?.funny ?? {}) }, narrator: { ...defaults.preferences.narrator, ...(saved.preferences?.narrator ?? {}) } },
    tabs: { ...defaults.tabs, ...(saved.tabs ?? {}), items: Array.isArray(saved.tabs?.items) ? saved.tabs.items.slice(0, 500) : defaults.tabs.items, groups: Array.isArray(saved.tabs?.groups) ? saved.tabs.groups.slice(0, 100) : [], searches: { ...defaults.tabs.searches, ...(saved.tabs?.searches ?? {}) } },
    documents: Array.isArray(saved.documents) ? saved.documents.slice(0, 2000).map(({ path: _path, filePath: _filePath, ...document }) => {
      const content = document.content && typeof document.content === 'object' ? document.content : defaultContent(document.type ?? 'writer');
      const hasSavedBaseline = Object.hasOwn(document, 'savedContent');
      return {
        ...document,
        content,
        savedContent: hasSavedBaseline ? (document.savedContent === null ? null : structuredClone(document.savedContent)) : (document.unsaved ? null : structuredClone(content)),
        nativeFileAvailable: Boolean(document.nativeFileAvailable),
        nativeFileName: document.nativeFileAvailable ? String(document.nativeFileName ?? document.title ?? '').slice(0, 260) : null
      };
    }) : defaults.documents,
    records: saved.records && typeof saved.records === 'object' ? saved.records : {},
    notifications: Array.isArray(saved.notifications) ? saved.notifications.slice(-500) : [],
    appearance: saved.appearance && typeof saved.appearance === 'object' ? saved.appearance : {},
    appearancePresets: saved.appearancePresets && typeof saved.appearancePresets === 'object' ? saved.appearancePresets : {},
    history: { entries: Array.isArray(saved.history?.entries) ? saved.history.entries.slice(0, 10_000) : [] },
    searches: { ...defaults.searches, ...(saved.searches ?? {}) },
    runtime: { ...defaults.runtime, ...(saved.runtime ?? {}), openMenu: null, menuAnchor: null }
  };
  if (!merged.tabs.items.length) merged.tabs.items = defaults.tabs.items;
  if (!merged.tabs.items.some((tab) => tab.id === merged.tabs.activeId)) merged.tabs.activeId = merged.tabs.items[0].id;
  return merged;
}

function serializableState() {
  return createWorkspaceSnapshot(state);
}

function normalizeFeatures(rows) {
  const scopeNames = { shared: 'Common', writer: 'Writer', calc: 'Calc', sd: 'Draw & Impress', chart: 'Charts', math: 'Math', dbu: 'Base', report: 'Reports', basic: 'Basic IDE', biblio: 'Bibliography' };
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({
    id: `uno-${index}-${String(row[3] ?? '').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40)}`,
    index, name: String(row[0] ?? `Command ${index + 1}`), scopeId: String(row[1] ?? 'shared'), scope: scopeNames[row[1]] ?? 'Common',
    area: String(row[2] ?? 'Command'), command: String(row[3] ?? '').replaceAll('&amp;', '&')
  }));
}

async function initialize() {
  desktop?.workspace?.onChanged?.((envelope) => {
    pendingWorkspaceEnvelope = envelope;
    if (workspaceReady && !persistRunning) {
      queueMicrotask(() => { void processPendingWorkspaceEnvelope(); });
    }
  });
  const featurePromise = fetch('./assets/data/features.json').then((response) => response.ok ? response.json() : []).catch(() => []);
  const jobs = desktop ? await Promise.allSettled([
    desktop.workspace?.get?.(), desktop.documents?.list?.(), desktop.app?.getCapabilities?.(),
    desktop.libreOffice?.availability?.(), desktop.externalEditors?.list?.(), desktop.history?.list?.({ limit: 10_000 }), desktop.changelog?.list?.({})
  ]) : [];
  const value = (index, fallback) => jobs[index]?.status === 'fulfilled' ? jobs[index].value : fallback;
  const workspaceEnvelope = desktop ? value(0, null) : null;
  if (isWorkspaceEnvelope(workspaceEnvelope)) {
    workspaceRevision = workspaceEnvelope.revision;
    rememberWorkspaceRevision(workspaceRevision);
  }
  const saved = desktop ? workspaceEnvelope?.state ?? null : JSON.parse(localStorage.getItem('material-office-workspace') || 'null');
  state = mergeUiState(saved);
  if (desktop) {
    const metadata = value(1, []);
    if (Array.isArray(metadata)) {
      for (const item of metadata) {
        const existing = state.documents.find((document) => document.id === item.id);
        if (existing) Object.assign(existing, { title: item.title, nativeFileAvailable: Boolean(item.nativeFileAvailable), nativeFileName: item.nativeFileName ?? null, updatedAt: item.updatedAt, type: item.kind ?? existing.type });
        else { const content = defaultContent(item.kind ?? 'writer'); state.documents.push({ id: item.id, type: item.kind ?? 'writer', title: item.title, nativeFileAvailable: Boolean(item.nativeFileAvailable), nativeFileName: item.nativeFileName ?? null, createdAt: item.createdAt, updatedAt: item.updatedAt, content, savedContent: structuredClone(content), unsaved: false }); }
      }
    }
    capabilities = value(2, capabilities);
    historyHealth = createHistoryHealthState(true);
    libreOffice = value(3, libreOffice);
    externalEditors = value(4, []);
    const historyRows = value(5, []);
    if (Array.isArray(historyRows) && historyRows.length) state.history.entries = historyRows.map(normalizeHistoryEntry);
  }
  features = normalizeFeatures(await featurePromise);
  if (desktop) workspaceBaseState = structuredClone(serializableState());
  const wasFirstRun = !state.preferences.firstRunComplete;
  state.preferences.firstRunComplete = true;
  applyPreferences();
  render();
  installAppearanceObserver();
  workspaceReady = true;
  reportHistoryAvailability(Boolean(capabilities.localHistory), { force: !capabilities.localHistory });
  if (pendingWorkspaceEnvelope) void processPendingWorkspaceEnvelope();
  if (desktop && !workspaceRevision) {
    workspaceUnavailableNotified = true;
    notify({
      type: 'error',
      title: 'Workspace saving is unavailable · 工作間暫時未能儲存',
      message: 'No valid main-process revision was received. Changes remain open in this window and will not overwrite saved data. · 未收到有效主程序版本；變更會留喺呢個視窗，唔會覆蓋已儲存資料。',
      persistent: true,
      localOnly: true
    });
  }
  if (wasFirstRun) {
    notify({ type: 'info', title: ['Welcome', '歡迎'], message: COPY['home.description'], persistent: false });
    queuePersist('first run completed');
  } else {
    maybeShowDimSumSurprise();
  }
  window.__materialOfficeTest = Object.freeze({ getState: () => structuredClone(state), navigate: (surface) => navigate(surface), runSmoke: () => runSmokeTest() });
}

function normalizeHistoryEntry(entry, index = 0) {
  const userLabel = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim().slice(0, 120) : null;
  const action = entry.action ?? entry.subject ?? 'updated';
  return {
    id: entry.revision ?? entry.hash ?? entry.id ?? `history-${index}`,
    hash: entry.revision ?? entry.hash ?? entry.id ?? '', action,
    label: userLabel, displayLabel: userLabel ?? action ?? 'Workspace snapshot', entityTitle: entry.entityTitle ?? 'Material Office workspace',
    createdAt: entry.recordedAt ?? entry.createdAt ?? entry.date ?? new Date().toISOString(), current: entry.current ?? index === 0
  };
}

function defaultContent(type) {
  if (type === 'writer') return { html: DEFAULT_WRITER_HTML };
  if (type === 'calc') {
    const sheet = { id: makeId('sheet'), name: 'Sheet 1', cells: { ...DEFAULT_CALC_CELLS } };
    return { sheets: [sheet], activeSheetId: sheet.id };
  }
  if (type === 'impress') return { slides: structuredClone(DEFAULT_SLIDES), activeSlideId: DEFAULT_SLIDES[0].id };
  if (type === 'draw') return { shapes: structuredClone(DEFAULT_DRAW_SHAPES) };
  if (type === 'base') return { rows: structuredClone(DEFAULT_BASE_ROWS) };
  if (type === 'math') return { formula: 'sqrt(x^2 + y^2) = r' };
  return {};
}

function applyPreferences() {
  const root = document.documentElement;
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  root.lang = htmlLanguageForMode(state.preferences.language);
  root.dir = 'ltr';
  root.dataset.language = state.preferences.language;
  root.dataset.languageMode = state.preferences.language;
  root.dataset.theme = state.preferences.theme === 'system' ? (systemDark ? 'dark' : 'light') : state.preferences.theme;
  root.dataset.density = state.preferences.density;
  root.dataset.reducedMotion = String(Boolean(state.preferences.reducedMotion));
  root.style.setProperty('--primary', state.preferences.accent);
  root.style.setProperty('--font-ui', `"${String(state.preferences.fontFamily).replaceAll('"', '')}", "Segoe UI", "Microsoft JhengHei UI", sans-serif`);
  root.style.setProperty('--font-scale', String(Number(state.preferences.scale ?? 100) / 100));
  root.style.setProperty('--document-zoom', String(Number(state.runtime?.zoom ?? 100) / 100));
  root.style.setProperty('--weight-ui', String(state.preferences.fontWeight ?? 430));
}

function formatRelativeTime(value) {
  const date = new Date(value ?? Date.now()); const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff) || diff < 60_000) return state.preferences.language === 'yue' ? '啱啱' : 'just now';
  const hours = Math.floor(diff / 3_600_000); if (hours < 24) return state.preferences.language === 'yue' ? `${hours} 小時前` : `${hours}h ago`;
  const days = Math.floor(hours / 24); return state.preferences.language === 'yue' ? `${days} 日前` : `${days}d ago`;
}

function formatDateTime(value) {
  try { return new Intl.DateTimeFormat(state.preferences.language === 'yue' ? 'zh-HK' : 'en-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  catch { return String(value); }
}

function countWords(html) {
  const container = document.createElement('div'); container.innerHTML = sanitizeRichHtml(html); const text = container.textContent.trim();
  return text ? text.split(/\s+/u).length : 0;
}

function sanitizeRichHtml(html) {
  const template = document.createElement('template'); template.innerHTML = String(html ?? '');
  const allowed = new Set(['P', 'DIV', 'BR', 'HR', 'H1', 'H2', 'H3', 'H4', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'SPAN', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
  const safeStyleNames = ['font-weight', 'font-style', 'font-family', 'font-size', 'text-decoration', 'text-decoration-line', 'text-decoration-style', 'text-decoration-color', 'text-align', 'color', 'background-color', 'line-height', 'margin-left'];
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!allowed.has(node.tagName)) { node.replaceWith(...node.childNodes); continue; }
    const safeStyles = [];
    for (const property of safeStyleNames) {
      const value = node.style?.getPropertyValue(property)?.trim();
      if (!value || value.length > 160 || /(?:url|expression|@import|var)\s*\(/i.test(value) || !CSS.supports(property, value)) continue;
      safeStyles.push(`${property}: ${value}`);
    }
    for (const attribute of [...node.attributes]) {
      const keep = (attribute.name === 'href' && node.tagName === 'A' && /^(?:https?:|mailto:|#)/i.test(attribute.value))
        || (['colspan', 'rowspan'].includes(attribute.name) && /^(?:[1-9]|[1-9][0-9]|100)$/.test(attribute.value))
        || (node.tagName === 'HR' && attribute.name === 'data-page-break' && attribute.value === 'true')
        || (node.tagName === 'HR' && attribute.name === 'aria-label' && attribute.value === 'Page break');
      if (!keep) node.removeAttribute(attribute.name);
    }
    if (safeStyles.length) node.setAttribute('style', safeStyles.join('; '));
    if (node.tagName === 'A') { node.setAttribute('rel', 'noreferrer'); node.setAttribute('target', '_blank'); }
  }
  return template.innerHTML;
}

function evaluateCellForDisplay(address, cells) {
  const result = evaluateSpreadsheetCell(cells, address);
  if (!result.ok) return result.error ?? '#ERROR!';
  if (result.value === null || result.value === undefined) return '';
  if (typeof result.value === 'number') return Number.isInteger(result.value) ? String(result.value) : String(Math.round(result.value * 10000) / 10000);
  return String(result.value);
}

function renderMathSafe(formula) {
  try { return renderFormulaToMathML(String(formula ?? ''), { display: 'block' }); }
  catch (error) { return `<span style="color:var(--error);font-size:1rem">${escapeHtml(error.message)}</span>`; }
}

function searchRequest(search) {
  const mode = search?.mode === 'regex' ? 'regex' : 'plain';
  const query = String(search?.query ?? '').trim();
  return {
    mode,
    query,
    pattern: mode === 'regex' ? String(search?.pattern || query) : '',
    flags: mode === 'regex' ? String(search?.flags ?? 'i') : 'i'
  };
}

function scheduleRegexRefresh(callback = render) {
  if (callback !== render) {
    queueMicrotask(() => callback());
    return;
  }
  if (regexRefreshQueued) return;
  regexRefreshQueued = true;
  queueMicrotask(() => { regexRefreshQueued = false; render(); });
}

function reportRegexFilterError(search, error) {
  const code = error?.code ?? 'REGEX_WORKER_ERROR';
  const key = `${search?.pattern ?? search?.query ?? ''}\u0000${search?.flags ?? ''}\u0000${code}`;
  if (search && typeof search === 'object') {
    if (regexReportedErrors.get(search) === key) return;
    regexReportedErrors.set(search, key);
  }
  notify({
    type: 'error',
    title: 'Regex search stopped · 正則搜尋已停止',
    message: `${code}: ${error?.message ?? String(error)}`,
    persistent: true
  });
}

function filterCollection(collection, search, stringify, { onResolved = render } = {}) {
  const request = searchRequest(search);
  const source = request.mode === 'regex' ? request.pattern : request.query;
  if (!source) return collection;
  const strings = collection.map((item) => String(stringify(item) ?? ''));
  if (request.mode === 'plain') {
    try {
      const indices = filterCollectionSync(strings, request);
      return indices.map((index) => collection[index]);
    } catch { return []; }
  }

  let entries = regexFilterCache.get(search);
  if (!entries) { entries = new Map(); regexFilterCache.set(search, entries); }
  const signature = JSON.stringify([request.pattern, request.flags, strings]);
  let entry = entries.get(signature);
  if (entry?.status === 'resolved') return entry.indices.map((index) => collection[index]);
  if (entry?.status === 'rejected') return [];
  if (entry?.status === 'pending') { entry.callbacks.add(onResolved); return []; }

  entry = { status: 'pending', indices: [], callbacks: new Set([onResolved]) };
  entries.set(signature, entry);
  while (entries.size > 12) entries.delete(entries.keys().next().value);
  regexEvaluator.filter(strings, request, { timeoutMs: 250 }).then((indices) => {
    if (entries.get(signature) !== entry) return;
    entry.status = 'resolved'; entry.indices = indices;
    regexReportedErrors.delete(search);
    for (const callback of entry.callbacks) scheduleRegexRefresh(callback);
    entry.callbacks.clear();
  }).catch((error) => {
    if (entries.get(signature) !== entry) return;
    entry.status = 'rejected'; entry.error = { code: error?.code ?? 'REGEX_WORKER_ERROR', message: error?.message ?? String(error) };
    reportRegexFilterError(search, error);
    for (const callback of entry.callbacks) scheduleRegexRefresh(callback);
    entry.callbacks.clear();
  });
  return [];
}

async function filterCollectionAsync(collection, search, stringify) {
  const request = searchRequest(search);
  const source = request.mode === 'regex' ? request.pattern : request.query;
  if (!source) return collection;
  const strings = collection.map((item) => String(stringify(item) ?? ''));
  try {
    const indices = request.mode === 'regex'
      ? await regexEvaluator.filter(strings, request, { timeoutMs: 250 })
      : filterCollectionSync(strings, request);
    return indices.map((index) => collection[index]);
  } catch (error) {
    reportRegexFilterError(search, error);
    throw error;
  }
}

function buildContext() {
  const activeTab = getActiveTab(state);
  return {
    state, t: tr, l: inlineCopy, features, libreOffice, externalEditors, capabilities, historyHealth: historyHealth.status, historyView, activeTab, document: getActiveDocument(state),
    sanitizeRichHtml, countWords, evaluateSpreadsheetCell: evaluateCellForDisplay, renderMathMl: renderMathSafe,
    renderSearchBox, filterCollection, formatRelativeTime, formatDateTime
  };
}

function render({ preserveFocus = true } = {}) {
  const focusKey = preserveFocus ? focusDescriptor(document.activeElement) : null;
  const activeTab = getActiveTab(state);
  const surface = activeTab?.surface ?? 'home';
  const ctx = buildContext();
  appRoot.innerHTML = renderShell(ctx, renderSurface(surface, ctx));
  appRoot.setAttribute('aria-busy', 'false');
  renderToasts();
  registerAppearanceTargets(appearanceContainers());
  applyAppearanceOverrides();
  applySettingsSearchFilter();
  if (focusKey) restoreFocus(focusKey);
}

function appearanceContainers() {
  return [appRoot, popoverLayer, dialogLayer, toastLayer];
}

function installAppearanceObserver() {
  if (appearanceObserver) return;
  appearanceObserver = new MutationObserver(() => {
    registerAppearanceTargets(appearanceContainers());
    applyAppearanceOverrides();
  });
  appearanceContainers().forEach((container) => appearanceObserver.observe(container, { childList: true, subtree: true }));
}

function focusDescriptor(element) {
  if (!element || element === document.body) return null;
  if (element.id) return { selector: `#${CSS.escape(element.id)}` };
  if (element.hasAttribute?.('data-date-scope') && element.hasAttribute?.('data-date-bound')) {
    return { selector: `[data-date-scope="${CSS.escape(element.dataset.dateScope)}"][data-date-bound="${CSS.escape(element.dataset.dateBound)}"]` };
  }
  for (const key of ['data-action', 'data-search-id', 'data-tab-id', 'data-cell', 'data-slide-field', 'data-math-editor', 'data-shape-id']) {
    if (element.hasAttribute?.(key)) return { selector: `[${key}="${CSS.escape(element.getAttribute(key))}"]` };
  }
  return null;
}

function restoreFocus(descriptor) { queueMicrotask(() => document.querySelector(descriptor.selector)?.focus?.()); }

function dateScopeState(scope) {
  return {
    from: String(state.runtime[`${scope}From`] ?? ''),
    to: String(state.runtime[`${scope}To`] ?? '')
  };
}

function applyDateRange(scope, range, { persist = true } = {}) {
  const from = String(range?.from ?? '');
  const to = String(range?.to ?? '');
  state.runtime[`${scope}From`] = from;
  state.runtime[`${scope}To`] = to;
  state.runtime[`${scope}FromInput`] = from;
  state.runtime[`${scope}ToInput`] = to;
  state.runtime[`${scope}DateValidation`] = null;
  if (persist) queuePersist(`${scope} date range changed`);
}

function syncTypedDateRange(scope, changedBound) {
  const locale = htmlLanguageForMode(state.preferences.language);
  const fromInput = String(state.runtime[`${scope}FromInput`] ?? state.runtime[`${scope}From`] ?? '');
  const toInput = String(state.runtime[`${scope}ToInput`] ?? state.runtime[`${scope}To`] ?? '');
  const from = parseTypedDate(fromInput, locale);
  const to = parseTypedDate(toInput, locale);
  const invalidBound = [changedBound, changedBound === 'from' ? 'to' : 'from'].find((bound) => {
    const result = bound === 'from' ? from : to;
    return result.status === 'partial' || result.status === 'invalid';
  });
  if (invalidBound) {
    const result = invalidBound === 'from' ? from : to;
    state.runtime[`${scope}DateValidation`] = { bound: invalidBound, status: result.status };
    return false;
  }
  if (from.iso && to.iso && from.iso > to.iso) {
    state.runtime[`${scope}DateValidation`] = { bound: changedBound, status: 'order' };
    return false;
  }
  state.runtime[`${scope}From`] = from.iso ?? '';
  state.runtime[`${scope}To`] = to.iso ?? '';
  state.runtime[`${scope}DateValidation`] = null;
  queuePersist(`${scope} typed date range changed`);
  return true;
}

function openDateRangePicker(anchor, scope) {
  if (!['history', 'changelog'].includes(scope)) return;
  const current = dateScopeState(scope);
  const cursorValue = state.runtime[`${scope}CalendarCursor`] || current.from || current.to || new Date().toISOString().slice(0, 10);
  let cursor = /^\d{4}-\d{2}-\d{2}$/.test(cursorValue) ? cursorValue : new Date().toISOString().slice(0, 10);
  const root = document.createElement('section');
  root.className = 'popover date-range-popover';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  root.setAttribute('aria-label', inlineCopy('Choose a date range', '選擇日期範圍'));
  const rect = anchor?.getBoundingClientRect?.() ?? { left: 16, top: 70, bottom: 70 };
  root.style.left = `${Math.max(10, Math.min(rect.left, innerWidth - 390))}px`;
  root.style.top = `${Math.max(10, Math.min(rect.bottom + 8, innerHeight - 560))}px`;
  popoverLayer.replaceChildren(root);
  anchor?.setAttribute('aria-expanded', 'true');

  const locale = htmlLanguageForMode(state.preferences.language);
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const dayLabelFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' });

  function close({ focus = true } = {}) {
    popoverLayer.replaceChildren();
    const nextAnchor = document.querySelector(`[data-action="open-date-range"][data-date-scope="${CSS.escape(scope)}"]`);
    nextAnchor?.setAttribute('aria-expanded', 'false');
    if (focus) nextAnchor?.focus?.();
  }

  function moveMonth(delta) {
    const date = new Date(`${cursor}T00:00:00Z`);
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + delta);
    cursor = date.toISOString().slice(0, 10);
    state.runtime[`${scope}CalendarCursor`] = cursor;
    paint();
  }

  function paint() {
    const date = new Date(`${cursor}T00:00:00Z`);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const range = dateScopeState(scope);
    const days = calendarGrid(year, month);
    const weekdayNames = days.slice(0, 7).map((day) => weekdayFormat.format(new Date(`${day.iso}T00:00:00Z`)));
    root.innerHTML = `<header class="popover-header"><h2>${escapeHtml(inlineCopy('Date range', '日期範圍'))}</h2><button class="icon-button" type="button" data-date-close aria-label="${escapeHtml(tr('action.close'))}">×</button></header>
      <div class="date-calendar-jump"><button class="icon-button" type="button" data-date-month="-1" aria-label="${escapeHtml(inlineCopy('Previous month', '上個月'))}">‹</button><strong aria-live="polite">${escapeHtml(monthFormat.format(date))}</strong><button class="icon-button" type="button" data-date-month="1" aria-label="${escapeHtml(inlineCopy('Next month', '下個月'))}">›</button></div>
      <div class="date-calendar-jump"><label class="field"><span>${escapeHtml(inlineCopy('Month', '月份'))}</span><select data-date-jump-month>${Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}" ${index + 1 === month ? 'selected' : ''}>${escapeHtml(new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2020, index, 1))))}</option>`).join('')}</select></label><label class="field"><span>${escapeHtml(inlineCopy('Year', '年份'))}</span><input data-date-jump-year type="number" min="1900" max="2200" value="${year}"></label></div>
      <div class="date-calendar-grid" role="grid" aria-label="${escapeHtml(monthFormat.format(date))}">${weekdayNames.map((name) => `<span class="date-weekday" role="columnheader">${escapeHtml(name)}</span>`).join('')}${days.map((day) => `<button type="button" role="gridcell" data-date-day="${day.iso}" tabindex="${day.iso === (range.to || range.from || cursor) ? '0' : '-1'}" class="date-day${day.inMonth ? '' : ' outside'}${dateInRange(day.iso, range) ? ' in-range' : ''}${day.iso === range.from ? ' range-start' : ''}${day.iso === range.to ? ' range-end' : ''}" aria-selected="${dateInRange(day.iso, range)}" aria-label="${escapeHtml(dayLabelFormat.format(new Date(`${day.iso}T00:00:00Z`)))}">${day.day}</button>`).join('')}</div>
      <p class="field-help">${escapeHtml(range.from ? inlineCopy(range.to ? 'Selected: {from} through {to}.' : 'Start selected: {from}. Choose an end date.', range.to ? '已選：{from} 至 {to}。' : '已選開始日期：{from}。請選結束日期。', { from: range.from, to: range.to }) : inlineCopy('Choose a start date, then an end date.', '先揀開始日期，再揀結束日期。'))}</p>
      <div class="date-range-presets" aria-label="${escapeHtml(inlineCopy('Date presets', '日期預設'))}">${[['today', 'Today', '今日'], ['7-days', 'Last 7 days', '最近 7 日'], ['30-days', 'Last 30 days', '最近 30 日'], ['month', 'This month', '今個月'], ['all', 'All dates', '所有日期']].map(([id, en, yue]) => `<button class="token-chip" type="button" data-date-preset="${id}">${escapeHtml(inlineCopy(en, yue))}</button>`).join('')}</div>`;
    root.querySelector('[data-date-close]').addEventListener('click', () => close());
    root.querySelectorAll('[data-date-month]').forEach((button) => button.addEventListener('click', () => moveMonth(Number(button.dataset.dateMonth))));
    root.querySelector('[data-date-jump-month]').addEventListener('change', (event) => {
      const next = new Date(Date.UTC(year, Number(event.target.value) - 1, 1));
      cursor = next.toISOString().slice(0, 10); state.runtime[`${scope}CalendarCursor`] = cursor; paint();
    });
    root.querySelector('[data-date-jump-year]').addEventListener('change', (event) => {
      const nextYear = Math.max(1900, Math.min(2200, Number(event.target.value) || year));
      const next = new Date(Date.UTC(nextYear, month - 1, 1));
      cursor = next.toISOString().slice(0, 10); state.runtime[`${scope}CalendarCursor`] = cursor; paint();
    });
    root.querySelectorAll('[data-date-day]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = selectRangeDate(dateScopeState(scope), button.dataset.dateDay);
        applyDateRange(scope, next);
        if (next.to) { close({ focus: false }); render(); restoreFocus({ selector: `[data-action="open-date-range"][data-date-scope="${CSS.escape(scope)}"]` }); }
        else paint();
      });
      button.addEventListener('keydown', (event) => {
        const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 })[event.key];
        if (!offset) return;
        event.preventDefault();
        const nextDate = new Date(`${button.dataset.dateDay}T00:00:00Z`); nextDate.setUTCDate(nextDate.getUTCDate() + offset);
        const nextIso = nextDate.toISOString().slice(0, 10);
        if (nextDate.getUTCMonth() + 1 !== month) { cursor = nextIso; paint(); }
        root.querySelector(`[data-date-day="${nextIso}"]`)?.focus();
      });
    });
    root.querySelectorAll('[data-date-preset]').forEach((button) => button.addEventListener('click', () => {
      applyDateRange(scope, dateRangePreset(button.dataset.datePreset));
      close({ focus: false }); render(); restoreFocus({ selector: `[data-action="open-date-range"][data-date-scope="${CSS.escape(scope)}"]` });
    }));
  }
  paint();
  queueMicrotask(() => root.querySelector('[data-date-day][tabindex="0"]')?.focus());
}

function applyAppearanceOverrides() {
  for (const [targetId, appearance] of Object.entries(state.appearance ?? {})) {
    if (!appearance) continue;
    const target = document.querySelector(`[data-appearance-id="${CSS.escape(targetId)}"]`); if (!target) continue;
    const mapping = {
      color: 'color', background: 'background', borderColor: 'borderColor', borderStyle: 'borderStyle', fontFamily: 'fontFamily',
      fontSize: 'fontSize', fontWeight: 'fontWeight', fontStyle: 'fontStyle', fontVariantCaps: 'fontVariantCaps',
      fontVariationSettings: 'fontVariationSettings', textTransform: 'textTransform', letterSpacing: 'letterSpacing',
      wordSpacing: 'wordSpacing', lineHeight: 'lineHeight', textAlign: 'textAlign', direction: 'direction', radius: 'borderRadius',
      padding: 'padding', margin: 'margin', borderWidth: 'borderWidth', opacity: 'opacity'
    };
    const unitless = new Set(['fontWeight', 'lineHeight', 'opacity']);
    for (const [key, cssKey] of Object.entries(mapping)) {
      if (appearance[key] !== undefined) target.style[cssKey] = typeof appearance[key] === 'number' && !unitless.has(key) ? `${appearance[key]}px` : String(appearance[key]);
    }
    const decorationLines = [];
    if (appearance.underline && appearance.underline !== 'none') decorationLines.push('underline');
    if (appearance.strike || (appearance.strikeStyle && appearance.strikeStyle !== 'none')) decorationLines.push('line-through');
    if (appearance.overline) decorationLines.push('overline');
    target.style.textDecorationLine = decorationLines.join(' ');
    target.style.textDecorationStyle = appearance.underline !== 'none' ? (appearance.underline ?? 'solid') : (appearance.strikeStyle ?? 'solid');
    if (appearance.decorationColor) target.style.textDecorationColor = appearance.decorationColor;
    target.style.verticalAlign = appearance.baseline === 'super' ? 'super' : appearance.baseline === 'sub' ? 'sub' : 'baseline';
    target.style.position = appearance.baselineOffset ? 'relative' : '';
    target.style.top = appearance.baselineOffset ? `${-Number(appearance.baselineOffset)}px` : '';
    target.style.webkitTextStroke = appearance.outlineWidth ? `${Number(appearance.outlineWidth)}px ${appearance.outlineColor ?? appearance.color ?? 'currentColor'}` : '';
    const shadows = [];
    if (appearance.shadowBlur || appearance.shadowX || appearance.shadowY) shadows.push(`${Number(appearance.shadowX ?? 0)}px ${Number(appearance.shadowY ?? 2)}px ${Number(appearance.shadowBlur ?? 4)}px ${appearance.shadowColor ?? '#00000066'}`);
    if (appearance.glowBlur) shadows.push(`0 0 ${Number(appearance.glowBlur)}px ${appearance.glowColor ?? appearance.color ?? '#6750a4'}`);
    target.style.textShadow = shadows.join(', ');
    target.dataset.appearanceCustom = 'true';
    target.style.setProperty('--appearance-hover-color', appearance.hoverColor ?? '');
    target.style.setProperty('--appearance-hover-background', appearance.hoverBackground ?? '');
    target.style.setProperty('--appearance-focus-color', appearance.focusColor ?? appearance.color ?? '');
  }
}

function applySettingsSearchFilter() {
  const section = state.runtime.settingsSection ?? 'language';
  const search = state.searches[`settings-${section}`] ?? initialSearch();
  const rows = [...document.querySelectorAll('[data-setting-keywords]')];
  if (!search.query) { rows.forEach((row) => { row.hidden = false; }); return; }
  const matching = new Set(filterCollection(rows, search, (row) => row.dataset.settingKeywords).map((row) => row.dataset.settingKeywords));
  rows.forEach((row) => { row.hidden = !matching.has(row.dataset.settingKeywords); });
}

function rememberWorkspaceRevision(revision) {
  if (typeof revision !== 'string') return;
  knownWorkspaceRevisions.add(revision);
  while (knownWorkspaceRevisions.size > 32) {
    knownWorkspaceRevisions.delete(knownWorkspaceRevisions.values().next().value);
  }
}

function replaceWorkspaceState(nextState) {
  const localNotices = state.notifications.filter((notice) => notice.localOnly === true);
  const next = mergeUiState(nextState);
  const knownIds = new Set(next.notifications.map((notice) => notice.id));
  next.notifications.push(...localNotices.filter((notice) => !knownIds.has(notice.id)));
  next.notifications = retainNotificationCapacity(next.notifications);
  state = next;
  applyPreferences();
  render();
}

function workspaceConflictFields(paths) {
  const fields = new Set(paths.map((entry) => (
    /^\$\.([A-Za-z0-9_$]+)/.exec(entry)?.[1] ?? 'workspace data'
  )));
  return [...fields].slice(0, 5).join(', ');
}

function acceptWorkspaceEnvelope(envelope, { mergeNotice = false } = {}) {
  if (!isWorkspaceEnvelope(envelope)) {
    notify({
      type: 'error',
      title: 'Workspace change response was invalid · 工作間變更回應無效',
      message: 'Local edits remain open and saved data was not overwritten. · 本機修改仍然開住，已儲存資料冇被覆蓋。',
      persistent: true,
      localOnly: true
    });
    return 'invalid';
  }
  if (envelope.revision === workspaceRevision || knownWorkspaceRevisions.has(envelope.revision)) {
    return 'current';
  }

  const remoteState = mergeUiState(envelope.state);
  const localState = serializableState();
  const baseState = workspaceBaseState ?? structuredClone(localState);
  const merged = mergeWorkspaceStates(baseState, localState, remoteState);
  replaceWorkspaceState(merged.state);
  if (merged.conflicts.length > 0) {
    const key = JSON.stringify([envelope.revision, merged.conflicts]);
    const shouldNotify = workspaceConflict?.key !== key;
    workspaceConflict = { key, revision: envelope.revision, conflicts: merged.conflicts };
    workspaceMergeNoticePending = false;
    if (shouldNotify) {
      const fields = workspaceConflictFields(merged.conflicts);
      notify({
        type: 'warning',
        title: 'Workspace save paused · 工作間儲存已暫停',
        message: `Another window changed the same fields (${fields}). Your local edits remain open and have not overwritten the newer saved data; review or copy them before reopening this window. · 另一個視窗改咗相同欄位；本機修改仍然開住，亦冇覆蓋較新資料，重新開視窗前請先檢查或複製。`,
        persistent: true,
        localOnly: true
      });
    }
    return 'conflict';
  }

  workspaceRevision = envelope.revision;
  rememberWorkspaceRevision(workspaceRevision);
  workspaceBaseState = structuredClone(remoteState);
  workspaceConflict = null;
  if (mergeNotice) workspaceMergeNoticePending = true;
  return 'merged';
}

async function processPendingWorkspaceEnvelope() {
  if (!workspaceReady || workspaceRestoreRunning || persistRunning || !pendingWorkspaceEnvelope) return;
  const envelope = pendingWorkspaceEnvelope;
  pendingWorkspaceEnvelope = null;
  const hasLocalChanges = persistedGeneration < persistGeneration;
  const outcome = acceptWorkspaceEnvelope(envelope, { mergeNotice: hasLocalChanges });
  if (outcome === 'merged' && hasLocalChanges) await flushWorkspacePersistence();
}

async function reconcileWorkspaceConflict() {
  let latest;
  try {
    latest = await desktop.workspace.get();
  } catch (error) {
    notify({
      type: 'error',
      title: 'Workspace conflict could not be checked · 未能檢查工作間衝突',
      message: `Local edits remain open and saved data was not overwritten: ${error.message}`,
      persistent: true,
      localOnly: true
    });
    return false;
  }
  const outcome = acceptWorkspaceEnvelope(latest, { mergeNotice: true });
  return outcome === 'merged' || outcome === 'current';
}

async function performWorkspacePersistence() {
  persistRunning = true;
  let failedGeneration = null;
  let passes = 0;
  let yieldedForFairness = false;
  try {
    while (persistedGeneration < persistGeneration) {
      if (passes >= MAX_PERSISTENCE_PASSES_PER_FLUSH) {
        yieldedForFairness = true;
        return;
      }
      passes += 1;
      const targetGeneration = persistGeneration;
      if (workspaceRestoreRunning) {
        failedGeneration = targetGeneration;
        return;
      }
      if (!desktop?.workspace?.save) {
        try {
          localStorage.setItem('material-office-workspace', JSON.stringify(serializableState()));
          persistedGeneration = targetGeneration;
        } catch (error) {
          failedGeneration = targetGeneration;
          notify({ type: 'error', title: 'Workspace could not be saved · 工作間未能儲存', message: error.message, persistent: true, localOnly: true });
          return;
        }
        continue;
      }
      if (!workspaceRevision) {
        failedGeneration = targetGeneration;
        if (!workspaceUnavailableNotified) {
          workspaceUnavailableNotified = true;
          notify({
            type: 'error',
            title: 'Workspace saving is unavailable · 工作間暫時未能儲存',
            message: 'Changes remain open in this window and saved data was not overwritten. · 修改仍然開住，已儲存資料冇被覆蓋。',
            persistent: true,
            localOnly: true
          });
        }
        return;
      }
      if (workspaceConflict && !(await reconcileWorkspaceConflict())) {
        failedGeneration = targetGeneration;
        return;
      }

      const snapshot = serializableState();
      try {
        const result = await desktop.workspace.save(workspaceRevision, snapshot);
        if (!isWorkspaceEnvelope(result)) {
          const error = new Error('The main process returned an invalid workspace revision.');
          error.code = 'WORKSPACE_PROTOCOL_INVALID';
          throw error;
        }
        workspaceRevision = result.revision;
        rememberWorkspaceRevision(workspaceRevision);
        workspaceBaseState = structuredClone(result.state);
        workspaceConflict = null;
        workspaceUnavailableNotified = false;
        persistedGeneration = targetGeneration;
        reportHistoryResult(result?.history);
        if (result?.history?.snapshot) prependHistory(normalizeHistoryEntry(result.history.snapshot));
        if (workspaceMergeNoticePending) {
          workspaceMergeNoticePending = false;
          notify({
            type: 'warning',
            title: 'Concurrent workspace changes merged · 同時修改已合併',
            message: 'Another window changed different fields. Both sets are now saved against the latest revision without overwriting either copy. · 另一個視窗改咗唔同欄位；兩邊修改已按最新版本儲存，冇互相覆蓋。',
            persistent: true,
            localOnly: true
          });
        }
      } catch (error) {
        if (workspaceRestoreRunning) {
          failedGeneration = targetGeneration;
          return;
        }
        if (error?.code === 'WORKSPACE_CONFLICT' && await reconcileWorkspaceConflict()) continue;
        failedGeneration = targetGeneration;
        if (error?.code !== 'WORKSPACE_CONFLICT') {
          notify({
            type: 'error',
            title: 'Workspace could not be saved · 工作間未能儲存',
            message: `Your change remains open in this window and saved data was not overwritten: ${error.message}`,
            persistent: true,
            localOnly: true
          });
        }
        return;
      }
    }
  } finally {
    persistRunning = false;
    if (pendingWorkspaceEnvelope) {
      setTimeout(() => { void processPendingWorkspaceEnvelope(); }, 0);
    } else if (yieldedForFairness || (failedGeneration !== null && persistGeneration > failedGeneration)) {
      scheduleWorkspacePersistence(0);
    }
  }
}

const flushWorkspacePersistence = createJoinableTask(performWorkspacePersistence);

function scheduleWorkspacePersistence(delay = 450) {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushWorkspacePersistence();
  }, delay);
}

function queuePersist(action = 'workspace updated') {
  void action;
  persistGeneration += 1;
  scheduleWorkspacePersistence();
  return persistGeneration;
}

function workspacePersistenceState() {
  return {
    scheduled: persistTimer !== null,
    inFlight: persistRunning,
    requestedGeneration: persistGeneration,
    completedGeneration: persistedGeneration
  };
}

function cancelScheduledWorkspacePersistence() {
  clearTimeout(persistTimer);
  persistTimer = null;
}

function hasPendingWorkspacePersistence() {
  return hasPendingPersistence(workspacePersistenceState());
}

function flushWorkspacePersistenceBeforeClose() {
  return flushPersistenceBeforeClose({
    readState: workspacePersistenceState,
    cancelScheduled: cancelScheduledWorkspacePersistence,
    flush: flushWorkspacePersistence
  });
}

function persistPreferences(action = 'settings changed') {
  applyPreferences();
  render();
  return queuePersist(action);
}

function prependHistory(entry) {
  if (!entry?.id || state.history.entries.some((item) => item.id === entry.id)) return;
  for (const item of state.history.entries) item.current = false;
  state.history.entries.unshift({ ...entry, current: true }); state.history.entries = state.history.entries.slice(0, state.preferences.historyRetention ?? 1000);
}

function reportHistoryAvailability(available, { force = false } = {}) {
  if (available === null || available === undefined) return;
  const transition = transitionHistoryHealth(historyHealth, Boolean(available));
  historyHealth = transition.state;
  if ((!available && force) || transition.event === 'degraded') {
    notify({
      type: 'error',
      title: ['Local history is unavailable', '本機版本紀錄暫時不可用'],
      message: ['Your current work remains open, but new local-history revisions are not being recorded. Saving will keep retrying; review this notice before relying on restore.', '目前工作仍然開住，但暫時冇新增本機版本紀錄。儲存會繼續重試；依賴還原功能之前請先留意呢個通知。'],
      persistent: true,
      localOnly: true
    });
  } else if (transition.event === 'healthy') {
    notify({
      type: 'success',
      title: ['Local history recovered', '本機版本紀錄已恢復'],
      message: ['A new local-history revision was recorded successfully. Restore protection is available again.', '已成功記錄新嘅本機版本；還原保護再次可用。'],
      persistent: false,
      localOnly: true
    });
  }
}

function reportHistoryResult(history) {
  reportHistoryAvailability(historyAvailabilityFromResult(history));
}

function markDocumentChanged(documentRecord, action = 'document updated') {
  if (!documentRecord) return;
  documentRecord.updatedAt = new Date().toISOString(); documentRecord.unsaved = true;
  const tab = state.tabs.items.find((item) => item.documentId === documentRecord.id); if (tab) tab.unsaved = true;
  state.runtime.statusMessage = `${documentRecord.title} has unsaved changes.`; queuePersist(action);
}

function retainNotificationCapacity(notifications) {
  const persisted = notifications.filter((notice) => notice.localOnly !== true).slice(-500);
  const local = notifications.filter((notice) => notice.localOnly === true).slice(-20);
  return [...persisted, ...local].sort((left, right) => (
    String(left.createdAt ?? '').localeCompare(String(right.createdAt ?? ''))
  ));
}

function notify({ type = 'info', title, message, facts = {}, persistent = false, action = null, image = null, imageAlt = '', localOnly = false }) {
  const safeImage = image === RELEASE_INFO.image ? image : null;
  const category = ['info', 'success', 'warning', 'error'].includes(type) ? type : 'info';
  const titlePair = legacyCopyPair(title);
  const messagePair = legacyCopyPair(message, { cantoneseTechnicalFallback: true });
  const localizedTitle = localize(titlePair, facts);
  const localizedMessage = localize(messagePair, facts, { category, bilingualSeparator: '\n' });
  const localizedAlt = safeImage ? localize(legacyCopyPair(imageAlt || title), facts) : '';
  const narration = {
    en: `${renderLocalizedCopy(titlePair, { mode: 'en', funnyLevels: state.preferences.funny, facts, category })}. ${renderLocalizedCopy(messagePair, { mode: 'en', funnyLevels: state.preferences.funny, facts, category })}`,
    yue: `${renderLocalizedCopy(titlePair, { mode: 'yue', funnyLevels: state.preferences.funny, facts, category })}。${renderLocalizedCopy(messagePair, { mode: 'yue', funnyLevels: state.preferences.funny, facts, category })}`
  };
  const item = { id: makeId('notice'), type, title: localizedTitle, message: localizedMessage, narration, createdAt: new Date().toISOString(), read: false, dismissed: false, persistent, action, image: safeImage, imageAlt: localizedAlt, ...(localOnly ? { localOnly: true } : {}) };
  state.notifications.push(item); state.notifications = retainNotificationCapacity(state.notifications); renderToasts();
  if (!localOnly) queuePersist('notification recorded');
  if (!persistent) {
    const timer = setTimeout(() => dismissNotification(item.id), type === 'success' ? 4200 : 6500); toastTimers.set(item.id, timer);
  }
  maybeNarrate(item);
  return item.id;
}

function dismissNotification(id) {
  const item = state.notifications.find((notice) => notice.id === id); if (!item) return;
  item.dismissed = true; item.read = true; clearTimeout(toastTimers.get(id)); toastTimers.delete(id); renderToasts();
  if (item.localOnly !== true) queuePersist('notification dismissed');
}

function renderToasts() {
  const visible = state.notifications.filter((notice) => !notice.dismissed).slice(-5);
  toastLayer.innerHTML = visible.map((notice) => `<article class="toast ${escapeHtml(notice.type)}${notice.image ? ' with-image' : ''}" data-toast-id="${escapeHtml(notice.id)}" role="${notice.type === 'error' || notice.type === 'warning' ? 'alert' : 'status'}">${notice.image ? `<img class="toast-image" src="${escapeHtml(notice.image)}" alt="${escapeHtml(notice.imageAlt)}">` : `<span aria-hidden="true">${notice.type === 'error' ? '!' : notice.type === 'success' ? '✓' : notice.type === 'warning' ? '△' : '♢'}</span>`}<span class="toast-copy"><strong>${escapeHtml(notice.title)}</strong><span>${escapeHtml(notice.message)}</span></span><button class="dismiss" data-action="dismiss-notification" data-notification-id="${escapeHtml(notice.id)}" aria-label="${escapeHtml(tr('action.dismiss'))}">×</button></article>`).join('');
}

function maybeNarrate(notice) {
  if (narrationShouldYield()) return;
  const mode = state.preferences.narrator.language ?? state.preferences.language;
  const tracks = mode === 'bilingual'
    ? [{ text: notice.narration?.en ?? `${notice.title}. ${notice.message}`, lang: 'en-CA' }, { text: notice.narration?.yue ?? `${notice.title}. ${notice.message}`, lang: 'zh-HK' }]
    : [{ text: notice.narration?.[mode === 'yue' ? 'yue' : 'en'] ?? `${notice.title}. ${notice.message}`, lang: mode === 'yue' ? 'zh-HK' : 'en-CA' }];
  narrator.enqueue({ category: notice.type, tracks });
}

function maybeShowDimSumSurprise() {
  if (!state.preferences.dimSumSurprise || state.runtime.dimSumShownThisLaunch) return;
  state.runtime.dimSumShownThisLaunch = true;
  const draw = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  if (draw >= 0.01) return;
  const message = state.preferences.language === 'yue'
    ? '今日開工小點心，唔阻你做嘢。'
    : state.preferences.language === 'bilingual'
      ? 'A tiny startup treat that never blocks your work. · 今日開工小點心，唔阻你做嘢。'
      : 'A tiny startup treat that never blocks your work.';
  notify({ type: 'info', title: RELEASE_INFO.codeName, message, persistent: false, image: RELEASE_INFO.image, imageAlt: RELEASE_INFO.alt });
}

initialize().catch((error) => {
  appRoot.innerHTML = `<main class="boot-screen"><div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></div><h1>Material Office could not start</h1><p>${escapeHtml(error.message)}</p><button class="button-label filled" type="button" data-startup-retry>Retry</button></main>`;
  appRoot.querySelector('[data-startup-retry]')?.addEventListener('click', () => location.reload());
});

function openDocumentTab(documentRecord) {
  let tab = state.tabs.items.find((item) => item.documentId === documentRecord.id);
  if (!tab) {
    tab = { id: makeId('tab'), surface: documentRecord.type, documentId: documentRecord.id, label: documentRecord.title, pinned: false, groupId: null, unsaved: Boolean(documentRecord.unsaved) };
    state.tabs.items.push(tab);
  }
  state.tabs.activeId = tab.id;
  render({ preserveFocus: false });
  queuePersist('tab opened');
  queueMicrotask(() => document.querySelector('#workspace')?.focus());
  return tab;
}

function navigate(surface, { newTab = false } = {}) {
  const definition = surfaceById(surface);
  if (definition.kind === 'document') {
    const documentRecord = state.documents.find((item) => item.type === surface);
    return documentRecord ? openDocumentTab(documentRecord) : createInternalDocument(surface);
  }
  let tab = !newTab ? state.tabs.items.find((item) => item.surface === surface && !item.documentId) : null;
  if (!tab) {
    tab = { id: makeId('tab'), surface, label: surfaceLabel(definition, state.preferences.language), pinned: surface === 'home', groupId: null, unsaved: false };
    state.tabs.items.push(tab);
  }
  state.tabs.activeId = tab.id;
  render({ preserveFocus: false });
  queuePersist('navigation changed');
  queueMicrotask(() => document.querySelector('#workspace')?.focus());
  return tab;
}

function createInternalDocument(type = 'writer', title) {
  const definition = surfaceById(type);
  const now = new Date().toISOString();
  const count = state.documents.filter((item) => item.type === type && item.title.startsWith('Untitled')).length + 1;
  const documentRecord = {
    id: makeId('document'), type, title: title || `Untitled ${definition.label} ${count}.${definition.extension ?? 'json'}`,
    nativeFileAvailable: false, nativeFileName: null, createdAt: now, updatedAt: now, content: defaultContent(type), savedContent: null, unsaved: true
  };
  if (type === 'calc') documentRecord.content.activeSheetId = documentRecord.content.sheets[0].id;
  state.documents.push(documentRecord);
  const tab = openDocumentTab(documentRecord); tab.unsaved = true;
  notify({ type: 'success', title: 'Document created · 文件已建立', message: `${documentRecord.title} is ready for editing.`, persistent: false });
  queuePersist('document created');
  return documentRecord;
}

function discardDocumentChanges(tab) {
  return discardDocumentState(state, tab);
}

function closeTab(tabId, { force = false, discardUnsaved = false } = {}) {
  const tab = state.tabs.items.find((item) => item.id === tabId); if (!tab) return false;
  const groupPinned = state.tabs.groups.some((group) => group.id === tab.groupId && group.pinned);
  if ((tab.pinned || groupPinned) && !force) { notify({ type: 'warning', title: 'Pinned tab protected · 固定分頁受保護', message: groupPinned ? 'Unpin its group first or explicitly include pinned tabs in a reviewed bulk close.' : 'Unpin it first or explicitly include pinned tabs in a reviewed bulk close.', persistent: true }); return false; }
  if (tab.unsaved && !force) {
    showAppModal({ layer: dialogLayer, title: inlineCopy('Unsaved changes', '未儲存變更'), decision: true, body: `<p><strong>${escapeHtml(tab.label)}</strong> ${dialogText('has unsaved in-app changes. Save before closing, or explicitly discard them.', '有未儲存嘅 app 內修改。關閉前請先儲存，或者明確放棄修改。')}</p>`, actions: [
      { id: 'cancel', label: tr('action.cancel'), style: 'text' },
      { id: 'discard', label: inlineCopy('Discard and close', '放棄修改並關閉'), style: 'outlined', action: () => closeTab(tabId, { force: true, discardUnsaved: true }) },
      { id: 'save', label: tr('action.save'), style: 'filled', action: () => { saveActiveDocument(tabId).then((saved) => { if (saved) closeTab(tabId, { force: true }); }); } }
    ] });
    return false;
  }
  if (tab.unsaved && discardUnsaved) discardDocumentChanges(tab);
  const index = state.tabs.items.indexOf(tab);
  state.tabs.items.splice(index, 1);
  if (!state.tabs.items.length) state.tabs.items.push({ id: 'tab-home', surface: 'home', label: 'Home', pinned: true, groupId: null, unsaved: false });
  if (state.tabs.activeId === tabId) state.tabs.activeId = state.tabs.items[Math.max(0, index - 1)]?.id ?? state.tabs.items[0].id;
  render({ preserveFocus: false }); queuePersist('tab closed'); return true;
}

function activateTab(tabId) {
  if (!state.tabs.items.some((item) => item.id === tabId)) return;
  state.tabs.activeId = tabId; render({ preserveFocus: false }); queuePersist('active tab changed');
}

async function openFile() {
  if (!desktop?.documents?.open) {
    notify({ type: 'warning', title: 'Native open is unavailable · 暫時冇原生開檔', message: 'This surface needs the packaged Electron runtime.', persistent: true }); return;
  }
  try {
    const result = await desktop.documents.open(); if (result?.canceled) return;
    const metadata = result.metadata;
    if (metadata) {
      let documentRecord = state.documents.find((item) => item.id === metadata.id);
      if (!documentRecord) { const content = defaultContent(metadata.kind ?? 'writer'); documentRecord = { id: metadata.id, type: metadata.kind ?? 'writer', title: metadata.title, nativeFileAvailable: Boolean(metadata.nativeFileAvailable), nativeFileName: metadata.nativeFileName ?? null, createdAt: metadata.createdAt, updatedAt: metadata.updatedAt, content, savedContent: structuredClone(content), unsaved: false }; state.documents.push(documentRecord); }
      else Object.assign(documentRecord, { nativeFileAvailable: Boolean(metadata.nativeFileAvailable), nativeFileName: metadata.nativeFileName ?? null, title: metadata.title, updatedAt: metadata.updatedAt, savedContent: structuredClone(documentRecord.content), unsaved: false });
      openDocumentTab(documentRecord);
    }
    notify({ type: 'success', title: 'Opened in LibreOffice · 已用 LibreOffice 開啟', message: `${metadata?.title ?? 'The selected document'} is open in the verified LibreOffice installation.`, persistent: false });
  } catch (error) { notify({ type: 'error', title: 'Could not open document · 文件開唔到', message: error.message, persistent: true }); }
}

async function performActiveDocumentSave(tabId) {
  const tab = state.tabs.items.find((item) => item.id === tabId);
  const documentRecord = tab?.documentId ? state.documents.find((item) => item.id === tab.documentId) : null;
  if (!documentRecord) {
    const generation = queuePersist('workspace saved'); clearTimeout(persistTimer); persistTimer = null;
    await flushWorkspacePersistence();
    if (persistedGeneration < generation) return false;
    notify({ type: 'success', title: 'Workspace saved · 工作間已儲存', message: 'Tabs, groups, settings, and records are stored locally.', persistent: false });
    return true;
  }
  const transaction = beginDocumentSave(state, tabId);
  const generation = queuePersist('document saved'); clearTimeout(persistTimer); persistTimer = null;
  try {
    await flushWorkspacePersistence();
    if (persistedGeneration < generation) throw new Error('The workspace save is paused until concurrent changes are resolved.');
    const live = resolveDocumentSaveTarget(state, transaction);
    if (live.documentRecord?.nativeFileAvailable && desktop?.documents?.saveMetadata) {
      await desktop.documents.saveMetadata({ id: live.documentRecord.id, title: live.documentRecord.title }).catch(() => undefined);
    }
    render();
    notify({ type: 'success', title: ['Saved', '已儲存'], message: ['{name} saved locally.', '{name} 已儲存喺本機。'], facts: { name: live.documentRecord?.title ?? documentRecord.title }, persistent: false });
    return true;
  } catch (error) {
    rollbackDocumentSave(state, transaction);
    render();
    notify({ type: 'error', title: 'Save failed · 儲存失敗', message: error.message, persistent: true, localOnly: true });
    return false;
  }
}

const runDocumentSave = createKeyedSerialTask((tabId) => performActiveDocumentSave(tabId));

function saveActiveDocument(tabId = state.tabs.activeId) {
  const tab = state.tabs.items.find((item) => item.id === tabId);
  const saveKey = tab?.documentId ? `document:${tab.documentId}` : `workspace:${tabId}`;
  return runDocumentSave(saveKey, tabId);
}

async function handoffLibreOffice(documentRecord = getActiveDocument(state)) {
  if (!desktop?.libreOffice || !libreOffice.available) {
    notify({ type: 'error', title: 'LibreOffice unavailable · 搵唔到 LibreOffice', message: libreOffice.errors?.[0]?.message ?? tr('libreoffice.unavailable'), persistent: true }); return;
  }
  try {
    const result = documentRecord?.nativeFileAvailable
      ? await desktop.libreOffice.launchDocument({ documentId: documentRecord.id })
      : await desktop.libreOffice.launchNew({ kind: documentRecord?.type ?? getActiveTab(state)?.surface ?? 'writer' });
    notify({ type: 'success', title: 'LibreOffice opened · LibreOffice 已開啟', message: result.nativeFileName ? `Editing ${result.nativeFileName}.` : 'A native document window is ready; save it there to create an office-format file.', persistent: false });
  } catch (error) { notify({ type: 'error', title: 'LibreOffice launch failed · LibreOffice 開唔到', message: error.message, persistent: true }); }
}

function downloadBlob(name, type, content) {
  const blob = new Blob([content], { type }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function exportActive(target = 'native') {
  const documentRecord = getActiveDocument(state);
  if (!documentRecord) { downloadBlob('material-office-workspace.json', 'application/json', JSON.stringify(serializableState(), null, 2)); return; }
  if (target === 'pdf') { window.print(); return; }
  if (documentRecord.nativeFileAvailable && desktop?.documents?.export) {
    try {
      const format = target === 'native' ? ({ writer: 'odt', calc: 'ods', impress: 'odp', draw: 'png', math: 'odt', base: 'csv' }[documentRecord.type] ?? 'pdf') : target;
      const result = await desktop.documents.export({ documentId: documentRecord.id, targetFormat: format }); if (result?.canceled) return;
      notify({ type: 'success', title: 'Export complete · 匯出完成', message: `${result.outputName} was produced and validated.`, persistent: false }); return;
    } catch (error) { notify({ type: 'error', title: 'Export failed · 匯出失敗', message: error.message, persistent: true }); return; }
  }
  if (documentRecord.type === 'writer') downloadBlob(`${documentRecord.title.replace(/\.[^.]+$/, '')}.html`, 'text/html', `<!doctype html><meta charset="utf-8"><title>${escapeHtml(documentRecord.title)}</title>${sanitizeRichHtml(documentRecord.content.html)}`);
  else if (documentRecord.type === 'calc') downloadBlob(`${documentRecord.title.replace(/\.[^.]+$/, '')}.csv`, 'text/csv', spreadsheetToCsv(documentRecord));
  else downloadBlob(`${documentRecord.title.replace(/\.[^.]+$/, '')}.material-office.json`, 'application/json', JSON.stringify(documentRecord, null, 2));
  notify({ type: 'success', title: 'Portable export created · 已建立可攜匯出', message: 'The in-app document was exported without claiming an office-format conversion.', persistent: false });
}

function spreadsheetToCsv(documentRecord) {
  const sheet = documentRecord.content.sheets.find((item) => item.id === documentRecord.content.activeSheetId) ?? documentRecord.content.sheets[0];
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return Array.from({ length: 50 }, (_, rowIndex) => Array.from({ length: 20 }, (_, colIndex) => {
    let index = colIndex + 1; let col = ''; while (index) { col = String.fromCharCode(65 + ((index - 1) % 26)) + col; index = Math.floor((index - 1) / 26); }
    return quote(sheet.cells[`${col}${rowIndex + 1}`] ?? '');
  }).join(',')).join('\r\n');
}

function executeEditingCommand(action, value) {
  const editor = document.querySelector('[data-editor="writer"],[data-slide-field]:focus');
  if (!editor) return false;
  const selection = getSelection();
  if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) editor.focus();
  const commands = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough', 'align-left': 'justifyLeft', 'align-center': 'justifyCenter', 'align-right': 'justifyRight', justify: 'justifyFull', 'list-bullets': 'insertUnorderedList', 'list-numbers': 'insertOrderedList', 'select-all': 'selectAll', undo: 'undo', redo: 'redo', cut: 'cut', copy: 'copy', paste: 'paste', 'clear-format': 'removeFormat', 'style-default': 'formatBlock', 'style-h1': 'formatBlock', 'style-h2': 'formatBlock', fontName: 'fontName', fontSize: 'fontSize' };
  const command = commands[action]; if (!command) return false;
  const executed = document.execCommand(command, false, value ?? (action === 'style-h1' ? 'h1' : action === 'style-h2' ? 'h2' : action === 'style-default' ? 'p' : null));
  if (!executed) return false;
  if (!['copy', 'select-all'].includes(action)) updateDocumentFromEditor(editor, `editing command ${action}`);
  state.runtime.activeFormats = state.runtime.activeFormats ?? [];
  if (['bold', 'italic', 'underline', 'strike', 'align-left', 'align-center', 'align-right', 'justify'].includes(action)) {
    state.runtime.activeFormats = state.runtime.activeFormats.includes(action) ? state.runtime.activeFormats.filter((item) => item !== action) : [...state.runtime.activeFormats, action];
    document.querySelectorAll(`[data-action="${CSS.escape(action)}"]`).forEach((button) => button.setAttribute('aria-pressed', String(state.runtime.activeFormats.includes(action))));
  }
  return true;
}

function showNewDocumentDialog() {
  const cards = DOCUMENT_APPS.map((surface) => `<button class="create-button card" data-create-type="${surface.id}" style="width:100%"><span class="app-glyph">${surface.glyph}</span><span><strong>${escapeHtml(surfaceLabel(surface, state.preferences.language))}</strong><small>.${surface.extension}</small></span></button>`).join('');
  const modal = showAppModal({ layer: dialogLayer, title: inlineCopy('New document', '新增文件'), body: `<div class="card-grid" style="grid-template-columns:repeat(2,minmax(180px,1fr))">${cards}</div>`, actions: [{ id: 'cancel', label: tr('action.cancel'), style: 'text' }] });
  modal.querySelectorAll('[data-create-type]').forEach((button) => button.addEventListener('click', () => { dialogLayer.replaceChildren(); createInternalDocument(button.dataset.createType); }));
}

function showNotifications() {
  const items = [...state.notifications].reverse();
  showAppModal({ layer: dialogLayer, title: `${tr('nav.notifications')} · ${items.length}`, body: items.length ? `<div style="display:grid;gap:9px">${items.map((item) => `<article class="card" style="padding:14px"><div style="display:flex;gap:10px"><strong style="flex:1">${escapeHtml(item.title)}</strong><time style="font-size:.7rem;color:var(--on-surface-variant)">${escapeHtml(formatDateTime(item.createdAt))}</time></div><p style="margin:7px 0 0;color:var(--on-surface-variant)">${escapeHtml(item.message)}</p></article>`).join('')}</div>` : `<p>${dialogText('No notifications yet.', '暫時未有通知。')}</p>`, actions: [
    { id: 'mark', label: inlineCopy('Mark all read', '全部標示為已讀'), style: 'text', action: () => { state.notifications.forEach((item) => { item.read = true; }); queuePersist('notifications read'); } },
    { id: 'clear', label: inlineCopy('Clear history', '清除通知紀錄'), style: 'outlined', action: () => { state.notifications = []; renderToasts(); queuePersist('notification history cleared'); } },
    { id: 'close', label: tr('action.close'), style: 'filled' }
  ] });
}

function showGlobalSearch() {
  const globalInput = document.querySelector('[data-search-id="global"]');
  const search = state.searches.global; const query = search.query.trim(); if (!query) { popoverLayer.replaceChildren(); dialogLayer.replaceChildren(); globalInput?.setAttribute('aria-expanded', 'false'); return; }
  dialogLayer.replaceChildren();
  const refresh = { onResolved: () => { if (document.querySelector('[data-search-id="global"]')) showGlobalSearch(); } };
  const tabs = filterCollection(state.tabs.items, search, (item) => `${item.label} ${item.surface}`, refresh);
  const docs = filterCollection(state.documents, search, (item) => `${item.title} ${item.type} ${item.nativeFileName ?? ''}`, refresh);
  const commands = filterCollection(features, search, (item) => `${item.name} ${item.area} ${item.scope}`, refresh).slice(0, 20);
  const surfaces = filterCollection(APP_SURFACES, search, (item) => `${item.label} ${item.yue}`, refresh);
  const results = [
    ...tabs.map((item) => ({ kind: 'tab', id: item.id, label: item.label, meta: `Tab · ${item.surface}` })),
    ...docs.map((item) => ({ kind: 'document', id: item.id, label: item.title, meta: `Document · ${item.type}` })),
    ...surfaces.map((item) => ({ kind: 'surface', id: item.id, label: surfaceLabel(item, state.preferences.language), meta: 'Surface' })),
    ...commands.map((item) => ({ kind: 'command', id: item.id, label: item.name, meta: `${item.scope} · ${item.area}` }))
  ].slice(0, 60);
  const anchor = document.querySelector('[data-search-id="global"]')?.closest('.search-box');
  const rect = anchor?.getBoundingClientRect() ?? { left: 16, bottom: 70, width: 520 };
  const root = document.createElement('section');
  root.className = 'popover global-search-results';
  root.id = 'global-search-results';
  root.setAttribute('role', 'listbox');
  root.setAttribute('aria-label', tr('search.global'));
  root.style.left = `${Math.max(10, Math.min(rect.left, innerWidth - Math.min(rect.width, 720) - 10))}px`;
  root.style.top = `${Math.min(rect.bottom + 7, innerHeight - 300)}px`;
  root.style.width = `${Math.min(Math.max(rect.width, 320), innerWidth - 20)}px`;
  root.innerHTML = `<header class="popover-header"><h2>${escapeHtml(tr('search.global'))}</h2><button class="icon-button" type="button" data-global-close aria-label="Close search results">×</button></header>${results.length ? `<div class="command-list">${results.map((item) => `<button class="command-row" role="option" data-global-kind="${item.kind}" data-global-id="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.label)}</strong><small style="display:block;color:var(--on-surface-variant)">${escapeHtml(item.meta)}</small></span><span>↵</span></button>`).join('')}</div>` : '<p>No result matches the current search.</p>'}`;
  popoverLayer.replaceChildren(root);
  globalInput?.setAttribute('role', 'combobox'); globalInput?.setAttribute('aria-autocomplete', 'list'); globalInput?.setAttribute('aria-controls', root.id); globalInput?.setAttribute('aria-expanded', 'true');
  if (globalInput) globalInput.onkeydown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); root.querySelector('[role="option"]')?.focus(); }
    else if (event.key === 'Enter') { event.preventDefault(); root.querySelector('[role="option"]')?.click(); }
    else if (event.key === 'Escape') { event.preventDefault(); popoverLayer.replaceChildren(); globalInput.setAttribute('aria-expanded', 'false'); }
  };
  root.querySelector('[data-global-close]').addEventListener('click', () => { popoverLayer.replaceChildren(); globalInput?.setAttribute('aria-expanded', 'false'); globalInput?.focus(); });
  root.querySelectorAll('[data-global-kind]').forEach((button) => button.addEventListener('click', () => {
    popoverLayer.replaceChildren();
    if (button.dataset.globalKind === 'tab') activateTab(button.dataset.globalId);
    else if (button.dataset.globalKind === 'document') openDocumentTab(state.documents.find((item) => item.id === button.dataset.globalId));
    else if (button.dataset.globalKind === 'surface') navigate(button.dataset.globalId);
    else { navigate('commands'); state.runtime.selectedCommandId = button.dataset.globalId; render(); }
  }));
}

function openRegexFor(searchId, anchor) {
  const search = searchId.startsWith('tab:') ? tabSearchState(searchId.slice(4)) : (state.searches[searchId] ??= initialSearch());
  openRegexBuilder({ layer: popoverLayer, anchor, searchId, searchState: search, sample: searchId === 'commands' ? features.slice(0, 25).map((item) => item.name).join('\n') : '', localize: inlineCopy, onChange: (next) => {
    if (searchId.startsWith('tab:')) setTabSearchState(searchId.slice(4), next); else state.searches[searchId] = next;
    render(); queuePersist('search pattern changed');
  } });
}

function tabSearchState(scope) {
  if (scope.startsWith('group-')) return state.tabs.searches.groups[scope.slice(6)] ??= initialSearch();
  return state.tabs.searches[scope] ??= initialSearch();
}

function setTabSearchState(scope, value) {
  if (scope.startsWith('group-')) state.tabs.searches.groups[scope.slice(6)] = value;
  else state.tabs.searches[scope] = value;
}

function showTabSearch() {
  const groups = state.tabs.groups ?? [];
  const fields = [
    ['currentStrip', inlineCopy('Current tab strip', '目前分頁列')], ...groups.map((group) => [`group-${group.id}`, inlineCopy('Tabs in {name}', '{name} 入面嘅分頁', { name: group.name })]), ['groupNames', inlineCopy('Tab groups by name', '按名稱搜尋分頁群組')], ['master', inlineCopy('All tabs in the shared workspace', '共用工作間所有分頁')]
  ];
  const body = `<p>${dialogText('Each field owns independent plain-text or regular-expression state and reports the workspace, strip, group, label, and pin state.', '每個欄位都有獨立嘅純文字或 regular expression 狀態，並會顯示工作間、分頁列、群組、名稱同固定狀態。')}</p><div style="display:grid;gap:14px">${fields.map(([scope, label]) => { const spec = tabSearchState(scope); return `<label class="field"><span>${escapeHtml(label)}</span><span class="search-box"><span>⌕</span><input data-tab-search-input="${escapeHtml(scope)}" value="${escapeHtml(spec.query)}" placeholder="${dialogText('Search {label}', '搜尋「{label}」', { label })}"><button class="regex-launch" type="button" data-tab-search-regex="${escapeHtml(scope)}" aria-label="${dialogText('Regular expression builder for {label}', '「{label}」嘅 regular expression 建立器', { label })}">.*</button></span><span data-tab-search-results="${escapeHtml(scope)}"></span></label>`; }).join('')}</div>`;
  const modal = showAppModal({ layer: dialogLayer, title: tr('tabs.search'), body, actions: [{ id: 'bulk', label: tr('tabs.bulkClose'), style: 'outlined', action: () => { setTimeout(showBulkClose, 0); } }, { id: 'close', label: tr('action.close'), style: 'filled' }] });
  const refresh = (scope) => {
    const spec = tabSearchState(scope); let collection;
    if (scope === 'groupNames') collection = groups.map((group) => ({ ...group, label: group.name, surface: 'group', pinned: group.pinned }));
    else if (scope.startsWith('group-')) collection = state.tabs.items.filter((tab) => tab.groupId === scope.slice(6));
    else collection = state.tabs.items;
    const matches = filterCollection(collection, spec, (item) => `${item.label ?? item.name} ${item.surface ?? ''} ${item.pinned ? 'pinned' : ''}`, { onResolved: () => { if (modal.isConnected) refresh(scope); } });
    const output = modal.querySelector(`[data-tab-search-results="${CSS.escape(scope)}"]`); if (!output) return;
    output.innerHTML = matches.slice(0, 12).map((item) => {
      const group = groups.find((candidate) => candidate.id === item.groupId);
      const location = scope === 'groupNames'
        ? inlineCopy('Shared workspace · group header', '共用工作間 · 群組標題')
        : inlineCopy('Shared workspace · primary strip · {group}{pinned}', '共用工作間 · 主要分頁列 · {group}{pinned}', { group: group?.name ?? inlineCopy('ungrouped', '未分組'), pinned: item.pinned || group?.pinned ? inlineCopy(' · pinned', ' · 已固定') : '' });
      return `<button class="command-row" data-result-id="${escapeHtml(item.id)}" data-result-kind="${scope === 'groupNames' ? 'group' : 'tab'}" type="button"><span><strong>${escapeHtml(item.label ?? item.name)}</strong><small style="display:block;color:var(--on-surface-variant)">${escapeHtml(location)}</small></span><span>↵</span></button>`;
    }).join('') || `<small>${dialogText('No matches.', '冇符合結果。')}</small>`;
    output.querySelectorAll('[data-result-id]').forEach((button) => button.addEventListener('click', () => {
      dialogLayer.replaceChildren();
      if (button.dataset.resultKind === 'group') {
        const group = state.tabs.groups.find((item) => item.id === button.dataset.resultId); if (!group) return;
        group.collapsed = false; render({ preserveFocus: false }); queuePersist('tab group revealed from search');
        queueMicrotask(() => document.querySelector(`[data-tab-group-id="${CSS.escape(group.id)}"] .tab-group-header`)?.focus());
      } else activateTab(button.dataset.resultId);
    }));
  };
  modal.querySelectorAll('[data-tab-search-input]').forEach((input) => { input.addEventListener('input', () => { const spec = tabSearchState(input.dataset.tabSearchInput); spec.query = input.value; if (spec.mode === 'regex') spec.pattern = input.value; refresh(input.dataset.tabSearchInput); queuePersist('tab search changed'); }); refresh(input.dataset.tabSearchInput); });
  modal.querySelectorAll('[data-tab-search-regex]').forEach((button) => button.addEventListener('click', () => {
    const scope = button.dataset.tabSearchRegex; const spec = tabSearchState(scope);
    openRegexBuilder({ layer: popoverLayer, anchor: button, searchId: `tab:${scope}`, searchState: spec, sample: state.tabs.items.map((tab) => tab.label).join('\n'), localize: inlineCopy, onChange: (next) => {
      setTabSearchState(scope, next);
      const input = modal.querySelector(`[data-tab-search-input="${CSS.escape(scope)}"]`); if (input) input.value = next.query;
      refresh(scope); queuePersist('tab search pattern changed');
    } });
  }));
}

function showBulkClose() {
  const body = `<label class="field"><span>${dialogText('Visible tab label text', '可見分頁名稱文字')}</span><span class="search-box"><span>⌕</span><input data-bulk-query placeholder="${dialogText('Text to match', '要配對嘅文字')}"><button class="regex-launch" data-bulk-regex aria-label="${dialogText('Open regular expression builder', '開啟 regular expression 建立器')}">.*</button></span></label><div class="demo-row"><label><input type="radio" name="bulk-mode" value="containing" checked> ${dialogText('Close tabs containing text', '關閉包含文字嘅分頁')}</label><label><input type="radio" name="bulk-mode" value="not-containing"> ${dialogText('Close tabs not containing text', '關閉唔包含文字嘅分頁')}</label></div><label><input type="checkbox" data-bulk-pinned> ${dialogText('Include pinned tabs', '包括已固定分頁')}</label><p data-bulk-preview style="color:var(--on-surface-variant)">${dialogText('Enter text to preview the affected tabs.', '輸入文字以預覽受影響分頁。')}</p><div data-bulk-list></div><label data-bulk-discard-review hidden><input type="checkbox" data-bulk-discard-confirm> ${dialogText('I reviewed the list and explicitly discard unsaved in-app changes.', '我已檢查清單，並明確放棄未儲存嘅 app 內修改。')}</label>`;
  const modal = showAppModal({ layer: dialogLayer, title: tr('tabs.bulkClose'), body, decision: true, actions: [{ id: 'cancel', label: tr('action.cancel'), style: 'text' }, { id: 'close', label: inlineCopy('Review and close', '檢查並關閉'), style: 'filled', disabled: true, action: () => false }] });
  const spec = initialSearch(); let affectedIds = []; let previewSafetyKey = null; let evaluationReady = false; let evaluationSequence = 0;
  const effectivelyPinned = (tab) => tab.pinned || state.tabs.groups.some((group) => group.id === tab.groupId && group.pinned);
  const update = async () => {
    const sequence = ++evaluationSequence;
    spec.query = modal.querySelector('[data-bulk-query]').value;
    if (spec.mode === 'regex') spec.pattern = spec.query;
    const inverse = modal.querySelector('[name="bulk-mode"]:checked').value === 'not-containing'; const includePinned = modal.querySelector('[data-bulk-pinned]').checked;
    const closeButton = modal.querySelector('[data-modal-action="close"]'); const preview = modal.querySelector('[data-bulk-preview]'); const list = modal.querySelector('[data-bulk-list]');
    const discardReview = modal.querySelector('[data-bulk-discard-review]'); const discardConfirm = modal.querySelector('[data-bulk-discard-confirm]');
    evaluationReady = false; affectedIds = []; previewSafetyKey = null; closeButton.disabled = true; list.replaceChildren();
    if (!spec.query.trim()) { preview.textContent = inlineCopy('Empty queries never close tabs.', '空白查詢永遠唔會關閉分頁。'); return; }
    preview.textContent = spec.mode === 'regex' ? inlineCopy('Checking the regular expression in a deadline-bounded worker…', '正喺有時限嘅 worker 入面檢查 regular expression…') : inlineCopy('Checking visible tab labels…', '正喺檢查可見分頁名稱…');
    try {
      let matching = await filterCollectionAsync(state.tabs.items, spec, (tab) => tab.label);
      if (sequence !== evaluationSequence || !modal.isConnected) return;
      if (inverse) { const matchingIds = new Set(matching.map((tab) => tab.id)); matching = state.tabs.items.filter((tab) => !matchingIds.has(tab.id)); }
      const affected = matching.filter((tab) => includePinned || !effectivelyPinned(tab));
      affectedIds = affected.map((tab) => tab.id);
      previewSafetyKey = createBulkCloseSafetyKey(state.tabs, {
        query: spec.query,
        mode: spec.mode,
        pattern: spec.pattern,
        flags: spec.flags,
        inverse,
        includePinned,
        affectedIds
      });
      evaluationReady = true;
      const protectedUnsaved = affected.filter((tab) => tab.unsaved);
      discardReview.hidden = protectedUnsaved.length === 0;
      discardConfirm.checked = false;
      preview.textContent = inlineCopy('{affected} tabs match; {unsaved} have unsaved changes and require explicit discard.', '有 {affected} 個分頁符合；其中 {unsaved} 個有未儲存修改，必須明確確認放棄。', { affected: affected.length, unsaved: protectedUnsaved.length });
      list.innerHTML = affected.map((tab) => `<span class="scope-chip">${escapeHtml(tab.label)}${effectivelyPinned(tab) ? ` · ${dialogText('pinned', '已固定')}` : ''}${tab.unsaved ? ` · ${dialogText('unsaved', '未儲存')}` : ''}</span>`).join(' ');
      closeButton.disabled = !affected.length || protectedUnsaved.length > 0;
    } catch (error) {
      if (sequence !== evaluationSequence || !modal.isConnected) return;
      affectedIds = []; previewSafetyKey = null; evaluationReady = false; closeButton.disabled = true;
      preview.textContent = inlineCopy('Nothing can close until the pattern is valid: {message}', 'Pattern 有效之前唔會關閉任何分頁：{message}', { message: error.message });
    }
  };
  modal.querySelector('[data-bulk-query]').addEventListener('input', () => { void update(); }); modal.querySelectorAll('[name="bulk-mode"],[data-bulk-pinned]').forEach((input) => input.addEventListener('change', () => { void update(); }));
  modal.querySelector('[data-bulk-discard-confirm]').addEventListener('change', (event) => { const closeButton = modal.querySelector('[data-modal-action="close"]'); const affected = affectedIds.map((id) => state.tabs.items.find((tab) => tab.id === id)).filter(Boolean); closeButton.disabled = !evaluationReady || !affected.length || (affected.some((tab) => tab.unsaved) && !event.target.checked); });
  modal.querySelector('[data-bulk-regex]').addEventListener('click', (event) => openRegexBuilder({ layer: popoverLayer, anchor: event.currentTarget, searchId: 'bulk-close', searchState: spec, sample: state.tabs.items.map((tab) => tab.label).join('\n'), localize: inlineCopy, onChange: (next) => { Object.assign(spec, next); modal.querySelector('[data-bulk-query]').value = next.query; void update(); } }));
  modal.querySelector('[data-modal-action="close"]').addEventListener('click', () => {
    if (!evaluationReady || !affectedIds.length || !previewSafetyKey) return;
    const inverse = modal.querySelector('[name="bulk-mode"]:checked').value === 'not-containing';
    const includePinned = modal.querySelector('[data-bulk-pinned]').checked;
    const currentSafetyKey = createBulkCloseSafetyKey(state.tabs, {
      query: spec.query,
      mode: spec.mode,
      pattern: spec.pattern,
      flags: spec.flags,
      inverse,
      includePinned,
      affectedIds
    });
    if (currentSafetyKey !== previewSafetyKey) {
      evaluationReady = false;
      modal.querySelector('[data-modal-action="close"]').disabled = true;
      notify({ type: 'warning', title: inlineCopy('Close preview changed', '關閉預覽已改變'), message: inlineCopy('Tab labels, pinning, groups, or unsaved state changed. Review the refreshed list before closing anything.', '分頁名稱、固定狀態、群組或未儲存狀態有變；請重新檢查更新後清單先關閉。'), persistent: true });
      void update();
      return;
    }
    const affected = affectedIds.map((id) => state.tabs.items.find((tab) => tab.id === id)).filter(Boolean);
    if (affected.length !== affectedIds.length) { void update(); return; }
    const unsaved = affected.filter((tab) => tab.unsaved);
    if (unsaved.length && !modal.querySelector('[data-bulk-discard-confirm]').checked) return;
    for (const tab of affected) closeTab(tab.id, { force: true, discardUnsaved: tab.unsaved }); dialogLayer.replaceChildren();
    notify({ type: 'success', title: ['Tabs closed', '分頁已關閉'], message: ['{count} reviewed tabs were closed.', '已關閉 {count} 個經檢查嘅分頁。'], facts: { count: affected.length }, persistent: false });
  });
}

function showTabOverflow(anchor) {
  openContextMenu({ layer: popoverLayer, x: anchor.getBoundingClientRect().right - 240, y: anchor.getBoundingClientRect().bottom + 6, label: inlineCopy('Tab actions', '分頁操作'), items: [
    { id: 'search', glyph: '⌕', label: tr('tabs.search'), action: showTabSearch },
    { id: 'group', glyph: '▣', label: inlineCopy('Create tab group', '建立分頁群組'), action: createTabGroup },
    null, { id: 'bulk', glyph: '×', label: inlineCopy('Close tabs containing or not containing text', '關閉包含或唔包含文字嘅分頁'), action: showBulkClose }
  ] });
}

function createTabGroup(tabId = null) {
  reviewTabGroupName({ tabId });
}

function reviewTabGroupName({ group = null, tabId = null } = {}) {
  const initialName = group?.name ?? inlineCopy('Working set', '工作組合');
  const body = `<label class="field"><span>${dialogText('Group name', '群組名稱')}</span><input data-group-name maxlength="80" value="${escapeHtml(initialName)}" autofocus></label><p class="validation" data-group-name-validation>${dialogText('Enter a name from 1 to 80 characters.', '請輸入 1 至 80 個字元嘅名稱。')}</p>`;
  const modal = showAppModal({
    layer: dialogLayer,
    title: group ? inlineCopy('Rename tab group', '重新命名分頁群組') : inlineCopy('Create tab group', '建立分頁群組'),
    body,
    decision: true,
    actions: [
      { id: 'cancel', label: tr('action.cancel'), style: 'text' },
      { id: 'save', label: group ? inlineCopy('Rename', '重新命名') : inlineCopy('Create', '建立'), style: 'filled', action: () => {
        const name = modal.querySelector('[data-group-name]').value.trim();
        if (!name) {
          const validation = modal.querySelector('[data-group-name-validation]');
          validation.textContent = inlineCopy('A group name is required.', '群組名稱唔可以留空。');
          validation.classList.add('error');
          return false;
        }
        if (group) group.name = name.slice(0, 80);
        else {
          const created = { id: makeId('group'), name: name.slice(0, 80), color: state.preferences.accent, order: state.tabs.groups.length, collapsed: false, pinned: false };
          state.tabs.groups.push(created);
          if (tabId) { const tab = state.tabs.items.find((item) => item.id === tabId); if (tab) tab.groupId = created.id; }
        }
        render(); queuePersist(group ? 'tab group renamed' : 'tab group created');
      } }
    ]
  });
}

function showTabContext(tab, event, anchor = event.currentTarget ?? event.target) {
  if (event.shiftKey) return openAppearanceFor(`tab:${tab.id}`, anchor);
  const groups = state.tabs.groups ?? [];
  const groupPinned = groups.some((group) => group.id === tab.groupId && group.pinned);
  const items = [
    { id: 'pin', glyph: '⌖', label: tab.pinned ? 'Unpin tab' : 'Pin tab', action: () => { tab.pinned = !tab.pinned; render(); queuePersist('tab pin changed'); } },
    { id: 'new-group', glyph: '▣', label: 'Add to new group…', action: () => createTabGroup(tab.id) },
    ...groups.map((group) => ({ id: `group-${group.id}`, glyph: '•', label: `Move to ${group.name}`, action: () => { tab.groupId = group.id; render(); queuePersist('tab moved to group'); } })),
    { id: 'ungroup', glyph: '↤', label: 'Remove from group', disabled: !tab.groupId, action: () => { tab.groupId = null; render(); queuePersist('tab ungrouped'); } },
    null, { id: 'appearance', glyph: '◐', label: 'Edit tab appearance…', action: () => openAppearanceFor(`tab:${tab.id}`, document.querySelector(`[data-tab-id="${CSS.escape(tab.id)}"]`)) },
    { id: 'close', glyph: '×', label: 'Close tab', disabled: tab.pinned || groupPinned, action: () => closeTab(tab.id) }
  ];
  openContextMenu({ layer: popoverLayer, x: event.clientX, y: event.clientY, items, label: `${tab.label} tab menu` });
}

function showGroupContext(group, event, anchor = event.currentTarget ?? event.target) {
  if (event.shiftKey) return openAppearanceFor(`group:${group.id}`, anchor);
  const ordered = [...state.tabs.groups].sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));
  const index = ordered.findIndex((item) => item.id === group.id);
  const move = (offset) => {
    const other = ordered[index + offset]; if (!other) return;
    const currentOrder = Number(group.order ?? index); group.order = Number(other.order ?? index + offset); other.order = currentOrder;
    render(); queuePersist('tab group reordered');
  };
  const rename = () => reviewTabGroupName({ group });
  const changeColor = () => {
    const modal = showAppModal({ layer: dialogLayer, title: inlineCopy('Group color', '群組顏色'), body: `<label class="field"><span>${dialogText('Color', '顏色')}</span><input type="color" data-group-color value="${escapeHtml(/^#[0-9a-f]{6}$/i.test(group.color ?? '') ? group.color : state.preferences.accent)}"></label>`, actions: [
      { id: 'cancel', label: tr('action.cancel'), style: 'text' },
      { id: 'apply', label: inlineCopy('Apply', '套用'), style: 'filled', action: () => { group.color = modal.querySelector('[data-group-color]').value; render(); queuePersist('tab group color changed'); } }
    ] });
  };
  openContextMenu({ layer: popoverLayer, x: event.clientX, y: event.clientY, label: `${group.name} group menu`, items: [
    { id: 'collapse', glyph: group.collapsed ? '›' : '⌄', label: group.collapsed ? 'Expand group' : 'Collapse group', action: () => { group.collapsed = !group.collapsed; render(); queuePersist('tab group collapsed state changed'); } },
    { id: 'pin', glyph: '⌖', label: group.pinned ? 'Unpin group' : 'Pin group', action: () => { group.pinned = !group.pinned; render(); queuePersist('tab group pin changed'); } },
    { id: 'rename', glyph: '✎', label: 'Rename group…', action: rename },
    { id: 'color', glyph: '◉', label: 'Change group color…', action: changeColor },
    { id: 'earlier', glyph: '←', label: 'Move group earlier', disabled: index <= 0, action: () => move(-1) },
    { id: 'later', glyph: '→', label: 'Move group later', disabled: index < 0 || index >= ordered.length - 1, action: () => move(1) },
    null,
    { id: 'appearance', glyph: '◐', label: 'Edit group appearance…', action: () => openAppearanceFor(`group:${group.id}`, document.querySelector(`[data-tab-group-id="${CSS.escape(group.id)}"]`)) },
    { id: 'remove', glyph: '×', label: 'Remove group (keep tabs)', action: () => { state.tabs.items.forEach((tab) => { if (tab.groupId === group.id) tab.groupId = null; }); state.tabs.groups = state.tabs.groups.filter((item) => item.id !== group.id); render(); queuePersist('tab group removed'); } }
  ] });
}

function openAppearanceFor(targetId, anchor) {
  openAppearanceEditor({
    layer: popoverLayer,
    anchor,
    targetId,
    current: state.appearance[targetId] ?? {},
    presets: state.appearancePresets,
    localize: inlineCopy,
    onApply: (id, appearance) => { if (appearance) state.appearance[id] = appearance; else delete state.appearance[id]; render(); queuePersist('appearance changed'); },
    onSavePreset: (name, appearance) => { state.appearancePresets[name] = appearance; queuePersist('appearance preset saved'); },
    onResetAll: () => { state.appearance = {}; state.appearancePresets = {}; render(); queuePersist('all appearance settings reset'); }
  });
}

function openAccentColorPicker(anchor) {
  openAppearanceEditor({
    layer: popoverLayer,
    anchor,
    targetId: 'settings:accent',
    current: { color: state.preferences.accent, background: state.preferences.accent, focusColor: state.preferences.accent },
    presets: state.appearancePresets,
    localize: inlineCopy,
    onApply: (_id, appearance) => {
      const candidate = String(appearance?.color ?? '').trim();
      if (!candidate || !CSS.supports('color', candidate)) {
        notify({ type: 'error', title: 'Accent color is invalid · 強調色無效', message: 'Choose or enter a color that Chromium can render before applying it.', persistent: true });
        return;
      }
      state.preferences.accent = candidate;
      void persistPreferences('accent color changed');
    },
    onSavePreset: (name, appearance) => { state.appearancePresets[name] = appearance; queuePersist('appearance preset saved'); },
    onResetAll: () => { state.preferences.accent = '#6750a4'; void persistPreferences('accent color reset'); }
  });
  popoverLayer.querySelector('[data-panel-tab="color"]')?.click();
}

function showElementAppearanceContext(target, event) {
  if (!target?.dataset?.appearanceId) return false;
  const id = target.dataset.appearanceId;
  const anchorRect = target.getBoundingClientRect();
  const anchorProxy = { getBoundingClientRect: () => anchorRect, focus: () => { if (target.isConnected) target.focus?.(); } };
  if (event.shiftKey) openAppearanceFor(id, target);
  else openContextMenu({
    layer: popoverLayer,
    x: event.clientX,
    y: event.clientY,
    label: inlineCopy('Appearance actions', '外觀操作'),
    items: [
      { id: 'appearance', glyph: '◐', label: inlineCopy('Edit appearance…', '編輯外觀…'), action: () => openAppearanceFor(id, target.isConnected ? target : anchorProxy) },
      { id: 'reset', glyph: '↺', label: inlineCopy('Reset appearance', '重設外觀'), disabled: !state.appearance[id], action: () => { delete state.appearance[id]; render(); queuePersist('appearance reset'); } }
    ]
  });
  return true;
}

function reviewHistoryRestore(id) {
  const entry = state.history.entries.find((item) => item.id === id);
  if (!entry || entry.current) return;
  showAppModal({
    layer: dialogLayer,
    title: inlineCopy('Restore this revision?', '還原呢個版本？'),
    decision: true,
    body: `<p>${dialogText('Restore {label} as the current workspace state.', '將「{label}」還原成目前工作間狀態。', { label: entry.label })}</p><p><strong>${escapeHtml(entry.hash ?? entry.id)}</strong></p><p>${dialogText('The current state remains in append-only local history. Restoring creates a new revision; it never rewrites the selected snapshot.', '目前狀態會保留喺唯讀追加嘅本機版本紀錄。還原會建立新版本，永遠唔會重寫所選快照。')}</p>`,
    actions: [
      { id: 'cancel', label: tr('action.cancel'), style: 'text' },
      { id: 'restore', label: inlineCopy('Restore as new revision', '還原成新版本'), style: 'filled', action: () => { void performHistoryRestore(id); } }
    ]
  });
}

async function performHistoryRestore(id) {
  const entry = state.history.entries.find((item) => item.id === id); if (!entry || entry.current) return;
  if (!desktop?.history?.restore) { notify({ type: 'warning', title: 'Restore unavailable · 暫時還原唔到', message: 'Git-backed restore is available in the packaged Electron runtime.', persistent: true }); return; }
  const barrier = await flushWorkspacePersistenceBeforeClose();
  if (!barrier.persisted) {
    notify({ type: 'error', title: 'Restore paused · 還原已暫停', message: 'Current edits could not be saved into recoverable local history, so nothing was replaced. Resolve the workspace conflict or saving error, then try again.', persistent: true, localOnly: true });
    return;
  }
  const restoreGeneration = barrier.completedGeneration;
  workspaceRestoreRunning = true;
  appRoot.inert = true;
  appRoot.setAttribute('aria-busy', 'true');
  try {
    const restoreResult = await desktop.history.restore({ revision: entry.hash || entry.id });
    if (restoreResult?.restored !== true) {
      throw new Error(inlineCopy('The history service did not acknowledge the restore.', '版本紀錄服務未有確認還原。'));
    }
    const [restored, historyRows] = await Promise.all([
      desktop.workspace.get(),
      desktop.history.list({ limit: 10_000 })
    ]);
    if (!isWorkspaceEnvelope(restored)) throw new Error('The restored workspace revision was invalid.');
    if (persistGeneration !== restoreGeneration) throw new Error('Workspace state changed while the restore barrier was active.');
    workspaceRevision = restored.revision;
    rememberWorkspaceRevision(workspaceRevision);
    workspaceBaseState = mergeUiState(restored.state);
    workspaceConflict = null;
    workspaceMergeNoticePending = false;
    persistedGeneration = restoreGeneration;
    replaceWorkspaceState(restored.state);
    if (Array.isArray(historyRows)) state.history.entries = historyRows.map(normalizeHistoryEntry);
    render({ preserveFocus: false });
    reportHistoryAvailability(restoreResult.historyRecorded === true ? true : restoreResult.historyError ? false : null);
    if (restoreResult.historyRecorded === true) {
      notify({
        type: 'success',
        title: inlineCopy('Restored as a new revision', '已還原成新版本'),
        message: inlineCopy('The previous state is preserved, and this restore is now the newest snapshot.', '先前狀態已保留，而今次還原已成為最新快照。'),
        persistent: false
      });
    } else {
      notify({
        type: 'error',
        title: inlineCopy('Restore applied; history recording failed', '還原已套用；版本紀錄寫入失敗'),
        message: inlineCopy(
          'The selected state is active, but the follow-up append-only history entry failed: {message}',
          '已套用所選狀態，但之後嘅唯讀追加版本寫入失敗：{message}',
          { message: restoreResult.historyError?.message ?? inlineCopy('Unknown history error.', '未知版本紀錄錯誤。') }
        ),
        persistent: true,
        localOnly: true
      });
    }
  } catch (error) { notify({ type: 'error', title: 'Restore failed · 還原失敗', message: error.message, persistent: true }); }
  finally {
    workspaceRestoreRunning = false;
    appRoot.inert = false;
    appRoot.setAttribute('aria-busy', 'false');
    if (pendingWorkspaceEnvelope) queueMicrotask(() => { void processPendingWorkspaceEnvelope(); });
  }
}

async function loadHistoryDiff(id) {
  const entry = state.history.entries.find((item) => item.id === id);
  const revision = entry?.hash || entry?.id;
  if (!entry || !revision) return;
  if (!desktop?.history?.diff) {
    historyView = { revision, diff: null, loading: false, error: inlineCopy('Revision comparison requires the packaged local-history service.', '版本比較需要已封裝嘅本機版本紀錄服務。') };
    render();
    return;
  }
  historyView = { revision, diff: null, loading: true, error: null };
  render();
  try {
    const result = normalizeHistoryDiff(await desktop.history.diff({ revision }), revision);
    historyView = { revision, diff: result, loading: false, error: null };
  } catch (error) {
    const code = String(error?.code ?? 'HISTORY_DIFF_FAILED').replace(/[^A-Z0-9_-]/g, '').slice(0, 64) || 'HISTORY_DIFF_FAILED';
    historyView = { revision, diff: null, loading: false, error: inlineCopy('The comparison could not be loaded ({code}). No private path or unbounded content was shown.', '比較未能載入（{code}）。畫面冇顯示私人路徑或者無限制內容。', { code }) };
  }
  render();
  queueMicrotask(() => document.querySelector('#history-diff-panel')?.focus?.());
}

function reviewHistoryLabel(id) {
  const entry = state.history.entries.find((item) => item.id === id);
  const revision = entry?.hash || entry?.id;
  if (!entry || !revision) return;
  if (!desktop?.history?.label) {
    notify({ type: 'warning', title: ['History labels unavailable', '版本標籤暫時不可用'], message: ['Revision labels require the packaged local-history service.', '版本標籤需要已封裝嘅本機版本紀錄服務。'], persistent: true });
    return;
  }
  const body = `<label class="field"><span>${dialogText('Revision label', '版本標籤')}</span><input data-history-label maxlength="120" value="${escapeHtml(entry.label ?? '')}" autocomplete="off" autofocus aria-describedby="history-label-help history-label-status"></label><p id="history-label-help" class="field-help">${dialogText('Use one line of up to 120 characters. Clear it to return to the automatic action label.', '使用最多 120 個字元嘅單行標籤；清空就會回復自動操作標籤。')}</p><p id="history-label-status" class="validation" aria-live="polite"></p>`;
  const modal = showAppModal({
    layer: dialogLayer,
    title: inlineCopy('Edit revision label', '編輯版本標籤'),
    decision: true,
    body,
    actions: [
      { id: 'cancel', label: tr('action.cancel'), style: 'text' },
      { id: 'save', label: tr('action.save'), style: 'filled', action: () => { void saveHistoryLabel(modal, entry, revision); return false; } }
    ]
  });
  const input = modal.querySelector('[data-history-label]');
  input?.addEventListener('input', () => {
    const status = modal.querySelector('#history-label-status');
    const valid = !/[\r\n\u2028\u2029]/u.test(input.value) && input.value.length <= 120;
    status.className = valid ? 'validation' : 'validation error';
    status.textContent = valid ? '' : inlineCopy('Use a single line of at most 120 characters.', '請使用最多 120 個字元嘅單行標籤。');
    modal.querySelector('[data-modal-action="save"]').disabled = !valid;
  });
}

async function saveHistoryLabel(modal, entry, revision) {
  const input = modal.querySelector('[data-history-label]');
  const status = modal.querySelector('#history-label-status');
  const saveButton = modal.querySelector('[data-modal-action="save"]');
  const label = String(input?.value ?? '').trim();
  if (/[\r\n\u2028\u2029]/u.test(label) || label.length > 120) {
    status.className = 'validation error';
    status.textContent = inlineCopy('Use a single line of at most 120 characters.', '請使用最多 120 個字元嘅單行標籤。');
    input?.focus();
    return;
  }
  saveButton.disabled = true;
  status.className = 'validation';
  status.textContent = inlineCopy('Saving the label locally…', '正喺本機儲存標籤…');
  try {
    normalizeHistoryLabel(await desktop.history.label({ revision, label }), revision, label);
    const historyRows = await desktop.history.list({ limit: 10_000 });
    state.history.entries = Array.isArray(historyRows) ? historyRows.map(normalizeHistoryEntry) : state.history.entries.map((item) => item.id === entry.id ? { ...item, label: label || null, displayLabel: label || item.action } : item);
    dialogLayer.replaceChildren();
    render();
    notify({ type: 'success', title: ['Revision label saved', '版本標籤已儲存'], message: label ? ['The selected revision now uses “{label}”.', '所選版本而家使用「{label}」。'] : ['The custom label was cleared; the automatic action label is visible again.', '自訂標籤已清除；畫面再次顯示自動操作標籤。'], facts: { label }, persistent: false });
  } catch (error) {
    const code = String(error?.code ?? 'HISTORY_LABEL_FAILED').replace(/[^A-Z0-9_-]/g, '').slice(0, 64) || 'HISTORY_LABEL_FAILED';
    status.className = 'validation error';
    status.textContent = inlineCopy('The label was not saved ({code}). Check that it is a safe single line and try again.', '標籤未有儲存（{code}）。請檢查係安全嘅單行文字，再試一次。', { code });
    saveButton.disabled = false;
    input?.focus();
  }
}

function reviewHistoryPrune() {
  const limit = Math.max(10, Math.min(10_000, Number(state.preferences.historyRetention ?? 1000)));
  if (!desktop?.history?.prune) {
    notify({ type: 'warning', title: 'History pruning unavailable · 暫時清理唔到版本', message: 'Pruning requires the packaged app-owned local history service.', persistent: true });
    return;
  }
  const body = `<p>${dialogText('Keep the newest {limit} logical snapshots and permanently remove every older snapshot from Material Office’s isolated local history.', '保留最新 {limit} 個邏輯快照，並由 Material Office 獨立本機版本紀錄永久移除所有更舊快照。', { limit })}</p><p>${dialogText('The current workspace is kept. Removed snapshots cannot be restored after pruning and garbage collection.', '目前工作間會保留。清理同垃圾收集後，已移除快照無法還原。')}</p><label><input type="checkbox" data-history-prune-confirm> ${dialogText('I reviewed the retention limit and understand older snapshots will be permanently removed.', '我已檢查保留數量，明白較舊版本會永久移除。')}</label>`;
  const modal = showAppModal({
    layer: dialogLayer,
    title: inlineCopy('Prune local history?', '清理本機版本紀錄？'),
    body,
    decision: true,
    actions: [
      { id: 'cancel', label: tr('action.cancel'), style: 'text' },
      { id: 'prune', label: inlineCopy('Prune to {limit}', '清理至 {limit} 個版本', { limit }), style: 'filled', disabled: true, action: () => { void pruneHistoryNow(limit); } }
    ]
  });
  const confirmation = modal.querySelector('[data-history-prune-confirm]');
  const pruneButton = modal.querySelector('[data-modal-action="prune"]');
  confirmation.addEventListener('change', () => { pruneButton.disabled = !confirmation.checked; });
}

async function pruneHistoryNow(limit) {
  try {
    const generation = queuePersist('history retention reviewed');
    clearTimeout(persistTimer); persistTimer = null;
    await flushWorkspacePersistence();
    if (persistedGeneration < generation) {
      throw new Error('The retention setting could not be saved safely, so no snapshots were removed.');
    }
    const result = await desktop.history.prune({ limit });
    const historyRows = await desktop.history.list({ limit: 10_000 });
    state.history.entries = Array.isArray(historyRows) ? historyRows.map(normalizeHistoryEntry) : [];
    state.runtime.historySelected = state.history.entries[0]?.id ?? null;
    render({ preserveFocus: false });
    notify({
      type: 'success',
      title: result.pruned ? 'Local history pruned · 本機版本已清理' : 'No history pruning needed · 唔使清理版本',
      message: result.pruned
        ? `${result.prunedCount} older snapshots were removed; ${result.afterCount} newest snapshots remain.`
        : `${result.afterCount} snapshots remain, already within the ${result.limit} snapshot limit.`,
      persistent: false,
      localOnly: true
    });
  } catch (error) {
    notify({ type: 'error', title: 'History pruning failed · 版本清理失敗', message: error.message, persistent: true, localOnly: true });
  }
}

async function refreshLibreOffice() {
  try { libreOffice = await desktop?.libreOffice?.availability?.({ refresh: true }) ?? libreOffice; render(); notify({ type: libreOffice.available ? 'success' : 'warning', title: 'LibreOffice check complete · LibreOffice 檢查完成', message: libreOffice.available ? tr('libreoffice.available') : tr('libreoffice.unavailable'), persistent: !libreOffice.available }); }
  catch (error) { notify({ type: 'error', title: 'LibreOffice check failed · 檢查失敗', message: error.message, persistent: true }); }
}

async function chooseLibreOfficeInstallation() {
  if (!desktop?.libreOffice?.chooseInstallation) {
    notify({ type: 'warning', title: 'Native selection unavailable · 暫時揀唔到', message: 'Choosing a LibreOffice installation requires the packaged Windows app.', persistent: true });
    return;
  }
  try {
    const result = await desktop.libreOffice.chooseInstallation();
    if (result?.canceled) return;
    await refreshLibreOffice();
  } catch (error) {
    notify({ type: 'error', title: 'LibreOffice selection failed · LibreOffice 選擇失敗', message: error.message, persistent: true });
  }
}

async function chooseCustomExternalEditor() {
  if (!desktop?.externalEditors?.chooseCustom) {
    notify({ type: 'warning', title: 'Native editor selection unavailable · 暫時揀唔到編輯器', message: 'Choosing an executable requires the packaged Windows app.', persistent: true });
    return;
  }
  try {
    const result = await desktop.externalEditors.chooseCustom();
    if (result?.canceled || !result?.editor) return;
    externalEditors = await desktop.externalEditors.list();
    state.preferences.preferredEditorId = result.editor.id;
    await persistPreferences('external editor changed');
    notify({ type: 'success', title: 'External editor selected · 已選外部編輯器', message: `${result.editor.name} is now the preferred editor.`, persistent: false });
  } catch (error) {
    notify({ type: 'error', title: 'Editor selection failed · 編輯器選擇失敗', message: error.message, persistent: true });
  }
}

async function openActiveInExternalEditor() {
  const documentRecord = getActiveDocument(state);
  const editorId = state.preferences.preferredEditorId ?? externalEditors[0]?.id;
  if (!documentRecord?.nativeFileAvailable) {
    notify({ type: 'warning', title: 'Save or open a native file first · 請先儲存或開啟原生檔案', message: 'External editors receive only a main-process-owned file capability; unsaved in-app content has no native file yet.', persistent: true });
    return;
  }
  if (!editorId || !desktop?.externalEditors?.openDocument) {
    notify({ type: 'warning', title: 'External editor unavailable · 冇可用外部編輯器', message: 'Choose an installed editor in Integrations before opening the active file.', persistent: true });
    return;
  }
  try {
    const result = await desktop.externalEditors.openDocument({ editorId, documentId: documentRecord.id });
    notify({ type: 'success', title: 'Opened in external editor · 已用外部編輯器開啟', message: `${result?.editor?.name ?? 'The selected editor'} opened ${documentRecord.title}.`, persistent: false });
  } catch (error) {
    notify({ type: 'error', title: 'External editor launch failed · 外部編輯器開唔到', message: error.message, persistent: true });
  }
}

async function saveActiveCustomWordDocument() {
  const tab = getActiveTab(state);
  const document = getActiveDocument(state);
  if (!tab || !document || !desktop?.documents?.saveCustom) return;
  try {
    const result = await desktop.documents.saveCustom({
      documentId: document.id,
      title: document.title ?? `${tab.label ?? 'Untitled'} document`,
      kind: document.type ?? tab.surface ?? 'writer',
      content: document.content
    });
    if (result?.canceled) return;
    notify({
      type: 'success',
      title: inlineCopy('Material Office Word saved', 'Material Office Word 已儲存'),
      message: inlineCopy('{name} contains an append-only Git bundle; every later restore is a new undoable commit.', '{name} 內置唯讀追加 Git bundle；之後每次還原都會成為另一個可以再撤銷嘅 commit。', { name: result.outputName }),
      persistent: false
    });
  } catch (error) {
    notify({ type: 'error', title: inlineCopy('Custom Word save failed', '自訂 Word 儲存失敗'), message: error.message, persistent: true });
  }
}

async function openWindowsContrastSettings() {
  if (!desktop?.windows?.openContrastSettings) {
    notify({ type: 'warning', title: 'Windows Settings unavailable · Windows 設定暫時開唔到', message: 'This action is available in the packaged Windows app.', persistent: true });
    return;
  }
  try { await desktop.windows.openContrastSettings(); }
  catch (error) { notify({ type: 'error', title: 'Windows Settings failed · Windows 設定開唔到', message: error.message, persistent: true }); }
}

async function chooseCsvFile() {
  if (desktop?.files?.chooseCsv) return desktop.files.chooseCsv();
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.csv,text/csv';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) { resolve({ canceled: true }); return; }
      if (file.size > 1_000_000) { resolve({ canceled: false, error: 'CSV input exceeds the 1,000,000-byte browser limit.' }); return; }
      resolve({ canceled: false, file: { name: file.name, extension: '.csv', text: await file.text(), bytes: file.size } });
    }, { once: true });
    input.click();
  });
}

function uniqueBaseRecords(records, existing = []) {
  const used = new Set(existing.map((row) => row.id));
  return records.map((row, index) => {
    const base = String(row.id || `C-${String(index + 1).padStart(3, '0')}`).slice(0, 80);
    let id = base; let suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`.slice(0, 80);
    used.add(id);
    return { ...row, id };
  });
}

async function importBaseCsv() {
  const documentRecord = getActiveDocument(state);
  if (!documentRecord || documentRecord.type !== 'base') return;
  try {
    const choice = await chooseCsvFile();
    if (choice?.canceled) return;
    if (choice?.error) throw new Error(choice.error);
    const records = parseCsvRecords(choice?.file?.text ?? '');
    if (!records.length) throw new Error('The selected CSV contains no data rows.');
    const apply = (replace) => {
      const existing = replace ? [] : (documentRecord.content.rows ?? []);
      const imported = uniqueBaseRecords(records, existing);
      documentRecord.content.rows = replace ? imported : [...existing, ...imported];
      state.runtime.selectedBaseRecord = imported[0]?.id ?? null;
      markDocumentChanged(documentRecord, replace ? 'records replaced from CSV' : 'records imported from CSV');
      render();
      notify({ type: 'success', title: 'CSV imported · CSV 已匯入', message: `${imported.length} records were ${replace ? 'loaded' : 'appended'} from ${choice.file.name}.`, persistent: false });
    };
    showAppModal({ layer: dialogLayer, title: inlineCopy('Import CSV', '匯入 CSV'), decision: true, body: `<p>${dialogText('{count} records were parsed from {name}. Choose whether to append them or replace the active table.', '已由 {name} 解析 {count} 筆記錄。請選擇追加記錄，或者取代目前資料表。', { count: records.length, name: choice.file.name })}</p>`, actions: [
      { id: 'cancel', label: tr('action.cancel'), style: 'text' },
      { id: 'replace', label: inlineCopy('Replace table', '取代資料表'), style: 'outlined', action: () => apply(true) },
      { id: 'append', label: inlineCopy('Append records', '追加記錄'), style: 'filled', action: () => apply(false) }
    ] });
  } catch (error) {
    notify({ type: 'error', title: 'CSV import failed · CSV 匯入失敗', message: error.message, persistent: true });
  }
}

function showCalcFunctionWizard() {
  const documentRecord = getActiveDocument(state);
  if (!documentRecord || documentRecord.type !== 'calc') return;
  const selected = state.runtime.calcSelected ?? 'A1';
  const body = `<label class="field"><span>${dialogText('Function', '函數')}</span><select data-function-name><option>SUM</option><option>AVERAGE</option><option>MIN</option><option>MAX</option><option>COUNT</option></select></label><label class="field"><span>${dialogText('Cell range', '儲存格範圍')}</span><input data-function-range value="B2:D2" spellcheck="false"></label><p class="validation" data-function-validation>${dialogText('Insert a bounded formula into {cell}.', '將有界方程式插入 {cell}。', { cell: selected })}</p>`;
  const modal = showAppModal({ layer: dialogLayer, title: inlineCopy('Function wizard', '函數精靈'), decision: true, body, actions: [
    { id: 'cancel', label: tr('action.cancel'), style: 'text' },
    { id: 'insert', label: inlineCopy('Insert formula', '插入方程式'), style: 'filled', action: () => {
      const range = modal.querySelector('[data-function-range]').value.trim().toUpperCase();
      if (!/^[A-Z]{1,3}[1-9][0-9]{0,4}:[A-Z]{1,3}[1-9][0-9]{0,4}$/.test(range)) {
        modal.querySelector('[data-function-validation]').textContent = inlineCopy('Enter a range such as B2:D2.', '請輸入例如 B2:D2 嘅範圍。');
        modal.querySelector('[data-function-validation]').classList.add('error');
        return false;
      }
      const sheet = documentRecord.content.sheets.find((item) => item.id === documentRecord.content.activeSheetId) ?? documentRecord.content.sheets[0];
      const name = modal.querySelector('[data-function-name]').value;
      sheet.cells[selected] = `=${name}(${range})`;
      markDocumentChanged(documentRecord, 'spreadsheet function inserted');
      render();
    } }
  ] });
}

function saveFromDialog() {
  const documentRecord = getActiveDocument(state);
  if (!documentRecord) { exportActive('native'); return; }
  const rawName = document.querySelector('[data-dialog-field="filename"]')?.value ?? documentRecord.title;
  const name = rawName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').trim().slice(0, 128) || 'Untitled';
  const format = document.querySelector('[data-dialog-field="filetype"]')?.value ?? 'portable';
  state.runtime.dialogFileName = name; state.runtime.dialogFileType = format;
  if (format === 'pdf') { window.print(); return; }
  if (format === 'json') { downloadBlob(`${name}.material-office.json`, 'application/json', JSON.stringify(documentRecord, null, 2)); return; }
  if (documentRecord.type === 'writer') downloadBlob(`${name}.html`, 'text/html', `<!doctype html><meta charset="utf-8"><title>${escapeHtml(name)}</title>${sanitizeRichHtml(documentRecord.content.html)}`);
  else if (documentRecord.type === 'calc') downloadBlob(`${name}.csv`, 'text/csv', spreadsheetToCsv(documentRecord));
  else if (documentRecord.type === 'base') { const rows = documentRecord.content.rows ?? []; const keys = ['id', 'name', 'contact', 'status', 'value']; const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`; downloadBlob(`${name}.csv`, 'text/csv', [keys.join(','), ...rows.map((row) => keys.map((key) => quote(row[key])).join(','))].join('\r\n')); }
  else downloadBlob(`${name}.material-office.json`, 'application/json', JSON.stringify(documentRecord, null, 2));
  notify({ type: 'success', title: 'Portable copy saved · 已儲存可攜副本', message: `${name} was exported without claiming an unsupported office-format conversion.`, persistent: false });
}

async function openNewAppWindow() {
  if (!desktop?.appWindow?.openNew) { notify({ type: 'warning', title: 'New window unavailable · 暫時開唔到新視窗', message: 'New secure windows are available in the packaged Electron app.', persistent: true }); return; }
  try { await desktop.appWindow.openNew(); }
  catch (error) { notify({ type: 'error', title: 'New window failed · 新視窗開唔到', message: error.message, persistent: true }); }
}

async function closeAppWindowAfterPersistence(discardTabIds = []) {
  if (windowCloseRunning) return;
  windowCloseRunning = true;
  const attemptId = ++windowCloseAttemptCounter;
  activeWindowCloseAttempt = attemptId;
  const discarded = discardTabIds.length > 0;
  try {
    if (discarded) {
      for (const tabId of discardTabIds) {
        const liveTab = state.tabs.items.find((tab) => tab.id === tabId);
        if (liveTab) discardDocumentChanges(liveTab);
      }
      queuePersist('window changes discarded');
    }

    const barrier = await flushWorkspacePersistenceBeforeClose();
    if (!barrier.persisted) {
      notify({
        type: 'error',
        title: 'Window remains open · 視窗仍然開住',
        message: discarded
          ? 'The discard rollback could not be saved safely, so the window was not closed.'
          : 'Queued workspace changes could not be saved safely, so the window was not closed.',
        persistent: true,
        localOnly: true
      });
      return;
    }

    approvedWindowClose = { attemptId, generation: barrier.completedGeneration };
    await desktop.appWindow.closeCurrent();
  } catch (error) {
    notify({ type: 'error', title: 'Window close failed · 視窗關唔到', message: error.message, persistent: true, localOnly: true });
  } finally {
    if (approvedWindowClose?.attemptId === attemptId) approvedWindowClose = null;
    if (activeWindowCloseAttempt === attemptId) {
      activeWindowCloseAttempt = null;
      windowCloseRunning = false;
    }
  }
}

function closeCurrentAppWindow() {
  if (!desktop?.appWindow?.closeCurrent) { notify({ type: 'warning', title: 'Window close unavailable · 暫時關唔到視窗', message: 'Use the browser or packaged-app window control.', persistent: true }); return; }
  if (windowCloseRunning) return;
  const unsaved = state.tabs.items.filter((tab) => tab.unsaved);
  if (!unsaved.length) {
    void closeAppWindowAfterPersistence();
    return;
  }
  if (windowClosePromptOpen) return;
  windowClosePromptOpen = true;
  showAppModal({
    layer: dialogLayer,
    title: inlineCopy('Close window with unsaved work?', '關閉有未儲存內容嘅視窗？'),
    decision: true,
    body: `<p>${dialogText('{count} tabs contain unsaved in-app changes. Closing discards those edits, restores each last saved baseline, records that rollback, and closes only after the rollback is safely persisted.', '有 {count} 個分頁包含未儲存嘅 app 內修改。關閉會放棄修改、還原每個最後儲存基準、記錄回復，並只會喺安全保存回復後先關閉。', { count: unsaved.length })}</p><ul>${unsaved.map((tab) => `<li>${escapeHtml(tab.label)}</li>`).join('')}</ul>`,
    onClose: () => { windowClosePromptOpen = false; },
    actions: [
      { id: 'cancel', label: tr('action.cancel'), style: 'text' },
      { id: 'close', label: inlineCopy('Discard and close', '放棄修改並關閉'), style: 'filled', action: () => { void closeAppWindowAfterPersistence(unsaved.map((tab) => tab.id)); } }
    ]
  });
}

async function showLegalDocument(kind) {
  const documents = {
    license: { title: inlineCopy('Material Office MIT license', 'Material Office MIT 授權條款'), url: './assets/legal/LICENSE.txt' },
    'third-party': { title: inlineCopy('Third-party notices', '第三方聲明'), url: './assets/legal/THIRD_PARTY_NOTICES.md' },
    provenance: { title: inlineCopy('Classic Har Gow image provenance', 'Classic Har Gow 圖片來源'), url: './assets/legal/classic-har-gow-provenance.json' }
  };
  const definition = documents[kind]; if (!definition) return;
  try {
    const response = await fetch(definition.url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Legal document returned ${response.status}.`);
    const text = (await response.text()).slice(0, 512_000);
    showAppModal({ layer: dialogLayer, title: definition.title, body: `<p>${dialogText('This legal source is shown verbatim in its published language.', '以下法律來源會按發布語言原文顯示。')}</p><pre class="legal-document">${escapeHtml(text)}</pre>`, actions: [{ id: 'close', label: tr('action.close'), style: 'filled' }] });
  } catch (error) {
    notify({ type: 'error', title: 'Legal notice unavailable · 法律聲明未能開啟', message: error.message, persistent: true });
  }
}

function showAbout() {
  const modal = showAppModal({ layer: dialogLayer, title: inlineCopy('About Material Office', '關於 Material Office'), body: `<div class="hero-grid" style="grid-template-columns:minmax(0,1fr) 160px"><div><p class="eyebrow">${dialogText('Windows Electron application · released {date}', 'Windows Electron 應用程式 · 已於 {date} 發布', { date: RELEASE_INFO.releasedAt })}</p><h2>${escapeHtml(RELEASE_INFO.version)} · ${escapeHtml(RELEASE_INFO.codeName)}</h2><p>${dialogText('This released build is an original Material Design workspace with local editors, Git-backed history, and explicit LibreOffice integration.', '呢個已發布版本係原創 Material Design 工作間，提供本機編輯器、Git 版本紀錄同明確 LibreOffice 整合。')}</p><p>${dialogText('{count} cataloged LibreOffice commands are bundled and identity-locked before dispatch.', '內置 {count} 個已編目 LibreOffice 指令，派送前會鎖定身份。', { count: features.length.toLocaleString() })}</p><div class="demo-row"><button class="button-label outlined" type="button" data-legal-document="license">${dialogText('MIT license', 'MIT 授權條款')}</button><button class="button-label outlined" type="button" data-legal-document="third-party">${dialogText('Third-party notices', '第三方聲明')}</button><button class="button-label outlined" type="button" data-legal-document="provenance">${dialogText('Image provenance', '圖片來源')}</button></div></div><img src="${escapeHtml(RELEASE_INFO.image)}" alt="${escapeHtml(RELEASE_INFO.alt)}" style="width:100%;border-radius:var(--r-container)"></div>`, actions: [{ id: 'close', label: tr('action.close'), style: 'filled' }] });
  modal.querySelectorAll('[data-legal-document]').forEach((button) => button.addEventListener('click', () => { void showLegalDocument(button.dataset.legalDocument); }));
}

function textNodeMap(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const entries = []; let length = 0; let node;
  while ((node = walker.nextNode())) { const start = length; length += node.data.length; entries.push({ node, start, end: length }); }
  return { entries, text: entries.map((entry) => entry.node.data).join('') };
}

function locateTextOffset(entries, offset) {
  const position = Math.max(0, offset);
  const entry = entries.find((candidate) => position >= candidate.start && position <= candidate.end) ?? entries.at(-1);
  return entry ? { node: entry.node, offset: Math.max(0, Math.min(entry.node.data.length, position - entry.start)) } : null;
}

function plainTextMatches(text, query, caseSensitive) {
  if (!query) return [];
  const haystack = caseSensitive ? text : text.toLocaleLowerCase(); const needle = caseSensitive ? query : query.toLocaleLowerCase();
  const matches = []; let index = 0;
  while (matches.length < 500 && (index = haystack.indexOf(needle, index)) >= 0) { matches.push({ index, end: index + needle.length, value: text.slice(index, index + needle.length), captures: [] }); index += Math.max(1, needle.length); }
  return matches;
}

function replacementText(template, match) {
  return String(template).replace(/\$(\$|&|[1-9][0-9]?)/g, (_, token) => {
    if (token === '$') return '$'; if (token === '&') return match.value ?? '';
    return match.captures?.[Number(token) - 1]?.value ?? '';
  });
}

function showFindReplace() {
  const editor = document.querySelector('[data-editor="writer"],[data-slide-field]:focus');
  if (!editor) { notify({ type: 'warning', title: 'Find needs editable text · 搜尋需要可編輯文字', message: 'Open Writer or focus a slide text field first.', persistent: true }); return; }
  const spec = initialSearch();
  const body = `<label class="field"><span>${dialogText('Find', '尋找')}</span><span class="search-box"><span>⌕</span><input data-find-query maxlength="512"><button class="regex-launch" data-find-regex aria-label="${dialogText('Regular expression builder for find and replace', '尋找同取代嘅 regular expression 建立器')}">.*</button></span></label><label class="field"><span>${dialogText('Replace with', '取代為')}</span><input data-replace-value maxlength="20000"></label><label><input type="checkbox" data-find-case> ${dialogText('Match case', '區分大小寫')}</label><p class="validation" data-find-status>${dialogText('Enter text or build a regular expression.', '輸入文字或者建立 regular expression。')}</p><div class="dialog-actions"><button class="button-label outlined" data-find-next>${dialogText('Find next', '尋找下一個')}</button><button class="button-label filled" data-replace-all>${dialogText('Replace all', '全部取代')}</button></div>`;
  const modal = showAppModal({ layer: dialogLayer, title: inlineCopy('Find and replace', '尋找同取代'), body, actions: [{ id: 'close', label: tr('action.close'), style: 'text' }] });
  const readMatches = async () => {
    const mapping = textNodeMap(editor); const query = modal.querySelector('[data-find-query]').value;
    if (!query) return { mapping, matches: [] };
    if (spec.mode !== 'regex') return { mapping, matches: plainTextMatches(mapping.text, query, modal.querySelector('[data-find-case]').checked) };
    const result = await regexEvaluator.evaluate({ mode: 'regex', query, pattern: spec.pattern || query, flags: spec.flags, sample: mapping.text.slice(0, 20_000) }, { timeoutMs: 250 });
    return { mapping, matches: result.matches.slice(0, 500) };
  };
  const report = (message, error = false) => { const node = modal.querySelector('[data-find-status]'); node.textContent = message; node.classList.toggle('error', error); };
  modal.querySelector('[data-find-regex]').addEventListener('click', (event) => openRegexBuilder({ layer: popoverLayer, anchor: event.currentTarget, searchId: 'find-replace', searchState: spec, sample: textNodeMap(editor).text.slice(0, 20_000), localize: inlineCopy, onChange: (next) => { Object.assign(spec, next); modal.querySelector('[data-find-query]').value = next.query; report(next.mode === 'regex' ? inlineCopy('Regular expression mode is active.', 'Regular expression 模式已啟用。') : inlineCopy('Plain text mode is active.', '純文字模式已啟用。')); } }));
  modal.querySelector('[data-find-next]').addEventListener('click', async () => {
    try { const { mapping, matches } = await readMatches(); if (!matches.length) { report(inlineCopy('No match found.', '搵唔到符合結果。'), true); return; } const match = matches[0]; const start = locateTextOffset(mapping.entries, match.index); const end = locateTextOffset(mapping.entries, match.end); if (!start || !end) return; const range = document.createRange(); range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); editor.focus(); report(inlineCopy('{count} matches; the first is selected.', '有 {count} 個結果；已選取第一個。', { count: matches.length })); }
    catch (error) { report(error.message, true); }
  });
  modal.querySelector('[data-replace-all]').addEventListener('click', async () => {
    try {
      const { mapping, matches } = await readMatches(); if (!matches.length) { report(inlineCopy('No match found.', '搵唔到符合結果。'), true); return; }
      const replacement = modal.querySelector('[data-replace-value]').value;
      for (const match of [...matches].reverse()) { const start = locateTextOffset(mapping.entries, match.index); const end = locateTextOffset(mapping.entries, match.end); if (!start || !end) continue; const range = document.createRange(); range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset); range.deleteContents(); range.insertNode(document.createTextNode(replacementText(replacement, match))); }
      const documentRecord = getActiveDocument(state); if (documentRecord?.type === 'writer') documentRecord.content.html = sanitizeRichHtml(editor.innerHTML); else if (documentRecord?.type === 'impress') updateDocumentFromEditor(editor);
      if (documentRecord) markDocumentChanged(documentRecord, 'text replaced');
      report(inlineCopy('{count} matches replaced.', '已取代 {count} 個結果。', { count: matches.length })); render();
    } catch (error) { report(error.message, true); }
  });
}

async function runFeatureCommand(commandId) {
  const feature = features.find((item) => item.id === commandId); if (!feature) return;
  if (desktop?.libreOffice?.runCommand) {
    try { const result = await desktop.libreOffice.runCommand({ commandId: feature.id }); notify({ type: 'success', title: `${feature.name} dispatched`, message: result.message ?? `${feature.command} was accepted by LibreOffice.`, persistent: false }); }
    catch (error) { notify({ type: 'error', title: `${feature.name} failed`, message: error.message, persistent: true }); }
    return;
  }
  notify({ type: 'warning', title: `${feature.name} is not dispatched yet`, message: `The installed build can open LibreOffice, but this command broker is not available. No success is being claimed for ${feature.command}.`, persistent: true });
}

function handleGenericCommand(action) {
  const active = getActiveTab(state)?.surface;
  const capability = staticCommandCapability(action, active);
  if (!capability.enabled || capability.handler !== 'generic') return false;
  const internal = new Set(['bold', 'italic', 'underline', 'strike', 'align-left', 'align-center', 'align-right', 'justify', 'list-bullets', 'list-numbers', 'select-all', 'undo', 'redo', 'cut', 'copy', 'paste', 'clear-format', 'style-default', 'style-h1', 'style-h2']);
  if (internal.has(action)) return executeEditingCommand(action);
  const messages = {
    'word-count': inlineCopy('{count} words in the active Writer content.', '目前 Writer 內容有 {count} 個字詞。', { count: countWords(getActiveDocument(state)?.content?.html ?? '') }),
    'insert-page-break': 'A page-break marker was inserted at the current Writer caret.',
    'toggle-status': 'Status bar visibility changed for this workspace.'
  };
  if (action === 'toggle-status') { state.preferences.statusBar = !state.preferences.statusBar; render(); queuePersist('status bar toggled'); return true; }
  if (action === 'toggle-properties' || action === 'slide-properties') { state.preferences.propertiesPanel = !state.preferences.propertiesPanel; render(); queuePersist('properties panel toggled'); return true; }
  if (action === 'insert-page-break') {
    const editor = document.querySelector('[data-editor="writer"]');
    if (!editor) return false;
    editor.focus();
    const inserted = document.execCommand('insertHTML', false, '<hr data-page-break="true" aria-label="Page break">');
    if (inserted) updateDocumentFromEditor(editor, 'page break inserted');
    return inserted;
  }
  if (action === 'zoom-in' || action === 'zoom-out') { state.runtime.zoom = Math.max(50, Math.min(200, state.runtime.zoom + (action === 'zoom-in' ? 10 : -10))); applyPreferences(); render(); queuePersist('document zoom changed'); return true; }
  if (action === 'view-normal' || action === 'view-web') { state.preferences.writerView = action === 'view-web' ? 'web' : 'normal'; render(); queuePersist('writer view changed'); return true; }
  if (action === 'find-replace') { showFindReplace(); return true; }
  if (action === 'help') { navigate('changelog'); notify({ type: 'info', title: 'Help and release guide · 說明同版本指南', message: 'The Changelog and categorized documentation describe behavior, recovery, security, and verification.', persistent: false }); return true; }
  if (action === 'about') { showAbout(); return true; }
  if (action === 'new-window') { openNewAppWindow(); return true; }
  if (action === 'close-window') { closeCurrentAppWindow(); return true; }
  if (action === 'math-insert') { document.querySelector('[data-math-editor]')?.focus(); return true; }
  if (action === 'math-update') { const editor = document.querySelector('[data-math-editor]'); if (editor) { const preview = document.querySelector('.math-preview'); if (preview) preview.innerHTML = renderMathSafe(editor.value); } return true; }
  if (messages[action]) { notify({ type: 'info', title: action.replaceAll('-', ' '), message: messages[action], persistent: false }); return true; }
  return false;
}

function updateDocumentFromEditor(target, action = null) {
  const documentRecord = getActiveDocument(state); if (!documentRecord) return;
  if (target.matches('[data-editor="writer"]')) { documentRecord.content.html = sanitizeRichHtml(target.innerHTML); markDocumentChanged(documentRecord, action ?? 'writer content edited'); }
  else if (target.matches('[data-slide-field]')) { const slide = documentRecord.content.slides.find((item) => item.id === target.closest('[data-slide-id]')?.dataset.slideId); if (slide) { slide[target.dataset.slideField] = target.textContent.slice(0, 20_000); markDocumentChanged(documentRecord, action ?? 'slide edited'); } }
  else if (target.matches('[data-math-editor]')) { documentRecord.content.formula = target.value.slice(0, 10_000); markDocumentChanged(documentRecord, 'formula edited'); const preview = document.querySelector('.math-preview'); if (preview) preview.innerHTML = renderMathSafe(documentRecord.content.formula); }
  else if (target.matches('[data-record-field]')) { const row = documentRecord.content.rows.find((item) => item.id === target.closest('[data-record-id]')?.dataset.recordId); if (row) { row[target.dataset.recordField] = target.textContent.slice(0, 10_000); markDocumentChanged(documentRecord, 'record edited'); } }
}

async function runSmokeTest() {
  const results = [];
  const check = (name, condition) => { results.push({ name, passed: Boolean(condition) }); if (!condition) throw new Error(`Smoke check failed: ${name}`); };
  const required = (selector, name, root = document) => {
    const node = root.querySelector(selector);
    if (!node) throw new Error(`Smoke fixture missing: ${name} (${selector})`);
    return node;
  };
  navigate('writer');
  const writer = document.querySelector('[data-editor="writer"]'); check('writer editor', Boolean(writer));
  writer.innerHTML = '<h1>Smoke document</h1><p>Unicode ✓ 蝦餃</p>'; writer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  check('writer editing and persistence model', getActiveDocument(state).content.html.includes('Unicode ✓ 蝦餃'));
  writer.focus();
  const paragraphText = required('[data-editor="writer"] p', 'Writer paragraph').firstChild;
  const headingRange = document.createRange(); headingRange.selectNodeContents(paragraphText); getSelection().removeAllRanges(); getSelection().addRange(headingRange);
  const boldExecuted = executeEditingCommand('bold'); const boldHtml = getActiveDocument(state).content.html;
  const hasBoldFormatting = (value) => /<(?:b|strong)>Unicode ✓ 蝦餃<\/(?:b|strong)>|font-weight:\s*(?:bold|[6-9]00)/i.test(value);
  check('writer toolbar bold command', boldExecuted && hasBoldFormatting(boldHtml));
  check('writer undo command', executeEditingCommand('undo') && !hasBoldFormatting(getActiveDocument(state).content.html));
  check('writer redo command', executeEditingCommand('redo') && hasBoldFormatting(getActiveDocument(state).content.html));
  const beforeSelectionUpdatedAt = getActiveDocument(state).updatedAt;
  check('selection command is non-mutating', executeEditingCommand('select-all') && getActiveDocument(state).updatedAt === beforeSelectionUpdatedAt);
  const endRange = document.createRange(); endRange.selectNodeContents(writer); endRange.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(endRange);
  check('page break command persists', handleGenericCommand('insert-page-break') && /Page break/i.test(getActiveDocument(state).content.html));
  const lineHeight = document.querySelector('[data-action="line-height"]'); lineHeight.value = '1.8'; lineHeight.dispatchEvent(new Event('input', { bubbles: true }));
  check('writer live line spacing', getActiveDocument(state).content.lineHeight === 1.8 && writer.style.lineHeight === '1.8');

  navigate('calc'); check('calc grid', document.querySelectorAll('[data-cell]').length >= 100);
  const calcDocument = getActiveDocument(state); const calcSheet = calcDocument.content.sheets.find((item) => item.id === calcDocument.content.activeSheetId) ?? calcDocument.content.sheets[0];
  state.runtime.calcSelected = 'J20'; calcSheet.cells.J20 = '=SUM(B2:D2)'; render();
  check('calc formula evaluation', evaluateCellForDisplay('J20', calcSheet.cells) === '14100');

  navigate('impress'); check('slide canvas', Boolean(document.querySelector('.slide-canvas')));
  const slideDocument = getActiveDocument(state); const slideCount = slideDocument.content.slides.length; document.querySelector('[data-action="slide-add"]').click();
  check('slide creation', slideDocument.content.slides.length === slideCount + 1);

  navigate('draw'); check('draw canvas', Boolean(document.querySelector('[data-draw-canvas]')));
  const drawDocument = getActiveDocument(state); state.runtime.selectedShape = drawDocument.content.shapes[0].id; render();
  let keyboardShape = required(`[data-shape-id="${CSS.escape(state.runtime.selectedShape)}"]`, 'keyboard-operable Draw shape');
  check('draw shape accessibility metadata', keyboardShape.getAttribute('role') === 'button' && keyboardShape.tabIndex === 0 && Boolean(keyboardShape.getAttribute('aria-label')));
  const keyboardStartX = Number(drawDocument.content.shapes[0].x); keyboardShape.focus(); keyboardShape.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await Promise.resolve();
  check('draw shape keyboard movement', Number(drawDocument.content.shapes[0].x) === keyboardStartX + 1 && document.activeElement?.dataset.shapeId === state.runtime.selectedShape);
  const keyboardShapeCount = drawDocument.content.shapes.length; keyboardShape = required(`[data-shape-id="${CSS.escape(state.runtime.selectedShape)}"]`, 'moved Draw shape'); keyboardShape.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true })); await Promise.resolve();
  check('draw shape keyboard duplicate', drawDocument.content.shapes.length === keyboardShapeCount + 1 && document.activeElement?.dataset.shapeId === state.runtime.selectedShape);
  required(`[data-shape-id="${CSS.escape(state.runtime.selectedShape)}"]`, 'duplicated Draw shape').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); await Promise.resolve();
  check('draw shape keyboard delete', drawDocument.content.shapes.length === keyboardShapeCount && document.activeElement?.dataset.shapeId === state.runtime.selectedShape);
  state.runtime.selectedShape = drawDocument.content.shapes[0].id; render();
  const fill = document.querySelector('[data-action="draw-fill"]'); fill.value = '#123456'; fill.dispatchEvent(new Event('input', { bubbles: true }));
  check('draw object styling', drawDocument.content.shapes[0].fill === '#123456');
  const savedShapes = drawDocument.content.shapes; drawDocument.content.shapes = []; render(); check('draw empty collection stability', document.querySelectorAll('.draw-object').length === 0); drawDocument.content.shapes = savedShapes; state.runtime.selectedShape = savedShapes[0]?.id ?? null; render();

  navigate('base'); check('base table', Boolean(document.querySelector('.data-table')));
  const baseDocument = getActiveDocument(state); const recordCount = baseDocument.content.rows.length; document.querySelector('[data-action="base-add-record"]').click();
  check('base record creation', baseDocument.content.rows.length === recordCount + 1);
  document.querySelector('[data-action="base-section"][data-section="Queries"]').click();
  const queryField = document.querySelector('[data-action="base-query-field"]'); queryField.value = 'status'; queryField.dispatchEvent(new Event('change', { bubbles: true }));
  const queryOperator = document.querySelector('[data-action="base-query-operator"]'); queryOperator.value = 'equals'; queryOperator.dispatchEvent(new Event('change', { bubbles: true }));
  const queryValue = document.querySelector('[data-action="base-query-value"]'); queryValue.value = 'Lead'; queryValue.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-action="base-query-run"]').click();
  check('base query execution', state.runtime.baseQuery.active === true && document.querySelectorAll('.data-table tbody tr').length >= 1);
  const queryRow = required('tr[data-action="base-select-record"]', 'keyboard-operable query result'); const activatedRecordId = queryRow.dataset.recordId; queryRow.focus(); queryRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  check('base query row keyboard activation', state.runtime.baseSection === 'Forms' && state.runtime.selectedBaseRecord === activatedRecordId);
  document.querySelector('[data-action="base-section"][data-section="Forms"]').click();
  const formName = document.querySelector('[data-action="base-form-field"][data-field="name"]'); formName.value = 'Smoke customer'; formName.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-action="base-form-save"]').click();
  check('base form persistence', baseDocument.content.rows.find((row) => row.id === state.runtime.selectedBaseRecord)?.name === 'Smoke customer');
  document.querySelector('[data-action="base-section"][data-section="Reports"]').click();
  check('base report calculation', document.querySelector('[data-action="base-export-report"]') && document.body.textContent.includes('Status breakdown'));
  const savedRows = baseDocument.content.rows; baseDocument.content.rows = []; state.runtime.baseSection = 'Forms'; render(); check('base empty collection stability', document.querySelectorAll('.data-table tbody tr').length === 0 && Boolean(document.querySelector('[data-action="base-form-new"]'))); baseDocument.content.rows = savedRows; state.runtime.selectedBaseRecord = savedRows[0]?.id ?? null; state.runtime.baseSection = 'Tables'; render();

  navigate('math'); check('math preview', Boolean(document.querySelector('math')));
  const mathEditor = document.querySelector('[data-math-editor]'); mathEditor.value = 'sqrt(4) = 2'; mathEditor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  check('math editing and safe rendering', getActiveDocument(state).content.formula === 'sqrt(4) = 2' && Boolean(document.querySelector('.math-preview math')));
  navigate('commands'); check('feature registry', features.length === 2433);
  check('plain collection filter', filterCollectionSync(['a.b', 'abc'], { query: '.', mode: 'plain', flags: 'i' }).join(',') === '0');
  let regexTimedOut = false;
  try {
    await regexEvaluator.filter(
      [`${'a'.repeat(32)}!`],
      { mode: 'regex', pattern: '^(a|[a])+$', flags: '' },
      { timeoutMs: 50 }
    );
  } catch (error) { regexTimedOut = error?.code === 'REGEX_TIMEOUT'; }
  check('regex worker deadline', regexTimedOut);
  const unicodeMatches = await regexEvaluator.filter(
    ['香港', 'Toronto', '廣東話'],
    { mode: 'regex', pattern: '\\p{Script=Han}', flags: 'u' },
    { timeoutMs: 250 }
  );
  check('regex worker Unicode recovery', unicodeMatches.join(',') === '0,2');
  navigate('components'); check('component controls', Boolean(document.querySelector('[role="switch"]')));
  const componentTargets = [...appRoot.querySelectorAll('button,input,select,textarea,[role]')];
  check('every interactive element is appearance-customizable', componentTargets.length > 0 && componentTargets.every((element) => Boolean(element.dataset.appearanceId)));
  check('appearance targets are unique', new Set(componentTargets.map((element) => element.dataset.appearanceId)).size === componentTargets.length);
  const componentSwitch = required('[data-action="demo-switch"]', 'component demo switch');
  const switchAppearanceId = componentSwitch.dataset.appearanceId;
  check('dynamic appearance target identity', switchAppearanceId?.startsWith('auto:app:'));
  componentSwitch.focus();
  componentSwitch.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', altKey: true, shiftKey: true, bubbles: true }));
  await Promise.resolve();
  const keyboardAppearanceEditor = required('.appearance-editor', 'keyboard-opened appearance editor');
  check('appearance keyboard path targets focused element', keyboardAppearanceEditor.getAttribute('aria-label')?.includes(switchAppearanceId));
  const editorControl = required('.appearance-editor [data-key="fontSize"]', 'appearance editor self-customizable control');
  check('appearance editor customizes itself', Boolean(editorControl.dataset.appearanceId));
  required('.appearance-editor [data-close]', 'appearance editor close').click();
  const priorToggle = state.runtime.componentDemo.toggle; componentSwitch.click(); check('component switch behavior', state.runtime.componentDemo.toggle !== priorToggle);
  const unavailableWarningsBefore = state.notifications.filter((item) => /Command unavailable|指令未能使用/u.test(String(item.title))).length;
  const componentCheck = required('[data-action="demo-check"]', 'component demo checkbox'); const priorCheck = state.runtime.componentDemo.check; componentCheck.click();
  check('component checkbox behavior', state.runtime.componentDemo.check !== priorCheck);
  const priorDensity = state.preferences.density; const nextDensity = priorDensity === 'compact' ? 'comfortable' : 'compact';
  const componentDensity = required('[data-action="set-density"]', 'component density select'); componentDensity.value = nextDensity; componentDensity.dispatchEvent(new Event('change', { bubbles: true }));
  check('component density persistence', state.preferences.density === nextDensity && required('[data-action="set-density"]', 'rerendered component density select').value === nextDensity);
  const componentSlider = required('[data-action="demo-slider"]', 'component progress slider'); componentSlider.value = '37'; componentSlider.dispatchEvent(new Event('input', { bubbles: true }));
  check('component progress feedback', state.runtime.componentDemo.slider === 37 && required('[data-demo-slider-value]', 'component progress value').textContent === '37' && required('.component-demo progress[value="37"]', 'component progress bar'));
  check('native controls avoid command warnings', state.notifications.filter((item) => /Command unavailable|指令未能使用/u.test(String(item.title))).length === unavailableWarningsBefore);
  state.preferences.density = priorDensity; applyPreferences(); render();
  const modalOrigin = document.createElement('button'); modalOrigin.className = 'sr-only'; modalOrigin.textContent = 'Modal focus origin'; appRoot.append(modalOrigin); modalOrigin.focus();
  const decisionSmoke = showAppModal({ layer: dialogLayer, title: inlineCopy('Decision focus smoke', '決定焦點 smoke 測試'), decision: true, body: `<p>${dialogText('Choose an action.', '請選擇操作。')}</p>`, actions: [{ id: 'cancel', label: tr('action.cancel') }, { id: 'confirm', label: inlineCopy('Confirm', '確認'), style: 'filled' }] }); await Promise.resolve();
  const decisionDialog = required('.dialog', 'decision dialog', decisionSmoke); const decisionFocusables = [...decisionDialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')];
  check('decision dialog semantics and inert background', decisionDialog.getAttribute('aria-modal') === 'true' && appRoot.inert === true);
  decisionFocusables.at(-1).focus(); decisionFocusables.at(-1).dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  check('decision dialog focus wrap', document.activeElement === decisionFocusables[0]);
  decisionSmoke.querySelector('[data-modal-close]').click(); await Promise.resolve();
  check('decision dialog focus return', appRoot.inert === false && document.activeElement === modalOrigin);
  modalOrigin.focus(); const nonDecisionSmoke = showAppModal({ layer: dialogLayer, title: inlineCopy('Information focus smoke', '資訊焦點 smoke 測試'), body: `<p>${dialogText('Informational dialog.', '資訊對話框。')}</p>`, actions: [{ id: 'close', label: tr('action.close') }] }); await Promise.resolve();
  modalOrigin.focus(); check('non-decision dialog remains modeless', nonDecisionSmoke.querySelector('.dialog').getAttribute('aria-modal') === 'false' && appRoot.inert === false && document.activeElement === modalOrigin);
  nonDecisionSmoke.querySelector('[data-modal-close]').click(); await Promise.resolve(); modalOrigin.remove();
  const dismissId = notify({ type: 'warning', title: 'Dismiss smoke · 關閉測試', message: 'This persistent warning must close from the toast layer.', persistent: true });
  toastLayer.querySelector(`[data-notification-id="${CSS.escape(dismissId)}"]`).click(); check('toast dismiss behavior', state.notifications.find((item) => item.id === dismissId)?.dismissed === true && !toastLayer.querySelector(`[data-toast-id="${CSS.escape(dismissId)}"]`));
  const appearanceTarget = document.querySelector('[data-appearance-id="component:buttons"]');
  appearanceTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: true, clientX: 120, clientY: 120 }));
  check('anchored appearance editor', Boolean(document.querySelector('.appearance-editor [data-key="fontSize"]')));
  const appearanceSize = document.querySelector('.appearance-editor [data-key="fontSize"]'); appearanceSize.value = '19'; appearanceSize.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('.appearance-editor [data-apply]').click();
  check('per-element appearance persistence', state.appearance['component:buttons']?.fontSize === 19 && document.querySelector('[data-appearance-id="component:buttons"]')?.style.fontSize === '19px');
  delete state.appearance['component:buttons'];
  const groupedTab = getActiveTab(state); const smokeGroup = { id: 'smoke-group', name: 'Smoke group', color: '#6750a4', order: 0, collapsed: false, pinned: false }; state.tabs.groups.push(smokeGroup); groupedTab.groupId = smokeGroup.id; render();
  check('tab group rendering', Boolean(document.querySelector('[data-tab-group-id="smoke-group"]'))); document.querySelector('[data-action="toggle-tab-group"][data-group-id="smoke-group"]').click(); check('tab group collapse', smokeGroup.collapsed === true);
  smokeGroup.collapsed = false; groupedTab.groupId = null; state.tabs.groups = state.tabs.groups.filter((group) => group.id !== smokeGroup.id);

  navigate('history'); check('history surface', Boolean(document.querySelector('[data-surface="history"]')));
  const historyDateAnchor = document.querySelector('[data-action="open-date-range"][data-date-scope="history"]');
  check('history date picker trigger', Boolean(historyDateAnchor));
  openDateRangePicker(historyDateAnchor, 'history');
  document.querySelector('[data-date-preset="7-days"]')?.click(); check('history date preset', Boolean(state.runtime.historyFrom && state.runtime.historyTo));
  navigate('dialogs'); check('dialog demos', Boolean(document.querySelector('[data-action="dialog-demo"]')));
  navigate('changelog'); check('release code name', document.body.textContent.includes(RELEASE_INFO.codeName));
  navigate('settings'); check('language controls', Boolean(document.querySelector('[data-action="funny-level"]')));
  state.runtime.settingsSection = 'notifications'; render(); const surpriseBefore = state.preferences.dimSumSurprise; document.querySelector('[data-action="toggle-setting"][data-setting="dimSumSurprise"]').click(); check('persisted dim sum setting', state.preferences.dimSumSurprise !== surpriseBefore); state.preferences.dimSumSurprise = surpriseBefore;
  navigate('home');
  const globalInput = document.querySelector('[data-search-id="global"]'); globalInput.focus(); globalInput.value = 'Writer'; globalInput.dispatchEvent(new Event('input', { bubbles: true })); check('global search focus retention', document.activeElement === globalInput && Boolean(document.querySelector('.global-search-results'))); globalInput.value = ''; globalInput.dispatchEvent(new Event('input', { bubbles: true }));
  showBulkClose();
  required('[name="bulk-mode"][value="not-containing"]', 'inverse bulk-close mode').click();
  required('[data-bulk-regex]', 'bulk-close regex launcher').click();
  required('.regex-builder [data-mode="regex"]', 'regex mode tab').click();
  const invalidBulkPattern = required('.regex-builder [data-pattern]', 'regex pattern input');
  invalidBulkPattern.value = '(';
  invalidBulkPattern.dispatchEvent(new Event('input', { bubbles: true }));
  required('.regex-builder [data-apply]', 'regex apply').click();
  await new Promise((resolve) => setTimeout(resolve, 350));
  check('inverse regex bulk-close fail-closed', required('[data-modal-action="close"]', 'bulk-close confirmation').disabled && /Nothing can close/i.test(required('[data-bulk-preview]', 'bulk-close preview').textContent));
  dialogLayer.replaceChildren(); popoverLayer.replaceChildren();
  const disposableDocument = createInternalDocument('writer', 'Discard smoke document.odt');
  const disposableTab = state.tabs.items.find((tab) => tab.documentId === disposableDocument.id);
  disposableDocument.content.html = '<p>This edit must disappear.</p>'; markDocumentChanged(disposableDocument, 'discard smoke edited');
  closeTab(disposableTab.id, { force: true, discardUnsaved: true });
  check('discard removes never-saved document content', !state.documents.some((item) => item.id === disposableDocument.id));
  const savedWriter = state.documents.find((item) => item.type === 'writer' && item.savedContent);
  openDocumentTab(savedWriter); const savedWriterTab = getActiveTab(state); const savedWriterBaseline = JSON.stringify(savedWriter.savedContent);
  savedWriter.content.html = '<p>This saved document edit must roll back.</p>'; markDocumentChanged(savedWriter, 'saved discard smoke edited');
  closeTab(savedWriterTab.id, { force: true, discardUnsaved: true });
  check('discard restores last saved document content', JSON.stringify(savedWriter.content) === savedWriterBaseline && savedWriter.unsaved === false);
  state.notifications = [];
  notify({ type: 'success', title: 'Desktop smoke verified · 桌面驗證完成', message: `${results.length} interactive surface checks passed in the real Electron renderer.`, persistent: false });
  return { passed: true, checks: results, featureCount: features.length, libreOffice: libreOffice.available };
}

appRoot.addEventListener('click', async (event) => {
  const tabClose = event.target.closest('.tab-close'); if (tabClose) { event.stopPropagation(); closeTab(tabClose.dataset.tabId); return; }
  const tab = event.target.closest('[data-tab-id]'); if (tab && !event.target.closest('[data-action]')) { activateTab(tab.dataset.tabId); return; }
  const target = event.target.closest('[data-action]'); if (!target) return;
  // Native form controls own their click. Their product behavior is handled by
  // the input/change delegates below; treating the same click as a command
  // produces a false "Command unavailable" warning before the real change.
  if (target.matches('input, select, textarea, option')) return;
  const action = target.dataset.action;
  if (action !== 'toggle-menu') { state.runtime.openMenu = null; popoverLayer.replaceChildren(); }
  switch (action) {
    case 'navigate': navigate(target.dataset.surface); break;
    case 'navigate-home': navigate('home'); break;
    case 'navigate-settings': navigate('settings'); break;
    case 'new-document': showNewDocumentDialog(); break;
    case 'create-type': createInternalDocument(target.dataset.type); break;
    case 'open-document': openDocumentTab(state.documents.find((item) => item.id === target.dataset.documentId)); break;
    case 'open-file': await openFile(); break;
    case 'save-document': await saveActiveDocument(); break;
    case 'save-as': exportActive('native'); break;
    case 'dialog-save-as': saveFromDialog(); break;
    case 'export-document': exportActive('native'); break;
    case 'export-pdf': exportActive('pdf'); break;
    case 'print': window.print(); break;
    case 'edit-libreoffice': await handoffLibreOffice(); break;
    case 'toggle-theme': state.preferences.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; await persistPreferences('theme changed'); break;
    case 'open-notifications': showNotifications(); break;
    case 'dismiss-notification': dismissNotification(target.dataset.notificationId); break;
    case 'open-regex': openRegexFor(target.dataset.searchId, target); break;
    case 'open-tab-search': showTabSearch(); break;
    case 'tab-overflow': showTabOverflow(target); break;
    case 'tab-bulk-close': showBulkClose(); break;
    case 'toggle-tab-group': { const group = state.tabs.groups.find((item) => item.id === target.dataset.groupId); if (group) { group.collapsed = !group.collapsed; render(); queuePersist('tab group collapsed state changed'); } break; }
    case 'close-tab': closeTab(target.dataset.tabId); break;
    case 'close-active-tab': closeTab(state.tabs.activeId); break;
    case 'toggle-menu': {
      const menu = target.dataset.menu; const rect = target.getBoundingClientRect();
      if (state.runtime.openMenu === menu) { state.runtime.openMenu = null; popoverLayer.replaceChildren(); render(); }
      else { state.runtime.openMenu = menu; render(); const fresh = document.querySelector(`[data-menu="${CSS.escape(menu)}"]`); popoverLayer.innerHTML = renderMenuPopover(menu, { x: fresh?.getBoundingClientRect().left ?? rect.left, y: fresh?.getBoundingClientRect().bottom ?? rect.bottom }, buildContext()); }
      break;
    }
    case 'calc-sheet': { const doc = getActiveDocument(state); doc.content.activeSheetId = target.dataset.sheetId; render(); queuePersist('sheet changed'); break; }
    case 'calc-add-sheet': { const doc = getActiveDocument(state); const sheet = { id: makeId('sheet'), name: `Sheet ${doc.content.sheets.length + 1}`, cells: {} }; doc.content.sheets.push(sheet); doc.content.activeSheetId = sheet.id; markDocumentChanged(doc, 'sheet added'); render(); break; }
    case 'calc-function': showCalcFunctionWizard(); break;
    case 'slide-select': { const doc = getActiveDocument(state); doc.content.activeSlideId = target.dataset.slideId; render(); queuePersist('slide selected'); break; }
    case 'slide-add': { const doc = getActiveDocument(state); const slide = { id: makeId('slide'), layout: 'content', title: `Slide ${doc.content.slides.length + 1}`, body: 'Click to edit' }; doc.content.slides.push(slide); doc.content.activeSlideId = slide.id; markDocumentChanged(doc, 'slide added'); render(); break; }
    case 'slide-duplicate': { const doc = getActiveDocument(state); const active = doc.content.slides.find((item) => item.id === doc.content.activeSlideId); if (active) { const copy = { ...active, id: makeId('slide'), title: `${active.title} copy` }; doc.content.slides.splice(doc.content.slides.indexOf(active) + 1, 0, copy); doc.content.activeSlideId = copy.id; markDocumentChanged(doc, 'slide duplicated'); render(); } break; }
    case 'slide-delete': { const doc = getActiveDocument(state); if (doc.content.slides.length > 1) { doc.content.slides = doc.content.slides.filter((item) => item.id !== doc.content.activeSlideId); doc.content.activeSlideId = doc.content.slides[0].id; markDocumentChanged(doc, 'slide deleted'); render(); } break; }
    case 'slide-layout': { const doc = getActiveDocument(state); const slide = doc.content.slides.find((item) => item.id === doc.content.activeSlideId); if (slide) { const layouts = ['title', 'content', 'two-column', 'blank']; slide.layout = target.dataset.layout ?? layouts[(layouts.indexOf(slide.layout) + 1) % layouts.length]; markDocumentChanged(doc, 'slide layout changed'); render(); } break; }
    case 'present': showPresentation(0); break;
    case 'present-current': { const doc = getActiveDocument(state); const index = Math.max(0, doc?.content?.slides?.findIndex((item) => item.id === doc.content.activeSlideId) ?? 0); showPresentation(index); break; }
    case 'draw-tool': state.runtime.drawTool = target.dataset.tool; render(); break;
    case 'draw-select': case 'draw-rect': case 'draw-ellipse': case 'draw-line': case 'draw-text': state.runtime.drawTool = action.replace('draw-', ''); render(); break;
    case 'draw-delete': deleteSelectedShape(); break;
    case 'draw-duplicate': duplicateSelectedShape(); break;
    case 'base-section': state.runtime.baseSection = target.dataset.section; render(); break;
    case 'base-add-record': addBaseRecord(); break;
    case 'base-delete-record': deleteBaseRecord(target.dataset.recordId ?? state.runtime.selectedBaseRecord); break;
    case 'base-select-record': state.runtime.selectedBaseRecord = target.dataset.recordId; state.runtime.baseSection = 'Forms'; state.runtime.baseFormDraft = null; render(); break;
    case 'base-query-run': { const query = state.runtime.baseQuery ??= { field: 'name', operator: 'contains', value: '', active: false }; query.active = Boolean(query.value); render(); break; }
    case 'base-query-clear': state.runtime.baseQuery = { field: 'name', operator: 'contains', value: '', active: false }; render(); break;
    case 'base-query-field': case 'base-query-operator': case 'base-query-value': case 'base-form-field': break;
    case 'base-form-new': addBaseRecord(); break;
    case 'base-form-save': saveBaseForm(); break;
    case 'base-export-report': exportBaseReport(); break;
    case 'base-import-csv': await importBaseCsv(); break;
    case 'base-export-csv': exportBaseCsv(); break;
    case 'math-symbol': insertMathSymbol(target.dataset.symbol); break;
    case 'demo-switch': state.runtime.componentDemo.toggle = !state.runtime.componentDemo.toggle; render(); queuePersist('component demo changed'); break;
    case 'demo-toast': notify({ type: 'success', title: 'Component responded · 元件有反應', message: 'This is a real non-blocking notification with persisted history.', persistent: false }); break;
    case 'copy-token': {
      const token = target.dataset.tokenValue ?? target.dataset.token;
      try {
        await navigator.clipboard.writeText(token);
        notify({ type: 'success', title: 'Token copied · Token 已複製', message: token, persistent: false });
      } catch (error) {
        notify({ type: 'error', title: 'Token could not be copied · Token 未能複製', message: error.message, persistent: true });
      }
      break;
    }
    case 'about': showAbout(); break;
    case 'command-scope': state.runtime.commandScope = target.dataset.scope; render(); break;
    case 'command-select': state.runtime.selectedCommandId = target.dataset.commandId; render(); break;
    case 'run-command': await runFeatureCommand(target.dataset.commandId); break;
    case 'history-select': state.runtime.historySelected = target.dataset.historyId; render(); break;
    case 'history-restore': reviewHistoryRestore(target.dataset.historyId); break;
    case 'history-diff': void loadHistoryDiff(target.dataset.historyId); break;
    case 'history-label': reviewHistoryLabel(target.dataset.historyId); break;
    case 'history-prune-review': reviewHistoryPrune(); break;
    case 'history-export': case 'history-export-all': downloadBlob('material-office-history.json', 'application/json', JSON.stringify(state.history.entries, null, 2)); break;
    case 'open-date-range': openDateRangePicker(target, target.dataset.dateScope); break;
    case 'dialog-demo': state.runtime.dialogDemo = target.dataset.dialog; render(); break;
    case 'dialog-cancel': navigate(getActiveDocument(state)?.type ?? 'home'); break;
    case 'save-settings': await persistPreferences(); notify({ type: 'success', title: ['Settings saved', '設定已儲存'], message: COPY['settings.languageDescription'], persistent: false }); break;
    case 'settings-section': state.runtime.settingsSection = target.dataset.section; render(); queuePersist('settings section changed'); break;
    case 'reset-settings': resetSettings(); break;
    case 'toggle-setting': { const key = target.dataset.setting; if (['dimSumSurprise', 'reducedMotion', 'reducedSound'].includes(key)) { state.preferences[key] = !Boolean(state.preferences[key]); if (key === 'reducedSound' && state.preferences[key]) narrator.cancel(); await persistPreferences(`${key} changed`); } break; }
    case 'toggle-narrator': state.preferences.narrator.enabled = !state.preferences.narrator.enabled; if (!state.preferences.narrator.enabled) narrator.cancel(); await persistPreferences('narrator changed'); break;
    case 'open-appearance': openAppearanceFor(target.dataset.target ?? 'workspace', target); break;
    case 'open-color-picker': openAccentColorPicker(target); break;
    case 'refresh-libreoffice': await refreshLibreOffice(); break;
    case 'choose-libreoffice': await chooseLibreOfficeInstallation(); break;
    case 'open-external-editor': await openActiveInExternalEditor(); break;
    case 'window-minimize': if (desktop?.appWindow?.minimize) await desktop.appWindow.minimize(); break;
    case 'window-maximize': if (desktop?.appWindow?.toggleMaximize) await desktop.appWindow.toggleMaximize(); break;
    case 'close-window': closeCurrentAppWindow(); break;
    case 'save-custom-document': await saveActiveCustomWordDocument(); break;
    case 'open-windows-contrast': await openWindowsContrastSettings(); break;
    case 'copy-changelog': try { await navigator.clipboard.writeText(await changelogMarkdown()); notify({ type: 'success', title: 'Changelog copied · 更新紀錄已複製', message: 'The filtered release view is on the clipboard.', persistent: false }); } catch {} break;
    case 'export-changelog': try { downloadBlob('material-office-changelog.md', 'text/markdown', await changelogMarkdown()); } catch {} break;
    case 'zoom-range': break;
    default: if (!handleGenericCommand(action)) notify({ type: 'warning', title: inlineCopy('Command unavailable', '指令未能使用'), message: unsupportedCommandReason(action, getActiveTab(state)?.surface, inlineCopy), persistent: true });
  }
});

toastLayer.addEventListener('click', (event) => {
  const dismiss = event.target.closest('[data-action="dismiss-notification"]');
  if (dismiss) dismissNotification(dismiss.dataset.notificationId);
});

appRoot.addEventListener('input', (event) => {
  const target = event.target;
  if (target.matches('[data-context-menu-search]')) {
    const query = target.value.trim().toLocaleLowerCase();
    const menu = target.closest('.context-menu');
    menu?.querySelectorAll('[data-context-menu-label],[data-menu-label]').forEach((item) => {
      item.hidden = Boolean(query) && !String(item.dataset.contextMenuLabel ?? item.dataset.menuLabel ?? '').toLocaleLowerCase().includes(query);
    });
    menu?.querySelectorAll('.separator').forEach((separator) => { separator.hidden = Boolean(query); });
    return;
  }
  if (target.matches('[data-search-id]')) {
    const id = target.dataset.searchId; const search = state.searches[id] ??= initialSearch(); search.query = target.value; if (search.mode === 'regex') search.pattern = target.value;
    if (id === 'global') showGlobalSearch(); else render(); queuePersist('search changed'); return;
  }
  if (target.matches('[data-action="date-range-input"]')) {
    const scope = target.dataset.dateScope;
    const bound = target.dataset.dateBound;
    if (!['history', 'changelog'].includes(scope) || !['from', 'to'].includes(bound)) return;
    state.runtime[`${scope}${bound === 'from' ? 'From' : 'To'}Input`] = target.value.slice(0, 40);
    const selection = target.selectionStart;
    syncTypedDateRange(scope, bound);
    render();
    queueMicrotask(() => {
      const input = document.querySelector(`[data-action="date-range-input"][data-date-scope="${CSS.escape(scope)}"][data-date-bound="${bound}"]`);
      if (input && Number.isInteger(selection)) input.setSelectionRange(selection, selection);
    });
    return;
  }
  if (target.matches('[data-editor],[data-slide-field],[data-math-editor],[data-record-field]')) { updateDocumentFromEditor(target); return; }
  if (target.matches('[data-action="calc-formula"]')) { const doc = getActiveDocument(state); const sheet = doc.content.sheets.find((item) => item.id === doc.content.activeSheetId); sheet.cells[state.runtime.calcSelected ?? 'A1'] = target.value; markDocumentChanged(doc, 'cell formula edited'); return; }
  if (target.matches('[data-action="line-height"]')) { const doc = getActiveDocument(state); if (doc?.type === 'writer') { doc.content.lineHeight = Math.max(1, Math.min(2.5, Number(target.value))); document.querySelector('[data-editor="writer"]')?.style.setProperty('line-height', String(doc.content.lineHeight)); if (target.nextElementSibling) target.nextElementSibling.value = String(doc.content.lineHeight); markDocumentChanged(doc, 'writer line height changed'); } return; }
  if (target.matches('[data-action="draw-fill"]')) { const doc = getActiveDocument(state); const shape = doc?.content?.shapes?.find((item) => item.id === state.runtime.selectedShape); if (shape) { shape.fill = target.value; document.querySelector(`[data-shape-id="${CSS.escape(shape.id)}"]`)?.setAttribute('fill', target.value); markDocumentChanged(doc, 'shape fill changed'); } return; }
  if (target.matches('[data-action="draw-stroke-width"]')) { const doc = getActiveDocument(state); const shape = doc?.content?.shapes?.find((item) => item.id === state.runtime.selectedShape); if (shape) { shape.strokeWidth = Math.max(0, Math.min(12, Number(target.value))); document.querySelector(`[data-shape-id="${CSS.escape(shape.id)}"]`)?.setAttribute('stroke-width', String(shape.strokeWidth)); if (target.nextElementSibling) target.nextElementSibling.value = String(shape.strokeWidth); markDocumentChanged(doc, 'shape line width changed'); } return; }
  if (target.matches('[data-action="base-query-value"]')) { const query = state.runtime.baseQuery ??= { field: 'name', operator: 'contains', value: '', active: false }; query.value = target.value.slice(0, 500); query.active = false; return; }
  if (target.matches('[data-action="base-form-field"]')) { const doc = getActiveDocument(state); const row = doc?.content?.rows?.find((item) => item.id === state.runtime.selectedBaseRecord) ?? doc?.content?.rows?.[0]; if (row) { if (state.runtime.baseFormRecordId !== row.id) { state.runtime.baseFormRecordId = row.id; state.runtime.baseFormDraft = { ...row }; } state.runtime.baseFormDraft[target.dataset.field] = target.value.slice(0, 10_000); } return; }
  if (target.matches('[data-action="zoom-range"]')) { state.runtime.zoom = Math.max(50, Math.min(200, Number(target.value))); document.documentElement.style.setProperty('--document-zoom', String(state.runtime.zoom / 100)); if (target.previousElementSibling) target.previousElementSibling.textContent = `${state.runtime.zoom}%`; queuePersist('document zoom changed'); return; }
  if (target.matches('[data-action="demo-field"]')) { state.runtime.componentDemo.field = target.value; queuePersist('component demo changed'); return; }
  if (target.matches('[data-action="demo-slider"]')) {
    state.runtime.componentDemo.slider = Number(target.value);
    const demo = target.closest('.component-demo');
    demo?.querySelector('progress')?.setAttribute('value', String(state.runtime.componentDemo.slider));
    if (demo?.querySelector('[data-demo-slider-value]')) demo.querySelector('[data-demo-slider-value]').textContent = String(state.runtime.componentDemo.slider);
    queuePersist('component demo changed');
    return;
  }
  if (target.matches('[data-action="funny-level"]')) { state.preferences.funny[target.dataset.language] = Number(target.value); target.nextElementSibling.value = target.value; persistPreferences('funny level changed'); return; }
  if (target.matches('[data-action="set-accent"]')) { state.preferences.accent = target.value; persistPreferences('accent changed'); return; }
  if (target.matches('[data-action="set-font"]')) { state.preferences.fontFamily = target.value.slice(0, 128); persistPreferences('font changed'); return; }
  if (target.matches('[data-action="set-scale"]')) { state.preferences.scale = Number(target.value); persistPreferences('interface scale changed'); return; }
  if (target.matches('[data-action="history-retention"]')) { state.preferences.historyRetention = Math.max(10, Math.min(10000, Number(target.value))); queuePersist('history retention changed'); return; }
});

appRoot.addEventListener('change', (event) => {
  const target = event.target;
  if (target.matches('[data-action="set-language"]')) { state.preferences.language = target.value; persistPreferences('language changed'); }
  else if (target.matches('[data-action="set-theme"]')) { state.preferences.theme = target.value; persistPreferences('theme changed'); }
  else if (target.matches('[data-action="set-density"]')) { state.preferences.density = target.value; persistPreferences('density changed'); }
  else if (target.matches('[data-action="demo-check"]')) { state.runtime.componentDemo.check = target.checked; render(); queuePersist('component demo changed'); }
  else if (target.matches('[data-action="demo-radio"]')) { state.runtime.componentDemo.radio = target.value; render(); queuePersist('component demo changed'); }
  else if (target.matches('[data-action="history-action"]')) { const set = new Set(state.runtime.historyActions ?? []); target.checked ? set.add(target.value) : set.delete(target.value); state.runtime.historyActions = [...set]; render(); }
  else if (target.matches('[data-action="base-query-field"]')) { const query = state.runtime.baseQuery ??= { field: 'name', operator: 'contains', value: '', active: false }; query.field = target.value; query.active = false; }
  else if (target.matches('[data-action="base-query-operator"]')) { const query = state.runtime.baseQuery ??= { field: 'name', operator: 'contains', value: '', active: false }; query.operator = target.value; query.active = false; }
  else if (target.matches('[data-action="font-family"]')) executeEditingCommand('fontName', target.value);
  else if (target.matches('[data-action="font-size"]')) executeEditingCommand('fontSize', target.value);
  else if (target.matches('[data-action="narrator-language"]')) { narrator.cancel(); state.preferences.narrator.language = target.value; persistPreferences('narrator language changed'); }
  else if (target.matches('[data-action="external-editor"]')) { if (target.value === 'custom') chooseCustomExternalEditor(); else { state.preferences.preferredEditorId = target.value; persistPreferences('external editor changed'); } }
  else if (target.matches('[data-action="calc-address"]')) {
    const address = target.value.trim().toUpperCase(); const cell = document.querySelector(`[data-cell="${CSS.escape(address)}"]`);
    if (cell) { state.runtime.calcSelected = address; cell.focus(); }
    else { notify({ type: 'warning', title: 'Cell address is outside this view · 儲存格地址唔喺畫面', message: 'Use A1 through J20 in the current compact grid.', persistent: true }); }
  }
});

appRoot.addEventListener('focusin', (event) => {
  const record = event.target.closest('[data-record-id]'); if (record) state.runtime.selectedBaseRecord = record.dataset.recordId;
  const cell = event.target.closest('[data-cell]'); if (!cell) return;
  const doc = getActiveDocument(state); const sheet = doc?.content?.sheets?.find((item) => item.id === cell.dataset.sheetId); if (!sheet) return;
  state.runtime.calcSelected = cell.dataset.cell; cell.textContent = sheet.cells[cell.dataset.cell] ?? '';
  const address = document.querySelector('[data-action="calc-address"]'); const formula = document.querySelector('[data-action="calc-formula"]'); if (address) address.value = cell.dataset.cell; if (formula) formula.value = sheet.cells[cell.dataset.cell] ?? '';
});

appRoot.addEventListener('focusout', (event) => {
  const cell = event.target.closest('[data-cell]'); if (!cell) return;
  const doc = getActiveDocument(state); const sheet = doc?.content?.sheets?.find((item) => item.id === cell.dataset.sheetId); if (!sheet) return;
  sheet.cells[cell.dataset.cell] = cell.textContent.slice(0, 20_000); markDocumentChanged(doc, 'spreadsheet cell edited');
  cell.textContent = evaluateCellForDisplay(cell.dataset.cell, sheet.cells);
});

appRoot.addEventListener('contextmenu', (event) => {
  const groupElement = event.target.closest('[data-tab-group-id]');
  if (groupElement && event.target.closest('.tab-group-header')) { event.preventDefault(); const group = state.tabs.groups.find((item) => item.id === groupElement.dataset.tabGroupId); if (group) showGroupContext(group, event, groupElement.querySelector('.tab-group-header') ?? groupElement); return; }
  const tabElement = event.target.closest('[data-tab-id]');
  if (tabElement) { event.preventDefault(); const tab = state.tabs.items.find((item) => item.id === tabElement.dataset.tabId); if (tab) showTabContext(tab, event, tabElement); return; }
  const target = event.target.closest('[data-appearance-id]'); if (!target) return;
  event.preventDefault(); showElementAppearanceContext(target, event);
});

for (const layer of [popoverLayer, dialogLayer, toastLayer]) {
  layer.addEventListener('contextmenu', (event) => {
    const target = event.target.closest('[data-appearance-id]'); if (!target) return;
    event.preventDefault(); event.stopPropagation(); showElementAppearanceContext(target, event);
  });
}

appRoot.addEventListener('dragstart', (event) => {
  const group = event.target.closest('.tab-group-header');
  if (group) { dragState = { groupId: group.dataset.groupId }; group.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; return; }
  const tab = event.target.closest('[data-tab-id]'); if (!tab) return;
  dragState = { tabId: tab.dataset.tabId }; tab.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move';
});
appRoot.addEventListener('dragover', (event) => { if (dragState && event.target.closest('[data-tab-id],.tab-group-header')) event.preventDefault(); });
appRoot.addEventListener('drop', (event) => {
  if (!dragState) return;
  const targetGroup = event.target.closest('.tab-group-header');
  const targetTab = event.target.closest('[data-tab-id]');
  if (!targetGroup && !targetTab) return;
  event.preventDefault();
  if (dragState.groupId && targetGroup) {
    const groups = [...state.tabs.groups].sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));
    const from = groups.findIndex((item) => item.id === dragState.groupId); const to = groups.findIndex((item) => item.id === targetGroup.dataset.groupId);
    if (from >= 0 && to >= 0 && from !== to) { const [group] = groups.splice(from, 1); groups.splice(to, 0, group); groups.forEach((item, index) => { item.order = index; }); state.tabs.groups = groups; render(); queuePersist('tab groups reordered'); }
  } else if (dragState.tabId) {
    const from = state.tabs.items.findIndex((item) => item.id === dragState.tabId);
    if (from >= 0) {
      const [tab] = state.tabs.items.splice(from, 1);
      if (targetGroup) { tab.groupId = targetGroup.dataset.groupId; state.tabs.items.push(tab); queuePersist('tab moved to group'); }
      else { const to = state.tabs.items.findIndex((item) => item.id === targetTab.dataset.tabId); const destination = state.tabs.items[to]; tab.groupId = destination?.groupId ?? null; state.tabs.items.splice(Math.max(0, to), 0, tab); queuePersist('tabs reordered'); }
      render();
    }
  }
  dragState = null;
});
appRoot.addEventListener('dragend', () => { dragState = null; });

document.addEventListener('click', (event) => {
  const originatedInsideInteractiveLayer = event.composedPath().some((node) => node instanceof Element && node.matches('.popover,.context-menu,.regex-launch,[data-action="toggle-menu"],[data-action="open-regex"]'));
  if (originatedInsideInteractiveLayer) return;
  if (popoverLayer.childElementCount) { popoverLayer.replaceChildren(); if (state.runtime.openMenu) { state.runtime.openMenu = null; render(); } }
});

appRoot.addEventListener('keydown', (event) => {
  const queryRow = event.target.closest?.('tr[data-action="base-select-record"]');
  if (queryRow && ['Enter', ' ', 'Spacebar'].includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    queryRow.click();
    return;
  }

  const shapeElement = event.target.closest?.('[data-shape-id]');
  if (!shapeElement) return;
  const documentRecord = getActiveDocument(state);
  const shape = documentRecord?.content?.shapes?.find((item) => item.id === shapeElement.dataset.shapeId);
  if (!shape) return;
  const control = event.ctrlKey || event.metaKey;
  const isSelectKey = ['Enter', ' ', 'Spacebar'].includes(event.key);
  const isDeleteKey = event.key === 'Delete' || event.key === 'Backspace';
  const isDuplicateKey = control && event.key.toLowerCase() === 'd';
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const direction = directions[event.key];
  if (!isSelectKey && !isDeleteKey && !isDuplicateKey && !direction) return;
  event.preventDefault();
  event.stopPropagation();
  state.runtime.selectedShape = shape.id;
  if (isDeleteKey) { focusDrawShape(deleteSelectedShape()); return; }
  if (isDuplicateKey) { focusDrawShape(duplicateSelectedShape()); return; }
  if (direction) {
    const step = event.shiftKey ? 10 : 1;
    moveShapeWithKeyboard(shape, direction[0] * step, direction[1] * step);
    return;
  }
  render();
});

document.addEventListener('keydown', (event) => {
  const directAppearance = event.altKey && event.shiftKey && event.key.toLowerCase() === 'a';
  const contextKey = event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
  if (directAppearance || contextKey) {
    const target = event.target.closest?.('[data-appearance-id]');
    if (target) {
      event.preventDefault();
      const rect = target.getBoundingClientRect();
      const contextEvent = { clientX: rect.left + Math.min(rect.width / 2, 24), clientY: rect.top + Math.min(rect.height / 2, 24), shiftKey: directAppearance };
      const tabElement = target.closest('[data-tab-id]');
      const groupElement = target.closest('[data-tab-group-id]');
      if (tabElement) { const tab = state.tabs.items.find((item) => item.id === tabElement.dataset.tabId); if (tab) showTabContext(tab, contextEvent, tabElement); }
      else if (groupElement) { const group = state.tabs.groups.find((item) => item.id === groupElement.dataset.tabGroupId); if (group) showGroupContext(group, contextEvent, groupElement.querySelector('.tab-group-header') ?? groupElement); }
      else showElementAppearanceContext(target, contextEvent);
      return;
    }
  }
  const control = event.ctrlKey || event.metaKey;
  if (control && event.key.toLowerCase() === 's') { event.preventDefault(); saveActiveDocument(); }
  else if (control && event.key.toLowerCase() === 'o') { event.preventDefault(); openFile(); }
  else if (control && event.key.toLowerCase() === 'n') { event.preventDefault(); showNewDocumentDialog(); }
  else if (control && event.key.toLowerCase() === 'w') { event.preventDefault(); closeTab(state.tabs.activeId); }
  else if (control && event.key.toLowerCase() === 'f') { event.preventDefault(); document.querySelector('[data-search-id="global"]')?.focus(); }
  else if (event.key === 'F5' && getActiveTab(state)?.surface === 'impress') { event.preventDefault(); showPresentation(0); }
  else if (event.key === 'Escape' && popoverLayer.childElementCount) { popoverLayer.replaceChildren(); lastFocusedElement?.focus?.(); }
  else if (event.target.matches?.('[role="tab"]')) {
    const tablist = event.target.closest('[role="tablist"]');
    if (tablist) handleRovingTabKey(event, tablist.querySelectorAll('[role="tab"]'));
  }
});

window.addEventListener('beforeunload', (event) => {
  const needsDecision = state.tabs.items.some((tab) => tab.unsaved);
  if (approvedWindowClose) {
    const approval = approvedWindowClose;
    const approved = canUsePersistenceCloseApproval({
      ...workspacePersistenceState(),
      approvedGeneration: approval.generation,
      unsaved: needsDecision
    });
    approvedWindowClose = null;
    if (approved) return;
    if (activeWindowCloseAttempt === approval.attemptId) {
      activeWindowCloseAttempt = null;
      windowCloseRunning = false;
    }
  }
  if (!needsDecision && !hasPendingWorkspacePersistence()) return;
  event.preventDefault();
  event.returnValue = '';
  setTimeout(() => { closeCurrentAppWindow(); }, 0);
});

function showPresentation(index = 0) {
  const doc = getActiveDocument(state); if (!doc?.content?.slides?.length) return;
  const slides = doc.content.slides; index = Math.max(0, Math.min(slides.length - 1, index)); const slide = slides[index];
  const modal = showAppModal({ layer: dialogLayer, title: inlineCopy('{title} · {current}/{total}', '{title} · {current}/{total}', { title: doc.title, current: index + 1, total: slides.length }), body: `<article class="slide-canvas" style="width:100%"><h2>${escapeHtml(slide.title)}</h2><p>${escapeHtml(slide.body)}</p></article>`, actions: [
    { id: 'previous', label: inlineCopy('← Previous', '← 上一張'), style: 'outlined', disabled: index === 0, action: () => { setTimeout(() => showPresentation(index - 1), 0); } },
    { id: 'next', label: index === slides.length - 1 ? inlineCopy('Finish', '完成') : inlineCopy('Next →', '下一張 →'), style: 'filled', action: () => { if (index < slides.length - 1) setTimeout(() => showPresentation(index + 1), 0); } }
  ] });
  modal.querySelector('.dialog').requestFullscreen?.().catch(() => undefined);
}

function deleteSelectedShape() {
  const doc = getActiveDocument(state); if (!doc || !state.runtime.selectedShape) return;
  const shapes = doc.content.shapes ?? []; const index = shapes.findIndex((shape) => shape.id === state.runtime.selectedShape);
  const focusId = shapes[index + 1]?.id ?? shapes[index - 1]?.id ?? null;
  doc.content.shapes = shapes.filter((shape) => shape.id !== state.runtime.selectedShape); state.runtime.selectedShape = focusId; markDocumentChanged(doc, 'shape deleted'); render();
  return focusId;
}

function duplicateSelectedShape() {
  const doc = getActiveDocument(state); const source = doc?.content?.shapes?.find((shape) => shape.id === state.runtime.selectedShape); if (!source) return;
  const copy = { ...source, id: makeId('shape'), x: Number(source.x ?? 0) + 24, y: Number(source.y ?? 0) + 24 }; doc.content.shapes.push(copy); state.runtime.selectedShape = copy.id; markDocumentChanged(doc, 'shape duplicated'); render();
  return copy.id;
}

function focusDrawShape(shapeId) {
  queueMicrotask(() => {
    const shape = shapeId ? document.querySelector(`[data-shape-id="${CSS.escape(shapeId)}"]`) : null;
    (shape ?? document.querySelector('[data-action="draw-delete"]'))?.focus?.();
  });
}

function moveShapeWithKeyboard(shape, deltaX, deltaY) {
  const width = Math.max(0, Number(shape.width ?? (shape.type === 'ellipse' ? 110 : 180)));
  const height = Math.max(0, Number(shape.height ?? (shape.type === 'ellipse' ? 80 : 110)));
  let minX = 0; let maxX = 960; let minY = 0; let maxY = 600;
  if (shape.type === 'ellipse') {
    minX = width / 2; maxX = 960 - width / 2; minY = height / 2; maxY = 600 - height / 2;
  } else if (shape.type === 'rect' || shape.type === 'line') {
    maxX = 960 - width; maxY = 600 - height;
  } else if (shape.type === 'text') {
    minY = Math.max(1, Number(shape.fontSize ?? 28)); maxX = 952;
  }
  const priorX = Number(shape.x ?? 0); const priorY = Number(shape.y ?? 0);
  shape.x = Math.round(Math.max(minX, Math.min(maxX, priorX + deltaX)));
  shape.y = Math.round(Math.max(minY, Math.min(maxY, priorY + deltaY)));
  if (shape.x !== priorX || shape.y !== priorY) markDocumentChanged(getActiveDocument(state), 'shape moved with keyboard');
  render();
}

appRoot.addEventListener('pointerdown', (event) => {
  const shapeElement = event.target.closest('[data-shape-id]'); const canvas = event.target.closest('[data-draw-canvas]');
  if (shapeElement) { state.runtime.selectedShape = shapeElement.dataset.shapeId; shapeElement.focus(); const doc = getActiveDocument(state); const shape = doc?.content?.shapes?.find((item) => item.id === shapeElement.dataset.shapeId); if (shape) dragState = { shape, startX: event.clientX, startY: event.clientY, originX: Number(shape.x ?? 0), originY: Number(shape.y ?? 0), element: shapeElement }; event.preventDefault(); }
  else if (canvas && state.runtime.drawTool && state.runtime.drawTool !== 'select') addShapeAtPointer(canvas, event);
});

document.addEventListener('pointermove', (event) => {
  if (!dragState?.shape) return; const canvas = dragState.element.ownerSVGElement; const rect = canvas.getBoundingClientRect(); const scaleX = 960 / rect.width; const scaleY = 600 / rect.height;
  dragState.shape.x = Math.round(dragState.originX + (event.clientX - dragState.startX) * scaleX); dragState.shape.y = Math.round(dragState.originY + (event.clientY - dragState.startY) * scaleY);
  const element = dragState.element; if (dragState.shape.type === 'ellipse') { element.setAttribute('cx', dragState.shape.x); element.setAttribute('cy', dragState.shape.y); } else { element.setAttribute('x', dragState.shape.x); element.setAttribute('y', dragState.shape.y); if (dragState.shape.type === 'line') { element.setAttribute('x1', dragState.shape.x); element.setAttribute('y1', dragState.shape.y); element.setAttribute('x2', dragState.shape.x + Number(dragState.shape.width ?? 180)); element.setAttribute('y2', dragState.shape.y + Number(dragState.shape.height ?? 90)); } }
});

document.addEventListener('pointerup', () => { if (dragState?.shape) { markDocumentChanged(getActiveDocument(state), 'shape moved'); render(); } dragState = null; });

function addShapeAtPointer(canvas, event) {
  const doc = getActiveDocument(state); if (!doc) return; doc.content.shapes ??= [];
  const rect = canvas.getBoundingClientRect(); const x = Math.round((event.clientX - rect.left) * 960 / rect.width); const y = Math.round((event.clientY - rect.top) * 600 / rect.height);
  const type = state.runtime.drawTool; const shape = { id: makeId('shape'), type, x, y, width: type === 'line' ? 160 : 140, height: type === 'line' ? 80 : 90, fill: type === 'text' ? '#1d1b20' : state.preferences.accent, stroke: type === 'text' ? 'none' : '#49454f', strokeWidth: 2, text: type === 'text' ? 'Text' : undefined };
  doc.content.shapes.push(shape); state.runtime.selectedShape = shape.id; state.runtime.drawTool = 'select'; markDocumentChanged(doc, 'shape added'); render();
}

function addBaseRecord() {
  const doc = getActiveDocument(state); if (!doc) return; doc.content.rows ??= [];
  let sequence = doc.content.rows.length + 1; let id = `C-${String(sequence).padStart(3, '0')}`; const ids = new Set(doc.content.rows.map((row) => row.id)); while (ids.has(id)) id = `C-${String(++sequence).padStart(3, '0')}`;
  const row = { id, name: 'New customer', contact: '', status: 'Lead', value: '0' }; doc.content.rows.push(row); state.runtime.selectedBaseRecord = id; state.runtime.baseFormRecordId = id; state.runtime.baseFormDraft = { ...row }; markDocumentChanged(doc, 'record created'); render();
}

function deleteBaseRecord(id) { const doc = getActiveDocument(state); if (!doc) return; doc.content.rows = doc.content.rows.filter((row) => row.id !== id); markDocumentChanged(doc, 'record deleted'); render(); }
function exportBaseCsv() { const doc = getActiveDocument(state); if (!doc) return; const keys = ['id', 'name', 'contact', 'status', 'value']; const q = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`; downloadBlob(`${doc.title.replace(/\.[^.]+$/, '')}.csv`, 'text/csv', [keys.join(','), ...doc.content.rows.map((row) => keys.map((key) => q(row[key])).join(','))].join('\r\n')); }

function saveBaseForm() {
  const doc = getActiveDocument(state); const row = doc?.content?.rows?.find((item) => item.id === state.runtime.baseFormRecordId); const draft = state.runtime.baseFormDraft;
  if (!doc || !row || !draft) return;
  for (const field of ['name', 'contact', 'status', 'value']) row[field] = String(draft[field] ?? '').slice(0, 10_000);
  state.runtime.baseFormDraft = null; markDocumentChanged(doc, 'record updated from form'); render();
  notify({ type: 'success', title: ['Record updated', '記錄已更新'], message: ['{id} was updated in this window. Workspace persistence and local-history health are reported separately.', '{id} 已喺呢個視窗更新。工作間儲存同本機版本紀錄狀態會分開如實報告。'], facts: { id: row.id }, persistent: false });
}

function exportBaseReport() {
  const doc = getActiveDocument(state); if (!doc) return;
  const statuses = [...new Set(doc.content.rows.map((row) => String(row.status || 'Unspecified')))];
  const numericTotal = doc.content.rows.reduce((sum, row) => { const value = Number(String(row.value ?? '').replace(/[^0-9+.-]/g, '')); return sum + (Number.isFinite(value) ? value : 0); }, 0);
  const report = `# ${doc.title.replace(/\.[^.]+$/, '')} report\n\nGenerated: ${new Date().toISOString()}\n\n- Records: ${doc.content.rows.length}\n- Numeric value total: ${numericTotal}\n\n## Status breakdown\n\n${statuses.map((status) => `- ${status}: ${doc.content.rows.filter((row) => String(row.status || 'Unspecified') === status).length}`).join('\n')}\n`;
  downloadBlob(`${doc.title.replace(/\.[^.]+$/, '')}-report.md`, 'text/markdown', report);
}

function insertMathSymbol(symbol) {
  const editor = document.querySelector('[data-math-editor]'); const doc = getActiveDocument(state); if (!editor || !doc) return;
  const at = editor.selectionStart ?? editor.value.length; editor.value = `${editor.value.slice(0, at)}${symbol}${editor.value.slice(editor.selectionEnd ?? at)}`; doc.content.formula = editor.value; markDocumentChanged(doc, 'formula symbol inserted'); const preview = document.querySelector('.math-preview'); if (preview) preview.innerHTML = renderMathSafe(editor.value); editor.focus(); editor.selectionStart = editor.selectionEnd = at + symbol.length;
}

function resetSettings() {
  const defaults = createDefaultUiState().preferences; state.preferences = { ...defaults, firstRunComplete: true }; applyPreferences(); render(); persistPreferences('settings reset'); notify({ type: 'success', title: 'Settings reset · 設定已重設', message: 'Defaults are active; documents and history were not removed.', persistent: false });
}

async function changelogMarkdown() {
  const from = state.runtime.changelogFrom ?? ''; const to = state.runtime.changelogTo ?? ''; const search = state.searches.changelog;
  const visible = (await filterCollectionAsync(CHANGELOG, search, (entry) => JSON.stringify(entry))).filter((entry) => !from || (entry.date && entry.date >= from)).filter((entry) => !to || (entry.date && entry.date <= to));
  return `# Material Office changelog\n\nExported range: ${from || 'first published release'} through ${to || 'latest published release'}\n\n${visible.map((entry) => `## ${entry.version} — ${entry.date ?? `unpublished ${entry.status ?? 'build'}`} — ${entry.codeName}\n\n${Object.entries(entry.sections).map(([category, items]) => `### ${category}\n\n${items.map((item) => `- ${item}`).join('\n')}`).join('\n\n')}`).join('\n\n')}`;
}
