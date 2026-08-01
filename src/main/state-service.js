import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { AtomicJsonStore } from './atomic-json-store.js';
import { AppError } from './errors.js';
import { MAX_STATE_FILE_BYTES, MAX_WORKSPACE_BYTES } from './state-limits.js';
import {
  requirePlainObject,
  requireWorkspaceRevision,
  validateJsonValue,
  validateRecordState,
  validateSettingsPatch
} from './validation.js';

export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: 1,
  languageMode: 'en',
  funnyLevelEnglish: 1,
  funnyLevelCantonese: 1,
  theme: 'system',
  density: 'compact',
  accentColor: '#6750A4',
  fontFamily: 'Segoe UI',
  fontSizeScale: 1,
  fontWeight: 400,
  dimSumSurpriseEnabled: true,
  reducedMotion: false,
  narratorEnabled: false,
  preferredEditorId: null,
  customEditors: [],
  libreOfficeExecutableOverride: null
});

export const DEFAULT_RECORDS = Object.freeze({
  schemaVersion: 1,
  documents: [],
  recentItems: [],
  notifications: [],
  workspace: null
});

function validateWorkspaceState(value) {
  const validated = validateJsonValue(value, {
    maxDepth: 24,
    maxNodes: 200_000,
    maxStringLength: MAX_WORKSPACE_BYTES + 1_024
  });
  if (Buffer.byteLength(JSON.stringify(validated), 'utf8') > MAX_WORKSPACE_BYTES) {
    throw new AppError('WORKSPACE_TOO_LARGE', 'Workspace state must not exceed 4 MiB.');
  }
  return validated;
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function workspaceDocuments(value) {
  if (!Array.isArray(value?.documents)) return [];
  return value.documents.filter((entry) => (
    entry && typeof entry === 'object' && typeof entry.id === 'string'
  ));
}

export function deriveWorkspaceHistoryAction(previous, next) {
  if (previous === null || previous === undefined) return 'workspace initialized';
  const beforeDocuments = new Map(workspaceDocuments(previous).map((entry) => [entry.id, entry]));
  const afterDocuments = new Map(workspaceDocuments(next).map((entry) => [entry.id, entry]));
  const created = [...afterDocuments.keys()].filter((id) => !beforeDocuments.has(id)).length;
  const deleted = [...beforeDocuments.keys()].filter((id) => !afterDocuments.has(id)).length;
  const discarded = [...afterDocuments.entries()].filter(([id, entry]) => beforeDocuments.get(id)?.unsaved === true && entry?.unsaved === false).length;
  const updated = [...afterDocuments.entries()].filter(([id, entry]) => (
    beforeDocuments.has(id) && !jsonEqual(beforeDocuments.get(id), entry)
  )).length;
  const changes = [];
  if (discarded > 0) changes.push(discarded === 1 ? 'document discarded' : 'documents discarded');
  if (changes.length === 0 && created > 0 && deleted === 0 && updated === 0) {
    changes.push(created === 1 ? 'document created' : 'documents created');
  } else if (changes.length === 0 && deleted > 0 && created === 0 && updated === 0) {
    changes.push(deleted === 1 ? 'document deleted' : 'documents deleted');
  } else if (changes.length === 0 && updated > 0 && created === 0 && deleted === 0) {
    changes.push(updated === 1 ? 'document updated' : 'documents updated');
  } else if (changes.length === 0 && (created > 0 || deleted > 0 || updated > 0)) {
    changes.push('documents changed');
  }
  if (!jsonEqual(previous?.preferences, next?.preferences)) changes.push('settings changed');
  if (
    !jsonEqual(previous?.appearance, next?.appearance) ||
    !jsonEqual(previous?.appearancePresets, next?.appearancePresets)
  ) changes.push('appearance changed');
  if (!jsonEqual(previous?.tabs, next?.tabs)) changes.push('tabs changed');
  if (!jsonEqual(previous?.notifications, next?.notifications)) changes.push('notifications changed');
  if (!jsonEqual(previous?.records, next?.records)) changes.push('records changed');
  if (changes.length === 0) return 'workspace updated';
  if (changes.length === 1) return changes[0];
  return `workspace changed: ${changes.map((entry) => entry.replace(/ changed$/, '')).join(', ')}`.slice(0, 80);
}

function validateSettings(value) {
  const input = requirePlainObject(value, 'settings');
  if (input.schemaVersion !== 1) {
    throw new AppError('SETTINGS_SCHEMA_UNSUPPORTED', 'The settings schema is unsupported.');
  }
  const { schemaVersion, ...candidate } = input;
  const keys = Object.keys(candidate);
  if (keys.length === 0) return { schemaVersion };
  return { schemaVersion, ...validateSettingsPatch(candidate, { allowProtected: true }) };
}

function validateStateEnvelope(value) {
  const input = requirePlainObject(value, 'application state');
  if (input.schemaVersion !== 1) {
    throw new AppError('STATE_SCHEMA_UNSUPPORTED', 'The application state schema is unsupported.');
  }
  return {
    schemaVersion: 1,
    settings: validateSettings(input.settings),
    records: validateRecordState(input.records)
  };
}

export class PersistentStateService {
  #tail = Promise.resolve();
  #workspaceRevision = randomUUID();
  #workspaceListeners = new Set();

  constructor(userDataPath, options = {}) {
    const stateDirectory = path.join(path.resolve(userDataPath), 'state');
    this.fs = options.fs;
    this.history = options.history;
    this.historyAvailable = false;
    this.stateStore = new AtomicJsonStore(path.join(stateDirectory, 'state.json'), {
      fs: options.fs,
      defaultValue: {
        schemaVersion: 1,
        settings: DEFAULT_SETTINGS,
        records: DEFAULT_RECORDS
      },
      validate: validateStateEnvelope,
      maxBytes: MAX_STATE_FILE_BYTES
    });
    this.legacySettingsStore = new AtomicJsonStore(path.join(stateDirectory, 'settings.json'), {
      fs: options.fs,
      defaultValue: DEFAULT_SETTINGS,
      validate: validateSettings,
      maxBytes: 1_000_000
    });
    this.legacyRecordsStore = new AtomicJsonStore(path.join(stateDirectory, 'records.json'), {
      fs: options.fs,
      defaultValue: DEFAULT_RECORDS,
      validate: validateRecordState,
      maxBytes: 8 * 1024 * 1024
    });
  }

  async initialize() {
    return this.#enqueue(async () => {
      try {
        await this.stateStore.read();
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        const [legacySettings, legacyRecords] = await Promise.all([
          this.#readLegacy(this.legacySettingsStore, DEFAULT_SETTINGS),
          this.#readLegacy(this.legacyRecordsStore, DEFAULT_RECORDS)
        ]);
        await this.stateStore.write(validateStateEnvelope({
          schemaVersion: 1,
          settings: legacySettings.value,
          records: legacyRecords.value
        }));
      }
      if (this.history) {
        try {
          await this.history.initialize();
          this.historyAvailable = true;
        } catch {
          this.historyAvailable = false;
        }
      }
    });
  }

  async getSettings() {
    return (await this.stateStore.read()).settings;
  }

  async getRecords() {
    return (await this.stateStore.read()).records;
  }

  async getWorkspace() {
    return this.#enqueue(async () => {
      const { records } = await this.stateStore.read();
      return this.#workspaceEnvelope(records.workspace);
    });
  }

  onWorkspaceChanged(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    this.#workspaceListeners.add(listener);
    return () => this.#workspaceListeners.delete(listener);
  }

  async exportState() {
    return this.stateStore.read();
  }

  async updateSettings(patch, options = {}) {
    const validatedPatch = validateSettingsPatch(patch, {
      allowProtected: options.allowProtected === true
    });
    return this.#enqueue(async () => {
      const currentState = await this.stateStore.read();
      const current = currentState.settings;
      const settings = validateSettings({
        ...current,
        ...validatedPatch,
        schemaVersion: 1
      });
      if (JSON.stringify(settings) === JSON.stringify(current)) {
        return { settings, changed: false, history: { recorded: false, skipped: true } };
      }
      await this.stateStore.write({ ...currentState, settings });
      const history = await this.#recordHistory('settings changed');
      return { settings, changed: true, history };
    });
  }

  async updateProtectedSettings(patch) {
    return this.updateSettings(patch, { allowProtected: true });
  }

  async updateRecords(transform, action = 'records changed') {
    if (typeof transform !== 'function') {
      throw new TypeError('transform must be a function');
    }
    return this.#enqueue(async () => {
      const currentState = await this.stateStore.read();
      const current = currentState.records;
      const records = validateRecordState(await transform(structuredClone(current)));
      if (JSON.stringify(records) === JSON.stringify(current)) {
        return { records, changed: false, history: { recorded: false, skipped: true } };
      }
      const resolvedAction = typeof action === 'function' ? action(current, records) : action;
      if (
        typeof resolvedAction !== 'string' ||
        resolvedAction.length < 1 ||
        resolvedAction.length > 80 ||
        !/^[a-z][a-z0-9 ,:-]*$/.test(resolvedAction)
      ) {
        throw new AppError('HISTORY_ACTION_INVALID', 'The main-owned history action is invalid.');
      }
      const workspaceChanged = !jsonEqual(current.workspace, records.workspace);
      const nextWorkspaceRevision = workspaceChanged ? randomUUID() : this.#workspaceRevision;
      await this.stateStore.write({ ...currentState, records });
      this.#workspaceRevision = nextWorkspaceRevision;
      const history = await this.#recordHistory(resolvedAction);
      if (workspaceChanged) this.#emitWorkspaceChanged(records.workspace);
      return { records, changed: true, history };
    });
  }

  async saveWorkspace(input) {
    const payload = requirePlainObject(input, 'workspace save request');
    if (
      Object.keys(payload).length !== 2 ||
      !Object.hasOwn(payload, 'expectedRevision') ||
      !Object.hasOwn(payload, 'state')
    ) {
      throw new AppError('INVALID_INPUT', 'Workspace saves accept only expectedRevision and state.');
    }
    const expectedRevision = requireWorkspaceRevision(payload.expectedRevision);
    const workspace = validateWorkspaceState(payload.state);
    return this.#enqueue(async () => {
      const currentState = await this.stateStore.read();
      if (expectedRevision !== this.#workspaceRevision) {
        throw new AppError(
          'WORKSPACE_CONFLICT',
          'The workspace changed in another window. Reload the latest workspace before saving.'
        );
      }
      const currentWorkspace = currentState.records.workspace ?? null;
      if (jsonEqual(workspace, currentWorkspace)) {
        return {
          revision: this.#workspaceRevision,
          state: structuredClone(workspace),
          changed: false,
          history: { recorded: false, skipped: true }
        };
      }
      const records = validateRecordState({ ...currentState.records, workspace });
      const nextWorkspaceRevision = randomUUID();
      await this.stateStore.write({ ...currentState, records });
      this.#workspaceRevision = nextWorkspaceRevision;
      const history = await this.#recordHistory(
        deriveWorkspaceHistoryAction(currentWorkspace, workspace)
      );
      const result = {
        revision: this.#workspaceRevision,
        state: structuredClone(workspace),
        changed: true,
        history
      };
      this.#emitWorkspaceChanged(workspace);
      return result;
    });
  }

  async restore(revision) {
    if (!this.history) {
      throw new AppError('HISTORY_UNAVAILABLE', 'Local version history is unavailable.');
    }
    return this.#enqueue(async () => {
      let restoredWorkspace;
      let workspaceChanged = false;
      const result = await this.history.restoreSnapshot(revision, async (snapshot) => {
        const currentState = await this.stateStore.read();
        const state = requirePlainObject(snapshot, 'snapshot');
        if (state.schemaVersion !== 1) {
          throw new AppError('SNAPSHOT_SCHEMA_UNSUPPORTED', 'The history snapshot schema is unsupported.');
        }
        const settings = validateSettings(state.settings);
        const records = validateRecordState(state.records);
        workspaceChanged = !jsonEqual(currentState.records.workspace, records.workspace);
        const nextWorkspaceRevision = workspaceChanged ? randomUUID() : this.#workspaceRevision;
        await this.stateStore.write({ schemaVersion: 1, settings, records });
        this.#workspaceRevision = nextWorkspaceRevision;
        restoredWorkspace = records.workspace;
      });
      if (workspaceChanged) this.#emitWorkspaceChanged(restoredWorkspace);
      return result;
    });
  }

  async listHistory(limit = 100) {
    if (!this.history) return [];
    try {
      const snapshots = await this.history.listSnapshots(limit);
      this.historyAvailable = true;
      return snapshots;
    } catch {
      this.historyAvailable = false;
      return [];
    }
  }

  async diffHistory(revision) {
    if (!this.history) {
      throw new AppError('HISTORY_UNAVAILABLE', 'Local version history is unavailable.');
    }
    return this.#enqueue(async () => {
      const result = await this.history.diffSnapshot(revision, await this.stateStore.read());
      this.historyAvailable = true;
      return result;
    });
  }

  async labelHistory(revision, label) {
    if (!this.history) {
      throw new AppError('HISTORY_UNAVAILABLE', 'Local version history is unavailable.');
    }
    return this.#enqueue(async () => {
      const result = await this.history.labelSnapshot(revision, label);
      this.historyAvailable = true;
      return result;
    });
  }

  async pruneHistory(limit) {
    if (!this.history) {
      throw new AppError('HISTORY_UNAVAILABLE', 'Local version history is unavailable.');
    }
    return this.#enqueue(async () => {
      try {
        const result = await this.history.pruneSnapshots(limit);
        this.historyAvailable = true;
        return result;
      } catch (error) {
        this.historyAvailable = false;
        throw error;
      }
    });
  }

  isHistoryAvailable() {
    return this.historyAvailable;
  }

  #enqueue(operation) {
    const task = this.#tail.then(operation);
    this.#tail = task.catch(() => undefined);
    return task;
  }

  #workspaceEnvelope(workspace) {
    return {
      revision: this.#workspaceRevision,
      state: workspace === undefined ? null : structuredClone(workspace)
    };
  }

  #emitWorkspaceChanged(workspace) {
    for (const listener of this.#workspaceListeners) {
      try {
        listener(this.#workspaceEnvelope(workspace));
      } catch {
        // A window notification failure must never roll back accepted state.
      }
    }
  }

  async #readLegacy(store, fallback) {
    try {
      return { exists: true, value: await store.read() };
    } catch (error) {
      if (error?.code === 'ENOENT') return { exists: false, value: structuredClone(fallback) };
      throw error;
    }
  }

  async #recordHistory(action) {
    if (!this.history) {
      return { recorded: false, errorCode: 'HISTORY_UNAVAILABLE' };
    }
    try {
      const snapshot = await this.history.recordSnapshot(await this.exportState(), { action });
      this.historyAvailable = true;
      return { recorded: true, snapshot };
    } catch {
      this.historyAvailable = false;
      return { recorded: false, errorCode: 'HISTORY_WRITE_FAILED' };
    }
  }
}

export function cloneRecordState(value) {
  return validateJsonValue(value, {
    maxDepth: 26,
    maxNodes: 220_000,
    maxStringLength: MAX_WORKSPACE_BYTES
  });
}

export { validateWorkspaceState };
