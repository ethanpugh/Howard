import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';
import { normalizeProfileId } from '../shared/profileUtils.ts';
import type { ProfileId } from '../shared/schemas/common.ts';

export type PartnerAuthResult =
  | { ok: true; profileId: 'partner1' | 'partner2' }
  | { ok: false; error: string };

export function getCallerProfile(c: Context): ProfileId {
  const raw = c.req.query('profile') || c.req.header('x-howard-profile') || 'caregiver';
  return normalizeProfileId(raw, 'caregiver');
}

export function requirePartner(c: Context): PartnerAuthResult {
  const profileId = getCallerProfile(c);
  if (profileId === 'caregiver') {
    return { ok: false, error: 'Caregiver profile cannot modify this resource' };
  }
  return { ok: true, profileId };
}

export function requireSelfPartner(c: Context, targetProfileId: ProfileId): PartnerAuthResult {
  const auth = requirePartner(c);
  if (!auth.ok) return auth;
  if (auth.profileId !== targetProfileId) {
    return { ok: false, error: 'Cannot change PIN settings for another profile' };
  }
  return auth;
}

export function jsonBody<T extends ZodType>(schema: T) {
  return [
    async (c: Context, next: () => Promise<void>): Promise<Response | void> => {
      const ct = (c.req.header('content-type') || '').toLowerCase();
      if (!ct.includes('application/json') && !/\+json\b/i.test(ct)) {
        return c.json({ error: 'Content-Type must be application/json' }, 415);
      }
      await next();
    },
    zValidator('json', schema, (result, c) => {
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        return c.json({ error: firstIssue?.message || 'Invalid request payload' }, 400);
      }
      return undefined;
    })
  ] as const;
}

const PIN_RATE_WINDOW_MS = 5 * 60 * 1000;
const PIN_RATE_MAX_FAILS = 5;

export interface PinRateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

export function createPinRateLimiter() {
  const buckets = new Map<string, number[]>();

  function getClientKey(c: Context, profileId: string): string {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip')?.trim() ||
      'local';
    return `${profileId}:${ip}`;
  }

  function check(c: Context, profileId: string): PinRateLimitResult {
    const key = getClientKey(c, profileId);
    const now = Date.now();
    const recent = (buckets.get(key) || []).filter((ts) => now - ts < PIN_RATE_WINDOW_MS);
    if (recent.length > 0) buckets.set(key, recent);
    else buckets.delete(key);

    if (recent.length >= PIN_RATE_MAX_FAILS) {
      const oldest = recent[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + PIN_RATE_WINDOW_MS - now) / 1000));
      return { allowed: false, retryAfterSec };
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  function recordFailure(c: Context, profileId: string): void {
    const key = getClientKey(c, profileId);
    const now = Date.now();
    const recent = (buckets.get(key) || []).filter((ts) => now - ts < PIN_RATE_WINDOW_MS);
    recent.push(now);
    buckets.set(key, recent);
  }

  function reset(c: Context, profileId: string): void {
    buckets.delete(getClientKey(c, profileId));
  }

  return { check, recordFailure, reset };
}
