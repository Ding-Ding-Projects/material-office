import { createHash } from 'node:crypto';
import { AppError, ValidationError } from './errors.js';
import {
  requireBoolean,
  requireExactHistoryRevision,
  requireInteger,
  requirePlainObject,
  requireString
} from './validation.js';

export const HISTORY_LABEL_MAX_CHARACTERS = 120;
export const HISTORY_LABEL_MAX_BYTES = 240;
export const HISTORY_DIFF_MAX_CHANGES = 128;
export const HISTORY_DIFF_MAX_PATH_CHARACTERS = 200;
export const HISTORY_DIFF_MAX_PATH_BYTES = 240;
export const HISTORY_DIFF_MAX_PREVIEW_CHARACTERS = 240;
export const HISTORY_DIFF_MAX_PREVIEW_BYTES = 480;
export const HISTORY_DIFF_MAX_OUTPUT_BYTES = 128 * 1024;

const MAX_PROJECTED_ENTRIES = 20_000;
const MAX_PROJECTED_COLLECTION_ITEMS = 10_000;
const SAFE_MAIN_SETTINGS = Object.freeze([
  'languageMode',
  'funnyLevelEnglish',
  'funnyLevelCantonese',
  'theme',
  'density',
  'accentColor',
  'fontFamily',
  'fontSizeScale',
  'fontWeight',
  'dimSumSurpriseEnabled',
  'reducedMotion',
  'narratorEnabled',
  'preferredEditorId'
]);
const SAFE_WORKSPACE_PREFERENCES = Object.freeze([
  'theme',
  'density',
  'accent',
  'fontFamily',
  'fontScale',
  'fontWeight',
  'language',
  'dimSumSurprise',
  'reducedMotion',
  'scale',
  'statusBar',
  'propertiesPanel',
  'historyEnabled',
  'historyRetention',
  'firstRunComplete',
  'writerView'
]);
const LOGICAL_PATH = /^[A-Za-z0-9_.:#\[\]-]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const HTML_TAG = /<[^>]*>/g;
const ABSOLUTE_PATH_PATTERNS = Object.freeze([
  /(?:^|[\s("'])(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>]*/gu,
  /\bfile:\/\/[^\s"'<>]*/giu,
  /(?:^|[\s("'])\/(?:[^/\s"'<>]+\/)+[^\s"'<>]*/gu
]);

function exactObject(value, fields, label) {
  const object = requirePlainObject(value, label);
  const keys = Object.keys(object).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new AppError('HISTORY_RESPONSE_INVALID', `${label} has an unsupported shape.`);
  }
  return object;
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function truncateUtf8(value, maxCharacters, maxBytes) {
  const source = String(value);
  if (source.length <= maxCharacters && byteLength(source) <= maxBytes) {
    return { text: source, truncated: false };
  }
  const suffix = '…';
  const byteBudget = Math.max(0, maxBytes - byteLength(suffix));
  const characterBudget = Math.max(0, maxCharacters - suffix.length);
  let bytes = 0;
  let characters = 0;
  let output = '';
  for (const character of source) {
    const nextBytes = byteLength(character);
    if (bytes + nextBytes > byteBudget || characters + character.length > characterBudget) break;
    output += character;
    bytes += nextBytes;
    characters += character.length;
  }
  return { text: `${output}${suffix}`, truncated: true };
}

function redactedText(value) {
  let text = String(value)
    .replace(HTML_TAG, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  for (const pattern of ABSOLUTE_PATH_PATTERNS) {
    text = text.replace(pattern, (match) => {
      const leading = /^[\s("']/.test(match) ? match[0] : '';
      return `${leading}[path redacted]`;
    });
  }
  return text;
}

function containsAbsolutePath(value) {
  return ABSOLUTE_PATH_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function requireHistoryLabel(value) {
  const label = requireString(value, 'history label', {
    maxLength: HISTORY_LABEL_MAX_CHARACTERS
  });
  if (CONTROL_CHARACTERS.test(label) || byteLength(label) > HISTORY_LABEL_MAX_BYTES) {
    throw new ValidationError('history label must be one line and at most 240 UTF-8 bytes.');
  }
  if (containsAbsolutePath(label)) {
    throw new ValidationError('history label must not contain an absolute file path.');
  }
  return label;
}

function digest(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    throw new AppError('SNAPSHOT_INVALID', 'The selected history snapshot cannot be summarized safely.', {
      cause: error
    });
  }
  if (serialized === undefined) serialized = 'null';
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

function scalarPreview(value) {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'Unsupported number';
  if (typeof value === 'string') return redactedText(value) || 'Empty text';
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === 'object') return `${Object.keys(value).length} fields`;
  return 'Unsupported value';
}

function boundedPreview(value) {
  return truncateUtf8(
    scalarPreview(value),
    HISTORY_DIFF_MAX_PREVIEW_CHARACTERS,
    HISTORY_DIFF_MAX_PREVIEW_BYTES
  );
}

function safePathSegment(value, fallback) {
  const source = String(value ?? '');
  const fallbackSegment = String(fallback ?? 'item').replace(/[^A-Za-z0-9_-]+/gu, '-').slice(0, 32) || 'item';
  if (CONTROL_CHARACTERS.test(source) || containsAbsolutePath(source)) {
    return `${fallbackSegment}-redacted`;
  }
  const normalized = source
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const base = normalized || fallbackSegment;
  const suffix = createHash('sha256').update(source || fallbackSegment, 'utf8').digest('hex').slice(0, 8);
  return `${base}-${suffix}`;
}

function safeString(value, fallback = '') {
  return typeof value === 'string' ? redactedText(value) : fallback;
}

function collectionEntries(value) {
  if (Array.isArray(value)) return value.map((entry, index) => [String(index), entry]);
  if (value && typeof value === 'object') return Object.entries(value);
  return [];
}

function collectionCount(value) {
  return collectionEntries(value).length;
}

function publicMainDocument(document) {
  const exports = Array.isArray(document?.exports) ? document.exports : [];
  return {
    id: typeof document?.id === 'string' ? document.id : null,
    title: safeString(document?.title, 'Untitled document'),
    kind: safeString(document?.kind, 'unknown'),
    format: typeof document?.format === 'string' ? safeString(document.format) : null,
    createdAt: typeof document?.createdAt === 'string' ? document.createdAt : null,
    updatedAt: typeof document?.updatedAt === 'string' ? document.updatedAt : null,
    lastOpenedAt: typeof document?.lastOpenedAt === 'string' ? document.lastOpenedAt : null,
    contentState: typeof document?.contentState === 'string' ? safeString(document.contentState) : null,
    nativeFileAvailable: typeof document?.filePath === 'string' && document.filePath.length > 0,
    exports: exports.slice(0, 100).map((entry) => ({
      targetFormat: typeof entry?.targetFormat === 'string' ? safeString(entry.targetFormat) : null,
      exportedAt: typeof entry?.exportedAt === 'string' ? entry.exportedAt : null
    }))
  };
}

function mainDocumentPreview(document) {
  const title = safeString(document?.title, 'Untitled document');
  const kind = safeString(document?.kind, 'unknown document');
  const format = typeof document?.format === 'string' ? ` · ${safeString(document.format)}` : '';
  const native = typeof document?.filePath === 'string' && document.filePath.length > 0
    ? 'native file available'
    : 'no native file';
  const exports = Array.isArray(document?.exports) ? document.exports.length : 0;
  return `${kind} “${title}”${format} · ${native} · ${exports} exports`;
}

function publicRecentItem(item) {
  return {
    id: typeof item?.id === 'string' ? item.id : null,
    title: safeString(item?.title, 'Untitled recent item'),
    format: typeof item?.format === 'string' ? safeString(item.format) : null,
    openedAt: typeof item?.openedAt === 'string' ? item.openedAt : null,
    nativeFileAvailable: typeof item?.filePath === 'string' && item.filePath.length > 0
  };
}

function publicNotification(notification) {
  return {
    id: typeof notification?.id === 'string' ? notification.id : null,
    level: typeof notification?.level === 'string' ? safeString(notification.level) : null,
    title: typeof notification?.title === 'string' ? safeString(notification.title) : null,
    createdAt: typeof notification?.createdAt === 'string' ? notification.createdAt : null,
    dismissedAt: typeof notification?.dismissedAt === 'string' ? notification.dismissedAt : null
  };
}

function workspaceContentSummary(document) {
  const content = document?.content;
  const type = safeString(document?.type ?? document?.kind, 'document');
  if (type === 'writer' && typeof content?.html === 'string') {
    const plainText = redactedText(content.html);
    const preview = truncateUtf8(plainText, 96, 192);
    return `writer content · ${plainText.length} characters${plainText ? ` · “${preview.text}”` : ''}`;
  }
  if (type === 'calc' && Array.isArray(content?.sheets)) {
    const cells = content.sheets.reduce((count, sheet) => (
      count + (sheet?.cells && typeof sheet.cells === 'object' ? Object.keys(sheet.cells).length : 0)
    ), 0);
    return `spreadsheet content · ${content.sheets.length} sheets · ${cells} populated cells`;
  }
  if (type === 'impress' && Array.isArray(content?.slides)) {
    return `presentation content · ${content.slides.length} slides`;
  }
  if (type === 'draw' && Array.isArray(content?.shapes)) {
    return `drawing content · ${content.shapes.length} shapes`;
  }
  if (type === 'base' && Array.isArray(content?.rows)) {
    return `database content · ${content.rows.length} rows`;
  }
  if (type === 'math' && typeof content?.formula === 'string') {
    return `formula content · “${truncateUtf8(redactedText(content.formula), 96, 192).text}”`;
  }
  if (content && typeof content === 'object') return `${type} content · ${Object.keys(content).length} sections`;
  return `${type} content · no structured content`;
}

function publicWorkspaceDocument(document) {
  return {
    id: typeof document?.id === 'string' ? document.id : null,
    type: safeString(document?.type ?? document?.kind, 'document'),
    title: safeString(document?.title, 'Untitled document'),
    createdAt: typeof document?.createdAt === 'string' ? document.createdAt : null,
    updatedAt: typeof document?.updatedAt === 'string' ? document.updatedAt : null,
    nativeFileAvailable: document?.nativeFileAvailable === true,
    unsaved: document?.unsaved === true,
    content: document?.content ?? null,
    savedContent: Object.hasOwn(document ?? {}, 'savedContent') ? document.savedContent : null
  };
}

function workspaceDocumentPreview(document) {
  const title = safeString(document?.title, 'Untitled document');
  const saveState = document?.unsaved === true ? 'unsaved changes' : 'saved';
  return `${safeString(document?.type ?? document?.kind, 'document')} “${title}” · ${saveState} · ${workspaceContentSummary(document)}`;
}

function publicWorkspaceTab(tab) {
  return {
    id: typeof tab?.id === 'string' ? tab.id : null,
    label: safeString(tab?.label ?? tab?.title, 'Untitled tab'),
    surface: typeof tab?.surface === 'string' ? safeString(tab.surface) : null,
    pinned: tab?.pinned === true,
    groupId: typeof tab?.groupId === 'string' ? tab.groupId : null,
    unsaved: tab?.unsaved === true
  };
}

function workspaceTabPreview(tab) {
  const label = safeString(tab?.label ?? tab?.title, 'Untitled tab');
  const surface = typeof tab?.surface === 'string' ? ` · ${safeString(tab.surface)}` : '';
  const pinned = tab?.pinned === true ? 'pinned' : 'not pinned';
  const group = typeof tab?.groupId === 'string' ? ` · group ${safeString(tab.groupId)}` : '';
  const unsaved = tab?.unsaved === true ? 'unsaved changes' : 'clean';
  return `Tab “${label}”${surface} · ${pinned}${group} · ${unsaved}`;
}

function publicWorkspaceGroup(group) {
  return {
    id: typeof group?.id === 'string' ? group.id : null,
    name: safeString(group?.name ?? group?.label, 'Untitled group'),
    collapsed: group?.collapsed === true,
    pinned: group?.pinned === true,
    color: typeof group?.color === 'string' && /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(group.color)
      ? group.color.toLowerCase()
      : null
  };
}

function publicWorkspaceRecord(record, fallbackId) {
  return {
    id: typeof record?.id === 'string' ? record.id : fallbackId,
    title: typeof record?.title === 'string'
      ? safeString(record.title)
      : (typeof record?.name === 'string' ? safeString(record.name) : null),
    type: typeof record?.type === 'string'
      ? safeString(record.type)
      : (typeof record?.kind === 'string' ? safeString(record.kind) : null),
    status: typeof record?.status === 'string' ? safeString(record.status) : null,
    createdAt: typeof record?.createdAt === 'string' ? record.createdAt : null,
    updatedAt: typeof record?.updatedAt === 'string' ? record.updatedAt : null
  };
}

function workspaceRecordPreview(record, fallbackId) {
  const title = typeof record?.title === 'string'
    ? safeString(record.title)
    : (typeof record?.name === 'string' ? safeString(record.name) : 'Untitled record');
  const type = typeof record?.type === 'string'
    ? safeString(record.type)
    : (typeof record?.kind === 'string' ? safeString(record.kind) : 'record');
  const status = typeof record?.status === 'string' ? ` · ${safeString(record.status)}` : '';
  return `${type} “${title || safeString(fallbackId, 'Untitled record')}”${status}`;
}

class ProjectionBuilder {
  constructor() {
    this.entries = new Map();
    this.truncated = false;
  }

  add(path, comparisonValue, previewValue) {
    if (this.entries.size >= MAX_PROJECTED_ENTRIES) {
      this.truncated = true;
      return;
    }
    const boundedPath = truncateUtf8(
      path,
      HISTORY_DIFF_MAX_PATH_CHARACTERS,
      HISTORY_DIFF_MAX_PATH_BYTES
    );
    const safePath = boundedPath.text.replace(/[^A-Za-z0-9_.:#\[\]-]+/gu, '-');
    const preview = boundedPreview(previewValue);
    this.entries.set(safePath, {
      compare: digest(comparisonValue),
      preview: preview.text,
      previewTruncated: preview.truncated
    });
    if (boundedPath.truncated) this.truncated = true;
  }

  addCollection(path, value, project, preview) {
    const entries = collectionEntries(value);
    this.add(`${path}.count`, entries.length, `${entries.length} items`);
    if (entries.length > MAX_PROJECTED_COLLECTION_ITEMS) this.truncated = true;
    for (const [index, [fallbackId, entry]] of entries.slice(0, MAX_PROJECTED_COLLECTION_ITEMS).entries()) {
      if (!entry || typeof entry !== 'object') continue;
      const id = typeof entry.id === 'string' ? entry.id : fallbackId;
      let segment = safePathSegment(id, `item-${index + 1}`);
      if (this.entries.has(`${path}.${segment}`)) segment = `${segment}-${index + 1}`;
      this.add(
        `${path}.${segment}`,
        project(entry, fallbackId),
        preview(entry, fallbackId)
      );
    }
  }
}

export function projectHistoryState(state) {
  const input = requirePlainObject(state, 'application history state');
  const projection = new ProjectionBuilder();
  projection.add('state.schemaVersion', input.schemaVersion ?? null, input.schemaVersion ?? null);

  const settings = input.settings && typeof input.settings === 'object' ? input.settings : {};
  for (const key of SAFE_MAIN_SETTINGS) {
    if (Object.hasOwn(settings, key)) {
      projection.add(`settings.${key}`, settings[key], settings[key]);
    }
  }

  const records = input.records && typeof input.records === 'object' ? input.records : {};
  projection.addCollection(
    'records.documents',
    records.documents,
    (document) => publicMainDocument(document),
    (document) => mainDocumentPreview(document)
  );
  projection.addCollection(
    'records.recentItems',
    records.recentItems,
    (item) => publicRecentItem(item),
    (item) => `Recent item “${safeString(item?.title, 'Untitled')}” · ${safeString(item?.format, 'unknown format')}`
  );
  projection.addCollection(
    'records.notifications',
    records.notifications,
    (notification) => publicNotification(notification),
    (notification) => `${safeString(notification?.level, 'notification')} · ${safeString(notification?.title, 'Untitled notification')}`
  );

  const workspace = records.workspace;
  projection.add('workspace.present', workspace !== null && workspace !== undefined, workspace ? 'Available' : 'None');
  if (!workspace || typeof workspace !== 'object') {
    return projection;
  }

  projection.add('workspace.schemaVersion', workspace.schemaVersion ?? null, workspace.schemaVersion ?? null);
  const preferences = workspace.preferences && typeof workspace.preferences === 'object'
    ? workspace.preferences
    : {};
  for (const key of SAFE_WORKSPACE_PREFERENCES) {
    if (Object.hasOwn(preferences, key) && (preferences[key] === null || typeof preferences[key] !== 'object')) {
      projection.add(`workspace.preferences.${key}`, preferences[key], preferences[key]);
    }
  }
  for (const [path, value] of [
    ['workspace.preferences.funny.en', preferences.funny?.en],
    ['workspace.preferences.funny.yue', preferences.funny?.yue],
    ['workspace.preferences.narrator.enabled', preferences.narrator?.enabled],
    ['workspace.preferences.narrator.language', preferences.narrator?.language],
    ['workspace.preferences.appearance.theme', preferences.appearance?.theme],
    ['workspace.preferences.appearance.density', preferences.appearance?.density],
    ['workspace.preferences.appearance.accent', preferences.appearance?.accent],
    ['workspace.preferences.language.mode', preferences.language?.mode],
    ['workspace.preferences.language.funnyLevels.en', preferences.language?.funnyLevels?.en],
    ['workspace.preferences.language.funnyLevels.yue', preferences.language?.funnyLevels?.yue],
    ['workspace.preferences.dimSumSurprise.enabled', preferences.dimSumSurprise?.enabled]
  ]) {
    if (value !== undefined && (value === null || typeof value !== 'object')) {
      projection.add(path, value, value);
    }
  }

  const tabs = workspace.tabs && typeof workspace.tabs === 'object' ? workspace.tabs : {};
  if (typeof tabs.activeId === 'string') projection.add('workspace.tabs.activeId', tabs.activeId, tabs.activeId);
  if (typeof tabs.activeTabId === 'string') {
    projection.add('workspace.tabs.activeTabId', tabs.activeTabId, tabs.activeTabId);
  }
  projection.addCollection(
    'workspace.tabs.items',
    Array.isArray(tabs.items) ? tabs.items : tabs.tabs,
    (tab) => publicWorkspaceTab(tab),
    (tab) => workspaceTabPreview(tab)
  );
  projection.addCollection(
    'workspace.tabs.groups',
    tabs.groups,
    (group) => publicWorkspaceGroup(group),
    (group) => `Group “${safeString(group?.name ?? group?.label, 'Untitled group')}” · ${group?.collapsed === true ? 'collapsed' : 'expanded'}`
  );

  projection.addCollection(
    'workspace.documents',
    workspace.documents,
    (document) => publicWorkspaceDocument(document),
    (document) => workspaceDocumentPreview(document)
  );
  projection.addCollection(
    'workspace.records',
    workspace.records,
    (record, fallbackId) => publicWorkspaceRecord(record, fallbackId),
    (record, fallbackId) => workspaceRecordPreview(record, fallbackId)
  );

  const workspaceNotifications = Array.isArray(workspace.notifications) ? workspace.notifications : [];
  projection.add(
    'workspace.notifications',
    workspaceNotifications.map((notification) => ({
      id: typeof notification?.id === 'string' ? notification.id : null,
      type: typeof notification?.type === 'string' ? notification.type : null,
      title: typeof notification?.title === 'string' ? redactedText(notification.title) : null,
      persistent: notification?.persistent === true
    })),
    `${workspaceNotifications.length} saved notifications`
  );
  for (const [path, value, noun] of [
    ['workspace.appearance', workspace.appearance, 'appearance overrides'],
    ['workspace.appearancePresets', workspace.appearancePresets, 'appearance presets']
  ]) {
    if (value && typeof value === 'object') {
      projection.add(path, value, `${collectionCount(value)} ${noun}`);
    }
  }

  return projection;
}

function publicChange(path, kind, before, after) {
  return {
    path,
    kind,
    oldPreview: before?.preview ?? null,
    newPreview: after?.preview ?? null,
    previewTruncated: before?.previewTruncated === true || after?.previewTruncated === true
  };
}

export function createPublicHistoryDiff(input) {
  const revision = requireExactHistoryRevision(input?.revision);
  const currentRevision = requireExactHistoryRevision(input?.currentRevision);
  const before = projectHistoryState(input?.previousState);
  const after = projectHistoryState(input?.currentState);
  const paths = [...new Set([...before.entries.keys(), ...after.entries.keys()])].sort();
  const counts = { added: 0, removed: 0, modified: 0, total: 0 };
  const changes = [];
  for (const path of paths) {
    const previous = before.entries.get(path);
    const current = after.entries.get(path);
    let kind = null;
    if (!previous) kind = 'added';
    else if (!current) kind = 'removed';
    else if (previous.compare !== current.compare) kind = 'modified';
    if (!kind) continue;
    counts[kind] += 1;
    counts.total += 1;
    if (changes.length < HISTORY_DIFF_MAX_CHANGES) {
      changes.push(publicChange(path, kind, previous, current));
    }
  }
  let truncated = before.truncated || after.truncated || counts.total > changes.length;
  const result = {
    revision,
    currentRevision,
    unchanged: counts.total === 0 && !before.truncated && !after.truncated,
    counts,
    truncated,
    changes
  };
  while (byteLength(JSON.stringify(result)) > HISTORY_DIFF_MAX_OUTPUT_BYTES && result.changes.length > 0) {
    result.changes.pop();
    truncated = true;
    result.truncated = true;
  }
  if (byteLength(JSON.stringify(result)) > HISTORY_DIFF_MAX_OUTPUT_BYTES) {
    throw new AppError('HISTORY_DIFF_TOO_LARGE', 'The history comparison could not be bounded safely.');
  }
  return result;
}

function requireNullablePreview(value, label) {
  if (value === null) return null;
  const preview = requireString(value, label, {
    minLength: 0,
    maxLength: HISTORY_DIFF_MAX_PREVIEW_CHARACTERS
  });
  if (
    CONTROL_CHARACTERS.test(preview) ||
    byteLength(preview) > HISTORY_DIFF_MAX_PREVIEW_BYTES ||
    containsAbsolutePath(preview)
  ) {
    throw new AppError('HISTORY_RESPONSE_INVALID', `${label} is not a safe bounded preview.`);
  }
  return preview;
}

export function publicHistoryDiffEnvelope(value, expectedRevision) {
  const result = exactObject(
    value,
    ['revision', 'currentRevision', 'unchanged', 'counts', 'truncated', 'changes'],
    'history diff result'
  );
  const revision = requireExactHistoryRevision(result.revision);
  if (revision !== requireExactHistoryRevision(expectedRevision)) {
    throw new AppError('HISTORY_RESPONSE_INVALID', 'The history comparison returned the wrong revision.');
  }
  const currentRevision = requireExactHistoryRevision(result.currentRevision);
  const countSource = exactObject(
    result.counts,
    ['added', 'removed', 'modified', 'total'],
    'history diff counts'
  );
  const counts = {
    added: requireInteger(countSource.added, 'added history change count', { min: 0, max: 40_000 }),
    removed: requireInteger(countSource.removed, 'removed history change count', { min: 0, max: 40_000 }),
    modified: requireInteger(countSource.modified, 'modified history change count', { min: 0, max: 40_000 }),
    total: requireInteger(countSource.total, 'total history change count', { min: 0, max: 40_000 })
  };
  if (counts.total !== counts.added + counts.removed + counts.modified) {
    throw new AppError('HISTORY_RESPONSE_INVALID', 'The history comparison returned inconsistent counts.');
  }
  if (!Array.isArray(result.changes) || result.changes.length > HISTORY_DIFF_MAX_CHANGES) {
    throw new AppError('HISTORY_RESPONSE_INVALID', 'The history comparison returned too many changes.');
  }
  const seenPaths = new Set();
  const changes = result.changes.map((entry, index) => {
    const change = exactObject(
      entry,
      ['path', 'kind', 'oldPreview', 'newPreview', 'previewTruncated'],
      `history diff change ${index + 1}`
    );
    const path = requireString(change.path, 'history diff path', {
      maxLength: HISTORY_DIFF_MAX_PATH_CHARACTERS,
      pattern: LOGICAL_PATH
    });
    if (byteLength(path) > HISTORY_DIFF_MAX_PATH_BYTES || seenPaths.has(path)) {
      throw new AppError('HISTORY_RESPONSE_INVALID', 'The history comparison returned an invalid path.');
    }
    seenPaths.add(path);
    const kind = requireString(change.kind, 'history diff change kind', {
      maxLength: 8,
      pattern: /^(?:added|removed|modified)$/
    });
    return {
      path,
      kind,
      oldPreview: requireNullablePreview(change.oldPreview, 'old history preview'),
      newPreview: requireNullablePreview(change.newPreview, 'new history preview'),
      previewTruncated: requireBoolean(change.previewTruncated, 'history preview truncation state')
    };
  });
  const truncated = requireBoolean(result.truncated, 'history diff truncation state');
  const unchanged = requireBoolean(result.unchanged, 'history unchanged state');
  if (changes.length > counts.total || (unchanged && (counts.total !== 0 || truncated))) {
    throw new AppError('HISTORY_RESPONSE_INVALID', 'The history comparison returned an inconsistent state.');
  }
  const envelope = { revision, currentRevision, unchanged, counts, truncated, changes };
  if (byteLength(JSON.stringify(envelope)) > HISTORY_DIFF_MAX_OUTPUT_BYTES) {
    throw new AppError('HISTORY_RESPONSE_INVALID', 'The history comparison exceeded its public byte limit.');
  }
  return envelope;
}

export function publicHistoryLabelEnvelope(value, expectedRevision, expectedLabel) {
  const result = exactObject(value, ['revision', 'label', 'updatedAt'], 'history label result');
  const revision = requireExactHistoryRevision(result.revision);
  if (revision !== requireExactHistoryRevision(expectedRevision)) {
    throw new AppError('HISTORY_RESPONSE_INVALID', 'The history label result returned the wrong revision.');
  }
  const label = requireHistoryLabel(result.label);
  if (label !== requireHistoryLabel(expectedLabel)) {
    throw new AppError('HISTORY_RESPONSE_INVALID', 'The history label result returned the wrong label.');
  }
  const updatedAt = requireString(result.updatedAt, 'history label timestamp', {
    maxLength: 40,
    pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
  });
  if (Number.isNaN(Date.parse(updatedAt))) {
    throw new AppError('HISTORY_RESPONSE_INVALID', 'The history label result has an invalid timestamp.');
  }
  return { revision, label, updatedAt };
}
