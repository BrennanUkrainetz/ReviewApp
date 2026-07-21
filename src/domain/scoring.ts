/**
 * Two-tier scoring and the points → Lumen conversion.
 *
 * Pure functions only: given a checklist and which items were done, everything
 * here is deterministic and unit-tested (`scoring.test.ts`).
 */
import type { Checklist } from '@/config/checklists';
import {
  FULL_CLEAR_BONUS_POINTS,
  LUMEN_PER_POINT,
  MULTIPLIER_CAP_STREAK,
  MULTIPLIER_PER_DAY,
} from '@/config/tuning';
import type { Tier } from '@/state/types';

export interface ScoreResult {
  tier: Tier;
  /** Points from completed items, plus the full-clear bonus when earned. */
  points: number;
  /** Points from completed items only, for display against `maxPoints`. */
  basePoints: number;
  bonusPoints: number;
  doneItemIds: string[];
  skippedItemIds: string[];
  /** True when the tier keeps the streak alive (floor or full). */
  countsForStreak: boolean;
}

/**
 * Grades a finished review.
 *
 * Floor = every core item done. Full = every item done. Anything less still
 * pays out for the work done, it just doesn't advance the streak.
 */
export function scoreReview(checklist: Checklist, doneIds: Iterable<string>): ScoreResult {
  const done = new Set(doneIds);
  const doneItems = checklist.items.filter((item) => done.has(item.id));
  const skipped = checklist.items.filter((item) => !done.has(item.id));

  const basePoints = doneItems.reduce((sum, item) => sum + item.points, 0);
  const allDone = skipped.length === 0;
  const coreDone = checklist.items.every((item) => !item.core || done.has(item.id));

  const tier: Tier = allDone ? 'full' : coreDone ? 'floor' : 'none';
  const bonusPoints = tier === 'full' ? FULL_CLEAR_BONUS_POINTS : 0;

  return {
    tier,
    points: basePoints + bonusPoints,
    basePoints,
    bonusPoints,
    doneItemIds: doneItems.map((item) => item.id),
    skippedItemIds: skipped.map((item) => item.id),
    countsForStreak: tier !== 'none',
  };
}

/**
 * Streak bonus applied to every payout: 1.0 at streak 0, capped at
 * `1 + MULTIPLIER_CAP_STREAK * MULTIPLIER_PER_DAY` (1.4x at a 20 streak).
 */
export function streakMultiplier(streak: number): number {
  const effective = Math.min(Math.max(streak, 0), MULTIPLIER_CAP_STREAK);
  return 1 + effective * MULTIPLIER_PER_DAY;
}

/** Lumen paid for `points`, at the streak the day will end on. */
export function lumenFor(points: number, streak: number): number {
  return Math.round(points * LUMEN_PER_POINT * streakMultiplier(streak));
}

const TIER_LABELS: Record<Tier, string> = {
  full: 'Full clear',
  floor: 'Floor pass',
  none: 'Partial',
};

export function tierLabel(tier: Tier): string {
  return TIER_LABELS[tier];
}
