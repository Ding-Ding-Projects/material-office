import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
  copyFile,
  mkdir,
  readFile,
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
  GIT_RUNTIME_PAYLOAD,
  GIT_RUNTIME_SOURCE_ASSETS,
  MINGW_RECIPES
} from './git-runtime-manifest.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const toolsRoot = path.join(repositoryRoot, 'build-tools');
const cacheRoot = path.join(toolsRoot, 'source-cache');
const checkoutRoot = path.join(cacheRoot, 'git-for-windows-MINGW-packages');
const bundleRoot = path.join(toolsRoot, 'git-runtime-sources');
const sourceManifestName = 'git-runtime-source-manifest.json';

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

async function download(asset) {
  const destination = path.join(cacheRoot, asset.name);
  if (await trustedFile(destination, asset.sha256, asset.bytes)) return destination;
  await rm(destination, { force: true });
  const partial = `${destination}.${randomUUID()}.partial`;
  try {
    const response = await fetch(asset.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(180_000)
    });
    if (!response.ok || !response.body) {
      throw new Error(`Corresponding-source download failed for ${asset.name} with HTTP ${response.status}.`);
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { flags: 'wx' }));
    if (!await trustedFile(partial, asset.sha256, asset.bytes)) {
      const actualHash = await sha256(partial).catch(() => 'unreadable');
      const actualBytes = await stat(partial).then((entry) => entry.size).catch(() => -1);
      throw new Error(
        `Corresponding-source mismatch for ${asset.name}: expected ${asset.sha256}/${asset.bytes}, received ${actualHash}/${actualBytes}.`
      );
    }
    await rename(partial, destination);
    return destination;
  } finally {
    await rm(partial, { force: true });
  }
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: options.encoding ?? 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
}

function normalizeRepositoryUrl(value) {
  return value.trim().replace(/\/+$/, '').replace(/\.git$/i, '').toLowerCase();
}

async function prepareRecipeArchive() {
  await mkdir(cacheRoot, { recursive: true });
  const archivePath = path.join(cacheRoot, MINGW_RECIPES.archiveName);
  if (await trustedFile(archivePath, MINGW_RECIPES.archiveSha256, MINGW_RECIPES.archiveBytes)) {
    return archivePath;
  }
  await rm(archivePath, { force: true });
  try {
    const repositoryMarker = path.join(checkoutRoot, '.git');
    await stat(repositoryMarker);
    const origin = git(['-C', checkoutRoot, 'remote', 'get-url', 'origin']).trim();
    if (normalizeRepositoryUrl(origin) !== normalizeRepositoryUrl(MINGW_RECIPES.repository)) {
      throw new Error(`Recipe checkout has an unexpected origin: ${origin}.`);
    }
  } catch (error) {
    if (error?.message?.startsWith('Recipe checkout has an unexpected origin:')) throw error;
    await rm(checkoutRoot, { recursive: true, force: true });
    git(['clone', '--filter=blob:none', '--no-checkout', MINGW_RECIPES.repository, checkoutRoot], {
      stdio: 'inherit'
    });
  }

  git(['-C', checkoutRoot, 'fetch', '--depth=1', 'origin', MINGW_RECIPES.commit], { stdio: 'inherit' });
  const fetchedCommit = git(['-C', checkoutRoot, 'rev-parse', 'FETCH_HEAD']).trim().toLowerCase();
  if (fetchedCommit !== MINGW_RECIPES.commit) {
    throw new Error(`Recipe fetch returned ${fetchedCommit}, expected ${MINGW_RECIPES.commit}.`);
  }
  git([
    '-C', checkoutRoot,
    'archive',
    '--format=tar',
    `--prefix=git-for-windows-MINGW-packages-${MINGW_RECIPES.commit}/`,
    `--output=${archivePath}`,
    MINGW_RECIPES.commit,
    '--',
    ...MINGW_RECIPES.paths
  ], { encoding: 'buffer' });
  if (!await trustedFile(archivePath, MINGW_RECIPES.archiveSha256, MINGW_RECIPES.archiveBytes)) {
    throw new Error('The deterministic Git-for-Windows recipe archive did not match its pinned hash.');
  }
  return archivePath;
}

function verifyGitSourceArchive(archivePath) {
  const entries = execFileSync('tar', ['-tf', archivePath], {
    encoding: 'utf8',
    windowsHide: true
  }).split(/\r?\n/).filter(Boolean);
  for (const required of [
    'mingw-w64-git/PKGBUILD',
    'mingw-w64-git/.SRCINFO',
    'mingw-w64-git/git-v2.55.0.windows.3.tar.gz'
  ]) {
    if (!entries.includes(required)) {
      throw new Error(`Official Git corresponding-source archive is missing ${required}.`);
    }
  }
}

await mkdir(cacheRoot, { recursive: true });
const downloaded = await Promise.all(GIT_RUNTIME_SOURCE_ASSETS.map(download));
verifyGitSourceArchive(downloaded.find((entry) => entry.endsWith('.src.tar.gz')));
const recipeArchive = await prepareRecipeArchive();

const stagedRoot = path.join(toolsRoot, `git-runtime-sources-${randomUUID()}`);
try {
  await mkdir(stagedRoot, { recursive: false });
  for (const sourcePath of [...downloaded, recipeArchive]) {
    await copyFile(sourcePath, path.join(stagedRoot, path.basename(sourcePath)));
  }
  const manifest = {
    schemaVersion: 1,
    gate: 'complete-corresponding-source',
    binaryDistribution: {
      name: GIT_FOR_WINDOWS_RELEASE.archiveName,
      version: GIT_FOR_WINDOWS_RELEASE.version,
      sha256: GIT_FOR_WINDOWS_RELEASE.archiveSha256,
      bytes: GIT_FOR_WINDOWS_RELEASE.archiveBytes,
      payload: GIT_RUNTIME_PAYLOAD
    },
    assets: [
      ...GIT_RUNTIME_SOURCE_ASSETS,
      {
        name: MINGW_RECIPES.archiveName,
        sha256: MINGW_RECIPES.archiveSha256,
        bytes: MINGW_RECIPES.archiveBytes,
        role: 'libiconv-gettext-build-recipes-and-patches',
        repository: MINGW_RECIPES.repository,
        commit: MINGW_RECIPES.commit,
        archivedPaths: MINGW_RECIPES.paths
      }
    ]
  };
  await writeFile(path.join(stagedRoot, sourceManifestName), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  for (const asset of manifest.assets) {
    const candidate = path.join(stagedRoot, asset.name);
    if (!await trustedFile(candidate, asset.sha256, asset.bytes)) {
      throw new Error(`Prepared source bundle does not match ${asset.name}.`);
    }
  }
  await rm(bundleRoot, { recursive: true, force: true });
  await rename(stagedRoot, bundleRoot);
} finally {
  await rm(stagedRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({
  prepared: true,
  gate: 'complete-corresponding-source',
  sourceAssets: GIT_RUNTIME_SOURCE_ASSETS.length + 1,
  bundleRoot,
  manifest: path.join(bundleRoot, sourceManifestName)
}));
