import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPublicHistoryDiff,
  HISTORY_DIFF_MAX_CHANGES,
  HISTORY_DIFF_MAX_OUTPUT_BYTES,
  HISTORY_DIFF_MAX_PATH_BYTES,
  HISTORY_DIFF_MAX_PATH_CHARACTERS,
  HISTORY_DIFF_MAX_PREVIEW_BYTES,
  HISTORY_DIFF_MAX_PREVIEW_CHARACTERS,
  projectHistoryState,
  publicHistoryDiffEnvelope,
  requireHistoryLabel
} from '../../src/main/history-public.js';

const SELECTED_REVISION = 'a'.repeat(40);
const CURRENT_REVISION = 'b'.repeat(40);
const TIMESTAMP = '2026-07-31T20:00:00.000Z';

function stateFixture() {
  return {
    schemaVersion: 1,
    settings: {
      schemaVersion: 1,
      theme: 'light',
      density: 'compact',
      libreOfficeExecutableOverride: 'C:\\Private\\LibreOffice\\soffice.exe',
      customEditors: [{ executable: 'C:\\Private\\Editors\\private.exe' }]
    },
    records: {
      schemaVersion: 1,
      documents: [{
        id: 'document-1',
        title: 'Board report',
        kind: 'writer',
        filePath: 'C:\\Private\\Documents\\board-report.odt',
        format: 'odt',
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
        lastOpenedAt: TIMESTAMP,
        exports: [{
          outputPath: 'C:\\Private\\Exports\\board-report.pdf',
          targetFormat: 'pdf',
          exportedAt: TIMESTAMP
        }],
        contentState: 'managed-by-libreoffice'
      }],
      recentItems: [],
      notifications: [],
      workspace: {
        schemaVersion: 1,
        preferences: { theme: 'light', funny: { en: 1, yue: 2 } },
        tabs: {
          activeId: 'tab-1',
          items: [{ id: 'tab-1', label: 'Home', surface: 'home', pinned: true }],
          groups: []
        },
        documents: [{
          id: 'writer-1',
          type: 'writer',
          title: 'Draft',
          nativeFileName: 'C:\\Private\\Documents\\draft.odt',
          nativeFileAvailable: true,
          unsaved: false,
          content: { html: '<p>Hello from C:\\Private\\Documents\\draft.odt</p>' },
          savedContent: { html: '<p>Hello from C:\\Private\\Documents\\draft.odt</p>' }
        }],
        records: {
          'C:\\Private\\record.json': { name: 'Safe record', status: 'draft' }
        },
        notifications: []
      }
    }
  };
}

test('history diff is human-readable while protected settings and native paths never enter the public projection', () => {
  const previousState = stateFixture();
  const currentState = structuredClone(previousState);
  currentState.settings.theme = 'dark';
  currentState.settings.libreOfficeExecutableOverride = 'D:\\More-Private\\soffice.exe';
  currentState.settings.customEditors[0].executable = 'D:\\More-Private\\editor.exe';
  currentState.records.documents[0].filePath = 'D:\\More-Private\\board-report.odt';
  currentState.records.documents[0].exports[0].outputPath = 'D:\\More-Private\\board-report.pdf';
  currentState.records.workspace.documents[0].content.html = '<p>Changed at D:\\More-Private\\draft.odt</p>';
  currentState.records.workspace.records['C:\\Private\\record.json'].status = 'final';

  const result = createPublicHistoryDiff({
    revision: SELECTED_REVISION,
    currentRevision: CURRENT_REVISION,
    previousState,
    currentState
  });

  assert.equal(result.unchanged, false);
  assert.equal(result.counts.modified, 3);
  assert.equal(result.changes.some((entry) => entry.path === 'settings.theme'), true);
  assert.equal(result.changes.some((entry) => entry.path.startsWith('workspace.documents.writer-1-')), true);
  assert.equal(
    result.changes.some((entry) => entry.path === 'workspace.records.item-1-redacted'),
    true
  );
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    'C:\\Private',
    'D:\\More-Private',
    'libreOfficeExecutableOverride',
    'customEditors',
    'filePath',
    'outputPath',
    'nativeFileName',
    'soffice.exe',
    'editor.exe'
  ]) {
    assert.equal(serialized.includes(forbidden), false, `public diff leaked ${forbidden}`);
  }
  assert.match(serialized, /\[path redacted\]/);
  assert.deepEqual(Object.keys(result), [
    'revision', 'currentRevision', 'unchanged', 'counts', 'truncated', 'changes'
  ]);
  assert.deepEqual(Object.keys(result.changes[0]), [
    'path', 'kind', 'oldPreview', 'newPreview', 'previewTruncated'
  ]);
});

test('history diff reports unchanged for the same safe state and ignores protected-only changes', () => {
  const previousState = stateFixture();
  const identical = createPublicHistoryDiff({
    revision: SELECTED_REVISION,
    currentRevision: CURRENT_REVISION,
    previousState,
    currentState: structuredClone(previousState)
  });
  assert.deepEqual(identical, {
    revision: SELECTED_REVISION,
    currentRevision: CURRENT_REVISION,
    unchanged: true,
    counts: { added: 0, removed: 0, modified: 0, total: 0 },
    truncated: false,
    changes: []
  });

  const protectedOnly = structuredClone(previousState);
  protectedOnly.settings.libreOfficeExecutableOverride = 'D:\\Secret\\soffice.exe';
  protectedOnly.settings.customEditors = [{ executable: 'D:\\Secret\\tool.exe' }];
  protectedOnly.records.documents[0].filePath = 'D:\\Secret\\renamed.odt';
  protectedOnly.records.documents[0].exports[0].outputPath = 'D:\\Secret\\renamed.pdf';
  const redacted = createPublicHistoryDiff({
    revision: SELECTED_REVISION,
    currentRevision: CURRENT_REVISION,
    previousState,
    currentState: protectedOnly
  });
  assert.equal(redacted.unchanged, true);
  assert.equal(redacted.counts.total, 0);
});

test('history diff enforces strict change, path, preview, and serialized byte bounds', () => {
  const previousState = stateFixture();
  previousState.records.documents = [];
  const currentState = structuredClone(previousState);
  currentState.records.documents = Array.from({ length: 400 }, (_, index) => ({
    id: `document-${index}-${'文'.repeat(300)}`,
    title: `${'Very long title '.repeat(80)}C:\\Never\\Leak-${index}.odt`,
    kind: 'writer',
    filePath: `C:\\Never\\Leak-${index}.odt`,
    format: 'odt',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    lastOpenedAt: TIMESTAMP,
    exports: [],
    contentState: 'managed-by-libreoffice'
  }));

  const result = createPublicHistoryDiff({
    revision: SELECTED_REVISION,
    currentRevision: CURRENT_REVISION,
    previousState,
    currentState
  });
  assert.equal(result.truncated, true);
  assert.equal(result.changes.length, HISTORY_DIFF_MAX_CHANGES);
  assert.equal(result.counts.added, 400);
  assert.equal(result.counts.modified, 1);
  assert.equal(result.counts.total, 401);
  assert.ok(Buffer.byteLength(JSON.stringify(result), 'utf8') <= HISTORY_DIFF_MAX_OUTPUT_BYTES);
  for (const change of result.changes) {
    assert.ok(change.path.length <= HISTORY_DIFF_MAX_PATH_CHARACTERS);
    assert.ok(Buffer.byteLength(change.path, 'utf8') <= HISTORY_DIFF_MAX_PATH_BYTES);
    for (const preview of [change.oldPreview, change.newPreview]) {
      if (preview === null) continue;
      assert.ok(preview.length <= HISTORY_DIFF_MAX_PREVIEW_CHARACTERS);
      assert.ok(Buffer.byteLength(preview, 'utf8') <= HISTORY_DIFF_MAX_PREVIEW_BYTES);
      assert.equal(preview.includes('C:\\Never'), false);
    }
  }
});

test('history projection and public envelopes reject hostile prototypes and extra response fields', () => {
  const hostileState = Object.create({ settings: { theme: 'dark' } });
  hostileState.schemaVersion = 1;
  assert.throws(() => projectHistoryState(hostileState), /must be an object/i);

  const valid = createPublicHistoryDiff({
    revision: SELECTED_REVISION,
    currentRevision: CURRENT_REVISION,
    previousState: stateFixture(),
    currentState: stateFixture()
  });
  assert.throws(
    () => publicHistoryDiffEnvelope({ ...valid, snapshot: { secret: true } }, SELECTED_REVISION),
    (error) => error.code === 'HISTORY_RESPONSE_INVALID'
  );
});

test('history labels are bounded, single-line, UTF-8 bounded, and never accept absolute paths', () => {
  assert.equal(requireHistoryLabel('  Before budget edits  '), 'Before budget edits');
  for (const invalid of [
    '',
    'line one\nline two',
    'C:\\Private\\snapshot',
    'file:///private/snapshot',
    'x'.repeat(121),
    '界'.repeat(81)
  ]) {
    assert.throws(() => requireHistoryLabel(invalid), (error) => error.code === 'INVALID_INPUT');
  }
});
