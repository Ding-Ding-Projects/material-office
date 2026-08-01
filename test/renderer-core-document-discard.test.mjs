import assert from 'node:assert/strict';
import test from 'node:test';

import { discardDocumentChanges } from '../src/renderer/core/document-discard.mjs';

test('discard restores a saved document baseline without aliasing it', () => {
  const baseline = { html: '<p>Saved</p>', nested: { value: 1 } };
  const documentRecord = {
    id: 'writer-1',
    content: { html: '<p>Unsaved</p>', nested: { value: 2 } },
    savedContent: baseline,
    unsaved: true
  };
  const tab = { documentId: documentRecord.id, unsaved: true };
  const state = { documents: [documentRecord] };

  assert.deepEqual(discardDocumentChanges(state, tab), {
    removed: false,
    restored: true,
    documentId: 'writer-1'
  });
  assert.deepEqual(documentRecord.content, baseline);
  assert.notEqual(documentRecord.content, baseline);
  assert.equal(documentRecord.unsaved, false);
  assert.equal(tab.unsaved, false);
});

test('discard removes a never-saved document and clears orphan tab state', () => {
  const state = {
    documents: [{ id: 'new-1', content: { html: 'draft' }, savedContent: null, unsaved: true }]
  };
  const tab = { documentId: 'new-1', unsaved: true };
  assert.equal(discardDocumentChanges(state, tab).removed, true);
  assert.deepEqual(state.documents, []);
  assert.equal(tab.unsaved, false);

  const orphan = { documentId: 'missing', unsaved: true };
  assert.equal(discardDocumentChanges(state, orphan).restored, false);
  assert.equal(orphan.unsaved, false);
});
