import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('desktop package pins the Windows Electron toolchain and secure entry files exist', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.type, 'module');
  assert.deepEqual(manifest.os, ['win32']);
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.author, 'Ding-Ding Projects');
  assert.equal(manifest.repository.url, 'git+https://github.com/Ding-Ding-Projects/material-office.git');
  assert.equal(manifest.devDependencies.electron, '43.2.0');
  assert.equal(manifest.devDependencies['electron-builder'], '26.15.3');
  assert.equal(manifest.devDependencies['@electron/fuses'], '2.1.3');
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.build.win.target[0].target, 'nsis');
  assert.equal(manifest.build.win.icon, 'src/renderer/assets/dim-sum/hk-dish-0001-classic-har-gow.png');
  assert.equal(manifest.build.win.requestedExecutionLevel, 'asInvoker');
  assert.equal(manifest.build.nsis.perMachine, false);
  assert.equal(manifest.build.nsis.allowElevation, false);
  assert.equal(manifest.scripts['dist:win'], 'npm run prepare:git-runtime && electron-builder --win nsis');
  assert.equal(manifest.scripts['prepare:git-sources'], 'node scripts/prepare-git-runtime-sources.mjs');
  assert.equal(manifest.scripts['verify:git-runtime'], 'node scripts/verify-git-runtime.mjs');
  assert.ok(manifest.build.extraResources.some((resource) =>
    resource.from === 'build-tools/git-runtime' && resource.to === 'tools/git'
  ));
  for (const [from, to] of [
    ['LICENSE', 'legal/LICENSE.txt'],
    ['THIRD_PARTY_NOTICES.md', 'legal/THIRD_PARTY_NOTICES.md'],
    ['docs/legal/classic-har-gow-provenance.json', 'legal/classic-har-gow-provenance.json'],
    ['node_modules/electron/LICENSE', 'legal/ELECTRON_LICENSE.txt']
  ]) {
    assert.ok(manifest.build.extraResources.some((resource) => resource.from === from && resource.to === to));
  }
  await Promise.all([
    fs.stat(path.join(repositoryRoot, manifest.main)),
    fs.stat(path.join(repositoryRoot, 'src', 'preload.cjs')),
    fs.stat(path.join(repositoryRoot, 'scripts', 'prepare-git-runtime.mjs')),
    fs.stat(path.join(repositoryRoot, 'scripts', 'prepare-git-runtime-sources.mjs')),
    fs.stat(path.join(repositoryRoot, 'scripts', 'verify-git-runtime.mjs'))
  ]);
});

test('packaging excludes generated Python caches and hardens Electron fuses', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.ok(packageJson.build.files.includes('!src/**/__pycache__/**'));
  assert.ok(packageJson.build.files.includes('!src/**/*.pyc'));
  assert.deepEqual(packageJson.build.electronFuses, {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    loadBrowserProcessSpecificV8Snapshot: false,
    grantFileProtocolExtraPrivileges: false
  });
});

test('desktop and landing legal assets exactly mirror the canonical files', async () => {
  const copies = [
    ['LICENSE', 'src/renderer/assets/legal/LICENSE.txt', 'landing/public/legal/LICENSE.txt'],
    ['THIRD_PARTY_NOTICES.md', 'src/renderer/assets/legal/THIRD_PARTY_NOTICES.md', 'landing/public/legal/THIRD_PARTY_NOTICES.md'],
    ['docs/legal/classic-har-gow-provenance.json', 'src/renderer/assets/legal/classic-har-gow-provenance.json', 'landing/public/legal/classic-har-gow-provenance.json']
  ];
  for (const [canonical, ...mirrors] of copies) {
    const expected = await fs.readFile(path.join(repositoryRoot, canonical));
    for (const mirror of mirrors) {
      assert.deepEqual(await fs.readFile(path.join(repositoryRoot, mirror)), expected, `${mirror} drifted from ${canonical}`);
    }
  }
});

test('release workflow covers every branch push and dispatch without tag-trigger loops', async () => {
  const workflow = await fs.readFile(path.join(repositoryRoot, '.github', 'workflows', 'build-release.yml'), 'utf8');
  assert.match(workflow, /on:\s*\r?\n\s+push:\s*\r?\n\s+branches:\s*\r?\n\s+- "\*\*"\s*\r?\n\s+workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /^\s+tags(?:-ignore)?:/mu);
  assert.match(workflow, /concurrency:[\s\S]*?cancel-in-progress:\s*false/u);
  const pagesJob = /\r?\n  pages:\r?\n([\s\S]*?)\r?\n  release:/u.exec(workflow)?.[1] ?? '';
  const releaseJob = /\r?\n  release:\r?\n([\s\S]*)$/u.exec(workflow)?.[1] ?? '';
  assert.match(pagesJob, /needs:[\s\S]*?- release\s/u);
  assert.match(pagesJob, /needs\.release\.result == 'success'/u);
  assert.doesNotMatch(releaseJob, /needs\.pages/u);
  assert.match(releaseJob, /PAGES_URL:\s*\$\{\{ github\.ref == 'refs\/heads\/main'/u);
  assert.match(workflow, /attestations:\s*write/u);
  assert.match(workflow, /id-token:\s*write/u);
  assert.match(workflow, /actions\/attest-build-provenance@43d14bc2b83dec42d39ecae14e916627a18bb661/u);
  assert.match(workflow, /subject-path:\s*dist\/\*-Setup\.exe/u);
  assert.match(releaseJob, /attestations:\s*read/u);
  assert.equal((releaseJob.match(/^\s+gh attestation verify \$[A-Za-z]/gmu) ?? []).length, 2);
  assert.match(releaseJob, /Authenticode status/u);
});
