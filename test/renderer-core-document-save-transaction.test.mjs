import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginDocumentSave,
  resolveDocumentSaveTarget,
  rollbackDocumentSave
} from '../src/renderer/core/document-save-transaction.mjs';

function fixture() {
  return {
    tabs: {
      items: [{ id: 'tab-writer', documentId: 'document-writer', unsaved: true }]
    },
    documents: [{
      id: 'document-writer',
      title: 'Report',
      content: { html: '<p>current edit</p>' },
      savedContent: { html: '<p>last saved</p>' },
      updatedAt: '2026-07-31T20:00:00.000Z',
      unsaved: true
    }]
  };
}

test('document save transaction records stable IDs and marks the current state saved', () => {
  const state = fixture();
  const transaction = beginDocumentSave(state, 'tab-writer', '2026-07-31T21:00:00.000Z');
  assert.deepEqual(transaction, {
    tabId: 'tab-writer',
    documentId: 'document-writer',
    previousSavedContent: { html: '<p>last saved</p>' },
    previousUpdatedAt: '2026-07-31T20:00:00.000Z',
    previousDocumentUnsaved: true,
    previousTabUnsaved: true,
    attemptedSavedContent: { html: '<p>current edit</p>' },
    attemptedUpdatedAt: '2026-07-31T21:00:00.000Z'
  });
  assert.deepEqual(state.documents[0].savedContent, { html: '<p>current edit</p>' });
  assert.equal(state.documents[0].unsaved, false);
  assert.equal(state.tabs.items[0].unsaved, false);
});

test('failed save rollback re-resolves live document and tab after whole-state replacement', () => {
  const replacedState = fixture();
  const transaction = beginDocumentSave(replacedState, 'tab-writer', '2026-07-31T21:00:00.000Z');
  const staleDocument = replacedState.documents[0];
  const staleTab = replacedState.tabs.items[0];

  const liveState = structuredClone(replacedState);
  liveState.documents[0].content = { html: '<p>current edit remains open</p>' };
  const resolved = resolveDocumentSaveTarget(liveState, transaction);
  assert.equal(resolved.documentRecord, liveState.documents[0]);
  assert.equal(resolved.tab, liveState.tabs.items[0]);

  assert.deepEqual(rollbackDocumentSave(liveState, transaction), {
    documentRestored: true,
    tabRestored: true
  });
  assert.deepEqual(liveState.documents[0].content, { html: '<p>current edit remains open</p>' });
  assert.deepEqual(liveState.documents[0].savedContent, { html: '<p>last saved</p>' });
  assert.equal(liveState.documents[0].updatedAt, '2026-07-31T20:00:00.000Z');
  assert.equal(liveState.documents[0].unsaved, true);
  assert.equal(liveState.tabs.items[0].unsaved, true);
  assert.equal(staleDocument.unsaved, false);
  assert.equal(staleTab.unsaved, false);
});

test('rollback never marks a replacement tab that now belongs to another document', () => {
  const state = fixture();
  const transaction = beginDocumentSave(state, 'tab-writer');
  const replacement = structuredClone(state);
  replacement.tabs.items[0].documentId = 'document-other';
  replacement.tabs.items[0].unsaved = false;
  assert.deepEqual(rollbackDocumentSave(replacement, transaction), {
    documentRestored: true,
    tabRestored: false
  });
  assert.equal(replacement.documents[0].unsaved, true);
  assert.equal(replacement.tabs.items[0].unsaved, false);
});

test('rollback preserves a newer live saved baseline that does not belong to the failed attempt', () => {
  const state = fixture();
  const transaction = beginDocumentSave(state, 'tab-writer', '2026-07-31T21:00:00.000Z');
  const replacement = structuredClone(state);
  replacement.documents[0].savedContent = { html: '<p>newer saved baseline</p>' };
  replacement.documents[0].updatedAt = '2026-07-31T22:00:00.000Z';

  assert.deepEqual(rollbackDocumentSave(replacement, transaction), {
    documentRestored: false,
    tabRestored: false
  });
  assert.deepEqual(replacement.documents[0].savedContent, { html: '<p>newer saved baseline</p>' });
  assert.equal(replacement.documents[0].updatedAt, '2026-07-31T22:00:00.000Z');
  assert.equal(replacement.documents[0].unsaved, false);
  assert.equal(replacement.tabs.items[0].unsaved, false);
});

test('failed persistence of an already-clean document does not manufacture unsaved work', () => {
  const state = fixture();
  state.documents[0].content = structuredClone(state.documents[0].savedContent);
  state.documents[0].unsaved = false;
  state.tabs.items[0].unsaved = false;
  const transaction = beginDocumentSave(state, 'tab-writer', '2026-07-31T21:00:00.000Z');

  assert.deepEqual(rollbackDocumentSave(state, transaction), {
    documentRestored: true,
    tabRestored: true
  });
  assert.equal(state.documents[0].unsaved, false);
  assert.equal(state.tabs.items[0].unsaved, false);
  assert.deepEqual(state.documents[0].savedContent, { html: '<p>last saved</p>' });
  assert.equal(state.documents[0].updatedAt, '2026-07-31T20:00:00.000Z');
});
