import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverGitExecutable } from '../../src/main/git-executable.js';
import { GitHistoryService } from '../../src/main/git-history-service.js';
import { runProcess } from '../../src/main/process-runner.js';
import { PersistentStateService } from '../../src/main/state-service.js';

function clock(startSeconds = 0) {
  let seconds = startSeconds;
  return () => new Date(Date.UTC(2026, 6, 31, 20, 0, seconds++));
}

function simpleState(theme = 'light') {
  return {
    schemaVersion: 1,
    settings: {
      schemaVersion: 1,
      languageMode: 'en',
      funnyLevelEnglish: 1,
      funnyLevelCantonese: 1,
      theme,
      density: 'compact',
      accentColor: '#6750A4',
      fontFamily: 'Segoe UI',
      fontSizeScale: 1,
      fontWeight: 400,
      dimSumSurpriseEnabled: true,
      reducedMotion: false,
      narratorEnabled: false,
      preferredEditorId: null,
      customEditors: [],
      libreOfficeExecutableOverride: null
    },
    records: {
      schemaVersion: 1,
      documents: [],
      recentItems: [],
      notifications: [],
      workspace: null
    }
  };
}

test('state history exposes bounded diffs and labels persist with idempotent update semantics', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-history-browse-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const repositoryPath = path.join(directory, 'version-history');
  const appDataPath = path.join(directory, 'app-data');
  const gitExecutable = await discoverGitExecutable();
  assert.ok(gitExecutable);
  const history = new GitHistoryService(repositoryPath, {
    gitExecutable,
    now: clock(),
    id: (() => { let id = 0; return () => `browse-event-${id++}`; })()
  });
  const state = new PersistentStateService(appDataPath, { history });
  await state.initialize();

  const first = await state.updateSettings({ theme: 'dark' });
  const second = await state.updateSettings({ density: 'comfortable' });
  const firstRevision = first.history.snapshot.revision;
  const secondRevision = second.history.snapshot.revision;

  const changed = await state.diffHistory(firstRevision);
  assert.equal(changed.revision, firstRevision);
  assert.equal(changed.currentRevision, secondRevision);
  assert.equal(changed.unchanged, false);
  assert.deepEqual(
    changed.changes.find((entry) => entry.path === 'settings.density'),
    {
      path: 'settings.density',
      kind: 'modified',
      oldPreview: 'compact',
      newPreview: 'comfortable',
      previewTruncated: false
    }
  );
  const unchanged = await state.diffHistory(secondRevision);
  assert.equal(unchanged.unchanged, true);
  assert.equal(unchanged.counts.total, 0);
  assert.deepEqual(unchanged.changes, []);

  const originalLabel = await state.labelHistory(firstRevision, 'Before density change');
  const idempotent = await state.labelHistory(firstRevision, 'Before density change');
  assert.deepEqual(idempotent, originalLabel);
  const updated = await state.labelHistory(firstRevision, 'Budget baseline');
  assert.equal(updated.revision, firstRevision);
  assert.equal(updated.label, 'Budget baseline');
  assert.notEqual(updated.updatedAt, originalLabel.updatedAt);
  const listed = await state.listHistory();
  assert.equal(listed.find((entry) => entry.revision === firstRevision).label, 'Budget baseline');
  assert.equal(listed.find((entry) => entry.revision === secondRevision).label, null);

  const status = await runProcess(gitExecutable, ['-C', repositoryPath, 'status', '--porcelain=v1'], {
    shell: false,
    timeoutMs: 30_000,
    maxOutputBytes: 64 * 1024,
    windowsHide: true
  });
  assert.equal(status.exitCode, 0);
  assert.equal(status.stdout, '');

  const restartedHistory = new GitHistoryService(repositoryPath, {
    gitExecutable,
    now: clock(30)
  });
  const restartedState = new PersistentStateService(appDataPath, { history: restartedHistory });
  await restartedState.initialize();
  const afterRestart = await restartedState.listHistory();
  assert.equal(
    afterRestart.find((entry) => entry.revision === firstRevision).label,
    'Budget baseline'
  );
});

test('labels follow retained snapshot trees through prune while stale and unknown revisions are rejected', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-history-label-prune-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const repositoryPath = path.join(directory, 'version-history');
  const gitExecutable = await discoverGitExecutable();
  assert.ok(gitExecutable);
  const history = new GitHistoryService(repositoryPath, {
    gitExecutable,
    now: clock(),
    id: (() => { let id = 0; return () => `prune-label-event-${id++}`; })()
  });
  await history.initialize();
  const snapshots = [];
  for (let index = 0; index < 12; index += 1) {
    snapshots.push(await history.recordSnapshot(simpleState(index % 2 === 0 ? 'light' : 'dark'), {
      action: `labeled sequence ${index}`
    }));
  }
  await history.labelSnapshot(snapshots[0].revision, 'Will be pruned');
  await history.labelSnapshot(snapshots[2].revision, 'Oldest retained baseline');

  await history.pruneSnapshots(10);
  const retained = await history.listSnapshots(10);
  const retainedBaseline = retained.find((entry) => entry.action === 'labeled sequence 2');
  assert.ok(retainedBaseline);
  assert.equal(retainedBaseline.label, 'Oldest retained baseline');
  assert.notEqual(retainedBaseline.revision, snapshots[2].revision);
  assert.equal(retained.some((entry) => entry.label === 'Will be pruned'), false);

  for (const staleRevision of [snapshots[0].revision, snapshots[2].revision, 'f'.repeat(40)]) {
    await assert.rejects(
      history.labelSnapshot(staleRevision, 'Rejected stale revision'),
      (error) => error.code === 'SNAPSHOT_NOT_FOUND'
    );
    await assert.rejects(
      history.diffSnapshot(staleRevision, simpleState()),
      (error) => error.code === 'SNAPSHOT_NOT_FOUND'
    );
  }

  const relabeled = await history.labelSnapshot(retainedBaseline.revision, 'Retained after prune');
  assert.equal(relabeled.label, 'Retained after prune');
  const restarted = new GitHistoryService(repositoryPath, {
    gitExecutable,
    now: clock(50)
  });
  await restarted.initialize();
  assert.equal(
    (await restarted.listSnapshots(10)).find((entry) => entry.revision === retainedBaseline.revision).label,
    'Retained after prune'
  );
});
