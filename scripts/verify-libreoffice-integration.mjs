import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LibreOfficeService } from '../src/main/libreoffice-service.js';
import { runProcess } from '../src/main/process-runner.js';

if (process.platform !== 'win32') {
  throw new Error('The genuine LibreOffice integration verification runs only on Windows.');
}

const expectedVersion = process.env.LIBREOFFICE_VERSION ?? '26.2.5';
const soffice = path.resolve(
  process.argv[2]
    ?? process.env.MATERIAL_OFFICE_SOFFICE
    ?? path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'LibreOffice', 'program', 'soffice.com')
);
assert.match(path.basename(soffice), /^soffice\.(?:com|exe)$/i);

const versionResult = await runProcess(soffice, ['--headless', '--version'], {
  shell: false,
  killTree: true,
  timeoutMs: 30_000,
  maxOutputBytes: 8_192,
  windowsHide: true
});
assert.equal(versionResult.exitCode, 0, versionResult.stderr);
assert.equal(versionResult.timedOut, false);
assert.match(versionResult.stdout, new RegExp(`LibreOffice\\s+${expectedVersion.replaceAll('.', '\\.')}(?:\\.|\\s|$)`, 'i'));

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-libreoffice-蝦餃-'));
try {
  const service = new LibreOfficeService({
    platform: 'win32',
    env: { ...process.env, MATERIAL_OFFICE_SOFFICE: soffice },
    registryProvider: async () => [],
    profileRoot: path.join(temporaryRoot, 'profiles')
  });
  const availability = await service.getAvailability({ refresh: true });
  assert.equal(availability.available, true);
  assert.equal(availability.guiAvailable, true);
  assert.equal(availability.conversionAvailable, true);
  assert.equal(availability.unoAvailable, true, 'LibreOffice bundled Python could not import its UNO bridge.');
  assert.equal(path.resolve(availability.installation.headlessExecutable), soffice);

  const fixturesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');
  const conversions = [];
  for (const fixtureName of [
    'libreoffice-roundtrip-source.html',
    'libreoffice-roundtrip-source.fodt'
  ]) {
    const caseName = path.extname(fixtureName).slice(1);
    const caseRoot = path.join(temporaryRoot, `case-${caseName}`);
    const inputRoot = path.join(caseRoot, 'input');
    const outputRoot = path.join(caseRoot, 'output');
    await Promise.all([
      fs.mkdir(inputRoot, { recursive: true }),
      fs.mkdir(outputRoot, { recursive: true })
    ]);
    const sourcePath = path.join(inputRoot, `LibreOffice-${caseName}-蝦餃${path.extname(fixtureName)}`);
    await fs.copyFile(path.join(fixturesRoot, fixtureName), sourcePath);
    const before = await fs.readFile(sourcePath);
    const converted = await service.convertDocument({
      sourcePath,
      outputDirectory: outputRoot,
      targetFormat: 'pdf',
      timeoutMs: 120_000
    });
    const pdf = await fs.readFile(converted.outputPath);
    assert.ok(pdf.length > 500, `${fixtureName} produced an unexpectedly small PDF.`);
    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.match(pdf.subarray(Math.max(0, pdf.length - 2_048)).toString('latin1'), /%%EOF/);
    assert.deepEqual(await fs.readFile(sourcePath), before, `${fixtureName} was modified during conversion.`);
    assert.equal(converted.executable, soffice);
    assert.equal((await fs.readdir(outputRoot)).some((entry) => entry.startsWith('.material-office-convert-')), false);
    conversions.push({ source: path.extname(fixtureName), outputBytes: pdf.length });
  }

  console.log(JSON.stringify({
    verified: true,
    expectedVersion,
    reportedVersion: versionResult.stdout.trim(),
    executable: soffice,
    availability: {
      gui: availability.guiAvailable,
      conversion: availability.conversionAvailable,
      uno: availability.unoAvailable
    },
    conversions
  }));
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
