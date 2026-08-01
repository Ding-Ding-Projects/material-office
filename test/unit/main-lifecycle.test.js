import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('quit keeps IPC registered through renderer beforeunload persistence', async () => {
  const source = await fs.readFile(new URL('../../src/main/index.js', import.meta.url), 'utf8');
  const teardown = source.slice(
    source.indexOf("app.on('will-quit'"),
    source.indexOf("app.on('window-all-closed'")
  );
  assert.match(teardown, /removeIpcHandlers\?\.\(\)/);
  assert.doesNotMatch(source, /app\.on\('before-quit',[\s\S]{0,400}removeIpcHandlers/);
});
