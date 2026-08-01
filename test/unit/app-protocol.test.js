import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  APP_CONTENT_SECURITY_POLICY,
  APP_ENTRY_URL,
  createAppProtocolHandler,
  resolveRendererAsset
} from '../../src/main/app-protocol.js';

async function rendererFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'material-office-protocol-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await Promise.all([
    fs.mkdir(path.join(root, 'core'), { recursive: true }),
    fs.mkdir(path.join(root, 'assets', 'data'), { recursive: true }),
    fs.mkdir(path.join(root, 'assets', 'dim-sum'), { recursive: true }),
    fs.mkdir(path.join(root, 'assets', 'legal'), { recursive: true })
  ]);
  await Promise.all([
    fs.writeFile(path.join(root, 'index.html'), '<!doctype html><script type="module" src="./app.mjs"></script>'),
    fs.writeFile(path.join(root, 'styles.css'), ':root{color-scheme:light dark}'),
    fs.writeFile(path.join(root, 'app.mjs'), 'import "./core/index.mjs";'),
    fs.writeFile(path.join(root, 'core', 'index.mjs'), 'export const ready=true;'),
    fs.writeFile(path.join(root, 'assets', 'data', 'features.json'), '[]'),
    fs.writeFile(path.join(root, 'assets', 'legal', 'LICENSE.txt'), 'MIT License'),
    fs.writeFile(path.join(root, 'assets', 'legal', 'THIRD_PARTY_NOTICES.md'), '# Notices'),
    fs.writeFile(path.join(root, 'assets', 'legal', 'classic-har-gow-provenance.json'), '{}'),
    fs.writeFile(path.join(root, 'assets', 'dim-sum', 'dish.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  ]);
  return root;
}

test('renderer protocol resolves only exact-host allowlisted assets with correct MIME types', async (t) => {
  const root = await rendererFixture(t);
  const cases = [
    [APP_ENTRY_URL, 'index.html', 'text/html; charset=utf-8'],
    ['material-office://app/styles.css', 'styles.css', 'text/css; charset=utf-8'],
    ['material-office://app/app.mjs', 'app.mjs', 'text/javascript; charset=utf-8'],
    ['material-office://app/core/index.mjs', 'core/index.mjs', 'text/javascript; charset=utf-8'],
    ['material-office://app/assets/data/features.json', 'assets/data/features.json', 'application/json; charset=utf-8'],
    ['material-office://app/assets/legal/LICENSE.txt', 'assets/legal/LICENSE.txt', 'text/plain; charset=utf-8'],
    ['material-office://app/assets/legal/THIRD_PARTY_NOTICES.md', 'assets/legal/THIRD_PARTY_NOTICES.md', 'text/markdown; charset=utf-8'],
    ['material-office://app/assets/legal/classic-har-gow-provenance.json', 'assets/legal/classic-har-gow-provenance.json', 'application/json; charset=utf-8'],
    ['material-office://app/assets/dim-sum/dish.png', 'assets/dim-sum/dish.png', 'image/png']
  ];
  for (const [url, relativePath, mimeType] of cases) {
    const asset = resolveRendererAsset(url, root);
    assert.ok(asset);
    assert.equal(asset.relativePath, relativePath);
    assert.equal(asset.mimeType, mimeType);
    assert.equal(asset.filePath.startsWith(`${root}${path.sep}`), true);
  }
});

test('renderer protocol rejects traversal, alternate origins, ports, queries, and non-allowlisted files', async (t) => {
  const root = await rendererFixture(t);
  for (const url of [
    'material-office://evil/index.html',
    'material-office://app:444/index.html',
    'material-office://app/../package.json',
    'material-office://app/%2e%2e/package.json',
    'material-office://app/core/%2e%2e/index.html',
    'material-office://app/core/%2fsecret.mjs',
    'material-office://app/index.html?path=../package.json',
    'material-office://app/package.json',
    'file:///C:/Windows/win.ini',
    'https://app/index.html'
  ]) {
    assert.equal(resolveRendererAsset(url, root), null, url);
  }
});

test('renderer protocol serves bounded assets with CSP and same-origin hardening', async (t) => {
  const root = await rendererFixture(t);
  const handler = createAppProtocolHandler({ rendererRoot: root, fs });
  const response = await handler({ method: 'GET', url: APP_ENTRY_URL });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('content-security-policy'), APP_CONTENT_SECURITY_POLICY);
  assert.equal(response.headers.get('permissions-policy'), 'local-fonts=(self)');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await response.text(), /type="module"/);

  const head = await handler({ method: 'HEAD', url: 'material-office://app/styles.css' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const traversal = await handler({ method: 'GET', url: 'material-office://app/../package.json' });
  assert.equal(traversal.status, 404);
  const post = await handler({ method: 'POST', url: APP_ENTRY_URL });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});
