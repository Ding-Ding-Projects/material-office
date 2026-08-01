/**
 * Versioned, renderer-owned application state.
 *
 * Persisted data is treated as untrusted input.  `sanitizePersistedState` only
 * copies known preference fields and JSON-safe user records into a fresh state
 * tree; prototypes and unknown top-level keys never cross the boundary.
 */

export const APP_STATE_SCHEMA_VERSION = 1;

export const LANGUAGE_MODES = Object.freeze(["en", "yue", "bilingual"]);
export const THEMES = Object.freeze(["light", "dark"]);
export const DENSITIES = Object.freeze(["compact", "comfortable"]);

const MAX_COLLECTION_ITEMS = 10_000;
const MAX_STRING_LENGTH = 20_000;
const MAX_JSON_DEPTH = 12;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const DEFAULT_ACCENT = "#6750a4";

function createDefaultSearchState() {
  return {
    currentStrip: { mode: "plain", query: "", pattern: "", flags: "" },
    groups: {},
    groupNames: { mode: "plain", query: "", pattern: "", flags: "" },
    master: { mode: "plain", query: "", pattern: "", flags: "" },
  };
}

export function createDefaultAppState() {
  return {
    schemaVersion: APP_STATE_SCHEMA_VERSION,
    preferences: {
      appearance: {
        theme: "light",
        density: "compact",
        accent: DEFAULT_ACCENT,
      },
      language: {
        mode: "en",
        funnyLevels: { en: 1, yue: 1 },
      },
      dimSumSurprise: {
        enabled: true,
      },
    },
    tabs: {
      workspaceId: "default",
      windowId: "main",
      stripId: "primary",
      activeTabId: null,
      tabs: [],
      tabOrder: [],
      pinnedOrder: [],
      groups: [],
      groupOrder: [],
      searches: createDefaultSearchState(),
    },
    documents: {},
    records: {},
    notifications: [],
    history: [],
    changelog: [],
  };
}

export const APP_STATE_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "material-office/app-state/v1",
  title: "Material Office renderer state",
  version: APP_STATE_SCHEMA_VERSION,
  type: "object",
  additionalProperties: false,
  required: Object.freeze([
    "schemaVersion",
    "preferences",
    "tabs",
    "documents",
    "records",
    "notifications",
    "history",
    "changelog",
  ]),
  properties: Object.freeze({
    schemaVersion: Object.freeze({ const: APP_STATE_SCHEMA_VERSION }),
    preferences: Object.freeze({
      type: "object",
      additionalProperties: false,
      required: Object.freeze(["appearance", "language", "dimSumSurprise"]),
      properties: Object.freeze({
        appearance: Object.freeze({
          type: "object",
          additionalProperties: false,
          required: Object.freeze(["theme", "density", "accent"]),
          properties: Object.freeze({
            theme: Object.freeze({ enum: THEMES }),
            density: Object.freeze({ enum: DENSITIES }),
            accent: Object.freeze({ type: "string", pattern: "^#[0-9a-fA-F]{6}$" }),
          }),
        }),
        language: Object.freeze({
          type: "object",
          additionalProperties: false,
          required: Object.freeze(["mode", "funnyLevels"]),
          properties: Object.freeze({
            mode: Object.freeze({ enum: LANGUAGE_MODES }),
            funnyLevels: Object.freeze({
              type: "object",
              additionalProperties: false,
              required: Object.freeze(["en", "yue"]),
              properties: Object.freeze({
                en: Object.freeze({ type: "integer", minimum: 1, maximum: 5 }),
                yue: Object.freeze({ type: "integer", minimum: 1, maximum: 5 }),
              }),
            }),
          }),
        }),
        dimSumSurprise: Object.freeze({
          type: "object",
          additionalProperties: false,
          required: Object.freeze(["enabled"]),
          properties: Object.freeze({ enabled: Object.freeze({ type: "boolean" }) }),
        }),
      }),
    }),
    tabs: Object.freeze({
      type: "object",
      additionalProperties: false,
      required: Object.freeze([
        "workspaceId",
        "windowId",
        "stripId",
        "activeTabId",
        "tabs",
        "tabOrder",
        "pinnedOrder",
        "groups",
        "groupOrder",
        "searches",
      ]),
      properties: Object.freeze({
        workspaceId: Object.freeze({ type: "string" }),
        windowId: Object.freeze({ type: "string" }),
        stripId: Object.freeze({ type: "string" }),
        activeTabId: Object.freeze({ type: ["string", "null"] }),
        tabs: Object.freeze({ type: "array", maxItems: MAX_COLLECTION_ITEMS }),
        tabOrder: Object.freeze({ type: "array", maxItems: MAX_COLLECTION_ITEMS }),
        pinnedOrder: Object.freeze({ type: "array", maxItems: MAX_COLLECTION_ITEMS }),
        groups: Object.freeze({ type: "array", maxItems: MAX_COLLECTION_ITEMS }),
        groupOrder: Object.freeze({ type: "array", maxItems: MAX_COLLECTION_ITEMS }),
        searches: Object.freeze({ type: "object" }),
      }),
    }),
    documents: Object.freeze({ type: "object" }),
    records: Object.freeze({ type: "object" }),
    notifications: Object.freeze({ type: "array", maxItems: MAX_COLLECTION_ITEMS }),
    history: Object.freeze({ type: "array", maxItems: MAX_COLLECTION_ITEMS }),
    changelog: Object.freeze({ type: "array", maxItems: MAX_COLLECTION_ITEMS }),
  }),
  languageModes: LANGUAGE_MODES,
  funnyLevel: Object.freeze({ minimum: 1, maximum: 5 }),
  themes: THEMES,
  densities: DENSITIES,
  collections: Object.freeze([
    "tabs.tabs",
    "tabs.groups",
    "notifications",
    "history",
    "changelog",
  ]),
});

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function boundedString(value, fallback = "", max = MAX_STRING_LENGTH) {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function nullableId(value) {
  if (value === null) return null;
  const id = boundedString(value, "", 256).trim();
  return id || null;
}

function booleanValue(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function funnyLevel(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5
    ? number
    : fallback;
}

function accentValue(value, fallback) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

function safeJsonValue(value, depth = 0, seen = new WeakSet()) {
  if (depth > MAX_JSON_DEPTH) return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    const result = [];
    for (const item of value.slice(0, MAX_COLLECTION_ITEMS)) {
      const clean = safeJsonValue(item, depth + 1, seen);
      if (clean !== undefined) result.push(clean);
    }
    seen.delete(value);
    return result;
  }
  if (!isPlainObject(value) || seen.has(value)) return undefined;
  seen.add(value);
  const result = Object.create(null);
  let count = 0;
  for (const [key, item] of Object.entries(value)) {
    if (count >= MAX_COLLECTION_ITEMS) break;
    if (FORBIDDEN_KEYS.has(key)) continue;
    const clean = safeJsonValue(item, depth + 1, seen);
    if (clean !== undefined) {
      result[key.slice(0, 256)] = clean;
      count += 1;
    }
  }
  seen.delete(value);
  return result;
}

function sanitizeSearch(value) {
  const source = isPlainObject(value) ? value : {};
  const mode = source.mode === "regex" ? "regex" : "plain";
  return {
    mode,
    query: boundedString(source.query, "", 20_000),
    pattern: boundedString(source.pattern, "", 512),
    flags: boundedString(source.flags, "", 16),
  };
}

function sanitizeTab(raw) {
  if (!isPlainObject(raw)) return null;
  const id = nullableId(raw.id);
  if (!id) return null;
  const label = boundedString(raw.label, "", 1_000);
  return {
    id,
    label,
    title: boundedString(raw.title, label, 2_000),
    groupId: nullableId(raw.groupId),
    pinned: booleanValue(raw.pinned, false),
    unsaved: booleanValue(raw.unsaved, false),
    payload: safeJsonValue(raw.payload) ?? null,
  };
}

function sanitizeGroup(raw) {
  if (!isPlainObject(raw)) return null;
  const id = nullableId(raw.id);
  if (!id) return null;
  return {
    id,
    name: boundedString(raw.name, "Untitled group", 1_000),
    color: accentValue(raw.color, DEFAULT_ACCENT),
    collapsed: booleanValue(raw.collapsed, false),
    pinned: booleanValue(raw.pinned, false),
  };
}

function uniqueKnownOrder(value, knownIds) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  for (const item of value.slice(0, MAX_COLLECTION_ITEMS)) {
    const id = nullableId(item);
    if (id && knownIds.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function completeOrder(order, items) {
  const seen = new Set(order);
  return [...order, ...items.map((item) => item.id).filter((id) => !seen.has(id))];
}

function sanitizeTabs(value, defaults) {
  const source = isPlainObject(value) ? value : {};
  const tabs = [];
  const tabIds = new Set();
  for (const raw of Array.isArray(source.tabs)
    ? source.tabs.slice(0, MAX_COLLECTION_ITEMS)
    : []) {
    const tab = sanitizeTab(raw);
    if (tab && !tabIds.has(tab.id)) {
      tabIds.add(tab.id);
      tabs.push(tab);
    }
  }

  const groups = [];
  const groupIds = new Set();
  for (const raw of Array.isArray(source.groups)
    ? source.groups.slice(0, MAX_COLLECTION_ITEMS)
    : []) {
    const group = sanitizeGroup(raw);
    if (group && !groupIds.has(group.id)) {
      groupIds.add(group.id);
      groups.push(group);
    }
  }

  for (const tab of tabs) {
    if (tab.groupId && !groupIds.has(tab.groupId)) tab.groupId = null;
  }

  const rawOrder = uniqueKnownOrder(source.tabOrder, tabIds);
  const tabOrder = completeOrder(rawOrder, tabs);
  const requestedPinnedOrder = uniqueKnownOrder(source.pinnedOrder, tabIds).filter(
    (id) => tabs.find((tab) => tab.id === id)?.pinned,
  );
  const requestedPinned = new Set(requestedPinnedOrder);
  const pinnedOrder = [
    ...requestedPinnedOrder,
    ...tabOrder.filter(
      (id) => tabs.find((tab) => tab.id === id)?.pinned && !requestedPinned.has(id),
    ),
  ];
  const groupOrder = completeOrder(
    uniqueKnownOrder(source.groupOrder, groupIds),
    groups,
  );

  const searchesSource = isPlainObject(source.searches) ? source.searches : {};
  const groupSearches = Object.create(null);
  if (isPlainObject(searchesSource.groups)) {
    for (const groupId of groupIds) {
      if (Object.hasOwn(searchesSource.groups, groupId)) {
        groupSearches[groupId] = sanitizeSearch(searchesSource.groups[groupId]);
      }
    }
  }

  const activeTabId = nullableId(source.activeTabId);
  const pinnedIds = new Set(pinnedOrder);
  const visibleOrder = [
    ...pinnedOrder,
    ...tabOrder.filter((id) => !pinnedIds.has(id)),
  ];
  return {
    workspaceId: nullableId(source.workspaceId) ?? defaults.workspaceId,
    windowId: nullableId(source.windowId) ?? defaults.windowId,
    stripId: nullableId(source.stripId) ?? defaults.stripId,
    activeTabId:
      activeTabId && tabIds.has(activeTabId) ? activeTabId : visibleOrder[0] ?? null,
    tabs,
    tabOrder,
    pinnedOrder,
    groups,
    groupOrder,
    searches: {
      currentStrip: sanitizeSearch(searchesSource.currentStrip),
      groups: groupSearches,
      groupNames: sanitizeSearch(searchesSource.groupNames),
      master: sanitizeSearch(searchesSource.master),
    },
  };
}

function sanitizeDictionary(value) {
  if (!isPlainObject(value)) return {};
  const cleaned = safeJsonValue(value);
  return cleaned && typeof cleaned === "object" && !Array.isArray(cleaned)
    ? { ...cleaned }
    : {};
}

function sanitizeCollection(value) {
  if (!Array.isArray(value)) return [];
  const cleaned = safeJsonValue(value);
  return Array.isArray(cleaned) ? cleaned : [];
}

/**
 * Merge a persisted state snapshot onto current defaults without retaining any
 * unknown executable/prototype-bearing values. Older and future versions are
 * both accepted on a best-effort field basis and emitted at the current version.
 */
export function sanitizePersistedState(persisted) {
  const defaults = createDefaultAppState();
  if (!isPlainObject(persisted)) return defaults;

  const preferences = isPlainObject(persisted.preferences)
    ? persisted.preferences
    : {};
  const appearance = isPlainObject(preferences.appearance)
    ? preferences.appearance
    : {};
  const language = isPlainObject(preferences.language)
    ? preferences.language
    : {};
  const levels = isPlainObject(language.funnyLevels)
    ? language.funnyLevels
    : {};
  const dimSum = isPlainObject(preferences.dimSumSurprise)
    ? preferences.dimSumSurprise
    : {};

  return {
    schemaVersion: APP_STATE_SCHEMA_VERSION,
    preferences: {
      appearance: {
        theme: enumValue(
          appearance.theme,
          THEMES,
          defaults.preferences.appearance.theme,
        ),
        density: enumValue(
          appearance.density,
          DENSITIES,
          defaults.preferences.appearance.density,
        ),
        accent: accentValue(
          appearance.accent,
          defaults.preferences.appearance.accent,
        ),
      },
      language: {
        mode: enumValue(
          language.mode,
          LANGUAGE_MODES,
          defaults.preferences.language.mode,
        ),
        funnyLevels: {
          en: funnyLevel(levels.en, defaults.preferences.language.funnyLevels.en),
          yue: funnyLevel(levels.yue, defaults.preferences.language.funnyLevels.yue),
        },
      },
      dimSumSurprise: {
        enabled: booleanValue(
          dimSum.enabled,
          defaults.preferences.dimSumSurprise.enabled,
        ),
      },
    },
    tabs: sanitizeTabs(persisted.tabs, defaults.tabs),
    documents: sanitizeDictionary(persisted.documents),
    records: sanitizeDictionary(persisted.records),
    notifications: sanitizeCollection(persisted.notifications),
    history: sanitizeCollection(persisted.history),
    changelog: sanitizeCollection(persisted.changelog),
  };
}

export const mergePersistedState = sanitizePersistedState;
