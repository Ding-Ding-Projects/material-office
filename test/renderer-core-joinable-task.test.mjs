import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createJoinableTask } from '../src/renderer/core/joinable-task.mjs';

test('joinable task makes a manual save await an existing persistence flush', async () => {
  let release;
  let calls = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const flush = createJoinableTask(async () => {
    calls += 1;
    await gate;
    return 'persisted';
  });

  const backgroundFlush = flush();
  const manualSave = flush();
  assert.equal(manualSave, backgroundFlush);
  assert.equal(calls, 0);
  await Promise.resolve();
  assert.equal(calls, 1);

  let manualFinished = false;
  void manualSave.then(() => { manualFinished = true; });
  await Promise.resolve();
  assert.equal(manualFinished, false);
  release();
  assert.equal(await manualSave, 'persisted');
  assert.equal(manualFinished, true);
  assert.equal(calls, 1);
});

test('joinable task starts a fresh operation after settlement', async () => {
  let calls = 0;
  const run = createJoinableTask(async () => ++calls);
  assert.equal(await run(), 1);
  assert.equal(await run(), 2);
  assert.throws(() => createJoinableTask(null), TypeError);
});

test('manual save and every window-close path join the renderer persistence operation', async () => {
  const source = await readFile(new URL('../src/renderer/app.mjs', import.meta.url), 'utf8');
  assert.match(source, /async function performWorkspacePersistence\(\)/);
  assert.match(source, /MAX_PERSISTENCE_PASSES_PER_FLUSH/);
  assert.match(source, /const flushWorkspacePersistence = createJoinableTask\(performWorkspacePersistence\)/);
  assert.match(source, /async function performActiveDocumentSave[\s\S]*?await flushWorkspacePersistence\(\)[\s\S]*?persistedGeneration < generation/);
  assert.match(source, /const runDocumentSave = createKeyedSerialTask[\s\S]*?function saveActiveDocument[\s\S]*?return runDocumentSave\(saveKey, tabId\)/);
  assert.match(source, /async function closeAppWindowAfterPersistence[\s\S]*?await flushWorkspacePersistenceBeforeClose\(\)[\s\S]*?barrier\.persisted[\s\S]*?await desktop\.appWindow\.closeCurrent\(\)/);
  assert.match(source, /window\.addEventListener\('beforeunload',[\s\S]*?hasPendingWorkspacePersistence\(\)[\s\S]*?closeCurrentAppWindow\(\)/);
  assert.match(source, /approvedWindowClose = \{ attemptId, generation: barrier\.completedGeneration \}[\s\S]*?finally \{[\s\S]*?approvedWindowClose\?\.attemptId === attemptId[\s\S]*?activeWindowCloseAttempt === attemptId/);
  assert.doesNotMatch(source, /allowWindowCloseOnce/);
  assert.match(source, /function closeTab[\s\S]*?discardDocumentChanges\(tab\)[\s\S]*?queuePersist\('tab closed'\)/);

  const barrierRoutine = source.slice(
    source.indexOf('async function closeAppWindowAfterPersistence'),
    source.indexOf('function closeCurrentAppWindow')
  );
  const closeDecisionRoutine = source.slice(
    source.indexOf('function closeCurrentAppWindow'),
    source.indexOf('async function showLegalDocument')
  );
  assert.doesNotMatch(barrierRoutine, /showModal/);
  assert.match(closeDecisionRoutine, /if \(!unsaved\.length\)[\s\S]*?closeAppWindowAfterPersistence\(\)[\s\S]*?decision: true/);
});
