/**
 * Streak continuity rules.
 *
 * Two things keep a streak alive: completing a review at floor tier or above,
 * or explicitly marking a day off. Letting a whole *weekday* pass with neither
 * breaks the run back to 0, detected the next time the app opens.
 *
 * Weekends are not days here. They can't be missed, they don't extend anything,
 * and a Friday review carries the run straight through to Monday — the routine
 * is a working-week habit, so a week of Monday-to-Friday reviews is a week
 * kept, not a week broken. A review logged on a Saturday is welcome and still
 * pays, but it is a bonus: it moves neither the streak nor heat.
 *
 * The main streak is stored (it's the number Brennan sees every day). The
 * full-clear streak is *derived* from history so the two can never drift.
 */
import type { AerieState, DayRecord, Tier } from '@/state/types';
import { addDays, isWeekend, missedWeekdays, type DateKey } from './dates';
import { coverOrBreak, expireBroken } from './wards';

/** Reads a day's record out of history, if there is one. */
export function findDay(history: DayRecord[], date: DateKey): DayRecord | undefined {
  return history.find((day) => day.date === date);
}

/** A blank day record, used when logging the first activity of a day. */
export function emptyDay(date: DateKey): DayRecord {
  return { date, morning: null, daily: null, dayOff: false };
}

/**
 * Applies the "a missed weekday breaks the run" rule.
 *
 * Returns the streak state as it should be *now*, given the last day that kept
 * continuity. Safe to call on every app open and on a timer; it is a no-op
 * (same reference back) when the run is still alive — including all weekend,
 * and on Monday before anything is logged.
 *
 * A gap is covered by held wards if there are enough of them; otherwise the
 * run breaks, and is remembered for a few days so it can be mended. Both live
 * in `domain/wards.ts`. A remembered run whose mend window has closed is
 * forgotten here too.
 */
export function reconcileStreak(state: AerieState, today: DateKey): AerieState {
  const current = expireBroken(state, today);
  const { lastActiveDate } = current.streak;

  if (current.streak.current === 0) return current;
  if (lastActiveDate === null) {
    return { ...current, streak: { ...current.streak, current: 0 } };
  }

  // Today itself doesn't count against the run: it is still open.
  if (missedWeekdays(lastActiveDate, today) === 0) return current;

  return coverOrBreak(current, today);
}

/**
 * True when today's activity should push the streak up by one. Weekend work is
 * a bonus rather than a rung on the ladder, so it never advances.
 */
export function shouldAdvanceStreak(state: AerieState, today: DateKey): boolean {
  return !isWeekend(today) && state.streak.lastCompletedDate !== today;
}

/**
 * Advances the streak for a qualifying review completion. Only the first
 * qualifying review of a weekday counts — doing both reviews is worth more
 * Lumen, not more streak, and a weekend review is worth Lumen only.
 *
 * The weekend case still stamps `lastActiveDate`, which costs nothing: the
 * continuity check ignores weekends either way.
 */
export function advanceStreak(state: AerieState, today: DateKey): AerieState {
  if (!shouldAdvanceStreak(state, today)) {
    return {
      ...state,
      streak: { ...state.streak, lastActiveDate: today },
    };
  }

  const current = state.streak.current + 1;
  return {
    ...state,
    streak: {
      ...state.streak,
      current,
      longest: Math.max(state.streak.longest, current),
      lastCompletedDate: today,
      lastActiveDate: today,
    },
  };
}

/**
 * Marks today as a deliberate day off: continuity held, streak unchanged.
 *
 * A no-op on a weekend — those are already off, and spending one of the days
 * off you get credit for on a Saturday would be spending it on nothing.
 */
export function markDayOff(state: AerieState, today: DateKey): AerieState {
  if (isWeekend(today)) return state;
  return {
    ...state,
    streak: {
      ...state.streak,
      lastActiveDate: today,
      daysOffUsed: state.streak.daysOffUsed + 1,
    },
  };
}

function bestTier(day: DayRecord): Tier {
  const tiers: Tier[] = [];
  if (day.morning?.completed) tiers.push(day.morning.tier);
  if (day.daily?.completed) tiers.push(day.daily.tier);
  if (tiers.includes('full')) return 'full';
  if (tiers.includes('floor')) return 'floor';
  return 'none';
}

/**
 * Consecutive weekdays ending today (or the last weekday, if today isn't done
 * yet) with at least one full clear. Weekends and days off are both neutral —
 * they neither break the run nor extend it.
 */
export function fullClearStreak(history: DayRecord[], today: DateKey): number {
  const byDate = new Map(history.map((day) => [day.date, day]));
  let streak = 0;
  let cursor = today;

  for (let guard = 0; guard < 3650; guard += 1) {
    if (isWeekend(cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    const day = byDate.get(cursor);
    if (!day) {
      // Today being unfinished is fine; any earlier hole ends the run.
      if (cursor === today) {
        cursor = addDays(cursor, -1);
        continue;
      }
      break;
    }
    if (day.dayOff && bestTier(day) !== 'full') {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (bestTier(day) !== 'full') break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

/** Days on which at least one review was completed at any tier. */
export function totalReviewDays(history: DayRecord[]): number {
  return history.filter((day) => day.morning?.completed ?? day.daily?.completed).length;
}

/** Every review record in history, newest first, tagged with its date. */
export function totalReviewsCompleted(history: DayRecord[]): number {
  return history.reduce(
    (count, day) =>
      count + (day.morning?.completed ? 1 : 0) + (day.daily?.completed ? 1 : 0),
    0,
  );
}
