import assert from 'node:assert/strict';
import test from 'node:test';

import { createKeyedSerialTask } from '../src/renderer/core/keyed-serial-task.mjs';
import {
  beginDocumentSave,
  rollbackDocumentSave
} from '../src/renderer/core/document-save-transaction.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

test('same-key operations serialize while independent keys remain concurrent', async () => {
  const firstGate = deferred();
  const events = [];
  const run = createKeyedSerialTask(async (name, gate) => {
    events.push(`start:${name}`);
    await gate;
    events.push(`finish:${name}`);
  });

  const first = run('document-a', 'first', firstGate.promise);
  const second = run('document-a', 'second', Promise.resolve());
  const independent = run('document-b', 'independent', Promise.resolve());
  await Promise.resolve();
  await independent;
  assert.deepEqual(events, ['start:first', 'start:independent', 'finish:independent']);
  firstGate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, [
    'start:first',
    'start:independent',
    'finish:independent',
    'finish:first',
    'start:second',
    'finish:second'
  ]);
});

test('two failed saves of one document cannot roll back to an optimistic clean state', async () => {
  const state = {
    tabs: { items: [{ id: 'tab-1', documentId: 'document-1', unsaved: true }] },
    documents: [{
      id: 'document-1',
      content: { html: '<p>draft</p>' },
      savedContent: { html: '<p>baseline</p>' },
      updatedAt: '2026-07-31T20:00:00.000Z',
      unsaved: true
    }]
  };
  const firstGate = deferred();
  const secondGate = deferred();
  let starts = 0;
  const save = createKeyedSerialTask(async (gate, updatedAt) => {
    starts += 1;
    const transaction = beginDocumentSave(state, 'tab-1', updatedAt);
    await gate;
    rollbackDocumentSave(state, transaction);
    return false;
  });

  const first = save('document-1', firstGate.promise, '2026-07-31T21:00:00.000Z');
  const second = save('document-1', secondGate.promise, '2026-07-31T22:00:00.000Z');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(starts, 1);
  assert.equal(state.documents[0].unsaved, false);

  firstGate.resolve();
  assert.equal(await first, false);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(starts, 2);
  assert.equal(state.documents[0].unsaved, false);

  secondGate.resolve();
  assert.equal(await second, false);
  assert.equal(state.documents[0].unsaved, true);
  assert.equal(state.tabs.items[0].unsaved, true);
  assert.deepEqual(state.documents[0].savedContent, { html: '<p>baseline</p>' });
});
