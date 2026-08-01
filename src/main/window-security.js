export function resolveDevelopmentUrl(candidate, options = {}) {
  if (options.isPackaged === true || options.enabled !== true || typeof candidate !== 'string') {
    return null;
  }
  try {
    const parsed = new URL(candidate);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    return (loopback && ['http:', 'https:'].includes(parsed.protocol)) ? parsed.href : null;
  } catch {
    return null;
  }
}

export function isTrustedApplicationUrl(targetUrl, options) {
  if (typeof targetUrl !== 'string' || !targetUrl) return false;
  if (options.developmentUrl) {
    try {
      return new URL(targetUrl).origin === new URL(options.developmentUrl).origin;
    } catch {
      return false;
    }
  }
  try {
    const parsed = new URL(targetUrl);
    const application = new URL(options.applicationUrl);
    return (
      parsed.protocol === application.protocol &&
      parsed.hostname === application.hostname &&
      parsed.port === application.port &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.pathname === application.pathname &&
      parsed.search === ''
    );
  } catch {
    return false;
  }
}

export function isTrustedApplicationOrigin(targetUrl, options) {
  if (typeof targetUrl !== 'string' || !targetUrl) return false;
  try {
    const parsed = new URL(targetUrl);
    const expected = new URL(options.developmentUrl ?? options.applicationUrl);
    return parsed.protocol === expected.protocol
      && parsed.hostname === expected.hostname
      && parsed.port === expected.port
      && parsed.username === ''
      && parsed.password === '';
  } catch {
    return false;
  }
}

export function isAllowedApplicationPermission(permission, targetUrl, options) {
  return permission === 'local-fonts' && isTrustedApplicationOrigin(targetUrl, options);
}

function navigationDetails(event, legacyUrl, legacyIsMainFrame) {
  return {
    url: typeof event?.url === 'string' ? event.url : legacyUrl,
    isMainFrame: typeof event?.isMainFrame === 'boolean'
      ? event.isMainFrame
      : legacyIsMainFrame
  };
}

export function installNavigationGuards(webContents, isTrustedUrl, onViolation) {
  const guard = (event, legacyUrl, _isInPlace, legacyIsMainFrame) => {
    const details = navigationDetails(event, legacyUrl, legacyIsMainFrame);
    if (details.isMainFrame !== true || !isTrustedUrl(details.url)) event.preventDefault();
  };
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-attach-webview', (event) => event.preventDefault());
  webContents.on('will-navigate', guard);
  webContents.on('will-redirect', guard);
  webContents.on('will-frame-navigate', guard);
  webContents.on('did-navigate', (event, legacyUrl) => {
    const targetUrl = typeof event?.url === 'string' ? event.url : legacyUrl;
    if (!isTrustedUrl(targetUrl)) onViolation();
  });
}
