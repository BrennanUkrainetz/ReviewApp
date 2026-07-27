/**
 * Heat — the full-clear combo.
 *
 * The streak asks "did you show up?"; heat asks "did you finish?". A floor
 * pass keeps the streak and earns nothing here, which is the point: the floor
 * exists so a bad day is survivable, and heat exists so a good one is worth
 * more than a survivable one.
 *
 * Derived from history rather than stored, for the same reason the full-clear
 * streak is (see docs/DECISIONS.md): two counters that must agree are two
 * counters that can disagree.
 */
import { HEAT_CAP_DAYS, HEAT_PER_DAY } from '@/config/tuning';
import { fullClearStreak } from './streak';
import type { DateKey } from './dates';
import type { DayRecord } from '@/state/types';

/** Consecutive days, ending today, on which at least one review was full-cleared. */
export function heatDays(history: DayRecord[], today: DateKey): number {
  return fullClearStreak(history, today);
}

/** Payout multiplier from heat: 1× cold, up to 3× at the cap. */
export function heatMultiplier(history: DayRecord[], today: DateKey): number {
  return 1 + Math.min(heatDays(history, today), HEAT_CAP_DAYS) * HEAT_PER_DAY;
}

/** Copy for the city screen — states the number and what would keep it. */
export function describeHeat(days: number): string {
  if (days === 0) return 'No heat. A full clear today starts it.';
  const at = 1 + Math.min(days, HEAT_CAP_DAYS) * HEAT_PER_DAY;
  const capped = days >= HEAT_CAP_DAYS;
  return capped
    ? `Heat at its peak, ×${at.toFixed(1)} on everything.`
    : `${days} full-clear ${days === 1 ? 'day' : 'days'} running · ×${at.toFixed(1)} on everything.`;
}
