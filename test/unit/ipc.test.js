import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../../src/main/errors.js';
import { IPC_CHANNELS, registerIpcHandlers } from '../../src/main/ipc.js';

const HISTORY_REVISION = 'a'.repeat(40);
const CURRENT_HISTORY_REVISION = 'b'.repeat(40);

function harness(overrides = {}) {
  const handlers = new Map();
  const webContents = {};
  const window = {
    closed: false,
    isDestroyed: () => false,
    webContents,
    close() {
      this.closed = true;
    }
  };
  const calls = [];
  const settings = {
    customEditors: [{
      id: 'custom-existing',
      name: 'Existing',
      executable: 'C:\\Editors\\existing.exe',
      acceptsDirectories: true,
      source: 'custom'
    }]
  };
  const services = {
    state: {
      getSettings: async () => settings,
      getWorkspace: async () => ({
        revision: '12345678-1234-1234-1234-123456789abc',
        state: { schemaVersion: 1, documents: [] }
      }),
      listHistory: async (limit) => {
        calls.push({ type: 'history-list', limit });
        return [{
          revision: HISTORY_REVISION,
          recordedAt: '2026-07-31T20:00:00.000Z',
          action: 'settings changed',
          label: 'Before edits',
          internalTree: 'must not cross IPC'
        }];
      },
      diffHistory: async (revision) => {
        calls.push({ type: 'history-diff', revision });
        if (revision === 'f'.repeat(40)) {
          throw new AppError('SNAPSHOT_NOT_FOUND', 'The requested history snapshot was not found.');
        }
        return {
          revision,
          currentRevision: CURRENT_HISTORY_REVISION,
          unchanged: false,
          counts: { added: 0, removed: 0, modified: 1, total: 1 },
          truncated: false,
          changes: [{
            path: 'settings.theme',
            kind: 'modified',
            oldPreview: 'light',
            newPreview: 'dark',
            previewTruncated: false
          }]
        };
      },
      labelHistory: async (revision, label) => {
        calls.push({ type: 'history-label', revision, label });
        if (revision === 'f'.repeat(40)) {
          throw new AppError('SNAPSHOT_NOT_FOUND', 'The requested history snapshot was not found.');
        }
        return { revision, label, updatedAt: '2026-07-31T20:01:00.000Z' };
      },
      saveWorkspace: async (request) => {
        calls.push({ type: 'workspace-save', request });
        return { ...request, changed: true, history: { recorded: true } };
      },
      pruneHistory: async (limit) => {
        calls.push({ type: 'history-prune', limit });
        return { pruned: true, limit, beforeCount: 12, afterCount: limit, prunedCount: 2 };
      },
      restore: async (revision) => ({
        restored: true,
        historyRecorded: false,
        snapshot: { revision: 'fedcba9', state: { protectedExecutable: 'C:\\Secret\\tool.exe' } },
        historyError: { code: 'HISTORY_WRITE_FAILED', message: 'History recording failed safely.' },
        state: { protectedExecutable: 'C:\\Secret\\tool.exe' },
        requestedRevision: revision
      }),
      getRecords: async () => ({
        documents: [{ id: 'document-1', filePath: 'C:\\Documents\\report.odt' }]
      }),
      updateProtectedSettings: async (patch) => ({
        settings: { ...settings, ...patch },
        history: { recorded: true }
      })
    },
    libreOffice: {
      setExplicitOverride: async (selectedPath, options = {}) => {
        const installation = {
          guiExecutable: selectedPath,
          headlessExecutable: selectedPath.replace(/\.exe$/i, '.com'),
          pythonExecutable: null
        };
        await options.beforeApply?.(installation);
        return installation;
      }
    },
    unoCommands: { runCommand: async (payload) => payload },
    externalEditors: {
      discover: async () => [],
      verifyCustomExecutable: async (selectedPath) => ({
        id: 'custom-selected',
        name: 'Selected',
        executable: selectedPath,
        acceptsDirectories: true,
        source: 'custom'
      }),
      open: async (payload, editors) => {
        calls.push({ type: 'open', payload, editors });
        if (payload.editorId === 'unknown-editor') {
          throw new AppError('EDITOR_NOT_FOUND', 'The selected editor is unavailable.');
        }
        return { launched: true };
      }
    },
    dataFiles: {
      readCsvSelection: async (selectedPath) => ({
        name: selectedPath.split('\\').at(-1),
        extension: 'csv',
        text: 'a,b',
        bytes: 3,
        lineCount: 1
      })
    },
    windowsSettings: { openContrastSettings: async () => ({ launched: true }) },
    documents: {
      listDocuments: async () => [{
        id: 'document-1',
        title: 'report.odt',
        kind: 'writer',
        filePath: 'C:\\Documents\\report.odt',
        format: 'odt',
        createdAt: '2026-07-31T20:00:00.000Z',
        updatedAt: '2026-07-31T20:00:00.000Z',
        lastOpenedAt: '2026-07-31T20:00:00.000Z',
        exports: [],
        contentState: 'managed-by-libreoffice'
      }],
      listRecent: async () => [],
      openSelectedPath: async (selectedPath) => {
        calls.push({ type: 'open-selected', selectedPath });
        return {
          launched: true,
          pid: 100,
          metadata: {
            id: 'document-1',
            title: 'report.odt',
            kind: 'writer',
            filePath: selectedPath,
            format: 'odt',
            createdAt: '2026-07-31T20:00:00.000Z',
            updatedAt: '2026-07-31T20:00:00.000Z',
            lastOpenedAt: '2026-07-31T20:00:00.000Z',
            exports: [],
            contentState: 'managed-by-libreoffice'
          },
          metadataSaved: true,
          recentRecorded: true
        };
      },
      saveMetadata: async (request) => ({
        metadata: {
          id: request.id,
          title: request.title,
          kind: 'writer',
          filePath: 'C:\\Documents\\report.odt',
          format: 'odt',
          exports: []
        },
        metadataSaved: true,
        documentContentSaved: false,
        scope: 'metadata-only'
      }),
      launchDocument: async (request) => ({
        launched: true,
        pid: 101,
        documentId: request.documentId,
        nativeFileName: 'report.odt',
        filePath: 'C:\\Documents\\report.odt'
      }),
      export: async (request) => {
        calls.push({ type: 'export', request });
        return {
          converted: true,
          targetFormat: request.targetFormat,
          bytes: 123,
          outputPath: 'C:\\Exports\\report.pdf',
          sourcePath: 'C:\\Documents\\report.odt',
          metadataSaved: true
        };
      }
    },
    notifications: {},
    changelog: {},
    ...overrides.services
  };
  const selections = [...(overrides.selections ?? [])];
  const dialog = {
    showOpenDialog: async () => selections.shift() ?? { canceled: true, filePaths: [] }
  };
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => handlers.delete(channel)
  };
  registerIpcHandlers({
    ipcMain,
    dialog,
    getMainWindow: () => window,
    openAppWindow: async () => calls.push({ type: 'new-window' }),
    appVersion: 'test',
    services
  });
  const invoke = (channel, payload) => handlers.get(channel)({ sender: webContents }, payload);
  return { calls, handlers, invoke, window };
}

test('native LibreOffice and custom-editor pickers accept no renderer path', async () => {
  const selectedOffice = 'C:\\LibreOffice\\program\\soffice.exe';
  const selectedEditor = 'C:\\Editors\\chosen.exe';
  const api = harness({
    selections: [
      { canceled: false, filePaths: [selectedOffice] },
      { canceled: false, filePaths: [selectedEditor] }
    ]
  });
  const office = await api.invoke(IPC_CHANNELS.LIBREOFFICE_CHOOSE_INSTALLATION);
  assert.equal(office.ok, true);
  assert.equal(office.value.installation.guiExecutable, selectedOffice);
  const editor = await api.invoke(IPC_CHANNELS.EDITORS_CHOOSE_CUSTOM);
  assert.equal(editor.ok, true);
  assert.equal(editor.value.editor.executable, selectedEditor);

  const injected = await api.invoke(
    IPC_CHANNELS.LIBREOFFICE_CHOOSE_INSTALLATION,
    { path: 'C:\\untrusted.exe' }
  );
  assert.equal(injected.ok, false);
  assert.equal(injected.error.code, 'INVALID_INPUT');
  const nullPayload = await api.invoke(IPC_CHANNELS.EDITORS_CHOOSE_CUSTOM, null);
  assert.equal(nullPayload.ok, false);
  assert.equal(nullPayload.error.code, 'INVALID_INPUT');
});

test('CSV and Windows settings IPC expose only zero-argument main-owned capabilities', async () => {
  const selectedCsv = 'C:\\Data\\table.csv';
  const api = harness({ selections: [{ canceled: false, filePaths: [selectedCsv] }] });
  const csv = await api.invoke(IPC_CHANNELS.FILES_CHOOSE_CSV);
  assert.equal(csv.ok, true);
  assert.deepEqual(csv.value.file, {
    name: 'table.csv',
    extension: 'csv',
    text: 'a,b',
    bytes: 3,
    lineCount: 1
  });
  assert.equal(Object.hasOwn(csv.value.file, 'path'), false);
  const contrast = await api.invoke(IPC_CHANNELS.WINDOWS_OPEN_CONTRAST_SETTINGS);
  assert.deepEqual(contrast, { ok: true, value: { launched: true } });
  const rejected = await api.invoke(IPC_CHANNELS.WINDOWS_OPEN_CONTRAST_SETTINGS, { uri: 'file:///x' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'INVALID_INPUT');
  const nullCsv = await api.invoke(IPC_CHANNELS.FILES_CHOOSE_CSV, null);
  assert.equal(nullCsv.ok, false);
  assert.equal(nullCsv.error.code, 'INVALID_INPUT');
});

test('external editor open resolves a stored document ID and rejects paths, unknown documents, and editors', async () => {
  const api = harness();
  const opened = await api.invoke(IPC_CHANNELS.EDITORS_OPEN_DOCUMENT, {
    editorId: 'custom-existing',
    documentId: 'document-1'
  });
  assert.deepEqual(opened, {
    ok: true,
    value: {
      launched: true,
      pid: null,
      documentId: 'document-1',
      editor: null
    }
  });
  assert.equal(api.calls[0].payload.targetPath, 'C:\\Documents\\report.odt');

  const injected = await api.invoke(IPC_CHANNELS.EDITORS_OPEN_DOCUMENT, {
    editorId: 'custom-existing',
    documentId: 'document-1',
    targetPath: 'C:\\untrusted.odt'
  });
  assert.equal(injected.ok, false);
  assert.equal(injected.error.code, 'INVALID_INPUT');

  const unknownDocument = await api.invoke(IPC_CHANNELS.EDITORS_OPEN_DOCUMENT, {
    editorId: 'custom-existing',
    documentId: 'missing-document'
  });
  assert.equal(unknownDocument.ok, false);
  assert.equal(unknownDocument.error.code, 'DOCUMENT_METADATA_NOT_FOUND');

  const unknownEditor = await api.invoke(IPC_CHANNELS.EDITORS_OPEN_DOCUMENT, {
    editorId: 'unknown-editor',
    documentId: 'document-1'
  });
  assert.equal(unknownEditor.ok, false);
  assert.equal(unknownEditor.error.code, 'EDITOR_NOT_FOUND');
});

test('window commands accept no options and close only the trusted current window', async () => {
  const api = harness();
  const opened = await api.invoke(IPC_CHANNELS.APP_WINDOW_OPEN_NEW);
  assert.deepEqual(opened, { ok: true, value: { opened: true } });
  assert.equal(api.calls.some((call) => call.type === 'new-window'), true);
  const rejected = await api.invoke(IPC_CHANNELS.APP_WINDOW_OPEN_NEW, { url: 'https://example.com' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'INVALID_INPUT');
  const nullClose = await api.invoke(IPC_CHANNELS.APP_WINDOW_CLOSE_CURRENT, null);
  assert.equal(nullClose.ok, false);
  assert.equal(nullClose.error.code, 'INVALID_INPUT');
  const closed = await api.invoke(IPC_CHANNELS.APP_WINDOW_CLOSE_CURRENT);
  assert.deepEqual(closed, { ok: true, value: { closed: true } });
  assert.equal(api.window.closed, true);
});

test('workspace IPC requires an exact revision-and-state schema and exposes no action or path', async () => {
  const api = harness();
  const loaded = await api.invoke(IPC_CHANNELS.WORKSPACE_GET);
  assert.deepEqual(loaded, {
    ok: true,
    value: {
      revision: '12345678-1234-1234-1234-123456789abc',
      state: { schemaVersion: 1, documents: [] }
    }
  });
  const request = {
    expectedRevision: loaded.value.revision,
    state: { schemaVersion: 1, documents: [{ id: 'writer-1' }] }
  };
  const saved = await api.invoke(IPC_CHANNELS.WORKSPACE_SAVE, request);
  assert.equal(saved.ok, true);
  assert.deepEqual(api.calls.at(-1), { type: 'workspace-save', request });

  for (const invalid of [
    { state: request.state },
    { ...request, expectedRevision: 'HEAD' },
    { ...request, action: 'renderer supplied history label' },
    { ...request, path: 'C:\\untrusted.json' }
  ]) {
    const rejected = await api.invoke(IPC_CHANNELS.WORKSPACE_SAVE, invalid);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, 'INVALID_INPUT');
  }
  assert.equal(api.calls.filter((call) => call.type === 'workspace-save').length, 1);

  const poisonedGet = await api.invoke(IPC_CHANNELS.WORKSPACE_GET, {});
  assert.equal(poisonedGet.ok, false);
  assert.equal(poisonedGet.error.code, 'INVALID_INPUT');
});

test('history prune IPC accepts exactly one bounded limit and no renderer Git controls', async () => {
  const api = harness();
  const pruned = await api.invoke(IPC_CHANNELS.HISTORY_PRUNE, { limit: 10 });
  assert.deepEqual(pruned, {
    ok: true,
    value: { pruned: true, limit: 10, beforeCount: 12, afterCount: 10, prunedCount: 2 }
  });
  assert.deepEqual(api.calls.at(-1), { type: 'history-prune', limit: 10 });

  for (const invalid of [
    undefined,
    { limit: 9 },
    { limit: 10_001 },
    { limit: 10, revision: 'HEAD' },
    { limit: 10, repositoryPath: 'C:\\user-repository' }
  ]) {
    const rejected = await api.invoke(IPC_CHANNELS.HISTORY_PRUNE, invalid);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, 'INVALID_INPUT');
  }
  assert.equal(api.calls.filter((call) => call.type === 'history-prune').length, 1);
});

test('history browse IPC returns exact bounded public envelopes and labels selected revisions', async () => {
  const api = harness();
  const listed = await api.invoke(IPC_CHANNELS.HISTORY_LIST, { limit: 1 });
  assert.deepEqual(listed, {
    ok: true,
    value: [{
      revision: HISTORY_REVISION,
      recordedAt: '2026-07-31T20:00:00.000Z',
      action: 'settings changed',
      label: 'Before edits'
    }]
  });
  assert.equal(JSON.stringify(listed).includes('internalTree'), false);

  const diff = await api.invoke(IPC_CHANNELS.HISTORY_DIFF, { revision: HISTORY_REVISION });
  assert.deepEqual(diff, {
    ok: true,
    value: {
      revision: HISTORY_REVISION,
      currentRevision: CURRENT_HISTORY_REVISION,
      unchanged: false,
      counts: { added: 0, removed: 0, modified: 1, total: 1 },
      truncated: false,
      changes: [{
        path: 'settings.theme',
        kind: 'modified',
        oldPreview: 'light',
        newPreview: 'dark',
        previewTruncated: false
      }]
    }
  });
  assert.deepEqual(api.calls.find((call) => call.type === 'history-diff'), {
    type: 'history-diff',
    revision: HISTORY_REVISION
  });

  const labeled = await api.invoke(IPC_CHANNELS.HISTORY_LABEL, {
    revision: HISTORY_REVISION,
    label: '  Budget baseline  '
  });
  assert.deepEqual(labeled, {
    ok: true,
    value: {
      revision: HISTORY_REVISION,
      label: 'Budget baseline',
      updatedAt: '2026-07-31T20:01:00.000Z'
    }
  });
  assert.deepEqual(api.calls.find((call) => call.type === 'history-label'), {
    type: 'history-label',
    revision: HISTORY_REVISION,
    label: 'Budget baseline'
  });
});

test('history browse IPC rejects partial revisions, hostile objects, paths, extra fields, and stale revisions', async () => {
  const api = harness();
  const inherited = Object.create({ revision: HISTORY_REVISION });
  const poisoned = JSON.parse(`{"revision":"${HISTORY_REVISION}","__proto__":{"polluted":true}}`);
  const invalidDiffs = [
    undefined,
    { revision: 'abcdef1' },
    { revision: 'HEAD' },
    { revision: ` ${HISTORY_REVISION}` },
    { revision: HISTORY_REVISION, repositoryPath: 'C:\\Private\\history' },
    { revision: HISTORY_REVISION, ref: 'refs/heads/main' },
    inherited,
    poisoned
  ];
  for (const request of invalidDiffs) {
    const rejected = await api.invoke(IPC_CHANNELS.HISTORY_DIFF, request);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, 'INVALID_INPUT');
  }

  const invalidLabels = [
    undefined,
    { revision: HISTORY_REVISION },
    { revision: HISTORY_REVISION, label: 'line one\nline two' },
    { revision: HISTORY_REVISION, label: 'C:\\Private\\history label' },
    { revision: HISTORY_REVISION, label: 'x'.repeat(121) },
    { revision: HISTORY_REVISION, label: 'Valid', ref: 'refs/heads/other' },
    Object.assign(Object.create({}), { revision: HISTORY_REVISION, label: 'Valid' })
  ];
  for (const request of invalidLabels) {
    const rejected = await api.invoke(IPC_CHANNELS.HISTORY_LABEL, request);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, 'INVALID_INPUT');
  }
  assert.equal(api.calls.filter((call) => call.type === 'history-diff').length, 0);
  assert.equal(api.calls.filter((call) => call.type === 'history-label').length, 0);

  const staleDiff = await api.invoke(IPC_CHANNELS.HISTORY_DIFF, { revision: 'f'.repeat(40) });
  assert.equal(staleDiff.ok, false);
  assert.equal(staleDiff.error.code, 'SNAPSHOT_NOT_FOUND');
  const staleLabel = await api.invoke(IPC_CHANNELS.HISTORY_LABEL, {
    revision: 'f'.repeat(40),
    label: 'Unavailable snapshot'
  });
  assert.equal(staleLabel.ok, false);
  assert.equal(staleLabel.error.code, 'SNAPSHOT_NOT_FOUND');

  const badList = await api.invoke(IPC_CHANNELS.HISTORY_LIST, {
    limit: 10,
    repositoryPath: 'C:\\Private\\history'
  });
  assert.equal(badList.ok, false);
  assert.equal(badList.error.code, 'INVALID_INPUT');
});

test('history restore IPC returns only a public acknowledgement envelope', async () => {
  const api = harness();
  const restored = await api.invoke(IPC_CHANNELS.HISTORY_RESTORE, { revision: 'abcdef1' });
  assert.deepEqual(restored, {
    ok: true,
    value: {
      restored: true,
      historyRecorded: false,
      revision: 'fedcba9',
      historyError: {
        code: 'HISTORY_WRITE_FAILED',
        message: 'History recording failed safely.'
      }
    }
  });
  assert.equal(JSON.stringify(restored).includes('C:\\Secret'), false);
  assert.equal(Object.hasOwn(restored.value, 'state'), false);
});

test('removed generic editor-open and raw editor-dialog channels are not registered', () => {
  const api = harness();
  assert.equal(api.handlers.has('settings:get'), false);
  assert.equal(api.handlers.has('settings:update'), false);
  assert.equal(api.handlers.has('editors:open'), false);
  assert.equal(api.handlers.has('dialog:choose-editor'), false);
  assert.equal(api.handlers.has('dialog:choose-document'), false);
  assert.equal(api.handlers.has('dialog:choose-directory'), false);
});

test('document operations keep native paths in main and accept only IDs or zero arguments', async () => {
  const selectedDocument = 'C:\\Documents\\report.odt';
  const selectedDirectory = 'C:\\Exports';
  const api = harness({
    selections: [
      { canceled: false, filePaths: [selectedDocument] },
      { canceled: false, filePaths: [selectedDirectory] }
    ]
  });

  const opened = await api.invoke(IPC_CHANNELS.DOCUMENTS_OPEN);
  assert.equal(opened.ok, true);
  assert.equal(opened.value.metadata.nativeFileAvailable, true);
  assert.equal(opened.value.metadata.nativeFileName, 'report.odt');
  assert.equal(Object.hasOwn(opened.value.metadata, 'filePath'), false);
  assert.equal(api.calls.find((call) => call.type === 'open-selected').selectedPath, selectedDocument);
  const rawOpen = await api.invoke(IPC_CHANNELS.DOCUMENTS_OPEN, { filePath: selectedDocument });
  assert.equal(rawOpen.ok, false);
  assert.equal(rawOpen.error.code, 'INVALID_INPUT');

  const launched = await api.invoke(IPC_CHANNELS.LIBREOFFICE_LAUNCH_DOCUMENT, {
    documentId: 'document-1'
  });
  assert.deepEqual(launched.value, {
    launched: true,
    pid: 101,
    documentId: 'document-1',
    nativeFileName: 'report.odt'
  });
  const rawLaunch = await api.invoke(IPC_CHANNELS.LIBREOFFICE_LAUNCH_DOCUMENT, {
    documentId: 'document-1',
    filePath: selectedDocument
  });
  assert.equal(rawLaunch.ok, false);

  const saved = await api.invoke(IPC_CHANNELS.DOCUMENTS_SAVE_METADATA, {
    id: 'document-1',
    title: 'Renamed report'
  });
  assert.equal(saved.ok, true);
  assert.equal(Object.hasOwn(saved.value.metadata, 'filePath'), false);
  const poisoned = await api.invoke(IPC_CHANNELS.DOCUMENTS_SAVE_METADATA, {
    id: 'document-1',
    title: 'Renamed report',
    filePath: 'C:\\Windows\\notepad.exe'
  });
  assert.equal(poisoned.ok, false);
  assert.equal(poisoned.error.code, 'INVALID_INPUT');

  const exported = await api.invoke(IPC_CHANNELS.DOCUMENTS_EXPORT, {
    documentId: 'document-1',
    targetFormat: 'pdf'
  });
  assert.equal(exported.ok, true);
  assert.equal(exported.value.outputName, 'report.pdf');
  assert.equal(Object.hasOwn(exported.value, 'outputPath'), false);
  assert.equal(Object.hasOwn(exported.value, 'sourcePath'), false);
  const overwriteInjection = await api.invoke(IPC_CHANNELS.DOCUMENTS_EXPORT, {
    documentId: 'document-1',
    targetFormat: 'pdf',
    overwrite: true
  });
  assert.equal(overwriteInjection.ok, false);
  assert.equal(overwriteInjection.error.code, 'INVALID_INPUT');
  const rawExport = await api.invoke(IPC_CHANNELS.DOCUMENTS_EXPORT, {
    documentId: 'document-1',
    targetFormat: 'pdf',
    outputDirectory: selectedDirectory
  });
  assert.equal(rawExport.ok, false);
});
