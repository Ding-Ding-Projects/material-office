import assert from 'node:assert/strict';
import path from 'node:path';
import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';

const executable = path.resolve(process.argv[2] ?? path.join('dist', 'win-unpacked', 'Material Office.exe'));
const wire = await getCurrentFuseWire(executable);
const enabled = '1'.charCodeAt(0);
const disabled = '0'.charCodeAt(0);
const expected = new Map([
  [FuseV1Options.RunAsNode, disabled],
  [FuseV1Options.EnableCookieEncryption, enabled],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, disabled],
  [FuseV1Options.EnableNodeCliInspectArguments, disabled],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, enabled],
  [FuseV1Options.OnlyLoadAppFromAsar, enabled],
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, disabled],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, disabled]
]);

assert.equal(wire.version, '1', 'Expected Electron fuse wire version 1.');
for (const [option, value] of expected) {
  assert.equal(wire[option], value, `${FuseV1Options[option]} has an unsafe packaged value.`);
}

console.log(JSON.stringify({
  verified: true,
  executable,
  fuses: Object.fromEntries([...expected].map(([option, value]) => [FuseV1Options[option], value === enabled ? 'enabled' : 'disabled']))
}));
