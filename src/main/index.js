import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  session
} from 'electron';
import {
  APP_ENTRY_URL,
  APP_PROTOCOL_REGISTRATION,
  APP_PROTOCOL_SCHEME,
  createAppProtocolHandler
} from './app-protocol.js';
import { ChangelogService, VERIFIED_CHANGELOG_ENTRIES } from './changelog-service.js';
import { CustomWordDocumentService } from './custom-word-document-service.js';
import { DataFileService } from './data-file-service.js';
import { DocumentWorkspaceService } from './document-workspace-service.js';
import { ExternalEditorService } from './external-editor-service.js';
import { BUNDLED_GIT_RELATIVE_PATH, discoverGitExecutable } from './git-executable.js';
import { GitHistoryService } from './git-history-service.js';
import { registerIpcHandlers } from './ipc.js';
import { LibreOfficeService } from './libreoffice-service.js';
import { NotificationService } from './notification-service.js';
import { PersistentStateService } from './state-service.js';
import { UnoCommandService } from './uno-command-service.js';
import { WindowsSettingsService } from './windows-settings-service.js';
import {
  installNavigationGuards,
  isAllowedApplicationPermission,
  isTrustedApplicationUrl,
  resolveDevelopmentUrl
} from './window-security.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.resolve(moduleDirectory, '..', 'preload.cjs');
const rendererDirectory = path.resolve(moduleDirectory, '..', 'renderer');
let mainWindow = null;
const appWindows = new Set();
const windowPolicies = new WeakMap();
let removeIpcHandlers = null;
let removeWorkspaceChangeListener = null;
const smokeMode = process.argv.includes('--smoke-test');
const smokeUserDataPath = path.join(app.getPath('temp'), `material-office-smoke-${process.pid}`);

protocol.registerSchemesAsPrivileged([APP_PROTOCOL_REGISTRATION]);

if (smokeMode) {
  app.disableHardwareAcceleration();
  app.setPath('userData', smokeUserDataPath);
}

function validatedDevelopmentUrl() {
  return resolveDevelopmentUrl(process.env.MATERIAL_OFFICE_DEV_URL, {
    isPackaged: app.isPackaged,
    enabled: process.env.MATERIAL_OFFICE_DEV_MODE === '1'
  });
}

function installWebContentsGuards(window, allowedDevelopmentUrl) {
  const policy = Object.freeze({ applicationUrl: APP_ENTRY_URL, developmentUrl: allowedDevelopmentUrl });
  windowPolicies.set(window.webContents, policy);
  installNavigationGuards(
    window.webContents,
    (targetUrl) => isTrustedApplicationUrl(targetUrl, policy),
    () => {
      if (!window.isDestroyed()) window.destroy();
    }
  );
}

function createWindow() {
  const developmentUrl = validatedDevelopmentUrl();
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 720,
    minHeight: 560,
    show: false,
    frame: false,
    backgroundColor: '#FFFBFE',
    title: 'Material Office',
    autoHideMenuBar: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      safeDialogs: true,
      spellcheck: true,
      offscreen: smokeMode
    }
  });
  installWebContentsGuards(window, developmentUrl);
  appWindows.add(window);
  if (!smokeMode) window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    appWindows.delete(window);
    if (mainWindow === window) mainWindow = [...appWindows].at(-1) ?? null;
  });
  return { window, developmentUrl };
}

async function loadWindow(window, developmentUrl) {
  if (developmentUrl) {
    await window.loadURL(developmentUrl);
  } else {
    await window.loadURL(APP_ENTRY_URL);
  }
}

async function openNewAppWindow() {
  const created = createWindow();
  mainWindow = created.window;
  try {
    await loadWindow(created.window, created.developmentUrl);
  } catch (error) {
    created.window.destroy();
    throw error;
  }
}

async function runRendererSmoke(window) {
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (!ready && Date.now() < deadline) {
    ready = await window.webContents.executeJavaScript(
      'Boolean(window.__materialOfficeTest && document.querySelector("#app[aria-busy=\\"false\\"]"))',
      true
    );
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('The renderer did not become smoke-test ready within 30 seconds.');

  const localAssets = await window.webContents.executeJavaScript(`(async () => {
    const moduleLoaded = Boolean(window.__materialOfficeTest?.runSmoke);
    const stylesheet = [...document.styleSheets].find((sheet) => sheet.href?.endsWith('/styles.css'));
    let cssLoaded = false;
    try { cssLoaded = Boolean(stylesheet && stylesheet.cssRules.length > 0); } catch { cssLoaded = false; }
    const response = await fetch('./assets/data/features.json');
    const catalog = response.ok ? await response.json() : null;
    const featureCatalogLoaded = Array.isArray(catalog) && catalog.length === 2433;
    const dimSumAssetLoaded = await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0);
      image.onerror = () => resolve(false);
      image.src = './assets/dim-sum/hk-dish-0001-classic-har-gow.png';
    });
    return { moduleLoaded, cssLoaded, featureCatalogLoaded, dimSumAssetLoaded };
  })()`, true);
  if (Object.values(localAssets).some((value) => value !== true)) {
    throw new Error(`The local packaged renderer assets failed smoke verification: ${JSON.stringify(localAssets)}`);
  }

  const result = await window.webContents.executeJavaScript(
    'window.__materialOfficeTest.runSmoke()',
    true
  );
  if (!result?.passed) throw new Error('The renderer smoke suite reported a failure.');

  window.webContents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 500));

  const artifactDirectory = app.isPackaged
    ? path.join(app.getPath('temp'), 'material-office-packaged-smoke', String(process.pid))
    : path.join(path.resolve(moduleDirectory, '..', '..'), 'artifacts', 'smoke');
  await fs.mkdir(artifactDirectory, { recursive: true });
  const image = await window.webContents.capturePage();
  const screenshotPath = path.join(artifactDirectory, 'material-office-home.png');
  await fs.writeFile(screenshotPath, image.toPNG());
  console.log(`[material-office-smoke] ${JSON.stringify({ ...result, localAssets, screenshotPath })}`);
}

async function runLocalHistorySmoke(state) {
  const initial = await state.getSettings();
  const firstTheme = initial.theme === 'dark' ? 'light' : 'dark';
  const secondTheme = firstTheme === 'dark' ? 'light' : 'dark';
  const first = await state.updateSettings({ theme: firstTheme });
  if (!first.history?.recorded || !first.history.snapshot?.revision) {
    throw new Error('Local history did not record the first smoke snapshot.');
  }
  const second = await state.updateSettings({ theme: secondTheme });
  if (!second.history?.recorded || !second.history.snapshot?.revision) {
    throw new Error('Local history did not record the second smoke snapshot.');
  }
  const restored = await state.restore(first.history.snapshot.revision);
  if (restored.historyRecorded !== true || (await state.getSettings()).theme !== firstTheme) {
    throw new Error('Local history did not restore and append the smoke snapshot.');
  }
}

async function startApplication() {
  if (process.platform !== 'win32') {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Windows required',
      message: 'Material Office currently supports Windows only.'
    });
    app.quit();
    return;
  }

  await protocol.handle(APP_PROTOCOL_SCHEME, createAppProtocolHandler({
    rendererRoot: rendererDirectory,
    fs
  }));

  const userDataPath = app.getPath('userData');
  const gitExecutable = await discoverGitExecutable({
    bundledExecutable: path.join(process.resourcesPath, ...BUNDLED_GIT_RELATIVE_PATH),
    isPackaged: app.isPackaged
  });
  const history = gitExecutable
    ? new GitHistoryService(path.join(userDataPath, 'version-history'), { gitExecutable })
    : null;
  const state = new PersistentStateService(userDataPath, { history });
  await state.initialize();
  removeWorkspaceChangeListener = state.onWorkspaceChanged((envelope) => {
    for (const window of appWindows) {
      try {
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
          window.webContents.send('workspace:changed', envelope);
        }
      } catch {}
    }
  });
  if (smokeMode) {
    if (!history || !state.isHistoryAvailable()) throw new Error('The trusted Git runtime is unavailable.');
    await runLocalHistorySmoke(state);
  }
  const persistedSettings = await state.getSettings();
  const libreOffice = new LibreOfficeService({
    profileRoot: path.join(userDataPath, 'libreoffice-profiles'),
    explicitOverride: persistedSettings.libreOfficeExecutableOverride
  });
  const unoCommands = new UnoCommandService({
    catalogPath: path.join(app.getAppPath(), 'src', 'renderer', 'assets', 'data', 'features.json'),
    brokerPath: app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'main', 'uno-command.py')
      : path.join(moduleDirectory, 'uno-command.py'),
    profileRoot: path.join(userDataPath, 'libreoffice-uno-profiles'),
    libreOffice
  });
  const externalEditors = new ExternalEditorService();
  const dataFiles = new DataFileService();
  const windowsSettings = new WindowsSettingsService();
  const notifications = new NotificationService(state);
  const documents = new DocumentWorkspaceService({ state, libreOffice });
  const customWord = gitExecutable
    ? new CustomWordDocumentService({ rootPath: path.join(userDataPath, 'custom-word-history'), gitExecutable })
    : null;
  const changelog = new ChangelogService(VERIFIED_CHANGELOG_ENTRIES);

  await unoCommands.initialize();
  const permissionPolicy = Object.freeze({ applicationUrl: APP_ENTRY_URL, developmentUrl: validatedDevelopmentUrl() });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl ?? webContents?.getURL?.() ?? '';
    callback(isAllowedApplicationPermission(permission, requestingUrl, permissionPolicy));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const requestingUrl = details?.requestingUrl ?? requestingOrigin ?? webContents?.getURL?.() ?? '';
    return isAllowedApplicationPermission(permission, requestingUrl, permissionPolicy);
  });
  const created = createWindow();
  mainWindow = created.window;
  removeIpcHandlers = registerIpcHandlers({
    ipcMain,
    dialog,
    getMainWindow: () => mainWindow,
    getWindowForEvent: (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      return window && appWindows.has(window) ? window : null;
    },
    isTrustedSender: (event, window) => {
      const policy = windowPolicies.get(window.webContents);
      const senderFrame = event.senderFrame;
      return Boolean(
        policy &&
        senderFrame &&
        senderFrame === window.webContents.mainFrame &&
        isTrustedApplicationUrl(senderFrame.url, policy) &&
        isTrustedApplicationUrl(window.webContents.getURL(), policy)
      );
    },
    openAppWindow: openNewAppWindow,
    localHistoryAvailable: () => state.isHistoryAvailable(),
    appVersion: app.getVersion(),
    services: {
      state,
      libreOffice,
      unoCommands,
      externalEditors,
      dataFiles,
      windowsSettings,
      notifications,
      documents,
      customWord,
      changelog
    }
  });
  await loadWindow(created.window, created.developmentUrl);
  if (smokeMode) {
    await runRendererSmoke(created.window);
    created.window.destroy();
    await fs.rm(smokeUserDataPath, { recursive: true, force: true }).catch(() => undefined);
    app.exit(0);
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady()
    .then(startApplication)
    .catch((error) => {
      console.error('[material-office] startup failed', smokeMode ? (error?.stack ?? error) : (error?.code ?? error?.name ?? 'UNKNOWN_ERROR'));
      if (smokeMode) app.exit(1);
      else app.quit();
    });
}

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0 && process.platform === 'win32') {
    const created = createWindow();
    mainWindow = created.window;
    await loadWindow(created.window, created.developmentUrl);
  }
});

// Keep persistence and close-coordination IPC alive while BrowserWindows run
// their beforeunload handshake. Electron emits will-quit only after every
// window has accepted closure, so teardown cannot strand a renderer mid-save.
app.on('will-quit', () => {
  removeIpcHandlers?.();
  removeIpcHandlers = null;
  removeWorkspaceChangeListener?.();
  removeWorkspaceChangeListener = null;
});

app.on('window-all-closed', () => app.quit());
