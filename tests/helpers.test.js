import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getLocalDateKey,
  parseLocalDateKey,
  shiftDateKey,
  formatFriendlyDate,
  getMondayOfWeek,
  getCalendarWeekDays,
  formatWeekRangeLabel,
  formatTimeDisplay,
  formatDurationAgo,
  formatCountdown,
  formatOrdinalDay,
  formatGBP,
  toMonthlyAmount,
  escapeCSVCell,
  computeBloomSummary,
  isAlmanacEventVisibleToProfile,
  doesAlmanacEventOccurOnDate,
  getLedgerScheduleInfo,
  doesLedgerItemOccurOnDate,
  computeLedgerSettlement
} from '../src/utils/householdHelpers.js';

describe('Date & Currency Utilities', () => {
  it('formats local date keys and shifts across month/leap boundaries', () => {
    assert.equal(getLocalDateKey(new Date(2026, 0, 5)), '2026-01-05');
    assert.equal(shiftDateKey('2024-02-28', 1), '2024-02-29');
    assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28');
  });

  it('parses valid, leap-day, and invalid date keys safely with parseLocalDateKey', () => {
    const valid = parseLocalDateKey('2026-05-10');
    assert.equal(valid.getFullYear(), 2026);
    assert.equal(valid.getMonth(), 4);
    assert.equal(valid.getDate(), 10);

    const leap = parseLocalDateKey('2024-02-29');
    assert.equal(leap.getFullYear(), 2024);
    assert.equal(leap.getMonth(), 1);
    assert.equal(leap.getDate(), 29);

    const fallbackEmpty = parseLocalDateKey('');
    const fallbackBad = parseLocalDateKey('not-a-date');
    const todayKey = getLocalDateKey(new Date());
    assert.equal(Number.isFinite(fallbackEmpty.getTime()), true);
    assert.equal(getLocalDateKey(fallbackBad), todayKey);
  });

  it('shifts date keys cleanly across DST transitions and year boundaries', () => {
    assert.equal(shiftDateKey('2026-03-28', 1), '2026-03-29');
    assert.equal(shiftDateKey('2026-03-29', 1), '2026-03-30');
    assert.equal(shiftDateKey('2026-10-25', 1), '2026-10-26');
    assert.equal(shiftDateKey('2026-10-26', -1), '2026-10-25');
    assert.equal(shiftDateKey('2025-12-31', 1), '2026-01-01');
    assert.equal(shiftDateKey('2026-01-01', -1), '2025-12-31');
  });

  it('converts billing cycles into monthly equivalents', () => {
    assert.equal(toMonthlyAmount(120, 'annual'), 10);
    assert.equal(toMonthlyAmount(90, 'quarterly'), 30);
    assert.equal(toMonthlyAmount(10, 'weekly'), (10 * 52) / 12);
    assert.equal(toMonthlyAmount(45, 'monthly'), 45);
  });

  it('formats friendly relative dates for Today, Yesterday, Tomorrow, and older dates', () => {
    assert.equal(formatFriendlyDate('2026-05-10', '2026-05-10'), 'Today');
    assert.equal(formatFriendlyDate('2026-05-09', '2026-05-10'), 'Yesterday');
    assert.equal(formatFriendlyDate('2026-05-11', '2026-05-10'), 'Tomorrow');
    assert.match(formatFriendlyDate('2026-05-05', '2026-05-10'), /5.*May/);
    assert.equal(formatFriendlyDate('', '2026-05-10'), '');
  });

  it('computes Monday-Sunday week boundaries, capped day lists, and en-GB week range labels', () => {
    // 2026-05-13 is a Wednesday, 2026-05-11 is Monday, 2026-05-17 is Sunday
    assert.equal(getMondayOfWeek('2026-05-11'), '2026-05-11');
    assert.equal(getMondayOfWeek('2026-05-13'), '2026-05-11');
    assert.equal(getMondayOfWeek('2026-05-17'), '2026-05-11');
    // Cross-month & cross-year Monday lookup (Fri 2 Jan 2026 -> Mon 29 Dec 2025)
    assert.equal(getMondayOfWeek(new Date(2026, 0, 2)), '2025-12-29');

    // Current week capped at Wednesday (newest-first)
    assert.deepEqual(getCalendarWeekDays('2026-05-11', '2026-05-13'), [
      '2026-05-13',
      '2026-05-12',
      '2026-05-11'
    ]);
    // Past full week (all 7 days, Sunday down to Monday)
    assert.deepEqual(getCalendarWeekDays('2026-05-04', '2026-05-13'), [
      '2026-05-10',
      '2026-05-09',
      '2026-05-08',
      '2026-05-07',
      '2026-05-06',
      '2026-05-05',
      '2026-05-04'
    ]);

    assert.equal(formatWeekRangeLabel('2026-05-11'), '11 May – 17 May 2026');
    assert.equal(formatWeekRangeLabel('2025-12-29'), '29 Dec 2025 – 4 Jan 2026');
  });

  it('formats valid timestamps with formatTimeDisplay and rejects invalid values', () => {
    assert.equal(formatTimeDisplay('not-a-timestamp'), '');
    assert.equal(formatTimeDisplay(''), '');
    assert.match(
      formatTimeDisplay(new Date(2026, 4, 10, 9, 5, 0).toISOString()),
      /09:05|9:05/
    );
  });

  it('pins en-GB 24-hour HH:MM output in formatTimeDisplay', () => {
    assert.equal(formatTimeDisplay(new Date(2026, 4, 10, 9, 5, 0).toISOString()), '09:05');
    assert.equal(formatTimeDisplay(new Date(2026, 4, 10, 14, 30, 0).toISOString()), '14:30');
    assert.equal(formatTimeDisplay(new Date(2026, 4, 10, 0, 7, 0).toISOString()), '00:07');
  });

  it('formats relative durations with formatDurationAgo', () => {
    const baseMs = new Date(2026, 4, 10, 12, 0, 0).toISOString();
    const baseNum = new Date(baseMs).getTime();
    assert.equal(formatDurationAgo(new Date(baseNum - 20_000).toISOString(), baseNum), 'Just now');
    assert.equal(formatDurationAgo(new Date(baseNum - 45 * 60_000).toISOString(), baseNum), '45m ago');
    assert.equal(formatDurationAgo(new Date(baseNum - 90 * 60_000).toISOString(), baseNum), '1h 30m ago');
    assert.equal(formatDurationAgo(new Date(baseNum - 2 * 3600_000).toISOString(), baseNum), '2h ago');
    assert.equal(formatDurationAgo(new Date(baseNum - 72 * 3600_000).toISOString(), baseNum), '3d ago');
    assert.equal(formatDurationAgo('invalid', baseNum), null);
  });

  it('formats future countdown windows and clamps expired targets to 0m', () => {
    const baseMs = new Date(2026, 4, 10, 12, 0, 0).getTime();
    assert.equal(formatCountdown(new Date(baseMs + 25 * 60_000).toISOString(), baseMs), '25m');
    assert.equal(formatCountdown(new Date(baseMs + 195 * 60_000).toISOString(), baseMs), '3h 15m');
    assert.equal(formatCountdown(new Date(baseMs - 60_000).toISOString(), baseMs), '0m');
    assert.equal(formatCountdown('invalid', baseMs), '');
  });

  it('formats ordinal day suffixes across 1st, 2nd, 3rd, teens, and 20s', () => {
    assert.equal(formatOrdinalDay(1), '1st');
    assert.equal(formatOrdinalDay(2), '2nd');
    assert.equal(formatOrdinalDay(3), '3rd');
    assert.equal(formatOrdinalDay(11), '11th');
    assert.equal(formatOrdinalDay(12), '12th');
    assert.equal(formatOrdinalDay(13), '13th');
    assert.equal(formatOrdinalDay(21), '21st');
    assert.equal(formatOrdinalDay(28), '28th');
  });

  it('formats GBP amounts cleanly with two decimals', () => {
    assert.equal(formatGBP(1234.5), '£1,234.50');
    assert.equal(formatGBP(0), '£0.00');
  });

  it('formats negative and NaN GBP values safely', () => {
    assert.equal(formatGBP(-42.5), '-£42.50');
    assert.equal(formatGBP(Number.NaN), '£0.00');
    assert.equal(formatGBP(undefined), '£0.00');
  });

  it('neutralizes CSV formula prefixes while leaving numbers untouched', () => {
    assert.equal(escapeCSVCell('=SUM(A1:A2)'), '"\'=SUM(A1:A2)"');
    assert.equal(escapeCSVCell('+123'), '"\'+123"');
    assert.equal(escapeCSVCell('- felt nauseous'), '"\'- felt nauseous"');
    assert.equal(escapeCSVCell('@cmd'), '"\'@cmd"');
    assert.equal(escapeCSVCell('\tindented'), '"\'\tindented"');
    assert.equal(escapeCSVCell(-12.5), '"-12.5"');
    assert.equal(escapeCSVCell('Normal "quoted" text'), '"Normal ""quoted"" text"');
    assert.equal(escapeCSVCell(null), '""');
  });

  it('escapes commas, newlines, carriage returns, quotes, and undefined in escapeCSVCell', () => {
    assert.equal(escapeCSVCell('a, b\n"c"'), '"a, b\n""c"""');
    assert.equal(escapeCSVCell('\rleadingCR'), '"\'\rleadingCR"');
    assert.equal(escapeCSVCell(undefined), '""');
    assert.equal(escapeCSVCell(''), '""');
  });
});

describe('computeBloomSummary', () => {
  it('prefers newer same-day abdomen check over earlier feeding abdomenAfter', () => {
    const now = new Date(2026, 4, 10, 18, 0, 0);
    const snap = {
      settings: { mantisName: 'Mantis', currentInstar: 'L3' },
      logsByDate: {
        '2026-05-10': {
          mists: [],
          feedings: [
            {
              id: 'f1',
              timestamp: new Date(2026, 4, 10, 10, 0, 0).toISOString(),
              outcome: 'eaten',
              count: 2,
              preyLabel: 'D. hydei',
              abdomenAfter: 'stuffed'
            }
          ],
          abdomenStatus: 'ready',
          abdomenUpdatedAt: new Date(2026, 4, 10, 17, 0, 0).toISOString()
        }
      },
      molts: [],
      feeders: []
    };
    const summary = computeBloomSummary(snap, now);
    assert.equal(summary.latestAbdomen, 'ready');
  });

  it('prefers newer feeding abdomenAfter when feeding happened after an earlier check', () => {
    const now = new Date(2026, 4, 10, 18, 0, 0);
    const snap = {
      settings: {},
      logsByDate: {
        '2026-05-10': {
          mists: [],
          feedings: [
            {
              id: 'f1',
              timestamp: new Date(2026, 4, 10, 15, 0, 0).toISOString(),
              outcome: 'eaten',
              count: 1,
              preyLabel: 'D. hydei',
              abdomenAfter: 'plump'
            }
          ],
          abdomenStatus: 'flat',
          abdomenUpdatedAt: new Date(2026, 4, 10, 9, 0, 0).toISOString()
        }
      }
    };
    const summary = computeBloomSummary(snap, now);
    assert.equal(summary.latestAbdomen, 'plump');
  });

  it('guards invalid mist timestamps so hoursAgo is never NaN and isMistDue falls back safely', () => {
    const now = new Date(2026, 4, 10, 18, 0, 0);
    const snap = {
      settings: { mistTargetHours: 24 },
      logsByDate: {
        '2026-05-08': {
          mists: [{ id: 'm1', timestamp: 'not-a-date', by: 'Partner 1' }],
          feedings: []
        }
      }
    };
    const summary = computeBloomSummary(snap, now);
    assert.equal(Number.isFinite(summary.lastMist.hoursAgo), true);
    assert.equal(summary.isMistDue, true);
  });

  it('computes active hardening, expired hardening_ready, and tight enclosure warnings', () => {
    const now = new Date(2026, 4, 10, 12, 0, 0);
    const activeHard = computeBloomSummary(
      {
        settings: {
          lifecycleStatus: 'hardening',
          hardeningUntil: new Date(2026, 4, 10, 15, 30, 0).toISOString(),
          enclosureInfo: { currentBodyLengthMm: 40, enclosureHeightMm: 100, enclosureWidthMm: 75 }
        }
      },
      now
    );
    assert.equal(activeHard.effectiveStatus, 'hardening');
    assert.equal(activeHard.isNoFeedLockout, true);
    assert.equal(activeHard.hardeningRemainingLabel, '3h 30m');
    assert.equal(activeHard.clearance.isEnclosureTight, true);

    const readyHard = computeBloomSummary(
      {
        settings: {
          lifecycleStatus: 'hardening',
          hardeningUntil: new Date(2026, 4, 10, 10, 0, 0).toISOString()
        }
      },
      now
    );
    assert.equal(readyHard.effectiveStatus, 'hardened_ready');
    assert.equal(readyHard.isNoFeedLockout, false);
  });

  it('computes avgInterMoltDays and projectedNextMoltDateStr from recorded molts', () => {
    const now = new Date(2026, 4, 5, 12, 0, 0);
    const snap = {
      settings: { currentInstar: 'L4', typicalInterMoltDays: 14 },
      molts: [
        { id: 'm1', dateKey: '2026-04-01' },
        { id: 'm2', dateKey: '2026-04-13' }, // 12 days
        { id: 'm3', dateKey: '2026-04-27' } // 14 days
      ]
    };
    const summary = computeBloomSummary(snap, now);
    assert.equal(summary.avgInterMoltDays, 13);
    assert.equal(summary.daysInCurrentInstar, 8);
    assert.equal(summary.projectedNextMoltDateStr, '2026-05-10');
  });

  it('sets isAdult true and omits projectedNextMoltDateStr once Adult stage is reached', () => {
    const now = new Date(2026, 4, 10, 12, 0, 0);
    const summary = computeBloomSummary(
      {
        settings: { currentInstar: 'Adult' },
        molts: [{ id: 'm1', dateKey: '2026-05-01' }]
      },
      now
    );
    assert.equal(summary.isAdult, true);
    assert.equal(summary.projectedNextMoltDateStr, null);
  });

  it('flags crashed, low, and expiring feeder cultures while excluding inactive entries', () => {
    const now = new Date(2026, 4, 10, 12, 0, 0);
    const summary = computeBloomSummary(
      {
        settings: {},
        feeders: [
          { id: 'f-ok', name: 'Fresh Culture', status: 'booming', startedDate: '2026-05-05', shelfLifeDays: 28 },
          { id: 'f-old', name: 'Expiring Culture', status: 'booming', startedDate: '2026-04-16', shelfLifeDays: 28 },
          { id: 'f-crash', name: 'Crashed Culture', status: 'crashed', startedDate: '2026-05-01', shelfLifeDays: 28 },
          { id: 'f-low', name: 'Low Culture', status: 'low', startedDate: '2026-05-08', shelfLifeDays: 28 },
          { id: 'f-off', name: 'Archived', status: 'crashed', startedDate: '2026-04-01', active: false }
        ]
      },
      now
    );
    assert.equal(summary.feeders.length, 4);
    assert.deepEqual(
      summary.feederAlerts.map((f) => f.id).sort(),
      ['f-crash', 'f-low', 'f-old']
    );
    const oldCulture = summary.feeders.find((f) => f.id === 'f-old');
    assert.equal(oldCulture.daysRemaining, 4);
  });

  it('reports premolt no-feed lockout and tracks lastMeal separately from lastRefusal', () => {
    const now = new Date(2026, 4, 10, 12, 0, 0);
    const summary = computeBloomSummary(
      {
        settings: { lifecycleStatus: 'premolt', currentInstar: 'L4' },
        logsByDate: {
          '2026-05-08': {
            feedings: [
              {
                id: 'f-meal',
                timestamp: new Date(2026, 4, 8, 11, 0, 0).toISOString(),
                outcome: 'eaten',
                count: 2,
                preyLabel: 'D. hydei'
              }
            ]
          },
          '2026-05-10': {
            feedings: [
              {
                id: 'f-ref',
                timestamp: new Date(2026, 4, 10, 9, 0, 0).toISOString(),
                outcome: 'refused',
                count: 1,
                preyLabel: 'D. hydei'
              }
            ]
          }
        }
      },
      now
    );
    assert.equal(summary.effectiveStatus, 'premolt');
    assert.equal(summary.isNoFeedLockout, true);
    assert.equal(summary.lastMeal.id, 'f-meal');
    assert.equal(summary.lastMeal.daysAgo, 2);
    assert.equal(summary.lastRefusal.id, 'f-ref');
    assert.equal(summary.lastRefusal.dateKey, '2026-05-10');
  });

  it('picks newest latestClimate and ignores inter-molt outlier intervals (<=2d or >=90d)', () => {
    const now = new Date(2026, 5, 10, 12, 0, 0);
    const summary = computeBloomSummary(
      {
        settings: { currentInstar: 'L5', typicalInterMoltDays: 14 },
        logsByDate: {
          '2026-06-08': {
            climateChecks: [
              { id: 'c1', timestamp: new Date(2026, 5, 8, 10, 0, 0).toISOString(), tempC: 25, humidityPct: 55 }
            ]
          },
          '2026-06-10': {
            climateChecks: [
              { id: 'c2', timestamp: new Date(2026, 5, 10, 8, 0, 0).toISOString(), tempC: 26, humidityPct: 58 },
              { id: 'c3', timestamp: new Date(2026, 5, 10, 11, 30, 0).toISOString(), tempC: 27, humidityPct: 60 }
            ]
          }
        },
        molts: [
          { id: 'm1', dateKey: '2026-01-01' },
          { id: 'm2', dateKey: '2026-05-01' }, // 120d outlier (>=90) ignored
          { id: 'm3', dateKey: '2026-05-03' }, // 2d outlier (<=2) ignored
          { id: 'm4', dateKey: '2026-05-19' } // 16d valid interval
        ]
      },
      now
    );
    assert.equal(summary.latestClimate.id, 'c3');
    assert.equal(summary.latestClimate.dateKey, '2026-06-10');
    assert.equal(summary.avgInterMoltDays, 16);
  });
});

describe('Almanac Recurrence & Visibility', () => {
  it('handles weekly, fortnightly, clamped monthly, and annual recurrences with skips and untilDate', () => {
    const weeklyEvt = {
      id: 'w1',
      date: '2026-01-05',
      recurrence: 'weekly',
      skippedDates: ['2026-01-12'],
      untilDate: '2026-01-26'
    };
    assert.equal(doesAlmanacEventOccurOnDate(weeklyEvt, '2026-01-05'), true);
    assert.equal(doesAlmanacEventOccurOnDate(weeklyEvt, '2026-01-12'), false);
    assert.equal(doesAlmanacEventOccurOnDate(weeklyEvt, '2026-01-19'), true);
    assert.equal(doesAlmanacEventOccurOnDate(weeklyEvt, '2026-02-02'), false);

    const fortnightEvt = { id: 'f1', date: '2026-01-01', recurrence: 'fortnightly' };
    assert.equal(doesAlmanacEventOccurOnDate(fortnightEvt, '2026-01-08'), false);
    assert.equal(doesAlmanacEventOccurOnDate(fortnightEvt, '2026-01-15'), true);

    const monthEndEvt = { id: 'm1', date: '2026-01-31', recurrence: 'monthly' };
    assert.equal(doesAlmanacEventOccurOnDate(monthEndEvt, '2026-02-28'), true);
    assert.equal(doesAlmanacEventOccurOnDate(monthEndEvt, '2026-04-30'), true);

    const leapAnnual = { id: 'a1', date: '2024-02-29', recurrence: 'annual' };
    assert.equal(doesAlmanacEventOccurOnDate(leapAnnual, '2026-02-28'), true);
  });

  it('keeps Partner 1 medical events visible while hiding Partner 2 private events by name or GP link', () => {
    const p1 = { id: 'partner1' };
    const p2 = { id: 'partner2' };
    const cg = { id: 'caregiver' };

    const p1Medical = { category: 'medical', assignedTo: 'Alex', linkToGpReport: false };
    assert.equal(isAlmanacEventVisibleToProfile(p1Medical, p1, 'Jordan'), true);
    assert.equal(isAlmanacEventVisibleToProfile(p1Medical, cg, 'Jordan'), true);

    const p2MedicalRenamed = { category: 'medical', assignedTo: 'Jordan', linkToGpReport: false };
    assert.equal(isAlmanacEventVisibleToProfile(p2MedicalRenamed, p1, 'Jordan'), false);
    assert.equal(isAlmanacEventVisibleToProfile(p2MedicalRenamed, p2, 'Jordan'), true);

    const gpLinked = { category: 'medical', assignedTo: 'Both', linkToGpReport: true };
    assert.equal(isAlmanacEventVisibleToProfile(gpLinked, p1, 'Jordan'), false);
    assert.equal(isAlmanacEventVisibleToProfile(gpLinked, p2, 'Jordan'), true);
  });

  it('maintains weekly/fortnightly Almanac cadence across DST and year boundaries', () => {
    const springWeekly = { id: 'dst-s', date: '2026-03-22', recurrence: 'weekly' };
    assert.equal(doesAlmanacEventOccurOnDate(springWeekly, '2026-03-29'), true);
    assert.equal(doesAlmanacEventOccurOnDate(springWeekly, '2026-04-05'), true);

    const autumnFortnightly = { id: 'dst-a', date: '2026-10-11', recurrence: 'fortnightly' };
    assert.equal(doesAlmanacEventOccurOnDate(autumnFortnightly, '2026-10-25'), true);
    assert.equal(doesAlmanacEventOccurOnDate(autumnFortnightly, '2026-11-08'), true);

    const yearBoundaryWeekly = { id: 'yr-w', date: '2025-12-31', recurrence: 'weekly' };
    assert.equal(doesAlmanacEventOccurOnDate(yearBoundaryWeekly, '2026-01-07'), true);
    assert.equal(doesAlmanacEventOccurOnDate(yearBoundaryWeekly, '2026-01-06'), false);
  });

  it('hides Partner 2 medical events via assignedToProfileId even after Partner 2 is renamed', () => {
    const p1 = { id: 'partner1' };
    const p2 = { id: 'partner2' };
    const cg = { id: 'caregiver' };

    const renamedP2Medical = {
      category: 'medical',
      assignedTo: 'Previous Name',
      assignedToProfileId: 'partner2',
      linkToGpReport: false
    };
    assert.equal(isAlmanacEventVisibleToProfile(renamedP2Medical, p1, 'Taylor'), false);
    assert.equal(isAlmanacEventVisibleToProfile(renamedP2Medical, cg, 'Taylor'), false);
    assert.equal(isAlmanacEventVisibleToProfile(renamedP2Medical, p2, 'Taylor'), true);

    const nonMedicalP2 = {
      category: 'social',
      assignedTo: 'Previous Name',
      assignedToProfileId: 'partner2',
      linkToGpReport: false
    };
    assert.equal(isAlmanacEventVisibleToProfile(nonMedicalP2, p1, 'Taylor'), true);
  });
});

describe('Ledger Schedules & Settlements', () => {
  it('does not repeat unanchored annual items every month and keeps quarterly anchors consistent', () => {
    const unanchoredAnnual = { cycle: 'annual', billingDay: 15 };
    assert.equal(doesLedgerItemOccurOnDate(unanchoredAnnual, '2026-01-15', false), true);
    assert.equal(doesLedgerItemOccurOnDate(unanchoredAnnual, '2026-02-15', false), false);
    assert.equal(doesLedgerItemOccurOnDate(unanchoredAnnual, '2026-06-15', false), false);

    const scheduleJan = getLedgerScheduleInfo(unanchoredAnnual, false, new Date(2026, 0, 10));
    assert.equal(scheduleJan.daysUntil, 5);

    const unanchoredQuarterly = { cycle: 'quarterly', billingDay: 10 };
    // Consistent am = 1 -> Jan, Apr, Jul, Oct
    assert.equal(doesLedgerItemOccurOnDate(unanchoredQuarterly, '2026-04-10', false), true);
    assert.equal(doesLedgerItemOccurOnDate(unanchoredQuarterly, '2026-05-10', false), false);
    const schedQ = getLedgerScheduleInfo(unanchoredQuarterly, false, new Date(2026, 4, 1));
    assert.equal(schedQ.nextDateFormatted, '10 Jul');
  });

  it('computes getLedgerScheduleInfo for weekly schedules within current and next week', () => {
    // Wed May 6 2026
    const wed = new Date(2026, 4, 6, 12, 0, 0);
    const fridayBill = getLedgerScheduleInfo({ cycle: 'weekly', billingWeekday: 5 }, false, wed);
    assert.equal(fridayBill.daysUntil, 2);
    assert.equal(fridayBill.nextDateFormatted, '8 May');
    assert.equal(fridayBill.scheduleLabel, 'Every Friday');

    const mondayPay = getLedgerScheduleInfo({ frequency: 'weekly', payWeekday: 1 }, true, wed);
    assert.equal(mondayPay.daysUntil, 5);
    assert.equal(mondayPay.nextDateFormatted, '11 May');
  });

  it('clamps monthly day 31 in short months and rolls past billing days into next month', () => {
    const feb10 = new Date(2026, 1, 10, 10, 0, 0);
    const clamped = getLedgerScheduleInfo({ cycle: 'monthly', billingDay: 31 }, false, feb10);
    assert.equal(clamped.daysUntil, 18);
    assert.equal(clamped.nextDateFormatted, '28 Feb');

    const may10 = new Date(2026, 4, 10, 10, 0, 0);
    const rolled = getLedgerScheduleInfo({ cycle: 'monthly', billingDay: 5 }, false, may10);
    assert.equal(rolled.daysUntil, 26);
    assert.equal(rolled.nextDateFormatted, '5 Jun');
  });

  it('rolls past annual anchored dates into next year with year included in nextDateFormatted', () => {
    const dec25 = new Date(2026, 11, 25, 10, 0, 0);
    const info = getLedgerScheduleInfo(
      { cycle: 'annual', billingDate: '2025-12-20', billingDay: 20 },
      false,
      dec25
    );
    assert.equal(info.daysUntil, 360);
    assert.equal(info.nextDateFormatted, '20 Dec 2027');
  });

  it('resolves quarterly anchored due-today and next-quarter dates accurately', () => {
    const may15 = new Date(2026, 4, 15, 9, 0, 0);
    const anchored = { frequency: 'quarterly', payDate: '2025-11-15', payDay: 15 };
    const dueToday = getLedgerScheduleInfo(anchored, true, may15);
    assert.equal(dueToday.daysUntil, 0);
    assert.equal(dueToday.nextDateFormatted, '15 May');

    const may16 = new Date(2026, 4, 16, 9, 0, 0);
    const nextQuarter = getLedgerScheduleInfo(anchored, true, may16);
    assert.equal(nextQuarter.nextDateFormatted, '15 Aug');
    assert.equal(nextQuarter.daysUntil, 91);
  });

  it('clamps monthly day 31 in short months and checks weekly/one-off dates', () => {
    const monthly31 = { cycle: 'monthly', billingDay: 31 };
    assert.equal(doesLedgerItemOccurOnDate(monthly31, '2026-02-28', false), true);
    assert.equal(doesLedgerItemOccurOnDate(monthly31, '2026-04-30', false), true);

    const weeklyFri = { frequency: 'weekly', payWeekday: 5 };
    assert.equal(doesLedgerItemOccurOnDate(weeklyFri, '2026-05-08', true), true); // Friday
    assert.equal(doesLedgerItemOccurOnDate(weeklyFri, '2026-05-09', true), false);

    const oneOff = { frequency: 'one-off', date: '2026-05-14' };
    assert.equal(doesLedgerItemOccurOnDate(oneOff, '2026-05-14', true), true);
    assert.equal(doesLedgerItemOccurOnDate(oneOff, '2026-06-14', true), false);
  });

  it('computes 50/50 and proportional settlements including personal items paid from Joint Account', () => {
    const expenses = [
      { owner: 'joint', paidBy: 'partner1', amount: 100 }, // 50/50 -> +50; 60/40 -> +40
      { owner: 'partner1', paidBy: 'joint', amount: 100 } // 50/50 -> -50; 60/40 -> -40
    ];
    const even = computeLedgerSettlement(expenses, 0.5);
    assert.equal(Math.round(even.netPartner1Balance * 100) / 100, 0);

    const prop = computeLedgerSettlement(
      [
        { owner: 'partner2', paidBy: 'joint', amount: 100 }, // P1 funded 60% (+60)
        { owner: 'partner1', paidBy: 'partner2', amount: 20 } // P2 paid 20 (-20)
      ],
      0.6
    );
    assert.equal(Math.round(prop.netPartner1Balance * 100) / 100, 40);
  });

  it('computes getLedgerScheduleInfo for one-off income dates (future, past, and cross-year)', () => {
    const may10 = new Date(2026, 4, 10, 12, 0, 0);
    const upcoming = getLedgerScheduleInfo(
      { frequency: 'one-off', date: '2026-05-20' },
      true,
      may10
    );
    assert.equal(upcoming.daysUntil, 10);
    assert.equal(upcoming.nextDateFormatted, '20 May');
    assert.equal(upcoming.scheduleLabel, 'One-off');

    const past = getLedgerScheduleInfo(
      { frequency: 'one-off', date: '2026-05-05' },
      true,
      may10
    );
    assert.equal(past.daysUntil, -5);
    assert.equal(past.nextDateFormatted, '5 May');
    assert.equal(past.scheduleLabel, 'One-off');

    const nextYear = getLedgerScheduleInfo(
      { frequency: 'one-off', date: '2027-01-15' },
      true,
      new Date(2026, 11, 20, 12, 0, 0)
    );
    assert.equal(nextYear.nextDateFormatted, '15 Jan 2027');
    assert.equal(nextYear.scheduleLabel, 'One-off');
  });

  it('matches anchored annual and quarterly schedules including leap-day and month-end clamping', () => {
    const anchoredAnnual = { cycle: 'annual', billingDate: '2025-07-15', billingDay: 15 };
    assert.equal(doesLedgerItemOccurOnDate(anchoredAnnual, '2026-07-15', false), true);
    assert.equal(doesLedgerItemOccurOnDate(anchoredAnnual, '2026-01-15', false), false);
    assert.equal(doesLedgerItemOccurOnDate(anchoredAnnual, '2026-07-16', false), false);

    const leapAnnual = { cycle: 'annual', billingDate: '2024-02-29', billingDay: 29 };
    assert.equal(doesLedgerItemOccurOnDate(leapAnnual, '2026-02-28', false), true);
    assert.equal(doesLedgerItemOccurOnDate(leapAnnual, '2028-02-29', false), true);

    const anchoredQuarterly = { frequency: 'quarterly', payDate: '2025-05-31', payDay: 31 };
    assert.equal(doesLedgerItemOccurOnDate(anchoredQuarterly, '2026-02-28', true), true);
    assert.equal(doesLedgerItemOccurOnDate(anchoredQuarterly, '2026-05-31', true), true);
    assert.equal(doesLedgerItemOccurOnDate(anchoredQuarterly, '2026-08-31', true), true);
    assert.equal(doesLedgerItemOccurOnDate(anchoredQuarterly, '2026-11-30', true), true);
    assert.equal(doesLedgerItemOccurOnDate(anchoredQuarterly, '2026-03-31', true), false);
  });

  it('computes full computeLedgerSettlement matrix across 50/50, proportional, zero-income fallback, and all payer combos', () => {
    const matrixExpenses = [
      { owner: 'joint', paidBy: 'partner1', amount: 100 }, // +100 * s2
      { owner: 'joint', paidBy: 'partner2', amount: 50 }, // -50 * s1
      { owner: 'joint', paidBy: 'joint', amount: 80 }, // 0
      { owner: 'partner2', paidBy: 'partner1', amount: 30 }, // +30
      { owner: 'partner1', paidBy: 'partner2', amount: 10 }, // -10
      { owner: 'partner2', paidBy: 'joint', amount: 40 }, // +40 * s1
      { owner: 'partner1', paidBy: 'joint', amount: 20 } // -20 * s2
    ];

    // 50/50 split: +50 - 25 + 0 + 30 - 10 + 20 - 10 = +55
    const split50 = computeLedgerSettlement(matrixExpenses, 0.5);
    assert.equal(Math.round(split50.netPartner1Balance * 100) / 100, 55);
    assert.equal(split50.partner1PaidForJoint, 100);
    assert.equal(split50.partner2PaidForJoint, 50);
    assert.equal(split50.partner1PaidForPartner2Personal, 30);
    assert.equal(split50.partner2PaidForPartner1Personal, 10);
    assert.equal(split50.partner2PersonalPaidByJoint, 40);
    assert.equal(split50.partner1PersonalPaidByJoint, 20);

    // 70/30 proportional split (s1=0.7, s2=0.3): +30 - 35 + 0 + 30 - 10 + 28 - 6 = +37
    const split70 = computeLedgerSettlement(matrixExpenses, 0.7);
    assert.equal(Math.round(split70.netPartner1Balance * 100) / 100, 37);

    // Zero-income / NaN fallback defaults to 50/50, and empty array yields 0
    const nanFallback = computeLedgerSettlement(matrixExpenses, Number.NaN);
    assert.equal(Math.round(nanFallback.netPartner1Balance * 100) / 100, 55);
    assert.equal(computeLedgerSettlement([], 0.5).netPartner1Balance, 0);
  });
});
