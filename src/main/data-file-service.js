import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError, ValidationError } from './errors.js';
import { requireAbsolutePath } from './validation.js';

const CSV_EXTENSIONS = new Set(['.csv', '.tsv']);

function fileVersion(stat) {
  const fields = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'];
  if (fields.some((field) => !['bigint', 'number'].includes(typeof stat[field]))) return null;
  return fields.map((field) => String(stat[field])).join(':');
}

export class DataFileService {
  constructor(options = {}) {
    this.fs = options.fs ?? fs;
    this.maximumBytes = options.maximumBytes ?? 2 * 1024 * 1024;
    this.maximumLines = options.maximumLines ?? 100_000;
  }

  async readCsvSelection(candidatePath) {
    const filePath = requireAbsolutePath(candidatePath, 'CSV file');
    const extension = path.extname(filePath).toLowerCase();
    if (!CSV_EXTENSIONS.has(extension)) {
      throw new ValidationError('Select a CSV or TSV file.');
    }

    let handle;
    try {
      handle = await this.fs.open(filePath, 'r');
      const stat = await handle.stat({ bigint: true });
      if (!stat.isFile()) throw new AppError('CSV_FILE_INVALID', 'The selected data file is not a regular file.');
      const initialVersion = fileVersion(stat);
      if (!initialVersion) {
        throw new AppError('CSV_CHANGE_DETECTION_UNAVAILABLE', 'The selected data file cannot be read safely on this filesystem.');
      }
      if (stat.size > BigInt(this.maximumBytes)) {
        throw new AppError('CSV_FILE_TOO_LARGE', 'The selected data file exceeds the 2 MiB limit.');
      }
      const expectedBytes = Number(stat.size);
      const buffer = Buffer.alloc(Math.min(this.maximumBytes + 1, expectedBytes + 1));
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      const finalStat = await handle.stat({ bigint: true });
      if (fileVersion(finalStat) !== initialVersion || offset !== expectedBytes) {
        throw new AppError('CSV_FILE_CHANGED', 'The selected data file changed while it was being read.');
      }
      if (offset > this.maximumBytes) {
        throw new AppError('CSV_FILE_TOO_LARGE', 'The selected data file exceeds the 2 MiB limit.');
      }
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset));
      } catch (error) {
        throw new AppError('CSV_ENCODING_UNSUPPORTED', 'The selected data file must use UTF-8.', { cause: error });
      }
      const lineCount = text.length === 0 ? 0 : (text.match(/\r\n|\r|\n/g)?.length ?? 0) + 1;
      if (lineCount > this.maximumLines) {
        throw new AppError('CSV_ROW_LIMIT_EXCEEDED', 'The selected data file has too many rows.');
      }
      return {
        name: path.basename(filePath),
        extension: extension.slice(1),
        text,
        bytes: offset,
        lineCount
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('CSV_READ_FAILED', 'The selected data file could not be read.', { cause: error });
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }
}
