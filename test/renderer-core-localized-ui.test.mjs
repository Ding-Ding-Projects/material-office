import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  LocalizationError,
  htmlLanguageForMode,
  renderLocalizedCopy,
} from '../src/renderer/core/localization.mjs';
import { renderBase, renderDraw } from '../src/renderer/ui/surfaces-documents.mjs';
import { renderChangelog, renderCommands, renderHistory, renderSettings } from '../src/renderer/ui/surfaces-tools.mjs';

const APP_URL = new URL('../src/renderer/app.mjs', import.meta.url);

function localizer(mode, funnyLevels = { en: 1, yue: 1 }) {
  return (english, cantonese, facts = {}, options = {}) => renderLocalizedCopy([english, cantonese], {
    mode,
    funnyLevels,
    facts,
    ...options,
  });
}

test('safe inline copy renders all three modes and preserves technical facts', () => {
  const pair = ['Could not open {name}: {reason}.', '無法開啟 {name}：{reason}。'];
  const facts = { name: 'Q3.odt', reason: 'E_LOCKED_17' };
  assert.equal(renderLocalizedCopy(pair, { mode: 'en', facts }), 'Could not open Q3.odt: E_LOCKED_17.');
  assert.equal(renderLocalizedCopy(pair, { mode: 'yue', facts }), '無法開啟 Q3.odt：E_LOCKED_17。');
  const bilingual = renderLocalizedCopy(pair, { mode: 'bilingual', facts });
  assert.match(bilingual, /Could not open Q3\.odt/);
  assert.match(bilingual, /無法開啟 Q3\.odt/);
  assert.equal((bilingual.match(/E_LOCKED_17/g) ?? []).length, 2);
  assert.throws(
    () => renderLocalizedCopy(['Error {reason}', '錯誤'], { facts }),
    (error) => error instanceof LocalizationError && error.code === 'PLACEHOLDER_MISMATCH',
  );
});

test('levels 1 and 5 independently style every notification category without changing facts', () => {
  for (const category of ['error', 'warning', 'success', 'info']) {
    const pair = ['Fact {id}.', '事實 {id}。'];
    const enOne = renderLocalizedCopy(pair, { mode: 'en', category, facts: { id: 'BUILD-17' }, funnyLevels: { en: 1, yue: 5 } });
    const enFive = renderLocalizedCopy(pair, { mode: 'en', category, facts: { id: 'BUILD-17' }, funnyLevels: { en: 5, yue: 1 } });
    const yueOne = renderLocalizedCopy(pair, { mode: 'yue', category, facts: { id: 'BUILD-17' }, funnyLevels: { en: 5, yue: 1 } });
    const yueFive = renderLocalizedCopy(pair, { mode: 'yue', category, facts: { id: 'BUILD-17' }, funnyLevels: { en: 1, yue: 5 } });
    assert.notEqual(enOne, enFive, `${category} English levels should differ`);
    assert.notEqual(yueOne, yueFive, `${category} Cantonese levels should differ`);
    for (const rendered of [enOne, enFive, yueOne, yueFive]) assert.match(rendered, /BUILD-17/);
  }
  const independent = renderLocalizedCopy(['Notice {id}.', '通知 {id}。'], {
    mode: 'bilingual', category: 'info', facts: { id: 'N-9' }, funnyLevels: { en: 1, yue: 5 }, bilingualSeparator: '\n',
  });
  assert.equal(independent.startsWith('Notice N-9.\n'), true);
  assert.match(independent, /啲像素/);
});

test('HTML language follows the primary language and exposes bilingual mode separately', async () => {
  assert.equal(htmlLanguageForMode('en'), 'en-CA');
  assert.equal(htmlLanguageForMode('yue'), 'zh-HK');
  assert.equal(htmlLanguageForMode('bilingual'), 'en-CA');
  const source = await readFile(APP_URL, 'utf8');
  assert.match(source, /root\.lang = htmlLanguageForMode\(state\.preferences\.language\)/);
  assert.match(source, /root\.dataset\.languageMode = state\.preferences\.language/);
});

test('representative document, tool, settings, and changelog surfaces change language', () => {
  const yue = localizer('yue');
  const bilingual = localizer('bilingual');
  const t = (key) => key;

  const draw = renderDraw({
    state: { runtime: { selectedShape: 's1', drawTool: 'select' }, preferences: {} },
    document: { id: 'd1', title: 'Facts.odg', content: { shapes: [{ id: 's1', type: 'rect', x: 1, y: 2, width: 10, height: 10 }] } },
    t, l: yue,
  });
  assert.match(draw, /繪圖工具/);
  assert.match(draw, /矩形 1/);
  assert.match(draw, /Facts\.odg/);

  const baseState = { runtime: { baseSection: 'Queries', selectedBaseRecord: 'C-001', baseQuery: { field: 'name', operator: 'contains', value: '', active: false } }, preferences: {}, searches: { base: {} } };
  const base = renderBase({
    state: baseState,
    document: { id: 'b1', title: 'Clients', content: { rows: [{ id: 'C-001', name: 'Northwind', contact: 'Ada', status: 'Active', value: '7' }] } },
    filterCollection: (items) => items, renderSearchBox: () => '<input>', t, l: yue,
  });
  assert.match(base, /查詢/);
  assert.match(base, /運算條件/);
  assert.match(base, /Northwind/);

  const features = [{ id: 'uno-1', name: 'Bold', scope: 'Writer', area: 'Format', command: '.uno:Bold' }];
  const commands = renderCommands({ state: { runtime: {}, searches: { commands: {} } }, t, l: yue, features, filterCollection: (items) => items, libreOffice: { available: true } });
  assert.match(commands, /所有功能/);
  assert.match(commands, /\.uno:Bold/);

  const history = renderHistory({
    state: { runtime: {}, searches: { history: {} }, history: { entries: [{ id: 'r1', hash: 'abc123', action: 'updated', label: 'Saved Budget', entityTitle: 'Budget.ods', createdAt: '2026-07-31T00:00:00Z' }] } },
    t, l: yue, filterCollection: (items) => items, formatDateTime: () => '2026-07-31',
  });
  assert.match(history, /data-action="open-date-range"/);
  assert.match(history, /開啟進階日期範圍日曆/);
  assert.match(history, /abc123/);

  const settings = renderSettings({ state: { runtime: { settingsSection: 'appearance' }, searches: { 'settings-appearance': {} }, preferences: {} }, t, l: yue, externalEditors: [], libreOffice: { available: false } });
  assert.match(settings, /淺色/);
  assert.match(settings, /跟隨系統/);

  const changelog = renderChangelog({ state: { runtime: {}, searches: { changelog: {} } }, t, l: bilingual, filterCollection: (items) => items });
  assert.match(changelog, /Windows Electron workspace/);
  assert.match(changelog, /Windows Electron 工作間/);
  assert.match(changelog, /Classic Har Gow · 蝦餃/);
  assert.match(changelog, /0\.1\.0/);
});
