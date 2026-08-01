import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkspaceSnapshot } from '../src/renderer/core/workspace-snapshot.mjs';

test('workspace persistence snapshots detach every nested value before an IPC round trip', () => {
  const state = {
    schemaVersion: 1,
    preferences: { theme: 'light', funny: { en: 1, yue: 2 } },
    tabs: { items: [{ id: 'tab-1', unsaved: false }] },
    documents: [{ id: 'document-1', content: { html: '<p>generation one</p>' } }],
    notifications: [
      { id: 'persisted', localOnly: false, message: 'keep' },
      { id: 'local', localOnly: true, message: 'drop' }
    ],
    runtime: { openMenu: 'file', menuAnchor: { x: 1 }, statusMessage: 'transient' }
  };

  const snapshot = createWorkspaceSnapshot(state);
  state.preferences.theme = 'dark';
  state.tabs.items[0].unsaved = true;
  state.documents[0].content.html = '<p>generation two</p>';
  state.notifications[0].message = 'mutated';

  assert.equal(snapshot.preferences.theme, 'light');
  assert.equal(snapshot.tabs.items[0].unsaved, false);
  assert.equal(snapshot.documents[0].content.html, '<p>generation one</p>');
  assert.deepEqual(snapshot.notifications, [{ id: 'persisted', localOnly: false, message: 'keep' }]);
  assert.deepEqual(snapshot.runtime, { openMenu: null, menuAnchor: null, statusMessage: '' });
});
