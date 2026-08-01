const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const LOGICAL_PATH = /^[A-Za-z0-9_.:#\[\]-]+$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const ABSOLUTE_PATH = /(?:^|[\s("'])(?:[A-Za-z]:[\\/]|\\\\)|\bfile:\/\/|(?:^|[\s("'])\/(?:[^/\s"'<>]+\/)+/iu;

function safeInteger(value, maximum = 40_000) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function safePreview(value) {
  return value === null || (
    typeof value === 'string'
    && value.length <= 240
    && !CONTROL.test(value)
    && !ABSOLUTE_PATH.test(value)
  );
}

export function normalizeHistoryDiff(value, expectedRevision) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('History comparison returned an invalid result.');
  if (!REVISION.test(String(expectedRevision ?? '')) || value.revision !== expectedRevision || !REVISION.test(String(value.currentRevision ?? ''))) {
    throw new TypeError('History comparison returned an invalid revision.');
  }
  const counts = value.counts;
  if (!counts || typeof counts !== 'object' || !['added', 'removed', 'modified', 'total'].every((key) => safeInteger(counts[key]))) {
    throw new TypeError('History comparison returned invalid counts.');
  }
  if (counts.total !== counts.added + counts.removed + counts.modified) throw new TypeError('History comparison returned inconsistent counts.');
  if (typeof value.unchanged !== 'boolean' || typeof value.truncated !== 'boolean' || !Array.isArray(value.changes) || value.changes.length > 128) {
    throw new TypeError('History comparison returned an invalid change list.');
  }
  const seen = new Set();
  const changes = value.changes.map((change) => {
    if (!change || typeof change !== 'object' || Array.isArray(change)) throw new TypeError('History comparison returned an invalid change.');
    const path = String(change.path ?? '');
    if (path.length > 200 || !LOGICAL_PATH.test(path) || seen.has(path)) throw new TypeError('History comparison returned an unsafe logical path.');
    seen.add(path);
    if (!['added', 'removed', 'modified'].includes(change.kind) || typeof change.previewTruncated !== 'boolean' || !safePreview(change.oldPreview) || !safePreview(change.newPreview)) {
      throw new TypeError('History comparison returned an unsafe preview.');
    }
    return Object.freeze({ path, kind: change.kind, oldPreview: change.oldPreview, newPreview: change.newPreview, previewTruncated: change.previewTruncated });
  });
  if (changes.length > counts.total || (value.unchanged && (counts.total !== 0 || value.truncated))) throw new TypeError('History comparison returned an inconsistent result.');
  return Object.freeze({
    revision: value.revision,
    currentRevision: value.currentRevision,
    unchanged: value.unchanged,
    counts: Object.freeze({ ...counts }),
    truncated: value.truncated,
    changes: Object.freeze(changes)
  });
}

export function normalizeHistoryLabel(value, expectedRevision, expectedLabel) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('History label returned an invalid result.');
  if (value.revision !== expectedRevision || !REVISION.test(String(value.revision ?? ''))) throw new TypeError('History label returned an invalid revision.');
  if (value.label !== expectedLabel || typeof value.label !== 'string' || value.label.length > 120 || CONTROL.test(value.label) || ABSOLUTE_PATH.test(value.label)) {
    throw new TypeError('History label returned an unsafe value.');
  }
  if (typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt))) throw new TypeError('History label returned an invalid timestamp.');
  return Object.freeze({ revision: value.revision, label: value.label, updatedAt: value.updatedAt });
}
