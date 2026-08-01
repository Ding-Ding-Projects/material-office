import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  BUNDLED_GIT_RELATIVE_PATH,
  discoverGitExecutable
} from '../../src/main/git-executable.js';
import { GitHistoryService } from '../../src/main/git-history-service.js';
import { runProcess } from '../../src/main/process-runner.js';
import { PersistentStateService } from '../../src/main/state-service.js';

test('Git history is isolated, append-only, and restore records a new snapshot', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-history-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const repositoryPath = path.join(directory, 'isolated-history');
  let tick = 0;
  const gitExecutable = await discoverGitExecutable();
  assert.ok(gitExecutable);
  const history = new GitHistoryService(repositoryPath, {
    gitExecutable,
    now: () => new Date(Date.UTC(2026, 6, 31, 12, 0, tick++)),
    id: () => `event-${tick}`
  });
  const state = new PersistentStateService(path.join(directory, 'app-data'), { history });
  await state.initialize();

  await state.updateSettings({ theme: 'dark' });
  await state.updateSettings({ density: 'comfortable' });
  const beforeRestore = await state.listHistory();
  assert.equal(beforeRestore.length, 2);
  assert.equal(beforeRestore[0].action, 'settings changed');

  const oldest = beforeRestore[1];
  const restored = await state.restore(oldest.revision);
  assert.equal(restored.restored, true);
  assert.equal(restored.historyRecorded, true);
  assert.equal(Object.hasOwn(restored, 'state'), false);
  const settings = await state.getSettings();
  assert.equal(settings.theme, 'dark');
  assert.equal(settings.density, 'compact');

  const afterRestore = await state.listHistory();
  assert.equal(afterRestore.length, 3);
  assert.equal(afterRestore[0].action, 'state restored');
  assert.notEqual(afterRestore[0].revision, oldest.revision);
  await assert.rejects(fs.stat(path.join(directory, 'app-data', '.git')), { code: 'ENOENT' });
  assert.equal((await fs.stat(path.join(repositoryPath, '.git'))).isDirectory(), true);
  assert.equal(
    (await fs.stat(path.join(repositoryPath, '.git', 'material-office-hooks'))).isDirectory(),
    true
  );
});

test('Git history snapshots and restores app-owned workspace content', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-workspace-history-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const gitExecutable = await discoverGitExecutable();
  assert.ok(gitExecutable);
  const history = new GitHistoryService(path.join(directory, 'history'), { gitExecutable });
  const state = new PersistentStateService(path.join(directory, 'app-data'), { history });
  await state.initialize();
  const workspaceEvents = [];
  state.onWorkspaceChanged((envelope) => workspaceEvents.push(envelope));

  const firstContent = 'Writer paragraph. '.repeat(4_000);
  const initialWorkspace = await state.getWorkspace();
  const firstWorkspace = await state.saveWorkspace({
    expectedRevision: initialWorkspace.revision,
    state: { schemaVersion: 1, documents: [{ id: 'writer-1', content: firstContent }] }
  });
  await state.saveWorkspace({
    expectedRevision: firstWorkspace.revision,
    state: { schemaVersion: 1, documents: [{ id: 'writer-1', content: 'Replacement' }] }
  });
  const snapshots = await state.listHistory();
  assert.equal(snapshots.length, 2);

  const beforeRestore = await state.getWorkspace();
  await state.restore(snapshots[1].revision);
  const restoredWorkspace = await state.getWorkspace();
  assert.notEqual(restoredWorkspace.revision, beforeRestore.revision);
  assert.equal(restoredWorkspace.state.documents[0].content, firstContent);
  assert.equal(workspaceEvents.at(-1).revision, restoredWorkspace.revision);
  assert.equal(workspaceEvents.at(-1).state.documents[0].content, firstContent);
  assert.equal((await state.listHistory()).length, 3);
});

test('history pruning keeps exactly the newest logical snapshots and retained restores still append', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-history-prune-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const repositoryPath = path.join(directory, 'isolated-history');
  const unrelatedPath = path.join(directory, 'user-project');
  await fs.mkdir(unrelatedPath, { recursive: true });
  await fs.writeFile(path.join(unrelatedPath, 'keep.txt'), 'untouched');
  let tick = 0;
  const gitExecutable = await discoverGitExecutable();
  assert.ok(gitExecutable);
  const history = new GitHistoryService(repositoryPath, {
    gitExecutable,
    now: () => new Date(Date.UTC(2026, 6, 31, 12, 0, tick++)),
    id: () => `prune-event-${tick}`
  });
  await history.initialize();
  const recorded = [];
  for (let index = 0; index < 12; index += 1) {
    recorded.push(await history.recordSnapshot(
      { schemaVersion: 1, sequence: index },
      { action: `sequence ${index}` }
    ));
  }
  await assert.rejects(history.pruneSnapshots(9), /10/);
  await assert.rejects(history.pruneSnapshots(10_001), /10000/);

  const result = await history.pruneSnapshots(10);
  assert.equal(result.pruned, true);
  assert.equal(result.beforeCount, 12);
  assert.equal(result.afterCount, 10);
  assert.equal(result.prunedCount, 2);
  const retained = await history.listSnapshots(100);
  assert.equal(retained.length, 10);
  assert.equal(retained[0].action, 'sequence 11');
  assert.equal(retained.at(-1).action, 'sequence 2');
  assert.equal((await history.listSnapshots(10_000)).length, 10);
  assert.equal(retained[0].recordedAt, recorded[11].recordedAt);
  assert.equal(retained.at(-1).recordedAt, recorded[2].recordedAt);
  assert.equal(result.revision, retained[0].revision);
  assert.equal(result.oldestRetainedRevision, retained.at(-1).revision);
  const oldestRetained = await history.readSnapshot(retained.at(-1).revision);
  assert.equal(oldestRetained.schemaVersion, 1);
  assert.equal(oldestRetained.sequence, 2);
  await assert.rejects(
    history.readSnapshot(recorded[0].revision),
    (error) => error.code === 'SNAPSHOT_NOT_FOUND'
  );
  assert.equal(await fs.readFile(path.join(unrelatedPath, 'keep.txt'), 'utf8'), 'untouched');
  await assert.rejects(fs.stat(path.join(unrelatedPath, '.git')), { code: 'ENOENT' });

  let applied;
  const restored = await history.restoreSnapshot(retained.at(-1).revision, async (snapshot) => {
    applied = snapshot;
  });
  assert.equal(restored.restored, true);
  assert.equal(restored.historyRecorded, true);
  assert.equal(Object.hasOwn(restored, 'state'), false);
  assert.equal(applied.sequence, 2);
  const afterRestore = await history.listSnapshots(100);
  assert.equal(afterRestore.length, 11);
  assert.equal(afterRestore[0].action, 'state restored');
  assert.equal(afterRestore[1].action, 'sequence 11');
});

test('retrying a prune completes unreachable-object cleanup after a post-ref-update failure', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-history-prune-retry-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const gitExecutable = await discoverGitExecutable();
  assert.ok(gitExecutable);
  let failNextCollection = true;
  const history = new GitHistoryService(path.join(directory, 'history'), {
    gitExecutable,
    run: async (file, args, options) => {
      const command = args.slice(2);
      if (failNextCollection && command[0] === 'gc' && command[1] === '--prune=now') {
        failNextCollection = false;
        return { exitCode: 1, stdout: '', stderr: 'injected cleanup failure', timedOut: false };
      }
      return runProcess(file, args, options);
    }
  });
  await history.initialize();
  const recorded = [];
  for (let index = 0; index < 12; index += 1) {
    recorded.push(await history.recordSnapshot(
      { schemaVersion: 1, sequence: index },
      { action: `retry sequence ${index}` }
    ));
  }

  await assert.rejects(
    history.pruneSnapshots(10),
    (error) => error.code === 'HISTORY_GIT_FAILED'
  );
  assert.equal((await history.readSnapshot(recorded[0].revision)).sequence, 0);

  const retry = await history.pruneSnapshots(10);
  assert.equal(retry.pruned, false);
  assert.equal(retry.beforeCount, 10);
  assert.equal(retry.afterCount, 10);
  await assert.rejects(
    history.readSnapshot(recorded[0].revision),
    (error) => error.code === 'SNAPSHOT_NOT_FOUND'
  );
});

test('Git history rejects bare commands and always runs one absolute git.exe with shell disabled', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-history-runner-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  assert.throws(
    () => new GitHistoryService(path.join(directory, 'unsafe'), { gitExecutable: 'git' }),
    /absolute git\.exe/i
  );

  const executable = path.join(directory, 'Git', 'cmd', 'git.exe');
  await fs.mkdir(path.dirname(executable), { recursive: true });
  await fs.writeFile(executable, 'fixture');
  const calls = [];
  const history = new GitHistoryService(path.join(directory, 'history'), {
    gitExecutable: executable,
    env: {
      SystemRoot: 'C:\\Windows',
      Path: 'C:\\Windows\\System32',
      GIT_DIR: 'C:\\hijacked-repository',
      git_work_tree: 'C:\\hijacked-worktree',
      GiT_Config_Count: '1',
      HOME: 'C:\\hostile-home',
      USERPROFILE: 'C:\\hostile-profile'
    },
    run: async (file, args, options) => {
      calls.push({ file, args, options });
      return { exitCode: 0, stdout: 'true\n', stderr: '', timedOut: false };
    }
  });
  await history.initialize();
  assert.ok(calls.length > 0);
  assert.equal(calls.every((call) => path.isAbsolute(call.file)), true);
  assert.equal(calls.every((call) => call.file === executable), true);
  assert.equal(calls.every((call) => call.args[0] === '-C'), true);
  assert.equal(calls.every((call) => call.args[1] === path.join(directory, 'history')), true);
  assert.equal(calls.every((call) => call.options.shell === false), true);
  assert.equal(calls.every((call) => call.options.killTree === true), true);
  for (const call of calls) {
    assert.equal(Object.hasOwn(call.options.env, 'GIT_DIR'), false);
    assert.equal(Object.hasOwn(call.options.env, 'git_work_tree'), false);
    assert.equal(Object.hasOwn(call.options.env, 'GiT_Config_Count'), false);
    assert.notEqual(call.options.env.HOME, 'C:\\hostile-home');
    assert.notEqual(call.options.env.USERPROFILE, 'C:\\hostile-profile');
    assert.equal(call.options.env.GIT_CONFIG_NOSYSTEM, '1');
    assert.equal(call.options.env.GIT_TERMINAL_PROMPT, '0');
  }
});

test('packaged Git discovery requires the fixed bundled runtime and never falls back to the host', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-bundled-git-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const bundled = path.join(directory, 'resources', ...BUNDLED_GIT_RELATIVE_PATH);
  const hostRoot = path.join(directory, 'Program Files');
  const hostGit = path.join(hostRoot, 'Git', 'cmd', 'git.exe');
  await fs.mkdir(path.dirname(hostGit), { recursive: true });
  await fs.writeFile(hostGit, 'host fixture');

  assert.equal(await discoverGitExecutable({
    bundledExecutable: bundled,
    isPackaged: true,
    platform: 'win32',
    env: { ProgramFiles: hostRoot }
  }), null);

  await fs.mkdir(path.dirname(bundled), { recursive: true });
  await fs.writeFile(bundled, 'bundled fixture');
  assert.equal(await discoverGitExecutable({
    bundledExecutable: bundled,
    isPackaged: true,
    platform: 'win32',
    env: {}
  }), bundled);
  assert.equal(await discoverGitExecutable({
    bundledExecutable: path.join(directory, 'missing', 'git.exe'),
    isPackaged: false,
    platform: 'win32',
    env: { ProgramFiles: hostRoot }
  }), hostGit);
});

test('history snapshots and restores a valid application state larger than eight MiB', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-large-history-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const gitExecutable = await discoverGitExecutable();
  assert.ok(gitExecutable);
  const history = new GitHistoryService(path.join(directory, 'history'), { gitExecutable });
  const state = new PersistentStateService(path.join(directory, 'app-data'), { history });
  await state.initialize();
  const timestamp = '2026-07-31T20:00:00.000Z';
  const longSegment = 'x'.repeat(29_500);
  const documents = Array.from({ length: 290 }, (_, index) => ({
    id: `document-${index}`,
    title: `Document ${index}`,
    kind: 'writer',
    filePath: `C:\\Documents\\document-${index}.odt`,
    format: 'odt',
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    exports: [{
      outputPath: `C:\\Exports\\${longSegment}-${index}.pdf`,
      targetFormat: 'pdf',
      exportedAt: timestamp
    }],
    contentState: 'managed-by-libreoffice'
  }));
  const first = await state.updateRecords((records) => ({ ...records, documents }), 'large state fixture');
  assert.equal(first.history.recorded, true);
  const serializedBytes = Buffer.byteLength(JSON.stringify(await state.exportState()), 'utf8');
  assert.ok(serializedBytes > 8 * 1024 * 1024);
  assert.ok(serializedBytes < 10 * 1024 * 1024);

  await state.updateSettings({ theme: 'dark' });
  const restored = await state.restore(first.history.snapshot.revision);
  assert.equal(restored.historyRecorded, true);
  assert.equal((await state.getRecords()).documents.length, documents.length);
  assert.equal((await state.getSettings()).theme, 'system');
});
