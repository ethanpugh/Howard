import { Hono } from 'hono';
import { DEFAULT_QUILL_SETTINGS } from '../../shared/defaults.ts';
import { isProfileId, resolveProfileDisplayName } from '../../shared/profileUtils.ts';
import type { ProfileId } from '../../shared/schemas/common.ts';
import {
  QuillItemPatchRequestSchema,
  QuillLabelsRequestSchema,
  QuillNoteSchema,
  QuillPatchNoteRequestSchema,
  QuillPutNoteRequestSchema,
  QuillReorderRequestSchema,
  QuillStatusSchema,
  QuillVisibilitySchema,
  type QuillChecklistItem,
  type QuillColor,
  type QuillNote,
  type QuillNoteType,
  type QuillStatus,
  type QuillVisibility
} from '../../shared/schemas/quill.ts';
import type { RuntimeCache } from '../cache.ts';
import { isJsonRowMetadata, type DatabaseContext } from '../db.ts';
import { getCallerProfile, jsonBody, requirePartner } from '../honoHelpers.ts';
import { isPlainObject } from '../utils.ts';
import { resolveQuillNote, type ProfilesByIdMap } from './profileResolve.ts';

export const VALID_NOTE_TYPES = new Set<QuillNoteType>(['text', 'checklist']);
export const VALID_NOTE_VISIBILITIES = new Set<QuillVisibility>(['shared', 'private']);
export const VALID_NOTE_STATUSES = new Set<QuillStatus>(['active', 'archived', 'trashed']);
export const VALID_NOTE_COLORS = new Set<QuillColor>([
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

interface QuillNoteRow {
  id: string;
  owner_profile_id: string;
  visibility: string;
  status: string;
  pinned: number;
  position: number;
  revision: number;
  data: string;
  updated_at: string;
}

function isQuillNoteRow(v: unknown): v is QuillNoteRow {
  return (
    isJsonRowMetadata(v) &&
    typeof v.id === 'string' &&
    typeof v.owner_profile_id === 'string' &&
    typeof v.visibility === 'string' &&
    typeof v.status === 'string'
  );
}

export function normalizeQuillLabels(
  rawLabels: unknown,
  maxCount = MAX_LABELS_PER_NOTE
): string[] {
  if (!Array.isArray(rawLabels)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
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

export function convertBodyToItems(body = ''): QuillChecklistItem[] {
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

export function convertItemsToBody(items: Array<{ text?: string }> = []): string {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item?.text || '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_BODY_LEN);
}

function validateAndNormalizeChecklistItems(
  rawItems: unknown
): { items: QuillChecklistItem[]; error?: undefined } | { error: string; items?: undefined } {
  if (!Array.isArray(rawItems)) {
    return { error: 'Checklist items must be an array' };
  }
  if (rawItems.length > MAX_ITEMS) {
    return { error: `Checklist cannot exceed ${MAX_ITEMS} items` };
  }
  const items: QuillChecklistItem[] = [];
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
  raw: unknown,
  existing: QuillNote | null,
  {
    callerProfile,
    profilesById,
    nowIso,
    defaultPosition = 1000,
    preserveOwner = false
  }: {
    callerProfile: ProfileId;
    profilesById: ProfilesByIdMap;
    nowIso: string;
    defaultPosition?: number;
    preserveOwner?: boolean;
  }
): { record: QuillNote; error?: undefined } | { error: string; record?: undefined } {
  if (!isPlainObject(raw)) {
    return { error: 'Invalid note payload' };
  }

  const type = (raw.type !== undefined ? raw.type : existing?.type || 'text') as QuillNoteType;
  if (!VALID_NOTE_TYPES.has(type)) {
    return { error: 'Invalid note type' };
  }

  const visibility = (
    raw.visibility !== undefined ? raw.visibility : existing?.visibility || 'shared'
  ) as QuillVisibility;
  if (!VALID_NOTE_VISIBILITIES.has(visibility)) {
    return { error: 'Invalid note visibility' };
  }

  const status = (
    raw.status !== undefined ? raw.status : existing?.status || 'active'
  ) as QuillStatus;
  if (!VALID_NOTE_STATUSES.has(status)) {
    return { error: 'Invalid note status' };
  }

  const color = (raw.color !== undefined ? raw.color : existing?.color || 'default') as QuillColor;
  if (!VALID_NOTE_COLORS.has(color)) {
    return { error: 'Invalid note colour' };
  }

  if (raw.title !== undefined && typeof raw.title !== 'string') {
    return { error: 'Note title must be a string' };
  }
  const title = raw.title !== undefined ? String(raw.title) : existing?.title || '';
  if (title.length > MAX_TITLE_LEN) {
    return { error: `Note title cannot exceed ${MAX_TITLE_LEN} characters` };
  }

  if (raw.body !== undefined && typeof raw.body !== 'string') {
    return { error: 'Note body must be a string' };
  }
  const body = raw.body !== undefined ? String(raw.body) : existing?.body || '';
  if (body.length > MAX_BODY_LEN) {
    return { error: `Note body cannot exceed ${MAX_BODY_LEN} characters` };
  }

  let items: QuillChecklistItem[] = existing?.items || [];
  if (raw.items !== undefined) {
    const check = validateAndNormalizeChecklistItems(raw.items);
    if (check.error !== undefined) return { error: check.error };
    items = check.items;
  }

  let labels: string[] = existing?.labels || [];
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
  const ownerProfileId: ProfileId = flippingSharedToPrivate
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
    if (typeof raw.position !== 'number' || !Number.isFinite(raw.position)) {
      return { error: 'Invalid note position' };
    }
    position = raw.position;
  }

  const callerDisplayName = resolveProfileDisplayName(profilesById, callerProfile, callerProfile);
  const createdAt = existing?.createdAt || nowIso;
  const createdByProfileId: ProfileId = existing?.createdByProfileId || callerProfile;
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

  const record: QuillNote = {
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

function parseRowRecord(row: QuillNoteRow | undefined): QuillNote | null {
  if (!row) return null;
  try {
    const parsed: unknown = JSON.parse(row.data);
    if (!isPlainObject(parsed)) return null;
    const ownerProfileId: ProfileId = isProfileId(row.owner_profile_id)
      ? row.owner_profile_id
      : 'partner1';
    const visParsed = QuillVisibilitySchema.safeParse(row.visibility);
    const statusParsed = QuillStatusSchema.safeParse(row.status);
    return {
      ...(parsed as QuillNote),
      id: row.id,
      ownerProfileId,
      visibility: visParsed.success ? visParsed.data : 'shared',
      status: statusParsed.success ? statusParsed.data : 'active',
      pinned: Boolean(row.pinned),
      position: Number(row.position),
      revision: Number(row.revision),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : row.updated_at
    };
  } catch (err) {
    console.error(`[Quill] Failed parsing note row ${row.id}:`, err);
    return null;
  }
}

function isRowVisibleToPartner(row: QuillNoteRow, callerProfile: ProfileId): boolean {
  return row.visibility === 'shared' || row.owner_profile_id === callerProfile;
}

function getBucketKey(record: QuillNote): string {
  const ownerScope = record.visibility === 'private' ? record.ownerProfileId : 'shared';
  return `${record.visibility}:${ownerScope}:${record.status}:${record.pinned ? 1 : 0}`;
}

function getDefaultTopPositionForBucket(
  dbCtx: DatabaseContext,
  {
    visibility,
    ownerProfileId,
    status,
    pinned
  }: { visibility: QuillVisibility; ownerProfileId: ProfileId; status: QuillStatus; pinned: boolean }
): number {
  const rows = dbCtx.queryAll(dbCtx.stmts.quillGetAll, isQuillNoteRow);
  let minPos: number | null = null;
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

function renormalizeBucketIfNeeded(dbCtx: DatabaseContext, bucketKey: string, nowIso: string): void {
  const rows = dbCtx.queryAll(dbCtx.stmts.quillGetAll, isQuillNoteRow);
  const bucket: QuillNote[] = [];
  for (const row of rows) {
    const rec = parseRowRecord(row);
    if (!rec) continue;
    if (getBucketKey(rec) === bucketKey) {
      bucket.push(rec);
    }
  }
  if (bucket.length < 2) return;

  bucket.sort(
    (a, b) => a.position - b.position || (b.updatedAt || '').localeCompare(a.updatedAt || '')
  );

  let needsRenorm = false;
  for (let i = 0; i < bucket.length; i++) {
    const cur = bucket[i];
    if (!cur) continue;
    if (!Number.isFinite(cur.position)) {
      needsRenorm = true;
      break;
    }
    const prev = bucket[i - 1];
    if (prev && cur.position - prev.position < 1e-6) {
      needsRenorm = true;
      break;
    }
  }
  if (!needsRenorm) return;

  for (let i = 0; i < bucket.length; i++) {
    const entry = bucket[i];
    if (!entry) continue;
    const nextPos = (i + 1) * 1000;
    const updated: QuillNote = { ...entry, position: nextPos };
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

function ensureHouseholdLabelsInclude(
  dbCtx: DatabaseContext,
  noteLabels: string[],
  nowIso: string
): void {
  if (!Array.isArray(noteLabels) || noteLabels.length === 0) return;
  const settingsObj = dbCtx.readHowardKey<{ labels?: string[] }>(
    'quill_settings',
    DEFAULT_QUILL_SETTINGS
  );
  const current = Array.isArray(settingsObj.data?.labels) ? settingsObj.data.labels : [];
  const merged = normalizeQuillLabels([...current, ...noteLabels], MAX_HOUSEHOLD_LABELS);
  if (merged.length !== current.length) {
    dbCtx.stmts.howardUpsert.run('quill_settings', JSON.stringify({ labels: merged }), nowIso);
  }
}

export function purgeExpiredTrashedNotes(
  dbCtx: DatabaseContext,
  cache: RuntimeCache | null = null,
  nowMs = Date.now()
): number {
  const rows = dbCtx.queryAll(dbCtx.stmts.quillGetAll, isQuillNoteRow);
  const expiredIds: string[] = [];
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
  cache?.bumpRevision('quill');
  return expiredIds.length;
}

export function createQuillRoutes({
  dbCtx,
  cache
}: {
  dbCtx: DatabaseContext;
  cache: RuntimeCache;
}) {
  return new Hono()
    .post('/notes/reorder', ...jsonBody(QuillReorderRequestSchema), (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const callerProfile = auth.profileId;
      const incoming = c.req.valid('json');
      const nowIso = new Date().toISOString();
      const { profilesById } = cache.getProfilesContext();
      const callerDisplayName = resolveProfileDisplayName(
        profilesById,
        callerProfile,
        callerProfile
      );

      const txResult = dbCtx.runInTransaction(() => {
        const prepared: QuillNote[] = [];
        const touchedBuckets = new Set<string>();

        for (const move of incoming.moves) {
          const rawRow = dbCtx.stmts.quillGetById.get(move.id);
          const row = isQuillNoteRow(rawRow) ? rawRow : undefined;
          if (!row || !isRowVisibleToPartner(row, callerProfile)) {
            return { error: 'Note not found', status: 404 as const };
          }
          const existing = parseRowRecord(row);
          if (!existing) {
            return { error: 'Note not found', status: 404 as const };
          }
          const nextPinned = move.pinned !== undefined ? Boolean(move.pinned) : existing.pinned;
          const nextRec: QuillNote = {
            ...existing,
            pinned: nextPinned,
            position: move.position,
            revision: Number(existing.revision || 1) + 1,
            updatedAt: nowIso,
            updatedByProfileId: callerProfile,
            updatedBy: callerDisplayName
          };
          prepared.push(nextRec);
          touchedBuckets.add(getBucketKey(nextRec));
        }

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
        return { ok: true as const };
      });

      if ('error' in txResult) {
        return c.json({ error: txResult.error }, txResult.status);
      }

      cache.bumpRevision('quill');
      const projected = cache.projectQuillStateForProfile(callerProfile);
      return c.json({ notes: projected.notes, updatedAt: nowIso }, 200);
    })
    .post('/trash/empty', (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const callerProfile = auth.profileId;
      const nowIso = new Date().toISOString();
      const removedCount = dbCtx.runInTransaction(() => {
        const rows = dbCtx.queryAll(dbCtx.stmts.quillGetAll, isQuillNoteRow);
        const toDelete = rows
          .filter((r) => r.status === 'trashed' && isRowVisibleToPartner(r, callerProfile))
          .map((r) => r.id);
        for (const id of toDelete) {
          dbCtx.stmts.quillDelete.run(id);
        }
        return toDelete.length;
      });

      if (removedCount > 0) {
        cache.bumpRevision('quill');
      }
      return c.json({ removed: removedCount, updatedAt: nowIso }, 200);
    })
    .put('/labels', ...jsonBody(QuillLabelsRequestSchema), (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const callerProfile = auth.profileId;
      const incoming = c.req.valid('json');
      const nowIso = new Date().toISOString();

      const txResult = dbCtx.runInTransaction(() => {
        const currentSettings = dbCtx.readHowardKey<{ labels?: string[] }>(
          'quill_settings',
          DEFAULT_QUILL_SETTINGS
        ).data;
        let nextLabels = Array.isArray(currentSettings?.labels) ? [...currentSettings.labels] : [];

        if (Array.isArray(incoming.labels)) {
          if (incoming.labels.length > MAX_HOUSEHOLD_LABELS) {
            return {
              error: `Cannot exceed ${MAX_HOUSEHOLD_LABELS} household labels`,
              status: 400 as const
            };
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

        dbCtx.stmts.howardUpsert.run('quill_settings', JSON.stringify({ labels: nextLabels }), nowIso);

        if ((renameFrom && renameTo) || deleteLabel) {
          const rows = dbCtx.queryAll(dbCtx.stmts.quillGetAll, isQuillNoteRow);
          for (const row of rows) {
            if (!isRowVisibleToPartner(row, callerProfile)) continue;
            const rec = parseRowRecord(row);
            if (!rec || !Array.isArray(rec.labels) || rec.labels.length === 0) continue;
            let updatedLabels: string[];
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
            const nextRec: QuillNote = {
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
        return { labels: nextLabels } as const;
      });

      if ('error' in txResult) {
        return c.json({ error: txResult.error }, txResult.status);
      }

      cache.bumpRevision('quill');
      return c.json({ labels: txResult.labels, updatedAt: nowIso }, 200);
    })
    .patch('/notes/:noteId/items/:itemId', ...jsonBody(QuillItemPatchRequestSchema), (c) => {
      const callerProfile = getCallerProfile(c);
      const noteId = c.req.param('noteId').trim();
      const itemId = c.req.param('itemId').trim();
      if (!noteId || !itemId) {
        return c.json({ error: 'Invalid note or item ID' }, 400);
      }
      const incoming = c.req.valid('json');
      if (callerProfile === 'caregiver') {
        const hasOnlyChecked =
          incoming.checked !== undefined &&
          incoming.text === undefined &&
          incoming.delete === undefined;
        if (!hasOnlyChecked || typeof incoming.checked !== 'boolean') {
          return c.json(
            { error: 'Caregiver profile can only tick or untick House Note checklist items' },
            403
          );
        }
      }

      const nowIso = new Date().toISOString();
      const { profilesById } = cache.getProfilesContext();

      const txResult = dbCtx.runInTransaction(() => {
        const rawRow = dbCtx.stmts.quillGetById.get(noteId);
        const row = isQuillNoteRow(rawRow) ? rawRow : undefined;
        const existing = parseRowRecord(row);
        if (!row || !existing) {
          return { error: 'Note not found', status: 404 as const };
        }

        if (callerProfile === 'caregiver') {
          if (
            existing.visibility !== 'shared' ||
            existing.status !== 'active' ||
            !existing.caregiverVisible
          ) {
            return { error: 'Note not found', status: 404 as const };
          }
        } else if (!isRowVisibleToPartner(row, callerProfile)) {
          return { error: 'Note not found', status: 404 as const };
        }

        if (existing.status === 'trashed') {
          return { error: 'Cannot edit checklist items on trashed notes', status: 400 as const };
        }
        if (existing.type !== 'checklist') {
          return { error: 'Note is not a checklist', status: 400 as const };
        }

        const items = Array.isArray(existing.items) ? [...existing.items] : [];
        const itemIdx = items.findIndex((it) => it && it.id === itemId);
        const existingItem = itemIdx !== -1 ? items[itemIdx] : undefined;
        if (!existingItem) {
          return { error: 'Checklist item not found', status: 404 as const };
        }

        if (incoming.delete === true) {
          items.splice(itemIdx, 1);
        } else {
          const target = { ...existingItem };
          if (incoming.checked !== undefined) {
            target.checked = Boolean(incoming.checked);
          }
          if (incoming.text !== undefined) {
            const nextText = String(incoming.text || '');
            if (nextText.length > MAX_ITEM_TEXT_LEN) {
              return {
                error: `Checklist item text cannot exceed ${MAX_ITEM_TEXT_LEN} characters`,
                status: 400 as const
              };
            }
            target.text = nextText;
          }
          items[itemIdx] = target;
        }

        const callerDisplayName = resolveProfileDisplayName(
          profilesById,
          callerProfile,
          callerProfile
        );
        const nextRec: QuillNote = {
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
        return { note: nextRec } as const;
      });

      if ('error' in txResult) {
        return c.json({ error: txResult.error }, txResult.status);
      }

      cache.bumpRevision('quill');
      return c.json({ note: resolveQuillNote(txResult.note, profilesById), updatedAt: nowIso }, 200);
    })
    .put('/notes/:noteId', ...jsonBody(QuillPutNoteRequestSchema), (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const callerProfile = auth.profileId;
      const noteId = c.req.param('noteId').trim();
      if (!noteId) {
        return c.json({ error: 'Invalid or missing note ID' }, 400);
      }

      const { profilesById } = cache.getProfilesContext();
      const nowIso = new Date().toISOString();
      const incoming = c.req.valid('json');
      const rawNote: Record<string, unknown> = incoming.note ? { ...incoming.note } : { ...incoming };
      const baseRevision =
        incoming.baseRevision !== undefined ? incoming.baseRevision : rawNote.baseRevision;

      const txResult = dbCtx.runInTransaction(() => {
        const rawRow = dbCtx.stmts.quillGetById.get(noteId);
        const existingRow = isQuillNoteRow(rawRow) ? rawRow : undefined;
        if (existingRow && !isRowVisibleToPartner(existingRow, callerProfile)) {
          return { error: 'Note not found', status: 404 as const };
        }
        const existing = parseRowRecord(existingRow);

        if (
          existing &&
          baseRevision !== undefined &&
          baseRevision !== null &&
          Number(baseRevision) !== Number(existing.revision || 1)
        ) {
          return {
            conflict: resolveQuillNote(existing, profilesById),
            status: 409 as const
          };
        }

        const targetVisibility =
          rawNote.visibility !== undefined
            ? (rawNote.visibility as QuillVisibility)
            : existing?.visibility || 'shared';
        const targetStatus =
          rawNote.status !== undefined
            ? (rawNote.status as QuillStatus)
            : existing?.status || 'active';
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
        if (validated.error !== undefined) {
          return { error: validated.error, status: 400 as const };
        }

        const rec: QuillNote = { ...validated.record, id: noteId };
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
        if (rec.visibility === 'shared') {
          ensureHouseholdLabelsInclude(dbCtx, rec.labels, nowIso);
        }
        return { rec } as const;
      });

      if ('conflict' in txResult) {
        return c.json(
          {
            error: 'Note was updated by another household member',
            note: txResult.conflict
          },
          409
        );
      }
      if ('error' in txResult) {
        return c.json({ error: txResult.error }, txResult.status);
      }

      cache.bumpRevision('quill');
      return c.json({ note: resolveQuillNote(txResult.rec, profilesById), updatedAt: nowIso }, 200);
    })
    .patch('/notes/:noteId', ...jsonBody(QuillPatchNoteRequestSchema), (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const callerProfile = auth.profileId;
      const noteId = c.req.param('noteId').trim();
      if (!noteId) {
        return c.json({ error: 'Invalid or missing note ID' }, 400);
      }

      const { profilesById } = cache.getProfilesContext();
      const nowIso = new Date().toISOString();
      const incoming = c.req.valid('json');
      const incomingObj = incoming as Record<string, unknown>;

      const txResult = dbCtx.runInTransaction(() => {
        const rawRow = dbCtx.stmts.quillGetById.get(noteId);
        const existingRow = isQuillNoteRow(rawRow) ? rawRow : undefined;
        if (existingRow && !isRowVisibleToPartner(existingRow, callerProfile)) {
          return { error: 'Note not found', status: 404 as const };
        }
        const existing = parseRowRecord(existingRow);
        if (!existing) {
          return { error: 'Note not found', status: 404 as const };
        }

        if (
          incoming.baseRevision !== undefined &&
          incoming.baseRevision !== null &&
          Number(incoming.baseRevision) !== Number(existing.revision || 1)
        ) {
          return {
            conflict: resolveQuillNote(existing, profilesById),
            status: 409 as const
          };
        }

        const patch: Record<string, unknown> = {};
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
          if (incomingObj[key] !== undefined) {
            patch[key] = incomingObj[key];
          }
        }

        if (patch.type === 'checklist' && existing.type === 'text') {
          if (patch.items === undefined) patch.items = convertBodyToItems(existing.body);
          if (patch.body === undefined) patch.body = '';
        } else if (patch.type === 'text' && existing.type === 'checklist') {
          if (patch.body === undefined) patch.body = convertItemsToBody(existing.items);
          if (patch.items === undefined) patch.items = [];
        }

        const nextVisibility = (
          patch.visibility !== undefined ? patch.visibility : existing.visibility
        ) as QuillVisibility;
        const nextStatus = (
          patch.status !== undefined ? patch.status : existing.status
        ) as QuillStatus;
        const nextPinned = patch.pinned !== undefined ? Boolean(patch.pinned) : existing.pinned;
        const nextOwnerForBucket: ProfileId =
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
        if (validated.error !== undefined) {
          return { error: validated.error, status: 400 as const };
        }

        const rec: QuillNote = { ...validated.record, id: noteId };
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
        if (rec.visibility === 'shared') {
          ensureHouseholdLabelsInclude(dbCtx, rec.labels, nowIso);
        }
        return { rec } as const;
      });

      if ('conflict' in txResult) {
        return c.json(
          {
            error: 'Note was updated by another household member',
            note: txResult.conflict
          },
          409
        );
      }
      if ('error' in txResult) {
        return c.json({ error: txResult.error }, txResult.status);
      }

      cache.bumpRevision('quill');
      return c.json({ note: resolveQuillNote(txResult.rec, profilesById), updatedAt: nowIso }, 200);
    })
    .delete('/notes/:noteId', (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const callerProfile = auth.profileId;
      const noteId = c.req.param('noteId').trim();
      if (!noteId) {
        return c.json({ error: 'Invalid or missing note ID' }, 400);
      }

      const nowIso = new Date().toISOString();
      const txResult = dbCtx.runInTransaction(() => {
        const rawRow = dbCtx.stmts.quillGetById.get(noteId);
        const existingRow = isQuillNoteRow(rawRow) ? rawRow : undefined;
        if (existingRow && !isRowVisibleToPartner(existingRow, callerProfile)) {
          return { error: 'Note not found', status: 404 as const };
        }
        const existing = parseRowRecord(existingRow);
        if (!existing) {
          return { error: 'Note not found', status: 404 as const };
        }
        if (existing.status !== 'trashed') {
          return { error: 'Only trashed notes can be permanently deleted', status: 400 as const };
        }
        const res = dbCtx.stmts.quillDelete.run(noteId);
        return { changed: res.changes > 0 } as const;
      });

      if ('error' in txResult) {
        return c.json({ error: txResult.error }, txResult.status);
      }
      if (txResult.changed) {
        cache.bumpRevision('quill');
      }
      return c.json({ deleted: true, id: noteId, updatedAt: nowIso }, 200);
    });
}

export type { QuillNote };
export { QuillNoteSchema };
