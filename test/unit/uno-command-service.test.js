import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  contextsForScope,
  decodeAmpEntities,
  parseBrokerPayload,
  parseClosedProbe,
  stableUnoCommandId,
  UnoCommandService,
  validateCommandRequest,
  validateFeatureCatalog
} from '../../src/main/uno-command-service.js';

async function temporaryFixture(t, rows) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-uno-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const catalogPath = path.join(directory, 'features.json');
  const brokerPath = path.join(directory, 'uno-command.py');
  await Promise.all([
    fs.writeFile(catalogPath, JSON.stringify(rows)),
    fs.writeFile(brokerPath, '# broker fixture')
  ]);
  return {
    directory,
    catalogPath,
    brokerPath,
    profileRoot: path.join(directory, 'profiles')
  };
}

function fakeInstallation() {
  return {
    source: 'fixture',
    programDirectory: 'C:\\LibreOffice\\program',
    guiExecutable: 'C:\\LibreOffice\\program\\soffice.exe',
    headlessExecutable: 'C:\\LibreOffice\\program\\soffice.com',
    pythonExecutable: 'C:\\LibreOffice\\program\\python.exe'
  };
}

function successfulResult(context = 'calc') {
  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    stdout: JSON.stringify({ ok: true, status: 'dispatched', context }),
    stderr: '',
    stdoutTruncated: false,
    stderrTruncated: false
  };
}

function plainProcessResult(overrides = {}) {
  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    stdout: '',
    stderr: '',
    stdoutTruncated: false,
    stderrTruncated: false,
    ...overrides
  };
}

function commandRunResult(args, context) {
  if (args.some((argument) => argument.startsWith('--unaccept='))) {
    return plainProcessResult();
  }
  if (args.includes('--verify-closed')) {
    return plainProcessResult({ stdout: JSON.stringify({ ok: true, status: 'closed' }) });
  }
  return successfulResult(context);
}

test('entity decoding and stable IDs exactly match the renderer formula', () => {
  const encoded = '.uno:StyleApply?Style:string=Accent 1&amp;FamilyName:string=CellStyles';
  const decoded = '.uno:StyleApply?Style:string=Accent 1&FamilyName:string=CellStyles';
  assert.equal(decodeAmpEntities(encoded), decoded);
  assert.equal(
    stableUnoCommandId(27, encoded),
    'uno-27--uno-StyleApply-Style-string-Accent-1-Fa'
  );
});

test('the real feature catalog validates all 2,433 commands without ID collisions', async () => {
  const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
  const catalogPath = path.join(repositoryRoot, 'src', 'renderer', 'assets', 'data', 'features.json');
  const brokerPath = path.join(repositoryRoot, 'src', 'main', 'uno-command.py');
  const service = new UnoCommandService({
    catalogPath,
    brokerPath,
    profileRoot: path.join(os.tmpdir(), 'material-office-unused-profiles'),
    libreOffice: { discover: async () => ({ installation: null, errors: [] }) }
  });
  assert.deepEqual(await service.initialize(), { commandCount: 2_433, brokerAvailable: true });
});

test('catalog validation accepts only fixed UNO URIs and supported scopes', () => {
  const catalog = validateFeatureCatalog([
    ['Bold', 'writer', 'Format', '.uno:Bold'],
    ['Accent', 'calc', 'Format', '.uno:StyleApply?Style:string=Accent&amp;FamilyName:string=CellStyles']
  ]);
  assert.equal(catalog.entries[1].command, '.uno:StyleApply?Style:string=Accent&FamilyName:string=CellStyles');
  assert.throws(
    () => validateFeatureCatalog([['Unsafe', 'writer', 'Command', 'vnd.sun.star.script:Library.Main']]),
    /unsafe command URI/i
  );
  assert.throws(
    () => validateFeatureCatalog([['Unknown', 'unknown', 'Command', '.uno:Bold']]),
    /unsupported scope/i
  );
});

test('command requests accept exactly commandId and reject raw commands, paths, and extra arguments', () => {
  assert.deepEqual(validateCommandRequest({ commandId: 'uno-0--uno-Bold' }), {
    commandId: 'uno-0--uno-Bold'
  });
  assert.throws(() => validateCommandRequest({ command: '.uno:Bold' }), /only commandId/i);
  assert.throws(
    () => validateCommandRequest({ commandId: 'uno-0--uno-Bold', args: [] }),
    /only commandId/i
  );
  assert.throws(
    () => validateCommandRequest({ commandId: 'uno-0--uno-Bold', path: 'C:\\document.odt' }),
    /only commandId/i
  );
});

test('catalog scopes map to fixed document contexts, including real Basic and Chart factories', () => {
  assert.deepEqual(contextsForScope('basic'), ['basic']);
  assert.deepEqual(contextsForScope('writer'), ['writer']);
  assert.deepEqual(contextsForScope('calc'), ['calc']);
  assert.deepEqual(contextsForScope('chart'), ['chart']);
  assert.deepEqual(contextsForScope('sd'), ['impress', 'draw']);
  assert.deepEqual(contextsForScope('dbu'), ['base']);
  assert.deepEqual(contextsForScope('report'), ['base']);
  assert.deepEqual(contextsForScope('biblio'), ['base']);
  assert.deepEqual(contextsForScope('math'), ['math']);
  assert.deepEqual(contextsForScope('shared'), ['writer', 'calc', 'impress', 'draw', 'base', 'math']);
});

test('runCommand starts visible soffice and bundled Python with fixed named-pipe arguments', async (t) => {
  const command = '.uno:StyleApply?Style:string=Accent 1&amp;FamilyName:string=CellStyles';
  const fixture = await temporaryFixture(t, [['Accent 1', 'calc', 'Format', command]]);
  const launches = [];
  const runs = [];
  const service = new UnoCommandService({
    ...fixture,
    libreOffice: { discover: async () => ({ installation: fakeInstallation(), errors: [] }) },
    randomBytes: () => Buffer.alloc(24, 0xab),
    launch: async (executable, args, options) => {
      launches.push({ executable, args, options });
      return { pid: 4321 };
    },
    run: async (executable, args, options) => {
      runs.push({ executable, args, options });
      return commandRunResult(args, 'calc');
    }
  });

  const commandId = stableUnoCommandId(0, command);
  const result = await service.runCommand({ commandId });
  assert.deepEqual(result, {
    dispatched: true,
    commandId,
    name: 'Accent 1',
    scope: 'calc',
    context: 'calc'
  });
  assert.equal(launches.length, 1);
  assert.equal(launches[0].executable, fakeInstallation().guiExecutable);
  assert.equal(launches[0].options.shell, false);
  assert.equal(launches[0].options.windowsHide, false);
  assert.match(launches[0].args[0], /^-env:UserInstallation=file:\/\/\//);
  assert.equal(
    launches[0].args[1],
    `--accept=pipe,name=material-office-${'ab'.repeat(24)};urp;StarOffice.ServiceManager`
  );
  assert.equal(launches[0].args.includes('--nodefault'), true);
  assert.equal(launches[0].args.includes('--calc'), false);
  assert.equal(launches[0].args.some((argument) => argument.includes('socket,')), false);
  assert.equal(runs.length, 3);
  assert.equal(runs[0].executable, fakeInstallation().pythonExecutable);
  assert.equal(runs[0].args[0], '-I');
  assert.equal(runs[0].args[1], '-c');
  assert.equal(runs[0].args[3], fakeInstallation().programDirectory);
  assert.equal(runs[0].args[4], fixture.brokerPath);
  assert.equal(runs[0].args[runs[0].args.indexOf('--command') + 1], decodeAmpEntities(command));
  assert.equal(runs[0].args[runs[0].args.indexOf('--scope') + 1], 'calc');
  assert.equal(runs[0].args[runs[0].args.indexOf('--contexts') + 1], 'calc');
  assert.equal(runs[0].options.shell, false);
  assert.equal(runs[0].options.killTree, true);
  assert.equal(runs[0].options.maxOutputBytes, 4_096);
  assert.equal(runs[0].options.cwd, fakeInstallation().programDirectory);
  assert.equal(Object.keys(runs[0].options.env).some((key) => /^(?:PYTHON|UNO_|URE_)/i.test(key)), false);
  assert.equal(runs[1].executable, fakeInstallation().headlessExecutable);
  assert.equal(
    runs[1].args.some((argument) => argument.startsWith('--unaccept=pipe,name=material-office-')),
    true
  );
  assert.equal(runs[2].executable, fakeInstallation().pythonExecutable);
  assert.equal(runs[2].args.includes('--verify-closed'), true);
  assert.equal(runs[2].args[0], '-I');
});

test('timeouts terminate the launched office process and remove its temporary profile', async (t) => {
  const fixture = await temporaryFixture(t, [['Bold', 'writer', 'Format', '.uno:Bold']]);
  const terminated = [];
  const service = new UnoCommandService({
    ...fixture,
    libreOffice: { discover: async () => ({ installation: fakeInstallation(), errors: [] }) },
    randomBytes: () => Buffer.alloc(24, 0xcd),
    launch: async (_executable, args) => {
      const pidArgument = args.find((argument) => argument.startsWith('--pidfile='));
      await fs.writeFile(pidArgument.slice('--pidfile='.length), '5432\n');
      return { pid: 9876 };
    },
    terminate: async (pid) => {
      terminated.push(pid);
      return true;
    },
    isAlive: () => false,
    run: async () => ({
      ...successfulResult('writer'),
      timedOut: true,
      stdout: ''
    })
  });

  await assert.rejects(
    service.runCommand({ commandId: stableUnoCommandId(0, '.uno:Bold') }),
    (error) => error.code === 'UNO_COMMAND_TIMEOUT'
  );
  assert.deepEqual(terminated, [5432, 9876]);
  assert.deepEqual(await fs.readdir(fixture.profileRoot), []);
});

test('the concurrency slot is reserved before asynchronous discovery can race', async (t) => {
  const fixture = await temporaryFixture(t, [['Bold', 'writer', 'Format', '.uno:Bold']]);
  let releaseDiscovery;
  let discoveryStarted;
  const started = new Promise((resolve) => {
    discoveryStarted = resolve;
  });
  const barrier = new Promise((resolve) => {
    releaseDiscovery = resolve;
  });
  const service = new UnoCommandService({
    ...fixture,
    maximumConcurrentCommands: 1,
    libreOffice: {
      discover: async () => {
        discoveryStarted();
        await barrier;
        return { installation: fakeInstallation(), errors: [] };
      }
    },
    randomBytes: () => Buffer.alloc(24, 0xef),
    launch: async () => ({ pid: 1234 }),
    run: async (_executable, args) => commandRunResult(args, 'writer')
  });
  const request = { commandId: stableUnoCommandId(0, '.uno:Bold') };
  const first = service.runCommand(request);
  await started;
  await assert.rejects(service.runCommand(request), (error) => error.code === 'UNO_COMMAND_BUSY');
  releaseDiscovery();
  assert.equal((await first).dispatched, true);
});

test('broker output is bounded, structured, and restricted to expected contexts and error codes', () => {
  assert.deepEqual(parseBrokerPayload(successfulResult('writer'), ['writer']), { context: 'writer' });
  assert.throws(
    () => parseBrokerPayload({ ...successfulResult('writer'), stdout: 'not-json' }, ['writer']),
    (error) => error.code === 'UNO_BROKER_OUTPUT_INVALID'
  );
  assert.throws(
    () => parseBrokerPayload({ ...successfulResult('writer'), stdoutTruncated: true }, ['writer']),
    (error) => error.code === 'UNO_BROKER_OUTPUT_INVALID'
  );
  assert.throws(
    () => parseBrokerPayload(successfulResult('calc'), ['writer']),
    (error) => error.code === 'UNO_BROKER_OUTPUT_INVALID'
  );
  assert.throws(
    () => parseBrokerPayload({
      ...successfulResult('writer'),
      stdout: JSON.stringify({ ok: true, status: 'dispatched', context: 'writer', extra: true })
    }, ['writer']),
    (error) => error.code === 'UNO_BROKER_OUTPUT_INVALID'
  );
  assert.throws(
    () => parseBrokerPayload({
      ...successfulResult('writer'),
      exitCode: 6,
      stdout: JSON.stringify({ ok: false, error: { code: 'UNO_CONTEXT_UNAVAILABLE' } })
    }, ['writer']),
    (error) => error.code === 'UNO_CONTEXT_UNAVAILABLE'
  );
  assert.throws(
    () => parseBrokerPayload({
      ...successfulResult('writer'),
      exitCode: 9,
      stdout: JSON.stringify({ ok: false, error: { code: '__proto__' } })
    }, ['writer']),
    (error) => error.code === 'UNO_BROKER_FAILED'
  );
});

test('acceptor verification accepts only an exact closed status', () => {
  assert.doesNotThrow(() => parseClosedProbe(plainProcessResult({
    stdout: JSON.stringify({ ok: true, status: 'closed' })
  })));
  assert.throws(
    () => parseClosedProbe(plainProcessResult({
      stdout: JSON.stringify({ ok: false, error: { code: 'UNO_ACCEPTOR_OPEN' } }),
      exitCode: 8
    })),
    (error) => error.code === 'UNO_ACCEPTOR_CLOSE_FAILED'
  );
  assert.throws(
    () => parseClosedProbe(plainProcessResult({
      stdout: JSON.stringify({ ok: true, status: 'closed', extra: true })
    })),
    (error) => error.code === 'UNO_ACCEPTOR_CLOSE_FAILED'
  );
});

test('failure to close the UNO acceptor terminates the dedicated LibreOffice process', async (t) => {
  const fixture = await temporaryFixture(t, [['Bold', 'writer', 'Format', '.uno:Bold']]);
  const terminated = [];
  let runNumber = 0;
  const service = new UnoCommandService({
    ...fixture,
    libreOffice: { discover: async () => ({ installation: fakeInstallation(), errors: [] }) },
    randomBytes: () => Buffer.alloc(24, 0xa1),
    launch: async () => ({ pid: 2468 }),
    isAlive: () => false,
    terminate: async (pid) => {
      terminated.push(pid);
      return true;
    },
    run: async () => {
      runNumber += 1;
      return runNumber === 1
        ? successfulResult('writer')
        : plainProcessResult({ exitCode: 1 });
    }
  });
  await assert.rejects(
    service.runCommand({ commandId: stableUnoCommandId(0, '.uno:Bold') }),
    (error) => error.code === 'UNO_ACCEPTOR_CLOSE_FAILED'
  );
  assert.deepEqual(terminated, [2468]);
  assert.deepEqual(await fs.readdir(fixture.profileRoot), []);
});

test('startup pruning retains unowned profiles and removes only proven-dead owned profiles', async (t) => {
  const fixture = await temporaryFixture(t, [['Bold', 'writer', 'Format', '.uno:Bold']]);
  const unknown = path.join(fixture.profileRoot, 'uno-missing-metadata');
  const dead = path.join(fixture.profileRoot, 'uno-proven-dead');
  await Promise.all([fs.mkdir(unknown, { recursive: true }), fs.mkdir(dead, { recursive: true })]);
  await Promise.all([
    fs.writeFile(path.join(dead, 'owner.json'), JSON.stringify({
      schemaVersion: 1,
      wrapperPid: 1111,
      createdAt: '2026-07-31T20:00:00.000Z'
    })),
    fs.writeFile(path.join(dead, 'soffice.pid'), '2222\n')
  ]);
  const service = new UnoCommandService({
    ...fixture,
    isAlive: () => false,
    libreOffice: { discover: async () => ({ installation: fakeInstallation(), errors: [] }) }
  });
  await service.initialize();
  assert.equal((await fs.stat(unknown)).isDirectory(), true);
  await assert.rejects(fs.stat(dead), { code: 'ENOENT' });
});

test('packaging keeps the Python broker outside asar', async () => {
  const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
  const manifest = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.build.asarUnpack, ['src/main/uno-command.py']);
});
