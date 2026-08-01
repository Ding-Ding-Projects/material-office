import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canUsePersistenceCloseApproval,
  flushPersistenceBeforeClose,
  hasPendingPersistence
} from '../src/renderer/core/persistence-close.mjs';
import { discardDocumentChanges } from '../src/renderer/core/document-discard.mjs';

test('a clean close does not schedule or join unnecessary persistence work', async () => {
  const state = { scheduled: false, inFlight: false, requestedGeneration: 4, completedGeneration: 4 };
  let cancellations = 0;
  let flushes = 0;
  assert.equal(hasPendingPersistence(state), false);
  const result = await flushPersistenceBeforeClose({
    readState: () => state,
    cancelScheduled: () => { cancellations += 1; },
    flush: async () => { flushes += 1; }
  });
  assert.deepEqual(result, {
    flushed: false,
    persisted: true,
    targetGeneration: 4,
    completedGeneration: 4
  });
  assert.equal(cancellations, 0);
  assert.equal(flushes, 0);
});

test('close approval is bound to one fully persisted generation and current unsaved state', () => {
  const approved = {
    approvedGeneration: 4,
    scheduled: false,
    inFlight: false,
    requestedGeneration: 4,
    completedGeneration: 4,
    unsaved: false
  };
  assert.equal(canUsePersistenceCloseApproval(approved), true);
  assert.equal(canUsePersistenceCloseApproval({ ...approved, requestedGeneration: 5 }), false);
  assert.equal(canUsePersistenceCloseApproval({ ...approved, scheduled: true }), false);
  assert.equal(canUsePersistenceCloseApproval({ ...approved, inFlight: true }), false);
  assert.equal(canUsePersistenceCloseApproval({ ...approved, unsaved: true }), false);
  assert.equal(canUsePersistenceCloseApproval({ ...approved, approvedGeneration: null }), false);
});

test('close cancels a debounce and flushes its queued generation before continuing', async () => {
  const state = { scheduled: true, inFlight: false, requestedGeneration: 2, completedGeneration: 1 };
  let flushes = 0;
  const result = await flushPersistenceBeforeClose({
    readState: () => state,
    cancelScheduled: () => { state.scheduled = false; },
    flush: async () => { flushes += 1; state.completedGeneration = state.requestedGeneration; }
  });
  assert.equal(result.persisted, true);
  assert.equal(result.flushed, true);
  assert.equal(result.completedGeneration, 2);
  assert.equal(flushes, 1);
});

test('close joins an in-flight write and drains a newer generation queued while it runs', async () => {
  const state = { scheduled: false, inFlight: true, requestedGeneration: 1, completedGeneration: 0 };
  let flushes = 0;
  const result = await flushPersistenceBeforeClose({
    readState: () => state,
    cancelScheduled: () => { state.scheduled = false; },
    flush: async () => {
      flushes += 1;
      if (flushes === 1) {
        state.completedGeneration = 1;
        state.requestedGeneration = 2;
        state.scheduled = true;
      } else {
        state.completedGeneration = 2;
        state.inFlight = false;
      }
    }
  });
  assert.equal(result.persisted, true);
  assert.equal(result.targetGeneration, 2);
  assert.equal(result.completedGeneration, 2);
  assert.equal(flushes, 2);
});

test('close remains blocked when a queued generation could not be persisted', async () => {
  const state = { scheduled: true, inFlight: false, requestedGeneration: 8, completedGeneration: 7 };
  const result = await flushPersistenceBeforeClose({
    readState: () => state,
    cancelScheduled: () => { state.scheduled = false; },
    flush: async () => undefined
  });
  assert.deepEqual(result, {
    flushed: true,
    persisted: false,
    targetGeneration: 8,
    completedGeneration: 7
  });
});

test('close draining fails closed after bounded non-quiescent generations', async () => {
  const state = { scheduled: true, inFlight: false, requestedGeneration: 1, completedGeneration: 0 };
  let flushes = 0;
  const result = await flushPersistenceBeforeClose({
    readState: () => state,
    cancelScheduled: () => { state.scheduled = false; },
    flush: async () => {
      flushes += 1;
      state.completedGeneration = state.requestedGeneration;
      state.requestedGeneration += 1;
      state.scheduled = true;
    },
    maxPasses: 3
  });
  assert.deepEqual(result, {
    flushed: true,
    persisted: false,
    reason: 'non-quiescent',
    targetGeneration: 4,
    completedGeneration: 3
  });
  assert.equal(flushes, 3);
});

test('discarded document state is flushed before close and cannot resurrect on reload', async () => {
  const workspace = {
    tabs: { items: [{ id: 'tab-writer', documentId: 'document-writer', unsaved: true }] },
    documents: [{
      id: 'document-writer',
      content: { html: '<p>discard me</p>' },
      savedContent: { html: '<p>saved baseline</p>' },
      unsaved: true
    }]
  };
  const staleInFlightSnapshot = structuredClone(workspace);
  let persistedWorkspace = null;
  const persistence = { scheduled: false, inFlight: true, requestedGeneration: 1, completedGeneration: 0 };
  let flushes = 0;

  discardDocumentChanges(workspace, workspace.tabs.items[0]);
  workspace.tabs.items.splice(0, 1);
  persistence.requestedGeneration += 1;
  persistence.scheduled = true;
  const result = await flushPersistenceBeforeClose({
    readState: () => persistence,
    cancelScheduled: () => { persistence.scheduled = false; },
    flush: async () => {
      flushes += 1;
      if (flushes === 1) {
        persistedWorkspace = staleInFlightSnapshot;
        persistence.completedGeneration = 1;
        persistence.inFlight = false;
      } else {
        persistedWorkspace = structuredClone(workspace);
        persistence.completedGeneration = persistence.requestedGeneration;
      }
    }
  });

  assert.equal(result.persisted, true);
  assert.equal(flushes, 2);
  assert.deepEqual(persistedWorkspace.tabs.items, []);
  assert.deepEqual(persistedWorkspace.documents[0].content, { html: '<p>saved baseline</p>' });
  assert.equal(persistedWorkspace.documents[0].unsaved, false);
});
