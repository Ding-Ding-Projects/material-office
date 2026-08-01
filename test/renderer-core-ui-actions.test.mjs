import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { STATIC_COMMAND_CAPABILITIES } from '../src/renderer/core/command-capabilities.mjs';
import { renderComponents } from '../src/renderer/ui/surfaces-tools.mjs';

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

test('every enabled direct menu command reaches the delegated click switch', () => {
  const app = fs.readFileSync(APP_PATH, 'utf8');
  const cases = new Set([...app.matchAll(/case '([a-z][a-z0-9:-]*)'/g)].map((match) => match[1]));
  const missing = Object.entries(STATIC_COMMAND_CAPABILITIES)
    .filter(([, capability]) => capability.enabled && capability.handler === 'direct')
    .map(([action]) => action)
    .filter((action) => !cases.has(action));
  assert.deepEqual(missing, []);
});

test('native demo controls do not fall through to command warnings', () => {
  const app = fs.readFileSync(APP_PATH, 'utf8');
  assert.match(app, /if \(target\.matches\('input, select, textarea, option'\)\) return;/);
});

test('component density and progress demos render their persisted live values', () => {
  const html = renderComponents({
    state: {
      preferences: { density: 'comfortable' },
      runtime: { componentDemo: { check: true, radio: 'design', toggle: true, slider: 37, field: 'Demo' } }
    },
    t: (key) => key,
    l: (english, _cantonese, facts = {}) => english.replace(/\{([A-Za-z][A-Za-z0-9_.-]*)\}/g, (token, name) => Object.hasOwn(facts, name) ? String(facts[name]) : token)
  });
  assert.match(html, /<option value="comfortable" selected>/);
  assert.match(html, /<output data-demo-slider-value>37<\/output>%/);
  assert.match(html, /<progress max="100" value="37"/);
  assert.match(html, /data-action="copy-token"[^>]+data-token-value="var\(--primary\)"[^>]+aria-label="Copy Primary token var\(--primary\)"/);
});
