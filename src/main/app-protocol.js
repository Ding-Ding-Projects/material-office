import path from 'node:path';
import { AppError } from './errors.js';

export const APP_PROTOCOL_SCHEME = 'material-office';
export const APP_PROTOCOL_HOST = 'app';
export const APP_ENTRY_URL = `${APP_PROTOCOL_SCHEME}://${APP_PROTOCOL_HOST}/index.html`;
export const APP_PROTOCOL_REGISTRATION = Object.freeze({
  scheme: APP_PROTOCOL_SCHEME,
  privileges: Object.freeze({
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    codeCache: true
  })
});

export const APP_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'"
].join('; ');

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png'
});

const MAX_PROTOCOL_ASSET_BYTES = 16 * 1024 * 1024;

function rawPathHasTraversal(rawUrl) {
  const authority = `${APP_PROTOCOL_SCHEME}://${APP_PROTOCOL_HOST}`;
  if (!rawUrl.toLowerCase().startsWith(authority)) return true;
  const rawPath = rawUrl.slice(authority.length).split(/[?#]/, 1)[0];
  for (const rawSegment of rawPath.split('/')) {
    let segment = rawSegment;
    try {
      segment = decodeURIComponent(segment);
    } catch {
      return true;
    }
    if (segment === '.' || segment === '..' || /[\\/\0]/.test(segment)) return true;
  }
  return false;
}

function isAllowedRoute(relativePath) {
  if (['index.html', 'styles.css', 'app.mjs'].includes(relativePath)) return true;
  if (/^(?:core|ui)\/[a-z0-9-]+\.mjs$/i.test(relativePath)) return true;
  if (/^workers\/[a-z0-9-]+\.worker\.mjs$/i.test(relativePath)) return true;
  if (relativePath === 'assets/data/features.json') return true;
  if (/^assets\/legal\/(?:LICENSE\.txt|THIRD_PARTY_NOTICES\.md|classic-har-gow-provenance\.json)$/i.test(relativePath)) return true;
  return /^assets\/dim-sum\/[a-z0-9-]+\.png$/i.test(relativePath);
}

export function resolveRendererAsset(rawUrl, rendererRoot) {
  if (typeof rawUrl !== 'string' || typeof rendererRoot !== 'string' || !path.isAbsolute(rendererRoot)) {
    return null;
  }
  if (rawPathHasTraversal(rawUrl)) return null;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== `${APP_PROTOCOL_SCHEME}:` ||
    parsed.hostname !== APP_PROTOCOL_HOST ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.search
  ) return null;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  const relativePath = decodedPath === '/'
    ? 'index.html'
    : decodedPath.replace(/^\/+/, '');
  if (!relativePath || !isAllowedRoute(relativePath)) return null;
  const root = path.resolve(rendererRoot);
  const filePath = path.resolve(root, ...relativePath.split('/'));
  if (!filePath.startsWith(`${root}${path.sep}`)) return null;
  const mimeType = MIME_TYPES[path.extname(filePath).toLowerCase()];
  if (!mimeType) return null;
  return Object.freeze({ filePath, mimeType, relativePath });
}

function fileVersion(stat) {
  const fields = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'];
  if (fields.some((field) => !['bigint', 'number'].includes(typeof stat[field]))) return null;
  return fields.map((field) => String(stat[field])).join(':');
}

async function readBoundedAsset(fileSystem, filePath) {
  let handle;
  try {
    handle = await fileSystem.open(filePath, 'r');
    const initialStat = await handle.stat({ bigint: true });
    const initialVersion = fileVersion(initialStat);
    if (!initialStat.isFile() || !initialVersion || initialStat.size > BigInt(MAX_PROTOCOL_ASSET_BYTES)) {
      throw new AppError('APP_ASSET_INVALID', 'The application asset is unavailable.');
    }
    const expectedBytes = Number(initialStat.size);
    const buffer = Buffer.alloc(expectedBytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const finalStat = await handle.stat({ bigint: true });
    if (fileVersion(finalStat) !== initialVersion || offset !== expectedBytes) {
      throw new AppError('APP_ASSET_CHANGED', 'The application asset changed while it was being read.');
    }
    return buffer.subarray(0, offset);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function protocolResponse(status, body = null, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Security-Policy': APP_CONTENT_SECURITY_POLICY,
      'Permissions-Policy': 'local-fonts=(self)',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

export function createAppProtocolHandler(options) {
  const rendererRoot = path.resolve(options.rendererRoot);
  const fileSystem = options.fs;
  return async (request) => {
    if (!request || !['GET', 'HEAD'].includes(request.method)) {
      return protocolResponse(405, null, { Allow: 'GET, HEAD' });
    }
    const asset = resolveRendererAsset(request.url, rendererRoot);
    if (!asset) return protocolResponse(404);
    try {
      const content = await readBoundedAsset(fileSystem, asset.filePath);
      return protocolResponse(
        200,
        request.method === 'HEAD' ? null : content,
        {
          'Content-Type': asset.mimeType,
          'Content-Length': String(content.length)
        }
      );
    } catch {
      return protocolResponse(404);
    }
  };
}
