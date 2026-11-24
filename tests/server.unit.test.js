import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHowardApp } from '../server.js';

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

describe('In-Process Howard Server Unit Optimisations (BACK-1, PERF-3, DEDUP-3)', () => {
  it('hides linkToGpReport events even when assignedTo is Both on partner1 sync', async () => {
    const dataDir = createTempDir('howard-unit-data-');
    const distDir = createTempDir('howard-unit-dist-');
    const app = createHowardApp({ dataDir, distDir, enableTimers: false });

    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const port = app.server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const saveRes = await fetch(`${baseUrl}/api/howard/almanac/events/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upserts: [
            {
              id: 'evt-gp-both',
              title: 'Specialist GP Consultation',
              date: '2026-11-25',
              category: 'medical',
              assignedTo: 'Both',
              linkToGpReport: true
            },
            {
              id: 'evt-public-both',
              title: 'Vet Annual Check',
              date: '2026-11-26',
              category: 'vet',
              assignedTo: 'Both',
              linkToGpReport: false
            }
          ]
        })
      });
      assert.equal(saveRes.status, 200);

      // Partner 1 must NOT receive evt-gp-both
      const p1Res = await fetch(`${baseUrl}/api/howard/sync?profile=partner1`);
      assert.equal(p1Res.status, 200);
      const p1Json = await p1Res.json();
      const p1Ids = p1Json.howard.almanacEvents.map((e) => e.id);
      assert.equal(p1Ids.includes('evt-gp-both'), false);
      assert.equal(p1Ids.includes('evt-public-both'), true);

      // Partner 2 MUST receive evt-gp-both
      const p2Res = await fetch(`${baseUrl}/api/howard/sync?profile=partner2`);
      assert.equal(p2Res.status, 200);
      const p2Json = await p2Res.json();
      const p2Ids = p2Json.howard.almanacEvents.map((e) => e.id);
      assert.equal(p2Ids.includes('evt-gp-both'), true);
      assert.equal(p2Ids.includes('evt-public-both'), true);
    } finally {
      await app.close();
      cleanupTempDir(dataDir);
      cleanupTempDir(distDir);
    }
  });

  it('serves compressed gzip static assets with ETag and 304 Not Modified', async () => {
    const dataDir = createTempDir('howard-unit-static-data-');
    const distDir = createTempDir('howard-unit-static-dist-');
    fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
    const sampleJs = `export const payload = "${'Howard-Asset-Compress-'.repeat(120)}";`;
    fs.writeFileSync(path.join(distDir, 'assets', 'sample.js'), sampleJs, 'utf8');
    fs.writeFileSync(
      path.join(distDir, 'index.html'),
      `<!doctype html><html><body>${'Howard'.repeat(250)}</body></html>`,
      'utf8'
    );

    const app = createHowardApp({ dataDir, distDir, enableTimers: false });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const port = app.server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Request asset raw buffer directly using node:http so we inspect raw gzip bytes
      const { statusCode, headers, rawBody } = await new Promise((resolve, reject) => {
        import('node:http').then(({ default: http }) => {
          const req = http.get(
            `${baseUrl}/assets/sample.js`,
            { headers: { 'Accept-Encoding': 'gzip' } },
            (res) => {
              const chunks = [];
              res.on('data', (c) => chunks.push(c));
              res.on('end', () =>
                resolve({
                  statusCode: res.statusCode,
                  headers: res.headers,
                  rawBody: Buffer.concat(chunks)
                })
              );
            }
          );
          req.on('error', reject);
        });
      });

      assert.equal(statusCode, 200);
      assert.equal(headers['content-encoding'], 'gzip');
      assert.ok(headers.etag, 'Expected strong ETag header');
      assert.match(String(headers['cache-control']), /immutable/);
      assert.equal(zlib.gunzipSync(rawBody).toString('utf8'), sampleJs);

      // Re-request with If-None-Match -> 304 Not Modified
      const res304 = await fetch(`${baseUrl}/assets/sample.js`, {
        headers: { 'If-None-Match': String(headers.etag), 'Accept-Encoding': 'gzip' }
      });
      assert.equal(res304.status, 304);
    } finally {
      await app.close();
      cleanupTempDir(dataDir);
      cleanupTempDir(distDir);
    }
  });
});
