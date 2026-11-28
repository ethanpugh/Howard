import {
  VALID_DATE_KEY_RE,
  isValidDateKey,
  getLocalDateKey,
  parseLocalDateKey,
  shiftDateKey,
  getMondayOfWeek,
  getCalendarWeekDays,
  formatWeekRangeLabel,
  buildMonthGrid,
  type MonthGridCell
} from '../../shared/dateUtils.ts';
import {
  DEFAULT_PROFILES,
  VALID_APP_IDS,
  isProfileId,
  normalizeProfileId,
  inferProfileIdFromName,
  resolveProfileDisplayName,
  isAlmanacEventVisibleToProfile,
  type AlmanacVisibilityTarget
} from '../../shared/profileUtils.ts';
import type { AppId } from '../../shared/schemas/common.ts';
import {
  createDefaultCadenceSettings,
  createDefaultBloomSettings,
  DEFAULT_FLOODGATE_SETTINGS,
  DEFAULT_LEDGER_DATA,
  DEFAULT_BEACON_INFO,
  DEFAULT_QUILL_SETTINGS
} from '../../shared/defaults.ts';
import type {
  BloomClimateCheck,
  BloomFeedingEntry,
  BloomMistEntry,
  BloomMoltRecord,
  BloomSettings,
  BloomSnapshot,
  BloomFeederCulture
} from '../../shared/schemas/bloom.ts';
import type { CadenceSettings } from '../../shared/schemas/cadence.ts';
import type { LedgerItem } from '../../shared/schemas/ledger.ts';

export {
  VALID_DATE_KEY_RE,
  isValidDateKey,
  getLocalDateKey,
  parseLocalDateKey,
  shiftDateKey,
  getMondayOfWeek,
  getCalendarWeekDays,
  formatWeekRangeLabel,
  buildMonthGrid,
  DEFAULT_PROFILES,
  VALID_APP_IDS,
  isProfileId,
  normalizeProfileId,
  inferProfileIdFromName,
  resolveProfileDisplayName,
  isAlmanacEventVisibleToProfile,
  createDefaultCadenceSettings,
  createDefaultBloomSettings,
  DEFAULT_FLOODGATE_SETTINGS,
  DEFAULT_LEDGER_DATA,
  DEFAULT_BEACON_INFO,
  DEFAULT_QUILL_SETTINGS
};
export type { MonthGridCell, AlmanacVisibilityTarget };

export const isAppId = (value: unknown): value is AppId =>
  typeof value === 'string' && VALID_APP_IDS.has(value as AppId);

export const formatTelHref = (phone: string | null | undefined): string => {
  const trimmed = String(phone || '').trim();
  if (!trimmed) return '';
  const hasPlus = trimmed.startsWith('+');
  const dialChars = trimmed.replace(/[^0-9*#]/g, '');
  if (!dialChars) return '';
  return `tel:${hasPlus ? '+' : ''}${dialChars}`;
};

export const formatFriendlyDate = (
  dateKey: string | null | undefined,
  todayKey: string = getLocalDateKey(new Date())
): string => {
  if (!dateKey) return '';
  if (dateKey === todayKey) return 'Today';
  if (dateKey === shiftDateKey(todayKey, -1)) return 'Yesterday';
  if (dateKey === shiftDateKey(todayKey, 1)) return 'Tomorrow';
  return parseLocalDateKey(dateKey).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
};

export const formatTimeDisplay = (isoString: string | null | undefined): string => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const formatDurationAgo = (
  isoString: string | null | undefined,
  nowMs: number = Date.now()
): string | null => {
  if (!isoString) return null;
  const ts = new Date(isoString).getTime();
  if (!Number.isFinite(ts)) return null;
  const diffMs = Math.max(0, nowMs - ts);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 48) return remMins > 0 ? `${hrs}h ${remMins}m ago` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

export const formatCountdown = (
  targetIso: string | null | undefined,
  nowMs: number = Date.now()
): string => {
  if (!targetIso) return '';
  const ts = new Date(targetIso).getTime();
  if (!Number.isFinite(ts)) return '';
  const diffMs = Math.max(0, ts - nowMs);
  const totalMins = Math.ceil(diffMs / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs <= 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
};

export const formatOrdinalDay = (dayNum: number | string): string => {
  const d = Number(dayNum) || 1;
  const j = d % 10;
  const k = d % 100;
  if (j === 1 && k !== 11) return `${d}st`;
  if (j === 2 && k !== 12) return `${d}nd`;
  if (j === 3 && k !== 13) return `${d}rd`;
  return `${d}th`;
};

export const formatGBP = (num: number | string | null | undefined): string => {
  const raw = Number(num);
  const val = Number.isFinite(raw) && Math.abs(raw) >= 0.005 ? raw : 0;
  return val.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

export const toMonthlyAmount = (
  amount: number | string,
  cycleOrFreq?: string
): number => {
  const raw = Number(amount);
  const val = Number.isFinite(raw) ? raw : 0;
  switch (cycleOrFreq) {
    case 'annual':
      return val / 12;
    case 'quarterly':
      return val / 3;
    case 'weekly':
      return (val * 52) / 12;
    case 'one-off':
    case 'monthly':
    default:
      return val;
  }
};

export const escapeCSVCell = (val: unknown): string => {
  if (val === null || val === undefined) return '""';
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '""';
    const numStr = Object.is(val, -0) ? '0' : String(val);
    return `"${numStr.replace(/"/g, '""')}"`;
  }
  const raw = String(val);
  // Neutralize formula triggers even when preceded by spaces or newlines (SEC-11)
  const trimmedLead = raw.trimStart();
  const needsEscape = /^[=+\-@\t\r]/.test(raw) || /^[=+\-@]/.test(trimmedLead);
  const safe = needsEscape ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function copyTextToClipboard(text: unknown): Promise<boolean> {
  if (text === undefined || text === null) return false;
  const str = String(text);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(str);
      return true;
    }
  } catch {
    // Fall back for plain HTTP LAN origins where navigator.clipboard is unavailable
  }
  if (typeof document === 'undefined' || !document.body) return false;
  const ta = document.createElement('textarea');
  try {
    ta.value = str;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, str.length);
    return Boolean(document.execCommand('copy'));
  } catch {
    return false;
  } finally {
    if (ta.parentNode) {
      ta.parentNode.removeChild(ta);
    }
  }
}

export const WEEKDAY_OPTIONS = [
  { id: 1, label: 'Monday', shortLabel: 'Mon' },
  { id: 2, label: 'Tuesday', shortLabel: 'Tue' },
  { id: 3, label: 'Wednesday', shortLabel: 'Wed' },
  { id: 4, label: 'Thursday', shortLabel: 'Thu' },
  { id: 5, label: 'Friday', shortLabel: 'Fri' },
  { id: 6, label: 'Saturday', shortLabel: 'Sat' },
  { id: 7, label: 'Sunday', shortLabel: 'Sun' }
] as const;

export const DEFAULT_BLOOM_SETTINGS: BloomSettings = createDefaultBloomSettings();

export interface EnrichedBloomFeeder extends BloomFeederCulture {
  ageDays: number;
  shelfLifeDays: number;
  daysRemaining: number;
  isAlert: boolean;
}

export interface BloomLastMist extends BloomMistEntry {
  dateKey: string;
  hoursAgo: number;
  timeAgoLabel: string | null;
  isToday: boolean;
}

export interface BloomLastMeal extends BloomFeedingEntry {
  dateKey: string;
  daysAgo: number;
  friendlyWhen: string;
}

export interface BloomLastRefusal extends BloomFeedingEntry {
  dateKey: string;
}

export interface BloomLatestClimate extends BloomClimateCheck {
  dateKey: string;
}

export interface BloomSummary {
  settings: BloomSettings;
  molts: BloomMoltRecord[];
  feeders: EnrichedBloomFeeder[];
  feederAlerts: EnrichedBloomFeeder[];
  effectiveStatus: 'normal' | 'premolt' | 'hardening' | 'hardened_ready';
  hardeningRemainingLabel: string;
  isNoFeedLockout: boolean;
  lastMist: BloomLastMist | null;
  todayMistCount: number;
  isMistDue: boolean;
  lastMeal: BloomLastMeal | null;
  lastRefusal: BloomLastRefusal | null;
  latestAbdomen: string | null;
  latestClimate: BloomLatestClimate | null;
  todayLog: {
    dateKey: string;
    mists: BloomMistEntry[];
    feedings: BloomFeedingEntry[];
    climateChecks: BloomClimateCheck[];
    behaviors: string[];
    abdomenStatus?: string | undefined;
    abdomenUpdatedAt?: string | undefined;
    journalNote?: string | undefined;
  };
  latestMolt: BloomMoltRecord | null;
  daysInCurrentInstar: number;
  avgInterMoltDays: number;
  projectedNextMoltDateStr: string | null;
  isAdult: boolean;
  clearance: {
    bodyLen: number;
    encH: number;
    encW: number;
    minSafeHeightMm: number;
    minSafeWidthMm: number;
    isEnclosureTight: boolean;
  };
}

export interface PartialBloomSnapshot {
  settings?: Partial<BloomSettings> | undefined;
  logsByDate?: BloomSnapshot['logsByDate'] | undefined;
  molts?: Array<Partial<BloomMoltRecord> & { id: string; dateKey: string }> | undefined;
  feeders?: Array<Partial<BloomFeederCulture> & { id: string }> | undefined;
}

function getSafeEpochMs(isoOrDate: string | null | undefined, fallbackDateKey?: string): number {
  if (isoOrDate) {
    const parsed = Date.parse(isoOrDate);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (fallbackDateKey && isValidDateKey(fallbackDateKey)) {
    return parseLocalDateKey(fallbackDateKey).getTime();
  }
  return 0;
}

export function computeBloomSummary(
  bloomSnapshot: BloomSnapshot | PartialBloomSnapshot | null | undefined,
  now: Date = new Date()
): BloomSummary {
  const nowMs = now.getTime();
  const todayKey = getLocalDateKey(now);
  const baseDefaults = createDefaultBloomSettings(now);
  const rawSettings = bloomSnapshot?.settings || {};
  const settings: BloomSettings = {
    ...baseDefaults,
    ...rawSettings,
    enclosureInfo: {
      ...baseDefaults.enclosureInfo,
      ...rawSettings.enclosureInfo
    }
  };

  const logsByDate = bloomSnapshot?.logsByDate || {};
  const molts = [...((bloomSnapshot?.molts || []) as BloomMoltRecord[])]
    .filter((m) => m && (!m.dateKey || isValidDateKey(m.dateKey)))
    .sort((a, b) => {
      const dateCmp = (b.dateKey || '').localeCompare(a.dateKey || '');
      if (dateCmp !== 0) return dateCmp;
      return getSafeEpochMs(b.timestamp, b.dateKey) - getSafeEpochMs(a.timestamp, a.dateKey);
    });
  const feeders = (bloomSnapshot?.feeders || []) as BloomFeederCulture[];

  let effectiveStatus: BloomSummary['effectiveStatus'] = 'normal';
  let hardeningRemainingLabel = '';
  if (settings.lifecycleStatus === 'premolt') {
    effectiveStatus = 'premolt';
  } else if (settings.lifecycleStatus === 'hardening') {
    const untilMs = settings.hardeningUntil ? new Date(settings.hardeningUntil).getTime() : NaN;
    if (Number.isFinite(untilMs) && untilMs > nowMs) {
      effectiveStatus = 'hardening';
      hardeningRemainingLabel = formatCountdown(settings.hardeningUntil, nowMs);
    } else {
      effectiveStatus = 'hardened_ready';
    }
  }
  const isNoFeedLockout = effectiveStatus === 'premolt' || effectiveStatus === 'hardening';

  const sortedDateKeys = Object.keys(logsByDate)
    .filter((dKey) => isValidDateKey(dKey) && dKey <= todayKey)
    .sort()
    .reverse();
  let lastMist: BloomLastMist | null = null;
  let lastMeal: BloomLastMeal | null = null;
  let lastRefusal: BloomLastRefusal | null = null;
  let latestAbdomen: string | null = null;
  let latestClimate: BloomLatestClimate | null = null;

  for (const dKey of sortedDateKeys) {
    const dayLog = logsByDate[dKey] || {};
    if (!lastMist && Array.isArray(dayLog.mists) && dayLog.mists.length > 0) {
      const m = [...dayLog.mists].sort(
        (a, b) => getSafeEpochMs(b.timestamp, dKey) - getSafeEpochMs(a.timestamp, dKey)
      )[0]!;
      const parsedMistMs = m.timestamp ? new Date(m.timestamp).getTime() : NaN;
      const hasValidTs = Number.isFinite(parsedMistMs);
      const mMs = hasValidTs ? parsedMistMs : parseLocalDateKey(dKey).getTime();
      const hoursAgo = Math.max(0, (nowMs - mMs) / 3600000);
      lastMist = {
        ...m,
        dateKey: dKey,
        hoursAgo,
        timeAgoLabel: hasValidTs
          ? formatDurationAgo(m.timestamp, nowMs)
          : formatFriendlyDate(dKey, todayKey),
        isToday: dKey === todayKey
      };
    }

    let newestFeedWithAbdomen: BloomFeedingEntry | null = null;
    if (Array.isArray(dayLog.feedings) && dayLog.feedings.length > 0) {
      const sortedFeeds = [...dayLog.feedings].sort(
        (a, b) => getSafeEpochMs(b.timestamp, dKey) - getSafeEpochMs(a.timestamp, dKey)
      );
      for (const f of sortedFeeds) {
        if (!newestFeedWithAbdomen && f.abdomenAfter) {
          newestFeedWithAbdomen = f;
        }
        if (!lastMeal && (f.outcome === 'eaten' || f.outcome === 'partial' || !f.outcome)) {
          const daysAgo = Math.max(
            0,
            Math.round(
              (parseLocalDateKey(todayKey).getTime() - parseLocalDateKey(dKey).getTime()) /
                86400000
            )
          );
          lastMeal = {
            ...f,
            dateKey: dKey,
            daysAgo,
            friendlyWhen: formatFriendlyDate(dKey, todayKey)
          };
        }
        if (!lastRefusal && f.outcome === 'refused') {
          lastRefusal = { ...f, dateKey: dKey };
        }
      }
    }

    if (!latestAbdomen) {
      if (dayLog.abdomenStatus && newestFeedWithAbdomen) {
        const abMs = dayLog.abdomenUpdatedAt ? new Date(dayLog.abdomenUpdatedAt).getTime() : NaN;
        const feedMs = newestFeedWithAbdomen.timestamp
          ? new Date(newestFeedWithAbdomen.timestamp).getTime()
          : NaN;
        if (Number.isFinite(abMs) && Number.isFinite(feedMs)) {
          latestAbdomen =
            abMs >= feedMs
              ? dayLog.abdomenStatus
              : (newestFeedWithAbdomen.abdomenAfter ?? dayLog.abdomenStatus);
        } else {
          latestAbdomen = dayLog.abdomenStatus;
        }
      } else if (dayLog.abdomenStatus) {
        latestAbdomen = dayLog.abdomenStatus;
      } else if (newestFeedWithAbdomen?.abdomenAfter) {
        latestAbdomen = newestFeedWithAbdomen.abdomenAfter;
      }
    }

    if (!latestClimate && Array.isArray(dayLog.climateChecks) && dayLog.climateChecks.length > 0) {
      const c = [...dayLog.climateChecks].sort(
        (a, b) => getSafeEpochMs(b.timestamp, dKey) - getSafeEpochMs(a.timestamp, dKey)
      )[0]!;
      latestClimate = { ...c, dateKey: dKey };
    }
  }

  const rawTodayLog = logsByDate[todayKey];
  const todayLog = {
    dateKey: todayKey,
    mists: rawTodayLog?.mists || [],
    feedings: rawTodayLog?.feedings || [],
    climateChecks: rawTodayLog?.climateChecks || [],
    behaviors: rawTodayLog?.behaviors || [],
    ...(rawTodayLog?.abdomenStatus ? { abdomenStatus: rawTodayLog.abdomenStatus } : {}),
    ...(rawTodayLog?.abdomenUpdatedAt ? { abdomenUpdatedAt: rawTodayLog.abdomenUpdatedAt } : {}),
    ...(rawTodayLog?.journalNote ? { journalNote: rawTodayLog.journalNote } : {})
  };
  const todayMistCount = todayLog.mists.length;
  const mistTargetHours = Number(settings.mistTargetHours) || 24;
  const isMistDue = !lastMist || lastMist.hoursAgo >= mistTargetHours;

  const latestMolt = molts[0] || null;
  const stageAnchorDateStr = latestMolt?.dateKey || settings.arrivalDate || todayKey;
  const daysInCurrentInstar = Math.max(
    0,
    Math.round(
      (parseLocalDateKey(todayKey).getTime() - parseLocalDateKey(stageAnchorDateStr).getTime()) /
        86400000
    )
  );

  let avgInterMoltDays = Number(settings.typicalInterMoltDays) || 14;
  if (molts.length >= 2) {
    const ascMolts = [...molts].sort((a, b) => (a.dateKey || '').localeCompare(b.dateKey || ''));
    let totalSpan = 0;
    let intervals = 0;
    for (let i = 1; i < ascMolts.length; i++) {
      const diff = Math.round(
        (parseLocalDateKey(ascMolts[i]!.dateKey).getTime() -
          parseLocalDateKey(ascMolts[i - 1]!.dateKey).getTime()) /
          86400000
      );
      if (diff > 2 && diff < 90) {
        totalSpan += diff;
        intervals += 1;
      }
    }
    if (intervals > 0) {
      avgInterMoltDays = Math.round(totalSpan / intervals);
    }
  }

  const isAdult = settings.currentInstar === 'Adult';
  const projectedNextMoltDateStr = isAdult
    ? null
    : shiftDateKey(stageAnchorDateStr, avgInterMoltDays);

  const enrichedFeeders: EnrichedBloomFeeder[] = feeders
    .filter((f) => f.active !== false)
    .map((f) => {
      const ageDays = Math.max(
        0,
        Math.round(
          (parseLocalDateKey(todayKey).getTime() -
            parseLocalDateKey(f.startedDate || todayKey).getTime()) /
            86400000
        )
      );
      const shelfLifeDays = Number(f.shelfLifeDays) || 28;
      const daysRemaining = shelfLifeDays - ageDays;
      const isAlert = f.status === 'low' || f.status === 'crashed' || daysRemaining <= 5;
      return {
        ...f,
        ageDays,
        shelfLifeDays,
        daysRemaining,
        isAlert
      };
    });

  const feederAlerts = enrichedFeeders.filter((f) => f.isAlert);

  const bodyLen = Number(settings.enclosureInfo?.currentBodyLengthMm) || 10;
  const encH = Number(settings.enclosureInfo?.enclosureHeightMm) || 110;
  const encW = Number(settings.enclosureInfo?.enclosureWidthMm) || 75;
  const minSafeHeightMm = bodyLen * 3;
  const minSafeWidthMm = bodyLen * 2;
  const isEnclosureTight = encH < minSafeHeightMm || encW < minSafeWidthMm;

  return {
    settings,
    molts,
    feeders: enrichedFeeders,
    feederAlerts,
    effectiveStatus,
    hardeningRemainingLabel,
    isNoFeedLockout,
    lastMist,
    todayMistCount,
    isMistDue,
    lastMeal,
    lastRefusal,
    latestAbdomen,
    latestClimate,
    todayLog,
    latestMolt,
    daysInCurrentInstar,
    avgInterMoltDays,
    projectedNextMoltDateStr,
    isAdult,
    clearance: {
      bodyLen,
      encH,
      encW,
      minSafeHeightMm,
      minSafeWidthMm,
      isEnclosureTight
    }
  };
}

export interface AlmanacRecurrenceTarget {
  date?: string | undefined;
  recurrence?: string | undefined;
  untilDate?: string | undefined;
  skippedDates?: string[] | undefined;
}

export const doesAlmanacEventOccurOnDate = (
  evt: AlmanacRecurrenceTarget | null | undefined,
  targetDateStr: string
): boolean => {
  if (!evt || !evt.date || !targetDateStr) return false;
  if (targetDateStr < evt.date) return false;
  if (evt.untilDate && targetDateStr > evt.untilDate) return false;
  if (Array.isArray(evt.skippedDates) && evt.skippedDates.includes(targetDateStr)) {
    return false;
  }

  const rec = evt.recurrence || 'none';
  if (rec === 'none') {
    return evt.date === targetDateStr;
  }

  const [sy = 1970, sm = 1, sd = 1] = evt.date.split('-').map(Number);
  const [ty = 1970, tm = 1, td = 1] = targetDateStr.split('-').map(Number);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const targetUtc = Date.UTC(ty, tm - 1, td);
  const diffDays = Math.round((targetUtc - startUtc) / 86400000);

  if (diffDays < 0) return false;
  if (rec === 'weekly') return diffDays % 7 === 0;
  if (rec === 'fortnightly') return diffDays % 14 === 0;
  if (rec === 'monthly') {
    const maxDayInTargetMonth = new Date(ty, tm, 0).getDate();
    const clampedDay = Math.min(maxDayInTargetMonth, sd);
    return td === clampedDay;
  }
  if (rec === 'annual') {
    const maxDayInTargetMonth = new Date(ty, tm, 0).getDate();
    const clampedDay = Math.min(maxDayInTargetMonth, sd);
    return sm === tm && td === clampedDay;
  }
  return evt.date === targetDateStr;
};

export type LedgerScheduleTarget = Partial<LedgerItem>;

export interface LedgerScheduleInfo {
  daysUntil: number;
  nextDateFormatted: string;
  scheduleLabel: string;
}

export const getLedgerScheduleInfo = (
  item: LedgerScheduleTarget | null | undefined,
  isIncome = false,
  now: Date = new Date()
): LedgerScheduleInfo => {
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cycle = (isIncome ? item?.frequency : item?.cycle) || 'monthly';
  const rawDay = Math.min(
    31,
    Math.max(1, Number(isIncome ? item?.payDay : item?.billingDay) || (isIncome ? 28 : 1))
  );
  const weekday = Math.min(
    7,
    Math.max(
      1,
      Number(isIncome ? item?.payWeekday : item?.billingWeekday) || (isIncome ? 5 : 1)
    )
  );
  const anchorDateStr = (isIncome ? item?.payDate : item?.billingDate) || '';

  const getClampedDate = (yr: number, moIndex: number, d: number): Date => {
    const maxDay = new Date(yr, moIndex + 1, 0).getDate();
    return new Date(yr, moIndex, Math.min(maxDay, Math.max(1, d)));
  };

  let candidate = todayDate;
  let scheduleLabel = '';

  if (cycle === 'one-off') {
    const rawOneOffDate = item?.date || anchorDateStr;
    candidate = /^\d{4}-\d{2}-\d{2}$/.test(rawOneOffDate)
      ? parseLocalDateKey(rawOneOffDate)
      : todayDate;
    scheduleLabel = 'One-off';
  } else if (cycle === 'weekly') {
    const todayIsoWeekday = ((todayDate.getDay() + 6) % 7) + 1;
    const diff = (weekday - todayIsoWeekday + 7) % 7;
    candidate = new Date(
      todayDate.getFullYear(),
      todayDate.getMonth(),
      todayDate.getDate() + diff
    );
    const weekdayMeta = WEEKDAY_OPTIONS.find((w) => w.id === weekday) || WEEKDAY_OPTIONS[0];
    scheduleLabel = `Every ${weekdayMeta.label}`;
  } else if (cycle === 'annual') {
    let am = 1;
    let ad = rawDay;
    if (/^\d{4}-\d{2}-\d{2}$/.test(anchorDateStr)) {
      const parts = anchorDateStr.split('-').map(Number);
      am = parts[1] ?? 1;
      ad = parts[2] ?? rawDay;
    }
    candidate = getClampedDate(now.getFullYear(), am - 1, ad);
    if (candidate < todayDate) {
      candidate = getClampedDate(now.getFullYear() + 1, am - 1, ad);
    }
    const dayMonthText = candidate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short'
    });
    scheduleLabel = `Annually on ${dayMonthText}`;
  } else if (cycle === 'quarterly') {
    let am = 1;
    let ad = rawDay;
    if (/^\d{4}-\d{2}-\d{2}$/.test(anchorDateStr)) {
      const parts = anchorDateStr.split('-').map(Number);
      am = parts[1] ?? 1;
      ad = parts[2] ?? rawDay;
    }
    for (let offset = 0; offset <= 4; offset++) {
      const probe = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const py = probe.getFullYear();
      const pm = probe.getMonth() + 1;
      if (((pm - am) % 3 + 3) % 3 === 0) {
        const cand = getClampedDate(py, pm - 1, ad);
        if (cand >= todayDate) {
          candidate = cand;
          break;
        }
      }
    }
    scheduleLabel = `Quarterly (${formatOrdinalDay(ad)})`;
  } else {
    candidate = getClampedDate(now.getFullYear(), now.getMonth(), rawDay);
    if (candidate < todayDate) {
      candidate = getClampedDate(now.getFullYear(), now.getMonth() + 1, rawDay);
    }
    scheduleLabel = `${formatOrdinalDay(rawDay)} of month`;
  }

  const diffDays = Math.round(
    (candidate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  return {
    daysUntil: diffDays,
    nextDateFormatted: candidate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(candidate.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
    }),
    scheduleLabel
  };
};

export const doesLedgerItemOccurOnDate = (
  item: LedgerScheduleTarget | null | undefined,
  targetDateStr: string,
  isIncome = false
): boolean => {
  if (!item || !targetDateStr || !isValidDateKey(targetDateStr)) return false;
  const cycle = (isIncome ? item.frequency : item.cycle) || 'monthly';
  const anchorDateStr = (isIncome ? item.payDate : item.billingDate) || '';
  if (cycle === 'one-off') {
    const oneOffDate = item.date || anchorDateStr;
    return oneOffDate === targetDateStr;
  }

  const [ty = 1970, tm = 1, td = 1] = targetDateStr.split('-').map(Number);
  const rawDay = Math.min(
    31,
    Math.max(1, Number(isIncome ? item.payDay : item.billingDay) || (isIncome ? 28 : 1))
  );

  if (cycle === 'weekly') {
    const weekday = Math.min(
      7,
      Math.max(
        1,
        Number(isIncome ? item.payWeekday : item.billingWeekday) || (isIncome ? 5 : 1)
      )
    );
    const utcDt = new Date(Date.UTC(ty, tm - 1, td));
    const targetIsoWeekday = ((utcDt.getUTCDay() + 6) % 7) + 1;
    return targetIsoWeekday === weekday;
  }

  const maxDayInTargetMonth = new Date(Date.UTC(ty, tm, 0)).getUTCDate();

  if (cycle === 'annual') {
    let am = 1;
    let ad = rawDay;
    if (/^\d{4}-\d{2}-\d{2}$/.test(anchorDateStr)) {
      const parts = anchorDateStr.split('-').map(Number);
      am = parts[1] ?? 1;
      ad = parts[2] ?? rawDay;
    }
    return tm === am && td === Math.min(maxDayInTargetMonth, ad);
  }

  if (cycle === 'quarterly') {
    let am = 1;
    let ad = rawDay;
    if (/^\d{4}-\d{2}-\d{2}$/.test(anchorDateStr)) {
      const parts = anchorDateStr.split('-').map(Number);
      am = parts[1] ?? 1;
      ad = parts[2] ?? rawDay;
    }
    const monthDiff = ((tm - am) % 3 + 3) % 3;
    return monthDiff === 0 && td === Math.min(maxDayInTargetMonth, ad);
  }

  return td === Math.min(maxDayInTargetMonth, rawDay);
};

export interface LedgerSettlementExpense {
  owner?: string | undefined;
  paidBy?: string | undefined;
  amount?: number | string | undefined;
}

export interface LedgerSettlementResult {
  partner1PaidForJoint: number;
  partner2PaidForJoint: number;
  partner1PaidForPartner2Personal: number;
  partner2PaidForPartner1Personal: number;
  partner1PersonalPaidByJoint: number;
  partner2PersonalPaidByJoint: number;
  netPartner1Balance: number;
}

export const resolveExpensePaidBy = (
  expense: LedgerSettlementExpense | null | undefined
): 'joint' | 'partner1' | 'partner2' => {
  if (expense?.paidBy === 'partner1' || expense?.paidBy === 'partner2' || expense?.paidBy === 'joint') {
    return expense.paidBy;
  }
  if (expense?.owner === 'partner1' || expense?.owner === 'partner2') {
    return expense.owner;
  }
  return 'joint';
};

const roundFromPence = (pence: number): number => {
  const rounded = Math.round(pence) / 100;
  return Object.is(rounded, -0) || rounded === 0 ? 0 : rounded;
};

export const computeLedgerSettlement = (
  monthExpenses: LedgerSettlementExpense[] = [],
  partner1JointShare = 0.5
): LedgerSettlementResult => {
  const clampedShare = Number.isFinite(partner1JointShare)
    ? Math.min(1, Math.max(0, partner1JointShare))
    : 0.5;
  const s1 = clampedShare;
  const s2 = 1 - s1;
  let partner1PaidForJointPence = 0;
  let partner2PaidForJointPence = 0;
  let partner1PaidForPartner2PersonalPence = 0;
  let partner2PaidForPartner1PersonalPence = 0;
  let partner1PersonalPaidByJointPence = 0;
  let partner2PersonalPaidByJointPence = 0;
  let netPartner1BalancePence = 0;

  for (const e of monthExpenses || []) {
    if (!e) continue;
    const rawNum = Number(e.amount);
    const pence = Number.isFinite(rawNum) ? Math.round(rawNum * 100) : 0;
    const paidBy = resolveExpensePaidBy(e);
    if (e.owner === 'joint') {
      if (paidBy === 'partner1') {
        partner1PaidForJointPence += pence;
        netPartner1BalancePence += Math.round(pence * s2);
      } else if (paidBy === 'partner2') {
        partner2PaidForJointPence += pence;
        netPartner1BalancePence -= Math.round(pence * s1);
      }
    } else if (e.owner === 'partner2') {
      if (paidBy === 'partner1') {
        partner1PaidForPartner2PersonalPence += pence;
        netPartner1BalancePence += pence;
      } else if (paidBy === 'joint') {
        partner2PersonalPaidByJointPence += pence;
        netPartner1BalancePence += Math.round(pence * s1);
      }
    } else if (e.owner === 'partner1') {
      if (paidBy === 'partner2') {
        partner2PaidForPartner1PersonalPence += pence;
        netPartner1BalancePence -= pence;
      } else if (paidBy === 'joint') {
        partner1PersonalPaidByJointPence += pence;
        netPartner1BalancePence -= Math.round(pence * s2);
      }
    }
  }

  return {
    partner1PaidForJoint: roundFromPence(partner1PaidForJointPence),
    partner2PaidForJoint: roundFromPence(partner2PaidForJointPence),
    partner1PaidForPartner2Personal: roundFromPence(partner1PaidForPartner2PersonalPence),
    partner2PaidForPartner1Personal: roundFromPence(partner2PaidForPartner1PersonalPence),
    partner1PersonalPaidByJoint: roundFromPence(partner1PersonalPaidByJointPence),
    partner2PersonalPaidByJoint: roundFromPence(partner2PersonalPaidByJointPence),
    netPartner1Balance: roundFromPence(netPartner1BalancePence)
  };
};

export const downloadTextFile = (
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8'
): void => {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export interface BottleStatus {
  openedDateFormatted: string;
  expiryDateFormatted: string;
  expiryFormatted: string;
  diffDaysOpen: number;
  daysRemaining: number;
  percentUsed: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  isAlert: boolean;
}

export const computeBottleStatus = (
  settings: Partial<CadenceSettings> = {},
  todayKey: string = getLocalDateKey(new Date())
): BottleStatus => {
  const openedStr = settings?.bottleOpenedDate || todayKey;
  const shelfLife = Number(settings?.bottleShelfLifeDays) || 180;
  const openedDate = parseLocalDateKey(openedStr);
  const expiryDate = new Date(openedDate.getTime());
  expiryDate.setDate(expiryDate.getDate() + shelfLife);

  const todayMidnight = parseLocalDateKey(todayKey);
  const diffDaysOpen = Math.max(
    0,
    Math.round((todayMidnight.getTime() - openedDate.getTime()) / (1000 * 60 * 60 * 24))
  );
  const daysRemaining = Math.round(
    (expiryDate.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)
  );
  const percentUsed = Math.min(100, Math.max(0, Math.round((diffDaysOpen / shelfLife) * 100)));
  const fmt = (dt: Date) =>
    dt.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

  return {
    openedDateFormatted: fmt(openedDate),
    expiryDateFormatted: fmt(expiryDate),
    expiryFormatted: fmt(expiryDate),
    diffDaysOpen,
    daysRemaining,
    percentUsed,
    isExpired: daysRemaining <= 0,
    isExpiringSoon: daysRemaining > 0 && daysRemaining <= 14,
    isAlert: daysRemaining <= 14
  };
};

export const formatShortPreyLabel = (preyLabel = ''): string =>
  String(preyLabel || '').split(' (')[0]!.trim();

export const formatDateFriendlyEnGB = (
  dateStr: string | null | undefined,
  todayKey: string = getLocalDateKey(new Date())
): string => {
  if (!dateStr) return '';
  if (dateStr === todayKey) return 'Today';
  if (dateStr === shiftDateKey(todayKey, -1)) return 'Yesterday';
  if (dateStr === shiftDateKey(todayKey, 1)) return 'Tomorrow';
  return parseLocalDateKey(dateStr).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

export const formatShortDateEnGB = (
  dateStr: string | null | undefined,
  { includeYear = false }: { includeYear?: boolean } = {}
): string => {
  if (!dateStr) return '';
  return parseLocalDateKey(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {})
  });
};

export const buildTimestampForDate = (
  dateKey: string | null | undefined,
  timeStr = '12:00'
): string => {
  if (!dateKey) return new Date().toISOString();
  const safeTime = /^\d{2}:\d{2}$/.test(String(timeStr || '')) ? timeStr : '12:00';
  const [rawH = 12, rawM = 0] = safeTime.split(':').map(Number);
  const hh = Number.isFinite(rawH) ? Math.min(23, Math.max(0, rawH)) : 12;
  const mm = Number.isFinite(rawM) ? Math.min(59, Math.max(0, rawM)) : 0;
  const dt = parseLocalDateKey(dateKey);
  dt.setHours(hh, mm, 0, 0);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : new Date().toISOString();
};

export const clampFiniteNumber = (
  rawValue: unknown,
  min: number,
  max: number,
  fallback: number
): number => {
  const num = Number(rawValue);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};
