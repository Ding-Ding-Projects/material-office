import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyFunnyVoice, FUNNY_COPY_CATEGORIES } from "../app/funny-copy.mjs";
import { buildCloseReviewSignature, computeCloseCandidateIds } from "../app/tab-state.mjs";

test("English and Cantonese funny levels are independent across every copy category", () => {
  assert.deepEqual([...FUNNY_COPY_CATEGORIES].sort(), [
    "accessibility", "action", "body", "destructive", "error", "financial", "headline", "info", "security", "status", "success", "warning",
  ]);
  for (const category of FUNNY_COPY_CATEGORIES) {
    const english = Array.from({ length: 5 }, (_, index) => applyFunnyVoice({
      language: "en", en: "Exact fact.", yue: "準確事實。", funnyEn: index + 1, funnyYue: 1, category,
    }));
    const cantonese = Array.from({ length: 5 }, (_, index) => applyFunnyVoice({
      language: "yue", en: "Exact fact.", yue: "準確事實。", funnyEn: 1, funnyYue: index + 1, category,
    }));
    assert.equal(new Set(english).size, 5, `${category} English levels must all render differently`);
    assert.equal(new Set(cantonese).size, 5, `${category} Cantonese levels must all render differently`);
    assert.ok(english.every((copy) => copy.startsWith("Exact fact.")));
    assert.ok(cantonese.every((copy) => copy.startsWith("準確事實。")));
  }

  const englishFixed = applyFunnyVoice({ language: "en", en: "Fact.", yue: "事實。", funnyEn: 3, funnyYue: 1, category: "body" });
  const englishIgnoresYue = applyFunnyVoice({ language: "en", en: "Fact.", yue: "事實。", funnyEn: 3, funnyYue: 5, category: "body" });
  assert.equal(englishFixed, englishIgnoresYue);
  const bilingual = applyFunnyVoice({ language: "both", en: "Fact.", yue: "事實。", funnyEn: 2, funnyYue: 4, category: "warning" });
  assert.match(bilingual, /^Fact\./u);
  assert.match(bilingual, /事實。/u);
});

test("bulk close modes share one match set and protect pinned tabs by default", () => {
  const base = { openIds: ["home", "features", "settings", "about"], matchIndices: [1, 2], pinnedIds: ["home", "settings"] };
  assert.deepEqual(computeCloseCandidateIds({ ...base, mode: "containing", includePinned: false }), ["features"]);
  assert.deepEqual(computeCloseCandidateIds({ ...base, mode: "not-containing", includePinned: false }), ["about"]);
  assert.deepEqual(computeCloseCandidateIds({ ...base, mode: "containing", includePinned: true }), ["features", "settings"]);
  assert.deepEqual(computeCloseCandidateIds({ ...base, mode: "not-containing", includePinned: true }), ["home", "about"]);
});

test("close review signatures invalidate on query, language, pin, or open-tab changes", () => {
  const base = {
    mode: "containing",
    search: { query: "set", regex: false, flags: "iu" },
    openIds: ["home", "settings"],
    pinnedIds: ["home"],
    includePinned: false,
    language: "en",
  };
  const signature = buildCloseReviewSignature(base);
  for (const changed of [
    { ...base, search: { ...base.search, query: "home" } },
    { ...base, language: "both" },
    { ...base, pinnedIds: [] },
    { ...base, openIds: ["settings", "home"] },
  ]) {
    assert.notEqual(buildCloseReviewSignature(changed), signature);
  }
});

test("landing source exposes persisted mutable groups and all discovery/close surfaces", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const contract of [
    "setTabGroups", "setTabMembership", "setGroupSearches", "setOpenTabs",
    "Current-strip search", "Group-name search", "Master tab search", "Search this group",
    "Close tabs containing text", "Close tabs not containing text", "includePinnedInClose",
    "buildCloseReviewSignature", "Review expired",
  ]) assert.match(page, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
});
