import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError, ValidationError } from './errors.js';
import { GitHistoryService } from './git-history-service.js';
import { validateJsonValue, requireIdentifier, requirePlainObject, requireString } from './validation.js';

const FORMAT = 'material-office-word';
const VERSION = 1;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

function requireTargetPath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.extname(value).toLowerCase() !== '.mow') {
    throw new ValidationError('Material Office Word documents must use an absolute .mow path.');
  }
  return path.normalize(value);
}

function cloneDocument(value) {
  const document = requirePlainObject(value, 'document content');
  validateJsonValue(document, { maxDepth: 24, maxNodes: 100_000, maxStringLength: MAX_DOCUMENT_BYTES });
  const cloned = structuredClone(document);
  if (Buffer.byteLength(JSON.stringify(cloned), 'utf8') > MAX_DOCUMENT_BYTES) {
    throw new ValidationError('Material Office Word content is too large.');
  }
  return cloned;
}

export class CustomWordDocumentService {
  constructor(options = {}) {
    if (typeof options.rootPath !== 'string' || !path.isAbsolute(options.rootPath)) {
      throw new ValidationError('Custom Word history requires an absolute app-owned root.');
    }
    this.rootPath = path.resolve(options.rootPath);
    this.gitExecutable = options.gitExecutable;
    this.fs = options.fs ?? fs;
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? randomUUID;
    this.histories = new Map();
  }

  #history(documentId) {
    let history = this.histories.get(documentId);
    if (!history) {
      history = new GitHistoryService(path.join(this.rootPath, documentId), {
        gitExecutable: this.gitExecutable, fs: this.fs, now: this.now, id: this.id
      });
      this.histories.set(documentId, history);
    }
    return history;
  }

  async save(input) {
    const payload = requirePlainObject(input, 'Material Office Word save request');
    const keys = Object.keys(payload).sort();
    if (keys.join(',') !== 'content,documentId,kind,targetPath,title') {
      throw new ValidationError('Material Office Word save request contains unsupported fields.');
    }
    const documentId = requireIdentifier(payload.documentId, 'document identifier');
    const title = requireString(payload.title, 'document title', { maxLength: 240 });
    const kind = requireString(payload.kind, 'document kind', { maxLength: 16, pattern: /^[a-z]+$/ });
    const targetPath = requireTargetPath(payload.targetPath);
    const content = cloneDocument(payload.content);
    const history = this.#history(documentId);
    const snapshot = await history.recordSnapshot(
      { schemaVersion: 1, documentId, title, kind, content }, { action: 'document saved' }
    );
    const bundle = await history.exportBundle();
    const packageValue = {
      format: FORMAT, version: VERSION, documentId, title, kind,
      savedAt: this.now().toISOString(), latestRevision: snapshot.revision, document: content,
      gitRepository: { format: 'git-bundle', commits: 'append-only; restore creates a new commit', bytes: bundle.length, base64: bundle.toString('base64') }
    };
    const serialized = JSON.stringify(packageValue);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_DOCUMENT_BYTES * 2) {
      throw new ValidationError('Material Office Word package is too large.');
    }
    await this.fs.mkdir(path.dirname(targetPath), { recursive: true });
    const temporary = `${targetPath}.${this.id()}.tmp`;
    await this.fs.writeFile(temporary, serialized, 'utf8');
    try {
      await this.fs.rename(temporary, targetPath);
    } catch (error) {
      await this.fs.rm(temporary, { force: true }).catch(() => undefined);
      throw new AppError('CUSTOM_WORD_SAVE_FAILED', 'The Material Office Word package could not be published atomically.', { cause: error });
    }
    return { saved: true, format: FORMAT, version: VERSION, documentId, outputName: path.basename(targetPath), revision: snapshot.revision, bytes: Buffer.byteLength(serialized, 'utf8'), gitBundleBytes: bundle.length, undoable: true };
  }
}

export { FORMAT as CUSTOM_WORD_FORMAT, VERSION as CUSTOM_WORD_VERSION, MAX_DOCUMENT_BYTES };
