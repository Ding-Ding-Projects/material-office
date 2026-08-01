import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import {
  isWorkspaceEnvelope,
  mergeWorkspaceStates
} from '../src/renderer/core/workspace-sync.mjs';

test('workspace merge combines only provably independent object fields', () => {
  const base = {
    preferences: { theme: 'light', density: 'compact' },
    tabs: { activeId: 'home' },
    documents: [{ id: 'writer-1', content: 'base' }]
  };
  const local = structuredClone(base);
  local.preferences.theme = 'dark';
  const remote = structuredClone(base);
  remote.tabs.activeId = 'writer-1';

  const result = mergeWorkspaceStates(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.state.preferences.theme, 'dark');
  assert.equal(result.state.tabs.activeId, 'writer-1');
  assert.deepEqual(result.state.documents, base.documents);
});

test('workspace merge reports overlapping scalars and arrays without dropping the local copy', () => {
  const base = {
    preferences: { theme: 'light' },
    documents: [{ id: 'writer-1', content: 'base' }]
  };
  const local = {
    preferences: { theme: 'dark' },
    documents: [{ id: 'writer-1', content: 'local' }]
  };
  const remote = {
    preferences: { theme: 'system' },
    documents: [{ id: 'writer-1', content: 'remote' }]
  };

  const result = mergeWorkspaceStates(base, local, remote);
  assert.deepEqual(result.conflicts, ['$.documents', '$.preferences.theme']);
  assert.deepEqual(result.state.documents, local.documents);
  assert.equal(result.state.preferences.theme, 'dark');
  assert.equal(remote.documents[0].content, 'remote');
});

test('workspace merge handles independent additions and conflicting delete-versus-edit', () => {
  const base = { records: { first: { value: 1 } } };
  const local = { records: { local: { value: 2 } } };
  const remote = { records: { first: { value: 3 }, remote: { value: 4 } } };

  const result = mergeWorkspaceStates(base, local, remote);
  assert.deepEqual(result.conflicts, ['$.records.first']);
  assert.equal(Object.hasOwn(result.state.records, 'first'), false);
  assert.deepEqual(result.state.records.local, { value: 2 });
  assert.deepEqual(result.state.records.remote, { value: 4 });
});

test('workspace envelopes require one bounded opaque revision and an explicit state field', () => {
  const revision = '12345678-1234-1234-1234-123456789abc';
  assert.equal(isWorkspaceEnvelope({ revision, state: null }), true);
  assert.equal(isWorkspaceEnvelope({ revision }), false);
  assert.equal(isWorkspaceEnvelope({ revision: `${revision}0`, state: null }), false);
  assert.equal(isWorkspaceEnvelope({ revision: 'not-a-revision', state: {} }), false);
});

test('renderer wiring uses one revision-aware save path, broadcasts, and fresh restore history', async () => {
  const source = await fs.readFile(new URL('../src/renderer/app.mjs', import.meta.url), 'utf8');
  assert.match(source, /workspace\?\.onChanged\?\.\(\(envelope\)/);
  assert.match(source, /workspace\.save\(workspaceRevision, snapshot\)/);
  assert.doesNotMatch(source, /workspace\.save\(\s*\{\s*state\b/);
  assert.doesNotMatch(source, /desktop\.settings/);
  assert.doesNotMatch(source, /applyMainSettings|settingsPatchFromState/);
  assert.match(source, /workspaceBaseState = structuredClone\(result\.state\)/);
  assert.match(source, /desktop\.history\.list\(\{ limit: 10_000 \}\)/);
  assert.match(source, /const barrier = await flushWorkspacePersistenceBeforeClose\(\)/);
  assert.match(source, /if \(!barrier\.persisted\)/);
  const restoreBlock = source.slice(
    source.indexOf('async function performHistoryRestore'),
    source.indexOf('function reviewHistoryPrune')
  );
  assert.ok(restoreBlock.length > 0);
  assert.doesNotMatch(restoreBlock, /clearTimeout\(persistTimer\)/);
  assert.match(source, /localOnly: true/);
});
