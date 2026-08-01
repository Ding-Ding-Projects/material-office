import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReleaseState } from '../scripts/prepare-pages-release.mjs';

test('local Pages data stays a truthful unpublished candidate', () => {
  assert.deepEqual(buildReleaseState({}), {
    schemaVersion: 1,
    status: 'candidate',
    version: '0.1.0',
    tag: null,
    codeName: 'Classic Har Gow · 蝦餃',
    releaseUrl: null,
    installerName: null,
    installerUrl: null
  });
});

test('a successful workflow prepares stable published release and installer links', () => {
  assert.deepEqual(buildReleaseState({
    MATERIAL_OFFICE_RELEASE_STATE: 'published',
    MATERIAL_OFFICE_VERSION: '0.1.0',
    MATERIAL_OFFICE_RELEASE_TAG: 'v0.1.0-build.42.attempt.2',
    MATERIAL_OFFICE_REPOSITORY: 'Ding-Ding-Projects/material-office',
    MATERIAL_OFFICE_INSTALLER_NAME: 'Material-Office-0.1.0-x64-Setup.exe'
  }), {
    schemaVersion: 1,
    status: 'published',
    version: '0.1.0',
    tag: 'v0.1.0-build.42.attempt.2',
    codeName: 'Classic Har Gow · 蝦餃',
    releaseUrl: 'https://github.com/Ding-Ding-Projects/material-office/releases/tag/v0.1.0-build.42.attempt.2',
    installerName: 'Material-Office-0.1.0-x64-Setup.exe',
    installerUrl: 'https://github.com/Ding-Ding-Projects/material-office/releases/download/v0.1.0-build.42.attempt.2/Material-Office-0.1.0-x64-Setup.exe'
  });
});

test('published release data rejects an unexpected repository or unsafe installer path', () => {
  const base = {
    MATERIAL_OFFICE_RELEASE_STATE: 'published',
    MATERIAL_OFFICE_VERSION: '0.1.0',
    MATERIAL_OFFICE_RELEASE_TAG: 'v0.1.0-build.42.attempt.2',
    MATERIAL_OFFICE_REPOSITORY: 'Ding-Ding-Projects/material-office',
    MATERIAL_OFFICE_INSTALLER_NAME: 'Material-Office-0.1.0-x64-Setup.exe'
  };
  assert.throws(() => buildReleaseState({ ...base, MATERIAL_OFFICE_REPOSITORY: 'someone/else' }), /unexpected repository/);
  assert.throws(() => buildReleaseState({ ...base, MATERIAL_OFFICE_INSTALLER_NAME: '../Material-Office.exe' }), /Invalid Windows installer name/);
});
