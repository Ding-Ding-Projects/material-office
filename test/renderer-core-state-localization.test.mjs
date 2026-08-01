import test from "node:test";
import assert from "node:assert/strict";

import {
  APP_STATE_SCHEMA,
  APP_STATE_SCHEMA_VERSION,
  LANGUAGE_MODES,
  createDefaultAppState,
  sanitizePersistedState,
} from "../src/renderer/core/state.mjs";
import {
  LocalizationError,
  createCopyEngine,
  defineCopyResources,
  renderCopy,
} from "../src/renderer/core/localization.mjs";

test("default state is versioned, complete, and independently allocated", () => {
  const first = createDefaultAppState();
  const second = createDefaultAppState();
  assert.equal(first.schemaVersion, APP_STATE_SCHEMA_VERSION);
  assert.equal(APP_STATE_SCHEMA.$id, "material-office/app-state/v1");
  assert.equal(APP_STATE_SCHEMA.properties.schemaVersion.const, APP_STATE_SCHEMA_VERSION);
  assert.deepEqual(
    APP_STATE_SCHEMA.properties.preferences.properties.language.properties.mode.enum,
    ["en", "yue", "bilingual"],
  );
  assert.deepEqual(LANGUAGE_MODES, ["en", "yue", "bilingual"]);
  assert.deepEqual(first.preferences, {
    appearance: { theme: "light", density: "compact", accent: "#6750a4" },
    language: { mode: "en", funnyLevels: { en: 1, yue: 1 } },
    dimSumSurprise: { enabled: true },
  });
  assert.deepEqual(Object.keys(first).sort(), [
    "changelog",
    "documents",
    "history",
    "notifications",
    "preferences",
    "records",
    "schemaVersion",
    "tabs",
  ]);
  first.notifications.push({ id: "one" });
  assert.deepEqual(second.notifications, []);
});

test("persisted state is merged through allowlists and repaired", () => {
  const hostile = JSON.parse(`{
    "schemaVersion": 999,
    "preferences": {
      "appearance": { "theme": "sepia", "density": "comfortable", "accent": "#ABCDEF", "unknown": true },
      "language": { "mode": "bilingual", "funnyLevels": { "en": 5, "yue": 0 } },
      "dimSumSurprise": { "enabled": false }
    },
    "tabs": {
      "activeTabId": "missing",
      "tabs": [
        { "id": "a", "label": "Alpha", "pinned": true, "groupId": "g", "payload": { "ok": 1, "__proto__": { "polluted": true } } },
        { "id": "b", "label": "Beta", "pinned": true, "unsaved": true, "groupId": "gone" },
        { "id": "a", "label": "Duplicate" },
        { "label": "No id" }
      ],
      "tabOrder": ["b", "missing", "b"],
      "pinnedOrder": ["b", "a"],
      "groups": [{ "id": "g", "name": "Group", "color": "#123456", "collapsed": true }],
      "groupOrder": ["g", "g"],
      "searches": { "groups": { "g": { "mode": "regex", "pattern": "a+", "flags": "i" }, "gone": { "query": "x" } } }
    },
    "documents": { "doc": { "text": "你好" }, "__proto__": { "polluted": true } },
    "records": { "r": { "value": 7 } },
    "notifications": [{ "id": "n" }],
    "history": [{ "action": "updated" }],
    "changelog": [{ "version": "1.0.0" }],
    "unknownTopLevel": { "execute": "never" },
    "__proto__": { "polluted": true }
  }`);

  const state = sanitizePersistedState(hostile);
  assert.equal(state.schemaVersion, APP_STATE_SCHEMA_VERSION);
  assert.equal(state.preferences.appearance.theme, "light");
  assert.equal(state.preferences.appearance.density, "comfortable");
  assert.equal(state.preferences.appearance.accent, "#abcdef");
  assert.deepEqual(state.preferences.language.funnyLevels, { en: 5, yue: 1 });
  assert.equal(state.preferences.dimSumSurprise.enabled, false);
  assert.deepEqual(state.tabs.tabs.map((tab) => tab.id), ["a", "b"]);
  assert.deepEqual(state.tabs.tabOrder, ["b", "a"]);
  assert.deepEqual(state.tabs.pinnedOrder, ["b", "a"]);
  assert.equal(state.tabs.tabs.find((tab) => tab.id === "b").groupId, null);
  assert.equal(state.tabs.activeTabId, "b");
  assert.deepEqual(state.tabs.groupOrder, ["g"]);
  assert.deepEqual(Object.keys(state.tabs.searches.groups), ["g"]);
  assert.equal(state.documents.doc.text, "你好");
  assert.equal(Object.hasOwn(state, "unknownTopLevel"), false);
  assert.equal(Object.hasOwn(state.documents, "__proto__"), false);
  assert.equal({}.polluted, undefined);
});

test("non-object and cyclic persisted data fall back safely", () => {
  assert.deepEqual(sanitizePersistedState(null), createDefaultAppState());
  const cyclic = { preferences: {}, documents: {} };
  cyclic.documents.loop = cyclic.documents;
  const state = sanitizePersistedState(cyclic);
  assert.deepEqual(state.documents, {});
});

test("both languages have five observably distinct levels and preserve facts", () => {
  for (const language of ["en", "yue"]) {
    const variants = new Set();
    for (let level = 1; level <= 5; level += 1) {
      const result = renderCopy("notification.error", {
        mode: language,
        funnyLevels: { en: level, yue: level },
        facts: { name: "報告 Q3.odt", reason: "E_LOCKED_17" },
      });
      variants.add(result);
      assert.match(result, /報告 Q3\.odt/);
      assert.match(result, /E_LOCKED_17/);
    }
    assert.equal(variants.size, 5);
  }
});

test("bilingual mode independently selects English and Cantonese levels", () => {
  const engine = createCopyEngine();
  const result = engine.render("tabs.closePreview", {
    mode: "bilingual",
    funnyLevels: { en: 1, yue: 5 },
    facts: { count: 12 },
    bilingualSeparator: " | ",
  });
  assert.equal(
    result,
    "12 tabs will close. | 12 個分頁喺離境大堂揮手，準備俾你關閉。",
  );
});

test("copy definitions require five unique variants and stable fact placeholders", () => {
  assert.throws(
    () =>
      defineCopyResources({
        bad: { en: ["x", "x", "x", "x", "x"], yue: ["一", "二", "三", "四", "五"] },
      }),
    (error) => error instanceof LocalizationError && error.code === "DUPLICATE_VARIANTS",
  );
  assert.throws(
    () =>
      defineCopyResources({
        bad: {
          en: ["{{fact}} 1", "{{fact}} 2", "{{fact}} 3", "{{fact}} 4", "missing 5"],
          yue: ["{{fact}} 一", "{{fact}} 二", "{{fact}} 三", "{{fact}} 四", "{{fact}} 五"],
        },
      }),
    (error) => error instanceof LocalizationError && error.code === "PLACEHOLDER_MISMATCH",
  );
  assert.throws(
    () =>
      defineCopyResources({
        bad: {
          en: ["{{fact}} 1", "{{fact}} 2", "{{fact}} 3", "{{fact}} 4", "{{fact}} 5"],
          yue: ["無資料 一", "無資料 二", "無資料 三", "無資料 四", "無資料 五"],
        },
      }),
    (error) => error instanceof LocalizationError && error.code === "PLACEHOLDER_MISMATCH",
  );
});
