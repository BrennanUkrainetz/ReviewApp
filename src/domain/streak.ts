/**
 * Streak continuity rules.
 *
 * Two things keep a streak alive: completing a review at floor tier or above,
 * or explicitly marking a day off. Letting a whole calendar day pass with
 * neither breaks the run back to 0, detected the next time the app opens.
 *
 * The main streak is stored (it's the number Brennan sees every day). The
 * full-clear streak is *derived* from history so the two can never drift.
 */
import type { AerieState, DayRecord, Tier } from '@/state/types';
import { addDays, daysBetween, type DateKey } from './dates';

/** Reads a day's record out of history, if there is one. */
export function findDay(history: DayRecord[], date: DateKey): DayRecord | undefined {
  return history.find((day) => day.date === date);
}

/** A blank day record, used when logging the first activity of a day. */
export function emptyDay(date: DateKey): DayRecord {
  return { date, morning: null, daily: null, dayOff: false };
}

/**
 * Applies the "a missed day breaks the run" rule.
 *
 * Returns the streak state as it should be *now*, given the last day that kept
 * continuity. Safe to call on every app open; it is a no-op when the run is
 * still alive.
 */
export function reconcileStreak(state: AerieState, today: DateKey): AerieState {
  const { lastActiveDate, current } = state.streak;

  if (current === 0) return state;
  if (lastActiveDate === null) {
    return { ...state, streak: { ...state.streak, current: 0 } };
  }

  const gap = daysBetween(lastActiveDate, today);
  // gap 0 = active today, gap 1 = active yesterday and today is still open.
  if (gap <= 1) return state;

  return { ...state, streak: { ...state.streak, current: 0 } };
}

/** True when today's activity should push the streak up by one. */
export function shouldAdvanceStreak(state: AerieState, today: DateKey): boolean {
  return state.streak.lastCompletedDate !== today;
}

/**
 * Advances the streak for a qualifying review completion. Only the first
 * qualifying review of a day counts — doing both reviews is worth more Lumen,
 * not more streak.
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

/** Marks today as a deliberate day off: continuity held, streak unchanged. */
export function markDayOff(state: AerieState, today: DateKey): AerieState {
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
 * Consecutive days ending today (or yesterday, if today isn't done yet) with
 * at least one full clear. Days off are neutral — they neither break nor
 * extend it. Bragging-rights stat only; nothing depends on it.
 */
export function fullClearStreak(history: DayRecord[], today: DateKey): number {
  const byDate = new Map(history.map((day) => [day.date, day]));
  let streak = 0;
  let cursor = today;

  for (let guard = 0; guard < 3650; guard += 1) {
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
