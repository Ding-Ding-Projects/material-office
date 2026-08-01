import {
  RegexValidationError,
  compileRegex,
  createRegexPredicate,
} from "./regex.mjs";
import { RegexWorkerEvaluator } from "./regex-worker-client.mjs";

const SEARCH_SCOPES = new Set(["currentStrip", "group", "groupNames", "master"]);
const CLOSE_OPERATIONS = new Set(["containing", "notContaining"]);

export class TabDomainError extends Error {
  constructor(message, code = "TAB_DOMAIN_ERROR", details = undefined) {
    super(message);
    this.name = "TabDomainError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function id(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TabDomainError(`${name} must be a non-empty string.`, "INVALID_ID");
  }
  return value.trim().slice(0, 256);
}

function label(value, fallback = "") {
  return typeof value === "string" ? value.slice(0, 2_000) : fallback;
}

function normalizeColor(value) {
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  throw new TabDomainError("Group color must be a six-digit hex color.", "INVALID_COLOR");
}

function defaultSearch() {
  return { mode: "plain", query: "", pattern: "", flags: "" };
}

export function createTabSearchState() {
  return {
    currentStrip: defaultSearch(),
    groups: {},
    groupNames: defaultSearch(),
    master: defaultSearch(),
  };
}

function normalizeSearch(spec = {}) {
  return {
    mode: spec.mode === "regex" ? "regex" : "plain",
    query: typeof spec.query === "string" ? spec.query.slice(0, 20_000) : "",
    pattern: typeof spec.pattern === "string" ? spec.pattern.slice(0, 512) : "",
    flags: typeof spec.flags === "string" ? spec.flags.slice(0, 8) : "",
  };
}

function uniqueOrder(raw, known) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(raw) ? raw : []) {
    if (known.has(value) && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  for (const value of known) if (!seen.has(value)) result.push(value);
  return result;
}

export function createTabModel({
  workspaceId = "default",
  windowId = "main",
  stripId = "primary",
  activeTabId = null,
  tabs = [],
  tabOrder,
  pinnedOrder,
  groups = [],
  groupOrder,
  searches,
} = {}) {
  const normalizedGroups = [];
  const groupIds = new Set();
  for (const group of groups) {
    const groupId = id(group.id, "Group id");
    if (groupIds.has(groupId)) {
      throw new TabDomainError(`Duplicate group id: ${groupId}`, "DUPLICATE_ID");
    }
    groupIds.add(groupId);
    normalizedGroups.push({
      id: groupId,
      name: label(group.name, "Untitled group"),
      color: normalizeColor(group.color ?? "#6750a4"),
      collapsed: group.collapsed === true,
      pinned: group.pinned === true,
    });
  }

  const normalizedTabs = [];
  const tabIds = new Set();
  for (const tab of tabs) {
    const tabId = id(tab.id, "Tab id");
    if (tabIds.has(tabId)) {
      throw new TabDomainError(`Duplicate tab id: ${tabId}`, "DUPLICATE_ID");
    }
    tabIds.add(tabId);
    const groupId = tab.groupId == null ? null : id(tab.groupId, "Group id");
    normalizedTabs.push({
      ...tab,
      id: tabId,
      label: label(tab.label),
      title: label(tab.title, label(tab.label)),
      groupId: groupId && groupIds.has(groupId) ? groupId : null,
      pinned: tab.pinned === true,
      unsaved: tab.unsaved === true,
    });
  }

  const normalizedOrder = uniqueOrder(tabOrder, tabIds);
  const suppliedPinned = uniqueOrder(pinnedOrder, new Set(normalizedTabs.filter((tab) => tab.pinned).map((tab) => tab.id)));
  const normalizedPinned = suppliedPinned.filter((tabId) =>
    normalizedTabs.some((tab) => tab.id === tabId && tab.pinned),
  );
  const normalizedGroupOrder = uniqueOrder(groupOrder, groupIds);
  const sourceSearches = searches && typeof searches === "object" ? searches : {};
  const groupSearches = {};
  if (sourceSearches.groups && typeof sourceSearches.groups === "object") {
    for (const groupId of groupIds) {
      if (Object.hasOwn(sourceSearches.groups, groupId)) {
        groupSearches[groupId] = normalizeSearch(sourceSearches.groups[groupId]);
      }
    }
  }

  const pinnedIds = new Set(normalizedPinned);
  const visibleOrder = [
    ...normalizedPinned,
    ...normalizedOrder.filter((tabId) => !pinnedIds.has(tabId)),
  ];
  return {
    workspaceId: id(workspaceId, "Workspace id"),
    windowId: id(windowId, "Window id"),
    stripId: id(stripId, "Strip id"),
    activeTabId:
      activeTabId && tabIds.has(activeTabId) ? activeTabId : visibleOrder[0] ?? null,
    tabs: normalizedTabs,
    tabOrder: normalizedOrder,
    pinnedOrder: normalizedPinned,
    groups: normalizedGroups,
    groupOrder: normalizedGroupOrder,
    searches: {
      currentStrip: normalizeSearch(sourceSearches.currentStrip),
      groups: groupSearches,
      groupNames: normalizeSearch(sourceSearches.groupNames),
      master: normalizeSearch(sourceSearches.master),
    },
  };
}

export function orderedTabIds(model) {
  const pinned = new Set(model.pinnedOrder);
  return [
    ...model.pinnedOrder,
    ...model.tabOrder.filter((tabId) => !pinned.has(tabId)),
  ];
}

export function orderedTabs(model) {
  const byId = new Map(model.tabs.map((tab) => [tab.id, tab]));
  return orderedTabIds(model).map((tabId) => byId.get(tabId)).filter(Boolean);
}

function updateTab(model, tabId, transform) {
  let found = false;
  const tabs = model.tabs.map((tab) => {
    if (tab.id !== tabId) return tab;
    found = true;
    return transform(tab);
  });
  if (!found) throw new TabDomainError(`Unknown tab: ${tabId}`, "UNKNOWN_TAB");
  return { ...model, tabs };
}

function updateGroup(model, groupId, transform) {
  let found = false;
  const groups = model.groups.map((group) => {
    if (group.id !== groupId) return group;
    found = true;
    return transform(group);
  });
  if (!found) throw new TabDomainError(`Unknown group: ${groupId}`, "UNKNOWN_GROUP");
  return { ...model, groups };
}

export function pinTab(model, tabId) {
  const current = model.tabs.find((tab) => tab.id === tabId);
  if (!current) throw new TabDomainError(`Unknown tab: ${tabId}`, "UNKNOWN_TAB");
  if (current.pinned) return model;
  const changed = updateTab(model, tabId, (tab) => ({ ...tab, pinned: true }));
  return { ...changed, pinnedOrder: [...changed.pinnedOrder, tabId] };
}

export function unpinTab(model, tabId) {
  const current = model.tabs.find((tab) => tab.id === tabId);
  if (!current) throw new TabDomainError(`Unknown tab: ${tabId}`, "UNKNOWN_TAB");
  if (!current.pinned) return model;
  const changed = updateTab(model, tabId, (tab) => ({ ...tab, pinned: false }));
  return {
    ...changed,
    pinnedOrder: changed.pinnedOrder.filter((value) => value !== tabId),
  };
}

function moveItem(order, item, toIndex) {
  const without = order.filter((value) => value !== item);
  const index = Math.max(0, Math.min(without.length, Number(toIndex)));
  without.splice(index, 0, item);
  return without;
}

export function reorderTab(model, tabId, toIndex) {
  const tab = model.tabs.find((item) => item.id === tabId);
  if (!tab) throw new TabDomainError(`Unknown tab: ${tabId}`, "UNKNOWN_TAB");
  if (!Number.isInteger(toIndex)) {
    throw new TabDomainError("Tab index must be an integer.", "INVALID_INDEX");
  }
  if (tab.pinned) {
    return { ...model, pinnedOrder: moveItem(model.pinnedOrder, tabId, toIndex) };
  }
  const unpinned = model.tabOrder.filter(
    (value) => !model.tabs.find((item) => item.id === value)?.pinned,
  );
  const moved = moveItem(unpinned, tabId, toIndex);
  const pinnedInBaseOrder = model.tabOrder.filter(
    (value) => model.tabs.find((item) => item.id === value)?.pinned,
  );
  return { ...model, tabOrder: [...pinnedInBaseOrder, ...moved] };
}

function generateGroupId(model, name) {
  const base =
    String(name || "group")
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "group";
  const existing = new Set(model.groups.map((group) => group.id));
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function createGroup(model, group, toIndex = model.groups.length) {
  if (!group || typeof group !== "object") {
    throw new TabDomainError("Group details must be an object.", "INVALID_GROUP");
  }
  if (!Number.isInteger(toIndex)) {
    throw new TabDomainError("Group index must be an integer.", "INVALID_INDEX");
  }
  const groupId = group.id ? id(group.id, "Group id") : generateGroupId(model, group.name);
  if (model.groups.some((item) => item.id === groupId)) {
    throw new TabDomainError(`Duplicate group id: ${groupId}`, "DUPLICATE_ID");
  }
  const created = {
    id: groupId,
    name: label(group.name, "Untitled group"),
    color: normalizeColor(group.color ?? "#6750a4"),
    collapsed: group.collapsed === true,
    pinned: group.pinned === true,
  };
  return {
    ...model,
    groups: [...model.groups, created],
    groupOrder: moveItem([...model.groupOrder, groupId], groupId, toIndex),
  };
}

export function renameGroup(model, groupId, name) {
  return updateGroup(model, groupId, (group) => ({ ...group, name: label(name) }));
}

export function setGroupColor(model, groupId, color) {
  return updateGroup(model, groupId, (group) => ({
    ...group,
    color: normalizeColor(color),
  }));
}

export function setGroupCollapsed(model, groupId, collapsed) {
  return updateGroup(model, groupId, (group) => ({
    ...group,
    collapsed: Boolean(collapsed),
  }));
}

export function toggleGroupCollapsed(model, groupId) {
  return updateGroup(model, groupId, (group) => ({
    ...group,
    collapsed: !group.collapsed,
  }));
}

export function setGroupPinned(model, groupId, pinned) {
  return updateGroup(model, groupId, (group) => ({ ...group, pinned: Boolean(pinned) }));
}

export function reorderGroup(model, groupId, toIndex) {
  if (!model.groups.some((group) => group.id === groupId)) {
    throw new TabDomainError(`Unknown group: ${groupId}`, "UNKNOWN_GROUP");
  }
  if (!Number.isInteger(toIndex)) {
    throw new TabDomainError("Group index must be an integer.", "INVALID_INDEX");
  }
  return { ...model, groupOrder: moveItem(model.groupOrder, groupId, toIndex) };
}

export function moveTabToGroup(model, tabId, groupId) {
  if (groupId !== null && !model.groups.some((group) => group.id === groupId)) {
    throw new TabDomainError(`Unknown group: ${groupId}`, "UNKNOWN_GROUP");
  }
  return updateTab(model, tabId, (tab) => ({ ...tab, groupId }));
}

export function removeGroup(model, groupId) {
  if (!model.groups.some((group) => group.id === groupId)) {
    throw new TabDomainError(`Unknown group: ${groupId}`, "UNKNOWN_GROUP");
  }
  const { [groupId]: _removedSearch, ...groupSearches } = model.searches.groups;
  return {
    ...model,
    groups: model.groups.filter((group) => group.id !== groupId),
    groupOrder: model.groupOrder.filter((value) => value !== groupId),
    tabs: model.tabs.map((tab) =>
      tab.groupId === groupId ? { ...tab, groupId: null } : tab,
    ),
    searches: { ...model.searches, groups: groupSearches },
  };
}

export function setTabSearch(model, scope, spec, { groupId } = {}) {
  if (!SEARCH_SCOPES.has(scope)) {
    throw new TabDomainError(`Unknown search scope: ${scope}`, "INVALID_SEARCH_SCOPE");
  }
  const search = normalizeSearch(spec);
  if (scope === "group") {
    if (!model.groups.some((group) => group.id === groupId)) {
      throw new TabDomainError(`Unknown group: ${groupId}`, "UNKNOWN_GROUP");
    }
    return {
      ...model,
      searches: {
        ...model.searches,
        groups: { ...model.searches.groups, [groupId]: search },
      },
    };
  }
  return { ...model, searches: { ...model.searches, [scope]: search } };
}

function tabMatches(tab, matches) {
  const values = new Set([tab.label, tab.title].filter((value) => typeof value === "string"));
  if (values.size === 0) values.add("");
  return [...values].some((value) => matches(value));
}

function searchPredicate(spec) {
  const normalized = normalizeSearch(spec);
  const value = normalized.mode === "regex" ? normalized.pattern || normalized.query : normalized.query;
  if (value === "") return () => true;
  if (normalized.mode === "regex") {
    compileRegex(
      {
        mode: "regex",
        pattern: normalized.pattern || normalized.query,
        flags: normalized.flags,
      },
      { allowRisky: true },
    );
    throw new TabDomainError(
      "User regex searches require deadline-bounded worker evaluation.",
      "REGEX_WORKER_REQUIRED",
    );
  }
  const predicate = createRegexPredicate({
    mode: "plain",
    query: normalized.query,
    flags: normalized.flags,
  });
  return (text) => predicate.test(text);
}

function tabTextValues(tab) {
  const values = [...new Set([tab.label, tab.title].filter((value) => typeof value === "string"))];
  return values.length ? values : [""];
}

async function workerCollectionMatches(spec, values, { evaluator, timeoutMs = 250 } = {}) {
  const normalized = normalizeSearch(spec);
  const source =
    normalized.mode === "regex"
      ? normalized.pattern || normalized.query
      : normalized.query;
  if (source === "") return values.map(() => true);
  if (normalized.mode === "plain") {
    const matches = searchPredicate(normalized);
    return values.map((value) => matches(value));
  }
  const ownedEvaluator = evaluator ? null : new RegexWorkerEvaluator();
  const activeEvaluator = evaluator ?? ownedEvaluator;
  try {
    const request = {
      mode: "regex",
      query: normalized.query,
      pattern: normalized.pattern || normalized.query,
      flags: normalized.flags,
    };
    const result =
      typeof activeEvaluator.testCollection === "function"
        ? await activeEvaluator.testCollection(request, values, { timeoutMs })
        : await activeEvaluator.evaluate(
            { operation: "testCollection", request, values },
            { timeoutMs },
          );
    if (
      !result ||
      !Array.isArray(result.matches) ||
      result.matches.length !== values.length ||
      result.matches.some((value) => typeof value !== "boolean")
    ) {
      throw new TabDomainError(
        "Regex worker returned an invalid collection result.",
        "INVALID_WORKER_RESULT",
      );
    }
    return result.matches;
  } finally {
    ownedEvaluator?.dispose();
  }
}

async function matchingTabIds(tabs, spec, workerOptions) {
  const values = [];
  const ranges = [];
  for (const tab of tabs) {
    const start = values.length;
    values.push(...tabTextValues(tab));
    ranges.push({ tabId: tab.id, start, end: values.length });
  }
  const matches = await workerCollectionMatches(spec, values, workerOptions);
  return new Set(
    ranges
      .filter(({ start, end }) => matches.slice(start, end).some(Boolean))
      .map(({ tabId }) => tabId),
  );
}

function owningGroup(model, tab) {
  return model.groups.find((group) => group.id === tab.groupId) ?? null;
}

function isEffectivelyPinned(model, tab) {
  return tab.pinned || owningGroup(model, tab)?.pinned === true;
}

function tabResult(model, tab, orderIndex) {
  const group = owningGroup(model, tab);
  return {
    type: "tab",
    tabId: tab.id,
    label: tab.label,
    title: tab.title,
    pinned: tab.pinned || group?.pinned === true,
    tabPinned: tab.pinned,
    groupPinned: group?.pinned ?? false,
    unsaved: tab.unsaved,
    orderIndex,
    location: {
      workspaceId: model.workspaceId,
      windowId: model.windowId,
      stripId: model.stripId,
      groupId: group?.id ?? null,
      groupName: group?.name ?? null,
      groupCollapsed: group?.collapsed ?? false,
    },
  };
}

export function searchCurrentStrip(model, spec = model.searches.currentStrip) {
  const matches = searchPredicate(spec);
  return orderedTabs(model)
    .map((tab, index) => ({ tab, result: tabResult(model, tab, index) }))
    .filter(({ tab }) => tabMatches(tab, matches))
    .map(({ result }) => result);
}

export async function searchCurrentStripAsync(
  model,
  spec = model.searches.currentStrip,
  workerOptions,
) {
  const tabs = orderedTabs(model);
  const matching = await matchingTabIds(tabs, spec, workerOptions);
  return tabs
    .map((tab, index) => ({ tab, result: tabResult(model, tab, index) }))
    .filter(({ tab }) => matching.has(tab.id))
    .map(({ result }) => result);
}

export function searchTabsInGroup(model, groupId, spec = model.searches.groups[groupId]) {
  if (!model.groups.some((group) => group.id === groupId)) {
    throw new TabDomainError(`Unknown group: ${groupId}`, "UNKNOWN_GROUP");
  }
  const matches = searchPredicate(spec ?? defaultSearch());
  return orderedTabs(model)
    .map((tab, index) => ({ tab, index }))
    .filter(({ tab }) => tab.groupId === groupId && tabMatches(tab, matches))
    .map(({ tab, index }) => tabResult(model, tab, index));
}

export async function searchTabsInGroupAsync(
  model,
  groupId,
  spec = model.searches.groups[groupId],
  workerOptions,
) {
  if (!model.groups.some((group) => group.id === groupId)) {
    throw new TabDomainError(`Unknown group: ${groupId}`, "UNKNOWN_GROUP");
  }
  const entries = orderedTabs(model)
    .map((tab, index) => ({ tab, index }))
    .filter(({ tab }) => tab.groupId === groupId);
  const matching = await matchingTabIds(
    entries.map(({ tab }) => tab),
    spec ?? defaultSearch(),
    workerOptions,
  );
  return entries
    .filter(({ tab }) => matching.has(tab.id))
    .map(({ tab, index }) => tabResult(model, tab, index));
}

export function searchGroupNames(model, spec = model.searches.groupNames) {
  const matches = searchPredicate(spec);
  const byId = new Map(model.groups.map((group) => [group.id, group]));
  return model.groupOrder
    .map((groupId, index) => ({ group: byId.get(groupId), index }))
    .filter(({ group }) => group && matches(group.name))
    .map(({ group, index }) => ({
      type: "group",
      groupId: group.id,
      name: group.name,
      color: group.color,
      collapsed: group.collapsed,
      pinned: group.pinned,
      orderIndex: index,
      location: {
        workspaceId: model.workspaceId,
        windowId: model.windowId,
        stripId: model.stripId,
      },
    }));
}

export async function searchGroupNamesAsync(
  model,
  spec = model.searches.groupNames,
  workerOptions,
) {
  const byId = new Map(model.groups.map((group) => [group.id, group]));
  const entries = model.groupOrder
    .map((groupId, index) => ({ group: byId.get(groupId), index }))
    .filter(({ group }) => Boolean(group));
  const matches = await workerCollectionMatches(
    spec,
    entries.map(({ group }) => group.name),
    workerOptions,
  );
  return entries
    .filter((_entry, index) => matches[index])
    .map(({ group, index }) => ({
      type: "group",
      groupId: group.id,
      name: group.name,
      color: group.color,
      collapsed: group.collapsed,
      pinned: group.pinned,
      orderIndex: index,
      location: {
        workspaceId: model.workspaceId,
        windowId: model.windowId,
        stripId: model.stripId,
      },
    }));
}

export function searchMasterTabs(models, spec) {
  if (!Array.isArray(models)) {
    throw new TabDomainError("Master search needs an array of tab models.", "INVALID_MODEL");
  }
  const masterSpec = spec ?? models[0]?.searches.master ?? defaultSearch();
  return models.flatMap((model) => searchCurrentStrip(model, masterSpec));
}

export async function searchMasterTabsAsync(models, spec, workerOptions) {
  if (!Array.isArray(models)) {
    throw new TabDomainError("Master search needs an array of tab models.", "INVALID_MODEL");
  }
  const masterSpec = spec ?? models[0]?.searches.master ?? defaultSearch();
  const entries = models.flatMap((model) =>
    orderedTabs(model).map((tab, index) => ({ model, tab, index })),
  );
  const matching = await matchingTabIds(
    entries.map(({ tab, model }) => ({
      ...tab,
      id: `${model.workspaceId}\u0000${model.windowId}\u0000${model.stripId}\u0000${tab.id}`,
    })),
    masterSpec,
    workerOptions,
  );
  return entries
    .filter(({ model, tab }) =>
      matching.has(
        `${model.workspaceId}\u0000${model.windowId}\u0000${model.stripId}\u0000${tab.id}`,
      ),
    )
    .map(({ model, tab, index }) => tabResult(model, tab, index));
}

function closeScopeTabs(model, options) {
  if (options.scope === "group") {
    if (!model.groups.some((group) => group.id === options.groupId)) {
      throw new TabDomainError(`Unknown group: ${options.groupId}`, "UNKNOWN_GROUP");
    }
    return orderedTabs(model).filter((tab) => tab.groupId === options.groupId);
  }
  return orderedTabs(model);
}

function normalizeCloseOptions(options = {}) {
  const operation = options.operation ?? "containing";
  if (!CLOSE_OPERATIONS.has(operation)) {
    throw new TabDomainError(`Unknown close operation: ${operation}`, "INVALID_CLOSE_OPERATION");
  }
  const match = normalizeSearch(options.match ?? options);
  return {
    operation,
    scope: options.scope === "group" ? "group" : "currentStrip",
    groupId: options.groupId ?? null,
    includePinned: options.includePinned === true,
    match,
  };
}

export function previewCloseTabs(model, options = {}) {
  let normalized;
  try {
    normalized = normalizeCloseOptions(options);
    const source = closeQuerySource(normalized);
    if (!source) return closePreviewFailure("EMPTY_QUERY", "A non-empty close query is required.", normalized);
    if (normalized.match.mode === "regex") {
      compileRegex(
        {
          mode: "regex",
          pattern: normalized.match.pattern || normalized.match.query,
          flags: normalized.match.flags,
        },
        { allowRisky: true },
      );
      return closePreviewFailure(
        "REGEX_WORKER_REQUIRED",
        "Regex close previews require deadline-bounded worker evaluation.",
        normalized,
      );
    }
    const positive = searchPredicate(normalized.match);
    return buildClosePreview(model, normalized, (tab) => tabMatches(tab, positive));
  } catch (error) {
    if (error instanceof RegexValidationError || error instanceof TabDomainError) {
      return closePreviewFailure(error.code, error.message, normalized, error.details);
    }
    throw error;
  }
}

function closeQuerySource(normalized) {
  return normalized.match.mode === "regex"
    ? normalized.match.pattern || normalized.match.query
    : normalized.match.query;
}

function closePreviewFailure(code, message, options = null, details = undefined) {
  return {
    ok: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
    affected: [],
    excluded: { pinned: [], unsaved: [] },
    options,
  };
}

function closeStateKey(model, normalized) {
  return JSON.stringify({
    workspaceId: model.workspaceId,
    windowId: model.windowId,
    stripId: model.stripId,
    activeTabId: model.activeTabId,
    tabs: closeScopeTabs(model, normalized).map((tab) => {
      const group = owningGroup(model, tab);
      return {
        id: tab.id,
        label: tab.label,
        title: tab.title,
        tabPinned: tab.pinned,
        unsaved: tab.unsaved,
        groupId: tab.groupId,
        groupPinned: group?.pinned ?? false,
      };
    }),
  });
}

function composePreviewKey(stateKey, normalized, affected, pinned, unsaved) {
  return JSON.stringify({
    stateKey,
    options: normalized,
    affected: affected.map((result) => result.tabId),
    pinned: pinned.map((result) => result.tabId),
    unsaved: unsaved.map((result) => result.tabId),
  });
}

function buildClosePreview(model, normalized, positiveMatch) {
  const matches = (tab) =>
    normalized.operation === "containing" ? positiveMatch(tab) : !positiveMatch(tab);
  const candidates = closeScopeTabs(model, normalized).filter(matches);
  const pinnedTabs = candidates.filter(
    (tab) => isEffectivelyPinned(model, tab) && !normalized.includePinned,
  );
  const afterPinned = candidates.filter(
    (tab) => normalized.includePinned || !isEffectivelyPinned(model, tab),
  );
  const unsavedTabs = afterPinned.filter((tab) => tab.unsaved);
  const affectedTabs = afterPinned.filter((tab) => !tab.unsaved);
  const displayIndex = new Map(orderedTabIds(model).map((tabId, index) => [tabId, index]));
  const affected = affectedTabs.map((tab) => tabResult(model, tab, displayIndex.get(tab.id)));
  const pinned = pinnedTabs.map((tab) => tabResult(model, tab, displayIndex.get(tab.id)));
  const unsaved = unsavedTabs.map((tab) => tabResult(model, tab, displayIndex.get(tab.id)));
  const stateKey = closeStateKey(model, normalized);
  return {
    ok: true,
    operation: normalized.operation,
    mode: normalized.match.mode,
    candidateCount: candidates.length,
    affectedCount: affected.length,
    affected,
    excluded: { pinned, unsaved },
    options: normalized,
    stateKey,
    previewKey: composePreviewKey(stateKey, normalized, affected, pinned, unsaved),
  };
}

export async function previewCloseTabsAsync(model, options = {}, workerOptions) {
  let normalized;
  try {
    normalized = normalizeCloseOptions(options);
    const source = closeQuerySource(normalized);
    if (!source) return closePreviewFailure("EMPTY_QUERY", "A non-empty close query is required.", normalized);
    if (normalized.match.mode === "plain") return previewCloseTabs(model, normalized);
    const scopedTabs = closeScopeTabs(model, normalized);
    const matching = await matchingTabIds(scopedTabs, normalized.match, workerOptions);
    return buildClosePreview(model, normalized, (tab) => matching.has(tab.id));
  } catch (error) {
    return closePreviewFailure(
      error?.code ?? "REGEX_WORKER_ERROR",
      error?.message ?? String(error),
      normalized ?? null,
      error?.details,
    );
  }
}

export function executeClosePreview(model, preview) {
  if (!preview?.ok) {
    return {
      ok: false,
      error: preview?.error ?? { code: "INVALID_PREVIEW", message: "A valid preview is required." },
      model,
      closedIds: [],
    };
  }
  let currentStateKey;
  try {
    currentStateKey = closeStateKey(model, preview.options);
  } catch {
    currentStateKey = null;
  }
  const suppliedKey = composePreviewKey(
    preview.stateKey,
    preview.options,
    preview.affected ?? [],
    preview.excluded?.pinned ?? [],
    preview.excluded?.unsaved ?? [],
  );
  if (
    currentStateKey !== preview.stateKey ||
    suppliedKey !== preview.previewKey
  ) {
    return {
      ok: false,
      error: { code: "STALE_PREVIEW", message: "Tab state changed after the close preview." },
      model,
      closedIds: [],
    };
  }
  const closedIds = [...new Set(preview.affected.map((result) => result.tabId))];
  const scopedIds = new Set(closeScopeTabs(model, preview.options).map((tab) => tab.id));
  if (closedIds.some((tabId) => !scopedIds.has(tabId))) {
    return {
      ok: false,
      error: { code: "INVALID_PREVIEW", message: "Close preview contains an out-of-scope tab." },
      model,
      closedIds: [],
    };
  }
  const closed = new Set(closedIds);
  const tabOrder = model.tabOrder.filter((tabId) => !closed.has(tabId));
  const next = {
    ...model,
    tabs: model.tabs.filter((tab) => !closed.has(tab.id)),
    tabOrder,
    pinnedOrder: model.pinnedOrder.filter((tabId) => !closed.has(tabId)),
    activeTabId: model.activeTabId,
  };
  if (closed.has(model.activeTabId)) next.activeTabId = orderedTabIds(next)[0] ?? null;
  return {
    ok: true,
    model: next,
    closedIds,
    excluded: preview.excluded,
  };
}

export function executeCloseTabs(model, options) {
  return executeClosePreview(model, previewCloseTabs(model, options));
}

export async function executeCloseTabsAsync(model, options, workerOptions) {
  return executeClosePreview(
    model,
    await previewCloseTabsAsync(model, options, workerOptions),
  );
}
