import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LibreOfficeService } from '../../src/main/libreoffice-service.js';
import { pyunoProbeArguments } from '../../src/main/libreoffice-python.js';

async function fakeInstallation(t, folderName = 'LibreOfficeDev 27') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-lo-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const programDirectory = path.join(root, folderName, 'program');
  await fs.mkdir(programDirectory, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(programDirectory, 'soffice.exe'), ''),
    fs.writeFile(path.join(programDirectory, 'soffice.com'), '')
  ]);
  return { root, programDirectory };
}

test('discovery finds versioned LibreOfficeDev directories and assigns GUI/console binaries', async (t) => {
  const { root, programDirectory } = await fakeInstallation(t);
  const service = new LibreOfficeService({
    platform: 'win32',
    env: { ProgramFiles: root },
    registryProvider: async () => [],
    profileRoot: path.join(root, 'profiles')
  });

  const availability = await service.getAvailability();
  assert.equal(availability.available, true);
  assert.equal(availability.guiAvailable, true);
  assert.equal(availability.conversionAvailable, true);
  assert.equal(availability.installation.guiExecutable, path.join(programDirectory, 'soffice.exe'));
  assert.equal(availability.installation.headlessExecutable, path.join(programDirectory, 'soffice.com'));
});

test('an absolute environment override has priority over registry and standard paths', async (t) => {
  const first = await fakeInstallation(t, 'ExplicitOffice');
  const second = await fakeInstallation(t, 'RegistryOffice');
  const service = new LibreOfficeService({
    platform: 'win32',
    env: {
      MATERIAL_OFFICE_SOFFICE: path.join(first.programDirectory, 'soffice.exe'),
      ProgramFiles: second.root
    },
    registryProvider: async () => [second.programDirectory],
    profileRoot: path.join(first.root, 'profiles')
  });
  const { installation } = await service.discover();
  assert.equal(installation.source, 'environment');
  assert.equal(installation.programDirectory, first.programDirectory);
});

test('a selected LibreOffice override is applied only after protected persistence succeeds', async (t) => {
  const first = await fakeInstallation(t, 'FirstOffice');
  const second = await fakeInstallation(t, 'SecondOffice');
  const service = new LibreOfficeService({
    platform: 'win32',
    explicitOverride: path.join(first.programDirectory, 'soffice.exe'),
    env: {},
    registryProvider: async () => [],
    profileRoot: path.join(first.root, 'profiles')
  });
  assert.equal((await service.discover()).installation.programDirectory, first.programDirectory);
  await assert.rejects(
    service.setExplicitOverride(path.join(second.programDirectory, 'soffice.exe'), {
      beforeApply: async () => {
        throw new Error('simulated protected-state failure');
      }
    }),
    /simulated protected-state failure/
  );
  assert.equal(service.explicitOverride, path.join(first.programDirectory, 'soffice.exe'));
  assert.equal((await service.discover()).installation.programDirectory, first.programDirectory);
});

test('headless conversion uses fixed arguments, a job profile, console binary, and isolated output', async (t) => {
  const { root, programDirectory } = await fakeInstallation(t);
  const sourcePath = path.join(root, '季度報告 café 蝦餃.odt');
  const outputDirectory = path.join(root, '匯出 exports');
  await fs.writeFile(sourcePath, 'not real office content; the fake runner does not parse it');
  const calls = [];
  let stagedSourceContent;
  const service = new LibreOfficeService({
    platform: 'win32',
    env: { MATERIAL_OFFICE_SOFFICE: path.join(programDirectory, 'soffice.exe') },
    registryProvider: async () => [],
    profileRoot: path.join(root, 'profiles'),
    run: async (executable, args, options) => {
      calls.push({ executable, args, options });
      stagedSourceContent = await fs.readFile(args.at(-1), 'utf8');
      const outDirectory = args[args.indexOf('--outdir') + 1];
      await fs.writeFile(path.join(outDirectory, '季度報告 café 蝦餃.pdf'), 'converted');
      return { exitCode: 0, signal: null, timedOut: false, stdout: '', stderr: '' };
    }
  });

  const result = await service.convertDocument({
    sourcePath,
    outputDirectory,
    targetFormat: 'pdf'
  });
  assert.equal(result.converted, true);
  assert.equal(result.outputPath, path.join(outputDirectory, '季度報告 café 蝦餃.pdf'));
  assert.equal(await fs.readFile(result.outputPath, 'utf8'), 'converted');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, path.join(programDirectory, 'soffice.com'));
  assert.equal(path.isAbsolute(calls[0].executable), true);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.killTree, true);
  assert.match(calls[0].args[0], /^-env:UserInstallation=file:\/\/\//);
  assert.deepEqual(calls[0].args.slice(-5), [
    '--convert-to',
    'pdf',
    '--outdir',
    calls[0].args.at(-2),
    calls[0].args.at(-1)
  ]);
  assert.equal(path.basename(calls[0].args.at(-1)), path.basename(sourcePath));
  assert.notEqual(calls[0].args.at(-1), sourcePath);
  assert.equal(stagedSourceContent, 'not real office content; the fake runner does not parse it');
  assert.equal(calls[0].args.some((argument) => argument.includes('writer_pdf_Export')), false);
});

test('conversion rejects a nonzero LibreOffice exit even when stdout claims a filter was selected', async (t) => {
  const { root, programDirectory } = await fakeInstallation(t);
  const sourcePath = path.join(root, 'source.html');
  const outputDirectory = path.join(root, 'output');
  await fs.writeFile(sourcePath, '<!doctype html><meta charset="utf-8"><p>蝦餃</p>');
  const service = new LibreOfficeService({
    platform: 'win32',
    env: { MATERIAL_OFFICE_SOFFICE: path.join(programDirectory, 'soffice.exe') },
    registryProvider: async () => [],
    profileRoot: path.join(root, 'profiles'),
    run: async () => ({
      exitCode: 255,
      signal: null,
      timedOut: false,
      stdout: 'convert source.html using filter : writer_pdf_Export',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false
    })
  });
  await assert.rejects(
    service.convertDocument({ sourcePath, outputDirectory, targetFormat: 'pdf' }),
    (error) => error.code === 'CONVERSION_FAILED'
  );
  assert.equal(await fs.readdir(outputDirectory).then((items) => items.length), 0);
});

test('conversion enforces source and output byte ceilings before publishing a file', async (t) => {
  const { root, programDirectory } = await fakeInstallation(t);
  const oversizedSource = path.join(root, 'oversized.odt');
  const smallSource = path.join(root, 'small.odt');
  const outputDirectory = path.join(root, 'output');
  await Promise.all([
    fs.writeFile(oversizedSource, Buffer.alloc(9)),
    fs.writeFile(smallSource, Buffer.alloc(1))
  ]);
  let runs = 0;
  const sourceBounded = new LibreOfficeService({
    platform: 'win32',
    env: { MATERIAL_OFFICE_SOFFICE: path.join(programDirectory, 'soffice.exe') },
    registryProvider: async () => [],
    profileRoot: path.join(root, 'source-profiles'),
    maximumConversionSourceBytes: 8,
    run: async () => {
      runs += 1;
      throw new Error('runner must not start');
    }
  });
  await assert.rejects(
    sourceBounded.convertDocument({
      sourcePath: oversizedSource,
      outputDirectory,
      targetFormat: 'pdf'
    }),
    (error) => error.code === 'CONVERSION_SOURCE_TOO_LARGE'
  );
  assert.equal(runs, 0);

  const outputBounded = new LibreOfficeService({
    platform: 'win32',
    env: { MATERIAL_OFFICE_SOFFICE: path.join(programDirectory, 'soffice.exe') },
    registryProvider: async () => [],
    profileRoot: path.join(root, 'output-profiles'),
    maximumConversionSourceBytes: 8,
    maximumConversionOutputBytes: 8,
    conversionMonitorIntervalMs: 5,
    run: async (_executable, args, options) => {
      const jobDirectory = args[args.indexOf('--outdir') + 1];
      await fs.writeFile(path.join(jobDirectory, 'small.pdf'), Buffer.alloc(9));
      await new Promise((resolve) => {
        if (options.abortSignal.aborted) resolve();
        else options.abortSignal.addEventListener('abort', resolve, { once: true });
      });
      return {
        exitCode: null,
        signal: 'SIGKILL',
        timedOut: false,
        aborted: true,
        stdout: '',
        stderr: '',
        stdoutTruncated: false,
        stderrTruncated: false
      };
    }
  });
  await assert.rejects(
    outputBounded.convertDocument({
      sourcePath: smallSource,
      outputDirectory,
      targetFormat: 'pdf'
    }),
    (error) => error.code === 'CONVERSION_OUTPUT_TOO_LARGE'
  );
  assert.equal(await fs.readdir(outputDirectory).then((entries) => entries.length), 0);
});

test('conversion accepts an output exactly at the configured byte ceiling', async (t) => {
  const { root, programDirectory } = await fakeInstallation(t);
  const sourcePath = path.join(root, 'boundary.odt');
  const outputDirectory = path.join(root, 'output');
  await fs.writeFile(sourcePath, Buffer.alloc(8));
  const service = new LibreOfficeService({
    platform: 'win32',
    env: { MATERIAL_OFFICE_SOFFICE: path.join(programDirectory, 'soffice.exe') },
    registryProvider: async () => [],
    profileRoot: path.join(root, 'profiles'),
    maximumConversionSourceBytes: 8,
    maximumConversionOutputBytes: 8,
    run: async (_executable, args) => {
      const jobDirectory = args[args.indexOf('--outdir') + 1];
      await fs.writeFile(path.join(jobDirectory, 'boundary.pdf'), Buffer.alloc(8));
      return {
        exitCode: 0,
        signal: null,
        timedOut: false,
        stdout: '',
        stderr: '',
        stdoutTruncated: false,
        stderrTruncated: false
      };
    }
  });
  const result = await service.convertDocument({ sourcePath, outputDirectory, targetFormat: 'pdf' });
  assert.equal(result.bytes, 8);
});

test('a fast conversion cannot hide oversized extra output files from the final aggregate scan', async (t) => {
  const { root, programDirectory } = await fakeInstallation(t);
  const sourcePath = path.join(root, 'fast.odt');
  const outputDirectory = path.join(root, 'output');
  await fs.writeFile(sourcePath, Buffer.alloc(1));
  const service = new LibreOfficeService({
    platform: 'win32',
    env: { MATERIAL_OFFICE_SOFFICE: path.join(programDirectory, 'soffice.exe') },
    registryProvider: async () => [],
    profileRoot: path.join(root, 'profiles'),
    maximumConversionOutputBytes: 8,
    conversionMonitorIntervalMs: 100,
    run: async (_executable, args) => {
      const jobOutputDirectory = args[args.indexOf('--outdir') + 1];
      await Promise.all([
        fs.writeFile(path.join(jobOutputDirectory, 'fast.pdf'), Buffer.alloc(1)),
        fs.writeFile(path.join(jobOutputDirectory, 'extra.tmp'), Buffer.alloc(8))
      ]);
      return {
        exitCode: 0,
        signal: null,
        timedOut: false,
        stdout: '',
        stderr: '',
        stdoutTruncated: false,
        stderrTruncated: false
      };
    }
  });
  await assert.rejects(
    service.convertDocument({ sourcePath, outputDirectory, targetFormat: 'pdf' }),
    (error) => error.code === 'CONVERSION_OUTPUT_TOO_LARGE'
  );
  assert.equal(await fs.readdir(outputDirectory).then((entries) => entries.length), 0);
});

test('conversion rejects a source whose change token moves during bounded staging', async (t) => {
  const { root, programDirectory } = await fakeInstallation(t);
  const sourcePath = path.join(root, 'changing.odt');
  const outputDirectory = path.join(root, 'output');
  await fs.writeFile(sourcePath, Buffer.alloc(8));
  let versionChanged = false;
  const fileSystem = new Proxy(fs, {
    get(target, property) {
      if (property !== 'open') return target[property];
      return async (candidate, flags, ...rest) => {
        const handle = await target.open(candidate, flags, ...rest);
        if (path.resolve(candidate) !== path.resolve(sourcePath) || flags !== 'r') return handle;
        const original = await handle.stat({ bigint: true });
        return {
          async stat() {
            return {
              isFile: () => true,
              dev: original.dev,
              ino: original.ino,
              size: original.size,
              mtimeNs: original.mtimeNs + (versionChanged ? 1n : 0n),
              ctimeNs: original.ctimeNs + (versionChanged ? 1n : 0n)
            };
          },
          async read(...args) {
            const result = await handle.read(...args);
            if (result.bytesRead > 0) versionChanged = true;
            return result;
          },
          close: () => handle.close()
        };
      };
    }
  });
  let ran = false;
  const service = new LibreOfficeService({
    fs: fileSystem,
    platform: 'win32',
    env: { MATERIAL_OFFICE_SOFFICE: path.join(programDirectory, 'soffice.exe') },
    registryProvider: async () => [],
    profileRoot: path.join(root, 'profiles'),
    maximumConversionSourceBytes: 8,
    run: async () => {
      ran = true;
      throw new Error('runner must not start');
    }
  });
  await assert.rejects(
    service.convertDocument({ sourcePath, outputDirectory, targetFormat: 'pdf' }),
    (error) => error.code === 'CONVERSION_SOURCE_CHANGED'
  );
  assert.equal(ran, false);
  assert.equal(await fs.readdir(outputDirectory).then((entries) => entries.length), 0);
});

test('a converted file grown after aggregate validation is rejected before atomic publication', async (t) => {
  const { root, programDirectory } = await fakeInstallation(t);
  const sourcePath = path.join(root, 'swap.odt');
  const outputDirectory = path.join(root, 'output');
  await fs.writeFile(sourcePath, Buffer.alloc(1));
  let grownAfterValidation = false;
  const fileSystem = new Proxy(fs, {
    get(target, property) {
      if (property !== 'stat') return target[property];
      return async (candidate, ...args) => {
        const stat = await target.stat(candidate, ...args);
        if (
          !grownAfterValidation &&
          path.basename(candidate).toLowerCase() === 'swap.pdf' &&
          String(candidate).includes('.material-office-convert-')
        ) {
          await target.writeFile(candidate, Buffer.alloc(9));
          grownAfterValidation = true;
        }
        return stat;
      };
    }
  });
  const service = new LibreOfficeService({
    fs: fileSystem,
    platform: 'win32',
    env: { MATERIAL_OFFICE_SOFFICE: path.join(programDirectory, 'soffice.exe') },
    registryProvider: async () => [],
    profileRoot: path.join(root, 'profiles'),
    maximumConversionOutputBytes: 8,
    conversionMonitorIntervalMs: 5,
    run: async (_executable, args) => {
      const jobOutputDirectory = args[args.indexOf('--outdir') + 1];
      await fs.writeFile(path.join(jobOutputDirectory, 'swap.pdf'), Buffer.alloc(8));
      return {
        exitCode: 0,
        signal: null,
        timedOut: false,
        stdout: '',
        stderr: '',
        stdoutTruncated: false,
        stderrTruncated: false
      };
    }
  });
  await assert.rejects(
    service.convertDocument({ sourcePath, outputDirectory, targetFormat: 'pdf' }),
    (error) => error.code === 'CONVERSION_OUTPUT_TOO_LARGE'
  );
  assert.equal(grownAfterValidation, true);
  assert.equal(await fs.readdir(outputDirectory).then((entries) => entries.length), 0);
});

test('GUI launch uses soffice.exe, shell false, an absolute document, and a job profile', async (t) => {
  const { root, programDirectory } = await fakeInstallation(t);
  const documentPath = path.join(root, 'safe.odt');
  await fs.writeFile(documentPath, 'fixture');
  const calls = [];
  const service = new LibreOfficeService({
    platform: 'win32',
    env: { MATERIAL_OFFICE_SOFFICE: path.join(programDirectory, 'soffice.com') },
    registryProvider: async () => [],
    profileRoot: path.join(root, 'profiles'),
    launch: async (executable, args, options) => {
      calls.push({ executable, args, options });
      return { pid: 1234 };
    }
  });
  const result = await service.launchDocument({ filePath: documentPath });
  assert.equal(result.launched, true);
  assert.equal(calls[0].executable, path.join(programDirectory, 'soffice.exe'));
  assert.equal(calls[0].options.shell, false);
  assert.match(calls[0].args[0], /^-env:UserInstallation=file:\/\/\//);
  assert.equal(calls[0].args.at(-1), documentPath);
});

test('GUI launch rejects non-document paths before spawning LibreOffice', async (t) => {
  const { root, programDirectory } = await fakeInstallation(t);
  const executablePath = path.join(root, 'not-a-document.exe');
  await fs.writeFile(executablePath, 'fixture');
  let launched = false;
  const service = new LibreOfficeService({
    platform: 'win32',
    env: { MATERIAL_OFFICE_SOFFICE: path.join(programDirectory, 'soffice.exe') },
    registryProvider: async () => [],
    profileRoot: path.join(root, 'profiles'),
    launch: async () => {
      launched = true;
      return { pid: 1234 };
    }
  });
  await assert.rejects(service.launchDocument({ filePath: executablePath }), /supported document extension/i);
  assert.equal(launched, false);
});

test('discovery exposes bundled Python only after a bounded pyuno import probe succeeds', async (t) => {
  const { root, programDirectory } = await fakeInstallation(t);
  const pythonExecutable = path.join(programDirectory, 'python.exe');
  await Promise.all([
    fs.writeFile(pythonExecutable, 'fixture'),
    fs.writeFile(path.join(programDirectory, 'uno.py'), 'fixture'),
    fs.writeFile(path.join(programDirectory, 'pyuno.pyd'), 'fixture'),
    fs.writeFile(path.join(programDirectory, 'fundamental.ini'), 'fixture')
  ]);
  const calls = [];
  const service = new LibreOfficeService({
    platform: 'win32',
    env: {
      MATERIAL_OFFICE_SOFFICE: path.join(programDirectory, 'soffice.exe'),
      PYTHONPATH: 'C:\\untrusted-python-path',
      PythonHome: 'C:\\untrusted-python-home',
      Uno_Path: 'C:\\untrusted-uno-path',
      ure_bootstrap: 'vnd.sun.star.pathname:C:\\untrusted.ini',
      URE_MORE_SERVICES: 'C:\\untrusted-services.rdb',
      ure_internal_java_dir: 'C:\\untrusted-java'
    },
    registryProvider: async () => [],
    profileRoot: path.join(root, 'profiles'),
    run: async (executable, args, options) => {
      calls.push({ executable, args, options });
      return {
        exitCode: 0,
        signal: null,
        timedOut: false,
        stdout: '',
        stderr: '',
        stdoutTruncated: false,
        stderrTruncated: false
      };
    }
  });

  const availability = await service.getAvailability();
  assert.equal(availability.unoAvailable, true);
  assert.equal(availability.installation.pythonExecutable, pythonExecutable);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, pythonExecutable);
  assert.deepEqual(calls[0].args, pyunoProbeArguments(programDirectory));
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.killTree, true);
  assert.equal(calls[0].options.timeoutMs, 5_000);
  assert.equal(calls[0].options.cwd, programDirectory);
  assert.equal(Object.keys(calls[0].options.env).some((key) => /^(?:PYTHON|UNO_|URE_)/i.test(key)), false);
});

test('discovery reports pyuno unavailable when bundled Python cannot import uno', async (t) => {
  const { root, programDirectory } = await fakeInstallation(t);
  await Promise.all([
    fs.writeFile(path.join(programDirectory, 'python.exe'), 'fixture'),
    fs.writeFile(path.join(programDirectory, 'uno.py'), 'fixture'),
    fs.writeFile(path.join(programDirectory, 'pyuno.pyd'), 'fixture'),
    fs.writeFile(path.join(programDirectory, 'fundamental.ini'), 'fixture')
  ]);
  const service = new LibreOfficeService({
    platform: 'win32',
    env: { MATERIAL_OFFICE_SOFFICE: path.join(programDirectory, 'soffice.exe') },
    registryProvider: async () => [],
    profileRoot: path.join(root, 'profiles'),
    run: async () => ({
      exitCode: 1,
      signal: null,
      timedOut: false,
      stdout: '',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false
    })
  });
  const availability = await service.getAvailability();
  assert.equal(availability.available, true);
  assert.equal(availability.unoAvailable, false);
  assert.equal(availability.installation.pythonExecutable, null);
  assert.equal(availability.errors.some((error) => error.code === 'PYUNO_UNAVAILABLE'), true);
});
