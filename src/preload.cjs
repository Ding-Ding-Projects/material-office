'use strict';

const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel, payload) {
  const response = payload === undefined
    ? await ipcRenderer.invoke(channel)
    : await ipcRenderer.invoke(channel, payload);
  if (!response || response.ok !== true) {
    const error = new Error(response?.error?.message || 'The main process rejected the request.');
    error.code = response?.error?.code || 'IPC_ERROR';
    throw error;
  }
  return response.value;
}

const api = Object.freeze({
  app: Object.freeze({
    getCapabilities: () => invoke('app:get-capabilities')
  }),
  appWindow: Object.freeze({
    openNew: () => invoke('app-window:open-new'),
    closeCurrent: () => invoke('app-window:close-current')
  }),
  workspace: Object.freeze({
    get: () => invoke('workspace:get'),
    save: (expectedRevision, state) => invoke('workspace:save', { expectedRevision, state }),
    onChanged: (callback) => {
      if (typeof callback !== 'function') throw new TypeError('callback must be a function');
      const listener = (_event, envelope) => callback(envelope);
      ipcRenderer.on('workspace:changed', listener);
      return () => ipcRenderer.removeListener('workspace:changed', listener);
    }
  }),
  documents: Object.freeze({
    list: () => invoke('documents:list'),
    recent: () => invoke('documents:recent'),
    create: (request) => invoke('documents:create', request),
    open: () => invoke('documents:open'),
    saveMetadata: (request) => invoke('documents:save-metadata', request),
    saveCustom: (request) => invoke('documents:save-custom', request),
    export: (request) => invoke('documents:export', request)
  }),
  history: Object.freeze({
    list: (request) => invoke('history:list', request),
    diff: (request) => invoke('history:diff', request),
    label: (request) => invoke('history:label', request),
    prune: (request) => invoke('history:prune', request),
    restore: (request) => invoke('history:restore', request)
  }),
  libreOffice: Object.freeze({
    availability: (request) => invoke('libreoffice:availability', request),
    chooseInstallation: () => invoke('libreoffice:choose-installation'),
    launchNew: (request) => invoke('libreoffice:launch-new', request),
    launchDocument: (request) => invoke('libreoffice:launch-document', request),
    runCommand: (request) => invoke('libreoffice:run-command', request)
  }),
  externalEditors: Object.freeze({
    list: () => invoke('editors:list'),
    chooseCustom: () => invoke('editors:choose-custom'),
    openDocument: (request) => invoke('editors:open-document', request)
  }),
  files: Object.freeze({
    chooseCsv: () => invoke('files:choose-csv')
  }),
  windows: Object.freeze({
    openContrastSettings: () => invoke('windows:open-contrast-settings')
  }),
  notifications: Object.freeze({
    list: (request) => invoke('notifications:list', request),
    dismiss: (request) => invoke('notifications:dismiss', request),
    clearDismissed: () => invoke('notifications:clear-dismissed')
  }),
  changelog: Object.freeze({
    list: (request) => invoke('changelog:list', request)
  })
});

contextBridge.exposeInMainWorld('materialOffice', api);
