import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const preloadPath = path.resolve('src', 'preload.cjs');

async function loadPreload() {
  const source = await fs.readFile(preloadPath, 'utf8');
  const invocations = [];
  const listeners = new Map();
  let exposed;
  const ipcRenderer = {
    invoke: async (...args) => {
      invocations.push(args);
      return { ok: true, value: { accepted: true } };
    },
    on: (channel, listener) => listeners.set(channel, listener),
    removeListener: (channel, listener) => {
      if (listeners.get(channel) === listener) listeners.delete(channel);
    }
  };
  vm.runInNewContext(source, {
    require(specifier) {
      assert.equal(specifier, 'electron');
      return {
        contextBridge: { exposeInMainWorld: (_name, api) => { exposed = api; } },
        ipcRenderer
      };
    },
    TypeError
  }, { filename: preloadPath });
  return { api: exposed, invocations, listeners };
}

test('preload constructs the exact workspace save request and forwards bounded change events', async () => {
  const { api, invocations, listeners } = await loadPreload();
  assert.equal(Object.hasOwn(api, 'settings'), false);
  const revision = '12345678-1234-1234-1234-123456789abc';
  const state = { schemaVersion: 1, documents: [] };
  await api.workspace.save(revision, state);
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0][0], 'workspace:save');
  assert.equal(JSON.stringify(invocations[0][1]), JSON.stringify({ expectedRevision: revision, state }));
  await api.history.prune({ limit: 250 });
  assert.equal(invocations[1][0], 'history:prune');
  assert.equal(JSON.stringify(invocations[1][1]), JSON.stringify({ limit: 250 }));
  const historyRevision = 'a'.repeat(40);
  await api.history.diff({ revision: historyRevision });
  assert.equal(invocations[2][0], 'history:diff');
  assert.equal(
    JSON.stringify(invocations[2][1]),
    JSON.stringify({ revision: historyRevision })
  );
  await api.history.label({ revision: historyRevision, label: 'Budget baseline' });
  assert.equal(invocations[3][0], 'history:label');
  assert.equal(
    JSON.stringify(invocations[3][1]),
    JSON.stringify({ revision: historyRevision, label: 'Budget baseline' })
  );
  assert.equal(Object.hasOwn(api.history, 'readSnapshot'), false);
  assert.equal(Object.hasOwn(api.history, 'runGit'), false);

  let received;
  const unsubscribe = api.workspace.onChanged((envelope) => { received = envelope; });
  const envelope = { revision, state };
  listeners.get('workspace:changed')({ sender: 'not-exposed' }, envelope);
  assert.equal(received, envelope);
  assert.equal(Object.hasOwn(received, 'sender'), false);
  unsubscribe();
  assert.equal(listeners.has('workspace:changed'), false);
  assert.throws(() => api.workspace.onChanged('not a function'), TypeError);
});
