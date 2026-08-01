import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './errors.js';

function fileVersion(stat) {
  const fields = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'];
  if (fields.some((field) => !['bigint', 'number'].includes(typeof stat[field]))) return null;
  return fields.map((field) => String(stat[field])).join(':');
}

export class AtomicJsonStore {
  #tail = Promise.resolve();

  constructor(filePath, options = {}) {
    this.filePath = path.resolve(filePath);
    this.defaultValue = structuredClone(options.defaultValue);
    this.validate = options.validate ?? ((value) => value);
    this.fs = options.fs ?? fs;
    this.maxBytes = options.maxBytes ?? 2_000_000;
  }

  async initialize() {
    return this.#enqueue(async () => {
      await this.fs.mkdir(path.dirname(this.filePath), { recursive: true });
      try {
        return await this.#readNow();
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        const initial = this.validate(structuredClone(this.defaultValue));
        await this.#writeNow(initial);
        return structuredClone(initial);
      }
    });
  }

  async read() {
    return this.#enqueue(() => this.#readNow());
  }

  async write(value) {
    return this.#enqueue(async () => {
      const validated = this.validate(structuredClone(value));
      await this.#writeNow(validated);
      return structuredClone(validated);
    });
  }

  async update(transform) {
    if (typeof transform !== 'function') {
      throw new TypeError('transform must be a function');
    }
    return this.#enqueue(async () => {
      const current = await this.#readNow();
      const next = this.validate(await transform(structuredClone(current)));
      await this.#writeNow(next);
      return structuredClone(next);
    });
  }

  #enqueue(operation) {
    const task = this.#tail.then(operation);
    this.#tail = task.catch(() => undefined);
    return task;
  }

  async #readNow() {
    let handle;
    let raw;
    try {
      handle = await this.fs.open(this.filePath, 'r');
      const initialStat = await handle.stat({ bigint: true });
      if (!initialStat.isFile()) {
        throw new AppError('STATE_READ_FAILED', 'Saved application data is not a regular file.');
      }
      const initialVersion = fileVersion(initialStat);
      if (!initialVersion) {
        throw new AppError('STATE_READ_FAILED', 'Saved application data cannot be read safely on this filesystem.');
      }
      if (initialStat.size > BigInt(this.maxBytes)) {
        throw new AppError('STATE_TOO_LARGE', 'Saved application data exceeds the supported size.');
      }
      const expectedBytes = Number(initialStat.size);
      const buffer = Buffer.alloc(Math.min(this.maxBytes + 1, expectedBytes + 1));
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      const finalStat = await handle.stat({ bigint: true });
      if (fileVersion(finalStat) !== initialVersion || offset !== expectedBytes) {
        throw new AppError('STATE_CHANGED', 'Saved application data changed while it was being read.');
      }
      if (offset > this.maxBytes) {
        throw new AppError('STATE_TOO_LARGE', 'Saved application data exceeds the supported size.');
      }
      try {
        raw = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset));
      } catch (error) {
        throw new AppError('STATE_INVALID', 'Saved application data is not valid UTF-8.', { cause: error });
      }
    } catch (error) {
      if (error?.code === 'ENOENT') throw error;
      if (error instanceof AppError) throw error;
      throw new AppError('STATE_READ_FAILED', 'Saved application data could not be read.', { cause: error });
    } finally {
      await handle?.close().catch(() => undefined);
    }
    try {
      return structuredClone(this.validate(JSON.parse(raw)));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('STATE_INVALID', 'Saved application data is invalid.', { cause: error });
    }
  }

  async #writeNow(value) {
    const raw = `${JSON.stringify(value, null, 2)}\n`;
    if (Buffer.byteLength(raw, 'utf8') > this.maxBytes) {
      throw new AppError('STATE_TOO_LARGE', 'Application data exceeds the supported size.');
    }

    const directory = path.dirname(this.filePath);
    const temporaryPath = path.join(directory, `.${path.basename(this.filePath)}.${randomUUID()}.tmp`);
    let handle;
    try {
      await this.fs.mkdir(directory, { recursive: true });
      handle = await this.fs.open(temporaryPath, 'wx', 0o600);
      await handle.writeFile(raw, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await this.fs.rename(temporaryPath, this.filePath);
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await this.fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new AppError('STATE_WRITE_FAILED', 'Application data could not be saved.', { cause: error });
    }
  }
}
