import { spawn } from 'node:child_process';
import path from 'node:path';
import { AppError } from './errors.js';

function appendBounded(chunks, chunk, state, maximum) {
  if (state.bytes >= maximum) {
    state.truncated = true;
    return;
  }
  const remaining = maximum - state.bytes;
  const slice = chunk.subarray(0, remaining);
  chunks.push(slice);
  state.bytes += slice.length;
  if (slice.length < chunk.length) {
    state.truncated = true;
  }
}

export function terminateProcessTree(pid, options = {}) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return Promise.resolve(false);
  const platform = options.platform ?? process.platform;
  const environment = options.env ?? process.env;
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (platform !== 'win32') {
    try {
      process.kill(pid, 'SIGKILL');
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }

  const windowsDirectory = environment.SystemRoot ?? environment.WINDIR;
  if (!windowsDirectory || !path.isAbsolute(windowsDirectory)) {
    try {
      process.kill(pid, 'SIGKILL');
      return Promise.resolve(!isProcessAlive(pid));
    } catch {
      return Promise.resolve(false);
    }
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const child = spawn(
      path.resolve(windowsDirectory, 'System32', 'taskkill.exe'),
      ['/pid', String(pid), '/t', '/f'],
      { shell: false, windowsHide: true, stdio: 'ignore' }
    );
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // The target may already have exited.
      }
      finish(!isProcessAlive(pid));
    }, timeoutMs);
    child.once('error', () => finish(!isProcessAlive(pid)));
    child.once('close', () => finish(!isProcessAlive(pid)));
  });
}

export function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function runProcess(executable, args, options = {}) {
  const {
    cwd,
    env,
    timeoutMs = 30_000,
    maxOutputBytes = 65_536,
    windowsHide = true,
    killTree = false,
    abortSignal,
    onSpawn
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      shell: false,
      windowsHide,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    const stdoutState = { bytes: 0, truncated: false };
    const stderrState = { bytes: 0, truncated: false };
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let terminationPromise = null;

    const terminate = () => {
      if (terminationPromise) return terminationPromise;
      if (killTree && child.pid) {
        terminationPromise = terminateProcessTree(child.pid, { timeoutMs: 5_000 });
        void terminationPromise.finally(() => child.kill('SIGKILL'));
      } else {
        child.kill('SIGKILL');
        terminationPromise = Promise.resolve(null);
      }
      return terminationPromise;
    };

    const abortHandler = () => {
      aborted = true;
      terminate();
    };
    abortSignal?.addEventListener('abort', abortHandler, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    timer.unref?.();

    child.stdout.on('data', (chunk) => appendBounded(stdout, chunk, stdoutState, maxOutputBytes));
    child.stderr.on('data', (chunk) => appendBounded(stderr, chunk, stderrState, maxOutputBytes));
    child.once('spawn', () => {
      try {
        onSpawn?.(child.pid);
      } catch {
        aborted = true;
        terminate();
      }
      if (abortSignal?.aborted) abortHandler();
    });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', abortHandler);
      reject(new AppError('PROCESS_START_FAILED', 'The required process could not be started.', { cause: error }));
    });
    child.once('close', async (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', abortHandler);
      const treeTerminated = terminationPromise ? await terminationPromise : null;
      resolve({
        exitCode,
        signal,
        timedOut,
        aborted,
        treeTerminated,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        stdoutTruncated: stdoutState.truncated,
        stderrTruncated: stderrState.truncated
      });
    });
  });
}

export function spawnDetached(executable, args, options = {}) {
  const { cwd, env, windowsHide = false, onClose } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      shell: false,
      detached: true,
      windowsHide,
      stdio: 'ignore'
    });
    let started = false;
    child.once('error', (error) => {
      if (!started) {
        reject(new AppError('PROCESS_START_FAILED', 'The application could not be started.', { cause: error }));
      }
    });
    child.once('spawn', () => {
      started = true;
      child.unref();
      resolve({ pid: child.pid });
    });
    if (onClose) {
      child.once('close', onClose);
    }
  });
}
