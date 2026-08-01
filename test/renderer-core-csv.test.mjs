import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv, parseCsvRecords } from '../src/renderer/core/csv.mjs';

test('CSV parser handles Unicode, quoted commas, escaped quotes, and embedded newlines', () => {
  const rows = parseCsv('id,name,contact,status,value\r\nC-1,"蝦餃, Ltd.","Ada ""A"" Wong",Active,"12\n800"');
  assert.deepEqual(rows, [
    ['id', 'name', 'contact', 'status', 'value'],
    ['C-1', '蝦餃, Ltd.', 'Ada "A" Wong', 'Active', '12\n800']
  ]);
});

test('CSV record mapping accepts headers, supplies stable IDs, and resolves duplicates', () => {
  const records = parseCsvRecords('name,id,status\nAlpha,C-1,Active\nBeta,C-1,Lead\nGamma,,Paused');
  assert.deepEqual(records.map(({ id, name, status }) => ({ id, name, status })), [
    { id: 'C-1', name: 'Alpha', status: 'Active' },
    { id: 'C-1-2', name: 'Beta', status: 'Lead' },
    { id: 'C-003', name: 'Gamma', status: 'Paused' }
  ]);
});

test('CSV parser rejects malformed and adversarial input', () => {
  assert.throws(() => parseCsv('a,"unterminated'), /inside a quoted field/i);
  assert.throws(() => parseCsv(`a,${'x'.repeat(20_001)}`), /cell exceeds/i);
  assert.throws(() => parseCsv('a\0b'), /null character/i);
});
