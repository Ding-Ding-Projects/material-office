import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GitHistoryService } from '../src/main/git-history-service.js';
import { runProcess } from '../src/main/process-runner.js';
import { GIT_FOR_WINDOWS_RELEASE } from './git-runtime-manifest.mjs';

const REQUIRED_SERVICE_COMMANDS = Object.freeze([
  'add',
  'check-ref-format',
  'commit',
  'commit-tree',
  'config',
  'gc',
  'init',
  'log',
  'reflog',
  'rev-list',
  'rev-parse',
  'show',
  'status',
  'symbolic-ref',
  'update-ref'
]);

function commandName(args) {
  const gitArgs = args.slice(2);
  let index = 0;
  while (gitArgs[index] === '-c') index += 2;
  return gitArgs[index];
}

export async function verifyGitRuntime(runtimeRoot) {
  const absoluteRuntime = path.resolve(runtimeRoot);
  const gitExecutable = path.join(absoluteRuntime, 'mingw64', 'bin', 'git.exe');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-minimal-git-'));
  const repositoryPath = path.join(directory, 'history');
  const commands = new Set();
  let tick = 0;
  try {
    const version = await runProcess(gitExecutable, ['--version'], {
      shell: false,
      killTree: true,
      timeoutMs: 10_000,
      maxOutputBytes: 4_096,
      windowsHide: true
    });
    assert.equal(version.exitCode, 0);
    assert.equal(version.stdout.trim().toLowerCase(), `git version ${GIT_FOR_WINDOWS_RELEASE.gitVersion}`.toLowerCase());

    const history = new GitHistoryService(repositoryPath, {
      gitExecutable,
      now: () => new Date(Date.UTC(2026, 6, 31, 12, 0, tick++)),
      id: () => `minimal-runtime-event-${tick}`,
      run: async (file, args, options) => {
        commands.add(commandName(args));
        return runProcess(file, args, options);
      }
    });
    await history.initialize();
    const snapshots = [];
    for (let index = 0; index < 12; index += 1) {
      snapshots.push(await history.recordSnapshot(
        { schemaVersion: 1, sequence: index, unicode: '蝦餃 · café' },
        { action: `minimal runtime ${index}` }
      ));
    }
    const listed = await history.listSnapshots(100);
    assert.equal(listed.length, 12);
    assert.equal((await history.readSnapshot(snapshots[0].revision)).sequence, 0);
    const restored = await history.restoreSnapshot(snapshots[1].revision, async (state) => {
      assert.equal(state.sequence, 1);
    });
    assert.equal(restored.historyRecorded, true);
    const pruned = await history.pruneSnapshots(10);
    assert.equal(pruned.pruned, true);
    assert.equal(pruned.afterCount, 10);

    const snapshotPath = path.join(repositoryPath, 'snapshot.json');
    await fs.writeFile(snapshotPath, '{"changed":true}\n', 'utf8');
    const restoreResult = await runProcess(gitExecutable, [
      '-C', repositoryPath, 'restore', '--source=HEAD', '--', 'snapshot.json'
    ], {
      shell: false,
      killTree: true,
      timeoutMs: 10_000,
      maxOutputBytes: 4_096,
      windowsHide: true
    });
    assert.equal(restoreResult.exitCode, 0, restoreResult.stderr);
    commands.add('restore');

    for (const command of REQUIRED_SERVICE_COMMANDS) {
      assert.ok(commands.has(command), `GitHistoryService did not exercise ${command}.`);
    }
    assert.ok(commands.has('restore'));
    return {
      verified: true,
      version: version.stdout.trim(),
      commands: [...commands].sort(),
      snapshotsAfterPrune: (await history.listSnapshots(100)).length
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'win32') {
    throw new Error('The minimal bundled Git verification runs only on Windows.');
  }
  const defaultRoot = path.resolve(import.meta.dirname, '..', 'build-tools', 'git-runtime');
  console.log(JSON.stringify(await verifyGitRuntime(process.argv[2] ?? defaultRoot)));
}

