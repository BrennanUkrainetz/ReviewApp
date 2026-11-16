/**
 * Picking, tracking and settling the week's expedition.
 *
 * Everything is derived from history: which expedition a week has, how far
 * along it is, and whether a given review is the one that finished it. Nothing
 * is persisted, for the same reason heat isn't — two records that must agree
 * are two records that can disagree.
 */
import { getWeekly, WEEKLIES, type WeeklyDef } from '@/config/weekly';
import { WEEKLY_BONUS_FLOOR } from '@/config/tuning';
import type { DayRecord } from '@/state/types';
import { addDays, weekStart, type DateKey } from './dates';

/** FNV-1a, salted so a week's pick isn't correlated with its Monday's contract. */
function hashWeek(monday: DateKey): number {
  let hash = 0x811c9dc5;
  for (const char of `week:${monday}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The expedition for the week `date` falls in. Same answer all week. */
export function weeklyFor(date: DateKey): WeeklyDef {
  const index = hashWeek(weekStart(date)) % WEEKLIES.length;
  return WEEKLIES[index] ?? WEEKLIES[0]!;
}

/** Progress toward a week's expedition, from the days recorded in that week. */
export function weeklyProgress(
  weekly: WeeklyDef,
  history: readonly DayRecord[],
  date: DateKey,
): number {
  const monday = weekStart(date);
  const sunday = addDays(monday, 6);
  const total = history
    .filter((day) => day.date >= monday && day.date <= sunday)
    .reduce((sum, day) => sum + weekly.count(day), 0);
  return Math.min(total, weekly.target);
}

/**
 * Whether the review just logged is the one that finished the week — complete
 * now, but not before. An expedition pays once, on the review that lands it.
 */
export function weeklyJustSettled(
  weekly: WeeklyDef,
  before: readonly DayRecord[],
  after: readonly DayRecord[],
  date: DateKey,
): boolean {
  return (
    weeklyProgress(weekly, before, date) < weekly.target &&
    weeklyProgress(weekly, after, date) >= weekly.target
  );
}

/** Lumen an expedition pays, given the city's output at the day's heat. */
export function weeklyBonus(weekly: WeeklyDef, heatedOutput: number): number {
  return Math.max(WEEKLY_BONUS_FLOOR, Math.round(heatedOutput * weekly.bonusShare));
}

/** Weeks in history whose expedition was completed — for achievements. */
export function weekliesCompleted(history: readonly DayRecord[]): number {
  const mondays = new Set(history.map((day) => weekStart(day.date)));
  let done = 0;
  for (const monday of mondays) {
    const weekly = weeklyFor(monday);
    if (weeklyProgress(weekly, history, monday) >= weekly.target) done += 1;
  }
  return done;
}

export { getWeekly };
