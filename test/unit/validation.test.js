import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationError } from '../../src/main/errors.js';
import { normalizeConversionTarget } from '../../src/main/libreoffice-service.js';
import {
  requireAbsolutePath,
  requireRevision,
  requireWorkspaceRevision,
  validateJsonValue,
  validateSettingsPatch
} from '../../src/main/validation.js';

test('settings validation normalizes known settings and preserves bounded extension data', () => {
  const patch = validateSettingsPatch({
    languageMode: 'bilingual',
    funnyLevelEnglish: 4,
    accentColor: '#6750A4',
    tabState: { pinned: ['home'], groups: [] }
  });
  assert.equal(patch.languageMode, 'bilingual');
  assert.equal(patch.funnyLevelEnglish, 4);
  assert.deepEqual(patch.tabState.pinned, ['home']);
  assert.deepEqual(patch.tabState.groups, []);
});

test('settings validation rejects invalid known values and prototype-like keys', () => {
  assert.throws(() => validateSettingsPatch({ funnyLevelEnglish: 7 }), ValidationError);
  const malicious = Object.create(null);
  malicious.__proto__ = 'blocked';
  assert.throws(() => validateSettingsPatch(malicious), ValidationError);
  assert.throws(() => validateSettingsPatch({ customEditors: [] }), /native picker/i);
  assert.throws(
    () => validateSettingsPatch({ libreOfficeExecutableOverride: 'C:\\LibreOffice\\program\\soffice.exe' }),
    /native picker/i
  );
  assert.deepEqual(
    validateSettingsPatch({ customEditors: [] }, { allowProtected: true }).customEditors,
    []
  );
});

test('JSON validation enforces aggregate node and depth bounds', () => {
  assert.throws(
    () => validateJsonValue(Array.from({ length: 21 }, () => 1), { maxNodes: 20 }),
    /too complex/i
  );
  assert.throws(
    () => validateJsonValue({ one: { two: { three: true } } }, { maxDepth: 2 }),
    /too complex/i
  );
});

test('path and revision validation reject relative paths and revision expressions', () => {
  assert.throws(() => requireAbsolutePath('relative\\document.odt'), ValidationError);
  assert.throws(() => requireRevision('HEAD~1'), ValidationError);
  assert.equal(requireRevision('ABCDEF1'), 'abcdef1');
  const workspaceRevision = '12345678-1234-1234-1234-123456789abc';
  assert.equal(requireWorkspaceRevision(workspaceRevision), workspaceRevision);
  assert.throws(() => requireWorkspaceRevision(workspaceRevision.toUpperCase()), ValidationError);
  assert.throws(() => requireWorkspaceRevision(` ${workspaceRevision}`), ValidationError);
});

test('conversion targets are a strict allowlist and block arbitrary filter strings', () => {
  assert.deepEqual(normalizeConversionTarget('PDF'), {
    name: 'pdf',
    argument: 'pdf',
    extension: '.pdf'
  });
  assert.throws(() => normalizeConversionTarget('pdf:writer_pdf_Export'), ValidationError);
  assert.throws(() => normalizeConversionTarget('exe'), ValidationError);
  assert.throws(() => normalizeConversionTarget('html'), ValidationError);
});
