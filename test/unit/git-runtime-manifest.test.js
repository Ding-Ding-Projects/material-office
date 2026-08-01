import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GIT_FOR_WINDOWS_RELEASE,
  GIT_RUNTIME_EXPECTED_PATHS,
  GIT_RUNTIME_LICENSES,
  GIT_RUNTIME_PAYLOAD,
  GIT_RUNTIME_SOURCE_ASSETS,
  MINGW_RECIPES
} from '../../scripts/git-runtime-manifest.mjs';

test('minimal Git runtime allowlist contains exactly one executable and its four non-system DLLs', () => {
  assert.deepEqual(GIT_RUNTIME_PAYLOAD.map((entry) => entry.path), [
    'mingw64/bin/git.exe',
    'mingw64/bin/libiconv-2.dll',
    'mingw64/bin/libintl-8.dll',
    'mingw64/bin/libpcre2-8-0.dll',
    'mingw64/bin/zlib1.dll'
  ]);
  assert.equal(GIT_RUNTIME_PAYLOAD.filter((entry) => entry.path.endsWith('.exe')).length, 1);
  assert.equal(GIT_RUNTIME_EXPECTED_PATHS.some((entry) => /(?:gcm|credential|bash|usr\/bin|cmd\/)/i.test(entry)), false);
  assert.equal(new Set(GIT_RUNTIME_PAYLOAD.map((entry) => entry.sha256)).size, 5);
  assert.equal(GIT_FOR_WINDOWS_RELEASE.archiveBytes, 38_791_206);
});

test('runtime legal payload includes exact license trees and the official MinGit package manifest', () => {
  const targets = GIT_RUNTIME_LICENSES.map((entry) => entry.target);
  for (const expected of [
    'legal/licenses/git/COPYING',
    'legal/licenses/libiconv/COPYING.LIB',
    'legal/licenses/gettext-runtime/intl/COPYING.LIB',
    'legal/licenses/pcre2/LICENCE.md',
    'legal/licenses/zlib/LICENSE',
    'legal/min-git-package-versions.txt'
  ]) {
    assert.ok(targets.includes(expected), expected);
  }
  assert.ok(GIT_RUNTIME_LICENSES.every((entry) => Number.isSafeInteger(entry.bytes) && entry.bytes > 0));
  assert.ok(GIT_RUNTIME_LICENSES.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));
});

test('corresponding-source gate pins official Git-for-Windows and GNU assets plus exact recipes', () => {
  assert.equal(MINGW_RECIPES.repository, 'https://github.com/git-for-windows/MINGW-packages.git');
  assert.match(MINGW_RECIPES.commit, /^[a-f0-9]{40}$/);
  assert.match(MINGW_RECIPES.archiveSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(GIT_RUNTIME_SOURCE_ASSETS.filter((entry) => !entry.name.endsWith('.sig')).map((entry) => entry.name), [
    'mingw-w64-git-2.55.0.3-1.src.tar.gz',
    'libiconv-1.19.tar.gz',
    'gettext-1.0.tar.lz'
  ]);
  assert.ok(GIT_RUNTIME_SOURCE_ASSETS.every((entry) => /^https:\/\/(?:github\.com\/git-for-windows\/git|ftp\.gnu\.org)\//.test(entry.url)));
  assert.ok(GIT_RUNTIME_SOURCE_ASSETS.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256) && entry.bytes > 0));
});
