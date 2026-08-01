import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const APP_PATH = new URL('../src/renderer/app.mjs', import.meta.url);
const UI_PATHS = [
  new URL('../src/renderer/ui/helpers.mjs', import.meta.url),
  new URL('../src/renderer/ui/surfaces-documents.mjs', import.meta.url),
  new URL('../src/renderer/ui/surfaces-tools.mjs', import.meta.url)
];

test('every statically rendered product action has an explicit renderer handler', () => {
  const app = fs.readFileSync(APP_PATH, 'utf8');
  const ui = UI_PATHS.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const actions = [...ui.matchAll(/data-action="([a-z][a-z0-9:-]*)"/g)].map((match) => match[1]);
  const cases = new Set([...app.matchAll(/case '([a-z][a-z0-9:-]*)'/g)].map((match) => match[1]));
  const matchedSelectors = new Set([...app.matchAll(/data-action=\\?"([a-z][a-z0-9:-]*)\\?"/g)].map((match) => match[1]));
  const intentionallyDelegated = new Set([
    'align-center', 'align-left', 'align-right', 'bold', 'copy', 'cut', 'italic',
    'list-bullets', 'list-numbers', 'paste', 'redo', 'select-all', 'strike',
    'style-default', 'style-h1', 'style-h2', 'underline', 'undo'
  ]);
  const missing = [...new Set(actions)].filter((action) => !cases.has(action) && !matchedSelectors.has(action) && !intentionallyDelegated.has(action)).sort();
  assert.deepEqual(missing, []);
});
