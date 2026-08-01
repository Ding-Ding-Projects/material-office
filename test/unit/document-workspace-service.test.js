import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DocumentWorkspaceService } from '../../src/main/document-workspace-service.js';

function fixture() {
  let records = {
    schemaVersion: 1,
    documents: [],
    recentItems: [],
    notifications: [],
    workspace: null
  };
  const launches = [];
  const conversions = [];
  const state = {
    getRecords: async () => structuredClone(records),
    updateRecords: async (transform) => {
      records = await transform(structuredClone(records));
      return { records: structuredClone(records), changed: true, history: { recorded: true } };
    }
  };
  const libreOffice = {
    launchDocument: async ({ filePath }) => {
      launches.push(filePath);
      return { launched: true, pid: 42, filePath };
    },
    convertDocument: async (request) => {
      conversions.push(request);
      return {
        converted: true,
        sourcePath: request.sourcePath,
        outputPath: path.join(request.outputDirectory, 'report.pdf'),
        targetFormat: request.targetFormat,
        bytes: 321
      };
    }
  };
  const service = new DocumentWorkspaceService({
    state,
    libreOffice,
    id: () => 'document-1',
    now: () => new Date('2026-07-31T20:00:00.000Z')
  });
  return { service, launches, conversions, records: () => structuredClone(records) };
}

test('native document paths enter records only through the main-owned selection method', async () => {
  const setup = fixture();
  const selectedPath = path.join(os.tmpdir(), 'report.odt');
  const opened = await setup.service.openSelectedPath(selectedPath);
  assert.equal(opened.metadata.filePath, selectedPath);
  assert.deepEqual(setup.launches, [selectedPath]);

  await assert.rejects(
    setup.service.saveMetadata({
      id: 'document-1',
      title: 'Poisoned',
      filePath: 'C:\\Windows\\notepad.exe'
    }),
    /unsupported fields/i
  );
  assert.equal(setup.records().documents[0].filePath, selectedPath);

  const renamed = await setup.service.saveMetadata({ id: 'document-1', title: 'Renamed' });
  assert.equal(renamed.metadata.title, 'Renamed');
  assert.equal(renamed.metadata.filePath, selectedPath);
});

test('launch and export resolve the protected record path from a document ID', async () => {
  const setup = fixture();
  const selectedPath = path.join(os.tmpdir(), 'report.odt');
  const outputDirectory = path.join(os.tmpdir(), 'exports');
  await setup.service.openSelectedPath(selectedPath);

  const launched = await setup.service.launchDocument({ documentId: 'document-1' });
  assert.equal(launched.documentId, 'document-1');
  assert.equal(setup.launches.at(-1), selectedPath);
  await assert.rejects(
    setup.service.launchDocument({ documentId: 'document-1', filePath: 'C:\\untrusted.odt' }),
    /unsupported fields/i
  );

  const exported = await setup.service.export({
    documentId: 'document-1',
    outputDirectory,
    targetFormat: 'pdf'
  });
  assert.equal(exported.documentId, 'document-1');
  assert.equal(setup.conversions[0].sourcePath, selectedPath);
  await assert.rejects(
    setup.service.export({
      documentId: 'document-1',
      outputDirectory,
      targetFormat: 'pdf',
      sourcePath: 'C:\\untrusted.odt'
    }),
    /unsupported fields/i
  );
});
