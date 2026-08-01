import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import {
  GIT_FOR_WINDOWS_RELEASE,
  GIT_RUNTIME_COMPONENT_MANIFEST,
  GIT_RUNTIME_EXPECTED_PATHS,
  GIT_RUNTIME_LICENSES,
  GIT_RUNTIME_PAYLOAD,
  GIT_RUNTIME_SOURCE_ASSETS,
  MINGW_RECIPES
} from './git-runtime-manifest.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const toolsRoot = path.join(repositoryRoot, 'build-tools');
const cacheRoot = path.join(toolsRoot, 'cache');
const archivePath = path.join(cacheRoot, GIT_FOR_WINDOWS_RELEASE.archiveName);
const partialPath = `${archivePath}.partial`;
const runtimeRoot = path.join(toolsRoot, 'git-runtime');
const manifestPath = path.join(runtimeRoot, ...GIT_RUNTIME_COMPONENT_MANIFEST.split('/'));
const gitPath = path.join(runtimeRoot, 'mingw64', 'bin', 'git.exe');

async function sha256(filePath) {
  const hash = createHash('sha256');
  hash.update(await readFile(filePath));
  return hash.digest('hex');
}

async function trustedFile(filePath, expectedSha256, expectedBytes) {
  try {
    const details = await stat(filePath);
    return details.isFile() && details.size === expectedBytes && await sha256(filePath) === expectedSha256;
  } catch {
    return false;
  }
}

async function downloadTrustedArchive() {
  await mkdir(cacheRoot, { recursive: true });
  await rm(partialPath, { force: true });
  const response = await fetch(GIT_FOR_WINDOWS_RELEASE.archiveUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok || !response.body) {
    throw new Error(`Git runtime download failed with HTTP ${response.status}.`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partialPath, { flags: 'wx' }));
  if (!await trustedFile(
    partialPath,
    GIT_FOR_WINDOWS_RELEASE.archiveSha256,
    GIT_FOR_WINDOWS_RELEASE.archiveBytes
  )) {
    const actualHash = await sha256(partialPath).catch(() => 'unreadable');
    const actualBytes = await stat(partialPath).then((entry) => entry.size).catch(() => -1);
    await rm(partialPath, { force: true });
    throw new Error(
      `Git runtime archive mismatch: expected ${GIT_FOR_WINDOWS_RELEASE.archiveSha256}/${GIT_FOR_WINDOWS_RELEASE.archiveBytes}, received ${actualHash}/${actualBytes}.`
    );
  }
  await rename(partialPath, archivePath);
}

async function listFiles(root, current = root) {
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(root, absolute));
    else if (entry.isFile()) result.push(path.relative(root, absolute).replaceAll('\\', '/'));
    else throw new Error(`Unexpected non-file entry in Git runtime: ${absolute}`);
  }
  return result.sort();
}

async function validateRuntime(root) {
  const actualPaths = await listFiles(root);
  if (JSON.stringify(actualPaths) !== JSON.stringify(GIT_RUNTIME_EXPECTED_PATHS)) {
    throw new Error(`Git runtime allowlist mismatch. Expected ${GIT_RUNTIME_EXPECTED_PATHS.join(', ')}; received ${actualPaths.join(', ')}.`);
  }
  for (const entry of GIT_RUNTIME_PAYLOAD) {
    const filePath = path.join(root, ...entry.path.split('/'));
    if (!await trustedFile(filePath, entry.sha256, entry.bytes)) {
      throw new Error(`Git runtime payload mismatch: ${entry.path}.`);
    }
  }
  for (const entry of GIT_RUNTIME_LICENSES) {
    const filePath = path.join(root, ...entry.target.split('/'));
    if (!await trustedFile(filePath, entry.sha256, entry.bytes)) {
      throw new Error(`Git runtime legal payload mismatch: ${entry.target}.`);
    }
  }
  const manifest = JSON.parse(await readFile(path.join(root, ...GIT_RUNTIME_COMPONENT_MANIFEST.split('/')), 'utf8'));
  const expectedLicenses = GIT_RUNTIME_LICENSES.map((entry) => ({
    path: entry.target,
    upstreamPath: entry.source,
    bytes: entry.bytes,
    sha256: entry.sha256
  }));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.distribution?.sha256 !== GIT_FOR_WINDOWS_RELEASE.archiveSha256 ||
    JSON.stringify(manifest.payload) !== JSON.stringify(GIT_RUNTIME_PAYLOAD) ||
    JSON.stringify(manifest.licenses) !== JSON.stringify(expectedLicenses) ||
    JSON.stringify(manifest.buildRecipes) !== JSON.stringify(MINGW_RECIPES) ||
    JSON.stringify(manifest.correspondingSources) !== JSON.stringify(GIT_RUNTIME_SOURCE_ASSETS)
  ) {
    throw new Error('Git runtime component manifest is stale or malformed.');
  }
}

async function runtimeIsCurrent() {
  try {
    await access(gitPath);
    await validateRuntime(runtimeRoot);
    return true;
  } catch {
    return false;
  }
}

async function buildRuntime() {
  const identifier = randomUUID();
  const extractionRoot = path.join(toolsRoot, `git-runtime-extract-${identifier}`);
  const stagedRoot = path.join(toolsRoot, `git-runtime-stage-${identifier}`);
  const archivePaths = [
    ...GIT_RUNTIME_PAYLOAD.map((entry) => entry.path),
    ...GIT_RUNTIME_LICENSES.map((entry) => entry.source)
  ];
  try {
    await Promise.all([
      mkdir(extractionRoot, { recursive: false }),
      mkdir(stagedRoot, { recursive: false })
    ]);
    execFileSync('tar.exe', ['-xf', archivePath, '-C', extractionRoot, ...archivePaths], {
      stdio: 'inherit',
      windowsHide: true
    });

    for (const entry of GIT_RUNTIME_PAYLOAD) {
      const source = path.join(extractionRoot, ...entry.path.split('/'));
      const target = path.join(stagedRoot, ...entry.path.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
    }

    const licenses = [];
    for (const entry of GIT_RUNTIME_LICENSES) {
      const source = path.join(extractionRoot, ...entry.source.split('/'));
      const target = path.join(stagedRoot, ...entry.target.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
      if (!await trustedFile(target, entry.sha256, entry.bytes)) {
        throw new Error(`Extracted legal file does not match the pinned MinGit byte identity: ${entry.source}.`);
      }
      licenses.push({
        path: entry.target,
        upstreamPath: entry.source,
        bytes: entry.bytes,
        sha256: entry.sha256
      });
    }

    const componentManifest = {
      schemaVersion: 1,
      generatedFromUnmodifiedOfficialBytes: true,
      distribution: {
        name: GIT_FOR_WINDOWS_RELEASE.archiveName,
        version: GIT_FOR_WINDOWS_RELEASE.version,
        gitVersion: GIT_FOR_WINDOWS_RELEASE.gitVersion,
        url: GIT_FOR_WINDOWS_RELEASE.archiveUrl,
        releaseUrl: GIT_FOR_WINDOWS_RELEASE.releaseUrl,
        bytes: GIT_FOR_WINDOWS_RELEASE.archiveBytes,
        sha256: GIT_FOR_WINDOWS_RELEASE.archiveSha256
      },
      payload: GIT_RUNTIME_PAYLOAD,
      licenses,
      buildRecipes: MINGW_RECIPES,
      correspondingSources: GIT_RUNTIME_SOURCE_ASSETS
    };
    const stagedManifest = path.join(stagedRoot, ...GIT_RUNTIME_COMPONENT_MANIFEST.split('/'));
    await mkdir(path.dirname(stagedManifest), { recursive: true });
    await writeFile(stagedManifest, `${JSON.stringify(componentManifest, null, 2)}\n`, 'utf8');
    await validateRuntime(stagedRoot);

    await rm(runtimeRoot, { recursive: true, force: true });
    await rename(stagedRoot, runtimeRoot);
  } finally {
    await Promise.all([
      rm(extractionRoot, { recursive: true, force: true }),
      rm(stagedRoot, { recursive: true, force: true })
    ]);
  }
}

if (process.platform !== 'win32') {
  throw new Error('The bundled Git runtime is prepared only for the Windows package.');
}

if (!await trustedFile(
  archivePath,
  GIT_FOR_WINDOWS_RELEASE.archiveSha256,
  GIT_FOR_WINDOWS_RELEASE.archiveBytes
)) {
  await rm(archivePath, { force: true });
  await downloadTrustedArchive();
}

if (!await runtimeIsCurrent()) await buildRuntime();
await validateRuntime(runtimeRoot);

const gitVersion = execFileSync(gitPath, ['--version'], { encoding: 'utf8', windowsHide: true }).trim();
if (gitVersion.toLowerCase() !== `git version ${GIT_FOR_WINDOWS_RELEASE.gitVersion}`.toLowerCase()) {
  throw new Error(`The extracted Git runtime failed version validation: ${gitVersion || 'no version output'}.`);
}

console.log(JSON.stringify({
  prepared: true,
  version: gitVersion,
  archiveSha256: GIT_FOR_WINDOWS_RELEASE.archiveSha256,
  payloadFiles: GIT_RUNTIME_PAYLOAD.length,
  totalFiles: GIT_RUNTIME_EXPECTED_PATHS.length,
  runtimeRoot,
  manifestPath
}));
