import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { listPackage } from '@electron/asar';
import {
  GIT_FOR_WINDOWS_RELEASE,
  GIT_RUNTIME_COMPONENT_MANIFEST,
  GIT_RUNTIME_EXPECTED_PATHS,
  GIT_RUNTIME_LICENSES,
  GIT_RUNTIME_PAYLOAD,
  GIT_RUNTIME_SOURCE_ASSETS
} from './git-runtime-manifest.mjs';
import { verifyGitRuntime } from './verify-git-runtime.mjs';

const archive = path.resolve(process.argv[2] ?? path.join('dist', 'win-unpacked', 'resources', 'app.asar'));
const resourcesRoot = path.dirname(archive);
const entries = listPackage(archive, { isPack: false }).map((entry) => entry.replaceAll('\\', '/').replace(/^\//, ''));

assert.ok(entries.includes('package.json'), 'Packaged application metadata is missing.');
assert.ok(entries.includes('src/main/index.js'), 'Packaged main entry is missing.');
assert.ok(entries.includes('src/preload.cjs'), 'Packaged preload is missing.');
assert.ok(entries.includes('src/renderer/index.html'), 'Packaged renderer entry is missing.');
assert.ok(entries.includes('src/renderer/assets/data/features.json'), 'Packaged command catalog is missing.');
assert.ok(entries.includes('src/renderer/assets/dim-sum/hk-dish-0001-classic-har-gow.png'), 'Packaged release image is missing.');

const forbidden = entries.filter((entry) =>
  /(?:^|\/)(?:__pycache__|node_modules|design|docs|test|tests|artifacts)(?:\/|$)/i.test(entry) ||
  /\.(?:pyc|pyo|map|log|tmp)$/i.test(entry)
);
assert.deepEqual(forbidden, [], `Forbidden generated or development files entered app.asar: ${forbidden.join(', ')}`);

const outsideAllowlist = entries.filter((entry) => entry !== 'package.json' && entry !== 'src' && !entry.startsWith('src/'));
assert.deepEqual(outsideAllowlist, [], `Files outside the package allowlist entered app.asar: ${outsideAllowlist.join(', ')}`);

async function listFiles(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute).replaceAll('\\', '/'));
    else assert.fail(`Unexpected non-file packaged Git entry: ${absolute}`);
  }
  return files.sort();
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

const gitRoot = path.join(resourcesRoot, 'tools', 'git');
assert.deepEqual(
  await listFiles(gitRoot),
  GIT_RUNTIME_EXPECTED_PATHS,
  'Packaged Git runtime contains missing or non-allowlisted files.'
);
for (const entry of GIT_RUNTIME_PAYLOAD) {
  const filePath = path.join(gitRoot, ...entry.path.split('/'));
  const details = await stat(filePath);
  assert.equal(details.size, entry.bytes, `${entry.path} byte length changed.`);
  assert.equal(await sha256(filePath), entry.sha256, `${entry.path} hash changed.`);
}
for (const entry of GIT_RUNTIME_LICENSES) {
  const filePath = path.join(gitRoot, ...entry.target.split('/'));
  const details = await stat(filePath);
  assert.equal(details.size, entry.bytes, `${entry.target} byte length changed.`);
  assert.equal(await sha256(filePath), entry.sha256, `${entry.target} hash changed.`);
}

const runtimeVerification = await verifyGitRuntime(gitRoot);
assert.equal(runtimeVerification.version.toLowerCase(), `git version ${GIT_FOR_WINDOWS_RELEASE.gitVersion}`.toLowerCase());

const legalFiles = {
  projectLicense: path.join(resourcesRoot, 'legal', 'LICENSE.txt'),
  thirdPartyNotices: path.join(resourcesRoot, 'legal', 'THIRD_PARTY_NOTICES.md'),
  imageProvenance: path.join(resourcesRoot, 'legal', 'classic-har-gow-provenance.json'),
  electronLicense: path.join(resourcesRoot, 'legal', 'ELECTRON_LICENSE.txt'),
  gitComponentManifest: path.join(gitRoot, ...GIT_RUNTIME_COMPONENT_MANIFEST.split('/')),
  gitLicense: path.join(gitRoot, 'legal', 'licenses', 'git', 'COPYING'),
  libiconvLicense: path.join(gitRoot, 'legal', 'licenses', 'libiconv', 'COPYING.LIB'),
  gettextLicense: path.join(gitRoot, 'legal', 'licenses', 'gettext-runtime', 'intl', 'COPYING.LIB'),
  pcre2License: path.join(gitRoot, 'legal', 'licenses', 'pcre2', 'LICENCE.md'),
  zlibLicense: path.join(gitRoot, 'legal', 'licenses', 'zlib', 'LICENSE'),
  minGitPackages: path.join(gitRoot, 'legal', 'min-git-package-versions.txt')
};
const legalContents = Object.fromEntries(await Promise.all(
  Object.entries(legalFiles).map(async ([name, filePath]) => [name, await readFile(filePath, 'utf8')])
));
assert.match(legalContents.projectLicense, /^MIT License/m, 'Packaged project license is not the repository MIT license.');
assert.match(legalContents.thirdPartyNotices, /Electron `43\.2\.0`/u, 'Packaged notices omit Electron.');
assert.match(legalContents.thirdPartyNotices, /Chromium `150\.0\.7871\.129`/u, 'Packaged notices omit the exact Chromium version.');
assert.match(legalContents.thirdPartyNotices, /MinGit-2\.55\.0\.3-64-bit\.zip/u, 'Packaged notices omit the exact MinGit distribution.');
assert.match(legalContents.thirdPartyNotices, /b9141dee2805a5551d112ecc4fcc6a7db7b41cd9/u, 'Packaged notices omit the pinned LibreOffice reference revision.');
assert.match(legalContents.electronLicense, /Copyright \(c\) Electron contributors/u, 'Packaged Electron license omits its copyright notice.');
assert.match(legalContents.electronLicense, /Permission is hereby granted, free of charge/u, 'Packaged Electron MIT grant is missing or unexpected.');
assert.match(legalContents.gitLicense, /GNU GENERAL PUBLIC LICENSE[\s\S]+Version 2, June 1991/u, 'Packaged Git GPLv2 text is missing.');
assert.match(legalContents.libiconvLicense, /GNU LESSER GENERAL PUBLIC LICENSE/u, 'Packaged libiconv LGPL text is missing.');
assert.match(legalContents.gettextLicense, /GNU LESSER GENERAL PUBLIC LICENSE/u, 'Packaged libintl LGPL text is missing.');
assert.match(legalContents.pcre2License, /PCRE2 Licence/iu, 'Packaged PCRE2 license is missing.');
assert.match(legalContents.zlibLicense, /Permission is granted to anyone to use this software for any purpose/u, 'Packaged zlib license is missing.');
assert.match(legalContents.minGitPackages, /mingw-w64-x86_64-git 2\.55\.0\.3-1/u, 'Packaged MinGit component manifest is missing the pinned Git build.');
const componentManifest = JSON.parse(legalContents.gitComponentManifest);
assert.equal(componentManifest.distribution.sha256, GIT_FOR_WINDOWS_RELEASE.archiveSha256);
assert.deepEqual(componentManifest.correspondingSources, GIT_RUNTIME_SOURCE_ASSETS);
assert.deepEqual(componentManifest.payload, GIT_RUNTIME_PAYLOAD);
assert.deepEqual(
  componentManifest.licenses,
  GIT_RUNTIME_LICENSES.map((entry) => ({
    path: entry.target,
    upstreamPath: entry.source,
    bytes: entry.bytes,
    sha256: entry.sha256
  })),
  'Packaged component-manifest license records do not match the exact gated files.'
);

const provenance = JSON.parse(legalContents.imageProvenance);
assert.equal(provenance.asset.sha256, 'c6ff2d32938f1e4c4ea685442f69227b8cd387f302ab8f8a62e8dd96c62b5ac0');
assert.equal(provenance.asset.width, 1254);
assert.equal(provenance.asset.height, 1254);
assert.equal(provenance.asset.bytes, 2406444);

console.log(JSON.stringify({
  verified: true,
  archive,
  entries: entries.length,
  gitRuntimeFiles: GIT_RUNTIME_EXPECTED_PATHS.length,
  gitVersion: runtimeVerification.version,
  gitCommands: runtimeVerification.commands,
  legalFiles: Object.keys(legalFiles).length
}));
