import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatWeekRangeLabel,
  getCalendarWeekDays,
  getMondayOfWeek,
  shiftDateKey
} from '../utils/householdHelpers.js';

/**
 * Shared Mon-Sun week pagination hook with automatic midnight week rollover.
 */
export function useWeekNavigation(todayKey) {
  const currentWeekMonday = useMemo(() => getMondayOfWeek(todayKey), [todayKey]);
  const [selectedWeekMonday, setSelectedWeekMonday] = useState(() => getMondayOfWeek(todayKey));
  const prevWeekMondayRef = useRef(currentWeekMonday);

  useEffect(() => {
    if (prevWeekMondayRef.current !== currentWeekMonday) {
      if (selectedWeekMonday === prevWeekMondayRef.current) {
        setSelectedWeekMonday(currentWeekMonday);
      }
      prevWeekMondayRef.current = currentWeekMonday;
    }
  }, [currentWeekMonday, selectedWeekMonday]);

  const activeWeekMonday =
    selectedWeekMonday > currentWeekMonday ? currentWeekMonday : selectedWeekMonday;
  const isCurrentWeek = activeWeekMonday === currentWeekMonday;

  const selectedWeekDays = useMemo(
    () => getCalendarWeekDays(activeWeekMonday, todayKey),
    [activeWeekMonday, todayKey]
  );

  const weekRangeLabel = useMemo(
    () => formatWeekRangeLabel(activeWeekMonday),
    [activeWeekMonday]
  );

  const goPrevWeek = useCallback(() => {
    setSelectedWeekMonday((prev) => shiftDateKey(prev, -7));
  }, []);

  const goNextWeek = useCallback(() => {
    setSelectedWeekMonday((prev) => {
      const next = shiftDateKey(prev, 7);
      return next > currentWeekMonday ? currentWeekMonday : next;
    });
  }, [currentWeekMonday]);

  const goThisWeek = useCallback(() => {
    setSelectedWeekMonday(currentWeekMonday);
  }, [currentWeekMonday]);

  const jumpToDate = useCallback(
    (dateKey) => {
      if (!dateKey) return;
      const monday = getMondayOfWeek(dateKey);
      setSelectedWeekMonday(monday > currentWeekMonday ? currentWeekMonday : monday);
    },
    [currentWeekMonday]
  );

  return {
    currentWeekMonday,
    activeWeekMonday,
    isCurrentWeek,
    selectedWeekDays,
    weekRangeLabel,
    goPrevWeek,
    goNextWeek,
    goThisWeek,
    jumpToDate,
    setSelectedWeekMonday
  };
}
