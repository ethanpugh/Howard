import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHowardApp } from '../server.ts';
import { isValidDateKey } from '../shared/dateUtils.ts';

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(dirPath: string): void {
  fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

describe('In-Process Howard Server Unit Optimisations (BACK-1, PERF-3, DEDUP-3)', () => {
  it('hides linkToGpReport events even when assignedTo is Both on partner1 sync', async () => {
    const dataDir = createTempDir('howard-unit-data-');
    const distDir = createTempDir('howard-unit-dist-');
    const app = createHowardApp({ dataDir, distDir, enableTimers: false });

    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const saveRes = await fetch(`${baseUrl}/api/howard/almanac/events/batch?profile=partner2`, {
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
      const p1Json = (await p1Res.json()) as {
        howard: { almanacEvents: Array<{ id: string }> };
      };
      const p1Ids = p1Json.howard.almanacEvents.map((e) => e.id);
      assert.equal(p1Ids.includes('evt-gp-both'), false);
      assert.equal(p1Ids.includes('evt-public-both'), true);

      // Partner 2 MUST receive evt-gp-both
      const p2Res = await fetch(`${baseUrl}/api/howard/sync?profile=partner2`);
      assert.equal(p2Res.status, 200);
      const p2Json = (await p2Res.json()) as {
        howard: { almanacEvents: Array<{ id: string }> };
      };
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
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Request asset raw buffer directly using node:http so we inspect raw gzip bytes
      const { statusCode, headers, rawBody } = await new Promise<{
        statusCode: number | undefined;
        headers: http.IncomingHttpHeaders;
        rawBody: Buffer;
      }>((resolve, reject) => {
        const req = http.get(
          `${baseUrl}/assets/sample.js`,
          { headers: { 'Accept-Encoding': 'gzip' } },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
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

  it('rejects impossible calendar dates, masks unknown profiles to caregiver, and enforces CSRF + 415 guards', async () => {
    assert.equal(isValidDateKey('2026-02-31'), false);
    assert.equal(isValidDateKey('2025-02-29'), false);
    assert.equal(isValidDateKey('2024-02-29'), true);
    assert.equal(isValidDateKey('2026-04-31'), false);

    const dataDir = createTempDir('howard-unit-sec-data-');
    const distDir = createTempDir('howard-unit-sec-dist-');
    const app = createHowardApp({ dataDir, distDir, enableTimers: false });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Seed shared & Partner 2 private data
      const evtRes = await fetch(`${baseUrl}/api/howard/almanac/events/evt-sec-1?profile=partner1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Household Trash', date: '2026-11-25', category: 'bins' })
      });
      assert.equal(evtRes.status, 200);

      // Unknown ?profile=guest defaults to caregiver projection (no almanac, ledger, floodgate)
      const guestSync = await fetch(`${baseUrl}/api/howard/sync?profile=guest`);
      assert.equal(guestSync.status, 200);
      const guestJson = (await guestSync.json()) as {
        howard: { almanacEvents: unknown[]; ledgerData: { expenses: unknown[] } };
        floodgate: unknown;
      };
      assert.deepEqual(guestJson.howard.almanacEvents, []);
      assert.deepEqual(guestJson.howard.ledgerData.expenses, []);
      assert.equal(guestJson.floodgate, null);

      // Cross-origin Origin header -> 403
      const badOriginRes = await fetch(`${baseUrl}/api/cadence/settings?profile=partner1`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example'
        },
        body: JSON.stringify({ medicationName: 'Hijacked' })
      });
      assert.equal(badOriginRes.status, 403);

      // Sec-Fetch-Site: cross-site -> 403
      const crossSiteRes = await fetch(`${baseUrl}/api/cadence/settings?profile=partner1`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Sec-Fetch-Site': 'cross-site'
        },
        body: JSON.stringify({ medicationName: 'Hijacked' })
      });
      assert.equal(crossSiteRes.status, 403);

      // Non-JSON Content-Type -> 415
      const plainTextRes = await fetch(`${baseUrl}/api/cadence/settings?profile=partner1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: '{"medicationName":"Plain"}'
      });
      assert.equal(plainTextRes.status, 415);
    } finally {
      await app.close();
      cleanupTempDir(dataDir);
      cleanupTempDir(distDir);
    }
  });
});
