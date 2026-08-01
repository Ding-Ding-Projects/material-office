import path from 'node:path';
import { AppError, publicError, ValidationError } from './errors.js';
import {
  publicHistoryDiffEnvelope,
  publicHistoryLabelEnvelope,
  requireHistoryLabel
} from './history-public.js';
import {
  requireBoolean,
  requireExactHistoryRevision,
  requireIdentifier,
  requireInteger,
  requirePlainObject,
  requireRevision,
  requireString,
  requireWorkspaceRevision
} from './validation.js';

export const IPC_CHANNELS = Object.freeze({
  APP_CAPABILITIES: 'app:get-capabilities',
  WORKSPACE_GET: 'workspace:get',
  WORKSPACE_SAVE: 'workspace:save',
  WORKSPACE_CHANGED: 'workspace:changed',
  DOCUMENTS_LIST: 'documents:list',
  DOCUMENTS_RECENT: 'documents:recent',
  DOCUMENTS_CREATE: 'documents:create',
  DOCUMENTS_OPEN: 'documents:open',
  DOCUMENTS_SAVE_METADATA: 'documents:save-metadata',
  DOCUMENTS_SAVE_CUSTOM: 'documents:save-custom',
  DOCUMENTS_EXPORT: 'documents:export',
  HISTORY_LIST: 'history:list',
  HISTORY_DIFF: 'history:diff',
  HISTORY_LABEL: 'history:label',
  HISTORY_PRUNE: 'history:prune',
  HISTORY_RESTORE: 'history:restore',
  LIBREOFFICE_AVAILABILITY: 'libreoffice:availability',
  LIBREOFFICE_LAUNCH_NEW: 'libreoffice:launch-new',
  LIBREOFFICE_LAUNCH_DOCUMENT: 'libreoffice:launch-document',
  LIBREOFFICE_RUN_COMMAND: 'libreoffice:run-command',
  LIBREOFFICE_CHOOSE_INSTALLATION: 'libreoffice:choose-installation',
  EDITORS_LIST: 'editors:list',
  EDITORS_CHOOSE_CUSTOM: 'editors:choose-custom',
  EDITORS_OPEN_DOCUMENT: 'editors:open-document',
  FILES_CHOOSE_CSV: 'files:choose-csv',
  WINDOWS_OPEN_CONTRAST_SETTINGS: 'windows:open-contrast-settings',
  APP_WINDOW_OPEN_NEW: 'app-window:open-new',
  APP_WINDOW_CLOSE_CURRENT: 'app-window:close-current',
  APP_WINDOW_MINIMIZE: 'app-window:minimize',
  APP_WINDOW_TOGGLE_MAXIMIZE: 'app-window:toggle-maximize',
  NOTIFICATIONS_LIST: 'notifications:list',
  NOTIFICATIONS_DISMISS: 'notifications:dismiss',
  NOTIFICATIONS_CLEAR: 'notifications:clear-dismissed',
  CHANGELOG_LIST: 'changelog:list'
});

const DOCUMENT_FILTERS = Object.freeze([
  {
    name: 'Office documents',
    extensions: [
      'odt', 'ott', 'ods', 'ots', 'odp', 'otp', 'odg', 'otg', 'odf', 'odb', 'odm',
      'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf', 'txt', 'csv', 'html', 'htm',
      'pdf', 'svg'
    ]
  }
]);

function noPayload(payload) {
  if (payload !== undefined) {
    throw new ValidationError('This operation does not accept input.');
  }
}

function customEditors(settings) {
  return Array.isArray(settings.customEditors) ? settings.customEditors : [];
}

function exactIdentifiers(payload, names, label) {
  const request = requirePlainObject(payload, label);
  const keys = Object.keys(request).sort();
  if (keys.length !== names.length || keys.some((key, index) => key !== [...names].sort()[index])) {
    throw new ValidationError(`${label} contains unsupported fields.`);
  }
  return Object.fromEntries(names.map((name) => [name, requireIdentifier(request[name], name)]));
}

function exactFields(payload, required, optional, label) {
  const request = requirePlainObject(payload, label);
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(request);
  if (
    keys.some((key) => !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(request, key))
  ) {
    throw new ValidationError(`${label} contains unsupported fields.`);
  }
  return request;
}

function publicExport(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return {
    targetFormat: typeof entry.targetFormat === 'string' ? entry.targetFormat : null,
    exportedAt: typeof entry.exportedAt === 'string' ? entry.exportedAt : null,
    outputName: typeof entry.outputPath === 'string' ? path.basename(entry.outputPath) : null
  };
}

function publicDocument(document) {
  if (!document || typeof document !== 'object') return null;
  const nativeFileAvailable = typeof document.filePath === 'string' && document.filePath.length > 0;
  return {
    id: document.id,
    title: document.title,
    kind: document.kind,
    format: document.format,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    lastOpenedAt: document.lastOpenedAt,
    exports: Array.isArray(document.exports)
      ? document.exports.map(publicExport).filter(Boolean)
      : [],
    contentState: document.contentState,
    nativeFileAvailable,
    nativeFileName: nativeFileAvailable ? path.basename(document.filePath) : null
  };
}

function publicRecentItem(item) {
  if (!item || typeof item !== 'object') return null;
  const nativeFileAvailable = typeof item.filePath === 'string' && item.filePath.length > 0;
  return {
    id: item.id,
    title: item.title,
    format: item.format,
    openedAt: item.openedAt,
    nativeFileAvailable,
    nativeFileName: nativeFileAvailable ? path.basename(item.filePath) : null
  };
}

function publicHistoryEntry(entry) {
  const value = requirePlainObject(entry, 'history entry');
  const revision = requireExactHistoryRevision(value.revision);
  const recordedAt = requireString(value.recordedAt, 'history entry timestamp', {
    maxLength: 40,
    pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
  });
  if (Number.isNaN(Date.parse(recordedAt))) {
    throw new AppError('HISTORY_RESPONSE_INVALID', 'A history entry returned an invalid timestamp.');
  }
  return {
    revision,
    recordedAt,
    action: requireString(value.action, 'history action', {
      maxLength: 80,
      pattern: /^[A-Za-z][A-Za-z0-9 ,:._-]*$/
    }),
    label: value.label === null || value.label === undefined ? null : requireHistoryLabel(value.label)
  };
}

export function registerIpcHandlers(options) {
  const {
    ipcMain,
    dialog,
    getMainWindow,
    getWindowForEvent,
    isTrustedSender,
    openAppWindow,
    localHistoryAvailable = false,
    appVersion,
    services
  } = options;
  const handlers = new Map();

  const add = (channel, operation) => {
    const handler = async (event, payload) => {
      const window = getWindowForEvent ? getWindowForEvent(event) : getMainWindow();
      if (
        !window ||
        window.isDestroyed() ||
        event.sender !== window.webContents ||
        (isTrustedSender && !isTrustedSender(event, window))
      ) {
        return {
          ok: false,
          error: {
            code: 'UNTRUSTED_SENDER',
            message: 'The request did not come from the application window.'
          }
        };
      }
      try {
        return { ok: true, value: await operation(payload, window) };
      } catch (error) {
        return { ok: false, error: publicError(error) };
      }
    };
    ipcMain.handle(channel, handler);
    handlers.set(channel, handler);
  };

  add(IPC_CHANNELS.APP_CAPABILITIES, async (payload) => {
    noPayload(payload);
    return {
      platform: 'win32',
      appVersion,
      localHistory: typeof localHistoryAvailable === 'function'
        ? localHistoryAvailable()
        : localHistoryAvailable,
      documentContentSaving: false,
      conversions: 'libreoffice-allowlisted'
    };
  });
  add(IPC_CHANNELS.APP_WINDOW_OPEN_NEW, async (payload) => {
    noPayload(payload);
    await openAppWindow();
    return { opened: true };
  });
  add(IPC_CHANNELS.APP_WINDOW_CLOSE_CURRENT, async (payload, window) => {
    noPayload(payload);
    window.close();
    return { closed: true };
  });
  add(IPC_CHANNELS.APP_WINDOW_MINIMIZE, async (payload, window) => {
    noPayload(payload);
    window.minimize();
    return { minimized: true };
  });
  add(IPC_CHANNELS.APP_WINDOW_TOGGLE_MAXIMIZE, async (payload, window) => {
    noPayload(payload);
    if (window.isMaximized()) window.unmaximize(); else window.maximize();
    return { maximized: window.isMaximized() };
  });
  add(IPC_CHANNELS.WORKSPACE_GET, async (payload) => {
    noPayload(payload);
    return services.state.getWorkspace();
  });
  add(IPC_CHANNELS.WORKSPACE_SAVE, (payload) => {
    const request = exactFields(
      payload,
      ['expectedRevision', 'state'],
      [],
      'workspace save request'
    );
    return services.state.saveWorkspace({
      expectedRevision: requireWorkspaceRevision(request.expectedRevision),
      state: request.state
    });
  });
  add(IPC_CHANNELS.DOCUMENTS_LIST, async (payload) => {
    noPayload(payload);
    return (await services.documents.listDocuments()).map(publicDocument).filter(Boolean);
  });
  add(IPC_CHANNELS.DOCUMENTS_RECENT, async (payload) => {
    noPayload(payload);
    return (await services.documents.listRecent()).map(publicRecentItem).filter(Boolean);
  });
  add(IPC_CHANNELS.DOCUMENTS_CREATE, async (payload) => {
    const result = await services.documents.create(payload);
    return {
      launched: result.launched === true,
      pid: Number.isSafeInteger(result.pid) ? result.pid : null,
      metadata: publicDocument(result.metadata),
      metadataSaved: result.metadataSaved === true,
      history: result.history ?? null,
      metadataError: result.metadataError ?? null
    };
  });
  add(IPC_CHANNELS.DOCUMENTS_OPEN, async (payload, window) => {
    noPayload(payload);
    const selection = await dialog.showOpenDialog(window, {
      title: 'Open document',
      properties: ['openFile', 'dontAddToRecent'],
      filters: DOCUMENT_FILTERS
    });
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
    const result = await services.documents.openSelectedPath(selection.filePaths[0]);
    return {
      canceled: false,
      launched: result.launched === true,
      pid: Number.isSafeInteger(result.pid) ? result.pid : null,
      metadata: publicDocument(result.metadata),
      metadataSaved: result.metadataSaved === true,
      recentRecorded: result.recentRecorded === true,
      history: result.history ?? null,
      metadataError: result.metadataError ?? null
    };
  });
  add(IPC_CHANNELS.DOCUMENTS_SAVE_METADATA, async (payload) => {
    const request = exactFields(payload, ['id', 'title'], [], 'metadata request');
    const result = await services.documents.saveMetadata({
      id: requireIdentifier(request.id, 'document identifier'),
      title: requireString(request.title, 'document title', { maxLength: 240 })
    });
    return {
      metadata: publicDocument(result.metadata),
      metadataSaved: result.metadataSaved === true,
      documentContentSaved: result.documentContentSaved === true,
      scope: result.scope,
      history: result.history ?? null
    };
  });
  add(IPC_CHANNELS.DOCUMENTS_EXPORT, async (payload, window) => {
    const request = exactFields(
      payload,
      ['documentId', 'targetFormat'],
      [],
      'export request'
    );
    const documentId = requireIdentifier(request.documentId, 'document identifier');
    const targetFormat = requireString(request.targetFormat, 'target format', {
      maxLength: 16,
      pattern: /^[A-Za-z0-9]+$/
    });
    const selection = await dialog.showOpenDialog(window, {
      title: 'Choose export folder',
      properties: ['openDirectory', 'createDirectory', 'dontAddToRecent']
    });
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
    const result = await services.documents.export({
      documentId,
      outputDirectory: selection.filePaths[0],
      targetFormat
    });
    return {
      canceled: false,
      converted: result.converted === true,
      documentId,
      targetFormat: result.targetFormat,
      bytes: result.bytes,
      outputName: typeof result.outputPath === 'string' ? path.basename(result.outputPath) : null,
      metadataSaved: result.metadataSaved === true,
      history: result.history ?? null,
      metadataError: result.metadataError ?? null
    };
  });
  add(IPC_CHANNELS.DOCUMENTS_SAVE_CUSTOM, async (payload, window) => {
    if (!services.customWord) throw new AppError('CUSTOM_WORD_UNAVAILABLE', 'Custom Word saving requires the packaged local Git runtime.');
    const request = requirePlainObject(payload, 'Material Office Word save request');
    const keys = Object.keys(request).sort();
    if (keys.join(',') !== 'content,documentId,kind,title') {
      throw new ValidationError('Material Office Word save request contains unsupported fields.');
    }
    const selection = await dialog.showSaveDialog(window, {
      title: 'Save Material Office Word document',
      defaultPath: `${String(request.title).replace(/[^A-Za-z0-9 _.-]+/g, '_').slice(0, 120) || 'Untitled'}.mow`,
      filters: [{ name: 'Material Office Word', extensions: ['mow'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    });
    if (selection.canceled || !selection.filePath) return { canceled: true };
    const saved = await services.customWord.save({ ...request, targetPath: selection.filePath });
    return { canceled: false, ...saved };
  });
  add(IPC_CHANNELS.HISTORY_LIST, async (payload) => {
    const request = payload === undefined
      ? {}
      : exactFields(payload, [], ['limit'], 'history query');
    const limit = request.limit === undefined
      ? 100
      : requireInteger(request.limit, 'history limit', { min: 1, max: 10_000 });
    const entries = await services.state.listHistory(limit);
    if (!Array.isArray(entries) || entries.length > limit) {
      throw new AppError('HISTORY_RESPONSE_INVALID', 'Local history returned an invalid entry list.');
    }
    return entries.map(publicHistoryEntry);
  });
  add(IPC_CHANNELS.HISTORY_DIFF, async (payload) => {
    const request = exactFields(payload, ['revision'], [], 'history diff request');
    const revision = requireExactHistoryRevision(request.revision);
    return publicHistoryDiffEnvelope(await services.state.diffHistory(revision), revision);
  });
  add(IPC_CHANNELS.HISTORY_LABEL, async (payload) => {
    const request = exactFields(payload, ['revision', 'label'], [], 'history label request');
    const revision = requireExactHistoryRevision(request.revision);
    const label = requireHistoryLabel(request.label);
    return publicHistoryLabelEnvelope(
      await services.state.labelHistory(revision, label),
      revision,
      label
    );
  });
  add(IPC_CHANNELS.HISTORY_PRUNE, (payload) => {
    const request = exactFields(payload, ['limit'], [], 'history prune request');
    return services.state.pruneHistory(requireInteger(request.limit, 'history retention limit', {
      min: 10,
      max: 10_000
    }));
  });
  add(IPC_CHANNELS.HISTORY_RESTORE, async (payload) => {
    const request = requirePlainObject(payload, 'restore request');
    const result = await services.state.restore(requireRevision(request.revision));
    return {
      restored: result?.restored === true,
      historyRecorded: result?.historyRecorded === true,
      revision: typeof result?.snapshot?.revision === 'string' ? result.snapshot.revision : null,
      historyError: result?.historyError
        ? {
            code: String(result.historyError.code ?? 'HISTORY_WRITE_FAILED'),
            message: String(result.historyError.message ?? 'The restore history entry could not be recorded.')
          }
        : null
    };
  });
  add(IPC_CHANNELS.LIBREOFFICE_AVAILABILITY, (payload) => {
    const request = payload === undefined ? {} : requirePlainObject(payload, 'availability request');
    const refresh = request.refresh === undefined ? false : requireBoolean(request.refresh, 'refresh');
    return services.libreOffice.getAvailability({ refresh });
  });
  add(IPC_CHANNELS.LIBREOFFICE_LAUNCH_NEW, (payload) => services.libreOffice.launchNew(payload));
  add(IPC_CHANNELS.LIBREOFFICE_LAUNCH_DOCUMENT, async (payload) => {
    const request = exactIdentifiers(payload, ['documentId'], 'launch document request');
    const result = await services.documents.launchDocument(request);
    return {
      launched: result.launched === true,
      pid: Number.isSafeInteger(result.pid) ? result.pid : null,
      documentId: request.documentId,
      nativeFileName: result.nativeFileName
    };
  });
  add(IPC_CHANNELS.LIBREOFFICE_RUN_COMMAND, (payload) => services.unoCommands.runCommand(payload));
  add(IPC_CHANNELS.LIBREOFFICE_CHOOSE_INSTALLATION, async (payload, window) => {
    noPayload(payload);
    const selection = await dialog.showOpenDialog(window, {
      title: 'Choose LibreOffice',
      properties: ['openFile', 'dontAddToRecent'],
      filters: [{ name: 'LibreOffice', extensions: ['exe', 'com'] }]
    });
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
    let persisted;
    const installation = await services.libreOffice.setExplicitOverride(selection.filePaths[0], {
      beforeApply: async (verified) => {
        persisted = await services.state.updateProtectedSettings({
          libreOfficeExecutableOverride: verified.guiExecutable
        });
      }
    });
    return {
      canceled: false,
      installation,
      settings: persisted.settings,
      history: persisted.history
    };
  });
  add(IPC_CHANNELS.EDITORS_LIST, async (payload) => {
    noPayload(payload);
    const settings = await services.state.getSettings();
    return services.externalEditors.discover(customEditors(settings));
  });
  add(IPC_CHANNELS.EDITORS_CHOOSE_CUSTOM, async (payload, window) => {
    noPayload(payload);
    const selection = await dialog.showOpenDialog(window, {
      title: 'Choose external editor',
      properties: ['openFile', 'dontAddToRecent'],
      filters: [{ name: 'Windows applications', extensions: ['exe'] }]
    });
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
    const editor = await services.externalEditors.verifyCustomExecutable(selection.filePaths[0]);
    const settings = await services.state.getSettings();
    const existing = customEditors(settings).filter((candidate) => (
      candidate?.id !== editor.id &&
      (typeof candidate?.executable !== 'string' || candidate.executable.toLowerCase() !== editor.executable.toLowerCase())
    ));
    if (existing.length >= 20) {
      throw new AppError('EDITOR_LIMIT_REACHED', 'Remove a custom editor before adding another one.');
    }
    const persisted = await services.state.updateProtectedSettings({
      customEditors: [...existing, editor],
      preferredEditorId: editor.id
    });
    return {
      canceled: false,
      editor,
      settings: persisted.settings,
      history: persisted.history
    };
  });
  add(IPC_CHANNELS.EDITORS_OPEN_DOCUMENT, async (payload) => {
    const request = exactIdentifiers(payload, ['editorId', 'documentId'], 'open document request');
    const [settings, records] = await Promise.all([
      services.state.getSettings(),
      services.state.getRecords()
    ]);
    const document = records.documents.find((candidate) => candidate.id === request.documentId);
    if (!document) {
      throw new AppError('DOCUMENT_METADATA_NOT_FOUND', 'The selected document is not in the workspace.');
    }
    if (typeof document.filePath !== 'string' || !document.filePath) {
      throw new AppError('DOCUMENT_NATIVE_FILE_UNAVAILABLE', 'The selected document does not have a saved native file yet.');
    }
    const result = await services.externalEditors.open({
      editorId: request.editorId,
      targetPath: document.filePath
    }, customEditors(settings));
    return {
      launched: result.launched === true,
      pid: Number.isSafeInteger(result.pid) ? result.pid : null,
      documentId: request.documentId,
      editor: result.editor ? { id: result.editor.id, name: result.editor.name } : null
    };
  });
  add(IPC_CHANNELS.FILES_CHOOSE_CSV, async (payload, window) => {
    noPayload(payload);
    const selection = await dialog.showOpenDialog(window, {
      title: 'Import CSV data',
      properties: ['openFile', 'dontAddToRecent'],
      filters: [{ name: 'Delimited data', extensions: ['csv', 'tsv'] }]
    });
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
    return {
      canceled: false,
      file: await services.dataFiles.readCsvSelection(selection.filePaths[0])
    };
  });
  add(IPC_CHANNELS.WINDOWS_OPEN_CONTRAST_SETTINGS, async (payload) => {
    noPayload(payload);
    return services.windowsSettings.openContrastSettings();
  });
  add(IPC_CHANNELS.NOTIFICATIONS_LIST, (payload) => services.notifications.list(payload));
  add(IPC_CHANNELS.NOTIFICATIONS_DISMISS, (payload) => services.notifications.dismiss(payload));
  add(IPC_CHANNELS.NOTIFICATIONS_CLEAR, async (payload) => {
    noPayload(payload);
    return services.notifications.clearDismissed();
  });
  add(IPC_CHANNELS.CHANGELOG_LIST, (payload) => services.changelog.list(payload));

  return () => {
    for (const channel of handlers.keys()) {
      ipcMain.removeHandler(channel);
    }
  };
}
