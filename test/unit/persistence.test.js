import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AtomicJsonStore } from '../../src/main/atomic-json-store.js';
import {
  deriveWorkspaceHistoryAction,
  PersistentStateService
} from '../../src/main/state-service.js';
import { ValidationError } from '../../src/main/errors.js';
import { mergeWorkspaceStates } from '../../src/renderer/core/workspace-sync.mjs';

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-state-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('AtomicJsonStore replaces complete JSON values without leaving temporary files', async (t) => {
  const directory = await temporaryDirectory(t);
  const filePath = path.join(directory, 'nested', 'state.json');
  const store = new AtomicJsonStore(filePath, {
    defaultValue: { count: 0 },
    validate: (value) => {
      assert.equal(typeof value.count, 'number');
      return value;
    }
  });

  assert.deepEqual(await store.initialize(), { count: 0 });
  await store.write({ count: 1 });
  await store.update((current) => ({ count: current.count + 1 }));
  assert.deepEqual(JSON.parse(await fs.readFile(filePath, 'utf8')), { count: 2 });
  assert.deepEqual(
    (await fs.readdir(path.dirname(filePath))).filter((name) => name.endsWith('.tmp')),
    []
  );
});

test('AtomicJsonStore rejects an oversized on-disk file before reading its body', async (t) => {
  const directory = await temporaryDirectory(t);
  const filePath = path.join(directory, 'oversized.json');
  await fs.writeFile(filePath, Buffer.alloc(1_024, 0x20));
  const store = new AtomicJsonStore(filePath, {
    defaultValue: {},
    maxBytes: 32
  });
  await assert.rejects(store.initialize(), (error) => error.code === 'STATE_TOO_LARGE');
});

test('AtomicJsonStore rejects malformed UTF-8 instead of repairing persisted text', async (t) => {
  const directory = await temporaryDirectory(t);
  const filePath = path.join(directory, 'invalid-utf8.json');
  await fs.writeFile(filePath, Buffer.concat([
    Buffer.from('{"fontFamily":"'),
    Buffer.from([0xff]),
    Buffer.from('"}')
  ]));
  const store = new AtomicJsonStore(filePath, { defaultValue: {} });
  await assert.rejects(store.initialize(), (error) => error.code === 'STATE_INVALID');
});

test('state persistence succeeds even when local history is unavailable', async (t) => {
  const directory = await temporaryDirectory(t);
  const history = {
    async initialize() {
      throw new Error('simulated git failure');
    },
    async recordSnapshot() {
      throw new Error('simulated git failure');
    }
  };
  const state = new PersistentStateService(directory, { history });
  await state.initialize();

  const result = await state.updateSettings({ theme: 'dark' });
  assert.equal(result.settings.theme, 'dark');
  assert.equal(result.changed, true);
  assert.deepEqual(result.history, { recorded: false, errorCode: 'HISTORY_WRITE_FAILED' });

  const reloaded = new PersistentStateService(directory);
  await reloaded.initialize();
  assert.equal((await reloaded.getSettings()).theme, 'dark');
});

test('state history pruning delegates only a bounded limit and reports availability', async (t) => {
  const directory = await temporaryDirectory(t);
  const calls = [];
  const history = {
    async initialize() {},
    async pruneSnapshots(limit) {
      calls.push(limit);
      return { pruned: false, limit, beforeCount: 8, afterCount: 8, prunedCount: 0 };
    }
  };
  const state = new PersistentStateService(directory, { history });
  await state.initialize();
  assert.deepEqual(await state.pruneHistory(10), {
    pruned: false,
    limit: 10,
    beforeCount: 8,
    afterCount: 8,
    prunedCount: 0
  });
  assert.deepEqual(calls, [10]);
  assert.equal(state.isHistoryAvailable(), true);

  const unavailable = new PersistentStateService(path.join(directory, 'without-history'));
  await unavailable.initialize();
  await assert.rejects(
    unavailable.pruneHistory(10),
    (error) => error.code === 'HISTORY_UNAVAILABLE'
  );
});

test('serialized setting updates do not lose concurrent changes and unchanged writes are skipped', async (t) => {
  const directory = await temporaryDirectory(t);
  const calls = [];
  const history = {
    async initialize() {},
    async recordSnapshot(state, metadata) {
      calls.push({ state, metadata });
      return { revision: String(calls.length).padStart(7, '0') };
    }
  };
  const state = new PersistentStateService(directory, { history });
  await state.initialize();
  await Promise.all([
    state.updateSettings({ theme: 'dark' }),
    state.updateSettings({ density: 'comfortable' })
  ]);
  const settings = await state.getSettings();
  assert.equal(settings.theme, 'dark');
  assert.equal(settings.density, 'comfortable');
  assert.equal(calls.length, 2);

  const unchanged = await state.updateSettings({ theme: 'dark' });
  assert.equal(unchanged.changed, false);
  assert.equal(calls.length, 2);
});

test('protected executable settings persist only through main-owned update methods', async (t) => {
  const directory = await temporaryDirectory(t);
  const state = new PersistentStateService(directory);
  await state.initialize();
  const executable = 'C:\\LibreOffice\\program\\soffice.exe';
  await assert.rejects(
    state.updateSettings({ libreOfficeExecutableOverride: executable }),
    /native picker/i
  );
  await state.updateProtectedSettings({ libreOfficeExecutableOverride: executable });
  const reloaded = new PersistentStateService(directory);
  await reloaded.initialize();
  assert.equal((await reloaded.getSettings()).libreOfficeExecutableOverride, executable);
});

test('workspace state is durable, bounded, prototype-safe, and snapshots only changes', async (t) => {
  const directory = await temporaryDirectory(t);
  const calls = [];
  const history = {
    async initialize() {},
    async recordSnapshot(state, metadata) {
      calls.push({ state, metadata });
      return { revision: String(calls.length).padStart(7, 'a') };
    }
  };
  const state = new PersistentStateService(directory, { history });
  await state.initialize();
  const initial = await state.getWorkspace();
  assert.equal(initial.state, null);
  assert.match(initial.revision, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);

  const workspace = {
    schemaVersion: 1,
    documents: [{ id: 'writer-1', kind: 'writer', content: 'Hello' }],
    tabs: { order: ['writer-1'], groups: [] },
    appearanceOverrides: { 'writer-1': { accent: '#6750A4' } }
  };
  const first = await state.saveWorkspace({ expectedRevision: initial.revision, state: workspace });
  assert.equal(first.changed, true);
  assert.equal(first.history.recorded, true);
  assert.notEqual(first.revision, initial.revision);
  assert.deepEqual((await state.getWorkspace()).state, first.state);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].state.records.workspace.documents[0].content, 'Hello');
  assert.equal(calls[0].metadata.action, 'workspace initialized');

  const unchanged = await state.saveWorkspace({ expectedRevision: first.revision, state: workspace });
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.revision, first.revision);
  assert.deepEqual(unchanged.history, { recorded: false, skipped: true });
  assert.equal(calls.length, 1);

  const polluted = Object.create(null);
  polluted.__proto__ = 'blocked';
  await assert.rejects(
    state.saveWorkspace({ expectedRevision: first.revision, state: polluted }),
    ValidationError
  );
  await assert.rejects(
    state.saveWorkspace({
      expectedRevision: first.revision,
      state: { content: 'x'.repeat((4 * 1024 * 1024) + 1) }
    }),
    /4 MiB|too large/i
  );
});

test('workspace revisions reject stale whole-state writes from another window', async (t) => {
  const directory = await temporaryDirectory(t);
  const calls = [];
  const history = {
    async initialize() {},
    async recordSnapshot(snapshot) {
      calls.push(snapshot);
      return { revision: String(calls.length).padStart(7, 'a') };
    }
  };
  const state = new PersistentStateService(directory, { history });
  await state.initialize();
  const events = [];
  const removeListener = state.onWorkspaceChanged((envelope) => events.push(envelope));
  const windowA = await state.getWorkspace();
  const windowB = await state.getWorkspace();
  assert.equal(windowA.revision, windowB.revision);

  const savedA = await state.saveWorkspace({
    expectedRevision: windowA.revision,
    state: { schemaVersion: 1, documents: [{ id: 'writer-a', content: 'kept' }] }
  });
  await assert.rejects(
    state.saveWorkspace({
      expectedRevision: windowB.revision,
      state: { schemaVersion: 1, documents: [{ id: 'writer-b', content: 'stale' }] }
    }),
    (error) => error.code === 'WORKSPACE_CONFLICT' && /another window/i.test(error.message)
  );

  const latest = await state.getWorkspace();
  assert.equal(latest.revision, savedA.revision);
  assert.equal(latest.state.documents[0].content, 'kept');
  assert.equal(calls.length, 1);
  assert.deepEqual(events, [{ revision: savedA.revision, state: savedA.state }]);
  assert.equal(removeListener(), true);
});

test('a stale window can safely retry only a provably independent three-way merge', async (t) => {
  const directory = await temporaryDirectory(t);
  const state = new PersistentStateService(directory);
  await state.initialize();
  const baseState = {
    schemaVersion: 1,
    preferences: { theme: 'light' },
    tabs: { activeId: 'home' },
    documents: []
  };
  const initial = await state.getWorkspace();
  const seeded = await state.saveWorkspace({
    expectedRevision: initial.revision,
    state: baseState
  });
  const windowA = await state.getWorkspace();
  const windowB = await state.getWorkspace();
  const localA = structuredClone(windowA.state);
  localA.preferences.theme = 'dark';
  const localB = structuredClone(windowB.state);
  localB.tabs.activeId = 'writer-1';

  await state.saveWorkspace({ expectedRevision: windowA.revision, state: localA });
  await assert.rejects(
    state.saveWorkspace({ expectedRevision: windowB.revision, state: localB }),
    (error) => error.code === 'WORKSPACE_CONFLICT'
  );
  const latest = await state.getWorkspace();
  const merged = mergeWorkspaceStates(baseState, localB, latest.state);
  assert.deepEqual(merged.conflicts, []);
  const retried = await state.saveWorkspace({
    expectedRevision: latest.revision,
    state: merged.state
  });
  assert.notEqual(retried.revision, seeded.revision);
  assert.equal(retried.state.preferences.theme, 'dark');
  assert.equal(retried.state.tabs.activeId, 'writer-1');
});

test('renderer preferences converge through workspace CAS without exposing main-owned executables', async (t) => {
  const directory = await temporaryDirectory(t);
  const state = new PersistentStateService(directory);
  await state.initialize();
  const executable = 'C:\\LibreOffice\\program\\soffice.exe';
  await state.updateProtectedSettings({ libreOfficeExecutableOverride: executable });

  const initial = await state.getWorkspace();
  await state.saveWorkspace({
    expectedRevision: initial.revision,
    state: {
      schemaVersion: 1,
      preferences: { theme: 'system', density: 'compact' },
      documents: [],
      tabs: { activeId: 'home' }
    }
  });
  const windowA = await state.getWorkspace();
  const windowB = await state.getWorkspace();
  const localA = structuredClone(windowA.state);
  const localB = structuredClone(windowB.state);
  localA.preferences.theme = 'dark';
  localB.preferences.density = 'comfortable';

  await state.saveWorkspace({ expectedRevision: windowA.revision, state: localA });
  await assert.rejects(
    state.saveWorkspace({ expectedRevision: windowB.revision, state: localB }),
    (error) => error.code === 'WORKSPACE_CONFLICT'
  );
  const latest = await state.getWorkspace();
  const merged = mergeWorkspaceStates(windowB.state, localB, latest.state);
  assert.deepEqual(merged.conflicts, []);
  const converged = await state.saveWorkspace({
    expectedRevision: latest.revision,
    state: merged.state
  });

  assert.equal(converged.state.preferences.theme, 'dark');
  assert.equal(converged.state.preferences.density, 'comfortable');
  assert.equal((await state.getSettings()).libreOfficeExecutableOverride, executable);
  assert.equal(JSON.stringify(converged.state).includes(executable), false);
});

test('workspace history labels are bounded main-owned facts, never renderer text', async () => {
  const base = {
    documents: [],
    preferences: { theme: 'light' },
    appearance: {},
    appearancePresets: {},
    tabs: { items: [] },
    notifications: [],
    records: {}
  };
  const hostile = '--upload C:\\secrets\r\nforged audit';
  const created = {
    ...base,
    documents: [{ id: 'document-1', title: hostile, content: 'first' }]
  };
  const updated = {
    ...created,
    documents: [{ id: 'document-1', title: hostile, content: 'second' }]
  };
  assert.equal(deriveWorkspaceHistoryAction(null, base), 'workspace initialized');
  assert.equal(deriveWorkspaceHistoryAction(base, created), 'document created');
  assert.equal(deriveWorkspaceHistoryAction(created, updated), 'document updated');
  assert.equal(deriveWorkspaceHistoryAction({ ...created, documents: [{ ...created.documents[0], unsaved: true }] }, { ...updated, documents: [{ ...updated.documents[0], unsaved: false }] }), 'document discarded');
  assert.equal(deriveWorkspaceHistoryAction(updated, base), 'document deleted');
  const combined = deriveWorkspaceHistoryAction(base, {
    ...base,
    preferences: { theme: 'dark' },
    appearance: { card: { color: '#000000' } },
    tabs: { items: [{ id: 'tab-1' }] },
    notifications: [{ id: 'notice-1' }]
  });
  assert.equal(combined, 'workspace changed: settings, appearance, tabs, notifications');
  for (const action of [
    deriveWorkspaceHistoryAction(base, created),
    deriveWorkspaceHistoryAction(created, updated),
    combined
  ]) {
    assert.equal(action.includes(hostile), false);
    assert.ok(action.length <= 80);
  }
});

test('restore commits settings and records as one atomic state generation', async (t) => {
  const directory = await temporaryDirectory(t);
  let failRename = false;
  const fileSystem = new Proxy(fs, {
    get(target, property) {
      if (property === 'rename') {
        return async (...args) => {
          if (failRename) throw Object.assign(new Error('simulated rename failure'), { code: 'EIO' });
          return target.rename(...args);
        };
      }
      return target[property];
    }
  });
  const targetSnapshot = {
    schemaVersion: 1,
    settings: null,
    records: null
  };
  const history = {
    async initialize() {},
    async recordSnapshot() {
      return { revision: 'abcdef1' };
    },
    async restoreSnapshot(_revision, applyState) {
      await applyState(structuredClone(targetSnapshot));
      return { historyRecorded: true };
    }
  };
  const state = new PersistentStateService(directory, { history, fs: fileSystem });
  await state.initialize();
  await state.updateSettings({ theme: 'dark' });
  const workspace = await state.getWorkspace();
  await state.saveWorkspace({
    expectedRevision: workspace.revision,
    state: { version: 'before' }
  });
  const before = await state.exportState();
  targetSnapshot.settings = { ...before.settings, theme: 'light' };
  targetSnapshot.records = {
    ...before.records,
    workspace: { version: 'after' }
  };

  failRename = true;
  await assert.rejects(state.restore('abcdef1'), (error) => error.code === 'STATE_WRITE_FAILED');
  failRename = false;

  const reloaded = new PersistentStateService(directory);
  await reloaded.initialize();
  assert.equal((await reloaded.getSettings()).theme, 'dark');
  assert.deepEqual((await reloaded.getWorkspace()).state, { version: 'before' });
});

test('startup rejects a JSON-valid envelope with malformed record entries', async (t) => {
  const directory = await temporaryDirectory(t);
  const initialized = new PersistentStateService(directory);
  await initialized.initialize();
  const statePath = path.join(directory, 'state', 'state.json');
  const envelope = JSON.parse(await fs.readFile(statePath, 'utf8'));
  envelope.records.documents = [{}];
  await fs.writeFile(statePath, JSON.stringify(envelope), 'utf8');
  const reloaded = new PersistentStateService(directory);
  await assert.rejects(reloaded.initialize(), /document record/i);
});
