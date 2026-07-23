import { describe, expect, it } from 'vitest';
import { createInitialState } from '@/state/defaults';
import type { AerieState, DayRecord, Tier } from '@/state/types';
import { addDays, daysBetween, toDateKey } from './dates';
import {
  advanceStreak,
  fullClearStreak,
  markDayOff,
  reconcileStreak,
  shouldAdvanceStreak,
} from './streak';

const TODAY = '2026-07-21';

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
});

describe('reconcileStreak', () => {
  it('keeps a run alive when the last activity was today or yesterday', () => {
    const activeToday = stateWith({ current: 5, lastActiveDate: TODAY });
    expect(reconcileStreak(activeToday, TODAY).streak.current).toBe(5);

    const activeYesterday = stateWith({ current: 5, lastActiveDate: addDays(TODAY, -1) });
    expect(reconcileStreak(activeYesterday, TODAY).streak.current).toBe(5);
  });

  it('breaks the run when a whole day passed with no activity', () => {
    const stale = stateWith({
      current: 12,
      longest: 12,
      lastActiveDate: addDays(TODAY, -2),
    });
    const result = reconcileStreak(stale, TODAY);
    expect(result.streak.current).toBe(0);
    expect(result.streak.longest).toBe(12);
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
});

describe('markDayOff', () => {
  it('holds continuity without moving the streak, and counts the day off', () => {
    const before = stateWith({
      current: 7,
      lastCompletedDate: addDays(TODAY, -1),
      lastActiveDate: addDays(TODAY, -1),
      daysOffUsed: 2,
    });
    const after = markDayOff(before, TODAY);

    expect(after.streak.current).toBe(7);
    expect(after.streak.daysOffUsed).toBe(3);
    expect(after.streak.lastActiveDate).toBe(TODAY);
    // Tomorrow the run is still alive because today was accounted for.
    expect(reconcileStreak(after, addDays(TODAY, 1)).streak.current).toBe(7);
  });
});

describe('fullClearStreak', () => {
  it('counts consecutive full-clear days ending today', () => {
    const history = [
      day(addDays(TODAY, -2), 'full'),
      day(addDays(TODAY, -1), 'full'),
      day(TODAY, 'full'),
    ];
    expect(fullClearStreak(history, TODAY)).toBe(3);
  });

  it('does not require today to be done yet', () => {
    const history = [day(addDays(TODAY, -2), 'full'), day(addDays(TODAY, -1), 'full')];
    expect(fullClearStreak(history, TODAY)).toBe(2);
  });

  it('breaks on a floor-only day', () => {
    const history = [
      day(addDays(TODAY, -2), 'full'),
      day(addDays(TODAY, -1), 'floor'),
      day(TODAY, 'full'),
    ];
    expect(fullClearStreak(history, TODAY)).toBe(1);
  });

  it('treats a day off as neutral', () => {
    const history = [
      day(addDays(TODAY, -2), 'full'),
      day(addDays(TODAY, -1), null, true),
      day(TODAY, 'full'),
    ];
    expect(fullClearStreak(history, TODAY)).toBe(2);
  });

  it('is zero with no history', () => {
    expect(fullClearStreak([], TODAY)).toBe(0);
  });
});
