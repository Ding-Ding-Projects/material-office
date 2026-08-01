import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RELEASE_REPOSITORY = 'Ding-Ding-Projects/material-office';
const RELEASE_CODE_NAME = 'Classic Har Gow · 蝦餃';
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;
const TAG_PATTERN = /^v[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?-build\.[1-9][0-9]*\.attempt\.[1-9][0-9]*$/;
const INSTALLER_PATTERN = /^Material-Office-[0-9A-Za-z.+-]+-x64-Setup\.exe$/;

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for published Pages release data.`);
  return value;
}

export function buildReleaseState(env = process.env) {
  const version = (env.MATERIAL_OFFICE_VERSION ?? '0.1.0').trim();
  if (!VERSION_PATTERN.test(version)) throw new Error(`Invalid Material Office version: ${version}.`);

  if (env.MATERIAL_OFFICE_RELEASE_STATE !== 'published') {
    return {
      schemaVersion: 1,
      status: 'candidate',
      version,
      tag: null,
      codeName: RELEASE_CODE_NAME,
      releaseUrl: null,
      installerName: null,
      installerUrl: null
    };
  }

  const repository = required(env, 'MATERIAL_OFFICE_REPOSITORY');
  const tag = required(env, 'MATERIAL_OFFICE_RELEASE_TAG');
  const installerName = required(env, 'MATERIAL_OFFICE_INSTALLER_NAME');
  if (repository !== RELEASE_REPOSITORY) throw new Error(`Refusing release links for unexpected repository: ${repository}.`);
  if (!TAG_PATTERN.test(tag) || !tag.startsWith(`v${version}-`)) throw new Error(`Invalid release tag for ${version}: ${tag}.`);
  if (!INSTALLER_PATTERN.test(installerName) || installerName.includes('/') || installerName.includes('\\')) {
    throw new Error(`Invalid Windows installer name: ${installerName}.`);
  }

  const releaseRoot = `https://github.com/${repository}/releases`;
  return {
    schemaVersion: 1,
    status: 'published',
    version,
    tag,
    codeName: RELEASE_CODE_NAME,
    releaseUrl: `${releaseRoot}/tag/${tag}`,
    installerName,
    installerUrl: `${releaseRoot}/download/${tag}/${installerName}`
  };
}

export async function writeReleaseState(env = process.env) {
  const outputPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'release.json');
  await mkdir(path.dirname(outputPath), { recursive: true });
  const state = buildReleaseState(env);
  await writeFile(outputPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return { outputPath, state };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = await writeReleaseState();
  console.log(JSON.stringify({ prepared: true, ...result.state, outputPath: result.outputPath }));
}
