import { DEFAULT_QUILL_SETTINGS } from '../../shared/defaults.js';
import { resolveProfileDisplayName } from '../../shared/profileUtils.js';
import { isPlainObject } from '../utils.js';
import { resolveQuillNote } from './profileResolve.js';

export const VALID_NOTE_TYPES = new Set(['text', 'checklist']);
export const VALID_NOTE_VISIBILITIES = new Set(['shared', 'private']);
export const VALID_NOTE_STATUSES = new Set(['active', 'archived', 'trashed']);
export const VALID_NOTE_COLORS = new Set([
  'default',
  'coral',
  'peach',
  'sand',
  'mint',
  'sage',
  'fog',
  'storm',
  'dusk',
  'blossom',
  'clay',
  'chalk'
]);

export const MAX_TITLE_LEN = 200;
export const MAX_BODY_LEN = 20000;
export const MAX_ITEMS = 200;
export const MAX_ITEM_TEXT_LEN = 500;
export const MAX_LABELS_PER_NOTE = 20;
export const MAX_LABEL_LEN = 32;
export const MAX_HOUSEHOLD_LABELS = 100;
export const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeCallerProfile(rawProfile) {
  return rawProfile === 'partner1' || rawProfile === 'partner2' ? rawProfile : 'caregiver';
}

export function normalizeQuillLabels(rawLabels, maxCount = MAX_LABELS_PER_NOTE) {
  if (!Array.isArray(rawLabels)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of rawLabels) {
    if (typeof entry !== 'string') continue;
    const cleaned = entry.trim().slice(0, MAX_LABEL_LEN);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= maxCount) break;
  }
  return out;
}

export function convertBodyToItems(body = '') {
  return String(body || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_ITEMS)
    .map((text, idx) => ({
      id: `item-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      text: text.slice(0, MAX_ITEM_TEXT_LEN),
      checked: false
    }));
}

export function convertItemsToBody(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item?.text || '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_BODY_LEN);
}

function validateAndNormalizeChecklistItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    return { error: 'Checklist items must be an array' };
  }
  if (rawItems.length > MAX_ITEMS) {
    return { error: `Checklist cannot exceed ${MAX_ITEMS} items` };
  }
  const items = [];
  for (let i = 0; i < rawItems.length; i++) {
    const raw = rawItems[i];
    if (!isPlainObject(raw)) {
      return { error: 'Each checklist item must be an object' };
    }
    const text = typeof raw.text === 'string' ? raw.text : '';
    if (text.length > MAX_ITEM_TEXT_LEN) {
      return { error: `Checklist item text cannot exceed ${MAX_ITEM_TEXT_LEN} characters` };
    }
    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim().slice(0, 80)
        : `item-${Date.now()}-${i}`;
    items.push({
      id,
      text,
      checked: Boolean(raw.checked)
    });
  }
  return { items };
}

export function validateAndNormalizeQuillNote(
  raw,
  existing,
  { callerProfile, profilesById, nowIso, defaultPosition = 1000, preserveOwner = false }
) {
  if (!isPlainObject(raw)) {
    return { error: 'Invalid note payload' };
  }

  const type = raw.type !== undefined ? raw.type : existing?.type || 'text';
  if (!VALID_NOTE_TYPES.has(type)) {
    return { error: 'Invalid note type' };
  }

  const visibility =
    raw.visibility !== undefined ? raw.visibility : existing?.visibility || 'shared';
  if (!VALID_NOTE_VISIBILITIES.has(visibility)) {
    return { error: 'Invalid note visibility' };
  }

  const status = raw.status !== undefined ? raw.status : existing?.status || 'active';
  if (!VALID_NOTE_STATUSES.has(status)) {
    return { error: 'Invalid note status' };
  }

  const color = raw.color !== undefined ? raw.color : existing?.color || 'default';
  if (!VALID_NOTE_COLORS.has(color)) {
    return { error: 'Invalid note colour' };
  }

  if (raw.title !== undefined && typeof raw.title !== 'string') {
    return { error: 'Note title must be a string' };
  }
  const title = raw.title !== undefined ? raw.title : existing?.title || '';
  if (title.length > MAX_TITLE_LEN) {
    return { error: `Note title cannot exceed ${MAX_TITLE_LEN} characters` };
  }

  if (raw.body !== undefined && typeof raw.body !== 'string') {
    return { error: 'Note body must be a string' };
  }
  const body = raw.body !== undefined ? raw.body : existing?.body || '';
  if (body.length > MAX_BODY_LEN) {
    return { error: `Note body cannot exceed ${MAX_BODY_LEN} characters` };
  }

  let items = existing?.items || [];
  if (raw.items !== undefined) {
    const check = validateAndNormalizeChecklistItems(raw.items);
    if (check.error) return { error: check.error };
    items = check.items;
  }

  let labels = existing?.labels || [];
  if (raw.labels !== undefined) {
    if (!Array.isArray(raw.labels)) {
      return { error: 'Note labels must be an array' };
    }
    if (raw.labels.length > MAX_LABELS_PER_NOTE) {
      return { error: `A note cannot have more than ${MAX_LABELS_PER_NOTE} labels` };
    }
    labels = normalizeQuillLabels(raw.labels, MAX_LABELS_PER_NOTE);
  }

  const flippingSharedToPrivate =
    !preserveOwner && existing?.visibility === 'shared' && visibility === 'private';
  const ownerProfileId = flippingSharedToPrivate
    ? callerProfile
    : existing?.ownerProfileId || callerProfile;
  const caregiverVisible =
    visibility === 'shared'
      ? Boolean(
          raw.caregiverVisible !== undefined ? raw.caregiverVisible : existing?.caregiverVisible
        )
      : false;
  const pinned = Boolean(raw.pinned !== undefined ? raw.pinned : existing?.pinned);

  let position = existing?.position ?? defaultPosition;
  if (raw.position !== undefined) {
    const parsedPos = Number(raw.position);
    if (!Number.isFinite(parsedPos)) {
      return { error: 'Invalid note position' };
    }
    position = parsedPos;
  }

  const callerDisplayName = resolveProfileDisplayName(profilesById, callerProfile, callerProfile);
  const createdAt = existing?.createdAt || nowIso;
  const createdByProfileId = existing?.createdByProfileId || callerProfile;
  const createdBy = resolveProfileDisplayName(
    profilesById,
    createdByProfileId,
    existing?.createdBy || callerDisplayName
  );

  let trashedAt = existing?.trashedAt || null;
  if (status === 'trashed' && existing?.status !== 'trashed') {
    trashedAt = nowIso;
  } else if (status !== 'trashed') {
    trashedAt = null;
  }

  const revision = existing ? Number(existing.revision || 1) + 1 : 1;

  const record = {
    id: existing?.id || String(raw.id || ''),
    type,
    title,
    body,
    items,
    color,
    labels,
    visibility,
    ownerProfileId,
    caregiverVisible,
    pinned,
    status,
    position,
    revision,
    createdAt,
    createdByProfileId,
    createdBy,
    updatedAt: nowIso,
    updatedByProfileId: callerProfile,
    updatedBy: callerDisplayName,
    trashedAt
  };

  return { record };
}

function parseRowRecord(row) {
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.data);
    if (!isPlainObject(parsed)) return null;
    return {
      ...parsed,
      id: row.id,
      ownerProfileId: row.owner_profile_id,
      visibility: row.visibility,
      status: row.status,
      pinned: Boolean(row.pinned),
      position: Number(row.position),
      revision: Number(row.revision),
      updatedAt: parsed.updatedAt || row.updated_at
    };
  } catch {
    return null;
  }
}

function isRowVisibleToPartner(row, callerProfile) {
  return row.visibility === 'shared' || row.owner_profile_id === callerProfile;
}

function getBucketKey(record) {
  const ownerScope = record.visibility === 'private' ? record.ownerProfileId : 'shared';
  return `${record.visibility}:${ownerScope}:${record.status}:${record.pinned ? 1 : 0}`;
}

function getDefaultTopPositionForBucket(dbCtx, { visibility, ownerProfileId, status, pinned }) {
  const rows = dbCtx.stmts.quillGetAll.all();
  let minPos = null;
  for (const row of rows) {
    if (row.visibility !== visibility) continue;
    if (visibility === 'private' && row.owner_profile_id !== ownerProfileId) continue;
    if (row.status !== status) continue;
    if (Boolean(row.pinned) !== Boolean(pinned)) continue;
    const pos = Number(row.position);
    if (Number.isFinite(pos) && (minPos === null || pos < minPos)) {
      minPos = pos;
    }
  }
  return minPos === null ? 1000 : minPos - 1000;
}

function renormalizeBucketIfNeeded(dbCtx, bucketKey, nowIso) {
  const rows = dbCtx.stmts.quillGetAll.all();
  const bucket = [];
  for (const row of rows) {
    const rec = parseRowRecord(row);
    if (!rec) continue;
    if (getBucketKey(rec) === bucketKey) {
      bucket.push(rec);
    }
  }
  if (bucket.length < 2) return;

  bucket.sort((a, b) => a.position - b.position || (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  let needsRenorm = false;
  for (let i = 0; i < bucket.length; i++) {
    if (!Number.isFinite(bucket[i].position)) {
      needsRenorm = true;
      break;
    }
    if (i > 0 && bucket[i].position - bucket[i - 1].position < 1e-6) {
      needsRenorm = true;
      break;
    }
  }
  if (!needsRenorm) return;

  for (let i = 0; i < bucket.length; i++) {
    const nextPos = (i + 1) * 1000;
    const updated = { ...bucket[i], position: nextPos };
    dbCtx.stmts.quillUpsert.run(
      updated.id,
      updated.ownerProfileId,
      updated.visibility,
      updated.status,
      updated.pinned ? 1 : 0,
      nextPos,
      updated.revision,
      JSON.stringify(updated),
      updated.updatedAt || nowIso
    );
  }
}

function ensureHouseholdLabelsInclude(dbCtx, noteLabels, nowIso) {
  if (!Array.isArray(noteLabels) || noteLabels.length === 0) return;
  const settingsObj = dbCtx.readHowardKey('quill_settings', DEFAULT_QUILL_SETTINGS);
  const current = Array.isArray(settingsObj.data?.labels) ? settingsObj.data.labels : [];
  const merged = normalizeQuillLabels([...current, ...noteLabels], MAX_HOUSEHOLD_LABELS);
  if (merged.length !== current.length) {
    dbCtx.stmts.howardUpsert.run('quill_settings', JSON.stringify({ labels: merged }), nowIso);
  }
}

export function purgeExpiredTrashedNotes(dbCtx, cache = null, nowMs = Date.now()) {
  const rows = dbCtx.stmts.quillGetAll.all();
  const expiredIds = [];
  for (const row of rows) {
    if (row.status !== 'trashed') continue;
    const rec = parseRowRecord(row);
    const trashedRef = rec?.trashedAt || row.updated_at;
    const ts = Date.parse(trashedRef);
    if (Number.isFinite(ts) && nowMs - ts >= TRASH_RETENTION_MS) {
      expiredIds.push(row.id);
    }
  }
  if (expiredIds.length === 0) return 0;

  dbCtx.runInTransaction(() => {
    for (const id of expiredIds) {
      dbCtx.stmts.quillDelete.run(id);
    }
  });
  cache?.bumpRevision?.('quill');
  return expiredIds.length;
}

export async function handleQuillRoutes({
  req,
  res,
  pathname,
  parsedUrl,
  dbCtx,
  cache,
  helpers
}) {
  if (!pathname.startsWith('/api/quill/')) {
    return false;
  }

  const callerProfile = normalizeCallerProfile(helpers.getCallerProfile(req, parsedUrl));
  const nowIso = new Date().toISOString();

  // 1. POST /api/quill/notes/reorder
  if (pathname === '/api/quill/notes/reorder') {
    if (req.method !== 'POST') {
      helpers.sendJson(res, 405, { error: 'Method not allowed' });
      return true;
    }
    if (callerProfile === 'caregiver') {
      helpers.sendJson(res, 403, { error: 'Caregiver profile cannot reorder notes' });
      return true;
    }
    const incoming = await helpers.parseJsonBody(req);
    const moves = Array.isArray(incoming.moves) ? incoming.moves : null;
    if (!moves || moves.length === 0) {
      helpers.sendJson(res, 400, { error: 'Expected non-empty moves array' });
      return true;
    }

    const { profilesById } = cache.getProfilesContext();
    const callerDisplayName = resolveProfileDisplayName(profilesById, callerProfile, callerProfile);
    const prepared = [];
    const touchedBuckets = new Set();

    for (const move of moves) {
      if (!isPlainObject(move) || typeof move.id !== 'string' || !move.id.trim()) {
        helpers.sendJson(res, 400, { error: 'Each move requires a valid note id' });
        return true;
      }
      const nextPos = Number(move.position);
      if (!Number.isFinite(nextPos)) {
        helpers.sendJson(res, 400, { error: 'Each move requires a finite position' });
        return true;
      }
      const row = dbCtx.stmts.quillGetById.get(move.id);
      if (!row || !isRowVisibleToPartner(row, callerProfile)) {
        helpers.sendJson(res, 404, { error: 'Note not found' });
        return true;
      }
      const existing = parseRowRecord(row);
      if (!existing) {
        helpers.sendJson(res, 404, { error: 'Note not found' });
        return true;
      }
      const nextPinned = move.pinned !== undefined ? Boolean(move.pinned) : existing.pinned;
      const nextRec = {
        ...existing,
        pinned: nextPinned,
        position: nextPos,
        revision: Number(existing.revision || 1) + 1,
        updatedAt: nowIso,
        updatedByProfileId: callerProfile,
        updatedBy: callerDisplayName
      };
      prepared.push(nextRec);
      touchedBuckets.add(getBucketKey(nextRec));
    }

    dbCtx.runInTransaction(() => {
      for (const rec of prepared) {
        dbCtx.stmts.quillUpsert.run(
          rec.id,
          rec.ownerProfileId,
          rec.visibility,
          rec.status,
          rec.pinned ? 1 : 0,
          rec.position,
          rec.revision,
          JSON.stringify(rec),
          nowIso
        );
      }
      for (const bucketKey of touchedBuckets) {
        renormalizeBucketIfNeeded(dbCtx, bucketKey, nowIso);
      }
    });

    cache.bumpRevision('quill');
    const projected = cache.projectQuillStateForProfile(callerProfile);
    helpers.sendJson(res, 200, { notes: projected.notes, updatedAt: nowIso });
    return true;
  }

  // 2. POST /api/quill/trash/empty
  if (pathname === '/api/quill/trash/empty') {
    if (req.method !== 'POST') {
      helpers.sendJson(res, 405, { error: 'Method not allowed' });
      return true;
    }
    if (callerProfile === 'caregiver') {
      helpers.sendJson(res, 403, { error: 'Caregiver profile cannot empty trash' });
      return true;
    }
    const rows = dbCtx.stmts.quillGetAll.all();
    const toDelete = rows
      .filter((r) => r.status === 'trashed' && isRowVisibleToPartner(r, callerProfile))
      .map((r) => r.id);

    if (toDelete.length > 0) {
      dbCtx.runInTransaction(() => {
        for (const id of toDelete) {
          dbCtx.stmts.quillDelete.run(id);
        }
      });
      cache.bumpRevision('quill');
    }

    helpers.sendJson(res, 200, { removed: toDelete.length, updatedAt: nowIso });
    return true;
  }

  // 3. PUT /api/quill/labels
  if (pathname === '/api/quill/labels') {
    if (req.method !== 'PUT') {
      helpers.sendJson(res, 405, { error: 'Method not allowed' });
      return true;
    }
    if (callerProfile === 'caregiver') {
      helpers.sendJson(res, 403, { error: 'Caregiver profile cannot manage labels' });
      return true;
    }
    const incoming = await helpers.parseJsonBody(req);
    const currentSettings = dbCtx.readHowardKey('quill_settings', DEFAULT_QUILL_SETTINGS).data;
    let nextLabels = Array.isArray(currentSettings?.labels) ? [...currentSettings.labels] : [];

    if (Array.isArray(incoming.labels)) {
      if (incoming.labels.length > MAX_HOUSEHOLD_LABELS) {
        helpers.sendJson(res, 400, {
          error: `Cannot exceed ${MAX_HOUSEHOLD_LABELS} household labels`
        });
        return true;
      }
      nextLabels = normalizeQuillLabels(incoming.labels, MAX_HOUSEHOLD_LABELS);
    }

    const renameFrom =
      isPlainObject(incoming.rename) && typeof incoming.rename.from === 'string'
        ? incoming.rename.from.trim()
        : '';
    const renameTo =
      isPlainObject(incoming.rename) && typeof incoming.rename.to === 'string'
        ? incoming.rename.to.trim().slice(0, MAX_LABEL_LEN)
        : '';
    const deleteLabel =
      typeof incoming.deleteLabel === 'string' ? incoming.deleteLabel.trim() : '';

    if (renameFrom && renameTo) {
      nextLabels = normalizeQuillLabels(
        nextLabels.map((l) => (l.toLowerCase() === renameFrom.toLowerCase() ? renameTo : l)),
        MAX_HOUSEHOLD_LABELS
      );
    } else if (deleteLabel) {
      nextLabels = nextLabels.filter((l) => l.toLowerCase() !== deleteLabel.toLowerCase());
    }

    dbCtx.runInTransaction(() => {
      dbCtx.stmts.howardUpsert.run('quill_settings', JSON.stringify({ labels: nextLabels }), nowIso);

      if ((renameFrom && renameTo) || deleteLabel) {
        const rows = dbCtx.stmts.quillGetAll.all();
        for (const row of rows) {
          const rec = parseRowRecord(row);
          if (!rec || !Array.isArray(rec.labels) || rec.labels.length === 0) continue;
          let updatedLabels;
          if (renameFrom && renameTo) {
            const hasTarget = rec.labels.some(
              (l) => l.toLowerCase() === renameFrom.toLowerCase()
            );
            if (!hasTarget) continue;
            updatedLabels = normalizeQuillLabels(
              rec.labels.map((l) =>
                l.toLowerCase() === renameFrom.toLowerCase() ? renameTo : l
              ),
              MAX_LABELS_PER_NOTE
            );
          } else {
            const hasTarget = rec.labels.some(
              (l) => l.toLowerCase() === deleteLabel.toLowerCase()
            );
            if (!hasTarget) continue;
            updatedLabels = rec.labels.filter(
              (l) => l.toLowerCase() !== deleteLabel.toLowerCase()
            );
          }
          const nextRec = {
            ...rec,
            labels: updatedLabels,
            revision: Number(rec.revision || 1) + 1,
            updatedAt: nowIso
          };
          dbCtx.stmts.quillUpsert.run(
            nextRec.id,
            nextRec.ownerProfileId,
            nextRec.visibility,
            nextRec.status,
            nextRec.pinned ? 1 : 0,
            nextRec.position,
            nextRec.revision,
            JSON.stringify(nextRec),
            nowIso
          );
        }
      }
    });

    cache.bumpRevision('quill');
    helpers.sendJson(res, 200, { labels: nextLabels, updatedAt: nowIso });
    return true;
  }

  // 4. PATCH /api/quill/notes/:id/items/:itemId
  const itemMatch = pathname.match(/^\/api\/quill\/notes\/([^/]+)\/items\/([^/]+)$/);
  if (itemMatch) {
    if (req.method !== 'PATCH') {
      helpers.sendJson(res, 405, { error: 'Method not allowed' });
      return true;
    }
    let noteId = null;
    let itemId = null;
    try {
      noteId = decodeURIComponent(itemMatch[1]).trim();
      itemId = decodeURIComponent(itemMatch[2]).trim();
    } catch {
      noteId = null;
    }
    if (!noteId || !itemId || noteId.includes('/') || itemId.includes('/')) {
      helpers.sendJson(res, 400, { error: 'Invalid note or item ID' });
      return true;
    }

    const row = dbCtx.stmts.quillGetById.get(noteId);
    const existing = parseRowRecord(row);
    if (!row || !existing) {
      helpers.sendJson(res, 404, { error: 'Note not found' });
      return true;
    }

    if (callerProfile === 'caregiver') {
      if (
        existing.visibility !== 'shared' ||
        existing.status !== 'active' ||
        !existing.caregiverVisible
      ) {
        helpers.sendJson(res, 404, { error: 'Note not found' });
        return true;
      }
    } else if (!isRowVisibleToPartner(row, callerProfile)) {
      helpers.sendJson(res, 404, { error: 'Note not found' });
      return true;
    }

    const incoming = await helpers.parseJsonBody(req);
    if (callerProfile === 'caregiver') {
      const hasOnlyChecked =
        incoming.checked !== undefined &&
        incoming.text === undefined &&
        incoming.delete === undefined;
      if (!hasOnlyChecked || typeof incoming.checked !== 'boolean') {
        helpers.sendJson(res, 403, {
          error: 'Caregiver profile can only tick or untick House Note checklist items'
        });
        return true;
      }
    }

    if (existing.type !== 'checklist') {
      helpers.sendJson(res, 400, { error: 'Note is not a checklist' });
      return true;
    }

    const items = Array.isArray(existing.items) ? [...existing.items] : [];
    const itemIdx = items.findIndex((it) => it && it.id === itemId);
    if (itemIdx === -1) {
      helpers.sendJson(res, 404, { error: 'Checklist item not found' });
      return true;
    }

    if (incoming.delete === true) {
      items.splice(itemIdx, 1);
    } else {
      const target = { ...items[itemIdx] };
      if (incoming.checked !== undefined) {
        target.checked = Boolean(incoming.checked);
      }
      if (incoming.text !== undefined) {
        const nextText = String(incoming.text || '');
        if (nextText.length > MAX_ITEM_TEXT_LEN) {
          helpers.sendJson(res, 400, {
            error: `Checklist item text cannot exceed ${MAX_ITEM_TEXT_LEN} characters`
          });
          return true;
        }
        target.text = nextText;
      }
      items[itemIdx] = target;
    }

    const { profilesById } = cache.getProfilesContext();
    const callerDisplayName = resolveProfileDisplayName(profilesById, callerProfile, callerProfile);
    const nextRec = {
      ...existing,
      items,
      revision: Number(existing.revision || 1) + 1,
      updatedAt: nowIso,
      updatedByProfileId: callerProfile,
      updatedBy: callerDisplayName
    };

    dbCtx.stmts.quillUpsert.run(
      nextRec.id,
      nextRec.ownerProfileId,
      nextRec.visibility,
      nextRec.status,
      nextRec.pinned ? 1 : 0,
      nextRec.position,
      nextRec.revision,
      JSON.stringify(nextRec),
      nowIso
    );
    cache.bumpRevision('quill');
    helpers.sendJson(res, 200, {
      note: resolveQuillNote(nextRec, profilesById),
      updatedAt: nowIso
    });
    return true;
  }

  // 5. PUT / PATCH / DELETE /api/quill/notes/:id
  if (pathname.startsWith('/api/quill/notes/')) {
    if (req.method !== 'PUT' && req.method !== 'PATCH' && req.method !== 'DELETE') {
      helpers.sendJson(res, 405, { error: 'Method not allowed' });
      return true;
    }
    const rawNoteId = helpers.parseRequiredSegment(pathname, '/api/quill/notes/');
    const noteId = typeof rawNoteId === 'string' ? rawNoteId.trim() : '';
    if (!noteId || noteId.includes('/')) {
      helpers.sendJson(res, 400, { error: 'Invalid or missing note ID' });
      return true;
    }

    if (callerProfile === 'caregiver') {
      helpers.sendJson(res, 403, { error: 'Caregiver profile cannot modify notes' });
      return true;
    }

    const existingRow = dbCtx.stmts.quillGetById.get(noteId);
    if (existingRow && !isRowVisibleToPartner(existingRow, callerProfile)) {
      helpers.sendJson(res, 404, { error: 'Note not found' });
      return true;
    }
    const existing = parseRowRecord(existingRow);
    const { profilesById } = cache.getProfilesContext();

    if (req.method === 'PUT') {
      const incoming = await helpers.parseJsonBody(req);
      const rawNote = isPlainObject(incoming.note) ? incoming.note : incoming;
      const baseRevision =
        incoming.baseRevision !== undefined ? incoming.baseRevision : rawNote.baseRevision;

      if (existing) {
        if (
          baseRevision !== undefined &&
          baseRevision !== null &&
          Number(baseRevision) !== Number(existing.revision || 1)
        ) {
          helpers.sendJson(res, 409, {
            error: 'Note was updated by another household member',
            note: resolveQuillNote(existing, profilesById)
          });
          return true;
        }
      }

      const targetVisibility =
        rawNote.visibility !== undefined ? rawNote.visibility : existing?.visibility || 'shared';
      const targetStatus =
        rawNote.status !== undefined ? rawNote.status : existing?.status || 'active';
      const targetPinned = Boolean(
        rawNote.pinned !== undefined ? rawNote.pinned : existing?.pinned
      );
      const defaultPosition = existing
        ? existing.position
        : getDefaultTopPositionForBucket(dbCtx, {
            visibility: VALID_NOTE_VISIBILITIES.has(targetVisibility) ? targetVisibility : 'shared',
            ownerProfileId: callerProfile,
            status: VALID_NOTE_STATUSES.has(targetStatus) ? targetStatus : 'active',
            pinned: targetPinned
          });

      const validated = validateAndNormalizeQuillNote(
        { ...rawNote, id: noteId },
        existing,
        { callerProfile, profilesById, nowIso, defaultPosition }
      );
      if (validated.error) {
        helpers.sendJson(res, 400, { error: validated.error });
        return true;
      }

      const rec = { ...validated.record, id: noteId };
      dbCtx.runInTransaction(() => {
        dbCtx.stmts.quillUpsert.run(
          rec.id,
          rec.ownerProfileId,
          rec.visibility,
          rec.status,
          rec.pinned ? 1 : 0,
          rec.position,
          rec.revision,
          JSON.stringify(rec),
          nowIso
        );
        ensureHouseholdLabelsInclude(dbCtx, rec.labels, nowIso);
      });

      cache.bumpRevision('quill');
      helpers.sendJson(res, 200, {
        note: resolveQuillNote(rec, profilesById),
        updatedAt: nowIso
      });
      return true;
    }

    if (req.method === 'PATCH') {
      if (!existing) {
        helpers.sendJson(res, 404, { error: 'Note not found' });
        return true;
      }
      const incoming = await helpers.parseJsonBody(req);
      const patch = {};
      for (const key of [
        'title',
        'pinned',
        'color',
        'status',
        'labels',
        'visibility',
        'caregiverVisible',
        'position',
        'type',
        'body',
        'items'
      ]) {
        if (incoming[key] !== undefined) {
          patch[key] = incoming[key];
        }
      }

      if (patch.type === 'checklist' && existing.type === 'text') {
        if (patch.items === undefined) patch.items = convertBodyToItems(existing.body);
        if (patch.body === undefined) patch.body = '';
      } else if (patch.type === 'text' && existing.type === 'checklist') {
        if (patch.body === undefined) patch.body = convertItemsToBody(existing.items);
        if (patch.items === undefined) patch.items = [];
      }

      const nextVisibility =
        patch.visibility !== undefined ? patch.visibility : existing.visibility;
      const nextStatus = patch.status !== undefined ? patch.status : existing.status;
      const nextPinned = patch.pinned !== undefined ? Boolean(patch.pinned) : existing.pinned;
      const nextOwnerForBucket =
        existing.visibility === 'shared' && nextVisibility === 'private'
          ? callerProfile
          : existing.ownerProfileId;
      const movedBucket =
        nextVisibility !== existing.visibility ||
        nextStatus !== existing.status ||
        nextPinned !== existing.pinned;

      if (movedBucket && patch.position === undefined) {
        patch.position = getDefaultTopPositionForBucket(dbCtx, {
          visibility: VALID_NOTE_VISIBILITIES.has(nextVisibility)
            ? nextVisibility
            : existing.visibility,
          ownerProfileId: nextOwnerForBucket,
          status: VALID_NOTE_STATUSES.has(nextStatus) ? nextStatus : existing.status,
          pinned: nextPinned
        });
      }

      const validated = validateAndNormalizeQuillNote(patch, existing, {
        callerProfile,
        profilesById,
        nowIso,
        defaultPosition: existing.position
      });
      if (validated.error) {
        helpers.sendJson(res, 400, { error: validated.error });
        return true;
      }

      const rec = { ...validated.record, id: noteId };
      dbCtx.runInTransaction(() => {
        dbCtx.stmts.quillUpsert.run(
          rec.id,
          rec.ownerProfileId,
          rec.visibility,
          rec.status,
          rec.pinned ? 1 : 0,
          rec.position,
          rec.revision,
          JSON.stringify(rec),
          nowIso
        );
        ensureHouseholdLabelsInclude(dbCtx, rec.labels, nowIso);
      });

      cache.bumpRevision('quill');
      helpers.sendJson(res, 200, {
        note: resolveQuillNote(rec, profilesById),
        updatedAt: nowIso
      });
      return true;
    }

    if (req.method === 'DELETE') {
      if (!existing) {
        helpers.sendJson(res, 404, { error: 'Note not found' });
        return true;
      }
      if (existing.status !== 'trashed') {
        helpers.sendJson(res, 400, {
          error: 'Only trashed notes can be permanently deleted'
        });
        return true;
      }
      dbCtx.stmts.quillDelete.run(noteId);
      cache.bumpRevision('quill');
      helpers.sendJson(res, 200, { deleted: true, id: noteId, updatedAt: nowIso });
      return true;
    }
  }

  return false;
}
