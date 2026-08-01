"use client";

/* eslint-disable @next/next/no-img-element -- All imagery is bundled, provenance-verified, and intentionally emitted as ordinary static HTML for both Sites and the Pages build. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  regexFilterKey,
  useRegexFilter,
  useRegexPreview,
  type RegexEvaluation,
} from "./regex-client";
import { applyFunnyVoice, clampFunnyLevel } from "./funny-copy.mjs";
import { buildCloseReviewSignature, computeCloseCandidateIds } from "./tab-state.mjs";

type Language = "en" | "yue" | "both";
type Theme = "light" | "dark";
type Density = "compact" | "comfortable";
type Feature = [name: string, scope: string, area: string, command: string];
type TabId = "home" | "surfaces" | "features" | "docs" | "release" | "settings" | "about";
type NoticeKind = "info" | "success" | "warning" | "error";
type CopyCategory = "headline" | "body" | "action" | "status" | "info" | "success" | "warning" | "error" | "security" | "financial" | "destructive" | "accessibility";
type VoiceFn = (en: string, yue: string, category?: CopyCategory) => string;

type Preferences = {
  language: Language;
  funnyEn: number;
  funnyYue: number;
  theme: Theme;
  density: Density;
  accent: string;
  font: string;
  fontScale: number;
  surprise: boolean;
};

type SearchState = {
  query: string;
  regex: boolean;
  flags: string;
  sample: string;
  open: boolean;
};

type Notice = {
  id: number;
  title: string;
  body: string;
  kind: NoticeKind;
  time: string;
  visible: boolean;
};

type TabAppearance = Record<string, { color?: string; radius?: number; weight?: number }>;

type TabGroup = {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
};

type TabMembership = Record<TabId, string>;

type CloseMode = "containing" | "not-containing";

type CloseReview = {
  signature: string;
  mode: CloseMode;
  tabIds: TabId[];
};

type ReleaseState = {
  schemaVersion: 1;
  status: "candidate" | "published";
  version: string;
  tag: string | null;
  codeName: string;
  releaseUrl: string | null;
  installerName: string | null;
  installerUrl: string | null;
};

const STORAGE_KEY = "material-office-site-preferences-v1";
const VISITED_KEY = "material-office-site-visited-v1";
const DEFAULT_GROUPS: TabGroup[] = [
  { id: "explore", name: "Explore", color: "#6750a4", collapsed: false },
  { id: "reference", name: "Reference", color: "#006a6a", collapsed: false },
  { id: "product", name: "Product", color: "#8b5000", collapsed: false },
];
const DEFAULT_MEMBERSHIP: TabMembership = {
  home: "explore",
  surfaces: "explore",
  features: "explore",
  docs: "reference",
  release: "reference",
  settings: "product",
  about: "product",
};

const DEFAULT_RELEASE_STATE: ReleaseState = {
  schemaVersion: 1,
  status: "candidate",
  version: "0.1.0",
  tag: null,
  codeName: "Classic Har Gow · 蝦餃",
  releaseUrl: null,
  installerName: null,
  installerUrl: null,
};

function validReleaseState(value: unknown): value is ReleaseState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<ReleaseState>;
  if (state.schemaVersion !== 1 || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(state.version ?? "")) return false;
  if (state.codeName !== "Classic Har Gow · 蝦餃") return false;
  if (state.status === "candidate") return state.tag === null && state.releaseUrl === null && state.installerName === null && state.installerUrl === null;
  if (state.status !== "published" || !state.tag || !state.installerName || !state.releaseUrl || !state.installerUrl) return false;
  return /^v[0-9A-Za-z.-]+$/.test(state.tag)
    && /^Material-Office-[0-9A-Za-z.+-]+-x64-Setup\.exe$/.test(state.installerName)
    && /^https:\/\/github\.com\/Ding-Ding-Projects\/material-office\/releases\/tag\/v[0-9A-Za-z.-]+$/.test(state.releaseUrl)
    && state.installerUrl === `${state.releaseUrl.replace("/tag/", "/download/")}/${state.installerName}`;
}

const DEFAULT_PREFERENCES: Preferences = {
  language: "en",
  funnyEn: 2,
  funnyYue: 3,
  theme: "light",
  density: "comfortable",
  accent: "#6750a4",
  font: "Segoe UI",
  fontScale: 100,
  surprise: true,
};

const NAV_TABS: { id: TabId; en: string; yue: string; group: string }[] = [
  { id: "home", en: "Home", yue: "主頁", group: "Explore" },
  { id: "surfaces", en: "Surfaces", yue: "介面", group: "Explore" },
  { id: "features", en: "Features", yue: "功能", group: "Explore" },
  { id: "docs", en: "Docs", yue: "文件", group: "Reference" },
  { id: "release", en: "Release", yue: "版本", group: "Reference" },
  { id: "settings", en: "Settings", yue: "設定", group: "Product" },
  { id: "about", en: "About", yue: "關於", group: "Product" },
];

const TAB_IDS = NAV_TABS.map((tab) => tab.id);

function makeSearchState(sample: string): SearchState {
  return { query: "", regex: false, flags: "iu", sample, open: false };
}

function safeSearchState(value: unknown, fallback: SearchState): SearchState {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<SearchState>;
  const allowedFlags = new Set(["d", "g", "i", "m", "s", "u", "v", "y"]);
  const flags = typeof candidate.flags === "string"
    ? [...new Set([...candidate.flags].filter((flag) => allowedFlags.has(flag)))].join("").slice(0, 8)
    : fallback.flags;
  return {
    query: typeof candidate.query === "string" ? candidate.query.slice(0, 500) : fallback.query,
    regex: Boolean(candidate.regex),
    flags,
    sample: typeof candidate.sample === "string" ? candidate.sample.slice(0, 4_000) : fallback.sample,
    open: Boolean(candidate.open),
  };
}

function isTabId(value: unknown): value is TabId {
  return typeof value === "string" && TAB_IDS.includes(value as TabId);
}

function safeGroups(value: unknown): TabGroup[] {
  if (!Array.isArray(value)) return DEFAULT_GROUPS.map((group) => ({ ...group }));
  const seen = new Set<string>();
  const groups = value.flatMap((candidate): TabGroup[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const group = candidate as Partial<TabGroup>;
    const id = typeof group.id === "string" ? group.id.slice(0, 48) : "";
    const name = typeof group.name === "string" ? group.name.trim().slice(0, 40) : "";
    const color = typeof group.color === "string" && /^#[0-9a-f]{6}$/i.test(group.color) ? group.color : "#6750a4";
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name, color, collapsed: Boolean(group.collapsed) }];
  });
  return groups.length > 0 ? groups : DEFAULT_GROUPS.map((group) => ({ ...group }));
}

function safeMembership(value: unknown, groups: readonly TabGroup[]): TabMembership {
  const candidate = value && typeof value === "object" ? value as Partial<Record<TabId, unknown>> : {};
  const validGroups = new Set(groups.map((group) => group.id));
  const fallbackGroup = groups[0]?.id ?? DEFAULT_GROUPS[0].id;
  return Object.fromEntries(TAB_IDS.map((id) => {
    const saved = candidate[id];
    const defaultValue = DEFAULT_MEMBERSHIP[id];
    return [id, typeof saved === "string" && validGroups.has(saved)
      ? saved
      : validGroups.has(defaultValue) ? defaultValue : fallbackGroup];
  })) as TabMembership;
}

function plainMatchIndices(query: string, values: readonly string[]) {
  if (!query) return values.map((_, index) => index);
  const needle = query.toLocaleLowerCase();
  return values.flatMap((value, index) => value.toLocaleLowerCase().includes(needle) ? [index] : []);
}

function resolvedMatchIndices(search: SearchState, values: readonly string[], evaluation: RegexEvaluation) {
  if (!search.regex) return plainMatchIndices(search.query, values);
  if (!search.query || evaluation.pending || evaluation.error) return search.query ? [] : values.map((_, index) => index);
  return evaluation.indices;
}

function tabLabel(tab: (typeof NAV_TABS)[number], language: Language) {
  return localized(language, tab.en, tab.yue);
}

function orderedUniqueTabs(value: unknown): TabId[] {
  if (!Array.isArray(value)) return [...TAB_IDS];
  const valid = value.filter(isTabId);
  const unique = [...new Set(valid)];
  return [...unique, ...TAB_IDS.filter((id) => !unique.includes(id))];
}

const SURFACES = [
  {
    id: "start",
    icon: "▦",
    en: "Start Center",
    yue: "開始中心",
    shortEn: "Create a local document record, open a selected native file, or resume persisted work.",
    shortYue: "建立本機文件記錄、開啟揀選嘅原生檔案，或者繼續已保存工作。",
    behaviorEn: "The candidate Start Center lists persisted documents, offers six local document types, searches visible metadata, and hands selected native files to validated main-process services.",
    behaviorYue: "候選版開始中心列出已保存文件、提供六種本機文件類型、搜尋可見資料，並將揀選嘅原生檔案交畀已驗證主程序服務。",
    configEn: "Language, theme, density, search mode, tab state, and the startup surprise come from persisted app settings.",
    configYue: "語言、主題、密度、搜尋模式、分頁狀態同啟動驚喜都來自已保存設定。",
    failureEn: "A canceled picker changes nothing. Missing files and unavailable LibreOffice capabilities report an exact error without blocking local records.",
    failureYue: "取消揀檔唔會改嘢；檔案失蹤或 LibreOffice 功能不可用會準確報錯，唔會阻住本機記錄。",
    securityEn: "The renderer receives opaque document metadata rather than a general file-system capability; native paths stay in the main process.",
    securityYue: "renderer 只收到不透明文件資料，唔會得到一般檔案系統權限；原生路徑留喺主程序。",
    verifyEn: "Local smoke covers creation, selected-file opening, recent search, persistence, and keyboard navigation.",
    verifyYue: "本機 smoke 測試涵蓋建立、揀檔開啟、近期搜尋、保存同鍵盤導覽。",
    suggested: ["writer", "settings"],
  },
  {
    id: "writer",
    icon: "¶",
    en: "Writer",
    yue: "Writer 文字文件",
    shortEn: "A local rich-text page with headings, basic formatting, word count, export, and history.",
    shortYue: "本機富文字頁面，有標題、基本格式、字數、匯出同歷史。",
    behaviorEn: "Writer provides an editable rich-text page, headings, lists, alignment, basic inline formatting, word count, autosave, honest HTML export, and a custom .mow save package with an embedded Git bundle so restore can be undone again.",
    behaviorYue: "Writer 提供可編輯富文字頁、標題、清單、對齊、基本行內格式、字數、自動保存同如實 HTML 匯出。",
    configEn: "Font, size, style, alignment, line spacing, zoom, properties visibility, language, and appearance persist locally.",
    configYue: "字型、大小、樣式、對齊、行距、縮放、屬性顯示、語言同外觀會保存喺本機。",
    failureEn: "Unsupported commands are disabled with a reason; save, recovery, and history failures appear as actionable notifications.",
    failureYue: "唔支援嘅指令會停用兼講原因；儲存、復原同歷史失敗會用可處理通知顯示。",
    securityEn: "Document content stays in the selected file and local history. External links and macros require explicit confirmation.",
    securityYue: "文件內容只留喺指定檔案同本機歷史；外部連結同巨集要明確確認。",
    verifyEn: "Local smoke covers editing, formatting, persistence, HTML export, history restore, and keyboard traversal. Native ODT/DOCX fidelity is not claimed.",
    verifyYue: "本機 smoke 測試涵蓋編輯、格式、保存、HTML 匯出、歷史還原同鍵盤操作；唔聲稱原生 ODT/DOCX 準確度。",
    suggested: ["history", "features"],
  },
  {
    id: "calc",
    icon: "#",
    en: "Calc",
    yue: "Calc 試算表",
    shortEn: "An editable local grid with sheets, a formula bar, bounded formulas, and CSV export.",
    shortYue: "可編輯本機格仔，有工作表、公式列、有界限公式同 CSV 匯出。",
    behaviorEn: "Calc supports cell editing, sheet creation, arithmetic, references, ranges, and SUM, AVERAGE, MIN, MAX, and COUNT through a bounded parser.",
    behaviorYue: "Calc 用有界限 parser 支援格仔編輯、建立工作表、算術、參照、範圍同 SUM、AVERAGE、MIN、MAX、COUNT。",
    configEn: "Sheets, active cell, raw formulas, formats, zoom, search, and tab state persist with the workspace.",
    configYue: "工作表、目前格仔、原始公式、格式、縮放、搜尋同分頁狀態會跟工作區保存。",
    failureEn: "Formula and import errors identify the exact cell and preserve the entered expression for correction.",
    failureYue: "公式同匯入錯誤會指出確實格仔，保留原本輸入方便修正。",
    securityEn: "External data links and macros are inactive until the user approves their source and scope.",
    securityYue: "外部數據連結同巨集要用戶確認來源同範圍先會啟用。",
    verifyEn: "Tests cover precedence, references, ranges, Unicode, cycles, error propagation, persistence, and JavaScript-injection attempts. Filters, pivots, charts, and full office formulas are not implemented locally.",
    verifyYue: "測試涵蓋優先次序、參照、範圍、Unicode、循環、錯誤傳遞、保存同 JavaScript 注入；本機未實作篩選、樞紐、圖表同完整辦公公式。",
    suggested: ["features", "history"],
  },
  {
    id: "impress",
    icon: "▰",
    en: "Impress",
    yue: "Impress 簡報",
    shortEn: "Editable local slide records with thumbnails, layouts, ordering, and a basic presentation view.",
    shortYue: "可編輯本機投影片記錄，有縮圖、版面、排序同基本播放檢視。",
    behaviorEn: "Impress supports title/body editing, thumbnails, add, duplicate, delete, layout selection, ordering, and full-screen previous/next presentation controls.",
    behaviorYue: "Impress 支援標題同正文編輯、縮圖、新增、複製、刪除、版面選擇、排序，同全螢幕上／下一張控制。",
    configEn: "Slides, active slide, selected layout, theme, font, zoom, and tab placement persist locally.",
    configYue: "投影片、目前投影片、版面、主題、字型、縮放同分頁位置會保存喺本機。",
    failureEn: "Missing media remains represented by an accessible placeholder and can be relinked without losing layout.",
    failureYue: "遺失媒體會用無障礙預留位顯示，可以重新連結而唔會整亂版面。",
    securityEn: "Linked media and scripts are never fetched or executed silently during preview or presentation.",
    securityYue: "連結媒體同腳本喺預覽或播放時都唔會靜雞雞下載或執行。",
    verifyEn: "Local smoke covers thumbnails, active canvas, ordering, layouts, and presentation controls. Animations, media, masters, and native ODP fidelity are LibreOffice-only.",
    verifyYue: "本機 smoke 涵蓋縮圖、目前畫布、排序、版面同播放控制；動畫、媒體、母片同原生 ODP 準確度只由 LibreOffice 處理。",
    suggested: ["draw", "features"],
  },
  {
    id: "draw",
    icon: "◇",
    en: "Draw",
    yue: "Draw 繪圖",
    shortEn: "A local SVG canvas for rectangles, ellipses, lines, text, selection, and basic styling.",
    shortYue: "本機 SVG 畫布，支援矩形、橢圓、線、文字、選取同基本樣式。",
    behaviorEn: "Draw supports rectangle, ellipse, line, and text creation; selection; drag; duplicate; delete; fill; stroke; and line-width controls.",
    behaviorYue: "Draw 支援建立矩形、橢圓、線同文字，以及選取、拖拉、複製、刪除、填色、線色同線寬。",
    configEn: "Shape data, selected tool, functional fill/stroke values, zoom, and shell appearance persist locally.",
    configYue: "形狀資料、目前工具、功能填色線色、縮放同外殼外觀會保存喺本機。",
    failureEn: "Unsupported object effects remain visible with a capability notice instead of being silently discarded.",
    failureYue: "唔支援嘅物件效果會保留並顯示能力提示，唔會無聲無息消失。",
    securityEn: "Embedded objects are isolated and require consent before opening an external handler.",
    securityYue: "嵌入物件會隔離處理，開外部程式之前一定要同意。",
    verifyEn: "Local smoke covers canvas rendering and mutations. Connectors, layers, snapping, grouping, advanced vector effects, and native ODG fidelity are not local features.",
    verifyYue: "本機 smoke 涵蓋畫布顯示同改動；連接線、圖層、吸附、群組、高階向量效果同原生 ODG 準確度唔係本機功能。",
    suggested: ["impress", "components"],
  },
  {
    id: "base",
    icon: "◫",
    en: "Base",
    yue: "Base 資料庫",
    shortEn: "Local records with table, fixed-predicate query, form, report, and CSV views.",
    shortYue: "本機記錄，有資料表、固定條件查詢、表單、報告同 CSV 檢視。",
    behaviorEn: "Base edits local records, applies fixed contains/equals/starts-with/numeric predicates, saves a selected form record, and calculates report summaries with Markdown export.",
    behaviorYue: "Base 編輯本機記錄、套用固定包含／相等／開頭／數字條件、保存表單記錄，並計算報告摘要同匯出 Markdown。",
    configEn: "Stable record IDs, query state, form draft, selected record, object view, search, and CSV data persist in the app-owned workspace.",
    configYue: "穩定記錄 ID、查詢狀態、表單草稿、目前記錄、物件檢視、搜尋同 CSV 資料會保存喺應用工作區。",
    failureEn: "Malformed or oversized CSV input reports the limitation without replacing current records. ODB and database-driver workflows open in LibreOffice.",
    failureYue: "錯誤或過大 CSV 會報告限制，唔會蓋過目前記錄；ODB 同資料庫 driver 流程交畀 LibreOffice。",
    securityEn: "The local model exposes no SQL or network endpoint; query operators are fixed predicates and file selection remains in the main process.",
    securityYue: "本機模型冇 SQL 或網絡端點；查詢運算係固定條件，揀檔留喺主程序。",
    verifyEn: "Local smoke covers record creation, query, form save, calculated report, persistence, and CSV boundaries. Native Base drivers are not reimplemented.",
    verifyYue: "本機 smoke 涵蓋新增記錄、查詢、表單保存、計算報告、保存同 CSV 界線；冇重做原生 Base driver。",
    suggested: ["features", "history"],
  },
  {
    id: "math",
    icon: "∑",
    en: "Math",
    yue: "Math 公式",
    shortEn: "Markup and symbol palettes stay synchronized with a readable formula preview.",
    shortYue: "標記語法同符號面板同步，公式預覽清楚易睇。",
    behaviorEn: "Math pairs a bounded command editor and symbol palette with live escaped MathML for literals, operators, fractions, scripts, roots, groups, and common Greek symbols.",
    behaviorYue: "Math 將有界限指令編輯器同符號面板配合即時轉義 MathML，支援文字、運算符、分數、上下標、根號、群組同常用希臘字母。",
    configEn: "Formula source, title, zoom, appearance, tab, and language state persist locally.",
    configYue: "公式來源、標題、縮放、外觀、分頁同語言狀態會保存喺本機。",
    failureEn: "Syntax feedback points to the failing token while retaining the complete expression for repair.",
    failureYue: "語法回饋會指出出錯符號，同時保留完整公式方便修理。",
    securityEn: "Formula markup is treated as data and never interpreted as script or HTML.",
    securityYue: "公式標記只當數據，絕對唔會當腳本或 HTML 執行。",
    verifyEn: "Exercise valid and invalid markup, Unicode symbols, matrices, accessibility names, import, and export.",
    verifyYue: "測試正確同錯誤標記、Unicode 符號、矩陣、無障礙名稱、匯入同匯出。",
    suggested: ["features", "components"],
  },
  {
    id: "features",
    icon: "⌘",
    en: "Features",
    yue: "功能總覽",
    shortEn: "Search and inspect 2,433 locally bundled LibreOffice command records.",
    shortYue: "搜尋同檢視本機內置嘅 2,433 個指令記錄。",
    behaviorEn: "The catalog filters 2,433 bundled LibreOffice command records by visible name, module, area, and exact UNO URI. It is an index of LibreOffice capability, not 2,433 Electron implementations.",
    behaviorYue: "功能目錄按顯示名稱、模組、範疇同完整 UNO 指令 URI 篩選所有內置指令。",
    configEn: "Plain text is the default; the adjacent JavaScript regex builder adds flags, guided tokens, samples, matches, and captures.",
    configYue: "預設用純文字；旁邊 JavaScript 正則表達式工具提供旗標、引導片段、樣本、配對同擷取組。",
    failureEn: "An invalid pattern is reported inline without replacing the query. A cataloged command may still be unavailable in the active LibreOffice document context.",
    failureYue: "正則式錯誤會原位顯示，唔會清走查詢；目錄數據缺失亦唔會作指令。",
    securityEn: "Search is bounded and evaluated locally. This documentation site displays command URIs but cannot execute them.",
    securityYue: "搜尋有長度限制兼只喺本機處理；文件網站只顯示指令 URI，唔可以執行。",
    verifyEn: "Tests confirm 2,433 record identities, scope counts, plain/regex search, invalid syntax, Unicode, and duplicate labels. Execution requires compatible LibreOffice and a confirming broker result.",
    verifyYue: "驗證 2,433 個記錄、各範圍數量、純文字同正則搜尋、錯誤語法、Unicode 同重複標籤。",
    suggested: ["components", "settings"],
  },
  {
    id: "history",
    icon: "↺",
    en: "History",
    yue: "版本歷史",
    shortEn: "Append-only local snapshots make every meaningful change reviewable and restorable.",
    shortYue: "只追加嘅本機快照，令每次重要改動都可以翻查同還原。",
    behaviorEn: "History lists app-owned workspace snapshots, filters them, exports selected data, compares bounded redacted revisions, labels them, and restores a validated state as a new revision. Custom .mow saves embed a Git bundle; a reviewed prune keeps the newest snapshots and permanently removes older unreachable history without changing the current workspace.",
    behaviorYue: "歷史列出應用擁有嘅工作區快照、篩選同匯出，並將已驗證狀態還原成新版本。經確認嘅清理會保留最新快照，再永久移除舊到退休嘅歷史，現時工作區唔會郁。",
    configEn: "Choose a retention limit from 10 to 10,000, then compose date, recorded-action, text, and regex filters. Editing the limit only saves the preference; Prune now requires an explicit review and confirmation.",
    configYue: "可揀 10 至 10,000 個保留版本，再組合日期、已記錄動作、文字同正則篩選。改數字只會儲存偏好；要撳「立即清理」再確認，舊版本先會正式退場。",
    failureEn: "A snapshot write failure never blocks the user action. Pruning refuses dirty or concurrently changed history and reports cleanup failures without pretending older snapshots were removed.",
    failureYue: "快照寫入失敗唔會阻住原本操作。歷史未乾淨或者同時有改動時，清理會拒絕出手；清理失敗亦會老實報告，唔會扮啲舊版本已經消失。",
    securityEn: "History stays in an app-owned isolated local repository. The renderer can submit only a bounded retention limit, while the main process performs an expected-old-tip branch update and expires unreachable objects.",
    securityYue: "歷史留喺應用擁有嘅本機獨立 repository。Renderer 只可以提交有上下限嘅保留數量；main process 會核對舊分支尖端先原子更新，再清走不可達物件。",
    verifyEn: "Tests retain the newest 10 of 12 snapshots with exact actions and timestamps, prove removed revisions are unreachable, leave unrelated files untouched, and restore a retained snapshot as a new append-only revision.",
    verifyYue: "測試證明 12 個快照會準確保留最新 10 個同原本時間、動作；被清走版本再搵唔返、無關檔案完全冇被掂，保留版本亦可還原成新嘅只追加修訂。",
    suggested: ["writer", "settings"],
  },
  {
    id: "components",
    icon: "◉",
    en: "Components",
    yue: "元件",
    shortEn: "An inspectable gallery for the candidate's implemented Material controls and tokens.",
    shortYue: "完整 Material 3 標記同互動規格，集中喺一個可檢視元件庫。",
    behaviorEn: "The gallery demonstrates the candidate's semantic colors, buttons, fields, selection controls, density, progress, and editable appearance targets.",
    behaviorYue: "元件庫展示語意顏色、字款、形狀、密度、按鈕、欄位、選取、分頁、清單、進度同狀態。",
    configEn: "Every sample resolves from the same persisted appearance settings used by the product and documentation site.",
    configYue: "每個樣本都用產品同文件網站共用、可保存嘅外觀設定。",
    failureEn: "Unsupported appearance properties stay visible with a capability explanation and retain their saved value.",
    failureYue: "平台唔支援嘅外觀屬性仍會顯示原因，亦會保留已儲存數值。",
    securityEn: "Themes are local data, imported files are schema-validated, and previews never load remote assets.",
    securityYue: "主題只係本機數據；匯入檔案會驗證格式；預覽唔會載入遠端素材。",
    verifyEn: "Check every state, contrast, keyboard path, reset, persistence, import/export, narrow width, and reduced motion.",
    verifyYue: "檢查所有狀態、對比、鍵盤路徑、重設、保存、匯入匯出、窄畫面同減少動態。",
    suggested: ["settings", "dialogs"],
  },
  {
    id: "dialogs",
    icon: "▣",
    en: "Dialogs",
    yue: "對話框",
    shortEn: "Options, save, print, and decisions use the right level of attention and context.",
    shortYue: "選項、儲存、列印同決定，各自用啱份量嘅注意力同脈絡。",
    behaviorEn: "The candidate demonstrates options and Save As decisions and delegates printing to the native Windows print surface. Informational results use non-blocking notifications.",
    behaviorYue: "候選版示範選項同另存決定，列印交畀原生 Windows 列印介面；純資訊用非阻塞通知。",
    configEn: "Remember safe defaults such as printer, export format, and last location without pre-authorizing destructive choices.",
    configYue: "可記住打印機、匯出格式同上次位置等安全預設，但唔會預先批准破壞性選擇。",
    failureEn: "Validation remains inline, preserves the entered value, identifies the affected field, and offers the smallest recovery step.",
    failureYue: "驗證錯誤會原位顯示、保留輸入、指出受影響欄位，同提供最細復原步驟。",
    securityEn: "No credential form is implemented here. Sensitive future workflows must use a protected native boundary and must not enter URLs, logs, history, or page markup.",
    securityYue: "敏感資料唔會進入網址、記錄、歷史、分析、截圖或頁面標記。",
    verifyEn: "Test focus trap and return, Escape, validation, cancellation, screen-reader labels, print failure, and keyboard-only use.",
    verifyYue: "測試焦點限制同返回、Escape、驗證、取消、讀屏標籤、列印失敗同純鍵盤操作。",
    suggested: ["settings", "start"],
  },
] as const;

const SCOPE_LABELS: Record<string, [string, string]> = {
  all: ["All applications", "所有應用程式"],
  shared: ["Common", "共用"],
  writer: ["Writer", "Writer"],
  calc: ["Calc", "Calc"],
  sd: ["Draw & Impress", "Draw 同 Impress"],
  chart: ["Charts", "圖表"],
  math: ["Math", "Math"],
  dbu: ["Base", "Base"],
  report: ["Reports", "報告"],
  basic: ["Basic IDE", "Basic IDE"],
  biblio: ["Bibliography", "參考書目"],
};

const EN_TONES = [
  "Precise, calm, and entirely professional.",
  "Clear and professional, with a light human touch.",
  "Friendly, direct, and occasionally willing to smile.",
  "Playful around the edges; the facts still wear a tie.",
  "Maximum sparkle. The facts remain bolted to the floor.",
];

const YUE_TONES = [
  "專業、清晰、直接。",
  "清楚行先，輕鬆少少。",
  "友善直接，間中識得笑。",
  "玩味多啲，但事實依然企得穩。",
  "玩味全開，事實就鎖實喺地下，唔會走雞。",
];

function localized(language: Language, en: string, yue: string) {
  if (language === "yue") return yue;
  if (language === "both") return `${en} · ${yue}`;
  return en;
}

function decodeCommand(value: string) {
  return value.replaceAll("&amp;", "&");
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number) {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === rr) hue = ((gg - bb) / delta) % 6;
    else if (max === gg) hue = (bb - rr) / delta + 2;
    else hue = (rr - gg) / delta + 4;
  }
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  const light = (max + min) / 2;
  const sat = delta ? delta / (1 - Math.abs(2 * light - 1)) : 0;
  return { h: hue, s: Math.round(sat * 100), l: Math.round(light * 100) };
}

function relativeLuminance(r: number, g: number, b: number) {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(rgb: { r: number; g: number; b: number }, against: "black" | "white") {
  const first = relativeLuminance(rgb.r, rgb.g, rgb.b);
  const second = against === "black" ? 0 : 1;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function RegexBuilder({
  id,
  label,
  state,
  onChange,
  language,
  notify,
  voice,
}: {
  id: string;
  label: string;
  state: SearchState;
  onChange: (next: SearchState) => void;
  language: Language;
  notify: (title: string, body: string, kind?: NoticeKind) => void;
  voice: VoiceFn;
}) {
  const preview = useRegexPreview(state);
  const tokens = [
    ["Literal", "literal"],
    ["Class", "[A-Za-z]"],
    ["Anchors", "^$"],
    ["Group", "(group)"],
    ["Alternate", "cat|dog"],
    ["Quantifier", "{1,3}"],
    ["Digits", "\\d+"],
  ];

  const copyPattern = async () => {
    try {
      await navigator.clipboard.writeText(state.query);
      notify(
        voice("Pattern copied", "已複製正則式", "success"),
        voice("The current JavaScript pattern is on the clipboard.", "而家個 JavaScript 正則式已放入剪貼簿。", "success"),
        "success",
      );
    } catch {
      notify(
        voice("Copy unavailable", "未能複製", "warning"),
        voice("Clipboard permission was not granted.", "未獲剪貼簿權限。", "warning"),
        "warning",
      );
    }
  };

  const exportPattern = () => {
    const body = JSON.stringify(
      { dialect: "ECMAScript RegExp", pattern: state.query, flags: state.flags, sample: state.sample },
      null,
      2,
    );
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${id}-regex.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify(
      voice("Pattern exported", "已匯出正則式", "success"),
      voice("The exported file includes the dialect, flags, and sample text.", "匯出檔案包括語法、旗標同樣本文字。", "success"),
      "success",
    );
  };

  if (!state.open) return null;

  return (
    <section className="regex-builder" aria-label={`${label} regex builder`}>
      <div className="regex-title-row">
        <div>
          <p className="eyebrow">ECMAScript RegExp</p>
          <h3>{localized(language, "Regex builder", "正則表達式工具")}</h3>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={localized(language, "Close regex builder", "關閉正則式工具")}
          onClick={() => onChange({ ...state, open: false })}
        >
          ×
        </button>
      </div>
      <p className="supporting">
        {localized(
          language,
          "JavaScript syntax. Evaluation stays on this device; patterns and samples are limited to protect the page.",
          "使用 JavaScript 語法；只喺呢部裝置運算，正則式同樣本都有長度限制保護頁面。",
        )}
      </p>
      <label className="switch-row regex-mode-switch">
        <span><strong>{localized(language, "Use regex for this search", "呢個搜尋使用正則式")}</strong><small>{localized(language, "Turn off to return to plain-text matching.", "關閉即可返回純文字配對。")}</small></span>
        <input type="checkbox" role="switch" checked={state.regex} onChange={(event) => onChange({ ...state, regex: event.target.checked })} />
      </label>
      <div className="token-row" aria-label={localized(language, "Guided pattern pieces", "引導式正則片段")}>
        {tokens.map(([name, token]) => (
          <button
            type="button"
            className="assist-chip"
            key={name}
            onClick={() => onChange({ ...state, query: `${state.query}${token}`, regex: true })}
          >
            {name} <code>{token}</code>
          </button>
        ))}
      </div>
      <label className="field-label" htmlFor={`${id}-pattern`}>
        {localized(language, "Raw pattern", "原始正則式")}
      </label>
      <input
        id={`${id}-pattern`}
        className="text-field mono"
        value={state.query}
        maxLength={500}
        onChange={(event) => onChange({ ...state, query: event.target.value, regex: true })}
        spellCheck={false}
      />
      <fieldset className="flags">
        <legend>{localized(language, "Flags", "旗標")}</legend>
        {["g", "i", "m", "s", "u"].map((flag) => (
          <label key={flag}>
            <input
              type="checkbox"
              checked={state.flags.includes(flag)}
              onChange={(event) => {
                const next = event.target.checked
                  ? `${state.flags}${flag}`
                  : state.flags.replaceAll(flag, "");
                onChange({ ...state, flags: [...new Set(next)].join("") });
              }}
            />
            <code>{flag}</code>
          </label>
        ))}
      </fieldset>
      <label className="field-label" htmlFor={`${id}-sample`}>
        {localized(language, "Sample text", "樣本文字")}
      </label>
      <textarea
        id={`${id}-sample`}
        className="text-area"
        value={state.sample}
        maxLength={4000}
        onChange={(event) => onChange({ ...state, sample: event.target.value })}
      />
      <div className={`syntax-status ${preview.error ? "is-error" : "is-valid"}`} role="status" aria-busy={preview.pending}>
        {preview.pending
          ? voice("Checking safely in a worker…", "喺 worker 安全檢查中…", "status")
          : preview.error
          ? `${voice("Regex error", "正則式錯誤", "error")}: ${preview.error}`
          : voice(`${preview.matches.length} preview matches`, `預覽有 ${preview.matches.length} 個配對`, "status")}
      </div>
      {!preview.error && preview.matches.length > 0 && (
        <ol className="match-list">
          {preview.matches.slice(0, 6).map((match, index) => (
            <li key={`${match.index}-${index}`}>
              <code>{match.value || "(zero-width)"}</code>
              <span>@ {match.index}</span>
              {match.groups.length > 0 && (
                <small>{localized(language, "captures", "擷取組")}: {match.groups.map((group) => group ?? "∅").join(" · ")}</small>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="button-row">
        <button type="button" className="tonal-button" onClick={copyPattern} disabled={!state.query}>
          {localized(language, "Copy", "複製")}
        </button>
        <button type="button" className="text-button" onClick={exportPattern} disabled={!state.query}>
          {localized(language, "Export JSON", "匯出 JSON")}
        </button>
      </div>
    </section>
  );
}

function SearchControl({
  id,
  label,
  placeholder,
  state,
  onChange,
  language,
  notify,
  evaluation,
  voice,
}: {
  id: string;
  label: string;
  placeholder: string;
  state: SearchState;
  onChange: (next: SearchState) => void;
  language: Language;
  notify: (title: string, body: string, kind?: NoticeKind) => void;
  evaluation?: RegexEvaluation;
  voice: VoiceFn;
}) {
  const error = state.regex ? evaluation?.error ?? "" : "";
  const pending = Boolean(state.regex && state.query && evaluation?.pending);
  return (
    <div className="search-workbench">
      <div className={`search-shell ${error ? "has-error" : ""}`}>
        <span aria-hidden="true" className="search-icon">⌕</span>
        <label className="sr-only" htmlFor={id}>{label}</label>
        <input
          id={id}
          value={state.query}
          onChange={(event) => onChange({ ...state, query: event.target.value })}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : pending ? `${id}-status` : undefined}
        />
        {state.query && (
          <button
            type="button"
            className="clear-search"
            aria-label={localized(language, "Clear search", "清除搜尋")}
            onClick={() => onChange({ ...state, query: "" })}
          >
            ×
          </button>
        )}
        <button
          type="button"
          className={`regex-button ${state.regex ? "is-active" : ""}`}
          aria-expanded={state.open}
          aria-pressed={state.regex}
          aria-controls={`${id}-builder`}
          onClick={() => onChange({ ...state, open: !state.open })}
        >
          <span aria-hidden="true">.*</span>
          {localized(language, "Regex", "正則式")}
        </button>
      </div>
      {pending && <p id={`${id}-status`} className="search-progress" role="status">{voice("Checking safely…", "安全檢查中…", "status")}</p>}
      {error && <p id={`${id}-error`} className="inline-error">{error}</p>}
      <div id={`${id}-builder`}>
        <RegexBuilder
          id={id}
          label={label}
          state={state}
          onChange={onChange}
          language={language}
          notify={notify}
          voice={voice}
        />
      </div>
    </div>
  );
}

type DiscoveryItem = {
  id: string;
  searchText: string;
  label: string;
  detail: string;
  activateLabel: string;
};

function TabDiscoveryCard({
  id,
  label,
  placeholder,
  state,
  onChange,
  items,
  language,
  notify,
  onActivate,
  voice,
}: {
  id: string;
  label: string;
  placeholder: string;
  state: SearchState;
  onChange: (next: SearchState) => void;
  items: DiscoveryItem[];
  language: Language;
  notify: (title: string, body: string, kind?: NoticeKind) => void;
  onActivate: (item: DiscoveryItem) => void;
  voice: VoiceFn;
}) {
  const values = items.map((item) => item.searchText);
  const evaluation = useRegexFilter(state, values);
  const indices = resolvedMatchIndices(state, values, evaluation);
  const results = indices.map((index) => items[index]).filter(Boolean);

  return (
    <section className="tab-search-card" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{label}</h3>
      <SearchControl
        id={id}
        label={label}
        placeholder={placeholder}
        state={state}
        onChange={onChange}
        language={language}
        notify={notify}
        evaluation={evaluation}
        voice={voice}
      />
      <p aria-live="polite"><strong>{results.length}</strong> {localized(language, "matches", "個結果")}</p>
      {state.query && !evaluation.pending && !evaluation.error && (
        <ul className="discovery-results">
          {results.slice(0, 12).map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onActivate(item)} aria-label={item.activateLabel}>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CloseTabsControl({
  mode,
  state,
  onChange,
  openTabs,
  pinnedTabs,
  includePinned,
  language,
  notify,
  onReview,
  voice,
}: {
  mode: CloseMode;
  state: SearchState;
  onChange: (next: SearchState) => void;
  openTabs: TabId[];
  pinnedTabs: TabId[];
  includePinned: boolean;
  language: Language;
  notify: (title: string, body: string, kind?: NoticeKind) => void;
  onReview: (review: CloseReview) => void;
  voice: VoiceFn;
}) {
  const tabs = useMemo(() => openTabs
    .map((id) => NAV_TABS.find((tab) => tab.id === id))
    .filter((tab): tab is (typeof NAV_TABS)[number] => Boolean(tab)), [openTabs]);
  const values = useMemo(() => tabs.map((tab) => tabLabel(tab, language)), [tabs, language]);
  const evaluation = useRegexFilter(state, values);
  const matchIndices = resolvedMatchIndices(state, values, evaluation);
  const affectedIds = computeCloseCandidateIds({
    openIds: tabs.map((tab) => tab.id),
    matchIndices,
    mode,
    pinnedIds: pinnedTabs,
    includePinned,
  }) as TabId[];
  const affected = tabs.filter((tab) => affectedIds.includes(tab.id));
  const currentKey = regexFilterKey(state, values);
  const settled = !state.regex || (!evaluation.pending && !evaluation.error && evaluation.key === currentKey);
  const leavesTab = affected.length < openTabs.length;
  const canReview = Boolean(state.query) && settled && !evaluation.error && affected.length > 0 && leavesTab;
  const label = mode === "containing"
    ? localized(language, "Close tabs containing text", "關閉包含文字嘅分頁")
    : localized(language, "Close tabs not containing text", "關閉唔包含文字嘅分頁");

  return (
    <section className="close-tabs-card">
      <h3>{label}</h3>
      <SearchControl
        id={`close-tabs-${mode}`}
        label={label}
        placeholder={localized(language, "Match visible tab labels", "配對可見分頁標籤")}
        state={state}
        onChange={onChange}
        language={language}
        notify={notify}
        evaluation={evaluation}
        voice={voice}
      />
      <div className="close-preview" aria-live="polite">
        {!state.query ? localized(language, "Enter a non-empty query to preview.", "輸入非空白查詢先可以預覽。")
          : evaluation.error ? localized(language, "Fix the pattern before reviewing.", "先修正正則式先可以檢查。")
          : evaluation.pending ? localized(language, "Checking the current tab state safely…", "安全檢查目前分頁狀態中…")
          : affected.length === openTabs.length ? localized(language, "This would close every open tab, so it is blocked.", "呢個操作會關閉全部分頁，所以已阻止。")
          : `${affected.length} ${localized(language, "tabs would close", "個分頁會關閉")}`}
      </div>
      {affected.length > 0 && !evaluation.pending && !evaluation.error && (
        <ul className="affected-tabs">
          {affected.map((tab) => <li key={tab.id}>{tabLabel(tab, language)}{pinnedTabs.includes(tab.id) ? ` · ${localized(language, "pinned", "已釘選")}` : ""}</li>)}
        </ul>
      )}
      <button
        type="button"
        className="tonal-button"
        disabled={!canReview}
        onClick={() => onReview({
          signature: buildCloseReviewSignature({ mode, search: state, openIds: openTabs, pinnedIds: pinnedTabs, includePinned, language }),
          mode,
          tabIds: affected.map((tab) => tab.id),
        })}
      >
        {localized(language, "Review close", "檢查關閉內容")}
      </button>
    </section>
  );
}

function DetailSections({ surface, language, onSuggested }: {
  surface: (typeof SURFACES)[number];
  language: Language;
  onSuggested: (id: string) => void;
}) {
  const sections = [
    ["Behavior", "行為", surface.behaviorEn, surface.behaviorYue],
    ["Configuration", "設定", surface.configEn, surface.configYue],
    ["Failure modes", "失敗情況", surface.failureEn, surface.failureYue],
    ["Security", "安全", surface.securityEn, surface.securityYue],
    ["Verification", "驗證", surface.verifyEn, surface.verifyYue],
  ];
  return (
    <>
      <div className="article-sections">
        {sections.map(([enHeading, yueHeading, enBody, yueBody]) => (
          <section key={enHeading}>
            <h3>{localized(language, enHeading, yueHeading)}</h3>
            <p>{localized(language, enBody, yueBody)}</p>
          </section>
        ))}
      </div>
      <aside className="suggested-articles" aria-label={localized(language, "Suggested articles", "建議文章")}>
        <p className="eyebrow">{localized(language, "Suggested articles", "建議文章")}</p>
        <div className="chip-row">
          {surface.suggested.map((id) => {
            const item = SURFACES.find((candidate) => candidate.id === id) ?? SURFACES[0];
            return (
              <button type="button" className="assist-chip" key={id} onClick={() => onSuggested(id)}>
                {localized(language, item.en, item.yue)} →
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}

export default function Home() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [tabOrder, setTabOrder] = useState<TabId[]>(NAV_TABS.map((tab) => tab.id));
  const [openTabs, setOpenTabs] = useState<TabId[]>(NAV_TABS.map((tab) => tab.id));
  const [pinnedTabs, setPinnedTabs] = useState<TabId[]>(["home"]);
  const [tabGroups, setTabGroups] = useState<TabGroup[]>(DEFAULT_GROUPS);
  const [tabMembership, setTabMembership] = useState<TabMembership>(DEFAULT_MEMBERSHIP);
  const [tabAppearance, setTabAppearance] = useState<TabAppearance>({});
  const [tabMenu, setTabMenu] = useState<{ id: TabId; x: number; y: number } | null>(null);
  const [appearanceTarget, setAppearanceTarget] = useState<TabId | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [featuresReady, setFeaturesReady] = useState(false);
  const [featureError, setFeatureError] = useState("");
  const [featureScope, setFeatureScope] = useState("all");
  const [featurePage, setFeaturePage] = useState(0);
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [selectedDoc, setSelectedDoc] = useState("start");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [surpriseVisible, setSurpriseVisible] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [releaseState, setReleaseState] = useState<ReleaseState>(DEFAULT_RELEASE_STATE);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("#6750a4");
  const [includePinnedInClose, setIncludePinnedInClose] = useState(false);
  const [closeReview, setCloseReview] = useState<CloseReview | null>(null);
  const [previewWindow, setPreviewWindow] = useState<"open" | "minimized" | "closed">("open");
  const surpriseChecked = useRef(false);
  const noticeId = useRef(0);
  const groupSequence = useRef(0);
  const closeDialogRef = useRef<HTMLElement>(null);

  const [productSearch, setProductSearch] = useState<SearchState>({
    query: "",
    regex: false,
    flags: "iu",
    sample: "Writer Save As Calc formula History restore Classic Har Gow 蝦餃",
    open: false,
  });
  const [settingsSearch, setSettingsSearch] = useState<SearchState>({
    query: "",
    regex: false,
    flags: "iu",
    sample: "theme density accent font language funny notifications surprise tabs",
    open: false,
  });
  const [tabSearches, setTabSearches] = useState<Record<"strip" | "names" | "master", SearchState>>({
    strip: makeSearchState("Home Surfaces Features Docs Release Settings About"),
    names: makeSearchState("Explore Reference Product"),
    master: makeSearchState("Main window Home Features Settings"),
  });
  const [groupSearches, setGroupSearches] = useState<Record<string, SearchState>>(() => Object.fromEntries(
    DEFAULT_GROUPS.map((group) => [group.id, makeSearchState(`${group.name} tabs`)]),
  ));
  const [closeSearches, setCloseSearches] = useState<Record<CloseMode, SearchState>>({
    containing: makeSearchState("Home Features Settings"),
    "not-containing": makeSearchState("Home Features Settings"),
  });

  const language = preferences.language;
  const voice = useCallback((en: string, yue: string, category: CopyCategory = "body") => (
    applyFunnyVoice({ language, en, yue, funnyEn: preferences.funnyEn, funnyYue: preferences.funnyYue, category })
  ), [language, preferences.funnyEn, preferences.funnyYue]);

  const notify = useCallback((title: string, body: string, kind: NoticeKind = "info") => {
    const id = ++noticeId.current;
    const notice: Notice = {
      id,
      title,
      body,
      kind,
      time: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date()),
      visible: true,
    };
    setNotices((current) => [notice, ...current].slice(0, 20));
    if (kind === "info" || kind === "success") {
      window.setTimeout(() => {
        setNotices((current) => current.map((item) => item.id === id ? { ...item, visible: false } : item));
      }, 4500);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.preferences) {
            const nextPreferences = { ...DEFAULT_PREFERENCES, ...saved.preferences };
            nextPreferences.funnyEn = clampFunnyLevel(nextPreferences.funnyEn, DEFAULT_PREFERENCES.funnyEn);
            nextPreferences.funnyYue = clampFunnyLevel(nextPreferences.funnyYue, DEFAULT_PREFERENCES.funnyYue);
            setPreferences(nextPreferences);
          }
          const nextOrder = orderedUniqueTabs(saved.tabOrder);
          const nextOpen = Array.isArray(saved.openTabs)
            ? nextOrder.filter((id) => saved.openTabs.includes(id))
            : [...nextOrder];
          const ensuredOpen = nextOpen.length > 0 ? nextOpen : ["home" as TabId];
          const nextGroups = safeGroups(saved.tabGroups);
          setTabOrder(nextOrder);
          setOpenTabs(ensuredOpen);
          setPinnedTabs(Array.isArray(saved.pinnedTabs)
            ? ensuredOpen.filter((id) => saved.pinnedTabs.includes(id))
            : ["home"]);
          setTabGroups(nextGroups);
          setTabMembership(safeMembership(saved.tabMembership, nextGroups));
          if (isTabId(saved.activeTab) && ensuredOpen.includes(saved.activeTab)) setActiveTab(saved.activeTab);
          else setActiveTab(ensuredOpen[0]);
          if (saved.tabAppearance) setTabAppearance(saved.tabAppearance);
          if (saved.tabSearches && typeof saved.tabSearches === "object") {
            setTabSearches({
              strip: safeSearchState(saved.tabSearches.strip, makeSearchState("Home Surfaces Features Docs Release Settings About")),
              names: safeSearchState(saved.tabSearches.names, makeSearchState("Explore Reference Product")),
              master: safeSearchState(saved.tabSearches.master, makeSearchState("Main window Home Features Settings")),
            });
          }
          if (saved.groupSearches && typeof saved.groupSearches === "object") {
            setGroupSearches(Object.fromEntries(nextGroups.map((group) => [
              group.id,
              safeSearchState(saved.groupSearches[group.id], makeSearchState(`${group.name} tabs`)),
            ])));
          }
          if (saved.closeSearches && typeof saved.closeSearches === "object") {
            setCloseSearches({
              containing: safeSearchState(saved.closeSearches.containing, makeSearchState("Home Features Settings")),
              "not-containing": safeSearchState(saved.closeSearches["not-containing"], makeSearchState("Home Features Settings")),
            });
          }
        }
      } catch {
        // Invalid device-local preferences fall back safely to defaults.
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        preferences,
        activeTab,
        tabOrder,
        openTabs,
        pinnedTabs,
        tabGroups,
        tabMembership,
        tabAppearance,
        tabSearches,
        groupSearches,
        closeSearches,
      }),
    );
    document.documentElement.lang = language === "yue" ? "yue-Hant-HK" : language === "both" ? "en" : "en";
    document.documentElement.dataset.theme = preferences.theme;
  }, [hydrated, preferences, activeTab, tabOrder, openTabs, pinnedTabs, tabGroups, tabMembership, tabAppearance, tabSearches, groupSearches, closeSearches, language]);

  useEffect(() => {
    let active = true;
    fetch("data/features.json", { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data) || data.length !== 2433) throw new Error("Catalog count mismatch");
        if (active) {
          setFeatures(data as Feature[]);
          setSelectedFeature(data[0] as Feature);
        }
      })
      .catch((error) => {
        if (active) setFeatureError(error instanceof Error ? error.message : "Catalog unavailable");
      })
      .finally(() => {
        if (active) setFeaturesReady(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("data/release.json", { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data: unknown) => {
        if (!validReleaseState(data)) throw new Error("Release state is invalid");
        if (active) {
          setReleaseState(data);
          if (data.status === "published") document.title = `Material Office ${data.version} · ${data.codeName}`;
        }
      })
      .catch(() => {
        if (active) setReleaseState(DEFAULT_RELEASE_STATE);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated || !featuresReady || surpriseChecked.current) return;
    surpriseChecked.current = true;
    const visited = window.localStorage.getItem(VISITED_KEY);
    window.localStorage.setItem(VISITED_KEY, "true");
    if (!visited || !preferences.surprise || featureError) return;
    const random = new Uint32Array(1);
    window.crypto.getRandomValues(random);
    if (random[0] / 4294967296 < 0.01) {
      let hideTimer = 0;
      const showTimer = window.setTimeout(() => {
        setSurpriseVisible(true);
        hideTimer = window.setTimeout(() => setSurpriseVisible(false), 7000);
      }, 0);
      return () => { window.clearTimeout(showTimer); if (hideTimer) window.clearTimeout(hideTimer); };
    }
  }, [hydrated, featuresReady, preferences.surprise, featureError]);

  useEffect(() => {
    if (!closeReview) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = closeDialogRef.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex='-1'])") ?? [])];
    const animationFrame = window.requestAnimationFrame(() => focusable()[0]?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setCloseReview(null);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (controls.length === 0) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [closeReview]);

  useEffect(() => {
    const timer = window.setTimeout(() => setFeaturePage(0), 0);
    return () => window.clearTimeout(timer);
  }, [productSearch.query, productSearch.regex, productSearch.flags, featureScope]);

  const accentRgb = hexToRgb(preferences.accent) ?? { r: 103, g: 80, b: 164 };
  const onAccent = contrastRatio(accentRgb, "white") >= contrastRatio(accentRgb, "black") ? "#ffffff" : "#111111";
  const accentHsl = rgbToHsl(accentRgb.r, accentRgb.g, accentRgb.b);
  const shellStyle = {
    "--accent": preferences.accent,
    "--on-accent": onAccent,
    "--font-family": `"${preferences.font}", "Microsoft JhengHei UI", "Noto Sans CJK TC", system-ui, sans-serif`,
    "--font-scale": `${preferences.fontScale / 100}`,
  } as CSSProperties;

  const productCorpus = useMemo(() => [
    ...SURFACES.map((surface) => `${surface.en} ${surface.yue} ${surface.shortEn} ${surface.shortYue}`),
    ...features.map((feature) => `${feature[0]} ${feature[1]} ${feature[2]} ${decodeCommand(feature[3])}`),
  ], [features]);
  const productEvaluation = useRegexFilter(productSearch, productCorpus);
  const productMatches = useMemo(
    () => new Set(resolvedMatchIndices(productSearch, productCorpus, productEvaluation)),
    [productSearch, productCorpus, productEvaluation],
  );

  const filteredSurfaces = useMemo(
    () => SURFACES.filter((_, index) => productMatches.has(index)),
    [productMatches],
  );

  const filteredFeatures = useMemo(() => features.filter((feature, index) => {
    const scopeMatches = featureScope === "all" || feature[1] === featureScope;
    return scopeMatches && productMatches.has(SURFACES.length + index);
  }), [features, featureScope, productMatches]);

  const settingsCorpus = useMemo(() => [
    `language English Cantonese bilingual funny tone messages errors warnings 語言 廣東話 雙語 語氣 錯誤 警告 ${language} ${preferences.funnyEn} ${preferences.funnyYue}`,
    `theme light dark density compact comfortable accent color font family size weight 主題 光 暗 密度 顏色 字型 ${preferences.theme} ${preferences.density} ${preferences.accent} ${preferences.font}`,
    `dim sum surprise startup one percent opt out har gow 蝦餃 驚喜 啟動 ${preferences.surprise}`,
    "tabs pin reorder groups search master current strip close containing appearance edit 分頁 釘選 排序 群組 搜尋 關閉 外觀",
    "notifications history messages errors warnings 通知 記錄 錯誤 警告",
  ], [language, preferences]);
  const settingsEvaluation = useRegexFilter(settingsSearch, settingsCorpus);
  const visibleSettingIndices = useMemo(
    () => new Set(resolvedMatchIndices(settingsSearch, settingsCorpus, settingsEvaluation)),
    [settingsSearch, settingsCorpus, settingsEvaluation],
  );

  const pageSize = 100;
  const pageCount = Math.max(1, Math.ceil(filteredFeatures.length / pageSize));
  const visibleFeatures = filteredFeatures.slice(featurePage * pageSize, featurePage * pageSize + pageSize);

  const orderedTabs = tabOrder
    .map((id) => NAV_TABS.find((tab) => tab.id === id))
    .filter((tab): tab is (typeof NAV_TABS)[number] => Boolean(tab) && openTabs.includes(tab.id));
  const pinnedOrderedTabs = orderedTabs.filter((tab) => pinnedTabs.includes(tab.id));
  const groupedOrderedTabs = tabGroups.map((group) => ({
    group,
    tabs: orderedTabs.filter((tab) => !pinnedTabs.includes(tab.id) && tabMembership[tab.id] === group.id),
  }));
  const displayedTabs = [
    ...pinnedOrderedTabs,
    ...groupedOrderedTabs.flatMap(({ group, tabs }) => group.collapsed ? [] : tabs),
  ];

  const discoveryItems = useMemo(() => NAV_TABS.map((tab): DiscoveryItem => {
    const group = tabGroups.find((candidate) => candidate.id === tabMembership[tab.id]);
    const isOpen = openTabs.includes(tab.id);
    const isPinned = pinnedTabs.includes(tab.id);
    const groupName = group?.name ?? localized(language, "Ungrouped", "未分組");
    const visibleLabel = tabLabel(tab, language);
    const stateLabel = isPinned
      ? localized(language, "pinned", "已釘選")
      : isOpen ? localized(language, "open", "已開啟") : localized(language, "closed", "已關閉");
    return {
      id: tab.id,
      searchText: `${visibleLabel} ${groupName}`,
      label: visibleLabel,
      detail: `${localized(language, "Main window", "主視窗")} · ${groupName} · ${stateLabel}`,
      activateLabel: localized(language, `Open ${visibleLabel} in Main window and reveal its group`, `喺主視窗開啟 ${visibleLabel} 並顯示所屬群組`),
    };
  }), [language, openTabs, pinnedTabs, tabGroups, tabMembership]);

  const currentStripItems = useMemo(
    () => tabOrder.flatMap((id) => openTabs.includes(id) ? discoveryItems.filter((item) => item.id === id) : []),
    [discoveryItems, openTabs, tabOrder],
  );
  const groupNameItems = useMemo(() => tabGroups.map((group): DiscoveryItem => ({
    id: group.id,
    searchText: group.name,
    label: group.name,
    detail: localized(language, `${TAB_IDS.filter((id) => tabMembership[id] === group.id).length} tabs · ${group.collapsed ? "collapsed" : "expanded"}`, `${TAB_IDS.filter((id) => tabMembership[id] === group.id).length} 個分頁 · ${group.collapsed ? "已收合" : "已展開"}`),
    activateLabel: localized(language, `Reveal group ${group.name}`, `顯示群組 ${group.name}`),
  })), [language, tabGroups, tabMembership]);

  const activateTab = (id: TabId, focusTab = false) => {
    setOpenTabs((current) => current.includes(id) ? current : [...current, id]);
    const groupId = tabMembership[id];
    setTabGroups((current) => current.map((group) => group.id === groupId ? { ...group, collapsed: false } : group));
    setActiveTab(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (focusTab) window.requestAnimationFrame(() => document.getElementById(`tab-${id}`)?.focus());
  };

  const activateSurface = (id: string) => {
    setSelectedDoc(id);
    activateTab("docs");
  };

  const activateFeature = (feature: Feature) => {
    setSelectedFeature(feature);
    activateTab("features");
  };

  const activateDiscoveryItem = (item: DiscoveryItem) => {
    if (isTabId(item.id)) activateTab(item.id, true);
  };

  const revealGroup = (item: DiscoveryItem) => {
    setTabGroups((current) => current.map((group) => group.id === item.id ? { ...group, collapsed: false } : group));
    window.requestAnimationFrame(() => document.getElementById(`tab-group-${item.id}`)?.focus());
  };

  const moveTab = (id: TabId, delta: number) => {
    setTabOrder((current) => {
      const index = current.indexOf(id);
      const target = Math.max(0, Math.min(current.length - 1, index + delta));
      const next = [...current];
      next.splice(index, 1);
      next.splice(target, 0, id);
      return next;
    });
  };

  const togglePinned = (id: TabId) => {
    if (pinnedTabs.includes(id) && id === activeTab) {
      const groupId = tabMembership[id];
      setTabGroups((current) => current.map((group) => group.id === groupId ? { ...group, collapsed: false } : group));
    }
    setPinnedTabs((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setCloseReview(null);
  };

  const moveGroup = (id: string, delta: number) => {
    setTabGroups((current) => {
      const index = current.findIndex((group) => group.id === id);
      const target = Math.max(0, Math.min(current.length - 1, index + delta));
      if (index < 0 || index === target) return current;
      const next = [...current];
      next.splice(index, 1);
      next.splice(target, 0, current[index]);
      return next;
    });
    setCloseReview(null);
  };

  const toggleGroupCollapsed = (id: string) => {
    const group = tabGroups.find((candidate) => candidate.id === id);
    if (!group) return;
    const willCollapse = !group.collapsed;
    if (willCollapse && tabMembership[activeTab] === id && !pinnedTabs.includes(activeTab)) {
      const fallback = displayedTabs.find((tab) => tab.id !== activeTab && (pinnedTabs.includes(tab.id) || tabMembership[tab.id] !== id));
      if (!fallback) {
        notify(voice("Group kept open", "群組保持開啟", "warning"), voice("The active tab is the only visible tab. Open or pin another tab before collapsing this group.", "目前分頁係唯一可見分頁；請先開啟或釘選另一個分頁再收合群組。", "warning"), "warning");
        return;
      }
      setActiveTab(fallback.id);
    }
    setTabGroups((current) => current.map((candidate) => candidate.id === id ? { ...candidate, collapsed: willCollapse } : candidate));
  };

  const createGroup = () => {
    const name = newGroupName.trim().slice(0, 40);
    if (!name) {
      notify(voice("Group name required", "要有群組名稱", "warning"), voice("Enter a visible name before creating the group.", "建立群組前請輸入可見名稱。", "warning"), "warning");
      return;
    }
    if (tabGroups.some((group) => group.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      notify(voice("Group name already used", "群組名稱已使用", "warning"), voice("Choose a different visible group name.", "請揀另一個可見群組名稱。", "warning"), "warning");
      return;
    }
    const id = `group-${Date.now().toString(36)}-${++groupSequence.current}`;
    const group = { id, name, color: newGroupColor, collapsed: false };
    setTabGroups((current) => [...current, group]);
    setGroupSearches((current) => ({ ...current, [id]: makeSearchState(`${name} tabs`) }));
    setNewGroupName("");
    notify(voice("Group created", "群組已建立", "success"), voice(`Created “${name}”.`, `已建立「${name}」。`, "success"), "success");
  };

  const confirmCloseTabs = () => {
    if (!closeReview) return;
    const search = closeSearches[closeReview.mode];
    const currentSignature = buildCloseReviewSignature({ mode: closeReview.mode, search, openIds: openTabs, pinnedIds: pinnedTabs, includePinned: includePinnedInClose, language });
    if (closeReview.signature !== currentSignature) {
      setCloseReview(null);
      notify(voice("Review expired", "檢查已過期", "warning"), voice("The tab state or query changed. Review the current matches again before closing anything.", "分頁狀態或查詢已改變；請重新檢查目前配對先關閉。", "warning"), "warning");
      return;
    }
    const closing = new Set(closeReview.tabIds);
    const remaining = openTabs.filter((id) => !closing.has(id));
    if (remaining.length === 0) {
      setCloseReview(null);
      notify(voice("Close blocked", "關閉已阻止", "warning"), voice("At least one site tab must remain open.", "網站最少要保留一個分頁。", "warning"), "warning");
      return;
    }
    setOpenTabs(remaining);
    setPinnedTabs((current) => current.filter((id) => !closing.has(id)));
    if (closing.has(activeTab)) setActiveTab(tabOrder.find((id) => remaining.includes(id)) ?? remaining[0]);
    setCloseReview(null);
    notify(
      voice("Tabs closed", "分頁已關閉", "success"),
      voice(`${closing.size} reviewed tab${closing.size === 1 ? "" : "s"} closed.`, `已關閉 ${closing.size} 個經檢查分頁。`, "success"),
      "success",
    );
  };

  const openTabContext = (event: React.MouseEvent, id: TabId) => {
    event.preventDefault();
    if (event.shiftKey) {
      setAppearanceTarget(id);
      setTabMenu(null);
      return;
    }
    setTabMenu({ id, x: event.clientX, y: event.clientY });
  };

  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, id: TabId) => {
    const index = displayedTabs.findIndex((tab) => tab.id === id);
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = displayedTabs[(index + delta + displayedTabs.length) % displayedTabs.length];
      setActiveTab(next.id);
      document.getElementById(`tab-${next.id}`)?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? displayedTabs[0] : displayedTabs.at(-1)!;
      setActiveTab(next.id);
      document.getElementById(`tab-${next.id}`)?.focus();
    } else if (event.shiftKey && event.key === "F10") {
      event.preventDefault();
      setAppearanceTarget(id);
    }
  };

  const resetPreferences = () => {
    setPreferences(DEFAULT_PREFERENCES);
    setTabOrder(NAV_TABS.map((tab) => tab.id));
    setOpenTabs(NAV_TABS.map((tab) => tab.id));
    setPinnedTabs(["home"]);
    setTabGroups(DEFAULT_GROUPS.map((group) => ({ ...group })));
    setTabMembership({ ...DEFAULT_MEMBERSHIP });
    setTabAppearance({});
    setTabSearches({
      strip: makeSearchState("Home Surfaces Features Docs Release Settings About"),
      names: makeSearchState("Explore Reference Product"),
      master: makeSearchState("Main window Home Features Settings"),
    });
    setGroupSearches(Object.fromEntries(DEFAULT_GROUPS.map((group) => [group.id, makeSearchState(`${group.name} tabs`)])));
    setCloseSearches({
      containing: makeSearchState("Home Features Settings"),
      "not-containing": makeSearchState("Home Features Settings"),
    });
    setIncludePinnedInClose(false);
    setCloseReview(null);
    notify(
      voice("Settings reset", "設定已重設", "success"),
      voice("Appearance, language, tabs, and surprise preferences returned to defaults.", "外觀、語言、分頁同驚喜設定已回復預設。", "success"),
      "success",
    );
  };

  const selectedSurface = SURFACES.find((surface) => surface.id === selectedDoc) ?? SURFACES[0];
  const selectedTabMeta = appearanceTarget ? NAV_TABS.find((tab) => tab.id === appearanceTarget) : null;
  const settingsVisible = (index: number) => visibleSettingIndices.has(index);

  const renderFeatureArticle = (feature: Feature) => {
    const scope = SCOPE_LABELS[feature[1]] ?? [feature[1], feature[1]];
    const command = decodeCommand(feature[3]);
    return (
      <article className="feature-article">
        <p className="eyebrow">{localized(language, scope[0], scope[1])} · {feature[2]}</p>
        <h2>{feature[0]}</h2>
        <code className="command-uri">{command}</code>
        <div className="article-sections compact-sections">
          <section>
            <h3>{localized(language, "Behavior", "行為")}</h3>
            <p>{localized(language, `This catalog entry identifies the LibreOffice action “${feature[0]}” through its exact UNO command URI.`, `呢個目錄項目用完整 UNO 指令 URI 識別 LibreOffice 動作「${feature[0]}」。`)}</p>
          </section>
          <section>
            <h3>{localized(language, "Configuration", "設定")}</h3>
            <p>{localized(language, `Scope: ${scope[0]}. Area: ${feature[2]}. Availability follows the active document and installed LibreOffice capabilities.`, `範圍：${scope[1]}。類別：${feature[2]}。可用性視乎目前文件同已安裝 LibreOffice 功能。`)}</p>
          </section>
          <section>
            <h3>{localized(language, "Failure modes", "失敗情況")}</h3>
            <p>{localized(language, "The Windows app must disable an unavailable action with a reason, preserve document state, and never report execution before LibreOffice confirms it.", "Windows 程式要停用不可用動作兼講明原因、保留文件狀態，亦唔可以喺 LibreOffice 確認前話已執行。")}</p>
          </section>
          <section>
            <h3>{localized(language, "Security", "安全")}</h3>
            <p>{localized(language, "This site never executes the command. Search and documentation stay local; command arguments require validation at the application bridge.", "網站唔會執行指令。搜尋同文件只喺本機；指令參數要喺應用橋接層驗證。")}</p>
          </section>
          <section>
            <h3>{localized(language, "Verification", "驗證")}</h3>
            <p>{localized(language, `Verify the visible label, module context, enabled state, URI “${command}”, LibreOffice response, undo behavior, and failure notification.`, `驗證顯示標籤、模組脈絡、啟用狀態、URI「${command}」、LibreOffice 回應、復原行為同失敗通知。`)}</p>
          </section>
        </div>
        <aside className="suggested-articles">
          <p className="eyebrow">{localized(language, "Suggested articles", "建議文章")}</p>
          <div className="chip-row">
            <button type="button" className="assist-chip" onClick={() => activateSurface("features")}>{localized(language, "Feature catalog", "功能目錄")}</button>
            <button type="button" className="assist-chip" onClick={() => activateSurface(feature[1] === "sd" ? "impress" : feature[1] === "dbu" ? "base" : SURFACES.some((surface) => surface.id === feature[1]) ? feature[1] : "start")}>{localized(language, "Application surface", "應用程式介面")}</button>
            <button type="button" className="assist-chip" onClick={() => activateSurface("history")}>{localized(language, "Version history", "版本歷史")}</button>
          </div>
        </aside>
      </article>
    );
  };

  const renderNavigationTab = (tab: (typeof NAV_TABS)[number]) => {
    const appearance = tabAppearance[tab.id] ?? {};
    return (
      <button
        type="button"
        key={tab.id}
        id={`tab-${tab.id}`}
        role="tab"
        aria-selected={activeTab === tab.id}
        aria-controls={`panel-${tab.id}`}
        tabIndex={activeTab === tab.id ? 0 : -1}
        className={`nav-tab ${pinnedTabs.includes(tab.id) ? "is-pinned" : ""}`}
        style={{
          "--tab-color": appearance.color ?? "var(--accent)",
          borderRadius: appearance.radius ? `${appearance.radius}px ${appearance.radius}px 0 0` : undefined,
          fontWeight: appearance.weight,
        } as CSSProperties}
        onClick={() => activateTab(tab.id)}
        onContextMenu={(event) => openTabContext(event, tab.id)}
        onKeyDown={(event) => onTabKeyDown(event, tab.id)}
        title={voice(`${tab.en} — right-click for tab actions`, `${tab.yue} — 右擊有分頁操作`, "accessibility")}
      >
        {pinnedTabs.includes(tab.id) && <span aria-hidden="true" className="pin-dot">●</span>}
        {tabLabel(tab, language)}
      </button>
    );
  };

  return (
    <div
      className={`site-shell theme-${preferences.theme} density-${preferences.density}`}
      style={shellStyle}
      onClick={() => tabMenu && setTabMenu(null)}
    >
      <a className="skip-link" href="#main-content">{localized(language, "Skip to content", "跳到內容")}</a>
      <header className="site-header">
        <div className="brand-row">
          <button type="button" className="brand" onClick={() => activateTab("home")} aria-label={voice("Material Office home", "Material Office 主頁", "accessibility")}>
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
            <span><strong>Material Office</strong><small>Windows · Material 3</small></span>
          </button>
          <div className="header-actions">
            <label className="compact-select">
              <span className="sr-only">{localized(language, "Language", "語言")}</span>
              <select value={language} onChange={(event) => setPreferences((current) => ({ ...current, language: event.target.value as Language }))}>
                <option value="en">English</option>
                <option value="yue">廣東話</option>
                <option value="both">English + 廣東話</option>
              </select>
            </label>
            <button type="button" className="icon-button" aria-label={voice("Open tab manager and discovery", "開啟分頁管理同尋找", "accessibility")} onClick={() => activateTab("settings", true)}>▱</button>
            <button type="button" className="icon-button notification-button" aria-label={localized(language, "Open notification center", "開啟通知中心")} onClick={(event) => { event.stopPropagation(); setNotificationCenterOpen((current) => !current); }}>
              ◔
              {notices.length > 0 && <span>{notices.length}</span>}
            </button>
          </div>
        </div>
        <nav className="tab-strip" role="tablist" aria-label={voice("Product sections", "產品分頁", "accessibility")}>
          {pinnedOrderedTabs.length > 0 && (
            <div className="tab-cluster pinned-cluster" role="group" aria-label={localized(language, "Pinned tabs", "已釘選分頁")}>
              <span className="tab-cluster-label" aria-hidden="true">●</span>
              {pinnedOrderedTabs.map(renderNavigationTab)}
            </div>
          )}
          {groupedOrderedTabs.map(({ group, tabs }) => tabs.length > 0 && (
            <div className="tab-cluster" role="group" aria-label={group.name} key={group.id} style={{ "--group-color": group.color } as CSSProperties}>
              <button
                type="button"
                className="tab-group-toggle"
                aria-expanded={!group.collapsed}
                aria-label={localized(language, `${group.collapsed ? "Expand" : "Collapse"} group ${group.name}`, `${group.collapsed ? "展開" : "收合"}群組 ${group.name}`)}
                onClick={() => toggleGroupCollapsed(group.id)}
              >
                <span aria-hidden="true">{group.collapsed ? "▸" : "▾"}</span>{group.name}
              </button>
              {!group.collapsed && tabs.map(renderNavigationTab)}
            </div>
          ))}
        </nav>
      </header>

      {notificationCenterOpen && (
        <aside className="notification-center" aria-label={localized(language, "Notification history", "通知記錄")} onClick={(event) => event.stopPropagation()}>
          <div className="panel-title-row">
            <div><p className="eyebrow">{localized(language, "Reviewable history", "可翻查記錄")}</p><h2>{localized(language, "Notifications", "通知")}</h2></div>
            <button type="button" className="text-button" onClick={() => setNotices([])}>{localized(language, "Clear", "清除")}</button>
          </div>
          {notices.length === 0 ? <p className="empty-state">{localized(language, "No notifications yet.", "暫時冇通知。")}</p> : (
            <ol>{notices.map((notice) => <li key={notice.id} className={`notice-history ${notice.kind}`}><strong>{notice.title}</strong><p>{notice.body}</p><time>{notice.time}</time></li>)}</ol>
          )}
        </aside>
      )}

      <main id="main-content">
        {activeTab === "home" && (
          <section id="panel-home" role="tabpanel" aria-labelledby="tab-home" className="page-panel home-panel">
            <div className="hero">
              <div className="hero-copy">
                <p className="eyebrow">{localized(language, releaseState.status === "published" ? `Windows release ${releaseState.version}` : "Unreleased Windows candidate", releaseState.status === "published" ? `Windows 版本 ${releaseState.version}` : "未發布 Windows 候選版")}</p>
                <h1>{voice("A local office workspace with explicit boundaries.", "本機辦公工作區，能力界線講清講楚。", "headline")}</h1>
                <p className="hero-lede">
                  {voice(
                    `${releaseState.status === "published" ? `Release ${releaseState.version}` : "The candidate"} implements six original local editors plus tools for commands, history, components, dialogs, settings, and changelog. Native office fidelity and UNO execution remain LibreOffice-only.`,
                    `${releaseState.status === "published" ? `${releaseState.version} 版本` : "候選版"}實作六個原創本機編輯器，另有指令、歷史、元件、對話框、設定同更新記錄工具；原生辦公格式準確度同 UNO 執行仍然只由 LibreOffice 負責。`,
                    "body",
                  )}
                </p>
                <div className="button-row">
                  <button type="button" className="filled-button" onClick={() => activateTab("surfaces")}>{localized(language, "Inspect implemented surfaces", "檢視已實作介面")} <span aria-hidden="true">→</span></button>
                  <button type="button" className="tonal-button" onClick={() => activateTab("features")}>2,433 {localized(language, "LibreOffice command records", "個 LibreOffice 指令記錄")}</button>
                </div>
                <dl className="hero-stats">
                  <div><dt>6</dt><dd>{localized(language, "original local editor models", "個原創本機編輯模型")}</dd></div>
                  <div><dt>3</dt><dd>{localized(language, "language modes", "種語言模式")}</dd></div>
                  <div><dt>{releaseState.status === "published" ? 1 : 0}</dt><dd>{localized(language, "published releases", "個已發布版本")}</dd></div>
                </dl>
              </div>
              {previewWindow === "closed" ? (
                <div className="product-window-preview-closed"><p>{localized(language, "Writer preview closed.", "Writer 預覽已關閉。")}</p><button type="button" className="tonal-button" onClick={() => setPreviewWindow("open")}>{localized(language, "Restore preview", "還原預覽")}</button></div>
              ) : previewWindow === "minimized" ? (
                <div className="product-window-preview-minimized"><strong>Q3 Board Report.odt</strong><button type="button" className="tonal-button" onClick={() => setPreviewWindow("open")}>{localized(language, "Restore", "還原")}</button></div>
              ) : (
                <div className="product-window" aria-label={localized(language, releaseState.status === "published" ? `Illustrative preview of Material Office Writer ${releaseState.version}` : "Illustrative preview of the Material Office Writer candidate", releaseState.status === "published" ? `Material Office Writer ${releaseState.version} 示意預覽` : "Material Office Writer 候選版示意預覽")}>
                  <div className="window-title"><span className="mini-mark">▦</span><strong>Q3 Board Report.odt</strong><span className="window-buttons"><button type="button" aria-label={localized(language, "Minimize preview", "最小化預覽")} onClick={() => setPreviewWindow("minimized")}>—</button><button type="button" aria-label={localized(language, "Maximize preview", "最大化預覽")} onClick={() => notify(localized(language, "Preview size", "預覽大小"), voice("Preview is already shown at its supported size.", "預覽已經係支援嘅大小。", "info"), "info")}>□</button><button type="button" aria-label={localized(language, "Close preview", "關閉預覽")} onClick={() => setPreviewWindow("closed")}>×</button></span></div>
                  <div className="window-menu"><span>File</span><span>Edit</span><span>View</span><span>Insert</span><span>Format</span><span>Tools</span></div>
                  <div className="window-tools"><button type="button" aria-label="Bold preview" onClick={() => notify("Preview toolbar", "Bold preview control", "info")}><b>B</b></button><button type="button" aria-label="Italic preview" onClick={() => notify("Preview toolbar", "Italic preview control", "info")}><i>I</i></button><button type="button" aria-label="Underline preview" onClick={() => notify("Preview toolbar", "Underline preview control", "info")}><u>U</u></button><span>≡</span><span>☷</span><span className="tool-fill" /></div>
                  <div className="window-body"><aside><span className="active-line" /><span /><span /><span /></aside><article><small>CONFIDENTIAL · Q3</small><h2>Board report</h2><p /><p /><h3>Executive summary</h3><p /><p /></article><div className="properties"><strong>Properties</strong><span /><span /><span /></div></div>
                </div>
              )}
            </div>
            <section aria-labelledby="capability-boundary-title">
              <div className="section-heading"><div><p className="eyebrow">{localized(language, "Capability boundary", "能力界線")}</p><h2 id="capability-boundary-title">{localized(language, "Implemented, delegated, and planned are different things", "已實作、交畀 LibreOffice、同計劃中係三回事")}</h2></div></div>
              <div className="about-grid">
                <article><span aria-hidden="true">✓</span><h2>{localized(language, "Implemented locally", "本機已實作")}</h2><p>{localized(language, releaseState.status === "published" ? `Six bounded editor models; persisted workspace and append-only history; tab, search, regex, settings, notification, appearance, and external-editor services shipped in ${releaseState.tag}.` : "Six bounded editor models; persisted workspace and append-only history; tab, search, regex, settings, notification, appearance, and external-editor services. These are candidate features with local test coverage.", releaseState.status === "published" ? `六個有界限編輯模型、保存工作區同只追加歷史，以及分頁、搜尋、正則式、設定、通知、外觀同外部編輯器服務已經喺 ${releaseState.tag} 發布。` : "六個有界限編輯模型、保存工作區同只追加歷史，以及分頁、搜尋、正則式、設定、通知、外觀同外部編輯器服務；全部係有本機測試嘅候選功能。")}</p></article>
                <article><span aria-hidden="true">↔</span><h2>{localized(language, "LibreOffice-only", "只由 LibreOffice 處理")}</h2><p>{localized(language, "Native ODF/OOXML editing and fidelity, office-format conversion, full Writer/Calc/Impress/Draw/Base/Math behavior, and contextual UNO execution require a compatible installed LibreOffice.", "原生 ODF/OOXML 編輯同準確度、辦公格式轉換、完整 Writer／Calc／Impress／Draw／Base／Math 行為，同有脈絡 UNO 執行，都要相容嘅已安裝 LibreOffice。")}</p></article>
                <article><span aria-hidden="true">…</span><h2>{localized(language, "Roadmap, not current", "路線圖，唔係現有功能")}</h2><p>{localized(language, releaseState.status === "published" ? "Rich round-trip previews, Calc filters/pivots/charts, Impress animation/media, Draw layers/connectors, optional synchronization, and signed installers remain future work." : "Rich round-trip previews, Calc filters/pivots/charts, Impress animation/media, Draw layers/connectors, optional synchronization, signed installers, and a public release/site remain future work.", releaseState.status === "published" ? "豐富來回預覽、Calc 篩選／樞紐／圖表、Impress 動畫／媒體、Draw 圖層／連接線、可選同步同簽署安裝檔仍然係未來工作。" : "豐富來回預覽、Calc 篩選／樞紐／圖表、Impress 動畫／媒體、Draw 圖層／連接線、可選同步、簽署安裝檔同公開版本／網站仍然係未來工作。")}</p></article>
              </div>
            </section>
            <section className="search-section" aria-labelledby="find-anything-title">
              <div className="section-heading"><div><p className="eyebrow">{localized(language, "Local, bounded, explainable", "本機、有界限、講得明")}</p><h2 id="find-anything-title">{localized(language, "Find any surface or command", "搵任何介面或指令")}</h2></div><p>{localized(language, "Plain text by default. Switch to the adjacent full regex builder only when you need it.", "預設純文字；真係需要先開旁邊完整正則式工具。")}</p></div>
              <SearchControl id="product-search-home" label="Product search" placeholder={localized(language, "Search Writer, formulas, export, .uno…", "搜尋 Writer、公式、匯出、.uno…")} state={productSearch} onChange={setProductSearch} language={language} notify={notify} evaluation={productEvaluation} voice={voice} />
              {productSearch.query && !productEvaluation.error && !productEvaluation.pending && (
                <div className="search-results-summary" aria-live="polite">
                  <div><strong>{filteredSurfaces.length}</strong><span>{localized(language, "surfaces", "個介面")}</span></div>
                  <div><strong>{filteredFeatures.length.toLocaleString()}</strong><span>{localized(language, "commands", "個指令")}</span></div>
                  <div className="quick-results">
                    {filteredSurfaces.slice(0, 3).map((surface) => <button type="button" key={surface.id} onClick={() => activateSurface(surface.id)}>{localized(language, surface.en, surface.yue)} →</button>)}
                    {filteredFeatures.slice(0, 3).map((feature, index) => <button type="button" key={`${feature[3]}-${index}`} onClick={() => activateFeature(feature)}>{feature[0]} <code>{decodeCommand(feature[3])}</code></button>)}
                  </div>
                </div>
              )}
            </section>
            <section className="surface-ribbon" aria-labelledby="surface-ribbon-title">
              <div className="section-heading"><div><p className="eyebrow">{localized(language, releaseState.status === "published" ? `Release ${releaseState.version} surface map` : "Candidate surface map", releaseState.status === "published" ? `${releaseState.version} 版本介面地圖` : "候選版介面地圖")}</p><h2 id="surface-ribbon-title">{localized(language, "Documented without pretending every office feature is local", "如實記錄，唔扮所有辦公功能都係本機")}</h2></div><button type="button" className="text-button" onClick={() => activateTab("surfaces")}>{localized(language, "See all details", "睇晒詳情")} →</button></div>
              <div className="surface-mini-grid">{SURFACES.map((surface) => <button type="button" key={surface.id} onClick={() => activateSurface(surface.id)}><span aria-hidden="true">{surface.icon}</span><strong>{localized(language, surface.en, surface.yue)}</strong></button>)}</div>
            </section>
          </section>
        )}

        {activeTab === "surfaces" && (
          <section id="panel-surfaces" role="tabpanel" aria-labelledby="tab-surfaces" className="page-panel">
            <div className="page-intro"><p className="eyebrow">{localized(language, releaseState.status === "published" ? `Release ${releaseState.version} surface map` : "Unreleased candidate map", releaseState.status === "published" ? `${releaseState.version} 版本介面地圖` : "未發布候選版地圖")}</p><h1>{voice("Implemented surfaces, with their limits visible.", "已實作介面，限制亦放喺明面。", "headline")}</h1><p>{voice(releaseState.status === "published" ? `Each card documents the local behavior shipped in ${releaseState.tag} and identifies work that remains LibreOffice-only or on the roadmap.` : "Each card documents the local candidate behavior and identifies work that remains LibreOffice-only or on the roadmap.", releaseState.status === "published" ? `每張卡都記錄 ${releaseState.tag} 發布嘅本機行為，並指出只由 LibreOffice 處理或仍喺路線圖嘅工作。` : "每張卡都記錄本機候選版行為，並指出只由 LibreOffice 處理或仍喺路線圖嘅工作。", "body")}</p></div>
            <div className="surface-grid">
              {SURFACES.map((surface, index) => (
                <article className="surface-card" key={surface.id}>
                  <div className="surface-card-top"><span className="surface-number">{String(index + 1).padStart(2, "0")}</span><span className="surface-icon" aria-hidden="true">{surface.icon}</span></div>
                  <h2>{localized(language, surface.en, surface.yue)}</h2><p>{localized(language, surface.shortEn, surface.shortYue)}</p>
                  <button type="button" className="card-link" onClick={() => activateSurface(surface.id)}>{localized(language, "Read the article", "睇完整文章")} <span aria-hidden="true">→</span></button>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === "features" && (
          <section id="panel-features" role="tabpanel" aria-labelledby="tab-features" className="page-panel feature-page">
            <div className="page-intro feature-intro"><div><p className="eyebrow">{localized(language, "Bundled LibreOffice command index", "內置 LibreOffice 指令索引")}</p><h1>{voice("2,433 command records, inspectable", "2,433 個指令記錄，全部查得到", "headline")}</h1><p>{voice("Rows document LibreOffice UNO identities; they are not 2,433 Electron features. This site cannot execute them.", "每行記錄 LibreOffice UNO 身份；唔係 2,433 個 Electron 功能。呢個網站亦唔可以執行。", "body")}</p></div><span className={`catalog-status ${featureError ? "error" : ""}`}>{featureError ? voice("Catalog unavailable", "目錄未能載入", "error") : featuresReady ? voice(`${features.length.toLocaleString()} loaded records`, `已載入 ${features.length.toLocaleString()} 個記錄`, "status") : voice("Loading local catalog…", "載入本機目錄…", "status")}</span></div>
            <SearchControl id="feature-search" label="Feature search" placeholder={localized(language, "Search names, areas, scopes, or .uno commands", "搜尋名稱、類別、範圍或 .uno 指令")} state={productSearch} onChange={setProductSearch} language={language} notify={notify} evaluation={productEvaluation} voice={voice} />
            <div className="scope-chips" aria-label={localized(language, "Feature scopes", "功能範圍")}>
              {Object.entries(SCOPE_LABELS).map(([scope, labels]) => {
                const count = scope === "all" ? features.length : features.filter((feature) => feature[1] === scope).length;
                return <button type="button" className={featureScope === scope ? "is-active" : ""} key={scope} onClick={() => setFeatureScope(scope)}>{localized(language, labels[0], labels[1])}<span>{count}</span></button>;
              })}
            </div>
            {featureError ? (
              <div className="error-card" role="alert"><strong>{voice("The local catalog could not be verified.", "本機目錄未能驗證。", "error")}</strong><p>{featureError}. {voice("Reload the bundled catalog before relying on command counts.", "重新載入內置目錄先好依賴指令數量。", "error")}</p></div>
            ) : (
              <div className="feature-layout">
                <div className="feature-list-panel">
                  <div className="result-toolbar"><p aria-live="polite"><strong>{filteredFeatures.length.toLocaleString()}</strong> {localized(language, "matching commands", "個符合指令")}</p><span>{localized(language, `Page ${featurePage + 1} of ${pageCount}`, `第 ${featurePage + 1} / ${pageCount} 頁`)}</span></div>
                  <div className="feature-list">
                    {visibleFeatures.map((feature, index) => (
                      <button type="button" className={selectedFeature === feature ? "is-selected" : ""} key={`${feature[3]}-${featurePage}-${index}`} onClick={() => setSelectedFeature(feature)}>
                        <span><strong>{feature[0]}</strong><small>{localized(language, SCOPE_LABELS[feature[1]]?.[0] ?? feature[1], SCOPE_LABELS[feature[1]]?.[1] ?? feature[1])} · {feature[2]}</small></span><code>{decodeCommand(feature[3])}</code>
                      </button>
                    ))}
                    {visibleFeatures.length === 0 && <p className="empty-state">{localized(language, "No commands match this scope and search.", "呢個範圍同搜尋冇相符指令。")}</p>}
                  </div>
                  <div className="pagination"><button type="button" className="tonal-button" disabled={featurePage === 0} onClick={() => setFeaturePage((page) => Math.max(0, page - 1))}>← {localized(language, "Previous", "上一頁")}</button><button type="button" className="tonal-button" disabled={featurePage >= pageCount - 1} onClick={() => setFeaturePage((page) => Math.min(pageCount - 1, page + 1))}>{localized(language, "Next", "下一頁")} →</button></div>
                </div>
                <div className="feature-detail-panel">{selectedFeature ? renderFeatureArticle(selectedFeature) : <p className="empty-state">{localized(language, "Select a command to open its article.", "揀一個指令睇文章。")}</p>}</div>
              </div>
            )}
          </section>
        )}

        {activeTab === "docs" && (
          <section id="panel-docs" role="tabpanel" aria-labelledby="tab-docs" className="page-panel docs-page">
            <aside className="docs-index" aria-label={localized(language, "Documentation articles", "文件文章")}>
              <p className="eyebrow">{localized(language, "Articles", "文章")}</p>
              {SURFACES.map((surface) => <button type="button" className={selectedSurface.id === surface.id ? "is-active" : ""} key={surface.id} onClick={() => setSelectedDoc(surface.id)}><span aria-hidden="true">{surface.icon}</span>{localized(language, surface.en, surface.yue)}</button>)}
            </aside>
            <article className="docs-article">
              <div className="article-hero"><span className="surface-icon large" aria-hidden="true">{selectedSurface.icon}</span><div><p className="eyebrow">{localized(language, "Product documentation", "產品文件")}</p><h1>{localized(language, selectedSurface.en, selectedSurface.yue)}</h1><p>{localized(language, selectedSurface.shortEn, selectedSurface.shortYue)}</p></div></div>
              <DetailSections surface={selectedSurface} language={language} onSuggested={setSelectedDoc} />
            </article>
          </section>
        )}

        {activeTab === "release" && (
          <section id="panel-release" role="tabpanel" aria-labelledby="tab-release" className="page-panel">
            <div className="page-intro">
              <p className="eyebrow">{localized(language, releaseState.status === "published" ? "Published release" : "Prerelease status", releaseState.status === "published" ? "已發布版本" : "預發布狀態")}</p>
              <h1>{voice(releaseState.status === "published" ? `Material Office ${releaseState.version} is published` : "No Material Office release is published yet", releaseState.status === "published" ? `Material Office ${releaseState.version} 已發布` : "Material Office 暫時未有已發布版本", "headline")}</h1>
              <p>{voice(releaseState.status === "published" ? `The verified Windows installer, checksum, legal records, provenance, and corresponding source are available from ${releaseState.tag}.` : "Version 0.1.0 is a candidate. There is no public installer, checksum, immutable tag, release date, hosted site, or browser demo to download. This page will link them only after the external results are verified.", releaseState.status === "published" ? `已驗證 Windows 安裝檔、checksum、法律記錄、來源記錄同對應原始碼已經喺 ${releaseState.tag} 提供。` : "0.1.0 係候選版；暫時冇公開安裝檔、checksum、不可變 tag、發布日期、託管網站或瀏覽器 demo。外部結果驗證完成先會加連結。", "body")}</p>
            </div>
            <div className="release-card">
              <img src="media/classic-har-gow.png" alt={localized(language, "Warm tea-house photograph of Classic Har Gow", "港式茶樓木枱上嘅蝦餃")} />
              <div>
                <p className="eyebrow">Material Office {releaseState.version} · {localized(language, releaseState.status === "published" ? "released" : "candidate", releaseState.status === "published" ? "已發布" : "候選版")}</p>
                <h2>{localized(language, releaseState.status === "published" ? "Code name" : "Proposed code name", releaseState.status === "published" ? "版本代號" : "擬定代號")}: {releaseState.codeName}</h2>
                <p>{localized(language, releaseState.status === "published" ? "The release uses the provenance-verified bundled PNG. The project-owner distribution authorization and no-downstream-reuse boundary remain in its provenance record." : "The PNG has verified catalog provenance and byte identity, but the code name is not consumed until a release is actually published. The image is not covered automatically by the software's MIT License.", releaseState.status === "published" ? "版本使用已驗證來源同 byte 身份嘅內置 PNG；項目擁有人發布授權同不授予下游重用權嘅界線繼續以來源記錄為準。" : "PNG 已驗證目錄來源同 byte 身份，但真正發布之前唔會用咗個代號；圖片亦唔會自動受軟件 MIT License 覆蓋。")}</p>
                <dl className="release-facts"><div><dt>{localized(language, "Status", "狀態")}</dt><dd>{localized(language, releaseState.status === "published" ? "Published" : "Unpublished", releaseState.status === "published" ? "已發布" : "未發布")}</dd></div><div><dt>{localized(language, "Application installer", "應用程式安裝檔")}</dt><dd>{releaseState.installerUrl ? <a href={releaseState.installerUrl}>{releaseState.installerName}</a> : localized(language, "Unavailable", "未提供")}</dd></div><div><dt>{localized(language, "Command catalog", "指令目錄")}</dt><dd>2,433 LibreOffice records</dd></div></dl>
                <div className="button-row">{releaseState.releaseUrl && <a className="filled-button" href={releaseState.releaseUrl}>{localized(language, "Open release", "開啟版本")}</a>}<a className="tonal-button" href="legal/classic-har-gow-provenance.json">{localized(language, "Image provenance", "圖片來源記錄")}</a><a className="text-button" href="legal/THIRD_PARTY_NOTICES.md">{localized(language, "Third-party notices", "第三方聲明")}</a></div>
              </div>
            </div>
            <section className="changelog-card"><div className="section-heading"><div><p className="eyebrow">{localized(language, releaseState.status === "published" ? "Released" : "Unreleased", releaseState.status === "published" ? "已發布" : "未發布")}</p><h2>{localized(language, `${releaseState.version} ${releaseState.status === "published" ? "release" : "candidate work"}`, `${releaseState.version} ${releaseState.status === "published" ? "版本" : "候選版工作"}`)}</h2></div><span className="status-pill">{releaseState.tag ?? "0.1.0-rc"}</span></div><ul><li>{localized(language, "Implements six bounded local editor models and five supporting tool surfaces in the Windows candidate.", "Windows 候選版實作六個有界限本機編輯模型同五個支援工具介面。")}</li><li>{localized(language, "Loads 2,433 LibreOffice command records and delegates contextual execution to a validated LibreOffice broker.", "載入 2,433 個 LibreOffice 指令記錄，並將有脈絡執行交畀已驗證 LibreOffice broker。")}</li><li>{localized(language, "Adds device-local language, tone, appearance, tab, search, history, notification, and startup-surprise settings.", "加入本機語言、語氣、外觀、分頁、搜尋、歷史、通知同啟動驚喜設定。")}</li></ul><p className="note-callout">{localized(language, releaseState.status === "published" ? "This published entry is linked to the exact immutable build tag and verified release assets above." : "This is a candidate summary, not a released changelog entry. The release date will be recorded only after publication.", releaseState.status === "published" ? "呢個已發布記錄連結上面嘅確實不可變 build tag 同已驗證版本素材。" : "呢個係候選版摘要，唔係已發布更新記錄；真正發布之後先會記錄日期。")}</p></section>
          </section>
        )}

        {activeTab === "settings" && (
          <section id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" className="page-panel settings-page">
            <div className="page-intro"><p className="eyebrow">{localized(language, "Device-local preferences", "裝置本機設定")}</p><h1>{voice("Make every rendered detail feel like yours", "每個畫面細節，都可以啱你心水", "headline")}</h1><p>{voice("Changes preview live and persist in this browser. Nothing is sent away.", "改動即時預覽兼保留喺呢個瀏覽器，唔會傳出去。", "body")}</p></div>
            <SearchControl id="settings-search" label="Settings search" placeholder={localized(language, "Search theme, density, language, tabs…", "搜尋主題、密度、語言、分頁…")} state={settingsSearch} onChange={setSettingsSearch} language={language} notify={notify} evaluation={settingsEvaluation} voice={voice} />
            <div className="settings-grid">
              {settingsVisible(0) && (
                <section className="settings-card"><div className="settings-card-heading"><span aria-hidden="true">文</span><div><h2>{localized(language, "Language & voice", "語言同語氣")}</h2><p>{localized(language, "Language and playfulness are independent.", "語言同玩味程度分開設定。")}</p></div></div>
                  <label className="field-label">{localized(language, "Language mode", "語言模式")}<select className="select-field" value={language} onChange={(event) => setPreferences((current) => ({ ...current, language: event.target.value as Language }))}><option value="en">English</option><option value="yue">廣東話</option><option value="both">English + 廣東話</option></select></label>
                  <label className="range-label"><span>{localized(language, "English funny level", "英文玩味程度")} <strong>{preferences.funnyEn}</strong></span><input type="range" min="1" max="5" step="1" value={preferences.funnyEn} aria-valuetext={`${preferences.funnyEn}: ${EN_TONES[preferences.funnyEn - 1]}`} onChange={(event) => setPreferences((current) => ({ ...current, funnyEn: clampFunnyLevel(event.target.value, current.funnyEn) }))} /><small>{EN_TONES[preferences.funnyEn - 1]}</small></label>
                  <label className="range-label"><span>{localized(language, "Cantonese funny level", "廣東話玩味程度")} <strong>{preferences.funnyYue}</strong></span><input type="range" min="1" max="5" step="1" value={preferences.funnyYue} aria-valuetext={`${preferences.funnyYue}: ${YUE_TONES[preferences.funnyYue - 1]}`} onChange={(event) => setPreferences((current) => ({ ...current, funnyYue: clampFunnyLevel(event.target.value, current.funnyYue) }))} /><small>{YUE_TONES[preferences.funnyYue - 1]}</small></label>
                  <div className="disclosure"><strong>{localized(language, "What this changes", "呢個設定改啲乜")}</strong><p>{localized(language, "Funny level styles every message—including errors, warnings, security, accessibility, and financial copy. It changes voice, never facts, affected items, or recovery steps. Change or reset it at any time.", "玩味程度會影響所有訊息，包括錯誤、警告、安全、無障礙同財務文字；只改語氣，唔改事實、受影響項目或復原步驟。隨時可以改或重設。")}</p></div>
                  <div className="voice-preview-grid" aria-live="polite" aria-label={voice("Live copy-category preview", "即時文字類別預覽", "accessibility")}>
                    {([
                      ["headline", "Heading", "標題", "Material Office workspace", "Material Office 工作區"],
                      ["body", "Body", "正文", "Preferences stay on this device.", "設定留喺呢部裝置。"],
                      ["action", "Action", "操作", "Apply the reviewed change.", "套用已檢查改動。"],
                      ["status", "Status", "狀態", "2,433 command records loaded.", "已載入 2,433 個指令記錄。"],
                      ["info", "Information", "資訊", "The site uses bundled local assets.", "網站使用本機內置素材。"],
                      ["success", "Success", "成功", "The selected setting was saved.", "已保存所選設定。"],
                      ["warning", "Warning", "警告", "Review 2 affected tabs before closing.", "關閉前請檢查 2 個受影響分頁。"],
                      ["error", "Error", "錯誤", "The regex timed out; refine the pattern and retry.", "正則式逾時；請收窄模式再試。"],
                      ["security", "Security", "安全", "Document contents stay on this device.", "文件內容留喺呢部裝置。"],
                      ["financial", "Financial", "財務", "The displayed total is CAD 42.00.", "顯示總額係 CAD 42.00。"],
                      ["destructive", "Destructive", "破壞性操作", "Closing affects exactly 2 reviewed tabs.", "關閉會準確影響 2 個已檢查分頁。"],
                      ["accessibility", "Accessibility", "無障礙", "Open the Settings tab.", "開啟設定分頁。"],
                    ] as const).map(([category, enLabel, yueLabel, enText, yueText]) => (
                      <article key={category}><strong>{localized(language, enLabel, yueLabel)}</strong><p>{voice(enText, yueText, category)}</p></article>
                    ))}
                  </div>
                </section>
              )}
              {settingsVisible(1) && (
                <section className="settings-card"><div className="settings-card-heading"><span aria-hidden="true">◐</span><div><h2>{localized(language, "Appearance", "外觀")}</h2><p>{localized(language, "Material tokens update the live site.", "Material 標記即時更新網站。")}</p></div></div>
                  <fieldset className="segmented-field"><legend>{localized(language, "Theme", "主題")}</legend><button type="button" className={preferences.theme === "light" ? "is-active" : ""} onClick={() => setPreferences((current) => ({ ...current, theme: "light" }))}>{localized(language, "Light", "光亮")}</button><button type="button" className={preferences.theme === "dark" ? "is-active" : ""} onClick={() => setPreferences((current) => ({ ...current, theme: "dark" }))}>{localized(language, "Dark", "深色")}</button></fieldset>
                  <label className="field-label">{localized(language, "Density", "密度")}<select className="select-field" value={preferences.density} onChange={(event) => setPreferences((current) => ({ ...current, density: event.target.value as Density }))}><option value="compact">{localized(language, "Compact", "緊密")}</option><option value="comfortable">{localized(language, "Comfortable", "舒適")}</option></select></label>
                  <div className="color-editor"><label className="field-label" htmlFor="accent-color">{localized(language, "Continuous accent color", "連續強調色")}</label><div><input id="accent-color" type="color" value={preferences.accent} onChange={(event) => setPreferences((current) => ({ ...current, accent: event.target.value }))} /><input className="text-field mono" value={preferences.accent.toUpperCase()} maxLength={7} onChange={(event) => { const value = event.target.value; if (/^#[0-9a-f]{6}$/i.test(value)) setPreferences((current) => ({ ...current, accent: value })); }} /></div><dl><div><dt>RGB</dt><dd>{accentRgb.r}, {accentRgb.g}, {accentRgb.b}</dd></div><div><dt>HSL</dt><dd>{accentHsl.h}°, {accentHsl.s}%, {accentHsl.l}%</dd></div><div><dt>{localized(language, "Contrast", "對比")}</dt><dd>{Math.max(contrastRatio(accentRgb, "white"), contrastRatio(accentRgb, "black")).toFixed(2)}:1</dd></div></dl></div>
                  <label className="field-label">{localized(language, "UI font", "介面字型")}<select className="select-field font-select" value={preferences.font} onChange={(event) => setPreferences((current) => ({ ...current, font: event.target.value }))}><option value="Segoe UI">Segoe UI</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Consolas">Consolas</option></select></label>
                  <label className="range-label"><span>{localized(language, "Font scale", "字型比例")} <strong>{preferences.fontScale}%</strong></span><input type="range" min="85" max="125" step="5" value={preferences.fontScale} onChange={(event) => setPreferences((current) => ({ ...current, fontScale: Number(event.target.value) }))} /></label>
                </section>
              )}
              {settingsVisible(2) && (
                <section className="settings-card"><div className="settings-card-heading"><span aria-hidden="true">♨</span><div><h2>{localized(language, "Startup delight", "啟動小驚喜")}</h2><p>{localized(language, "One fresh 1% draw per eligible visit.", "每次合資格開啟重新抽 1%。")}</p></div></div><label className="switch-row"><span><strong>{localized(language, "Dim sum surprise", "點心驚喜")}</strong><small>{localized(language, "Never on first visit, error paths, or more than once per visit.", "首次使用、錯誤流程唔會出現，每次最多一次。")}</small></span><input type="checkbox" role="switch" checked={preferences.surprise} onChange={(event) => setPreferences((current) => ({ ...current, surprise: event.target.checked }))} /></label><div className="dish-preview"><img src="media/classic-har-gow.png" alt={localized(language, "Warm tea-house photograph of Classic Har Gow", "港式茶樓木枱上嘅蝦餃")} /><div><strong>Classic Har Gow · 蝦餃</strong><p>{localized(language, "Bundled locally with accurate alt text. No network fetch.", "本機內置兼有準確替代文字，唔會上網下載。")}</p></div></div></section>
              )}
              {settingsVisible(3) && (
                <section className="settings-card wide-card tab-management"><div className="settings-card-heading"><span aria-hidden="true">▱</span><div><h2>{localized(language, "Tabs & discovery", "分頁同尋找")}</h2><p>{localized(language, "Groups, membership, pinning, searches, and close reviews persist in this browser. Right-click keeps tab actions; Shift+right-click opens appearance.", "群組、成員、釘選、搜尋同關閉檢查會保留喺瀏覽器。右擊保留分頁操作；Shift+右擊開外觀。")}</p></div></div>
                  <div className="tab-search-grid">
                    <TabDiscoveryCard
                      id="tab-search-strip"
                      label={localized(language, "Current-strip search", "目前分頁列搜尋")}
                      placeholder={localized(language, "Search open tabs", "搜尋已開啟分頁")}
                      state={tabSearches.strip}
                      onChange={(next) => setTabSearches((current) => ({ ...current, strip: next }))}
                      items={currentStripItems}
                      language={language}
                      notify={notify}
                      onActivate={activateDiscoveryItem}
                      voice={voice}
                    />
                    <TabDiscoveryCard
                      id="tab-search-groups"
                      label={localized(language, "Group-name search", "群組名稱搜尋")}
                      placeholder={localized(language, "Search visible group names", "搜尋可見群組名稱")}
                      state={tabSearches.names}
                      onChange={(next) => setTabSearches((current) => ({ ...current, names: next }))}
                      items={groupNameItems}
                      language={language}
                      notify={notify}
                      onActivate={revealGroup}
                      voice={voice}
                    />
                    <TabDiscoveryCard
                      id="tab-search-master"
                      label={localized(language, "Master tab search", "總分頁搜尋")}
                      placeholder={localized(language, "Search every site tab", "搜尋網站全部分頁")}
                      state={tabSearches.master}
                      onChange={(next) => setTabSearches((current) => ({ ...current, master: next }))}
                      items={discoveryItems}
                      language={language}
                      notify={notify}
                      onActivate={activateDiscoveryItem}
                      voice={voice}
                    />
                  </div>

                  <section className="group-create-card" aria-labelledby="create-tab-group-title">
                    <h3 id="create-tab-group-title">{localized(language, "Create a group", "建立群組")}</h3>
                    <div className="group-create-row">
                      <label className="field-label">{localized(language, "Group name", "群組名稱")}<input className="text-field" maxLength={40} value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} /></label>
                      <label className="field-label">{localized(language, "Group color", "群組顏色")}<input type="color" value={newGroupColor} onChange={(event) => setNewGroupColor(event.target.value)} /></label>
                      <button type="button" className="filled-button" onClick={createGroup}>{localized(language, "Create group", "建立群組")}</button>
                    </div>
                  </section>

                  <div className="tab-group-manager">
                    {tabGroups.map((group, groupIndex) => {
                      const groupTabs = discoveryItems.filter((item) => isTabId(item.id) && tabMembership[item.id] === group.id);
                      const search = groupSearches[group.id] ?? makeSearchState(`${group.name} tabs`);
                      return (
                        <section className="tab-group-card" id={`tab-group-${group.id}`} key={group.id} style={{ "--group-color": group.color } as CSSProperties} tabIndex={-1}>
                          <div className="tab-group-card-heading">
                            <label className="field-label">{localized(language, "Group name", "群組名稱")}<input className="text-field" value={group.name} maxLength={40} onChange={(event) => setTabGroups((current) => current.map((candidate) => candidate.id === group.id ? { ...candidate, name: event.target.value.slice(0, 40) || candidate.name } : candidate))} /></label>
                            <label className="field-label compact-color">{localized(language, "Color", "顏色")}<input type="color" value={group.color} onChange={(event) => setTabGroups((current) => current.map((candidate) => candidate.id === group.id ? { ...candidate, color: event.target.value } : candidate))} /></label>
                            <div className="group-order-actions">
                              <button type="button" className="icon-button" disabled={groupIndex === 0} aria-label={localized(language, `Move ${group.name} earlier`, `將 ${group.name} 向前移`)} onClick={() => moveGroup(group.id, -1)}>↑</button>
                              <button type="button" className="icon-button" disabled={groupIndex === tabGroups.length - 1} aria-label={localized(language, `Move ${group.name} later`, `將 ${group.name} 向後移`)} onClick={() => moveGroup(group.id, 1)}>↓</button>
                              <button type="button" className="tonal-button" aria-expanded={!group.collapsed} onClick={() => toggleGroupCollapsed(group.id)}>{localized(language, group.collapsed ? "Expand" : "Collapse", group.collapsed ? "展開" : "收合")}</button>
                            </div>
                          </div>
                          <TabDiscoveryCard
                            id={`tab-search-group-${group.id}`}
                            label={localized(language, `Search ${group.name}`, `搜尋 ${group.name}`)}
                            placeholder={localized(language, "Search this group", "搜尋呢個群組")}
                            state={search}
                            onChange={(next) => setGroupSearches((current) => ({ ...current, [group.id]: next }))}
                            items={groupTabs}
                            language={language}
                            notify={notify}
                            onActivate={activateDiscoveryItem}
                            voice={voice}
                          />
                          <ul className="group-membership-list">
                            {TAB_IDS.filter((id) => tabMembership[id] === group.id).map((id) => {
                              const tab = NAV_TABS.find((candidate) => candidate.id === id)!;
                              return (
                                <li key={id}>
                                  <button type="button" className="tab-member-open" onClick={() => activateTab(id)}><strong>{tabLabel(tab, language)}</strong><span>{openTabs.includes(id) ? localized(language, "Open", "已開啟") : localized(language, "Closed — activate to reopen", "已關閉 — 啟用即可重開")}</span></button>
                                  <label><span className="sr-only">{localized(language, `Move ${tabLabel(tab, language)} to group`, `將 ${tabLabel(tab, language)} 移到群組`)}</span><select value={group.id} onChange={(event) => { const target = event.target.value; setTabMembership((current) => ({ ...current, [id]: target })); setTabGroups((current) => current.map((candidate) => candidate.id === target ? { ...candidate, collapsed: false } : candidate)); setCloseReview(null); }}>{tabGroups.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select></label>
                                  <button type="button" className="text-button" onClick={() => togglePinned(id)}>{pinnedTabs.includes(id) ? localized(language, "Unpin", "取消釘選") : localized(language, "Pin", "釘選")}</button>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      );
                    })}
                  </div>

                  <section className="bulk-close-workbench" aria-labelledby="bulk-close-title">
                    <div className="section-heading"><div><h3 id="bulk-close-title">{localized(language, "Reviewed bulk close", "經檢查批量關閉")}</h3><p>{localized(language, "Both actions use the exact same visible-label predicate. Empty, invalid, stale, and close-everything requests are blocked.", "兩個操作使用完全相同嘅可見標籤判斷；空白、無效、過期同關閉全部分頁嘅要求會被阻止。")}</p></div><label className="switch-row compact-switch"><span><strong>{localized(language, "Include pinned tabs", "包括已釘選分頁")}</strong><small>{localized(language, "Off by default", "預設關閉")}</small></span><input type="checkbox" role="switch" checked={includePinnedInClose} onChange={(event) => { setIncludePinnedInClose(event.target.checked); setCloseReview(null); }} /></label></div>
                    <div className="close-tabs-grid">
                      {(["containing", "not-containing"] as const).map((mode) => <CloseTabsControl key={mode} mode={mode} state={closeSearches[mode]} onChange={(next) => { setCloseSearches((current) => ({ ...current, [mode]: next })); setCloseReview(null); }} openTabs={openTabs} pinnedTabs={pinnedTabs} includePinned={includePinnedInClose} language={language} notify={notify} onReview={setCloseReview} voice={voice} />)}
                    </div>
                  </section>
                </section>
              )}
              {settingsVisible(4) && (
                <section className="settings-card"><div className="settings-card-heading"><span aria-hidden="true">◔</span><div><h2>{localized(language, "Notifications", "通知")}</h2><p>{localized(language, "Corner messages remain reviewable here.", "角落訊息可以喺度翻查。")}</p></div></div><button type="button" className="tonal-button" onClick={() => notify(voice("Preview notification", "預覽通知", "success"), voice("This is a factual preview.", "呢個係如實預覽。", "success"), "success")}>{localized(language, "Send preview", "發送預覽")}</button><p className="supporting">{notices.length} {localized(language, "items in notification history", "項通知記錄")}</p></section>
              )}
            </div>
            <div className="settings-footer"><button type="button" className="outlined-button" onClick={resetPreferences}>{localized(language, "Reset all settings", "重設全部設定")}</button><p>{localized(language, "Reset returns every local preference and tab decoration to the documented default.", "重設會將全部本機設定同分頁裝飾回復文件預設。")}</p></div>
          </section>
        )}

        {activeTab === "about" && (
          <section id="panel-about" role="tabpanel" aria-labelledby="tab-about" className="page-panel">
            <div className="page-intro"><p className="eyebrow">{localized(language, releaseState.status === "published" ? `About Material Office ${releaseState.version}` : "About the unreleased candidate", releaseState.status === "published" ? `關於 Material Office ${releaseState.version}` : "關於未發布候選版")}</p><h1>{voice("Original local models plus an explicit LibreOffice bridge", "原創本機模型，加一條清楚 LibreOffice 橋接", "headline")}</h1><p>{voice("Material Office is independent from LibreOffice and The Document Foundation. It documents which behavior is local, delegated, or still planned.", "Material Office 獨立於 LibreOffice 同 The Document Foundation，並清楚記錄邊啲行為係本機、交由外部處理、或者仍然計劃中。", "body")}</p></div>
            <div className="about-grid"><article><span aria-hidden="true">◫</span><h2>{localized(language, releaseState.status === "published" ? "Windows release" : "Windows candidate", releaseState.status === "published" ? "Windows 版本" : "Windows 候選版")}</h2><p>{localized(language, releaseState.status === "published" ? `Native windows, display scaling, forced colors, file dialogs, printing, and installed-editor discovery shipped in ${releaseState.tag}.` : "Native windows, display scaling, forced colors, file dialogs, printing, and installed-editor discovery are implemented requirements; remote release proof is still pending.", releaseState.status === "published" ? `原生視窗、顯示比例、強制顏色、揀檔、列印同已安裝編輯器偵測已經喺 ${releaseState.tag} 發布。` : "原生視窗、顯示比例、強制顏色、揀檔、列印同已安裝編輯器偵測係已實作要求；遠端發布證據仍然未有。")}</p></article><article><span aria-hidden="true">↔</span><h2>{localized(language, "Explicit bridge", "清楚橋接")}</h2><p>{localized(language, "Native office-format work and UNO commands cross validated main-process boundaries to a separately installed LibreOffice; the site never executes them.", "原生辦公格式工作同 UNO 指令經已驗證主程序邊界交畀另行安裝 LibreOffice；網站唔會執行。")}</p></article><article><span aria-hidden="true">⌂</span><h2>{localized(language, "Local by default", "預設本機")}</h2><p>{localized(language, "Preferences, search, documentation data, and imagery stay on the device. The site has no analytics or third-party network assets; packaged third-party runtimes retain their notices.", "設定、搜尋、文件數據同圖片留喺裝置；網站冇分析或第三方網絡素材，封裝第三方 runtime 會保留聲明。")}</p></article><article><span aria-hidden="true">§</span><h2>{localized(language, "Licenses & provenance", "授權同來源")}</h2><p>{localized(language, "Material Office code is MIT-licensed. Electron/Chromium, MinGit, LibreOffice reference material, and the dim-sum image have separate notices and boundaries.", "Material Office 程式碼用 MIT License；Electron／Chromium、MinGit、LibreOffice 參考材料同點心圖片各有獨立聲明同界線。")}</p><div className="button-row"><a className="text-button" href="legal/LICENSE.txt">{localized(language, "MIT License", "MIT 授權")}</a><a className="text-button" href="legal/THIRD_PARTY_NOTICES.md">{localized(language, "Third-party notices", "第三方聲明")}</a><a className="text-button" href="legal/classic-har-gow-provenance.json">{localized(language, "Image provenance", "圖片來源")}</a></div></article></div>
            <section className="architecture-flow" aria-label={localized(language, "Product architecture", "產品架構")}><div><strong>{localized(language, "Material shell", "Material 外殼")}</strong><span>{localized(language, "Tabs · commands · dialogs · settings", "分頁 · 指令 · 對話框 · 設定")}</span></div><b aria-hidden="true">→</b><div><strong>{localized(language, "Secure app bridge", "安全應用橋接")}</strong><span>{localized(language, "Validated intent and result", "驗證意圖同結果")}</span></div><b aria-hidden="true">→</b><div><strong>LibreOffice</strong><span>{localized(language, "Document capability", "文件功能")}</span></div></section>
          </section>
        )}
      </main>

      <footer><div className="brand footer-brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span><strong>Material Office</strong><small>{localized(language, releaseState.status === "published" ? `Windows release ${releaseState.version}` : "Unreleased Windows candidate 0.1.0", releaseState.status === "published" ? `Windows 版本 ${releaseState.version}` : "未發布 Windows 候選版 0.1.0")}</small></span></div><p>{localized(language, releaseState.status === "published" ? `${releaseState.tag} and its verified installer are published` : "No public installer or hosted release yet", releaseState.status === "published" ? `${releaseState.tag} 同已驗證安裝檔已發布` : "暫時冇公開安裝檔或託管版本")}</p><div className="button-row">{releaseState.releaseUrl && <a className="text-button" href={releaseState.releaseUrl}>{localized(language, "Release", "版本")}</a>}<button type="button" className="text-button" onClick={() => activateTab("about")}>{localized(language, "About", "關於")}</button><a className="text-button" href="legal/LICENSE.txt">{localized(language, "License", "授權")}</a><a className="text-button" href="legal/THIRD_PARTY_NOTICES.md">{localized(language, "Notices", "聲明")}</a><a className="text-button" href="legal/classic-har-gow-provenance.json">{localized(language, "Provenance", "來源")}</a></div></footer>

      {closeReview && (
        <div className="dialog-scrim">
          <section ref={closeDialogRef} className="close-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="close-confirm-title" aria-describedby="close-confirm-description">
            <p className="eyebrow">{voice("Decision required", "需要決定", "destructive")}</p>
            <h2 id="close-confirm-title">{localized(language, `Close ${closeReview.tabIds.length} reviewed tab${closeReview.tabIds.length === 1 ? "" : "s"}?`, `關閉 ${closeReview.tabIds.length} 個已檢查分頁？`)}</h2>
            <p id="close-confirm-description">{voice("Only the visible labels listed below were matched. The review is rejected if the query, language, open tabs, or pin state changed.", "只按下面列出嘅可見標籤配對；如果查詢、語言、已開分頁或釘選狀態改變，檢查會被拒絕。", "destructive")}</p>
            <ul>{closeReview.tabIds.map((id) => {
              const tab = NAV_TABS.find((candidate) => candidate.id === id)!;
              return <li key={id}>{tabLabel(tab, language)}{pinnedTabs.includes(id) ? ` · ${localized(language, "pinned", "已釘選")}` : ""}</li>;
            })}</ul>
            <div className="button-row"><button type="button" className="text-button" autoFocus onClick={() => setCloseReview(null)}>{localized(language, "Cancel", "取消")}</button><button type="button" className="filled-button danger-button" onClick={confirmCloseTabs}>{localized(language, "Close reviewed tabs", "關閉已檢查分頁")}</button></div>
          </section>
        </div>
      )}

      {tabMenu && (
        <div className="tab-context-menu" role="menu" style={{ left: Math.min(tabMenu.x, window.innerWidth - 230), top: Math.min(tabMenu.y, window.innerHeight - 220) }} onClick={(event) => event.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => { togglePinned(tabMenu.id); setTabMenu(null); }}>{pinnedTabs.includes(tabMenu.id) ? localized(language, "Unpin tab", "取消釘選") : localized(language, "Pin tab", "釘選分頁")}</button>
          <button type="button" role="menuitem" onClick={() => { moveTab(tabMenu.id, -1); setTabMenu(null); }}>{localized(language, "Move left", "向左移")}</button>
          <button type="button" role="menuitem" onClick={() => { moveTab(tabMenu.id, 1); setTabMenu(null); }}>{localized(language, "Move right", "向右移")}</button>
          <hr />
          <button type="button" role="menuitem" onClick={() => { setAppearanceTarget(tabMenu.id); setTabMenu(null); }}>{localized(language, "Edit tab appearance…", "編輯分頁外觀…")}</button>
        </div>
      )}

      {appearanceTarget && selectedTabMeta && (
        <aside className="appearance-popover" aria-label={localized(language, "Tab appearance editor", "分頁外觀編輯器")}>
          <div className="panel-title-row"><div><p className="eyebrow">{localized(language, "Anchored tab editor", "分頁旁邊編輯器")}</p><h2>{localized(language, selectedTabMeta.en, selectedTabMeta.yue)}</h2></div><button type="button" className="icon-button" aria-label={localized(language, "Close appearance editor", "關閉外觀編輯器")} onClick={() => { setAppearanceTarget(null); document.getElementById(`tab-${appearanceTarget}`)?.focus(); }}>×</button></div>
          <label className="field-label">{localized(language, "Tab accent", "分頁強調色")}<input type="color" value={tabAppearance[appearanceTarget]?.color ?? preferences.accent} onChange={(event) => setTabAppearance((current) => ({ ...current, [appearanceTarget]: { ...current[appearanceTarget], color: event.target.value } }))} /></label>
          <label className="range-label"><span>{localized(language, "Corner radius", "圓角")} <strong>{tabAppearance[appearanceTarget]?.radius ?? 14}px</strong></span><input type="range" min="0" max="28" value={tabAppearance[appearanceTarget]?.radius ?? 14} onChange={(event) => setTabAppearance((current) => ({ ...current, [appearanceTarget]: { ...current[appearanceTarget], radius: Number(event.target.value) } }))} /></label>
          <label className="range-label"><span>{localized(language, "Font weight", "字重")} <strong>{tabAppearance[appearanceTarget]?.weight ?? 650}</strong></span><input type="range" min="400" max="800" step="50" value={tabAppearance[appearanceTarget]?.weight ?? 650} onChange={(event) => setTabAppearance((current) => ({ ...current, [appearanceTarget]: { ...current[appearanceTarget], weight: Number(event.target.value) } }))} /></label>
          <div className="button-row"><button type="button" className="text-button" onClick={() => setTabAppearance((current) => { const next = { ...current }; delete next[appearanceTarget]; return next; })}>{localized(language, "Reset tab", "重設分頁")}</button><button type="button" className="filled-button" onClick={() => { setAppearanceTarget(null); document.getElementById(`tab-${appearanceTarget}`)?.focus(); }}>{localized(language, "Done", "完成")}</button></div>
        </aside>
      )}

      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {notices.filter((notice) => notice.visible).slice(0, 3).map((notice) => <div className={`toast ${notice.kind}`} key={notice.id}><span aria-hidden="true">{notice.kind === "success" ? "✓" : notice.kind === "warning" ? "!" : notice.kind === "error" ? "×" : "i"}</span><div><strong>{notice.title}</strong><p>{notice.body}</p></div><button type="button" aria-label={localized(language, "Dismiss notification", "關閉通知")} onClick={() => setNotices((current) => current.map((item) => item.id === notice.id ? { ...item, visible: false } : item))}>×</button></div>)}
      </div>

      {surpriseVisible && (
        <aside className="dim-sum-surprise" aria-live="polite">
          <img src="media/classic-har-gow.png" alt={localized(language, "Warm tea-house photograph of Classic Har Gow", "港式茶樓木枱上嘅蝦餃")} />
          <div><p className="eyebrow">{voice("A 1% hello", "1% 小招呼", "info")}</p><strong>Classic Har Gow · 蝦餃</strong><span>{voice("A tiny steamer basket wandered past. Nothing is blocked.", "小蒸籠路過打個招呼，唔會阻住你。", "info")}</span></div>
          <button type="button" aria-label={localized(language, "Dismiss dim sum surprise", "關閉點心驚喜")} onClick={() => setSurpriseVisible(false)}>×</button>
        </aside>
      )}
    </div>
  );
}
