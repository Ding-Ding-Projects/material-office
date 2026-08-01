import fs from 'node:fs/promises';
import path from 'node:path';

export const BUNDLED_GIT_RELATIVE_PATH = Object.freeze([
  'tools',
  'git',
  'mingw64',
  'bin',
  'git.exe'
]);

async function isFile(fileSystem, candidate) {
  try {
    return (await fileSystem.stat(candidate)).isFile();
  } catch {
    return false;
  }
}

export async function discoverGitExecutable(options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') return null;
  const environment = options.env ?? process.env;
  const fileSystem = options.fs ?? fs;
  if (
    typeof options.bundledExecutable === 'string' &&
    path.isAbsolute(options.bundledExecutable) &&
    path.basename(options.bundledExecutable).toLowerCase() === 'git.exe'
  ) {
    const bundled = path.resolve(options.bundledExecutable);
    if (await isFile(fileSystem, bundled)) return bundled;
  }
  if (options.isPackaged === true) return null;
  const roots = [
    environment.ProgramFiles,
    environment['ProgramFiles(x86)'],
    typeof environment.LOCALAPPDATA === 'string'
      ? path.join(environment.LOCALAPPDATA, 'Programs')
      : null
  ].filter((value) => typeof value === 'string' && path.isAbsolute(value));
  const candidates = [];
  for (const root of roots) {
    candidates.push(path.resolve(root, 'Git', 'cmd', 'git.exe'));
    candidates.push(path.resolve(root, 'Git', 'bin', 'git.exe'));
  }
  for (const candidate of [...new Set(candidates.map((value) => value.toLowerCase()))]) {
    const original = candidates.find((value) => value.toLowerCase() === candidate);
    if (await isFile(fileSystem, original)) return original;
  }
  return null;
}
