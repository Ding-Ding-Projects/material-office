import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AppError, ValidationError } from './errors.js';
import {
  pyunoProbeArguments,
  sanitizedPythonEnvironment
} from './libreoffice-python.js';
import { runProcess, spawnDetached } from './process-runner.js';
import {
  requireAbsolutePath,
  requireBoolean,
  requireInteger,
  requirePlainObject,
  requireString
} from './validation.js';

export const CONVERSION_TARGETS = Object.freeze({
  pdf: Object.freeze({ argument: 'pdf', extension: '.pdf' }),
  odt: Object.freeze({ argument: 'odt', extension: '.odt' }),
  ods: Object.freeze({ argument: 'ods', extension: '.ods' }),
  odp: Object.freeze({ argument: 'odp', extension: '.odp' }),
  docx: Object.freeze({ argument: 'docx', extension: '.docx' }),
  xlsx: Object.freeze({ argument: 'xlsx', extension: '.xlsx' }),
  pptx: Object.freeze({ argument: 'pptx', extension: '.pptx' }),
  csv: Object.freeze({ argument: 'csv', extension: '.csv' }),
  txt: Object.freeze({ argument: 'txt', extension: '.txt' }),
  png: Object.freeze({ argument: 'png', extension: '.png' })
});

export const NEW_DOCUMENT_ARGUMENTS = Object.freeze({
  writer: '--writer',
  calc: '--calc',
  impress: '--impress',
  draw: '--draw',
  math: '--math',
  base: '--base'
});

export const LIBREOFFICE_DOCUMENT_EXTENSIONS = Object.freeze([
  '.odt', '.ott', '.ods', '.ots', '.odp', '.otp', '.odg', '.otg', '.odf', '.odb', '.odm',
  '.fodt', '.fods', '.fodp', '.fodg', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.rtf', '.txt', '.csv', '.html', '.htm', '.pdf', '.svg'
]);

const LIBREOFFICE_DOCUMENT_EXTENSION_SET = new Set(LIBREOFFICE_DOCUMENT_EXTENSIONS);
export const DEFAULT_MAX_CONVERSION_SOURCE_BYTES = 512 * 1024 * 1024;
export const DEFAULT_MAX_CONVERSION_OUTPUT_BYTES = 512 * 1024 * 1024;

const REGISTRY_KEYS = Object.freeze([
  'HKCU\\SOFTWARE\\LibreOffice\\UNO\\InstallPath',
  'HKLM\\SOFTWARE\\LibreOffice\\UNO\\InstallPath',
  'HKLM\\SOFTWARE\\WOW6432Node\\LibreOffice\\UNO\\InstallPath',
  'HKCU\\SOFTWARE\\LibreOfficeDev\\UNO\\InstallPath',
  'HKLM\\SOFTWARE\\LibreOfficeDev\\UNO\\InstallPath',
  'HKLM\\SOFTWARE\\WOW6432Node\\LibreOfficeDev\\UNO\\InstallPath'
]);

function errorSummary(code, message) {
  return { code, message };
}

function fileVersion(stat) {
  const fields = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'];
  if (fields.some((field) => !['bigint', 'number'].includes(typeof stat[field]))) return null;
  return fields.map((field) => String(stat[field])).join(':');
}

async function isFile(fileSystem, candidate) {
  try {
    return (await fileSystem.stat(candidate)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(fileSystem, candidate) {
  try {
    return (await fileSystem.stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

function expandWindowsEnvironment(value, environment) {
  return value.replace(/%([^%]+)%/g, (match, name) => {
    const found = Object.entries(environment).find(([key]) => key.toLowerCase() === name.toLowerCase());
    return found ? found[1] : match;
  });
}

function parseRegistryPaths(output, environment) {
  const paths = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:\(Default\)|Path|InstallPath)?\s*REG_(?:SZ|EXPAND_SZ)\s+(.+?)\s*$/i);
    if (match) paths.push(expandWindowsEnvironment(match[1].trim(), environment));
  }
  return paths;
}

export function normalizeConversionTarget(value) {
  const target = requireString(value, 'target format', {
    maxLength: 16,
    pattern: /^[A-Za-z0-9]+$/
  }).toLowerCase();
  const definition = CONVERSION_TARGETS[target];
  if (!definition) {
    throw new ValidationError('The requested conversion format is not supported.');
  }
  return { name: target, ...definition };
}

export function buildProfileArgument(profilePath) {
  const absoluteProfile = requireAbsolutePath(profilePath, 'profile path');
  return `-env:UserInstallation=${pathToFileURL(absoluteProfile).href}`;
}

export function requireLibreOfficeDocumentPath(value, label = 'document path') {
  const filePath = requireAbsolutePath(value, label);
  if (!LIBREOFFICE_DOCUMENT_EXTENSION_SET.has(path.extname(filePath).toLowerCase())) {
    throw new ValidationError(`${label} does not use a supported document extension.`);
  }
  return filePath;
}

export class LibreOfficeService {
  #cachedInstallation;

  constructor(options = {}) {
    this.fs = options.fs ?? fs;
    this.env = options.env ?? process.env;
    this.platform = options.platform ?? process.platform;
    this.run = options.run ?? runProcess;
    this.launch = options.launch ?? spawnDetached;
    this.registryProvider = options.registryProvider ?? (() => this.#readRegistryPaths());
    this.profileRoot = path.resolve(options.profileRoot ?? path.join(this.env.TEMP ?? '.', 'material-office-profiles'));
    this.maximumConversionSourceBytes = requireInteger(
      options.maximumConversionSourceBytes ?? DEFAULT_MAX_CONVERSION_SOURCE_BYTES,
      'maximum conversion source bytes',
      { min: 1, max: Number.MAX_SAFE_INTEGER }
    );
    this.maximumConversionOutputBytes = requireInteger(
      options.maximumConversionOutputBytes ?? DEFAULT_MAX_CONVERSION_OUTPUT_BYTES,
      'maximum conversion output bytes',
      { min: 1, max: Number.MAX_SAFE_INTEGER }
    );
    this.conversionMonitorIntervalMs = requireInteger(
      options.conversionMonitorIntervalMs ?? 100,
      'conversion monitor interval',
      { min: 5, max: 1_000 }
    );
    this.explicitOverride = options.explicitOverride
      ?? this.env.MATERIAL_OFFICE_SOFFICE
      ?? this.env.LIBREOFFICE_PATH
      ?? this.env.SOFFICE_PATH
      ?? null;
  }

  async getAvailability(options = {}) {
    const refresh = options.refresh === true;
    const discovery = await this.discover({ refresh });
    if (!discovery.installation) {
      return {
        available: false,
        guiAvailable: false,
        conversionAvailable: false,
        unoAvailable: false,
        installation: null,
        errors: discovery.errors,
        supportedConversionTargets: Object.keys(CONVERSION_TARGETS)
      };
    }
    return {
      available: true,
      guiAvailable: Boolean(discovery.installation.guiExecutable),
      conversionAvailable: Boolean(discovery.installation.headlessExecutable),
      unoAvailable: Boolean(discovery.installation.pythonExecutable),
      installation: structuredClone(discovery.installation),
      errors: discovery.installation.pythonExecutable
        ? discovery.errors
        : [
            ...discovery.errors,
            errorSummary(
              'PYUNO_UNAVAILABLE',
              'LibreOffice bundled Python with the UNO module was not found.'
            )
          ],
      supportedConversionTargets: Object.keys(CONVERSION_TARGETS)
    };
  }

  async discover(options = {}) {
    if (this.#cachedInstallation && options.refresh !== true) {
      return { installation: structuredClone(this.#cachedInstallation), errors: [] };
    }
    if (this.platform !== 'win32') {
      return {
        installation: null,
        errors: [errorSummary('WINDOWS_REQUIRED', 'LibreOffice integration is available only on Windows.')]
      };
    }

    const errors = [];
    const override = this.explicitOverride;
    if (override) {
      const candidate = await this.#resolveInstallation(override, 'environment');
      if (candidate) {
        this.#cachedInstallation = candidate;
        return { installation: structuredClone(candidate), errors };
      }
      errors.push(errorSummary('INVALID_OVERRIDE', 'The configured LibreOffice executable was not found.'));
    }

    let registryPaths = [];
    try {
      registryPaths = await this.registryProvider();
    } catch {
      errors.push(errorSummary('REGISTRY_UNAVAILABLE', 'LibreOffice registry information could not be read.'));
    }
    for (const candidatePath of registryPaths) {
      const candidate = await this.#resolveInstallation(candidatePath, 'registry');
      if (candidate) {
        this.#cachedInstallation = candidate;
        return { installation: structuredClone(candidate), errors };
      }
    }

    for (const candidatePath of await this.#standardCandidates()) {
      const candidate = await this.#resolveInstallation(candidatePath, 'standard-path');
      if (candidate) {
        this.#cachedInstallation = candidate;
        return { installation: structuredClone(candidate), errors };
      }
    }

    errors.push(errorSummary('LIBREOFFICE_NOT_FOUND', 'LibreOffice was not found in the configured or standard Windows locations.'));
    return { installation: null, errors };
  }

  async verifyOverride(candidatePath) {
    const executable = requireAbsolutePath(candidatePath, 'LibreOffice executable');
    if (!/^(?:soffice\.exe|soffice\.com)$/i.test(path.basename(executable))) {
      throw new ValidationError('Select soffice.exe or soffice.com from a LibreOffice installation.');
    }
    const installation = await this.#resolveInstallation(executable, 'selected');
    if (!installation?.guiExecutable || !installation.headlessExecutable) {
      throw new AppError(
        'LIBREOFFICE_OVERRIDE_INVALID',
        'The selected file is not a complete LibreOffice installation.'
      );
    }
    return structuredClone(installation);
  }

  async setExplicitOverride(candidatePath, options = {}) {
    const installation = await this.verifyOverride(candidatePath);
    if (options.beforeApply !== undefined) {
      if (typeof options.beforeApply !== 'function') {
        throw new ValidationError('LibreOffice override transaction is invalid.');
      }
      await options.beforeApply(structuredClone(installation));
    }
    this.explicitOverride = installation.guiExecutable;
    this.#cachedInstallation = installation;
    return structuredClone(installation);
  }

  async launchDocument(input) {
    const payload = typeof input === 'string' ? { filePath: input } : requirePlainObject(input, 'launch request');
    const filePath = requireLibreOfficeDocumentPath(payload.filePath, 'document path');
    if (!await isFile(this.fs, filePath)) {
      throw new AppError('DOCUMENT_NOT_FOUND', 'The selected document does not exist.');
    }
    const installation = await this.#requireInstallation('gui');
    const profile = await this.#createProfile('gui-');
    const args = [buildProfileArgument(profile), '--nologo', '--nodefault', '--nofirststartwizard', filePath];
    try {
      const launched = await this.launch(installation.guiExecutable, args, {
        shell: false,
        windowsHide: false,
        onClose: () => this.#removeProfile(profile)
      });
      return {
        launched: true,
        pid: launched.pid ?? null,
        executable: installation.guiExecutable,
        filePath
      };
    } catch (error) {
      await this.#removeProfile(profile);
      throw error;
    }
  }

  async launchNew(input) {
    const payload = typeof input === 'string' ? { kind: input } : requirePlainObject(input, 'new document request');
    const kind = requireString(payload.kind, 'document kind', {
      maxLength: 16,
      pattern: /^(?:writer|calc|impress|draw|math|base)$/
    });
    const installation = await this.#requireInstallation('gui');
    const profile = await this.#createProfile('gui-');
    const args = [
      buildProfileArgument(profile),
      '--nologo',
      '--nodefault',
      '--nofirststartwizard',
      NEW_DOCUMENT_ARGUMENTS[kind]
    ];
    try {
      const launched = await this.launch(installation.guiExecutable, args, {
        shell: false,
        windowsHide: false,
        onClose: () => this.#removeProfile(profile)
      });
      return {
        launched: true,
        pid: launched.pid ?? null,
        executable: installation.guiExecutable,
        kind,
        contentPersisted: false
      };
    } catch (error) {
      await this.#removeProfile(profile);
      throw error;
    }
  }

  async convertDocument(input) {
    const payload = requirePlainObject(input, 'conversion request');
    const sourcePath = requireLibreOfficeDocumentPath(payload.sourcePath, 'source path');
    const outputDirectory = requireAbsolutePath(payload.outputDirectory, 'output directory');
    const target = normalizeConversionTarget(payload.targetFormat);
    const overwrite = payload.overwrite === undefined ? false : requireBoolean(payload.overwrite, 'overwrite');
    if (overwrite) {
      throw new ValidationError('Conversion cannot replace an existing file.');
    }
    const timeoutMs = payload.timeoutMs === undefined
      ? 60_000
      : requireInteger(payload.timeoutMs, 'timeout', { min: 1_000, max: 120_000 });

    let sourceStat;
    try {
      sourceStat = await this.fs.stat(sourcePath);
    } catch {
      throw new AppError('DOCUMENT_NOT_FOUND', 'The source document does not exist.');
    }
    if (!sourceStat.isFile()) {
      throw new AppError('DOCUMENT_NOT_FOUND', 'The source document does not exist.');
    }
    if (sourceStat.size > this.maximumConversionSourceBytes) {
      throw new AppError('CONVERSION_SOURCE_TOO_LARGE', 'The source document exceeds the conversion size limit.');
    }
    await this.fs.mkdir(outputDirectory, { recursive: true });
    if (!await isDirectory(this.fs, outputDirectory)) {
      throw new AppError('OUTPUT_DIRECTORY_INVALID', 'The output directory is not available.');
    }

    const outputPath = path.join(outputDirectory, `${path.parse(sourcePath).name}${target.extension}`);
    if (path.resolve(outputPath).toLowerCase() === path.resolve(sourcePath).toLowerCase()) {
      throw new ValidationError('The conversion output cannot replace the source document.');
    }
    if (await isFile(this.fs, outputPath)) {
      throw new AppError('OUTPUT_EXISTS', 'The converted document already exists.');
    }

    const installation = await this.#requireInstallation('conversion');
    const profile = await this.#createProfile('convert-profile-');
    let jobDirectory;

    try {
      jobDirectory = await this.fs.mkdtemp(path.join(outputDirectory, '.material-office-convert-'));
      const inputDirectory = path.join(jobDirectory, 'input');
      const jobOutputDirectory = path.join(jobDirectory, 'output');
      await Promise.all([
        this.fs.mkdir(inputDirectory, { recursive: false }),
        this.fs.mkdir(jobOutputDirectory, { recursive: false })
      ]);
      const stagedSourcePath = path.join(inputDirectory, path.basename(sourcePath));
      await this.#stageConversionSource(sourcePath, stagedSourcePath);
      const producedPath = path.join(jobOutputDirectory, `${path.parse(sourcePath).name}${target.extension}`);
      const args = [
        buildProfileArgument(profile),
        '--headless',
        '--invisible',
        '--nologo',
        '--nodefault',
        '--norestore',
        '--nolockcheck',
        '--nofirststartwizard',
        '--convert-to',
        target.argument,
        '--outdir',
        jobOutputDirectory,
        stagedSourcePath
      ];
      const abortController = new AbortController();
      const monitorState = { finished: false, limitExceeded: false, error: null };
      const monitor = this.#monitorConversionDirectory(jobOutputDirectory, abortController, monitorState);
      let result;
      try {
        result = await this.run(installation.headlessExecutable, args, {
          shell: false,
          killTree: true,
          timeoutMs,
          maxOutputBytes: 65_536,
          windowsHide: true,
          abortSignal: abortController.signal
        });
      } finally {
        monitorState.finished = true;
        await monitor;
      }
      if (monitorState.limitExceeded) {
        throw new AppError('CONVERSION_OUTPUT_TOO_LARGE', 'LibreOffice exceeded the conversion output size limit.');
      }
      if (monitorState.error) {
        throw new AppError('CONVERSION_MONITOR_FAILED', 'The conversion output could not be monitored safely.', {
          cause: monitorState.error
        });
      }
      if (result.timedOut) {
        throw new AppError('CONVERSION_TIMEOUT', 'LibreOffice did not finish the conversion before the time limit.');
      }
      if (result.exitCode !== 0) {
        throw new AppError('CONVERSION_FAILED', 'LibreOffice could not convert the document.');
      }
      if (result.stdoutTruncated || result.stderrTruncated) {
        throw new AppError('CONVERSION_PROCESS_OUTPUT_INVALID', 'LibreOffice produced too much diagnostic output.');
      }
      const publishedBytes = await this.#publishConvertedFile(producedPath, outputPath);
      return {
        converted: true,
        sourcePath,
        outputPath,
        targetFormat: target.name,
        bytes: publishedBytes,
        executable: installation.headlessExecutable
      };
    } finally {
      await Promise.all([
        jobDirectory
          ? this.fs.rm(jobDirectory, { recursive: true, force: true }).catch(() => undefined)
          : Promise.resolve(),
        this.#removeProfile(profile)
      ]);
    }
  }

  async #requireInstallation(capability) {
    const { installation } = await this.discover();
    if (!installation) {
      throw new AppError('LIBREOFFICE_NOT_FOUND', 'LibreOffice is not available.');
    }
    if (capability === 'gui' && !installation.guiExecutable) {
      throw new AppError('LIBREOFFICE_GUI_UNAVAILABLE', 'The LibreOffice graphical executable is not available.');
    }
    if (capability === 'conversion' && !installation.headlessExecutable) {
      throw new AppError('LIBREOFFICE_CONVERSION_UNAVAILABLE', 'The LibreOffice conversion executable is not available.');
    }
    return installation;
  }

  async #resolveInstallation(candidatePath, source) {
    if (typeof candidatePath !== 'string' || candidatePath.includes('\0') || !path.isAbsolute(candidatePath)) {
      return null;
    }
    const normalized = path.normalize(candidatePath);
    const extension = path.extname(normalized).toLowerCase();
    const basename = path.basename(normalized).toLowerCase();
    let programDirectory;
    if (extension === '.exe' || extension === '.com') {
      if (basename !== 'soffice.exe' && basename !== 'soffice.com') return null;
      programDirectory = path.dirname(normalized);
    } else if (path.basename(normalized).toLowerCase() === 'program') {
      programDirectory = normalized;
    } else {
      programDirectory = path.join(normalized, 'program');
    }

    const guiCandidate = path.resolve(programDirectory, 'soffice.exe');
    const consoleCandidate = path.resolve(programDirectory, 'soffice.com');
    const guiExecutable = await isFile(this.fs, guiCandidate) ? guiCandidate : null;
    const consoleExecutable = await isFile(this.fs, consoleCandidate) ? consoleCandidate : null;
    if (!guiExecutable && !consoleExecutable) return null;
    const pythonCandidate = path.resolve(programDirectory, 'python.exe');
    const unoModuleCandidate = path.resolve(programDirectory, 'uno.py');
    const pyunoModuleCandidate = path.resolve(programDirectory, 'pyuno.pyd');
    const bootstrapCandidate = path.resolve(programDirectory, 'fundamental.ini');
    let pythonExecutable = null;
    if (
      await isFile(this.fs, pythonCandidate) &&
      await isFile(this.fs, unoModuleCandidate) &&
      await isFile(this.fs, pyunoModuleCandidate) &&
      await isFile(this.fs, bootstrapCandidate)
    ) {
      try {
        const probe = await this.run(pythonCandidate, pyunoProbeArguments(programDirectory), {
          shell: false,
          killTree: true,
          cwd: path.resolve(programDirectory),
          env: sanitizedPythonEnvironment(this.env),
          timeoutMs: 5_000,
          maxOutputBytes: 4_096,
          windowsHide: true
        });
        if (probe.exitCode === 0 && !probe.timedOut && !probe.stdoutTruncated && !probe.stderrTruncated) {
          pythonExecutable = pythonCandidate;
        }
      } catch {
        // Discovery remains useful for GUI and conversion when pyuno is unavailable.
      }
    }
    return {
      source,
      programDirectory: path.resolve(programDirectory),
      guiExecutable,
      headlessExecutable: consoleExecutable ?? guiExecutable,
      pythonExecutable
    };
  }

  async #standardCandidates() {
    const roots = [this.env.ProgramFiles, this.env['ProgramFiles(x86)']]
      .filter((entry) => typeof entry === 'string' && path.isAbsolute(entry));
    const candidates = [];
    for (const root of roots) {
      candidates.push(path.join(root, 'LibreOffice'));
      let entries = [];
      try {
        entries = await this.fs.readdir(root, { withFileTypes: true });
      } catch {
        continue;
      }
      const matching = entries
        .filter((entry) => entry.isDirectory() && /^LibreOfficeDev(?:\s.+)?$/i.test(entry.name))
        .map((entry) => path.join(root, entry.name))
        .sort((left, right) => right.localeCompare(left, 'en', { numeric: true }));
      candidates.push(...matching);
    }
    if (typeof this.env.LOCALAPPDATA === 'string' && path.isAbsolute(this.env.LOCALAPPDATA)) {
      candidates.push(path.join(this.env.LOCALAPPDATA, 'Programs', 'LibreOffice'));
      candidates.push(path.join(this.env.LOCALAPPDATA, 'Programs', 'LibreOfficeDev'));
    }
    return [...new Map(candidates.map((candidate) => [candidate.toLowerCase(), candidate])).values()];
  }

  async #readRegistryPaths() {
    if (this.platform !== 'win32') return [];
    const windowsDirectory = this.env.SystemRoot ?? this.env.WINDIR;
    if (!windowsDirectory || !path.isAbsolute(windowsDirectory)) return [];
    const registryExecutable = path.resolve(windowsDirectory, 'System32', 'reg.exe');
    const results = [];
    for (const key of REGISTRY_KEYS) {
      let result;
      try {
        result = await this.run(registryExecutable, ['query', key], {
          timeoutMs: 5_000,
          maxOutputBytes: 65_536,
          windowsHide: true
        });
      } catch {
        continue;
      }
      if (result.exitCode === 0) {
        results.push(...parseRegistryPaths(result.stdout, this.env));
      }
    }
    return results;
  }

  async #createProfile(prefix) {
    await this.fs.mkdir(this.profileRoot, { recursive: true });
    return this.fs.mkdtemp(path.join(this.profileRoot, prefix));
  }

  async #removeProfile(profile) {
    await this.fs.rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }

  async #stageConversionSource(sourcePath, stagedPath) {
    let source;
    let destination;
    try {
      source = await this.fs.open(sourcePath, 'r');
      const initialStat = await source.stat({ bigint: true });
      const initialVersion = fileVersion(initialStat);
      if (!initialStat.isFile()) {
        throw new AppError('DOCUMENT_NOT_FOUND', 'The source document does not exist.');
      }
      if (!initialVersion) {
        throw new AppError('CONVERSION_SOURCE_UNSAFE', 'The source document cannot be staged safely on this filesystem.');
      }
      if (initialStat.size > BigInt(this.maximumConversionSourceBytes)) {
        throw new AppError('CONVERSION_SOURCE_TOO_LARGE', 'The source document exceeds the conversion size limit.');
      }
      destination = await this.fs.open(stagedPath, 'wx', 0o600);
      const buffer = Buffer.alloc(64 * 1024);
      let offset = 0;
      while (true) {
        const remaining = (this.maximumConversionSourceBytes + 1) - offset;
        if (remaining <= 0) break;
        const { bytesRead } = await source.read(
          buffer,
          0,
          Math.min(buffer.length, remaining),
          offset
        );
        if (bytesRead === 0) break;
        let written = 0;
        while (written < bytesRead) {
          const result = await destination.write(buffer, written, bytesRead - written, offset + written);
          if (result.bytesWritten <= 0) {
            throw new AppError('CONVERSION_SOURCE_READ_FAILED', 'The source document could not be staged safely.');
          }
          written += result.bytesWritten;
        }
        offset += bytesRead;
        if (offset > this.maximumConversionSourceBytes) {
          throw new AppError('CONVERSION_SOURCE_TOO_LARGE', 'The source document exceeds the conversion size limit.');
        }
      }
      const finalStat = await source.stat({ bigint: true });
      if (fileVersion(finalStat) !== initialVersion || BigInt(offset) !== initialStat.size) {
        throw new AppError('CONVERSION_SOURCE_CHANGED', 'The source document changed while it was being staged.');
      }
      await destination.sync();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('CONVERSION_SOURCE_READ_FAILED', 'The source document could not be staged safely.', {
        cause: error
      });
    } finally {
      await Promise.all([
        source?.close().catch(() => undefined),
        destination?.close().catch(() => undefined)
      ]);
    }
  }

  async #monitorConversionDirectory(jobDirectory, abortController, state) {
    while (true) {
      if (!state.finished) {
        await new Promise((resolve) => setTimeout(resolve, this.conversionMonitorIntervalMs));
      }
      try {
        if (await this.#conversionDirectoryExceedsLimit(jobDirectory)) {
          state.limitExceeded = true;
          abortController.abort();
          return;
        }
      } catch (error) {
        state.error = error;
        abortController.abort();
        return;
      }
      if (state.finished) return;
    }
  }

  async #conversionDirectoryExceedsLimit(jobDirectory) {
    const root = path.resolve(jobDirectory);
    const stack = [root];
    let entriesSeen = 0;
    let totalBytes = 0;
    while (stack.length > 0) {
      const current = stack.pop();
      const entries = await this.fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        entriesSeen += 1;
        if (entriesSeen > 10_000 || entry.isSymbolicLink()) return true;
        const candidate = path.resolve(current, entry.name);
        if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return true;
        if (entry.isDirectory()) {
          stack.push(candidate);
          continue;
        }
        if (!entry.isFile()) return true;
        const stat = await this.fs.stat(candidate);
        totalBytes += stat.size;
        if (totalBytes > this.maximumConversionOutputBytes) return true;
      }
    }
    return false;
  }

  async #publishConvertedFile(sourcePath, outputPath) {
    const stagedPath = path.join(
      path.dirname(outputPath),
      `.${path.basename(outputPath)}.${randomUUID()}.tmp`
    );
    let source;
    let staged;
    try {
      source = await this.fs.open(sourcePath, 'r');
      const initialStat = await source.stat({ bigint: true });
      const initialVersion = fileVersion(initialStat);
      if (!initialStat.isFile() || initialStat.size < 1n) {
        throw new AppError('CONVERSION_OUTPUT_MISSING', 'LibreOffice finished without producing the requested file.');
      }
      if (!initialVersion) {
        throw new AppError('CONVERSION_OUTPUT_UNSAFE', 'The converted file cannot be verified safely on this filesystem.');
      }
      if (initialStat.size > BigInt(this.maximumConversionOutputBytes)) {
        throw new AppError('CONVERSION_OUTPUT_TOO_LARGE', 'LibreOffice exceeded the conversion output size limit.');
      }
      staged = await this.fs.open(stagedPath, 'wx', 0o600);
      const buffer = Buffer.alloc(64 * 1024);
      let offset = 0;
      while (true) {
        const remaining = (this.maximumConversionOutputBytes + 1) - offset;
        if (remaining <= 0) break;
        const { bytesRead } = await source.read(
          buffer,
          0,
          Math.min(buffer.length, remaining),
          offset
        );
        if (bytesRead === 0) break;
        let written = 0;
        while (written < bytesRead) {
          const result = await staged.write(buffer, written, bytesRead - written, offset + written);
          if (result.bytesWritten <= 0) {
            throw new AppError('CONVERSION_SAVE_FAILED', 'The converted document could not be staged safely.');
          }
          written += result.bytesWritten;
        }
        offset += bytesRead;
        if (offset > this.maximumConversionOutputBytes) {
          throw new AppError('CONVERSION_OUTPUT_TOO_LARGE', 'LibreOffice exceeded the conversion output size limit.');
        }
      }
      const finalStat = await source.stat({ bigint: true });
      if (fileVersion(finalStat) !== initialVersion || BigInt(offset) !== initialStat.size) {
        throw new AppError('CONVERSION_OUTPUT_CHANGED', 'The converted file changed while it was being verified.');
      }
      await staged.sync();
      await this.fs.link(stagedPath, outputPath);
      return offset;
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new AppError('OUTPUT_EXISTS', 'The converted document already exists.');
      }
      if (error instanceof AppError) throw error;
      throw new AppError('CONVERSION_SAVE_FAILED', 'The converted document could not be saved.', { cause: error });
    } finally {
      await Promise.all([
        source?.close().catch(() => undefined),
        staged?.close().catch(() => undefined)
      ]);
      await this.fs.rm(stagedPath, { force: true }).catch(() => undefined);
    }
  }
}
