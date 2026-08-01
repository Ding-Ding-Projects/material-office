import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DataFileService } from '../../src/main/data-file-service.js';
import { ExternalEditorService } from '../../src/main/external-editor-service.js';
import {
  CONTRAST_SETTINGS_URI,
  WindowsSettingsService
} from '../../src/main/windows-settings-service.js';

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-native-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('bounded CSV reads preserve UTF-8 data without returning the selected path', async (t) => {
  const directory = await temporaryDirectory(t);
  const filePath = path.join(directory, '資料 蝦餃.csv');
  await fs.writeFile(filePath, 'name,value\r\n蝦餃,café\r\n', 'utf8');
  const result = await new DataFileService().readCsvSelection(filePath);
  assert.deepEqual(result, {
    name: '資料 蝦餃.csv',
    extension: 'csv',
    text: 'name,value\r\n蝦餃,café\r\n',
    bytes: Buffer.byteLength('name,value\r\n蝦餃,café\r\n'),
    lineCount: 3
  });
  assert.equal(Object.hasOwn(result, 'path'), false);
});

test('CSV reads reject oversized, non-UTF-8, and unsupported files', async (t) => {
  const directory = await temporaryDirectory(t);
  const oversized = path.join(directory, 'large.csv');
  const invalidUtf8 = path.join(directory, 'invalid.csv');
  const unsupported = path.join(directory, 'data.exe');
  await Promise.all([
    fs.writeFile(oversized, '123456789'),
    fs.writeFile(invalidUtf8, Buffer.from([0xff, 0xfe, 0xfd])),
    fs.writeFile(unsupported, 'a,b')
  ]);
  const service = new DataFileService({ maximumBytes: 8 });
  await assert.rejects(service.readCsvSelection(oversized), (error) => error.code === 'CSV_FILE_TOO_LARGE');
  await assert.rejects(service.readCsvSelection(invalidUtf8), (error) => error.code === 'CSV_ENCODING_UNSUPPORTED');
  await assert.rejects(service.readCsvSelection(unsupported), /CSV or TSV/i);
});

test('CSV reads reject an equal-length in-place mutation between bounded reads', async () => {
  const before = Buffer.from('a,b\n1,2\n');
  const after = Buffer.from('a,b\n9,8\n');
  let readCount = 0;
  let changed = false;
  const stat = () => ({
    isFile: () => true,
    dev: 1n,
    ino: 2n,
    size: BigInt(before.length),
    mtimeNs: changed ? 20n : 10n,
    ctimeNs: changed ? 20n : 10n
  });
  const handle = {
    stat: async () => stat(),
    async read(buffer, offset, length, position) {
      const source = changed ? after : before;
      const bytesRead = Math.min(3, length, source.length - position);
      if (bytesRead <= 0) return { bytesRead: 0 };
      source.copy(buffer, offset, position, position + bytesRead);
      readCount += 1;
      if (readCount === 1) changed = true;
      return { bytesRead };
    },
    close: async () => undefined
  };
  const service = new DataFileService({
    fs: { open: async () => handle }
  });
  await assert.rejects(
    service.readCsvSelection(path.resolve('mutating.csv')),
    (error) => error.code === 'CSV_FILE_CHANGED'
  );
});

test('custom editor verification derives an ID from a selected executable and opens with shell false', async (t) => {
  const directory = await temporaryDirectory(t);
  const executable = path.join(directory, 'Example Editor.exe');
  const target = path.join(directory, 'document.odt');
  await Promise.all([fs.writeFile(executable, ''), fs.writeFile(target, '')]);
  const launches = [];
  const service = new ExternalEditorService({
    platform: 'win32',
    env: {},
    launch: async (file, args, options) => {
      launches.push({ file, args, options });
      return { pid: 42 };
    }
  });
  const editor = await service.verifyCustomExecutable(executable);
  assert.match(editor.id, /^custom-[a-f0-9]{16}$/);
  assert.equal(editor.executable, executable);
  const result = await service.open({ editorId: editor.id, targetPath: target }, [editor]);
  assert.equal(result.launched, true);
  assert.deepEqual(launches[0].args, [target]);
  assert.equal(launches[0].options.shell, false);
});

test('Windows contrast settings uses only the fixed URI and absolute explorer executable', async (t) => {
  const directory = await temporaryDirectory(t);
  const windowsRoot = path.join(directory, 'Windows');
  const explorer = path.join(windowsRoot, 'explorer.exe');
  await fs.mkdir(windowsRoot, { recursive: true });
  await fs.writeFile(explorer, '');
  const calls = [];
  const service = new WindowsSettingsService({
    platform: 'win32',
    env: { SystemRoot: windowsRoot },
    launch: async (file, args, options) => {
      calls.push({ file, args, options });
      return { pid: 99 };
    }
  });
  assert.deepEqual(await service.openContrastSettings(), { launched: true, pid: 99 });
  assert.equal(calls[0].file, explorer);
  assert.deepEqual(calls[0].args, [CONTRAST_SETTINGS_URI]);
  assert.equal(calls[0].options.shell, false);
});
