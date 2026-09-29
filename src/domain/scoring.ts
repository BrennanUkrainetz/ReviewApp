/**
 * Two-tier scoring and the points → Lumen conversion.
 *
 * Pure functions only: given a checklist and which items were done, everything
 * here is deterministic and unit-tested (`scoring.test.ts`).
 */
import { maxPoints, type Checklist } from '@/config/checklists';
import {
  FULL_CLEAR_BONUS_POINTS,
  LUMEN_PER_POINT,
  MULTIPLIER_CAP_STREAK,
  MULTIPLIER_PER_DAY,
  REVIEW_SHARE_OF_OUTPUT,
} from '@/config/tuning';
import type { Tier } from '@/state/types';
import { NO_MODS, type Mods } from './ascension';

export interface ScoreResult {
  tier: Tier;
  /** Points from completed items, plus the full-clear bonus when earned. */
  points: number;
  /** Points from completed items only, for display against `availablePoints`. */
  basePoints: number;
  bonusPoints: number;
  /**
   * The day's ceiling before the bonus: every item that was actually in play,
   * which is `maxPoints` less anything set aside. This — not `maxPoints` — is
   * what `basePoints` should be shown against, so setting a step aside moves
   * the target rather than leaving a gap that can't be closed.
   */
  availablePoints: number;
  /**
   * What a full clear of *this run* scores, bonus included — the denominator
   * the payout's city share is pro-rated against. Carried on the result
   * because checklists are editable save data and optional items shrink the
   * ceiling, so it is a property of the review that was actually run.
   */
  fullClearPoints: number;
  doneItemIds: string[];
  /** Items that were skipped and counted against the run. */
  skippedItemIds: string[];
  /**
   * Optional items that were skipped. They cost nothing: not the points, not
   * the full clear. Reported so the summary can name what was set aside.
   */
  setAsideItemIds: string[];
  /** True when the tier keeps the streak alive (floor or full). */
  countsForStreak: boolean;
}

/**
 * Grades a finished review.
 *
 * Floor = every core item done. Full = every item that applied today done.
 * Anything less still pays out for the work done, it just doesn't advance the
 * streak.
 *
 * A skipped *optional* item is set aside rather than missed: it leaves both
 * sides of the fraction, so the run is graded on the shorter checklist it
 * actually was. A full clear of five items on a day the sixth didn't apply is
 * a full clear — same tier, same bonus, same share of the city.
 */
export function scoreReview(
  checklist: Checklist,
  doneIds: Iterable<string>,
): ScoreResult {
  const done = new Set(doneIds);
  const doneItems = checklist.items.filter((item) => done.has(item.id));
  const skipped = checklist.items.filter((item) => !done.has(item.id));
  const setAside = skipped.filter((item) => item.optional === true);
  const missed = skipped.filter((item) => item.optional !== true);

  const basePoints = doneItems.reduce((sum, item) => sum + item.points, 0);
  const availablePoints =
    maxPoints(checklist) - setAside.reduce((sum, item) => sum + item.points, 0);

  // Nothing done is nothing achieved, whatever the checklist is made of. The
  // guard matters only for a routine that is *all* optional, where skipping
  // every item would otherwise leave no item missed and read as a full clear.
  const didSomething = doneItems.length > 0;
  const allDone = didSomething && missed.length === 0;
  const coreDone =
    didSomething && checklist.items.every((item) => !item.core || done.has(item.id));

  const tier: Tier = allDone ? 'full' : coreDone ? 'floor' : 'none';
  const bonusPoints = tier === 'full' ? FULL_CLEAR_BONUS_POINTS : 0;

  return {
    tier,
    points: basePoints + bonusPoints,
    basePoints,
    bonusPoints,
    availablePoints,
    fullClearPoints: availablePoints + FULL_CLEAR_BONUS_POINTS,
    doneItemIds: doneItems.map((item) => item.id),
    skippedItemIds: missed.map((item) => item.id),
    setAsideItemIds: setAside.map((item) => item.id),
    countsForStreak: tier !== 'none',
  };
}

/**
 * Streak bonus applied to every payout: 1.0 at streak 0, capped at
 * `1 + MULTIPLIER_CAP_STREAK * MULTIPLIER_PER_DAY` (1.4x at a 20 streak).
 *
 * The Discipline perks move both ends of that — a raised cap keeps the ramp
 * climbing past day 20, and a raised rate makes every day of it worth more.
 */
export function streakMultiplier(streak: number, mods: Mods = NO_MODS): number {
  const cap = MULTIPLIER_CAP_STREAK + mods.streakCap;
  const effective = Math.min(Math.max(streak, 0), cap);
  return 1 + effective * (MULTIPLIER_PER_DAY + mods.streakRate);
}

/**
 * The city the payout is being struck against.
 *
 * `fullClearPoints` normalises the share: a checklist edited to be twice as
 * long is worth the same full clear, not twice the Lumen, so the payout can
 * never be inflated by adding items. It is the run's ceiling, not the
 * checklist's, which is what keeps a day with a step set aside paying the same
 * full clear as a day without one.
 */
export interface ReviewScale {
  /** The city's daily output, after mods. */
  cityOutput: number;
  fullClearPoints: number;
}

/** A city that pays no share — the flat rate alone. The default. */
export const NO_CITY: ReviewScale = { cityOutput: 0, fullClearPoints: 0 };

/**
 * Lumen paid for `points`, at the streak the day will end on.
 *
 * Two figures, and the better one wins: the flat rate per point, and a share
 * of what the city produces in a day (see `REVIEW_SHARE_OF_OUTPUT`). Taking
 * the maximum rather than the sum keeps one rule doing the work at a time —
 * the flat rate is a floor for a city too small to have a meaningful share,
 * and past that the review scales with everything else in the economy.
 *
 * Either way the result is linear in points, so the gradient the checklist
 * cares about — a full clear beats a floor pass beats a partial — is exactly
 * the gradient it always was.
 */
export function lumenFor(
  points: number,
  streak: number,
  mods: Mods = NO_MODS,
  scale: ReviewScale = NO_CITY,
): number {
  const flat = points * LUMEN_PER_POINT;
  const share =
    scale.fullClearPoints > 0
      ? (scale.cityOutput * REVIEW_SHARE_OF_OUTPUT * points) / scale.fullClearPoints
      : 0;
  return Math.round(Math.max(flat, share) * streakMultiplier(streak, mods) * mods.review);
}

const TIER_LABELS: Record<Tier, string> = {
  full: 'Full clear',
  floor: 'Floor pass',
  none: 'Partial',
};

export function tierLabel(tier: Tier): string {
  return TIER_LABELS[tier];
}
