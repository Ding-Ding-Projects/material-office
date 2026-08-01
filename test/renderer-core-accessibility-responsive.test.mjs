import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { renderBase, renderDraw } from '../src/renderer/ui/surfaces-documents.mjs';
import { renderSettings } from '../src/renderer/ui/surfaces-tools.mjs';

const APP_URL = new URL('../src/renderer/app.mjs', import.meta.url);
const POPOVERS_URL = new URL('../src/renderer/ui/popovers.mjs', import.meta.url);
const STYLES_URL = new URL('../src/renderer/styles.css', import.meta.url);

const t = (key) => key;

test('Draw exposes each SVG object as a named, selectable keyboard control', () => {
  const html = renderDraw({
    state: { runtime: { drawTool: 'select', selectedShape: 'shape-1' }, preferences: {} },
    document: {
      id: 'draw-1',
      title: 'Keyboard drawing',
      content: { shapes: [{ id: 'shape-1', type: 'rect', x: 12, y: 24, width: 80, height: 60 }] },
    },
    t,
  });

  assert.match(html, /<svg[^>]+role="group"[^>]+aria-describedby="draw-canvas-help"/);
  assert.match(html, /<rect[^>]+data-shape-id="shape-1"[^>]+tabindex="0"[^>]+role="button"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-label="Rectangle 1, x 12, y 24"/);
  assert.match(html, /aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight Delete Backspace Control\+D"/);
});

test('Draw and Base keyboard handlers cover object operations and query-row activation', async () => {
  const source = await readFile(APP_URL, 'utf8');
  assert.match(source, /tr\[data-action="base-select-record"\]/);
  assert.match(source, /queryRow\.click\(\)/);
  assert.match(source, /isDeleteKey[\s\S]*isDuplicateKey[\s\S]*directions/);
  assert.match(source, /moveShapeWithKeyboard\(shape, direction\[0\] \* step, direction\[1\] \* step\)/);
  assert.match(source, /'data-shape-id'/);

  const html = renderBase({
    state: {
      runtime: { baseSection: 'Queries', selectedBaseRecord: 'C-001', baseQuery: { field: 'name', operator: 'contains', value: '', active: false } },
      preferences: {},
      searches: { base: {} },
    },
    document: { id: 'base-1', title: 'Records', content: { rows: [{ id: 'C-001', name: 'Ada', contact: 'ada@example.test', status: 'Active', value: '1' }] } },
    filterCollection: (items) => items,
    renderSearchBox: () => '<label>Search<input></label>',
    t,
  });
  assert.match(html, /<table[^>]+aria-label="Query results"/);
  assert.match(html, /<tr[^>]+data-action="base-select-record"[^>]+tabindex="0"[^>]+aria-keyshortcuts="Enter Space"/);
  assert.match(html, /aria-label="Open record C-001: Ada"/);
});

test('settings switches and ranges have localized accessible names', () => {
  const state = {
    runtime: { settingsSection: 'notifications' },
    searches: { 'settings-notifications': {}, 'settings-accessibility': {}, 'settings-language': {} },
    preferences: { language: 'en', funny: { en: 2, yue: 3 }, narrator: { enabled: false, language: 'en' }, scale: 150 },
  };
  const context = { state, t, libreOffice: { available: false }, externalEditors: [] };

  const notifications = renderSettings(context);
  assert.match(notifications, /role="switch" aria-label="settings\.dimSum"/);
  assert.match(notifications, /role="switch" aria-label="settings\.narrator"/);

  state.runtime.settingsSection = 'accessibility';
  const accessibility = renderSettings(context);
  assert.match(accessibility, /role="switch" aria-label="settings\.reducedMotion"/);
  assert.match(accessibility, /type="range"[^>]+data-action="set-scale"[^>]+aria-label="settings\.scale"/);

  state.runtime.settingsSection = 'language';
  const language = renderSettings(context);
  assert.match(language, /type="range"[^>]+data-language="en"[^>]+aria-label="settings\.englishFunny"/);
  assert.match(language, /type="range"[^>]+data-language="yue"[^>]+aria-label="settings\.yueFunny"/);
});

test('narrow layouts stack property and detail panes instead of hiding required actions', async () => {
  const css = await readFile(STYLES_URL, 'utf8');
  const narrow = css.slice(css.indexOf('@media (max-width: 980px)'), css.indexOf('@media (max-width: 720px)'));
  assert.doesNotMatch(narrow, /\.properties-panel\s*\{[^}]*display:\s*none/s);
  assert.doesNotMatch(narrow, /\.detail-pane\s*\{[^}]*display:\s*none/s);
  assert.match(narrow, /\.impress-workspace > \.properties-panel\s*\{[^}]*display:\s*block[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(narrow, /\.draw-workspace > \.properties-panel\s*\{[^}]*display:\s*block[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(narrow, /\.base-layout > \.detail-pane[^}]*\{[^}]*display:\s*block[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(narrow, /grid-template-rows:\s*minmax\(320px, 56vh\) auto/);
});

test('decision dialogs alone are modal, inert the background, trap Tab, and restore focus', async () => {
  const source = await readFile(POPOVERS_URL, 'utf8');
  assert.match(source, /aria-modal="\$\{decision \? 'true' : 'false'\}"/);
  assert.match(source, /if \(decision\)[\s\S]*element\.inert = true/);
  assert.match(source, /event\.key !== 'Tab' \|\| !decision/);
  assert.match(source, /document\.addEventListener\('focusin', keepDecisionFocus, true\)/);
  assert.match(source, /returnFocus\?\.isConnected[\s\S]*returnFocus\.focus/);
  assert.match(source, /snapshot\.element\.inert = snapshot\.value/);
});
