import path from 'node:path';
import { ValidationError } from './errors.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SETTINGS_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const PROTECTED_SETTINGS = new Set(['customEditors', 'libreOfficeExecutableOverride']);
const RECORD_DOCUMENT_KINDS = /^(?:writer|calc|impress|draw|math|base)$/;
const RECORD_DOCUMENT_EXTENSIONS = new Set([
  '.odt', '.ott', '.ods', '.ots', '.odp', '.otp', '.odg', '.otg', '.odf', '.odb', '.odm',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.rtf', '.txt', '.csv', '.html', '.htm',
  '.pdf', '.svg'
]);
const NOTIFICATION_LEVELS = /^(?:info|success|warning|error|progress)$/;

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function requirePlainObject(value, label = 'value') {
  if (!isPlainObject(value)) {
    throw new ValidationError(`${label} must be an object.`);
  }
  return value;
}

export function requireString(value, label, options = {}) {
  const { minLength = 1, maxLength = 512, pattern } = options;
  if (typeof value !== 'string') {
    throw new ValidationError(`${label} must be text.`);
  }

  const normalized = value.trim();
  if (normalized.length < minLength || normalized.length > maxLength) {
    throw new ValidationError(`${label} must contain ${minLength}-${maxLength} characters.`);
  }
  if (normalized.includes('\0')) {
    throw new ValidationError(`${label} contains an invalid character.`);
  }
  if (pattern && !pattern.test(normalized)) {
    throw new ValidationError(`${label} has an unsupported value.`);
  }
  return normalized;
}

export function requireBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${label} must be true or false.`);
  }
  return value;
}

export function requireInteger(value, label, options = {}) {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = options;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

export function requireAbsolutePath(value, label = 'path') {
  const candidate = requireString(value, label, { maxLength: 32_767 });
  if (!path.isAbsolute(candidate)) {
    throw new ValidationError(`${label} must be an absolute path.`);
  }
  return path.normalize(candidate);
}

export function requireIdentifier(value, label = 'identifier') {
  return requireString(value, label, {
    maxLength: 128,
    pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
  });
}

export function requireRevision(value) {
  return requireString(value, 'revision', {
    minLength: 7,
    maxLength: 64,
    pattern: /^[a-fA-F0-9]+$/
  }).toLowerCase();
}

export function requireExactHistoryRevision(value) {
  const revision = requireString(value, 'revision', {
    minLength: 40,
    maxLength: 64,
    pattern: /^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/
  });
  if (revision !== value) {
    throw new ValidationError('revision must be an exact full object ID.');
  }
  return revision.toLowerCase();
}

export function requireWorkspaceRevision(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  ) {
    throw new ValidationError('expectedRevision must be an exact workspace revision token.');
  }
  return value;
}

export function validateJsonValue(value, options = {}, context) {
  const { maxDepth = 8, maxNodes = 2_000, maxStringLength = 16_384 } = options;
  const state = context ?? { depth: 0, counter: { nodes: 0 } };
  state.counter.nodes += 1;
  if (state.counter.nodes > maxNodes || state.depth > maxDepth) {
    throw new ValidationError('The supplied data is too complex.');
  }

  if (value === null || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ValidationError('Numbers must be finite.');
    }
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > maxStringLength || value.includes('\0')) {
      throw new ValidationError('A text value is too long or contains an invalid character.');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => validateJsonValue(entry, options, {
      depth: state.depth + 1,
      counter: state.counter
    }));
  }
  if (!isPlainObject(value)) {
    throw new ValidationError('Only JSON-compatible data is supported.');
  }

  const result = Object.create(null);
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key) || key.length > 128 || key.includes('\0')) {
      throw new ValidationError('An object key is not allowed.');
    }
    result[key] = validateJsonValue(entry, options, {
      depth: state.depth + 1,
      counter: state.counter
    });
  }
  return result;
}

function validateKnownSetting(key, value) {
  switch (key) {
    case 'languageMode':
      return requireString(value, key, { pattern: /^(?:en|yue|bilingual)$/ });
    case 'funnyLevelEnglish':
    case 'funnyLevelCantonese':
      return requireInteger(value, key, { min: 1, max: 5 });
    case 'theme':
      return requireString(value, key, { pattern: /^(?:light|dark|system)$/ });
    case 'density':
      return requireString(value, key, { pattern: /^(?:compact|comfortable)$/ });
    case 'accentColor':
      return requireString(value, key, { pattern: /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/ });
    case 'fontFamily':
      return requireString(value, key, { maxLength: 128 });
    case 'fontSizeScale':
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 2) {
        throw new ValidationError(`${key} must be a number from 1 to 2.`);
      }
      return value;
    case 'fontWeight':
      return requireInteger(value, key, { min: 100, max: 900 });
    case 'dimSumSurpriseEnabled':
    case 'reducedMotion':
    case 'narratorEnabled':
      return requireBoolean(value, key);
    case 'preferredEditorId':
      return value === null ? null : requireIdentifier(value, key);
    case 'libreOfficeExecutableOverride': {
      if (value === null) return null;
      const executable = requireAbsolutePath(value, key);
      if (!/^(?:soffice\.exe|soffice\.com)$/i.test(path.basename(executable))) {
        throw new ValidationError(`${key} must select soffice.exe or soffice.com.`);
      }
      return executable;
    }
    default:
      return validateJsonValue(value);
  }
}

export function validateSettingsPatch(value, options = {}) {
  const input = requirePlainObject(value, 'settings patch');
  const entries = Object.entries(input);
  if (entries.length === 0 || entries.length > 64) {
    throw new ValidationError('A settings patch must contain 1-64 entries.');
  }

  const result = Object.create(null);
  for (const [key, entry] of entries) {
    if (!SETTINGS_KEY.test(key) || FORBIDDEN_KEYS.has(key)) {
      throw new ValidationError('A settings key is not allowed.');
    }
    if (PROTECTED_SETTINGS.has(key) && options.allowProtected !== true) {
      throw new ValidationError(`${key} must be changed through its native picker.`);
    }
    result[key] = validateKnownSetting(key, entry);
  }

  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 65_536) {
    throw new ValidationError('The settings patch is too large.');
  }
  return result;
}

export { PROTECTED_SETTINGS };

function exactRecord(input, required, label) {
  const value = requirePlainObject(input, label);
  const allowed = new Set(required);
  const keys = Object.keys(value);
  if (keys.length !== required.length || keys.some((key) => !allowed.has(key))) {
    throw new ValidationError(`${label} has an unsupported schema.`);
  }
  return value;
}

function requireTimestamp(value, label, options = {}) {
  if (value === null && options.nullable === true) return null;
  const timestamp = requireString(value, label, {
    maxLength: 40,
    pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
  });
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new ValidationError(`${label} must be an ISO-8601 timestamp.`);
  }
  return timestamp;
}

function requireNativeDocumentPath(value, label) {
  const filePath = requireAbsolutePath(value, label);
  if (!RECORD_DOCUMENT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    throw new ValidationError(`${label} does not use a supported document extension.`);
  }
  return filePath;
}

function validateDocumentExport(input, index) {
  const value = exactRecord(
    input,
    ['outputPath', 'targetFormat', 'exportedAt'],
    `document export ${index + 1}`
  );
  return {
    outputPath: requireAbsolutePath(value.outputPath, 'export output path'),
    targetFormat: requireString(value.targetFormat, 'export target format', {
      maxLength: 16,
      pattern: /^[A-Za-z0-9]+$/
    }).toLowerCase(),
    exportedAt: requireTimestamp(value.exportedAt, 'export timestamp')
  };
}

function validateDocumentRecord(input, index) {
  const value = exactRecord(input, [
    'id', 'title', 'kind', 'filePath', 'format', 'createdAt', 'updatedAt', 'lastOpenedAt',
    'exports', 'contentState'
  ], `document record ${index + 1}`);
  if (!Array.isArray(value.exports) || value.exports.length > 100) {
    throw new ValidationError('Document exports must be a list of at most 100 entries.');
  }
  const filePath = value.filePath === null
    ? null
    : requireNativeDocumentPath(value.filePath, 'document path');
  const format = value.format === null
    ? null
    : requireString(value.format, 'document format', { maxLength: 16, pattern: /^[A-Za-z0-9]+$/ }).toLowerCase();
  if ((filePath === null) !== (format === null)) {
    throw new ValidationError('Document path and format must either both be present or both be absent.');
  }
  return {
    id: requireIdentifier(value.id, 'document identifier'),
    title: requireString(value.title, 'document title', { maxLength: 240 }),
    kind: requireString(value.kind, 'document kind', { maxLength: 16, pattern: RECORD_DOCUMENT_KINDS }),
    filePath,
    format,
    createdAt: requireTimestamp(value.createdAt, 'document creation timestamp'),
    updatedAt: requireTimestamp(value.updatedAt, 'document update timestamp'),
    lastOpenedAt: requireTimestamp(value.lastOpenedAt, 'document open timestamp'),
    exports: value.exports.map(validateDocumentExport),
    contentState: requireString(value.contentState, 'document content state', {
      maxLength: 40,
      pattern: /^(?:unsaved-in-libreoffice|managed-by-libreoffice)$/
    })
  };
}

function validateRecentItem(input, index) {
  const value = exactRecord(
    input,
    ['id', 'title', 'filePath', 'format', 'openedAt'],
    `recent item ${index + 1}`
  );
  return {
    id: requireIdentifier(value.id, 'recent item identifier'),
    title: requireString(value.title, 'recent item title', { maxLength: 240 }),
    filePath: requireNativeDocumentPath(value.filePath, 'recent item path'),
    format: requireString(value.format, 'recent item format', {
      maxLength: 16,
      pattern: /^[A-Za-z0-9]+$/
    }).toLowerCase(),
    openedAt: requireTimestamp(value.openedAt, 'recent item timestamp')
  };
}

function validateNotificationRecord(input, index) {
  const value = exactRecord(
    input,
    ['id', 'level', 'title', 'body', 'createdAt', 'dismissedAt'],
    `notification record ${index + 1}`
  );
  return {
    id: requireIdentifier(value.id, 'notification identifier'),
    level: requireString(value.level, 'notification level', { maxLength: 16, pattern: NOTIFICATION_LEVELS }),
    title: requireString(value.title, 'notification title', { maxLength: 120 }),
    body: requireString(value.body, 'notification body', { minLength: 0, maxLength: 2_000 }),
    createdAt: requireTimestamp(value.createdAt, 'notification creation timestamp'),
    dismissedAt: requireTimestamp(value.dismissedAt, 'notification dismissal timestamp', { nullable: true })
  };
}

function requireUniqueIdentifiers(records, label) {
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.id)) throw new ValidationError(`${label} identifiers must be unique.`);
    seen.add(record.id);
  }
  return records;
}

export function validateRecordState(value) {
  const input = requirePlainObject(value, 'record state');
  if (input.schemaVersion !== 1) {
    throw new ValidationError('The record state schema is unsupported.');
  }
  const allowedKeys = new Set(['schemaVersion', 'documents', 'recentItems', 'notifications', 'workspace']);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new ValidationError('The record state contains unsupported fields.');
  }
  if (!Array.isArray(input.documents) || input.documents.length > 10_000) {
    throw new ValidationError('Record state documents must be a list of at most 10,000 entries.');
  }
  if (!Array.isArray(input.recentItems) || input.recentItems.length > 100) {
    throw new ValidationError('Record state recent items must be a list of at most 100 entries.');
  }
  if (!Array.isArray(input.notifications) || input.notifications.length > 500) {
    throw new ValidationError('Record state notifications must be a list of at most 500 entries.');
  }
  return {
    schemaVersion: 1,
    documents: requireUniqueIdentifiers(input.documents.map(validateDocumentRecord), 'Document'),
    recentItems: requireUniqueIdentifiers(input.recentItems.map(validateRecentItem), 'Recent item'),
    notifications: requireUniqueIdentifiers(input.notifications.map(validateNotificationRecord), 'Notification'),
    workspace: validateJsonValue(input.workspace ?? null, {
      maxDepth: 26,
      maxNodes: 220_000,
      maxStringLength: 4 * 1024 * 1024
    })
  };
}
