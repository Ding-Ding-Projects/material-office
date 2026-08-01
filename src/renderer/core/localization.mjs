import { LANGUAGE_MODES } from "./state.mjs";

export const FUNNY_LEVELS = Object.freeze([1, 2, 3, 4, 5]);

export const NOTICE_CATEGORIES = Object.freeze(["info", "success", "warning", "error"]);

export const NOTICE_TONES = Object.freeze({
  info: Object.freeze({
    en: Object.freeze(["", " Noted.", " The helpful desk lamp is on.", " The noticeboard has pinned this neatly.", " The pixels pinned this up with a tiny gold star."]),
    yue: Object.freeze(["", " 收到。", " 實用小燈已經着咗。", " 告示板已經釘得整整齊齊。", " 啲像素仲加咗粒迷你金星先收手。"]),
  }),
  success: Object.freeze({
    en: Object.freeze(["", " Done.", " Everything landed neatly.", " The tiny toolbar crew is giving a polite thumbs-up.", " The pixels completed a tiny victory lap, then filed the receipt."]),
    yue: Object.freeze(["", " 搞掂。", " 全部穩穩陣陣落地。", " 迷你工具列同事禮貌地舉咗個拇指。", " 啲像素跑完迷你勝利圈，仲記得釘好張收據。"]),
  }),
  warning: Object.freeze({
    en: Object.freeze(["", " Please check this before continuing.", " The caution light is on; the facts below are unchanged.", " A small safety cone has appeared, carrying the exact details.", " The caution cone brought a clipboard; the exact details still run the meeting."]),
    yue: Object.freeze(["", " 繼續之前請先睇清楚。", " 提示燈着咗；下面嘅事實完全冇變。", " 一個細細安全雪糕筒出場，帶住準確資料。", " 安全雪糕筒拎埋寫字板開會；準確資料仍然話事。"]),
  }),
  error: Object.freeze({
    en: Object.freeze(["", " The exact failure is above.", " The error light is on; the facts remain exact.", " A code gremlin tripped, but it left the real reason on the desk.", " The code gremlin filed a dramatic incident report; the real reason is still exactly above."]),
    yue: Object.freeze(["", " 上面係準確失敗原因。", " 錯誤燈着咗；事實仍然準確。", " 程式小妖跣咗一跤，但有留低真正原因。", " 程式小妖交咗份好戲劇化嘅事故報告；真正原因仍然原封不動喺上面。"]),
  }),
});

export const DEFAULT_COPY = Object.freeze({
  "notification.saved": Object.freeze({
    en: Object.freeze([
      "Saved {{name}}.",
      "Saved {{name}} successfully.",
      "Saved {{name}} — all tidy.",
      "Saved {{name}} — the pixels are safely tucked in.",
      "Saved {{name}} — the pixels have signed the paperwork and gone home happy.",
    ]),
    yue: Object.freeze([
      "已儲存 {{name}}。",
      "{{name}} 儲存成功。",
      "{{name}} 已經執得企企理理。",
      "{{name}} 已經安全收好，啲像素安居樂業。",
      "{{name}} 儲存妥當，啲像素簽埋收據先至肯收工。",
    ]),
  }),
  "notification.error": Object.freeze({
    en: Object.freeze([
      "Could not open {{name}}: {{reason}}.",
      "Opening {{name}} failed: {{reason}}.",
      "{{name}} stayed shut: {{reason}}.",
      "{{name}} declined to open; the exact reason is {{reason}}.",
      "{{name}} pulled the tiny drawbridge up. The actual reason is still {{reason}}.",
    ]),
    yue: Object.freeze([
      "無法開啟 {{name}}：{{reason}}。",
      "開啟 {{name}} 失敗：{{reason}}。",
      "{{name}} 開唔到，原因係 {{reason}}。",
      "{{name}} 暫時閂門，實際原因係 {{reason}}。",
      "{{name}} 拉起咗迷你吊橋；正經原因仍然係 {{reason}}。",
    ]),
  }),
  "tabs.closePreview": Object.freeze({
    en: Object.freeze([
      "{{count}} tabs will close.",
      "Ready to close {{count}} tabs.",
      "{{count}} tabs are lined up to close.",
      "{{count}} tabs have their coats on and are ready to close.",
      "{{count}} tabs are waving from the departure lounge, ready to close.",
    ]),
    yue: Object.freeze([
      "將會關閉 {{count}} 個分頁。",
      "準備關閉 {{count}} 個分頁。",
      "{{count}} 個分頁已排好隊準備關閉。",
      "{{count}} 個分頁著好外套準備收工。",
      "{{count}} 個分頁喺離境大堂揮手，準備俾你關閉。",
    ]),
  }),
});

export class LocalizationError extends Error {
  constructor(message, code = "LOCALIZATION_ERROR") {
    super(message);
    this.name = "LocalizationError";
    this.code = code;
  }
}

function validateLevel(level, language) {
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new LocalizationError(
      `${language} funny level must be an integer from 1 through 5.`,
      "INVALID_FUNNY_LEVEL",
    );
  }
  return level;
}

function placeholders(template) {
  return new Set(
    [...template.matchAll(/{{\s*([A-Za-z][A-Za-z0-9_.-]*)\s*}}/g)].map(
      (match) => match[1],
    ),
  );
}

function validateEntry(key, entry) {
  if (!entry || typeof entry !== "object") {
    throw new LocalizationError(`Copy entry ${key} must be an object.`, "INVALID_ENTRY");
  }
  for (const language of ["en", "yue"]) {
    const variants = entry[language];
    if (!Array.isArray(variants) || variants.length !== 5) {
      throw new LocalizationError(
        `${key}.${language} must contain exactly five variants.`,
        "INVALID_VARIANTS",
      );
    }
    if (variants.some((variant) => typeof variant !== "string")) {
      throw new LocalizationError(
        `${key}.${language} variants must all be strings.`,
        "INVALID_VARIANTS",
      );
    }
    if (new Set(variants).size !== 5) {
      throw new LocalizationError(
        `${key}.${language} must measurably differ at every funny level.`,
        "DUPLICATE_VARIANTS",
      );
    }
    const expected = placeholders(variants[0]);
    for (const variant of variants.slice(1)) {
      const actual = placeholders(variant);
      if (
        actual.size !== expected.size ||
        [...expected].some((placeholder) => !actual.has(placeholder))
      ) {
        throw new LocalizationError(
          `${key}.${language} variants must preserve identical fact placeholders.`,
          "PLACEHOLDER_MISMATCH",
        );
      }
    }
  }
  const englishFacts = placeholders(entry.en[0]);
  const cantoneseFacts = placeholders(entry.yue[0]);
  if (
    englishFacts.size !== cantoneseFacts.size ||
    [...englishFacts].some((placeholder) => !cantoneseFacts.has(placeholder))
  ) {
    throw new LocalizationError(
      `${key} must preserve the same fact placeholders in English and Cantonese.`,
      "PLACEHOLDER_MISMATCH",
    );
  }
}

export function defineCopyResources(resources) {
  if (!resources || typeof resources !== "object" || Array.isArray(resources)) {
    throw new LocalizationError("Copy resources must be an object.", "INVALID_RESOURCES");
  }
  const result = Object.create(null);
  for (const [key, entry] of Object.entries(resources)) {
    validateEntry(key, entry);
    result[key] = {
      en: Object.freeze([...entry.en]),
      yue: Object.freeze([...entry.yue]),
    };
  }
  return Object.freeze(result);
}

function interpolate(template, facts) {
  return template.replace(
    /{{\s*([A-Za-z][A-Za-z0-9_.-]*)\s*}}/g,
    (token, name) => (Object.hasOwn(facts, name) ? String(facts[name]) : token),
  );
}

function inlinePlaceholders(template) {
  return new Set(
    [...String(template).matchAll(/\{([A-Za-z][A-Za-z0-9_.-]*)\}/g)].map((match) => match[1]),
  );
}

function normalizeInlineCopy(copy) {
  if (Array.isArray(copy) && copy.length === 2) return { en: String(copy[0]), yue: String(copy[1]) };
  if (copy && typeof copy === "object" && typeof copy.en === "string" && typeof copy.yue === "string") {
    return { en: copy.en, yue: copy.yue };
  }
  if (typeof copy === "string") return { en: copy, yue: copy };
  throw new LocalizationError("Inline copy must provide English and Cantonese strings.", "INVALID_INLINE_COPY");
}

function validateInlineFacts(copy) {
  const english = inlinePlaceholders(copy.en);
  const cantonese = inlinePlaceholders(copy.yue);
  if (english.size !== cantonese.size || [...english].some((name) => !cantonese.has(name))) {
    throw new LocalizationError(
      "Inline English and Cantonese copy must preserve identical fact placeholders.",
      "PLACEHOLDER_MISMATCH",
    );
  }
}

function interpolateInline(template, facts) {
  return String(template).replace(
    /\{([A-Za-z][A-Za-z0-9_.-]*)\}/g,
    (token, name) => (Object.hasOwn(facts, name) ? String(facts[name]) : token),
  );
}

export function localizedCopyParts(
  copy,
  {
    mode = "en",
    funnyLevels = { en: 1, yue: 1 },
    facts = {},
    category = null,
  } = {},
) {
  if (!LANGUAGE_MODES.includes(mode)) {
    throw new LocalizationError(`Unsupported language mode: ${mode}`, "INVALID_MODE");
  }
  const pair = normalizeInlineCopy(copy);
  validateInlineFacts(pair);
  const enLevel = validateLevel(Number(funnyLevels.en ?? 1), "en");
  const yueLevel = validateLevel(Number(funnyLevels.yue ?? 1), "yue");
  const tone = category === null ? null : NOTICE_TONES[category];
  if (category !== null && !tone) {
    throw new LocalizationError(`Unsupported notification category: ${category}`, "INVALID_NOTICE_CATEGORY");
  }
  const english = `${interpolateInline(pair.en, facts)}${tone?.en[enLevel - 1] ?? ""}`;
  const cantonese = `${interpolateInline(pair.yue, facts)}${tone?.yue[yueLevel - 1] ?? ""}`;
  if (mode === "yue") return Object.freeze({ primary: cantonese, secondary: null, primaryLanguage: "zh-HK", secondaryLanguage: null });
  if (mode === "bilingual") return Object.freeze({ primary: english, secondary: cantonese, primaryLanguage: "en-CA", secondaryLanguage: "zh-HK" });
  return Object.freeze({ primary: english, secondary: null, primaryLanguage: "en-CA", secondaryLanguage: null });
}

export function renderLocalizedCopy(copy, options = {}) {
  const parts = localizedCopyParts(copy, options);
  return parts.secondary === null
    ? parts.primary
    : `${parts.primary}${options.bilingualSeparator ?? " · "}${parts.secondary}`;
}

export function htmlLanguageForMode(mode = "en") {
  if (!LANGUAGE_MODES.includes(mode)) {
    throw new LocalizationError(`Unsupported language mode: ${mode}`, "INVALID_MODE");
  }
  return mode === "yue" ? "zh-HK" : "en-CA";
}

export function createCopyEngine(resources = DEFAULT_COPY) {
  const catalog = defineCopyResources(resources);

  function renderLanguage(key, language, level, facts = {}) {
    const entry = catalog[key];
    if (!entry) {
      throw new LocalizationError(`Unknown copy key: ${key}`, "UNKNOWN_COPY_KEY");
    }
    validateLevel(level, language);
    return interpolate(entry[language][level - 1], facts);
  }

  function render(
    key,
    {
      mode = "en",
      funnyLevels = { en: 1, yue: 1 },
      facts = {},
      bilingualSeparator = "\n",
    } = {},
  ) {
    if (!LANGUAGE_MODES.includes(mode)) {
      throw new LocalizationError(`Unsupported language mode: ${mode}`, "INVALID_MODE");
    }
    const enLevel = validateLevel(funnyLevels.en ?? 1, "en");
    const yueLevel = validateLevel(funnyLevels.yue ?? 1, "yue");
    if (mode === "en") return renderLanguage(key, "en", enLevel, facts);
    if (mode === "yue") return renderLanguage(key, "yue", yueLevel, facts);
    return [
      renderLanguage(key, "en", enLevel, facts),
      renderLanguage(key, "yue", yueLevel, facts),
    ].join(bilingualSeparator);
  }

  return Object.freeze({ catalog, render, renderLanguage });
}

export const defaultCopyEngine = createCopyEngine();
export const renderCopy = defaultCopyEngine.render;
