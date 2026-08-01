import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_ENTRY_URL } from '../../src/main/app-protocol.js';
import {
  installNavigationGuards,
  isAllowedApplicationPermission,
  isTrustedApplicationOrigin,
  isTrustedApplicationUrl,
  resolveDevelopmentUrl
} from '../../src/main/window-security.js';

test('packaged builds ignore development URLs and development mode accepts loopback only', () => {
  assert.equal(resolveDevelopmentUrl('http://127.0.0.1:5173', {
    isPackaged: true,
    enabled: true
  }), null);
  assert.equal(resolveDevelopmentUrl('http://127.0.0.1:5173', {
    isPackaged: false,
    enabled: false
  }), null);
  assert.equal(resolveDevelopmentUrl('https://example.com', {
    isPackaged: false,
    enabled: true
  }), null);
  assert.equal(resolveDevelopmentUrl('http://localhost:5173', {
    isPackaged: false,
    enabled: true
  }), 'http://localhost:5173/');
});

test('trusted application URLs are an exact bundled file or the explicit dev origin', () => {
  assert.equal(isTrustedApplicationUrl(`${APP_ENTRY_URL}#home`, {
    applicationUrl: APP_ENTRY_URL,
    developmentUrl: null
  }), true);
  assert.equal(isTrustedApplicationUrl('material-office://app/app.mjs', {
    applicationUrl: APP_ENTRY_URL,
    developmentUrl: null
  }), false);
  assert.equal(isTrustedApplicationUrl('http://localhost:5173/workspace', {
    applicationUrl: APP_ENTRY_URL,
    developmentUrl: 'http://localhost:5173/'
  }), true);
  assert.equal(isTrustedApplicationUrl('https://example.com/', {
    applicationUrl: APP_ENTRY_URL,
    developmentUrl: 'http://localhost:5173/'
  }), false);
});

test('only trusted app origins may request local installed-font enumeration', () => {
  const policy = { applicationUrl: APP_ENTRY_URL, developmentUrl: null };
  assert.equal(isTrustedApplicationOrigin('material-office://app/assets/legal/LICENSE.txt', policy), true);
  assert.equal(isAllowedApplicationPermission('local-fonts', 'material-office://app/index.html', policy), true);
  assert.equal(isAllowedApplicationPermission('clipboard-read', 'material-office://app/index.html', policy), false);
  assert.equal(isAllowedApplicationPermission('local-fonts', 'https://example.com/', policy), false);
});

test('navigation guards block redirects, untrusted main navigations, and every subframe', () => {
  const listeners = new Map();
  let windowOpenHandler;
  let violated = false;
  const webContents = {
    setWindowOpenHandler(handler) {
      windowOpenHandler = handler;
    },
    on(name, handler) {
      listeners.set(name, handler);
    }
  };
  const trusted = (url) => url === 'file:///trusted/index.html';
  installNavigationGuards(webContents, trusted, () => {
    violated = true;
  });
  assert.deepEqual(windowOpenHandler(), { action: 'deny' });

  const attempt = (eventName, url, isMainFrame) => {
    let prevented = false;
    listeners.get(eventName)({
      url,
      isMainFrame,
      preventDefault: () => {
        prevented = true;
      }
    });
    return prevented;
  };
  assert.equal(attempt('will-navigate', 'file:///trusted/index.html', true), false);
  assert.equal(attempt('will-navigate', 'https://example.com', true), true);
  assert.equal(attempt('will-redirect', 'https://example.com', true), true);
  assert.equal(attempt('will-frame-navigate', 'file:///trusted/index.html', false), true);
  assert.equal(attempt('will-attach-webview', '', false), true);

  listeners.get('did-navigate')({ url: 'https://example.com' });
  assert.equal(violated, true);
});
