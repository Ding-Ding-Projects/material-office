import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CustomWordDocumentService } from '../../src/main/custom-word-document-service.js';
import { discoverGitExecutable } from '../../src/main/git-executable.js';
import { runProcess } from '../../src/main/process-runner.js';

test('Material Office Word saves commit every change and embeds a verifiable Git bundle', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-word-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const gitExecutable = await discoverGitExecutable();
  assert.ok(gitExecutable);
  const service = new CustomWordDocumentService({ rootPath: path.join(directory, 'app-owned-custom-history'), gitExecutable });
  const targetPath = path.join(directory, 'Budget.mow');
  const first = await service.save({ documentId: 'writer-1', title: 'Budget', kind: 'writer', targetPath, content: { html: '<p>First</p>', undoableAction: 'created' } });
  const second = await service.save({ documentId: 'writer-1', title: 'Budget', kind: 'writer', targetPath, content: { html: '<p>Second</p>', undoableAction: 'updated' } });
  assert.equal(first.undoable, true);
  assert.equal(second.undoable, true);
  assert.notEqual(first.revision, second.revision);
  const packageValue = JSON.parse(await fs.readFile(targetPath, 'utf8'));
  assert.equal(packageValue.format, 'material-office-word');
  assert.equal(packageValue.document.html, '<p>Second</p>');
  assert.equal(packageValue.gitRepository.format, 'git-bundle');
  const bundlePath = path.join(directory, 'embedded.bundle');
  await fs.writeFile(bundlePath, Buffer.from(packageValue.gitRepository.base64, 'base64'));
  const verified = await runProcess(gitExecutable, ['bundle', 'verify', bundlePath], { cwd: path.join(directory, 'app-owned-custom-history', 'writer-1'), shell: false, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }, killTree: true, timeoutMs: 30_000 });
  assert.equal(verified.exitCode, 0, `${verified.stdout}\n${verified.stderr}`);
  assert.equal((await fs.stat(path.join(directory, 'app-owned-custom-history', 'writer-1', '.git'))).isDirectory(), true);
});

test('Material Office Word rejects non-package paths and oversized content', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-word-bounds-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const gitExecutable = await discoverGitExecutable();
  const service = new CustomWordDocumentService({ rootPath: path.join(directory, 'history'), gitExecutable });
  const base = { documentId: 'writer-1', title: 'Budget', kind: 'writer', content: { html: 'ok' } };
  await assert.rejects(service.save({ ...base, targetPath: path.join(directory, 'Budget.docx') }), /\.mow/);
  await assert.rejects(service.save({ ...base, targetPath: path.join(directory, 'Budget.mow'), content: { html: 'x'.repeat(8 * 1024 * 1024) } }), /too large/i);
});
