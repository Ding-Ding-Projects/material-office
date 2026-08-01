import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AtomicJsonStore } from './atomic-json-store.js';
import { AppError, ValidationError } from './errors.js';
import {
  createPublicHistoryDiff,
  requireHistoryLabel
} from './history-public.js';
import { runProcess } from './process-runner.js';
import { MAX_GIT_OUTPUT_BYTES, MAX_STATE_FILE_BYTES } from './state-limits.js';
import {
  requireExactHistoryRevision,
  requireInteger,
  requirePlainObject,
  requireRevision,
  requireString,
  validateJsonValue
} from './validation.js';

const SNAPSHOT_FILE = 'snapshot.json';
const EVENT_FILE = 'event.json';
const LABEL_METADATA_FILE = 'labels.json';
const MAX_HISTORY_LABELS = 10_000;
const MAX_LABEL_METADATA_BYTES = 4 * 1024 * 1024;

function sanitizeAction(value) {
  if (typeof value !== 'string') return 'state changed';
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/^[A-Za-z][A-Za-z0-9 ,:._-]*$/.test(normalized)) return 'state changed';
  return normalized.slice(0, 80) || 'state changed';
}

function snapshotCommitArguments(action, recordedAt) {
  return [
    '-m',
    `Snapshot: ${action}`,
    '-m',
    `Material-Office-Recorded-At: ${recordedAt}`
  ];
}

function listedRecordedAt(commitRecordedAt, body) {
  const match = /(?:^|\n)Material-Office-Recorded-At: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)(?:\n|$)/.exec(body);
  if (match) return match[1];
  const parsed = new Date(commitRecordedAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError('HISTORY_GIT_OUTPUT_INVALID', 'Local history returned an invalid commit timestamp.');
  }
  return parsed.toISOString();
}

function validateHistoryEvent(value) {
  const event = requirePlainObject(value, 'history event');
  if (event.schemaVersion !== 1) {
    throw new AppError('HISTORY_EVENT_INVALID', 'A retained history event has an unsupported schema.');
  }
  const recordedAt = requireString(event.recordedAt, 'history event recordedAt', {
    maxLength: 40,
    pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
  });
  if (Number.isNaN(Date.parse(recordedAt))) {
    throw new AppError('HISTORY_EVENT_INVALID', 'A retained history event has an invalid timestamp.');
  }
  return {
    action: sanitizeAction(event.action),
    recordedAt
  };
}

function requireObjectId(value, label = 'Git object') {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(normalized)) {
    throw new AppError('HISTORY_GIT_OUTPUT_INVALID', `${label} was not a complete object ID.`);
  }
  return normalized;
}

function validateLabelTimestamp(value) {
  const timestamp = requireString(value, 'history label timestamp', {
    maxLength: 40,
    pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
  });
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new ValidationError('history label timestamp must be an ISO-8601 timestamp.');
  }
  return timestamp;
}

function validateLabelMetadata(value) {
  const metadata = requirePlainObject(value, 'history label metadata');
  const keys = Object.keys(metadata).sort();
  if (keys.length !== 2 || keys[0] !== 'labels' || keys[1] !== 'schemaVersion') {
    throw new ValidationError('History label metadata has an unsupported schema.');
  }
  if (metadata.schemaVersion !== 1 || !Array.isArray(metadata.labels)) {
    throw new ValidationError('History label metadata has an unsupported schema.');
  }
  if (metadata.labels.length > MAX_HISTORY_LABELS) {
    throw new ValidationError(`History label metadata supports at most ${MAX_HISTORY_LABELS} labels.`);
  }
  const seenTrees = new Set();
  const labels = metadata.labels.map((entry, index) => {
    const labelEntry = requirePlainObject(entry, `history label ${index + 1}`);
    const entryKeys = Object.keys(labelEntry).sort();
    if (
      entryKeys.length !== 3 ||
      entryKeys[0] !== 'label' ||
      entryKeys[1] !== 'tree' ||
      entryKeys[2] !== 'updatedAt'
    ) {
      throw new ValidationError(`history label ${index + 1} has an unsupported schema.`);
    }
    const tree = requireObjectId(labelEntry.tree, 'History label tree');
    if (seenTrees.has(tree)) {
      throw new ValidationError('History label metadata contains duplicate snapshot labels.');
    }
    seenTrees.add(tree);
    return {
      tree,
      label: requireHistoryLabel(labelEntry.label),
      updatedAt: validateLabelTimestamp(labelEntry.updatedAt)
    };
  });
  return { schemaVersion: 1, labels };
}

export function sanitizedGitEnvironment(environment, gitHome) {
  if (typeof gitHome !== 'string' || !path.isAbsolute(gitHome)) {
    throw new ValidationError('The private Git configuration directory must be absolute.');
  }
  const result = Object.create(null);
  for (const [key, value] of Object.entries(environment)) {
    if (
      /^GIT_/i.test(key) ||
      /^(?:HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|XDG_CONFIG_HOME)$/i.test(key) ||
      typeof value !== 'string'
    ) continue;
    result[key] = value;
  }
  result.HOME = gitHome;
  result.USERPROFILE = gitHome;
  result.XDG_CONFIG_HOME = gitHome;
  result.GIT_CONFIG_NOSYSTEM = '1';
  result.GIT_CONFIG_GLOBAL = path.join(gitHome, 'global.gitconfig');
  result.GIT_TERMINAL_PROMPT = '0';
  return result;
}

export class GitHistoryService {
  #tail = Promise.resolve();
  #initialized = false;

  constructor(repositoryPath, options = {}) {
    this.repositoryPath = path.resolve(repositoryPath);
    this.fs = options.fs ?? fs;
    this.run = options.run ?? runProcess;
    this.env = options.env ?? process.env;
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? randomUUID;
    if (
      typeof options.gitExecutable !== 'string' ||
      !path.isAbsolute(options.gitExecutable) ||
      path.basename(options.gitExecutable).toLowerCase() !== 'git.exe'
    ) {
      throw new ValidationError('Local history requires an absolute git.exe path selected by the main process.');
    }
    this.gitExecutable = path.resolve(options.gitExecutable);
    this.gitHome = path.resolve(
      options.gitHome ?? path.join(path.dirname(this.repositoryPath), '.material-office-git-home')
    );
    this.gitEnvironment = sanitizedGitEnvironment(this.env, this.gitHome);
    this.snapshotStore = new AtomicJsonStore(path.join(this.repositoryPath, SNAPSHOT_FILE), {
      fs: this.fs,
      defaultValue: { schemaVersion: 1, settings: {}, records: {} },
      validate: (value) => validateJsonValue(value, {
        maxDepth: 28,
        maxNodes: 250_000,
        maxStringLength: (4 * 1024 * 1024) + 1_024
      }),
      maxBytes: MAX_STATE_FILE_BYTES
    });
    this.eventStore = new AtomicJsonStore(path.join(this.repositoryPath, EVENT_FILE), {
      fs: this.fs,
      defaultValue: { schemaVersion: 1, eventId: '', action: 'initialized', recordedAt: '' },
      validate: (value) => validateJsonValue(value),
      maxBytes: 32_768
    });
    this.labelStore = new AtomicJsonStore(
      path.join(this.repositoryPath, '.git', 'material-office', LABEL_METADATA_FILE),
      {
        fs: this.fs,
        defaultValue: { schemaVersion: 1, labels: [] },
        validate: validateLabelMetadata,
        maxBytes: MAX_LABEL_METADATA_BYTES
      }
    );
  }

  async initialize() {
    return this.#enqueue(() => this.#initializeNow());
  }

  async recordSnapshot(state, metadata = {}) {
    return this.#enqueue(async () => {
      await this.#initializeNow();
      const action = sanitizeAction(metadata.action);
      const event = {
        schemaVersion: 1,
        eventId: this.id(),
        action,
        recordedAt: this.now().toISOString()
      };
      if (metadata.sourceRevision) {
        event.sourceRevision = requireRevision(metadata.sourceRevision);
      }

      await this.snapshotStore.write(validateJsonValue(state, {
        maxDepth: 28,
        maxNodes: 250_000,
        maxStringLength: (4 * 1024 * 1024) + 1_024
      }));
      await this.eventStore.write(event);
      await this.#git(['add', '--', SNAPSHOT_FILE, EVENT_FILE]);
      await this.#git(
        [
          '-c', 'commit.gpgsign=false', 'commit', '--no-verify',
          ...snapshotCommitArguments(action, event.recordedAt)
        ],
        [0],
        { environment: this.#commitEnvironment(event.recordedAt) }
      );
      const result = await this.#git(['rev-parse', 'HEAD']);
      return {
        revision: result.stdout.trim(),
        action,
        recordedAt: event.recordedAt
      };
    });
  }

  async listSnapshots(limit = 100) {
    return this.#enqueue(async () => {
      await this.#initializeNow();
      requireInteger(limit, 'limit', { min: 1, max: 10_000 });
      const [result, labelMetadata] = await Promise.all([this.#git([
        'log',
        `--max-count=${limit}`,
        '--format=%H%x1f%T%x1f%cI%x1f%s%x1f%b%x1e'
      ], [0, 128]), this.labelStore.read()]);
      if (result.exitCode === 128 || !result.stdout.trim()) return [];
      const labelsByTree = new Map(labelMetadata.labels.map((entry) => [entry.tree, entry.label]));
      return result.stdout.split('\x1e').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
        const parts = entry.split('\x1f');
        if (parts.length !== 5) {
          throw new AppError('HISTORY_GIT_OUTPUT_INVALID', 'Local history returned malformed snapshot metadata.');
        }
        const [revision, tree, commitRecordedAt, subject, body] = parts;
        const normalizedTree = requireObjectId(tree, 'History snapshot tree');
        return {
          revision: requireObjectId(revision, 'History revision'),
          recordedAt: listedRecordedAt(commitRecordedAt, body),
          action: sanitizeAction(subject?.replace(/^Snapshot:\s*/i, '') || 'state changed'),
          label: labelsByTree.get(normalizedTree) ?? null
        };
      });
    });
  }

  async readSnapshot(revision) {
    return this.#enqueue(async () => {
      await this.#initializeNow();
      return this.#readSnapshotNow(revision);
    });
  }

  async diffSnapshot(revision, currentState) {
    const normalizedRevision = requireExactHistoryRevision(revision);
    return this.#enqueue(async () => {
      await this.#initializeNow();
      await this.#requireRetainedRevisionNow(normalizedRevision);
      const previousState = await this.#readSnapshotNow(normalizedRevision);
      const currentRevision = requireObjectId(
        (await this.#git(['rev-parse', '--verify', 'HEAD'])).stdout,
        'Current history revision'
      );
      return createPublicHistoryDiff({
        revision: normalizedRevision,
        currentRevision,
        previousState,
        currentState
      });
    });
  }

  async labelSnapshot(revision, label) {
    const normalizedRevision = requireExactHistoryRevision(revision);
    const normalizedLabel = requireHistoryLabel(label);
    return this.#enqueue(async () => {
      await this.#initializeNow();
      await this.#requireRetainedRevisionNow(normalizedRevision);
      const tree = await this.#treeForRevisionNow(normalizedRevision);
      const updatedAt = validateLabelTimestamp(this.now().toISOString());
      let storedAt = updatedAt;
      await this.labelStore.update((metadata) => {
        const existing = metadata.labels.find((entry) => entry.tree === tree);
        if (existing?.label === normalizedLabel) {
          storedAt = existing.updatedAt;
          return metadata;
        }
        if (!existing && metadata.labels.length >= MAX_HISTORY_LABELS) {
          throw new AppError(
            'HISTORY_LABEL_LIMIT_REACHED',
            'Prune local history before labeling another snapshot.'
          );
        }
        const labels = metadata.labels.filter((entry) => entry.tree !== tree);
        labels.push({ tree, label: normalizedLabel, updatedAt });
        labels.sort((left, right) => left.tree.localeCompare(right.tree));
        return { schemaVersion: 1, labels };
      });
      return { revision: normalizedRevision, label: normalizedLabel, updatedAt: storedAt };
    });
  }

  async pruneSnapshots(limit) {
    const normalizedLimit = requireInteger(limit, 'history retention limit', {
      min: 10,
      max: 10_000
    });
    return this.#enqueue(async () => {
      await this.#initializeNow();
      const status = await this.#git(['status', '--porcelain=v1', '-z']);
      if (status.stdout.length > 0) {
        throw new AppError(
          'HISTORY_PRUNE_DIRTY',
          'Local history has an incomplete snapshot and cannot be pruned safely.'
        );
      }

      const countResult = await this.#git(['rev-list', '--count', 'HEAD'], [0, 128]);
      if (countResult.exitCode === 128 || !countResult.stdout.trim()) {
        await this.#retainLabelsForTrees(new Set());
        return {
          pruned: false,
          limit: normalizedLimit,
          beforeCount: 0,
          afterCount: 0,
          prunedCount: 0,
          revision: null
        };
      }
      const beforeCount = Number(countResult.stdout.trim());
      if (!Number.isSafeInteger(beforeCount) || beforeCount < 0) {
        throw new AppError('HISTORY_GIT_OUTPUT_INVALID', 'Local history returned an invalid snapshot count.');
      }
      const currentTip = requireObjectId(
        (await this.#git(['rev-parse', '--verify', 'HEAD'])).stdout,
        'Current history revision'
      );
      if (beforeCount <= normalizedLimit) {
        // A previous prune may already have replaced the branch tip but failed
        // before expiring its reflog or collecting the detached objects.  Finish
        // that idempotent cleanup even when the visible chain now meets the
        // requested limit, otherwise a retry can report success while pruned
        // snapshots remain readable by object ID indefinitely.
        await this.#collectUnreachableObjects();
        await this.#retainLabelsForTrees(await this.#retainedTreeIdsNow());
        return {
          pruned: false,
          limit: normalizedLimit,
          beforeCount,
          afterCount: beforeCount,
          prunedCount: 0,
          revision: currentTip
        };
      }

      const branchResult = await this.#git(['symbolic-ref', '-q', 'HEAD'], [0, 1]);
      const branch = branchResult.stdout.trim();
      if (
        branchResult.exitCode !== 0 ||
        !/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(branch) ||
        branch.includes('..') ||
        branch.endsWith('/')
      ) {
        throw new AppError('HISTORY_BRANCH_INVALID', 'Local history is not on a safe app-owned branch.');
      }
      await this.#git(['check-ref-format', branch]);

      const retainedResult = await this.#git([
        'log',
        `--max-count=${normalizedLimit}`,
        '--reverse',
        '--format=%H%x1f%T',
        'HEAD'
      ]);
      const retained = retainedResult.stdout.trim().split(/\r?\n/).map((line) => {
        const parts = line.split('\x1f');
        if (parts.length !== 2) {
          throw new AppError('HISTORY_GIT_OUTPUT_INVALID', 'Local history returned malformed prune metadata.');
        }
        return {
          revision: requireObjectId(parts[0], 'Retained history revision'),
          tree: requireObjectId(parts[1], 'Retained history tree')
        };
      });
      if (retained.length !== normalizedLimit || retained.at(-1)?.revision !== currentTip) {
        throw new AppError('HISTORY_GIT_OUTPUT_INVALID', 'Local history selected the wrong snapshots to retain.');
      }

      let parent = null;
      let oldestRetainedRevision = null;
      for (const retainedEntry of retained) {
        const event = await this.#readEventNow(retainedEntry.revision);
        const args = ['commit-tree', retainedEntry.tree];
        if (parent) args.push('-p', parent);
        args.push(...snapshotCommitArguments(event.action, event.recordedAt));
        const committed = await this.#git(args, [0], {
          environment: this.#commitEnvironment(event.recordedAt)
        });
        parent = requireObjectId(committed.stdout, 'Rewritten history revision');
        oldestRetainedRevision ??= parent;
      }
      const nextTip = parent;
      const candidateCount = Number((await this.#git(['rev-list', '--count', nextTip])).stdout.trim());
      if (candidateCount !== normalizedLimit) {
        throw new AppError('HISTORY_PRUNE_VERIFY_FAILED', 'The retained history chain has the wrong length.');
      }

      await this.#git(['update-ref', branch, nextTip, currentTip]);
      const afterCount = Number((await this.#git(['rev-list', '--count', 'HEAD'])).stdout.trim());
      if (afterCount !== normalizedLimit) {
        throw new AppError('HISTORY_PRUNE_VERIFY_FAILED', 'Local history was not pruned to the requested limit.');
      }
      await this.#retainLabelsForTrees(new Set(retained.map((entry) => entry.tree)));
      await this.#collectUnreachableObjects();
      return {
        pruned: true,
        limit: normalizedLimit,
        beforeCount,
        afterCount,
        prunedCount: beforeCount - afterCount,
        revision: nextTip,
        oldestRetainedRevision
      };
    });
  }

  async restoreSnapshot(revision, applyState) {
    if (typeof applyState !== 'function') {
      throw new TypeError('applyState must be a function');
    }
    return this.#enqueue(async () => {
      await this.#initializeNow();
      const normalizedRevision = requireRevision(revision);
      const state = await this.#readSnapshotNow(normalizedRevision);
      await applyState(structuredClone(state));

      try {
        const snapshot = await this.#recordAfterRestore(state, normalizedRevision);
        return { restored: true, historyRecorded: true, snapshot };
      } catch (error) {
        return {
          restored: true,
          historyRecorded: false,
          historyError: {
            code: error instanceof AppError ? error.code : 'HISTORY_WRITE_FAILED',
            message: 'The restored state was applied, but its history snapshot could not be recorded.'
          }
        };
      }
    });
  }

  #enqueue(operation) {
    const task = this.#tail.then(operation);
    this.#tail = task.catch(() => undefined);
    return task;
  }

  async #initializeNow() {
    if (this.#initialized) return;
    await Promise.all([
      this.fs.mkdir(this.repositoryPath, { recursive: true }),
      this.fs.mkdir(this.gitHome, { recursive: true })
    ]);
    const marker = path.join(this.repositoryPath, '.git');
    let exists = true;
    try {
      await this.fs.stat(marker);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      exists = false;
    }
    if (!exists) {
      const initialized = await this.#git(['init', '--initial-branch=main'], [0, 129]);
      if (initialized.exitCode !== 0) {
        await this.#git(['init']);
      }
    } else {
      await this.#git(['rev-parse', '--is-inside-work-tree']);
    }
    const hooksPath = path.join(this.repositoryPath, '.git', 'material-office-hooks');
    await this.fs.mkdir(hooksPath, { recursive: true });
    await this.#git(['config', 'user.name', 'Material Office History']);
    await this.#git(['config', 'user.email', 'history@material-office.invalid']);
    await this.#git(['config', 'core.autocrlf', 'false']);
    await this.#git(['config', 'core.hooksPath', hooksPath]);
    await this.labelStore.initialize();
    this.#initialized = true;
  }

  async #readSnapshotNow(revision) {
    const normalizedRevision = requireRevision(revision);
    const result = await this.#git(['show', `${normalizedRevision}:${SNAPSHOT_FILE}`], [0, 128]);
    if (result.exitCode !== 0) {
      throw new AppError('SNAPSHOT_NOT_FOUND', 'The requested history snapshot was not found.');
    }
    try {
      return validateJsonValue(JSON.parse(result.stdout), {
        maxDepth: 28,
        maxNodes: 250_000,
        maxStringLength: (4 * 1024 * 1024) + 1_024
      });
    } catch (error) {
      throw new AppError('SNAPSHOT_INVALID', 'The requested history snapshot is invalid.', { cause: error });
    }
  }

  async #recordAfterRestore(state, sourceRevision) {
    const action = 'state restored';
    const event = {
      schemaVersion: 1,
      eventId: this.id(),
      action,
      recordedAt: this.now().toISOString(),
      sourceRevision
    };
    await this.snapshotStore.write(state);
    await this.eventStore.write(event);
    await this.#git(['add', '--', SNAPSHOT_FILE, EVENT_FILE]);
    await this.#git(
      [
        '-c', 'commit.gpgsign=false', 'commit', '--no-verify',
        ...snapshotCommitArguments(action, event.recordedAt)
      ],
      [0],
      { environment: this.#commitEnvironment(event.recordedAt) }
    );
    const result = await this.#git(['rev-parse', 'HEAD']);
    return { revision: result.stdout.trim(), action, recordedAt: event.recordedAt };
  }

  async #readEventNow(revision) {
    const normalizedRevision = requireRevision(revision);
    const result = await this.#git(['show', `${normalizedRevision}:${EVENT_FILE}`], [0, 128]);
    if (result.exitCode !== 0) {
      throw new AppError('HISTORY_EVENT_INVALID', 'A retained history event could not be read.');
    }
    try {
      return validateHistoryEvent(JSON.parse(result.stdout));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('HISTORY_EVENT_INVALID', 'A retained history event is invalid.', { cause: error });
    }
  }

  async #requireRetainedRevisionNow(revision) {
    const normalizedRevision = requireExactHistoryRevision(revision);
    const result = await this.#git(
      ['merge-base', '--is-ancestor', normalizedRevision, 'HEAD'],
      [0, 1, 128]
    );
    if (result.exitCode !== 0) {
      throw new AppError('SNAPSHOT_NOT_FOUND', 'The requested history snapshot was not found.');
    }
    return normalizedRevision;
  }

  async #treeForRevisionNow(revision) {
    const normalizedRevision = requireExactHistoryRevision(revision);
    const result = await this.#git(
      ['rev-parse', '--verify', `${normalizedRevision}^{tree}`],
      [0, 128]
    );
    if (result.exitCode !== 0) {
      throw new AppError('SNAPSHOT_NOT_FOUND', 'The requested history snapshot was not found.');
    }
    return requireObjectId(result.stdout, 'History snapshot tree');
  }

  async #retainedTreeIdsNow() {
    const result = await this.#git(['log', '--format=%T', 'HEAD'], [0, 128]);
    if (result.exitCode === 128 || !result.stdout.trim()) return new Set();
    return new Set(result.stdout.trim().split(/\r?\n/).map((tree) => (
      requireObjectId(tree, 'Retained history tree')
    )));
  }

  async #retainLabelsForTrees(trees) {
    await this.labelStore.update((metadata) => ({
      schemaVersion: 1,
      labels: metadata.labels.filter((entry) => trees.has(entry.tree))
    }));
  }

  #commitEnvironment(recordedAt) {
    return {
      ...this.gitEnvironment,
      GIT_AUTHOR_DATE: recordedAt,
      GIT_COMMITTER_DATE: recordedAt
    };
  }

  async #collectUnreachableObjects() {
    await this.#git(['reflog', 'expire', '--expire=now', '--expire-unreachable=now', '--all']);
    await this.#git(['gc', '--prune=now'], [0], { timeoutMs: 300_000 });
  }

  async #git(args, allowedExitCodes = [0], options = {}) {
    const result = await this.run(this.gitExecutable, ['-C', this.repositoryPath, ...args], {
      shell: false,
      killTree: true,
      env: options.environment ?? this.gitEnvironment,
      timeoutMs: options.timeoutMs ?? 30_000,
      maxOutputBytes: MAX_GIT_OUTPUT_BYTES,
      windowsHide: true
    });
    if (
      result.timedOut ||
      result.aborted ||
      result.stdoutTruncated ||
      result.stderrTruncated
    ) {
      throw new AppError('HISTORY_GIT_OUTPUT_INVALID', 'Local version history returned incomplete process output.');
    }
    if (!allowedExitCodes.includes(result.exitCode)) {
      throw new AppError('HISTORY_GIT_FAILED', 'Local version history is unavailable.');
    }
    return result;
  }
}
