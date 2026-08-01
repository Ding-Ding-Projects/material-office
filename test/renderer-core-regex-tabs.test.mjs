import test from "node:test";
import assert from "node:assert/strict";

import {
  REGEX_LIMITS,
  RegexValidationError,
  assessRegexRisk,
  buildGuidedPattern,
  createRegexPredicate,
  evaluateRegex,
  evaluateRegexCollection,
  filterCollection,
  validateRegexFlags,
} from "../src/renderer/core/regex.mjs";
import {
  RegexWorkerEvaluator,
  RegexWorkerTimeoutError,
} from "../src/renderer/core/regex-worker-client.mjs";
import {
  createGroup,
  createTabModel,
  executeCloseTabsAsync,
  executeClosePreview,
  moveTabToGroup,
  orderedTabIds,
  pinTab,
  previewCloseTabs,
  previewCloseTabsAsync,
  renameGroup,
  reorderGroup,
  reorderTab,
  searchCurrentStrip,
  searchCurrentStripAsync,
  searchGroupNames,
  searchGroupNamesAsync,
  searchMasterTabsAsync,
  searchTabsInGroup,
  searchTabsInGroupAsync,
  setGroupCollapsed,
  setGroupColor,
  setGroupPinned,
  setTabSearch,
  unpinTab,
} from "../src/renderer/core/tabs.mjs";

test("plain matching is the default and treats punctuation literally", () => {
  const predicate = createRegexPredicate({ query: "." });
  assert.equal(predicate.request.mode, "plain");
  assert.equal(predicate.test("a.b"), true);
  assert.equal(predicate.test("abc"), false);
});

test("regex flags and hard input bounds are enforced", () => {
  assert.equal(validateRegexFlags("gimu"), "gimu");
  for (const flags of ["ii", "z", "uv"]) {
    assert.throws(
      () => validateRegexFlags(flags),
      (error) => error instanceof RegexValidationError && error.code === "INVALID_FLAGS",
    );
  }
  assert.throws(
    () => evaluateRegex({ mode: "regex", pattern: "x".repeat(REGEX_LIMITS.maxPatternLength + 1), sample: "x" }),
    (error) => error.code === "PATTERN_TOO_LONG",
  );
  assert.throws(
    () => evaluateRegex({ mode: "regex", pattern: "x", sample: "x".repeat(REGEX_LIMITS.maxSampleLength + 1) }),
    (error) => error.code === "SAMPLE_TOO_LONG",
  );
});

test("guided construction covers literals, classes, anchors, groups, alternation, and quantifiers", () => {
  const pattern = buildGuidedPattern([
    { type: "anchor", value: "start" },
    { type: "literal", value: "file." },
    { type: "characterClass", value: "0-9", raw: true },
    { type: "group", name: "suffix", pattern: "txt|odt" },
    { type: "quantifier", subject: "!", min: 0, max: 2, greedy: false },
    { type: "anchor", value: "end" },
  ]);
  assert.equal(pattern, "^file\\.[0-9](?<suffix>txt|odt)(?:!){0,2}?$");
  assert.equal(createRegexPredicate({ mode: "regex", pattern }).test("file.7odt!"), true);

  const alternative = buildGuidedPattern([
    { type: "alternation", branches: ["a.b", "c+d"] },
  ]);
  assert.equal(createRegexPredicate({ mode: "regex", pattern: alternative }).test("c+d"), true);
});

test("matching is Unicode-aware, multiline-aware, capture-rich, and zero-width safe", () => {
  const multiline = evaluateRegex({
    mode: "regex",
    pattern: "^(?<word>\\p{L}+)$",
    flags: "gmu",
    sample: "香港\nToronto\n123",
  });
  assert.deepEqual(multiline.matches.map((match) => match.value), ["香港", "Toronto"]);
  assert.deepEqual(multiline.matches.map((match) => match.namedCaptures.word), ["香港", "Toronto"]);
  assert.equal(multiline.matches[0].captures[0].value, "香港");

  const zeroWidth = evaluateRegex({
    mode: "regex",
    pattern: "(?=(?<glyph>.))",
    flags: "gu",
    sample: "😀好",
  });
  assert.deepEqual(zeroWidth.matches.map((match) => match.index), [0, 2]);
  assert.deepEqual(zeroWidth.matches.map((match) => match.namedCaptures.glyph), ["😀", "好"]);

  const repeated = evaluateRegex({
    mode: "regex",
    pattern: "(a)(a)",
    sample: "aa",
  });
  assert.deepEqual(repeated.matches[0].captures.map((capture) => capture.index), [0, 1]);
});

test("common catastrophic inputs are rejected before synchronous evaluation", () => {
  for (const pattern of ["(a+)+$", "(a|aa)+$", ".*.*", "(a+)\\1"] ) {
    assert.equal(assessRegexRisk(pattern).risky, true);
    assert.throws(
      () => evaluateRegex({ mode: "regex", pattern, sample: "a".repeat(1_000) + "!" }),
      (error) => error.code === "UNSAFE_PATTERN",
    );
  }
});

test("collection evaluation is bounded and shares one compiled predicate", () => {
  const result = evaluateRegexCollection(
    { mode: "regex", pattern: "^Q", flags: "i" },
    ["Q3 Budget", "Meeting Notes", "q4 Forecast"],
  );
  assert.deepEqual(result.matches, [true, false, true]);
  assert.throws(
    () =>
      evaluateRegexCollection(
        { mode: "regex", pattern: "x" },
        ["x".repeat(REGEX_LIMITS.maxSampleLength + 1)],
      ),
    (error) => error.code === "COLLECTION_ITEM_TOO_LONG",
  );
  assert.throws(
    () =>
      evaluateRegexCollection(
        { mode: "plain", query: "x" },
        Array.from({ length: 51 }, () => "x".repeat(20_000)),
      ),
    (error) => error.code === "COLLECTION_TEXT_TOO_LONG",
  );
  assert.deepEqual(filterCollection(["a.b", "abc"], { query: "." }), [0]);
  assert.deepEqual(filterCollection(["香港", "Toronto"], { query: "" }), [0, 1]);
  const commands = Array.from({ length: 2_433 }, (_value, index) => `Command ${index}`);
  assert.deepEqual(filterCollection(commands, { query: "Command 2432" }), [2_432]);
  assert.throws(
    () =>
      filterCollection(
        ["a".repeat(30) + "!"],
        { mode: "regex", pattern: "^(a|[a])+$" },
      ),
    (error) => error.code === "REGEX_WORKER_REQUIRED",
  );
});

class FakeWorker {
  constructor({ silent = false } = {}) {
    this.listeners = { message: [], error: [] };
    this.silent = silent;
    this.terminated = false;
  }

  addEventListener(type, listener) {
    this.listeners[type].push(listener);
  }

  postMessage(message) {
    if (this.silent) return;
    queueMicrotask(() => {
      for (const listener of this.listeners.message) {
        listener({ data: { type: "result", id: message.id, result: { echo: message.payload } } });
      }
    });
  }

  terminate() {
    this.terminated = true;
  }
}

class CollectionWorker extends FakeWorker {
  postMessage(message) {
    queueMicrotask(() => {
      for (const listener of this.listeners.message) {
        const result = evaluateRegexCollection(
          message.payload.request,
          message.payload.values,
          { allowRisky: true },
        );
        listener({
          data: {
            type: "result",
            id: message.id,
            result,
          },
        });
      }
    });
  }
}

const collectionEvaluator = {
  async testCollection(request, values) {
    const predicate = createRegexPredicate(request, { allowRisky: true });
    return { matches: values.map((value) => predicate.test(value)) };
  },
};

test("worker client uses request ids, returns results, and terminates on deadline", async () => {
  const responsive = new FakeWorker();
  const evaluator = new RegexWorkerEvaluator({ workerFactory: () => responsive });
  assert.deepEqual(await evaluator.evaluate({ pattern: "x" }), { echo: { pattern: "x" } });
  evaluator.dispose();
  assert.equal(responsive.terminated, true);

  const stalled = new FakeWorker({ silent: true });
  const deadline = new RegexWorkerEvaluator({ workerFactory: () => stalled });
  await assert.rejects(
    deadline.evaluate({ pattern: "(a+)+$" }, { timeoutMs: 10 }),
    (error) => error instanceof RegexWorkerTimeoutError && error.code === "REGEX_TIMEOUT",
  );
  assert.equal(stalled.terminated, true);

  const collectionWorker = new CollectionWorker();
  const collections = new RegexWorkerEvaluator({ workerFactory: () => collectionWorker });
  assert.deepEqual(
    await collections.testCollection(
      { mode: "regex", pattern: "^Q" },
      ["Q3 Budget", "Notes"],
    ),
    {
      mode: "regex",
      pattern: "^Q",
      flags: "",
      matches: [true, false],
      matchedIndices: [0],
      risk: { risky: false, reasons: [] },
    },
  );
  assert.deepEqual(
    await collections.filter(
      ["香港", "Toronto", "廣東話"],
      { mode: "regex", pattern: "\\p{Script=Han}", flags: "u" },
    ),
    [0, 2],
  );
  assert.deepEqual(
    await collections.filter([], { mode: "regex", pattern: "x" }),
    [],
  );
  collections.dispose();

  const riskyWorker = new FakeWorker({ silent: true });
  const riskyDeadline = new RegexWorkerEvaluator({ workerFactory: () => riskyWorker });
  await assert.rejects(
    riskyDeadline.filter(
      ["a".repeat(30) + "!"],
      { mode: "regex", pattern: "^(a|[a])+$" },
      { timeoutMs: 10 },
    ),
    (error) => error.code === "REGEX_TIMEOUT",
  );
});

function fixture(location = {}) {
  return createTabModel({
    workspaceId: location.workspaceId ?? "workspace-a",
    windowId: location.windowId ?? "window-a",
    stripId: location.stripId ?? "strip-a",
    tabs: [
      { id: "home", label: "Home", pinned: true },
      { id: "budget", label: "Q3 Budget", groupId: "finance" },
      { id: "forecast", label: "Q4 Forecast", groupId: "finance", unsaved: true },
      { id: "notes", label: "Meeting Notes" },
    ],
    tabOrder: ["home", "budget", "forecast", "notes"],
    pinnedOrder: ["home"],
    groups: [
      { id: "finance", name: "Finance", color: "#00639b" },
      { id: "archive", name: "Archive", color: "#775a00", collapsed: true },
    ],
    groupOrder: ["finance", "archive"],
  });
}

test("tab pinning, reordering, and full group lifecycle are immutable", () => {
  const original = fixture();
  const pinned = pinTab(original, "notes");
  assert.deepEqual(orderedTabIds(pinned), ["home", "notes", "budget", "forecast"]);
  assert.equal(original.tabs.find((tab) => tab.id === "notes").pinned, false);
  const reordered = reorderTab(pinned, "notes", 0);
  assert.deepEqual(reordered.pinnedOrder, ["notes", "home"]);
  const unpinned = unpinTab(reordered, "notes");
  assert.equal(unpinned.tabs.find((tab) => tab.id === "notes").pinned, false);

  let changed = createGroup(unpinned, { name: "Research", color: "#123456" }, 0);
  const research = changed.groups.find((group) => group.name === "Research");
  assert.equal(changed.groupOrder[0], research.id);
  changed = renameGroup(changed, research.id, "Research & Labs");
  changed = setGroupColor(changed, research.id, "#abcdef");
  changed = setGroupCollapsed(changed, research.id, true);
  changed = moveTabToGroup(changed, "notes", research.id);
  changed = reorderGroup(changed, "archive", 0);
  assert.deepEqual(
    changed.groups.find((group) => group.id === research.id),
    { id: research.id, name: "Research & Labs", color: "#abcdef", collapsed: true, pinned: false },
  );
  assert.equal(changed.tabs.find((tab) => tab.id === "notes").groupId, research.id);
  assert.equal(changed.groupOrder[0], "archive");
});

test("the four tab searches stay independent and report exact locations", async () => {
  let model = fixture();
  model = setTabSearch(model, "currentStrip", { query: "Q" });
  model = setTabSearch(model, "group", { query: "budget", flags: "i" }, { groupId: "finance" });
  model = setTabSearch(model, "groupNames", { query: "arch", flags: "i" });
  model = setTabSearch(model, "master", { mode: "regex", pattern: "Notes$", flags: "i" });
  assert.equal(model.searches.currentStrip.query, "Q");
  assert.equal(model.searches.groups.finance.query, "budget");
  assert.equal(model.searches.groupNames.query, "arch");
  assert.equal(model.searches.master.pattern, "Notes$");

  assert.deepEqual(searchCurrentStrip(model).map((result) => result.tabId), ["budget", "forecast"]);
  assert.deepEqual(searchTabsInGroup(model, "finance").map((result) => result.tabId), ["budget"]);
  assert.deepEqual(searchGroupNames(model).map((result) => result.groupId), ["archive"]);
  assert.deepEqual(
    (
      await searchTabsInGroupAsync(
        model,
        "finance",
        { mode: "regex", pattern: "Budget$", flags: "i" },
        { evaluator: collectionEvaluator },
      )
    ).map((result) => result.tabId),
    ["budget"],
  );
  assert.deepEqual(
    (
      await searchGroupNamesAsync(
        model,
        { mode: "regex", pattern: "^Fin", flags: "i" },
        { evaluator: collectionEvaluator },
      )
    ).map((result) => result.groupId),
    ["finance"],
  );

  const other = fixture({ workspaceId: "workspace-b", windowId: "window-b", stripId: "strip-b" });
  const master = await searchMasterTabsAsync(
    [model, other],
    model.searches.master,
    { evaluator: collectionEvaluator },
  );
  assert.equal(master.length, 2);
  assert.deepEqual(master.map((result) => result.location.workspaceId), ["workspace-a", "workspace-b"]);
  assert.deepEqual(master[0].location, {
    workspaceId: "workspace-a",
    windowId: "window-a",
    stripId: "strip-a",
    groupId: null,
    groupName: null,
    groupCollapsed: false,
  });
});

test("tab regexes require a deadline worker and use the async collection path", async () => {
  const model = fixture();
  const bypass = { mode: "regex", pattern: "^(a|[a])+$" };
  assert.throws(
    () => searchCurrentStrip(model, bypass),
    (error) => error.code === "REGEX_WORKER_REQUIRED",
  );
  assert.equal(previewCloseTabs(model, { match: bypass }).error.code, "REGEX_WORKER_REQUIRED");

  const results = await searchCurrentStripAsync(
    model,
    { mode: "regex", pattern: "^Q", flags: "i" },
    { evaluator: collectionEvaluator },
  );
  assert.deepEqual(results.map((result) => result.tabId), ["budget", "forecast"]);
});

test("search and close predicates consider a distinct visible title", () => {
  const model = createTabModel({
    tabs: [{ id: "report", label: "Report", title: "Quarterly financial report" }],
  });
  assert.deepEqual(
    searchCurrentStrip(model, { query: "financial" }).map((result) => result.tabId),
    ["report"],
  );
  assert.deepEqual(
    previewCloseTabs(model, { operation: "containing", match: { query: "financial" } }).affected.map(
      (result) => result.tabId,
    ),
    ["report"],
  );
});

test("close preview blocks empty/invalid input and protects pinned plus unsaved tabs", () => {
  const model = fixture();
  assert.equal(previewCloseTabs(model, { query: "" }).error.code, "EMPTY_QUERY");
  assert.equal(
    previewCloseTabs(model, { mode: "regex", pattern: "[", operation: "containing" }).error.code,
    "INVALID_PATTERN",
  );

  const preview = previewCloseTabs(model, {
    operation: "containing",
    match: { query: "e", flags: "i" },
  });
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.affected.map((result) => result.tabId), ["budget", "notes"]);
  assert.deepEqual(preview.excluded.pinned.map((result) => result.tabId), ["home"]);
  assert.deepEqual(preview.excluded.unsaved.map((result) => result.tabId), ["forecast"]);

  const executed = executeClosePreview(model, preview);
  assert.equal(executed.ok, true);
  assert.deepEqual(executed.closedIds, ["budget", "notes"]);
  assert.deepEqual(executed.model.tabs.map((tab) => tab.id), ["home", "forecast"]);
});

test("pinned groups protect their members from bulk close by default", () => {
  const model = setGroupPinned(fixture(), "finance", true);
  const preview = previewCloseTabs(model, {
    operation: "containing",
    match: { query: "Budget" },
  });
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.affected, []);
  assert.deepEqual(preview.excluded.pinned.map((result) => result.tabId), ["budget"]);
  assert.equal(preview.excluded.pinned[0].tabPinned, false);
  assert.equal(preview.excluded.pinned[0].groupPinned, true);
  assert.equal(preview.excluded.pinned[0].pinned, true);
});

test("inverse close uses the identical predicate and stale previews cannot execute", async () => {
  const model = fixture();
  const preview = await previewCloseTabsAsync(
    model,
    {
      operation: "notContaining",
      match: { mode: "regex", pattern: "^Q", flags: "i" },
    },
    { evaluator: collectionEvaluator },
  );
  assert.deepEqual(preview.affected.map((result) => result.tabId), ["notes"]);
  assert.deepEqual(preview.excluded.pinned.map((result) => result.tabId), ["home"]);

  const changed = {
    ...model,
    tabs: model.tabs.map((tab) => (tab.id === "notes" ? { ...tab, unsaved: true } : tab)),
  };
  const result = executeClosePreview(changed, preview);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "STALE_PREVIEW");
  assert.equal(result.model.tabs.length, 4);
});

test("regex close can preview and execute only through the bounded async path", async () => {
  const result = await executeCloseTabsAsync(
    fixture(),
    {
      operation: "containing",
      match: { mode: "regex", pattern: "^Meeting Notes$", flags: "i" },
    },
    { evaluator: collectionEvaluator },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.closedIds, ["notes"]);
  assert.equal(result.model.tabs.some((tab) => tab.id === "notes"), false);
});

test("safety snapshots reject pin and group-pin changes after preview", () => {
  const model = createTabModel({
    tabs: [{ id: "report", label: "Report" }],
    groups: [{ id: "protected", name: "Protected", color: "#123456" }],
  });
  const preview = previewCloseTabs(model, {
    operation: "containing",
    match: { query: "Report" },
    includePinned: true,
  });
  assert.equal(preview.ok, true);
  assert.equal(executeClosePreview(pinTab(model, "report"), preview).error.code, "STALE_PREVIEW");

  const groupedPreview = previewCloseTabs(
    moveTabToGroup(model, "report", "protected"),
    { operation: "containing", match: { query: "Report" }, includePinned: true },
  );
  const groupPinned = setGroupPinned(
    moveTabToGroup(model, "report", "protected"),
    "protected",
    true,
  );
  assert.equal(
    executeClosePreview(groupPinned, groupedPreview).error.code,
    "STALE_PREVIEW",
  );
});
