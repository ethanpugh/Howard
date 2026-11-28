export const VALID_DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface MonthGridCell {
  day: number;
  dateStr: string;
}

export const isValidDateKey = (value: string): boolean => {
  if (!VALID_DATE_KEY_RE.test(value)) return false;
  const parts = value.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y === undefined || m === undefined || d === undefined || m < 1 || m > 12 || d < 1 || d > 31) {
    return false;
  }
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

export const getLocalDateKey = (dateObj: Date = new Date()): string => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseLocalDateKey = (dateKey: string): Date => {
  if (!dateKey || !isValidDateKey(dateKey)) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const parts = dateKey.split('-').map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d);
};

export const shiftDateKey = (dateKey: string, deltaDays: number): string => {
  const dt = parseLocalDateKey(dateKey);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalDateKey(dt);
};

export const getMondayOfWeek = (dateInput: string | Date = new Date()): string => {
  const d =
    typeof dateInput === 'string' ? parseLocalDateKey(dateInput) : new Date(dateInput);
  const dayOfWeek = d.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diffToMonday);
  return getLocalDateKey(d);
};

export const getCalendarWeekDays = (mondayKey: string, todayKey?: string): string[] => {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dayKey = shiftDateKey(mondayKey, i);
    if (!todayKey || dayKey <= todayKey) {
      days.push(dayKey);
    }
  }
  return days.reverse();
};

export const formatWeekRangeLabel = (mondayKey: string): string => {
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

export const buildMonthGrid = (
  year: number,
  monthIndex: number
): Array<MonthGridCell | null> => {
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const startOffset = (firstDay.getDay() + 6) % 7;
  const cells: Array<MonthGridCell | null> = [];

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
