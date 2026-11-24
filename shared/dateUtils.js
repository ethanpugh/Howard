export const VALID_DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const getLocalDateKey = (dateObj = new Date()) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseLocalDateKey = (dateKey) => {
  if (!dateKey || !VALID_DATE_KEY_RE.test(dateKey)) return new Date();
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const shiftDateKey = (dateKey, deltaDays) => {
  const dt = parseLocalDateKey(dateKey);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalDateKey(dt);
};

export const getMondayOfWeek = (dateInput = new Date()) => {
  const d =
    typeof dateInput === 'string' ? parseLocalDateKey(dateInput) : new Date(dateInput);
  const dayOfWeek = d.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diffToMonday);
  return getLocalDateKey(d);
};

export const getCalendarWeekDays = (mondayKey, todayKey) => {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dayKey = shiftDateKey(mondayKey, i);
    if (!todayKey || dayKey <= todayKey) {
      days.push(dayKey);
    }
  }
  return days.reverse();
};

export const formatWeekRangeLabel = (mondayKey) => {
  const monDate = parseLocalDateKey(mondayKey);
  const sunDate = parseLocalDateKey(shiftDateKey(mondayKey, 6));
  const sameYear = monDate.getFullYear() === sunDate.getFullYear();
  const monStr = monDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' })
  });
  const sunStr = sunDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  return `${monStr} – ${sunStr}`;
};

export const buildMonthGrid = (year, monthIndex) => {
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7;
  const cells = [];

  for (let i = 0; i < startOffset; i++) {
    cells.push(null);
  }

  const mStr = String(monthIndex + 1).padStart(2, '0');
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = String(d).padStart(2, '0');
    cells.push({
      day: d,
      dateStr: `${year}-${mStr}-${dStr}`
    });
  }

  return cells;
};
