import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHowardApp } from '../server.js';
import { purgeExpiredTrashedNotes } from '../server/domains/quill.js';
import {
  applyMarkdownFormat,
  computeMovedPosition,
  convertChecklistItemsToText,
  convertTextToChecklistItems,
  parseMarkdownLite
} from '../src/apps/quill/quillHelpers.js';

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

async function startInProcessApp() {
  const dataDir = createTempDir('howard-quill-data-');
  const distDir = createTempDir('howard-quill-dist-');
  const app = createHowardApp({ dataDir, distDir, enableTimers: false });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  return {
    app,
    baseUrl: `http://127.0.0.1:${port}`,
    cleanup: async () => {
      await app.close();
      cleanupTempDir(dataDir);
      cleanupTempDir(distDir);
    }
  };
}

describe('Quill Pure Helpers & Markdown-lite', () => {
  it('parses headings, lists, inline formatting, and safe links while keeping HTML/javascript: inert', () => {
    const sample = [
      '# House Guide',
      'Bring **oats** and *milk* or ~~sugar~~ using `code`.',
      '- [Safe](https://example.com)',
      '- [Bad](javascript:alert(1))',
      '<script>alert(1)</script>'
    ].join('\n');

    const blocks = parseMarkdownLite(sample);
    assert.equal(blocks[0].type, 'heading');
    assert.equal(blocks[0].level, 1);
    assert.equal(blocks[1].type, 'paragraph');
    assert.ok(blocks[1].inlines.some((t) => t.type === 'bold' && t.value === 'oats'));
    assert.ok(blocks[1].inlines.some((t) => t.type === 'italic' && t.value === 'milk'));
    assert.ok(blocks[1].inlines.some((t) => t.type === 'strike' && t.value === 'sugar'));
    assert.ok(blocks[1].inlines.some((t) => t.type === 'code' && t.value === 'code'));

    assert.equal(blocks[2].type, 'ul');
    assert.equal(blocks[2].items[0][0].type, 'link');
    assert.equal(blocks[2].items[0][0].href, 'https://example.com');
    assert.equal(blocks[2].items[1][0].type, 'text');
    assert.equal(blocks[3].type, 'paragraph');
    assert.equal(blocks[3].inlines[0].type, 'text');
    assert.equal(blocks[3].inlines[0].value, '<script>alert(1)</script>');
  });

  it('computes fractional moved positions and converts between text and checklists', () => {
    const notes = [{ position: 1000 }, { position: 2000 }, { position: 3000 }];
    assert.equal(computeMovedPosition(notes, 0), 0);
    assert.equal(computeMovedPosition(notes, 1), 1500);
    assert.equal(computeMovedPosition(notes, 3), 4000);

    const items = convertTextToChecklistItems('- Milk\nEggs\n');
    assert.equal(items.length, 2);
    assert.equal(items[0].text, 'Milk');
    assert.equal(items[1].text, 'Eggs');
    assert.equal(convertChecklistItemsToText(items), 'Milk\nEggs');

    const formatted = applyMarkdownFormat('hello world', 6, 11, 'bold');
    assert.equal(formatted.text, 'hello **world**');
  });
});

describe('Quill Server Domain, Privacy, Concurrency & Backup', () => {
  it('enforces quill_notes table safety, profile projection privacy, and caregiver item ticking', async (t) => {
    const ctx = await startInProcessApp();
    t.after(ctx.cleanup);

    // Table exists and survived v3 DROP TABLE IF EXISTS notes
    const tbl = ctx.app.dbCtx.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'quill_notes'")
      .get();
    assert.equal(tbl?.name, 'quill_notes');

    // Partner 1 creates a shared house note (checklist) and a private note
    const r1 = await fetch(`${ctx.baseUrl}/api/quill/notes/n-shared-1?profile=partner1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note: {
          type: 'checklist',
          title: 'Sitter Tasks',
          items: [{ id: 'it-1', text: 'Feed cat', checked: false }],
          visibility: 'shared',
          caregiverVisible: true,
          color: 'mint',
          pinned: true
        }
      })
    });
    assert.equal(r1.status, 200);

    const r2 = await fetch(`${ctx.baseUrl}/api/quill/notes/n-p2-priv?profile=partner2`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note: {
          type: 'text',
          title: 'Partner 2 Secret Gift',
          body: 'Watch',
          visibility: 'private'
        }
      })
    });
    assert.equal(r2.status, 200);

    // Partner 1 sync must NOT include Partner 2's private note
    const p1Sync = await (await fetch(`${ctx.baseUrl}/api/howard/sync?profile=partner1`)).json();
    assert.equal(p1Sync.quill.notes.some((n) => n.id === 'n-p2-priv'), false);
    assert.equal(p1Sync.quill.notes.some((n) => n.id === 'n-shared-1'), true);

    // Partner 1 direct access to Partner 2 private note returns 404 (not 403)
    const p1AccessP2 = await fetch(`${ctx.baseUrl}/api/quill/notes/n-p2-priv?profile=partner1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: true })
    });
    assert.equal(p1AccessP2.status, 404);

    // Caregiver sees only caregiverVisible shared notes, cannot edit note, CAN tick checklist item
    const cgSync = await (await fetch(`${ctx.baseUrl}/api/howard/sync?profile=caregiver`)).json();
    assert.equal(cgSync.quill.notes.length, 1);
    assert.equal(cgSync.quill.notes[0].id, 'n-shared-1');

    const cgEdit = await fetch(`${ctx.baseUrl}/api/quill/notes/n-shared-1?profile=caregiver`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hacked' })
    });
    assert.equal(cgEdit.status, 403);

    const cgTick = await fetch(
      `${ctx.baseUrl}/api/quill/notes/n-shared-1/items/it-1?profile=caregiver`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked: true })
      }
    );
    assert.equal(cgTick.status, 200);
    const cgTickJson = await cgTick.json();
    assert.equal(cgTickJson.note.items[0].checked, true);
  });

  it('handles 409 optimistic concurrency, reorder renormalisation, validation limits, and trash purge', async (t) => {
    const ctx = await startInProcessApp();
    t.after(ctx.cleanup);

    // Create note rev 1
    const c1 = await fetch(`${ctx.baseUrl}/api/quill/notes/n-conc?profile=partner1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: { title: 'V1', body: 'Hello', visibility: 'shared' } })
    });
    assert.equal(c1.status, 200);

    // Partner 2 saves with baseRevision 1 -> rev 2
    const c2 = await fetch(`${ctx.baseUrl}/api/quill/notes/n-conc?profile=partner2`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 1,
        note: { title: 'V2', body: 'Partner 2 edit', visibility: 'shared' }
      })
    });
    assert.equal(c2.status, 200);

    // Partner 1 saves with stale baseRevision 1 -> 409
    const c3 = await fetch(`${ctx.baseUrl}/api/quill/notes/n-conc?profile=partner1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 1,
        note: { title: 'V1b', body: 'Stale', visibility: 'shared' }
      })
    });
    assert.equal(c3.status, 409);
    const c3Json = await c3.json();
    assert.equal(c3Json.note.revision, 2);

    // Validation limit rejection
    const tooLong = await fetch(`${ctx.baseUrl}/api/quill/notes/n-bad?profile=partner1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: { title: 'x'.repeat(205), visibility: 'shared' } })
    });
    assert.equal(tooLong.status, 400);

    // Reorder & renormalisation when gap < 1e-6
    await fetch(`${ctx.baseUrl}/api/quill/notes/n-r1?profile=partner1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: { title: 'R1', position: 1000, visibility: 'shared' } })
    });
    const reorderRes = await fetch(`${ctx.baseUrl}/api/quill/notes/reorder?profile=partner1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moves: [{ id: 'n-conc', position: 1000 + 1e-8, pinned: false }] })
    });
    assert.equal(reorderRes.status, 200);
    const reorderJson = await reorderRes.json();
    const r1Note = reorderJson.notes.find((n) => n.id === 'n-r1');
    const concNote = reorderJson.notes.find((n) => n.id === 'n-conc');
    assert.equal(Math.abs(concNote.position - r1Note.position), 1000);

    // Cannot DELETE active note; must trash first
    const badDel = await fetch(`${ctx.baseUrl}/api/quill/notes/n-r1?profile=partner1`, {
      method: 'DELETE'
    });
    assert.equal(badDel.status, 400);

    // Trash note & test 7-day purge
    await fetch(`${ctx.baseUrl}/api/quill/notes/n-r1?profile=partner1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'trashed' })
    });
    assert.equal(purgeExpiredTrashedNotes(ctx.app.dbCtx, ctx.app.cache, Date.now()), 0);
    const eightDaysLater = Date.now() + 8 * 24 * 60 * 60 * 1000;
    assert.equal(purgeExpiredTrashedNotes(ctx.app.dbCtx, ctx.app.cache, eightDaysLater), 1);
  });

  it('supports 5-segment sync tokens, legacy 4-segment fallback, and backup/restore round-trip', async (t) => {
    const ctx = await startInProcessApp();
    t.after(ctx.cleanup);

    await fetch(`${ctx.baseUrl}/api/quill/notes/n-bk?profile=partner1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note: { title: 'Backup Note', body: 'Keep me', labels: ['house'], visibility: 'shared' }
      })
    });

    const fullSync = await (await fetch(`${ctx.baseUrl}/api/howard/sync?profile=partner1`)).json();
    assert.equal(fullSync.syncToken.split(':')[2].split('.').length, 5);
    assert.equal(fullSync.changedDomains.includes('quill'), true);

    const unchanged = await (
      await fetch(
        `${ctx.baseUrl}/api/howard/sync?profile=partner1&since=${encodeURIComponent(fullSync.syncToken)}`
      )
    ).json();
    assert.equal(unchanged.unchanged, true);

    // Legacy 4-segment token falls back to full sync cleanly
    const parts = fullSync.syncToken.split(':');
    const legacyToken = `${parts[0]}:${parts[1]}:1.1.1.0`;
    const fallbackSync = await (
      await fetch(
        `${ctx.baseUrl}/api/howard/sync?profile=partner1&since=${encodeURIComponent(legacyToken)}`
      )
    ).json();
    assert.equal(fallbackSync.unchanged, false);
    assert.ok(fallbackSync.quill);

    // Backup export & restore
    const backup = await (await fetch(`${ctx.baseUrl}/api/howard/backup?profile=partner1`)).json();
    assert.equal(backup.quill.notes.some((n) => n.id === 'n-bk'), true);
    assert.equal(backup.quill.settings.labels.includes('house'), true);

    await fetch(`${ctx.baseUrl}/api/quill/notes/n-bk?profile=partner1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'trashed' })
    });
    await fetch(`${ctx.baseUrl}/api/quill/trash/empty?profile=partner1`, { method: 'POST' });

    const restoreRes = await fetch(`${ctx.baseUrl}/api/howard/restore?profile=partner1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'replace', quill: backup.quill })
    });
    assert.equal(restoreRes.status, 200);

    const afterRestore = await (
      await fetch(`${ctx.baseUrl}/api/howard/sync?profile=partner1`)
    ).json();
    assert.equal(afterRestore.quill.notes.some((n) => n.id === 'n-bk'), true);
  });

  it('migrates v5 database to v6, propagates profile renames, and supports labels, PATCH conversions, and merge restore', async (t) => {
    const dataDir = createTempDir('howard-quill-v5-data-');
    const distDir = createTempDir('howard-quill-v5-dist-');

    // Seed a realistic v5 database without quill_notes, quill_settings, or 'quill' in allowedApps
    const db = new DatabaseSync(path.join(dataDir, 'howard.db'));
    db.exec(`
      CREATE TABLE howard_store (key TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), updated_at TEXT NOT NULL);
      CREATE TABLE almanac_events (id TEXT PRIMARY KEY, date_key TEXT NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)), updated_at TEXT NOT NULL);
      CREATE TABLE ledger_items (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('expense', 'recurring', 'income')), data TEXT NOT NULL CHECK (json_valid(data)), updated_at TEXT NOT NULL);
      CREATE TABLE cadence_logs (date_key TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), updated_at TEXT NOT NULL);
      CREATE TABLE bloom_care_logs (date_key TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), updated_at TEXT NOT NULL);
      CREATE TABLE bloom_molt_logs (id TEXT PRIMARY KEY, date_key TEXT NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)), updated_at TEXT NOT NULL);
      CREATE TABLE bloom_feeder_cultures (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), updated_at TEXT NOT NULL);
      CREATE TABLE floodgate_logs (date_key TEXT PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)), updated_at TEXT NOT NULL);
      PRAGMA user_version = 5;
    `);
    db.prepare('INSERT INTO howard_store (key, data, updated_at) VALUES (?, ?, ?)').run(
      'profiles',
      JSON.stringify([
        { id: 'partner1', name: 'Partner 1', allowedApps: ['foyer', 'cadence', 'bloom', 'almanac', 'ledger', 'beacon'] },
        { id: 'partner2', name: 'Partner 2', allowedApps: ['foyer', 'cadence', 'bloom', 'almanac', 'floodgate', 'ledger', 'beacon'] },
        { id: 'caregiver', name: 'Caregiver', allowedApps: ['foyer', 'cadence', 'bloom', 'beacon'] }
      ]),
      '2026-11-24T12:00:00.000Z'
    );
    db.close();

    const app = createHowardApp({ dataDir, distDir, enableTimers: false });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
    t.after(async () => {
      await app.close();
      cleanupTempDir(dataDir);
      cleanupTempDir(distDir);
    });

    // Verify v6 upgrade
    const health = await (await fetch(`${baseUrl}/api/health`)).json();
    assert.equal(health.schemaVersion, 6);

    const initSync = await (await fetch(`${baseUrl}/api/howard/sync?profile=partner1`)).json();
    for (const pid of ['partner1', 'partner2', 'caregiver']) {
      const prof = initSync.howard.profiles.find((p) => p.id === pid);
      assert.equal(prof.allowedApps.includes('quill'), true);
    }

    // Create shared note by Partner 2, then Partner 1 ticks/edits and flips to private
    await fetch(`${baseUrl}/api/quill/notes/n-flip?profile=partner2`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note: {
          type: 'text',
          title: 'Old Title',
          body: '- Milk\n- Bread',
          labels: ['groceries'],
          visibility: 'shared',
          caregiverVisible: false
        }
      })
    });

    // Caregiver gets 404 on non-caregiverVisible note item tick & 405 on GET /api/quill/notes/n-flip
    const cgHiddenRes = await fetch(
      `${baseUrl}/api/quill/notes/n-flip/items/missing?profile=caregiver`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checked: true }) }
    );
    assert.equal(cgHiddenRes.status, 404);
    const badMethod = await fetch(`${baseUrl}/api/quill/notes/n-flip?profile=caregiver`);
    assert.equal(badMethod.status, 405);

    // PATCH title + convert text -> checklist
    const patchConv = await fetch(`${baseUrl}/api/quill/notes/n-flip?profile=partner1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Groceries', type: 'checklist' })
    });
    assert.equal(patchConv.status, 200);
    const convJson = await patchConv.json();
    assert.equal(convJson.note.title, 'Groceries');
    assert.equal(convJson.note.type, 'checklist');
    assert.equal(convJson.note.body, '');
    assert.equal(convJson.note.items.length, 2);
    assert.equal(convJson.note.items[0].text, 'Milk');

    // Rename Partner 1 -> Ethan and verify DB-ARCH-2 live propagation on Quill notes
    await fetch(`${baseUrl}/api/howard/profiles/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'partner1', name: 'Ethan' })
    });
    const renamedSync = await (await fetch(`${baseUrl}/api/howard/sync?profile=partner1`)).json();
    const flippedNote = renamedSync.quill.notes.find((n) => n.id === 'n-flip');
    assert.equal(flippedNote.updatedBy, 'Ethan');
    assert.equal(flippedNote.ownerName, 'Partner 2');

    // Partner 1 flips shared note -> private; ownership moves to partner1
    const flipRes = await fetch(`${baseUrl}/api/quill/notes/n-flip?profile=partner1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'private' })
    });
    assert.equal(flipRes.status, 200);
    const flipJson = await flipRes.json();
    assert.equal(flipJson.note.visibility, 'private');
    assert.equal(flipJson.note.ownerProfileId, 'partner1');

    // Labels API: rename across notes (including private notes) & delete
    const lblRename = await fetch(`${baseUrl}/api/quill/labels?profile=partner2`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rename: { from: 'groceries', to: 'food' } })
    });
    assert.equal(lblRename.status, 200);
    assert.equal((await lblRename.json()).labels.includes('food'), true);

    const afterRenameSync = await (await fetch(`${baseUrl}/api/howard/sync?profile=partner1`)).json();
    assert.deepEqual(afterRenameSync.quill.notes.find((n) => n.id === 'n-flip').labels, ['food']);

    // Backup merge preserves createdByProfileId/updatedByProfileId attribution
    const mergeRes = await fetch(`${baseUrl}/api/howard/restore?profile=partner1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'merge',
        quill: {
          notes: [
            {
              id: 'n-merged',
              type: 'text',
              title: 'Merged Note',
              body: 'From backup',
              labels: ['merged-tag'],
              visibility: 'shared',
              ownerProfileId: 'partner1',
              createdByProfileId: 'partner2',
              updatedByProfileId: 'caregiver',
              updatedAt: '2026-11-25T10:00:00.000Z'
            }
          ]
        }
      })
    });
    assert.equal(mergeRes.status, 200);
    const afterMerge = await (await fetch(`${baseUrl}/api/howard/sync?profile=partner1`)).json();
    const mergedNote = afterMerge.quill.notes.find((n) => n.id === 'n-merged');
    assert.equal(mergedNote.createdByProfileId, 'partner2');
    assert.equal(mergedNote.updatedByProfileId, 'caregiver');
    assert.equal(afterMerge.quill.labels.includes('merged-tag'), true);
  });
});
