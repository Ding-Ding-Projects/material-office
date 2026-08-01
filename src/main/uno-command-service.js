import { randomBytes as cryptoRandomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError, ValidationError } from './errors.js';
import { buildProfileArgument } from './libreoffice-service.js';
import {
  pyunoBrokerArguments,
  sanitizedPythonEnvironment
} from './libreoffice-python.js';
import {
  isProcessAlive,
  runProcess,
  spawnDetached,
  terminateProcessTree
} from './process-runner.js';
import { isPlainObject, requirePlainObject, requireString } from './validation.js';

const MAX_CATALOG_BYTES = 4 * 1024 * 1024;
const MAX_COMMAND_LENGTH = 2_048;
const MAX_BROKER_OUTPUT_BYTES = 4_096;
const PIPE_NAME_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const COMMAND_ID_PATTERN = /^uno-[0-9]+-[A-Za-z0-9-]{1,40}$/;
const SAFE_UNO_COMMAND = /^\.uno:[^\u0000-\u001f\u007f]{1,2043}$/;
const SCRIPT_URI_PATTERN = /(?:vnd\.sun\.star\.script|(?:^|[?&=])(?:macro|script|javascript):)/i;

export const SCOPE_CONTEXTS = Object.freeze({
  basic: Object.freeze(['basic']),
  biblio: Object.freeze(['base']),
  calc: Object.freeze(['calc']),
  chart: Object.freeze(['chart']),
  dbu: Object.freeze(['base']),
  math: Object.freeze(['math']),
  report: Object.freeze(['base']),
  sd: Object.freeze(['impress', 'draw']),
  shared: Object.freeze(['writer', 'calc', 'impress', 'draw', 'base', 'math']),
  writer: Object.freeze(['writer'])
});

const SUPPORTED_EXECUTION_SCOPES = new Set([
  'basic', 'calc', 'chart', 'math', 'sd', 'shared', 'writer'
]);

const BROKER_ERROR_MESSAGES = Object.freeze({
  BROKER_INVALID_INPUT: 'The bundled UNO broker rejected its fixed input.',
  PYUNO_UNAVAILABLE: 'LibreOffice Python cannot import the UNO module.',
  UNO_CONNECTION_TIMEOUT: 'LibreOffice did not make its private UNO pipe available before the time limit.',
  UNO_SERVICE_UNAVAILABLE: 'LibreOffice did not expose the required UNO dispatch services.',
  UNO_CONTEXT_UNAVAILABLE: 'LibreOffice could not create a compatible document context for this command.',
  UNO_DISPATCH_FAILED: 'LibreOffice could not dispatch this cataloged command.'
});

async function isFile(fileSystem, candidate) {
  try {
    return (await fileSystem.stat(candidate)).isFile();
  } catch {
    return false;
  }
}

export function decodeAmpEntities(value) {
  if (typeof value !== 'string') throw new ValidationError('Catalog command must be text.');
  return value.replace(/&amp;/g, '&');
}

export function stableUnoCommandId(index, command) {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new ValidationError('Catalog command index is invalid.');
  }
  const decodedCommand = decodeAmpEntities(command);
  return `uno-${index}-${decodedCommand.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40)}`;
}

export function contextsForScope(scope) {
  const contexts = SCOPE_CONTEXTS[scope];
  if (!contexts) throw new ValidationError('Catalog command scope is unsupported.');
  return [...contexts];
}

export function validateCommandRequest(input) {
  const payload = requirePlainObject(input, 'UNO command request');
  const keys = Object.keys(payload);
  if (keys.length !== 1 || keys[0] !== 'commandId') {
    throw new ValidationError('UNO command requests accept only commandId.');
  }
  return {
    commandId: requireString(payload.commandId, 'command identifier', {
      maxLength: 96,
      pattern: COMMAND_ID_PATTERN
    })
  };
}

export function validateFeatureCatalog(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10_000) {
    throw new AppError('UNO_CATALOG_INVALID', 'The UNO command catalog is invalid.');
  }

  const entries = [];
  const byId = new Map();
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    if (!Array.isArray(row) || row.length !== 4 || row.some((field) => typeof field !== 'string')) {
      throw new AppError('UNO_CATALOG_INVALID', 'The UNO command catalog is invalid.');
    }
    const [rawName, scope, rawCategory, encodedCommand] = row;
    const name = rawName.trim();
    const category = rawCategory.trim();
    const command = decodeAmpEntities(encodedCommand);
    if (!name || name.length > 512 || !category || category.length > 128) {
      throw new AppError('UNO_CATALOG_INVALID', 'The UNO command catalog is invalid.');
    }
    if (!Object.hasOwn(SCOPE_CONTEXTS, scope)) {
      throw new AppError('UNO_CATALOG_INVALID', 'The UNO command catalog has an unsupported scope.');
    }
    const contexts = contextsForScope(scope);
    if (
      command.length > MAX_COMMAND_LENGTH ||
      !SAFE_UNO_COMMAND.test(command) ||
      SCRIPT_URI_PATTERN.test(command)
    ) {
      throw new AppError('UNO_CATALOG_INVALID', 'The UNO command catalog contains an unsafe command URI.');
    }
    const commandId = stableUnoCommandId(index, encodedCommand);
    if (byId.has(commandId)) {
      throw new AppError('UNO_CATALOG_INVALID', 'The UNO command catalog contains a duplicate identifier.');
    }
    const entry = Object.freeze({
      commandId,
      index,
      name,
      scope,
      category,
      command,
      contexts: Object.freeze(contexts)
    });
    entries.push(entry);
    byId.set(commandId, entry);
  }
  return Object.freeze({ entries: Object.freeze(entries), byId });
}

function parseBrokerPayload(result, allowedContexts) {
  if (result.stdoutTruncated || result.stderrTruncated) {
    throw new AppError('UNO_BROKER_OUTPUT_INVALID', 'The UNO broker returned an invalid status response.');
  }
  if (typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout, 'utf8') > MAX_BROKER_OUTPUT_BYTES) {
    throw new AppError('UNO_BROKER_OUTPUT_INVALID', 'The UNO broker returned an invalid status response.');
  }
  if (typeof result.stderr === 'string' && result.stderr.trim()) {
    throw new AppError('UNO_BROKER_OUTPUT_INVALID', 'The UNO broker returned an invalid status response.');
  }

  let payload;
  try {
    payload = JSON.parse(result.stdout.trim());
  } catch {
    throw new AppError('UNO_BROKER_OUTPUT_INVALID', 'The UNO broker returned an invalid status response.');
  }
  if (!isPlainObject(payload)) {
    throw new AppError('UNO_BROKER_OUTPUT_INVALID', 'The UNO broker returned an invalid status response.');
  }

  if (result.exitCode !== 0 || payload.ok !== true) {
    if (
      payload.ok !== false ||
      !isPlainObject(payload.error) ||
      Object.keys(payload).length !== 2 ||
      Object.keys(payload.error).length !== 1 ||
      !Object.hasOwn(payload.error, 'code')
    ) {
      throw new AppError('UNO_BROKER_OUTPUT_INVALID', 'The UNO broker returned an invalid status response.');
    }
    const code = typeof payload.error?.code === 'string' ? payload.error.code : 'UNO_BROKER_FAILED';
    const knownCode = Object.hasOwn(BROKER_ERROR_MESSAGES, code);
    const message = knownCode
      ? BROKER_ERROR_MESSAGES[code]
      : 'The UNO broker could not complete the command.';
    throw new AppError(knownCode ? code : 'UNO_BROKER_FAILED', message);
  }
  if (
    Object.keys(payload).length !== 3 ||
    !Object.hasOwn(payload, 'ok') ||
    !Object.hasOwn(payload, 'status') ||
    !Object.hasOwn(payload, 'context') ||
    payload.status !== 'dispatched' ||
    typeof payload.context !== 'string' ||
    !allowedContexts.includes(payload.context)
  ) {
    throw new AppError('UNO_BROKER_OUTPUT_INVALID', 'The UNO broker returned an invalid status response.');
  }
  return { context: payload.context };
}

function parseClosedProbe(result) {
  if (
    result.timedOut ||
    result.exitCode !== 0 ||
    result.stdoutTruncated ||
    result.stderrTruncated ||
    typeof result.stdout !== 'string' ||
    Buffer.byteLength(result.stdout, 'utf8') > MAX_BROKER_OUTPUT_BYTES ||
    (typeof result.stderr === 'string' && result.stderr.trim())
  ) {
    throw new AppError(
      'UNO_ACCEPTOR_CLOSE_FAILED',
      'The cataloged command was dispatched, but its private UNO connection could not be closed.'
    );
  }
  let payload;
  try {
    payload = JSON.parse(result.stdout.trim());
  } catch {
    throw new AppError(
      'UNO_ACCEPTOR_CLOSE_FAILED',
      'The cataloged command was dispatched, but its private UNO connection could not be closed.'
    );
  }
  if (
    !isPlainObject(payload) ||
    Object.keys(payload).length !== 2 ||
    payload.ok !== true ||
    payload.status !== 'closed'
  ) {
    throw new AppError(
      'UNO_ACCEPTOR_CLOSE_FAILED',
      'The cataloged command was dispatched, but its private UNO connection could not be closed.'
    );
  }
}

export class UnoCommandService {
  #catalog;
  #initializePromise;
  #prunePromise;
  #activeCommands = 0;

  constructor(options) {
    this.catalogPath = path.resolve(options.catalogPath);
    this.brokerPath = path.resolve(options.brokerPath);
    this.profileRoot = path.resolve(options.profileRoot);
    this.libreOffice = options.libreOffice;
    this.env = options.env ?? process.env;
    this.fs = options.fs ?? fs;
    this.run = options.run ?? runProcess;
    this.launch = options.launch ?? spawnDetached;
    this.terminate = options.terminate ?? terminateProcessTree;
    this.isAlive = options.isAlive ?? isProcessAlive;
    this.randomBytes = options.randomBytes ?? cryptoRandomBytes;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 45_000;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
    this.maximumConcurrentCommands = options.maximumConcurrentCommands ?? 2;
  }

  async initialize() {
    if (!this.#initializePromise) {
      this.#initializePromise = this.#loadCatalog();
    }
    await this.#initializePromise;
    if (!this.#prunePromise) this.#prunePromise = this.#pruneStaleProfiles();
    await this.#prunePromise;
    return {
      commandCount: this.#catalog.entries.length,
      brokerAvailable: await isFile(this.fs, this.brokerPath)
    };
  }

  async getCatalogStatus() {
    return this.initialize();
  }

  async runCommand(input) {
    const { commandId } = validateCommandRequest(input);
    await this.initialize();
    const entry = this.#catalog.byId.get(commandId);
    if (!entry) {
      throw new AppError('UNO_COMMAND_NOT_FOUND', 'The selected UNO command is not in the bundled catalog.');
    }
    if (!SUPPORTED_EXECUTION_SCOPES.has(entry.scope)) {
      throw new AppError(
        'UNO_CONTEXT_UNSUPPORTED',
        'This cataloged command needs a specialized LibreOffice context that is not safely automated yet.'
      );
    }
    if (this.#activeCommands >= this.maximumConcurrentCommands) {
      throw new AppError('UNO_COMMAND_BUSY', 'Too many UNO commands are already running.');
    }
    this.#activeCommands += 1;
    let profile;
    let launched;
    let succeeded = false;
    try {
      if (!await isFile(this.fs, this.brokerPath)) {
        throw new AppError('UNO_BROKER_MISSING', 'The bundled UNO command broker is unavailable.');
      }
      const discovery = await this.libreOffice.discover();
      const installation = discovery.installation;
      if (!installation?.guiExecutable) {
        throw new AppError('LIBREOFFICE_GUI_UNAVAILABLE', 'The LibreOffice graphical executable is not available.');
      }
      if (!installation.pythonExecutable) {
        throw new AppError('PYUNO_UNAVAILABLE', BROKER_ERROR_MESSAGES.PYUNO_UNAVAILABLE);
      }
      await this.fs.mkdir(this.profileRoot, { recursive: true });
      profile = await this.fs.mkdtemp(path.join(this.profileRoot, 'uno-'));
      const pidFile = path.join(profile, 'soffice.pid');
      const entropy = this.randomBytes(24);
      if (!Buffer.isBuffer(entropy) || entropy.length < 16) {
        throw new AppError('UNO_PIPE_CREATION_FAILED', 'A private UNO pipe could not be created.');
      }
      const pipeName = `material-office-${entropy.toString('hex')}`;
      if (!PIPE_NAME_PATTERN.test(pipeName)) {
        throw new AppError('UNO_PIPE_CREATION_FAILED', 'A private UNO pipe could not be created.');
      }
      const acceptDescriptor = `pipe,name=${pipeName};urp;StarOffice.ServiceManager`;
      const officeArguments = [
        buildProfileArgument(profile),
        `--accept=${acceptDescriptor}`,
        `--pidfile=${pidFile}`,
        '--nologo',
        '--nodefault',
        '--nofirststartwizard',
        '--norestore'
      ];
      launched = await this.launch(installation.guiExecutable, officeArguments, {
        shell: false,
        windowsHide: false,
        onClose: () => {
          void this.#removeProfileIfStopped(profile, pidFile);
        }
      });
      if (!Number.isSafeInteger(launched?.pid) || launched.pid <= 0) {
        throw new AppError('PROCESS_START_FAILED', 'LibreOffice did not report a valid process identifier.');
      }
      await this.#writeOwnerMetadata(profile, launched.pid);

      const brokerArguments = pyunoBrokerArguments(
        installation.programDirectory,
        this.brokerPath,
        [
        '--pipe-name',
        pipeName,
        '--command',
        entry.command,
        '--scope',
        entry.scope,
        '--contexts',
        entry.contexts.join(','),
        '--connect-timeout-ms',
        String(this.connectTimeoutMs)
        ]
      );
      const result = await this.run(installation.pythonExecutable, brokerArguments, {
        shell: false,
        killTree: true,
        cwd: installation.programDirectory,
        env: sanitizedPythonEnvironment(this.env),
        timeoutMs: this.commandTimeoutMs,
        maxOutputBytes: MAX_BROKER_OUTPUT_BYTES,
        windowsHide: true
      });
      if (result.timedOut) {
        throw new AppError('UNO_COMMAND_TIMEOUT', 'LibreOffice did not finish the cataloged command before the time limit.');
      }
      const broker = parseBrokerPayload(result, entry.contexts);
      await this.#closeAndVerifyAcceptor({ installation, profile, pipeName, acceptDescriptor });
      succeeded = true;
      return {
        dispatched: true,
        commandId: entry.commandId,
        name: entry.name,
        scope: entry.scope,
        context: broker.context
      };
    } finally {
      this.#activeCommands -= 1;
      if (!succeeded) {
        const stopped = await this.#terminateOffice(profile, launched?.pid);
        if (!stopped) {
          throw new AppError(
            'UNO_PROCESS_CLEANUP_FAILED',
            'The UNO operation failed and its dedicated LibreOffice process could not be fully stopped.'
          );
        }
        if (profile) await this.#removeProfile(profile);
      }
    }
  }

  async #loadCatalog() {
    let raw;
    try {
      const stat = await this.fs.stat(this.catalogPath);
      if (!stat.isFile() || stat.size > MAX_CATALOG_BYTES) {
        throw new AppError('UNO_CATALOG_INVALID', 'The UNO command catalog is invalid.');
      }
      raw = await this.fs.readFile(this.catalogPath, 'utf8');
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('UNO_CATALOG_UNAVAILABLE', 'The UNO command catalog could not be loaded.', { cause: error });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new AppError('UNO_CATALOG_INVALID', 'The UNO command catalog is invalid.', { cause: error });
    }
    this.#catalog = validateFeatureCatalog(parsed);
  }

  async #closeAndVerifyAcceptor({ installation, profile, pipeName, acceptDescriptor }) {
    const closeResult = await this.run(
      installation.headlessExecutable ?? installation.guiExecutable,
      [buildProfileArgument(profile), `--unaccept=${acceptDescriptor}`],
      {
        shell: false,
        killTree: true,
        timeoutMs: 5_000,
        maxOutputBytes: MAX_BROKER_OUTPUT_BYTES,
        windowsHide: true
      }
    );
    if (
      closeResult.timedOut ||
      closeResult.exitCode !== 0 ||
      closeResult.stdoutTruncated ||
      closeResult.stderrTruncated
    ) {
      throw new AppError(
        'UNO_ACCEPTOR_CLOSE_FAILED',
        'The cataloged command was dispatched, but its private UNO connection could not be closed.'
      );
    }

    const probeResult = await this.run(
      installation.pythonExecutable,
      pyunoBrokerArguments(
        installation.programDirectory,
        this.brokerPath,
        [
        '--pipe-name',
        pipeName,
        '--verify-closed',
        '--connect-timeout-ms',
        '250'
        ]
      ),
      {
        shell: false,
        killTree: true,
        cwd: installation.programDirectory,
        env: sanitizedPythonEnvironment(this.env),
        timeoutMs: 2_000,
        maxOutputBytes: MAX_BROKER_OUTPUT_BYTES,
        windowsHide: true
      }
    );
    parseClosedProbe(probeResult);
  }

  async #removeProfile(profile) {
    await this.fs.rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }

  async #readEnginePid(profile) {
    const pidFile = path.join(profile, 'soffice.pid');
    try {
      const stat = await this.fs.stat(pidFile);
      if (!stat.isFile() || stat.size < 1 || stat.size > 32) return null;
      const raw = (await this.fs.readFile(pidFile, 'utf8')).trim();
      if (!/^[1-9][0-9]{0,9}$/.test(raw)) return null;
      const pid = Number(raw);
      return Number.isSafeInteger(pid) && pid <= 0xFFFF_FFFF ? pid : null;
    } catch {
      return null;
    }
  }

  async #writeOwnerMetadata(profile, wrapperPid) {
    const ownerPath = path.join(profile, 'owner.json');
    const value = `${JSON.stringify({
      schemaVersion: 1,
      wrapperPid,
      createdAt: new Date().toISOString()
    })}\n`;
    try {
      await this.fs.writeFile(ownerPath, value, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    } catch (error) {
      throw new AppError(
        'UNO_OWNER_METADATA_FAILED',
        'The dedicated LibreOffice process could not be tracked safely.',
        { cause: error }
      );
    }
  }

  async #readOwnerMetadata(profile) {
    const ownerPath = path.join(profile, 'owner.json');
    try {
      const stat = await this.fs.stat(ownerPath);
      if (!stat.isFile() || stat.size < 2 || stat.size > 512) return null;
      const value = JSON.parse(await this.fs.readFile(ownerPath, 'utf8'));
      if (
        !isPlainObject(value) ||
        value.schemaVersion !== 1 ||
        !Number.isSafeInteger(value.wrapperPid) ||
        value.wrapperPid <= 0 ||
        typeof value.createdAt !== 'string' ||
        Number.isNaN(Date.parse(value.createdAt))
      ) {
        return null;
      }
      return value;
    } catch {
      return null;
    }
  }

  async #terminateOffice(profile, wrapperPid) {
    const enginePid = profile ? await this.#readEnginePid(profile) : null;
    const pids = [...new Set([enginePid, wrapperPid].filter(
      (pid) => Number.isSafeInteger(pid) && pid > 0
    ))];
    for (const pid of pids) {
      await this.terminate(pid, { timeoutMs: 5_000 }).catch(() => false);
    }
    return pids.every((pid) => !this.isAlive(pid));
  }

  async #removeProfileIfStopped(profile, pidFile) {
    try {
      const stat = await this.fs.stat(pidFile);
      if (!stat.isFile() || stat.size < 1 || stat.size > 32) return;
      const enginePid = await this.#readEnginePid(profile);
      if (!enginePid || this.isAlive(enginePid)) return;
      await this.#removeProfile(profile);
    } catch {
      // Missing or unreadable pidfiles are kept for bounded startup pruning.
    }
  }

  async #pruneStaleProfiles() {
    await this.fs.mkdir(this.profileRoot, { recursive: true });
    let entries;
    try {
      entries = await this.fs.readdir(this.profileRoot, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.slice(0, 1_000)) {
      if (!entry.isDirectory() || !/^uno-[A-Za-z0-9_-]+$/.test(entry.name)) continue;
      const candidate = path.resolve(this.profileRoot, entry.name);
      if (path.dirname(candidate).toLowerCase() !== this.profileRoot.toLowerCase()) continue;
      const owner = await this.#readOwnerMetadata(candidate);
      const enginePid = await this.#readEnginePid(candidate);
      if (!owner || !enginePid) continue;
      if (this.isAlive(owner.wrapperPid) || this.isAlive(enginePid)) continue;
      await this.#removeProfile(candidate);
    }
  }
}

export { parseBrokerPayload, parseClosedProbe };
