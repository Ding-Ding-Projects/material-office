import assert from 'node:assert/strict';
import test from 'node:test';

import { createBulkCloseSafetyKey } from '../src/renderer/core/bulk-close-safety.mjs';

function fixture() {
  return {
    activeId: 'report',
    items: [{ id: 'report', label: 'Report', title: 'Quarterly report', groupId: 'work', pinned: false, unsaved: false }],
    groups: [{ id: 'work', pinned: false }]
  };
}

const preview = { query: 'report', mode: 'plain', pattern: '', flags: 'i', inverse: false, includePinned: false, affectedIds: ['report'] };

test('bulk-close safety key is stable across detached but identical workspace state', () => {
  assert.equal(createBulkCloseSafetyKey(fixture(), preview), createBulkCloseSafetyKey(structuredClone(fixture()), structuredClone(preview)));
});

test('bulk-close safety key invalidates on every close-sensitive concurrent change', () => {
  const baseline = createBulkCloseSafetyKey(fixture(), preview);
  for (const mutate of [
    (state) => { state.items[0].label = 'Renamed report'; },
    (state) => { state.items[0].pinned = true; },
    (state) => { state.items[0].unsaved = true; },
    (state) => { state.groups[0].pinned = true; },
    (state) => { state.items.push({ id: 'new', label: 'New', pinned: false, unsaved: false }); }
  ]) {
    const changed = fixture(); mutate(changed);
    assert.notEqual(createBulkCloseSafetyKey(changed, preview), baseline);
  }
  assert.notEqual(createBulkCloseSafetyKey(fixture(), { ...preview, inverse: true }), baseline);
});
