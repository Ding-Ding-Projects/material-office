import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { AppError, ValidationError } from './errors.js';
import {
  requireAbsolutePath,
  requireIdentifier,
  requirePlainObject,
  requireString
} from './validation.js';

const DOCUMENT_KINDS = /^(?:writer|calc|impress|draw|math|base)$/;
const OPEN_EXTENSIONS = new Set([
  '.odt', '.ott', '.ods', '.ots', '.odp', '.otp', '.odg', '.otg', '.odf', '.odb', '.odm',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.rtf', '.txt', '.csv', '.html', '.htm',
  '.pdf', '.svg'
]);

function validateOfficePath(value, label) {
  const filePath = requireAbsolutePath(value, label);
  if (!OPEN_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    throw new ValidationError(`${label} does not use a supported document extension.`);
  }
  return filePath;
}

function samePath(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function inferDocumentKind(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.ods':
    case '.ots':
    case '.xls':
    case '.xlsx':
    case '.csv':
      return 'calc';
    case '.odp':
    case '.otp':
    case '.ppt':
    case '.pptx':
      return 'impress';
    case '.odg':
    case '.otg':
    case '.svg':
      return 'draw';
    case '.odf':
      return 'math';
    case '.odb':
      return 'base';
    default:
      return 'writer';
  }
}

function exactKeys(input, required, optional, label) {
  const payload = requirePlainObject(input, label);
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(payload);
  if (
    keys.some((key) => !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(payload, key))
  ) {
    throw new ValidationError(`${label} contains unsupported fields.`);
  }
  return payload;
}

export class DocumentWorkspaceService {
  constructor(options) {
    this.state = options.state;
    this.libreOffice = options.libreOffice;
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? randomUUID;
    this.maximumRecentItems = options.maximumRecentItems ?? 50;
  }

  async listDocuments() {
    const records = await this.state.getRecords();
    return records.documents
      .slice()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async listRecent() {
    const records = await this.state.getRecords();
    return records.recentItems.slice(0, this.maximumRecentItems);
  }

  async create(input) {
    const payload = requirePlainObject(input, 'new document request');
    const kind = requireString(payload.kind, 'document kind', { maxLength: 16, pattern: DOCUMENT_KINDS });
    const title = payload.title === undefined
      ? `Untitled ${kind}`
      : requireString(payload.title, 'document title', { maxLength: 240 });
    const launched = await this.libreOffice.launchNew({ kind });
    const timestamp = this.now().toISOString();
    const metadata = {
      id: this.id(),
      title,
      kind,
      filePath: null,
      format: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
      exports: [],
      contentState: 'unsaved-in-libreoffice'
    };
    try {
      const result = await this.state.updateRecords((records) => ({
        ...records,
        documents: [...records.documents, metadata]
      }), 'document metadata created');
      return { ...launched, metadata, metadataSaved: true, history: result.history };
    } catch {
      return {
        ...launched,
        metadata,
        metadataSaved: false,
        metadataError: {
          code: 'METADATA_SAVE_FAILED',
          message: 'LibreOffice opened, but the workspace metadata could not be saved.'
        }
      };
    }
  }

  async openSelectedPath(selectedPath) {
    const filePath = validateOfficePath(selectedPath, 'document path');
    const launched = await this.libreOffice.launchDocument({ filePath });
    const timestamp = this.now().toISOString();
    let metadata;
    try {
      const result = await this.state.updateRecords((records) => {
        const existing = records.documents.find((document) => document.filePath && samePath(document.filePath, filePath));
        metadata = existing
          ? {
              ...existing,
              title: existing.title || path.basename(filePath),
              updatedAt: timestamp,
              lastOpenedAt: timestamp,
              contentState: 'managed-by-libreoffice'
            }
          : {
              id: this.id(),
              title: path.basename(filePath),
              kind: inferDocumentKind(filePath),
              filePath,
              format: path.extname(filePath).slice(1).toLowerCase(),
              createdAt: timestamp,
              updatedAt: timestamp,
              lastOpenedAt: timestamp,
              exports: [],
              contentState: 'managed-by-libreoffice'
            };
        const documents = existing
          ? records.documents.map((document) => document.id === existing.id ? metadata : document)
          : [...records.documents, metadata];
        const recentItem = {
          id: metadata.id,
          title: metadata.title,
          filePath,
          format: metadata.format,
          openedAt: timestamp
        };
        const recentItems = [
          recentItem,
          ...records.recentItems.filter((item) => !samePath(item.filePath, filePath))
        ].slice(0, this.maximumRecentItems);
        return { ...records, documents, recentItems };
      }, 'document opened');
      return { ...launched, metadata, metadataSaved: true, recentRecorded: true, history: result.history };
    } catch {
      return {
        ...launched,
        metadata: null,
        metadataSaved: false,
        recentRecorded: false,
        metadataError: {
          code: 'METADATA_SAVE_FAILED',
          message: 'LibreOffice opened the document, but recent-item metadata could not be saved.'
        }
      };
    }
  }

  async saveMetadata(input) {
    const payload = exactKeys(input, ['id', 'title'], [], 'metadata request');
    const id = requireIdentifier(payload.id, 'document identifier');
    const title = requireString(payload.title, 'document title', { maxLength: 240 });
    let updated;
    const result = await this.state.updateRecords((records) => {
      const existing = records.documents.find((document) => document.id === id);
      if (!existing) {
        throw new AppError('DOCUMENT_METADATA_NOT_FOUND', 'The document metadata was not found.');
      }
      updated = {
        ...existing,
        title,
        updatedAt: this.now().toISOString()
      };
      return {
        ...records,
        documents: records.documents.map((document) => document.id === id ? updated : document)
      };
    }, 'document metadata saved');
    return {
      metadata: updated,
      metadataSaved: true,
      documentContentSaved: false,
      scope: 'metadata-only',
      history: result.history
    };
  }

  async launchDocument(input) {
    const payload = exactKeys(input, ['documentId'], [], 'launch document request');
    const documentId = requireIdentifier(payload.documentId, 'document identifier');
    const records = await this.state.getRecords();
    const document = records.documents.find((candidate) => candidate.id === documentId);
    if (!document) {
      throw new AppError('DOCUMENT_METADATA_NOT_FOUND', 'The selected document is not in the workspace.');
    }
    if (typeof document.filePath !== 'string' || !document.filePath) {
      throw new AppError('DOCUMENT_NATIVE_FILE_UNAVAILABLE', 'The selected document does not have a saved native file yet.');
    }
    const filePath = validateOfficePath(document.filePath, 'document path');
    const launched = await this.libreOffice.launchDocument({ filePath });
    return { ...launched, documentId, nativeFileName: path.basename(filePath) };
  }

  async export(input) {
    const payload = exactKeys(
      input,
      ['documentId', 'outputDirectory', 'targetFormat'],
      [],
      'export request'
    );
    const documentId = requireIdentifier(payload.documentId, 'document identifier');
    const recordsBeforeExport = await this.state.getRecords();
    const document = recordsBeforeExport.documents.find((candidate) => candidate.id === documentId);
    if (!document) {
      throw new AppError('DOCUMENT_METADATA_NOT_FOUND', 'The selected document is not in the workspace.');
    }
    if (typeof document.filePath !== 'string' || !document.filePath) {
      throw new AppError('DOCUMENT_NATIVE_FILE_UNAVAILABLE', 'The selected document does not have a saved native file yet.');
    }
    const sourcePath = validateOfficePath(document.filePath, 'source path');
    const conversion = await this.libreOffice.convertDocument({
      sourcePath,
      outputDirectory: requireAbsolutePath(payload.outputDirectory, 'output directory'),
      targetFormat: payload.targetFormat
    });
    const timestamp = this.now().toISOString();
    try {
      const result = await this.state.updateRecords((records) => {
        const documents = records.documents.map((candidate) => candidate.id === documentId
          ? {
              ...candidate,
              updatedAt: timestamp,
              exports: [
                ...(Array.isArray(candidate.exports) ? candidate.exports : []),
                {
                  outputPath: conversion.outputPath,
                  targetFormat: conversion.targetFormat,
                  exportedAt: timestamp
                }
              ].slice(-100)
            }
          : candidate);
        return { ...records, documents };
      }, 'document exported');
      return { ...conversion, documentId, metadataSaved: true, history: result.history };
    } catch {
      return {
        ...conversion,
        documentId,
        metadataSaved: false,
        metadataError: {
          code: 'METADATA_SAVE_FAILED',
          message: 'The export succeeded, but its workspace metadata could not be saved.'
        }
      };
    }
  }
}

export { validateOfficePath };
