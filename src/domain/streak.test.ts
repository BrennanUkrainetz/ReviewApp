import { describe, expect, it } from 'vitest';
import { createInitialState } from '@/state/defaults';
import type { AerieState, DayRecord, Tier } from '@/state/types';
import {
  addDays,
  addWeekdays,
  daysBetween,
  isWeekend,
  missedWeekdays,
  toDateKey,
} from './dates';
import {
  advanceStreak,
  fullClearStreak,
  markDayOff,
  reconcileStreak,
  shouldAdvanceStreak,
} from './streak';

const TODAY = '2026-07-21'; // a Tuesday
const FRIDAY = '2026-07-17';
const SATURDAY = '2026-07-18';
const SUNDAY = '2026-07-19';
const MONDAY = '2026-07-20';

function stateWith(patch: Partial<AerieState['streak']>): AerieState {
  const base = createInitialState();
  return { ...base, streak: { ...base.streak, ...patch } };
}

function day(date: string, tier: Tier | null, dayOff = false): DayRecord {
  return {
    date,
    morning: tier
      ? { completed: true, tier, pointsEarned: 5, lumenEarned: 50, doneItemIds: [] }
      : null,
    daily: null,
    dayOff,
  };
}

describe('date helpers', () => {
  it('formats a local date without drifting across timezones', () => {
    expect(toDateKey(new Date(2026, 6, 21, 23, 59))).toBe('2026-07-21');
    expect(toDateKey(new Date(2026, 6, 21, 0, 1))).toBe('2026-07-21');
  });

  it('counts whole days across month boundaries', () => {
    expect(daysBetween('2026-07-31', '2026-08-01')).toBe(1);
    expect(daysBetween('2026-07-21', '2026-07-21')).toBe(0);
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('knows which days the routine runs on', () => {
    expect(isWeekend(SATURDAY)).toBe(true);
    expect(isWeekend(SUNDAY)).toBe(true);
    expect(isWeekend(FRIDAY)).toBe(false);
    expect(isWeekend(MONDAY)).toBe(false);
  });

  it('counts only the weekdays genuinely skipped between two days', () => {
    expect(missedWeekdays(FRIDAY, MONDAY)).toBe(0); // the weekend is not a miss
    expect(missedWeekdays(FRIDAY, SATURDAY)).toBe(0);
    expect(missedWeekdays(FRIDAY, TODAY)).toBe(1); // Monday went by
    expect(missedWeekdays(MONDAY, TODAY)).toBe(0);
    expect(missedWeekdays(TODAY, TODAY)).toBe(0);
    expect(missedWeekdays(SATURDAY, TODAY)).toBe(1); // Monday again
    // A fortnight away: ten weekdays, not fourteen days.
    expect(missedWeekdays(TODAY, addDays(TODAY, 14))).toBe(9);
  });

  it('steps by weekdays, stepping over weekends in both directions', () => {
    expect(addWeekdays(FRIDAY, 1)).toBe(MONDAY);
    expect(addWeekdays(MONDAY, -1)).toBe(FRIDAY);
    expect(addWeekdays(TODAY, 0)).toBe(TODAY);
    // A working week lands on the same weekday, one calendar week along.
    expect(addWeekdays(TODAY, 5)).toBe(addDays(TODAY, 7));
    expect(addWeekdays(TODAY, -5)).toBe(addDays(TODAY, -7));
  });
});

describe('reconcileStreak', () => {
  it('keeps a run alive when the last activity was today or the day before', () => {
    const activeToday = stateWith({ current: 5, lastActiveDate: TODAY });
    expect(reconcileStreak(activeToday, TODAY).streak.current).toBe(5);

    const activeYesterday = stateWith({ current: 5, lastActiveDate: MONDAY });
    expect(reconcileStreak(activeYesterday, TODAY).streak.current).toBe(5);
  });

  it('breaks the run when a whole weekday passed with no activity', () => {
    const stale = stateWith({
      current: 12,
      longest: 12,
      lastActiveDate: addWeekdays(TODAY, -2),
    });
    const result = reconcileStreak(stale, TODAY);
    expect(result.streak.current).toBe(0);
    expect(result.streak.longest).toBe(12);
  });

  it('carries a Friday run through the weekend and into Monday', () => {
    const friday = stateWith({ current: 5, lastActiveDate: FRIDAY });
    expect(reconcileStreak(friday, SATURDAY).streak.current).toBe(5);
    expect(reconcileStreak(friday, SUNDAY).streak.current).toBe(5);
    expect(reconcileStreak(friday, MONDAY).streak.current).toBe(5);
    // Monday itself went by unlogged, though — that is a real miss.
    expect(reconcileStreak(friday, TODAY).streak.current).toBe(0);
  });

  it('never breaks a run over the weekend itself', () => {
    // Thursday was the last day logged, so Friday was missed — but the break
    // is reported on Friday, not held back until the weekend is over.
    const thursday = stateWith({ current: 4, lastActiveDate: '2026-07-16' });
    expect(reconcileStreak(thursday, SATURDAY).streak.current).toBe(0);
  });

  it('is a no-op at streak zero', () => {
    const zero = stateWith({ current: 0 });
    expect(reconcileStreak(zero, TODAY)).toBe(zero);
  });
});

describe('advanceStreak', () => {
  it('increments once and records the longest run', () => {
    const before = stateWith({
      current: 3,
      longest: 3,
      lastCompletedDate: addDays(TODAY, -1),
    });
    const after = advanceStreak(before, TODAY);
    expect(after.streak.current).toBe(4);
    expect(after.streak.longest).toBe(4);
    expect(after.streak.lastCompletedDate).toBe(TODAY);
    expect(after.streak.lastActiveDate).toBe(TODAY);
  });

  it('does not double-count a second review on the same day', () => {
    const before = stateWith({ current: 4, longest: 9, lastCompletedDate: TODAY });
    expect(shouldAdvanceStreak(before, TODAY)).toBe(false);
    const after = advanceStreak(before, TODAY);
    expect(after.streak.current).toBe(4);
    expect(after.streak.longest).toBe(9);
  });

  it('pays a weekend review without moving the streak', () => {
    const before = stateWith({ current: 5, longest: 5, lastCompletedDate: FRIDAY });
    expect(shouldAdvanceStreak(before, SATURDAY)).toBe(false);

    const after = advanceStreak(before, SATURDAY);
    expect(after.streak.current).toBe(5);
    expect(after.streak.lastCompletedDate).toBe(FRIDAY);
    // ...and Monday still picks the run up where Friday left it.
    expect(advanceStreak(after, MONDAY).streak.current).toBe(6);
  });
});

describe('markDayOff', () => {
  it('holds continuity without moving the streak, and counts the day off', () => {
    const before = stateWith({
      current: 7,
      lastCompletedDate: MONDAY,
      lastActiveDate: MONDAY,
      daysOffUsed: 2,
    });
    const after = markDayOff(before, TODAY);

    expect(after.streak.current).toBe(7);
    expect(after.streak.daysOffUsed).toBe(3);
    expect(after.streak.lastActiveDate).toBe(TODAY);
    // Tomorrow the run is still alive because today was accounted for.
    expect(reconcileStreak(after, addWeekdays(TODAY, 1)).streak.current).toBe(7);
  });

  it('spends nothing on a weekend, which is off already', () => {
    const before = stateWith({ current: 7, lastActiveDate: FRIDAY, daysOffUsed: 2 });
    expect(markDayOff(before, SATURDAY)).toBe(before);
  });
});

describe('fullClearStreak', () => {
  it('counts consecutive full-clear weekdays ending today', () => {
    const history = [
      day(addWeekdays(TODAY, -2), 'full'),
      day(addWeekdays(TODAY, -1), 'full'),
      day(TODAY, 'full'),
    ];
    expect(fullClearStreak(history, TODAY)).toBe(3);
  });

  it('does not require today to be done yet', () => {
    const history = [
      day(addWeekdays(TODAY, -2), 'full'),
      day(addWeekdays(TODAY, -1), 'full'),
    ];
    expect(fullClearStreak(history, TODAY)).toBe(2);
  });

  it('breaks on a floor-only day', () => {
    const history = [
      day(addWeekdays(TODAY, -2), 'full'),
      day(addWeekdays(TODAY, -1), 'floor'),
      day(TODAY, 'full'),
    ];
    expect(fullClearStreak(history, TODAY)).toBe(1);
  });

  it('treats a day off as neutral', () => {
    const history = [
      day(addWeekdays(TODAY, -2), 'full'),
      day(addWeekdays(TODAY, -1), null, true),
      day(TODAY, 'full'),
    ];
    expect(fullClearStreak(history, TODAY)).toBe(2);
  });

  it('carries the combo across a weekend, and holds it over one', () => {
    const week = [
      day('2026-07-15', 'full'), // Wednesday
      day('2026-07-16', 'full'),
      day(FRIDAY, 'full'),
      day(MONDAY, 'full'),
      day(TODAY, 'full'),
    ];
    expect(fullClearStreak(week, TODAY)).toBe(5);
    // Read on the Sunday in the middle, the Friday run is intact and waiting.
    expect(fullClearStreak(week, SUNDAY)).toBe(3);
  });

  it('does not count a weekend full clear, and does not let one break the run', () => {
    const history = [
      day(FRIDAY, 'full'),
      day(SATURDAY, 'floor'), // a bonus weekend review, not a full clear
      day(MONDAY, 'full'),
    ];
    expect(fullClearStreak(history, MONDAY)).toBe(2);
  });

  it('is zero with no history', () => {
    expect(fullClearStreak([], TODAY)).toBe(0);
  });
});
