import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { createAdaptorServer } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { RuntimeCache } from './cache.ts';
import type { DatabaseContext } from './db.ts';
import { createBloomRoutes } from './domains/bloom.ts';
import { createCadenceRoutes } from './domains/cadence.ts';
import { createFloodgateRoutes } from './domains/floodgate.ts';
import { createHowardRoutes } from './domains/howard.ts';
import { createQuillRoutes } from './domains/quill.ts';
import { isHttpError } from './utils.ts';

const gzipAsync = promisify(zlib.gzip);

const DEFAULT_MAX_JSON_BODY_BYTES = 1024 * 256;
const BULK_MAX_JSON_BODY_BYTES = 1024 * 5120;

const BULK_BODY_PATHS = new Set([
  '/api/howard/restore',
  '/api/howard/almanac',
  '/api/howard/almanac/events/batch',
  '/api/howard/ledger',
  '/api/floodgate/logs/batch'
]);

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ALLOWED_METHODS_TABLE: Array<{ pattern: RegExp; methods: string }> = [
  { pattern: /^\/api\/health$/, methods: 'GET, HEAD' },
  { pattern: /^\/api\/howard\/events$/, methods: 'GET, HEAD' },
  { pattern: /^\/api\/howard\/sync$/, methods: 'GET, HEAD' },
  { pattern: /^\/api\/howard\/profiles\/verify-pin$/, methods: 'POST' },
  { pattern: /^\/api\/howard\/profiles\/pin$/, methods: 'PUT' },
  { pattern: /^\/api\/howard\/profiles\/name$/, methods: 'PUT' },
  { pattern: /^\/api\/howard\/almanac\/events\/batch$/, methods: 'POST' },
  { pattern: /^\/api\/howard\/almanac\/events\/[^/]+$/, methods: 'PUT, DELETE' },
  { pattern: /^\/api\/howard\/almanac$/, methods: 'PUT' },
  { pattern: /^\/api\/howard\/ledger\/settings$/, methods: 'PUT' },
  { pattern: /^\/api\/howard\/ledger\/items\/[^/]+$/, methods: 'PUT, DELETE' },
  { pattern: /^\/api\/howard\/ledger$/, methods: 'PUT' },
  { pattern: /^\/api\/howard\/beacon$/, methods: 'PUT' },
  { pattern: /^\/api\/howard\/backup$/, methods: 'GET, HEAD' },
  { pattern: /^\/api\/howard\/restore$/, methods: 'POST' },
  { pattern: /^\/api\/cadence\/state$/, methods: 'GET, HEAD' },
  { pattern: /^\/api\/cadence\/settings$/, methods: 'PUT' },
  { pattern: /^\/api\/cadence\/logs\/[^/]+$/, methods: 'PUT' },
  { pattern: /^\/api\/floodgate\/state$/, methods: 'GET, HEAD' },
  { pattern: /^\/api\/floodgate\/settings$/, methods: 'PUT' },
  { pattern: /^\/api\/floodgate\/logs\/batch$/, methods: 'POST' },
  { pattern: /^\/api\/floodgate\/logs\/[^/]+$/, methods: 'PUT, DELETE' },
  { pattern: /^\/api\/bloom\/state$/, methods: 'GET, HEAD' },
  { pattern: /^\/api\/bloom\/settings$/, methods: 'PUT' },
  { pattern: /^\/api\/bloom\/logs\/[^/]+$/, methods: 'PUT' },
  { pattern: /^\/api\/bloom\/molts$/, methods: 'POST' },
  { pattern: /^\/api\/bloom\/molts\/[^/]+$/, methods: 'DELETE' },
  { pattern: /^\/api\/bloom\/feeders\/[^/]+$/, methods: 'PUT, DELETE' },
  { pattern: /^\/api\/quill\/notes\/reorder$/, methods: 'POST' },
  { pattern: /^\/api\/quill\/trash\/empty$/, methods: 'POST' },
  { pattern: /^\/api\/quill\/labels$/, methods: 'PUT' },
  { pattern: /^\/api\/quill\/notes\/[^/]+\/items\/[^/]+$/, methods: 'PATCH' },
  { pattern: /^\/api\/quill\/notes\/[^/]+$/, methods: 'PUT, PATCH, DELETE' }
];

const MIME_TYPES: Record<string, string> = {
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

function safeDecodeUriSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

async function tryStatFile(filePath: string): Promise<fs.Stats | null> {
  try {
    const st = await fs.promises.stat(filePath);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}

function isInsideDirectory(rootResolved: string, targetPath: string): boolean {
  const rel = path.relative(rootResolved, path.resolve(targetPath));
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function matchesIfNoneMatch(headerVal: string, etag: string): boolean {
  const raw = headerVal.trim();
  if (!raw) return false;
  if (raw === '*') return true;
  const tokens = raw.split(',').map((t) => t.trim().replace(/^W\//i, ''));
  const normalizedTarget = etag.replace(/^W\//i, '');
  return tokens.includes(normalizedTarget);
}

function isSameOriginApiRequest(c: Context): boolean {
  const secFetchSite = (c.req.header('sec-fetch-site') || '').toLowerCase().trim();
  if (secFetchSite === 'cross-site') {
    return false;
  }
  const origin = c.req.header('origin');
  if (!origin) return true;
  if (origin === 'null') return false;
  const host = (c.req.header('x-forwarded-host') || c.req.header('host') || '').trim();
  if (!host) return false;
  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

interface CachedStaticAsset {
  etag: string;
  rawBuf: Buffer;
  gzBuf: Buffer | null;
}

export function createApiApp({
  dbCtx,
  cache
}: {
  dbCtx: DatabaseContext;
  cache: RuntimeCache;
}) {
  const defaultBodyLimit = bodyLimit({
    maxSize: DEFAULT_MAX_JSON_BODY_BYTES,
    onError: (c) => c.json({ error: 'Payload too large' }, 413)
  });
  const bulkBodyLimit = bodyLimit({
    maxSize: BULK_MAX_JSON_BODY_BYTES,
    onError: (c) => c.json({ error: 'Payload too large' }, 413)
  });

  return new Hono()
    .basePath('/api')
    .use('*', async (c, next) => {
      if (BULK_BODY_PATHS.has(c.req.path)) {
        return bulkBodyLimit(c, next);
      }
      return defaultBodyLimit(c, next);
    })
    .use('*', async (c, next) => {
      await next();
      if (c.req.path === '/api/howard/events') return;
      const contentType = c.res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return;

      c.res.headers.set('Vary', 'Accept-Encoding');

      const acceptEncoding = c.req.header('accept-encoding') || '';
      if (c.req.method === 'HEAD' || !/\bgzip\b/i.test(acceptEncoding)) return;
      if (c.res.headers.get('content-encoding')) return;

      const rawBuf = Buffer.from(await c.res.arrayBuffer());
      if (rawBuf.length < 1024) {
        const headers = new Headers(c.res.headers);
        headers.set('Content-Length', String(rawBuf.length));
        c.res = new Response(rawBuf, {
          status: c.res.status,
          statusText: c.res.statusText,
          headers
        });
        return;
      }

      const gzBuf = await gzipAsync(rawBuf);
      const headers = new Headers(c.res.headers);
      headers.set('Content-Encoding', 'gzip');
      headers.set('Content-Length', String(gzBuf.length));
      c.res = new Response(gzBuf, {
        status: c.res.status,
        statusText: c.res.statusText,
        headers
      });
    })
    .route('/', createHowardRoutes({ dbCtx, cache }))
    .route('/cadence', createCadenceRoutes({ dbCtx, cache }))
    .route('/floodgate', createFloodgateRoutes({ dbCtx, cache }))
    .route('/bloom', createBloomRoutes({ dbCtx, cache }))
    .route('/quill', createQuillRoutes({ dbCtx, cache }));
}

export type AppType = ReturnType<typeof createApiApp>;

export function createHttpServer({
  dbCtx,
  cache,
  distDir
}: {
  dbCtx: DatabaseContext;
  cache: RuntimeCache;
  distDir: string;
}): http.Server {
  const resolvedDistDir = path.resolve(distDir);
  const staticAssetCache = new Map<string, CachedStaticAsset>();

  async function serveStaticFile(
    req: Request,
    filePath: string,
    preStat: fs.Stats,
    isImmutableAsset: boolean,
    isHead: boolean
  ): Promise<Response> {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isHtml = ext === '.html';
    const cacheControl = isHtml
      ? 'no-cache'
      : isImmutableAsset
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600';
    const etag = `"${preStat.size.toString(16)}-${Math.trunc(preStat.mtimeMs).toString(16)}"`;

    const ifNoneMatch = String(req.headers.get('if-none-match') || '').trim();
    if (ifNoneMatch && matchesIfNoneMatch(ifNoneMatch, etag)) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': cacheControl,
          Vary: 'Accept-Encoding'
        }
      });
    }

    let cached = staticAssetCache.get(filePath);
    if (!cached || cached.etag !== etag) {
      let rawBuf: Buffer;
      try {
        rawBuf = await fs.promises.readFile(filePath);
      } catch {
        return new Response(isHead ? null : 'Not found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
      const gzBuf =
        COMPRESSIBLE_EXTENSIONS.has(ext) && rawBuf.length >= 1024
          ? await gzipAsync(rawBuf)
          : null;
      cached = { etag, rawBuf, gzBuf };
      if (staticAssetCache.size > 200) {
        staticAssetCache.clear();
      }
      staticAssetCache.set(filePath, cached);
    }

    const wantsGzip =
      Boolean(cached.gzBuf) && /\bgzip\b/i.test(String(req.headers.get('accept-encoding') || ''));
    const bodyBuf = wantsGzip && cached.gzBuf ? cached.gzBuf : cached.rawBuf;
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      ETag: etag,
      Vary: 'Accept-Encoding',
      'Content-Length': String(bodyBuf.length)
    };
    if (wantsGzip) {
      headers['Content-Encoding'] = 'gzip';
    }

    return new Response(isHead ? null : new Uint8Array(bodyBuf), {
      status: 200,
      headers
    });
  }

  const app = new Hono();

  app.use('*', async (c, next) => {
    await next();
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('X-Frame-Options', 'DENY');
    c.res.headers.set('Referrer-Policy', 'no-referrer');
  });

  app.use('/api/*', async (c, next) => {
    if (MUTATING_METHODS.has(c.req.method) && !isSameOriginApiRequest(c)) {
      const blocked = c.json({ error: 'Cross-origin API mutations are forbidden' }, 403);
      blocked.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return blocked;
    }
    await next();
    if (c.req.path !== '/api/howard/events') {
      c.res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
    return undefined;
  });

  app.onError((err, c) => {
    const statusCode: ContentfulStatusCode =
      err instanceof HTTPException
        ? (err.status as ContentfulStatusCode)
        : err instanceof SyntaxError
          ? 400
          : isHttpError(err)
            ? (err.statusCode as ContentfulStatusCode)
            : 500;
    if (statusCode === 500) {
      console.error('Server error:', err);
    }
    const message =
      statusCode === 500
        ? 'Internal server error'
        : err instanceof SyntaxError
          ? 'Invalid JSON payload'
          : err.message || 'Request error';
    const res = c.json({ error: message }, statusCode);
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res;
  });

  const apiApp = createApiApp({ dbCtx, cache });
  app.route('/', apiApp);

  app.all('/api/*', (c) => {
    const matched = ALLOWED_METHODS_TABLE.find((entry) => entry.pattern.test(c.req.path));
    if (matched) {
      c.header('Allow', matched.methods);
      return c.json({ error: 'Method not allowed' }, 405);
    }
    return c.json({ error: 'API endpoint not found' }, 404);
  });

  app.all('*', async (c) => {
    const method = c.req.method;
    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          Allow: 'GET, HEAD'
        }
      });
    }

    const isHead = method === 'HEAD';
    const decodedPathname = safeDecodeUriSegment(c.req.path);
    if (decodedPathname === null) {
      return new Response(isHead ? null : 'Bad request', {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    const safeRelativePath = path
      .normalize(decodedPathname)
      .replace(/^(\.\.(\/|\\|$))+/, '')
      .replace(/^[/\\]+/, '');
    const candidatePath = path.resolve(resolvedDistDir, safeRelativePath);

    if (decodedPathname !== '/' && isInsideDirectory(resolvedDistDir, candidatePath)) {
      const candidateStat = await tryStatFile(candidatePath);
      if (candidateStat) {
        let realInside = false;
        try {
          const [realDist, realCandidate] = await Promise.all([
            fs.promises.realpath(resolvedDistDir),
            fs.promises.realpath(candidatePath)
          ]);
          realInside = isInsideDirectory(realDist, realCandidate);
        } catch {
          realInside = false;
        }
        if (realInside) {
          const isImmutableAsset = decodedPathname.startsWith('/assets/');
          return serveStaticFile(c.req.raw, candidatePath, candidateStat, isImmutableAsset, isHead);
        }
      }
    }

    const reqExt = path.extname(decodedPathname).toLowerCase();
    if (decodedPathname.startsWith('/assets/') || STATIC_ASSET_EXTENSIONS.has(reqExt)) {
      return new Response(isHead ? null : 'Not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    const indexHtmlPath = path.join(resolvedDistDir, 'index.html');
    const indexStat = await tryStatFile(indexHtmlPath);
    if (indexStat) {
      return serveStaticFile(c.req.raw, indexHtmlPath, indexStat, false, isHead);
    }

    return new Response(isHead ? null : 'Not built yet. Run npm run build first.', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  });

  return createAdaptorServer({
    fetch: app.fetch
  }) as http.Server;
}
