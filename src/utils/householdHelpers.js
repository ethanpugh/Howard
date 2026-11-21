export const getLocalDateKey = (dateObj = new Date()) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseLocalDateKey = (dateKey) => {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return new Date();
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const shiftDateKey = (dateKey, deltaDays) => {
  const dt = parseLocalDateKey(dateKey);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalDateKey(dt);
};

export const formatFriendlyDate = (dateKey, todayKey = getLocalDateKey(new Date())) => {
  if (!dateKey) return '';
  if (dateKey === todayKey) return 'Today';
  if (dateKey === shiftDateKey(todayKey, -1)) return 'Yesterday';
  return parseLocalDateKey(dateKey).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
};

export const formatTimeDisplay = (isoString) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const formatDurationAgo = (isoString, nowMs = Date.now()) => {
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

export const formatCountdown = (targetIso, nowMs = Date.now()) => {
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

export const formatOrdinalDay = (dayNum) => {
  const d = Number(dayNum) || 1;
  const j = d % 10;
  const k = d % 100;
  if (j === 1 && k !== 11) return `${d}st`;
  if (j === 2 && k !== 12) return `${d}nd`;
  if (j === 3 && k !== 13) return `${d}rd`;
  return `${d}th`;
};

export const formatGBP = (num) => {
  const val = Number(num) || 0;
  return val.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

export const toMonthlyAmount = (amount, cycleOrFreq) => {
  const val = Number(amount) || 0;
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

export const escapeCSVCell = (val) => {
  if (val === null || val === undefined) return '""';
  if (typeof val === 'number') {
    return `"${String(val).replace(/"/g, '""')}"`;
  }
  const raw = String(val);
  // Prefix spreadsheet formula triggers with an apostrophe so Excel/Sheets treat text literally
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function copyTextToClipboard(text) {
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
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch {
    return false;
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
];

export const createDefaultBloomSettings = (dateObj = new Date()) => {
  const todayKey = getLocalDateKey(dateObj);
  return {
    mantisName: 'Mantis',
    speciesPreset: 'spiny_flower',
    commonName: 'Spiny Flower Mantis',
    scientificName: 'Pseudocreobotra wahlbergii',
    sex: 'Unsexed',
    pronouns: 'they/them',
    currentInstar: 'L2',
    arrivalDate: todayKey,
    hatchDate: '',
    currentColorMorph: 'Spiky creamy-white & dark banded nymph',
    lifecycleStatus: 'normal',
    premoltStartedAt: null,
    hardeningUntil: null,
    hardeningHours: 36,
    livePreyInside: false,
    livePreyNote: '',
    dayTempMinC: 25,
    dayTempMaxC: 28,
    nightTempMinC: 20,
    humidityMinPct: 50,
    humidityMaxPct: 65,
    mistTargetHours: 24,
    typicalInterMoltDays: 14,
    enclosureInfo: {
      currentSizeLabel: 'Ventilated Nymph Cup / Mini Tall Enclosure',
      meshType: 'Soft nylon / fabric mesh (tarsal-safe)',
      substrate: 'Paper towel / coco fibre + climbing twigs & blossoms',
      lastDeepCleanDate: todayKey,
      currentBodyLengthMm: 10,
      enclosureHeightMm: 110,
      enclosureWidthMm: 75
    },
    caregivers: ['Partner 1', 'Partner 2', 'Caregiver'],
    careNote:
      'Mist one enclosure wall lightly once daily for drinking droplets—never spray the mantis directly, and let the enclosure dry between mists (Spiny Flower Mantises need cross-ventilation!). Do NOT offer live prey during Premolt Watch or Post-Molt Hardening.'
  };
};

export const DEFAULT_BLOOM_SETTINGS = createDefaultBloomSettings();

export function computeBloomSummary(bloomSnapshot, now = new Date()) {
  const nowMs = now.getTime();
  const todayKey = getLocalDateKey(now);
  const baseDefaults = createDefaultBloomSettings(now);
  const rawSettings = bloomSnapshot?.settings || {};
  const settings = {
    ...baseDefaults,
    ...rawSettings,
    enclosureInfo: {
      ...baseDefaults.enclosureInfo,
      ...rawSettings.enclosureInfo
    }
  };

  const logsByDate = bloomSnapshot?.logsByDate || {};
  const molts = [...(bloomSnapshot?.molts || [])].sort((a, b) =>
    ((b.dateKey || '') + (b.timestamp || '')).localeCompare((a.dateKey || '') + (a.timestamp || ''))
  );
  const feeders = bloomSnapshot?.feeders || [];

  let effectiveStatus = 'normal';
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

  const sortedDateKeys = Object.keys(logsByDate).sort().reverse();
  let lastMist = null;
  let lastMeal = null;
  let lastRefusal = null;
  let latestAbdomen = null;
  let latestClimate = null;

  for (const dKey of sortedDateKeys) {
    const dayLog = logsByDate[dKey] || {};
    if (!lastMist && Array.isArray(dayLog.mists) && dayLog.mists.length > 0) {
      const m = [...dayLog.mists].sort((a, b) =>
        (b.timestamp || '').localeCompare(a.timestamp || '')
      )[0];
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

    let newestFeedWithAbdomen = null;
    if (Array.isArray(dayLog.feedings) && dayLog.feedings.length > 0) {
      const sortedFeeds = [...dayLog.feedings].sort((a, b) =>
        (b.timestamp || '').localeCompare(a.timestamp || '')
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
            abMs >= feedMs ? dayLog.abdomenStatus : newestFeedWithAbdomen.abdomenAfter;
        } else {
          latestAbdomen = dayLog.abdomenStatus;
        }
      } else if (dayLog.abdomenStatus) {
        latestAbdomen = dayLog.abdomenStatus;
      } else if (newestFeedWithAbdomen) {
        latestAbdomen = newestFeedWithAbdomen.abdomenAfter;
      }
    }

    if (!latestClimate && Array.isArray(dayLog.climateChecks) && dayLog.climateChecks.length > 0) {
      const c = [...dayLog.climateChecks].sort((a, b) =>
        (b.timestamp || '').localeCompare(a.timestamp || '')
      )[0];
      latestClimate = { ...c, dateKey: dKey };
    }
  }

  const todayLog = logsByDate[todayKey] || {
    dateKey: todayKey,
    mists: [],
    feedings: [],
    climateChecks: [],
    behaviors: []
  };
  const todayMistCount = (todayLog.mists || []).length;
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
        (parseLocalDateKey(ascMolts[i].dateKey).getTime() -
          parseLocalDateKey(ascMolts[i - 1].dateKey).getTime()) /
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

  const enrichedFeeders = feeders
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

export const isAlmanacEventVisibleToProfile = (
  evt,
  activeProfile,
  partner2Name = 'Partner 2'
) => {
  if (!evt) return false;
  if (activeProfile?.id === 'partner2') return true;
  if (evt.linkToGpReport) return false;
  if (
    evt.category === 'medical' &&
    (evt.assignedToProfileId === 'partner2' ||
      evt.assignedTo === 'Partner 2' ||
      (partner2Name && evt.assignedTo === partner2Name))
  ) {
    return false;
  }
  return true;
};

export const doesAlmanacEventOccurOnDate = (evt, targetDateStr) => {
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

  const [sy, sm, sd] = evt.date.split('-').map(Number);
  const [ty, tm, td] = targetDateStr.split('-').map(Number);
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

export const getLedgerScheduleInfo = (item, isIncome = false, now = new Date()) => {
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

  const getClampedDate = (yr, moIndex, d) => {
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
      am = parts[1];
      ad = parts[2];
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
      am = parts[1];
      ad = parts[2];
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

export const doesLedgerItemOccurOnDate = (item, targetDateStr, isIncome = false) => {
  if (!item || !targetDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)) return false;
  if (isIncome && item.frequency === 'one-off') {
    return item.date === targetDateStr;
  }

  const [ty, tm, td] = targetDateStr.split('-').map(Number);
  const cycle = (isIncome ? item.frequency : item.cycle) || 'monthly';
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
    const dt = new Date(ty, tm - 1, td);
    const targetIsoWeekday = ((dt.getDay() + 6) % 7) + 1;
    return targetIsoWeekday === weekday;
  }

  const anchorDateStr = (isIncome ? item.payDate : item.billingDate) || '';
  const maxDayInTargetMonth = new Date(ty, tm, 0).getDate();

  if (cycle === 'annual') {
    let am = 1;
    let ad = rawDay;
    if (/^\d{4}-\d{2}-\d{2}$/.test(anchorDateStr)) {
      const parts = anchorDateStr.split('-').map(Number);
      am = parts[1];
      ad = parts[2];
    }
    return tm === am && td === Math.min(maxDayInTargetMonth, ad);
  }

  if (cycle === 'quarterly') {
    let am = 1;
    let ad = rawDay;
    if (/^\d{4}-\d{2}-\d{2}$/.test(anchorDateStr)) {
      const parts = anchorDateStr.split('-').map(Number);
      am = parts[1];
      ad = parts[2];
    }
    const monthDiff = ((tm - am) % 3 + 3) % 3;
    return monthDiff === 0 && td === Math.min(maxDayInTargetMonth, ad);
  }

  return td === Math.min(maxDayInTargetMonth, rawDay);
};

export const computeLedgerSettlement = (monthExpenses = [], partner1JointShare = 0.5) => {
  const s1 = Number.isFinite(partner1JointShare) ? partner1JointShare : 0.5;
  const s2 = 1 - s1;
  let partner1PaidForJoint = 0;
  let partner2PaidForJoint = 0;
  let partner1PaidForPartner2Personal = 0;
  let partner2PaidForPartner1Personal = 0;
  let partner1PersonalPaidByJoint = 0;
  let partner2PersonalPaidByJoint = 0;
  let netPartner1Balance = 0;

  for (const e of monthExpenses || []) {
    if (!e) continue;
    const amt = Number(e.amount) || 0;
    if (e.owner === 'joint') {
      if (e.paidBy === 'partner1') {
        partner1PaidForJoint += amt;
        netPartner1Balance += amt * s2;
      } else if (e.paidBy === 'partner2') {
        partner2PaidForJoint += amt;
        netPartner1Balance -= amt * s1;
      }
    } else if (e.owner === 'partner2') {
      if (e.paidBy === 'partner1') {
        partner1PaidForPartner2Personal += amt;
        netPartner1Balance += amt;
      } else if (e.paidBy === 'joint') {
        partner2PersonalPaidByJoint += amt;
        netPartner1Balance += amt * s1;
      }
    } else if (e.owner === 'partner1') {
      if (e.paidBy === 'partner2') {
        partner2PaidForPartner1Personal += amt;
        netPartner1Balance -= amt;
      } else if (e.paidBy === 'joint') {
        partner1PersonalPaidByJoint += amt;
        netPartner1Balance -= amt * s2;
      }
    }
  }

  return {
    partner1PaidForJoint,
    partner2PaidForJoint,
    partner1PaidForPartner2Personal,
    partner2PaidForPartner1Personal,
    partner1PersonalPaidByJoint,
    partner2PersonalPaidByJoint,
    netPartner1Balance
  };
};
