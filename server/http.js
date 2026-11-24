import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { VALID_DATE_KEY_RE } from '../shared/dateUtils.js';
import { isPlainObject } from './utils.js';
import { handleHowardRoutes } from './domains/howard.js';
import { handleCadenceRoutes } from './domains/cadence.js';
import { handleFloodgateRoutes } from './domains/floodgate.js';
import { handleBloomRoutes } from './domains/bloom.js';

const MAX_JSON_BODY_BYTES = 1024 * 5120;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const COMPRESSIBLE_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.svg'
]);

const STATIC_ASSET_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.css',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.map'
]);

export function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const rawBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const wantsGzip =
    rawBuf.length >= 1024 && /\bgzip\b/i.test(String(res.__acceptEncoding || ''));
  if (wantsGzip) {
    const gzBuf = zlib.gzipSync(rawBuf);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Content-Encoding': 'gzip',
      Vary: 'Accept-Encoding',
      'Content-Length': gzBuf.length,
      ...extraHeaders
    });
    res.end(gzBuf);
    return;
  }
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Vary: 'Accept-Encoding',
    'Content-Length': rawBuf.length,
    ...extraHeaders
  });
  res.end(rawBuf);
}

export function safeDecodeUriSegment(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export function parseJsonBody(req, { allowArray = false } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let tooLarge = false;

    req.on('data', (chunk) => {
      if (tooLarge) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > MAX_JSON_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        const err = new Error('Payload too large');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      if (tooLarge) return;
      if (chunks.length === 0) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const err = new Error('Invalid JSON payload');
        err.statusCode = 400;
        reject(err);
        return;
      }
      const valid = allowArray
        ? isPlainObject(parsed) || Array.isArray(parsed)
        : isPlainObject(parsed);
      if (!valid) {
        const err = new Error('Invalid JSON object payload');
        err.statusCode = 400;
        reject(err);
        return;
      }
      resolve(parsed);
    });

    req.on('error', (err) => {
      if (!tooLarge) reject(err);
    });
  });
}

export function createHttpServer({ dbCtx, cache, distDir }) {
  const staticAssetCache = new Map();

  const helpers = {
    sendJson,
    parseJsonBody,
    getCallerProfile(req, parsedUrl) {
      return String(
        parsedUrl.searchParams.get('profile') || req.headers['x-howard-profile'] || 'caregiver'
      );
    },
    parseRequiredSegment(pathname, prefix) {
      const seg = safeDecodeUriSegment(pathname.slice(prefix.length));
      return seg ? seg : null;
    },
    parseDateKeySegment(pathname, prefix) {
      const seg = safeDecodeUriSegment(pathname.slice(prefix.length));
      if (!seg || !VALID_DATE_KEY_RE.test(seg)) return null;
      return seg;
    }
  };

  async function tryStatFile(filePath) {
    try {
      const st = await fs.promises.stat(filePath);
      return st.isFile() ? st : null;
    } catch {
      return null;
    }
  }

  async function serveStaticFile(req, res, filePath, preStat, isImmutableAsset, isHead) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isHtml = ext === '.html';
    const cacheControl = isHtml
      ? 'no-cache'
      : isImmutableAsset
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600';
    const etag = `"${preStat.size.toString(16)}-${Math.trunc(preStat.mtimeMs).toString(16)}"`;

    const ifNoneMatch = String(req.headers['if-none-match'] || '').trim();
    if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === '*')) {
      res.writeHead(304, {
        ETag: etag,
        'Cache-Control': cacheControl,
        Vary: 'Accept-Encoding'
      });
      res.end();
      return;
    }

    let cached = staticAssetCache.get(filePath);
    if (!cached || cached.etag !== etag) {
      let rawBuf;
      try {
        rawBuf = await fs.promises.readFile(filePath);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(isHead ? undefined : 'Not found');
        return;
      }
      const gzBuf =
        COMPRESSIBLE_EXTENSIONS.has(ext) && rawBuf.length >= 1024
          ? zlib.gzipSync(rawBuf)
          : null;
      cached = { etag, rawBuf, gzBuf };
      if (staticAssetCache.size > 200) {
        staticAssetCache.clear();
      }
      staticAssetCache.set(filePath, cached);
    }

    const wantsGzip =
      Boolean(cached.gzBuf) && /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''));
    const body = wantsGzip ? cached.gzBuf : cached.rawBuf;
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      ETag: etag,
      Vary: 'Accept-Encoding',
      'Content-Length': body.length
    };
    if (wantsGzip) {
      headers['Content-Encoding'] = 'gzip';
    }

    res.writeHead(200, headers);
    res.end(isHead ? undefined : body);
  }

  return http.createServer(async (req, res) => {
    try {
      res.__acceptEncoding = String(req.headers['accept-encoding'] || '');
      let parsedUrl;
      try {
        parsedUrl = new URL(req.url || '/', 'http://localhost');
      } catch {
        return sendJson(res, 400, { error: 'Invalid request URL' });
      }
      const { pathname } = parsedUrl;

      if (pathname.startsWith('/api/')) {
        const ctx = { req, res, pathname, parsedUrl, dbCtx, cache, helpers };
        if (await handleHowardRoutes(ctx)) return;
        if (await handleCadenceRoutes(ctx)) return;
        if (await handleFloodgateRoutes(ctx)) return;
        if (await handleBloomRoutes(ctx)) return;
        return sendJson(res, 404, { error: 'API endpoint not found' });
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, {
          'Content-Type': 'text/plain; charset=utf-8',
          Allow: 'GET, HEAD'
        });
        res.end('Method not allowed');
        return;
      }

      const isHead = req.method === 'HEAD';
      const decodedPathname = safeDecodeUriSegment(pathname);
      if (decodedPathname === null) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(isHead ? undefined : 'Bad request');
        return;
      }
      const safeRelativePath = path
        .normalize(decodedPathname)
        .replace(/^(\.\.(\/|\\|$))+/, '')
        .replace(/^[/\\]+/, '');
      const candidatePath = path.join(distDir, safeRelativePath);

      if (decodedPathname !== '/' && candidatePath.startsWith(distDir + path.sep)) {
        const candidateStat = await tryStatFile(candidatePath);
        if (candidateStat) {
          const isImmutableAsset = decodedPathname.startsWith('/assets/');
          return await serveStaticFile(req, res, candidatePath, candidateStat, isImmutableAsset, isHead);
        }
      }

      const reqExt = path.extname(decodedPathname).toLowerCase();
      if (decodedPathname.startsWith('/assets/') || STATIC_ASSET_EXTENSIONS.has(reqExt)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(isHead ? undefined : 'Not found');
        return;
      }

      const indexHtmlPath = path.join(distDir, 'index.html');
      const indexStat = await tryStatFile(indexHtmlPath);
      if (indexStat) {
        return await serveStaticFile(req, res, indexHtmlPath, indexStat, false, isHead);
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(isHead ? undefined : 'Frontend build not found. Run "npm run build" first.');
    } catch (err) {
      if (err && err.statusCode) {
        if (!res.headersSent) {
          const extraHeaders = err.statusCode === 413 ? { Connection: 'close' } : {};
          sendJson(res, err.statusCode, { error: err.message }, extraHeaders);
        }
        return;
      }
      console.error('Server error:', err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Internal server error' });
      }
    }
  });
}
