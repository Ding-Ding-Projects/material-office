import assert from 'node:assert/strict';
import test from 'node:test';
import { isProcessAlive, runProcess } from '../../src/main/process-runner.js';

test('a bounded timeout terminates a real Windows parent and child process tree', {
  skip: process.platform !== 'win32'
}, async () => {
  const childScript = 'setTimeout(() => {}, 30000)';
  const parentScript = [
    "const {spawn}=require('node:child_process')",
    `const child=spawn(process.execPath,['-e',${JSON.stringify(childScript)}],{stdio:'ignore'})`,
    'process.stdout.write(String(child.pid)+"\\n")',
    'setTimeout(() => {}, 30000)'
  ].join(';');
  const result = await runProcess(process.execPath, ['-e', parentScript], {
    timeoutMs: 500,
    maxOutputBytes: 1_024,
    killTree: true,
    windowsHide: true
  });
  const childPid = Number(result.stdout.trim());
  assert.equal(result.timedOut, true);
  assert.equal(result.treeTerminated, true);
  assert.equal(Number.isSafeInteger(childPid), true);
  assert.equal(isProcessAlive(childPid), false);
});

test('an abort signal terminates a real process tree before the timeout', {
  skip: process.platform !== 'win32'
}, async () => {
  const controller = new AbortController();
  let spawnedPid;
  const running = runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
    timeoutMs: 30_000,
    maxOutputBytes: 1_024,
    killTree: true,
    windowsHide: true,
    abortSignal: controller.signal,
    onSpawn: (pid) => {
      spawnedPid = pid;
      controller.abort();
    }
  });
  const result = await running;
  assert.equal(result.aborted, true);
  assert.equal(result.timedOut, false);
  assert.equal(result.treeTerminated, true);
  assert.equal(Number.isSafeInteger(spawnedPid), true);
  assert.equal(isProcessAlive(spawnedPid), false);
});
