/**
 * What a finished review actually pays out: Lumen, the odd cosmetic, and the
 * milestone that turns an ordinary chest into a rare one.
 *
 * All randomness comes in through an injectable `Rng`, so the whole payout is
 * reproducible under test.
 */
import { COSMETICS, type CosmeticDef } from '@/config/shop';
import {
  BIG_MILESTONE_BONUS_FLOOR,
  BIG_MILESTONE_BONUS_SHARE,
  COSMETIC_DROP_CHANCE,
  MILESTONE_COSMETIC_DROP_CHANCE,
  SMALL_MILESTONE_BONUS_FLOOR,
  SMALL_MILESTONE_BONUS_SHARE,
} from '@/config/tuning';
import type { MilestoneState } from '@/state/types';
import { NO_MODS, type Mods } from './ascension';

/** Returns a float in [0, 1). `Math.random` in production. */
export type Rng = () => number;

export const defaultRng: Rng = Math.random;

export type ChestKind = 'standard' | 'small-milestone' | 'big-milestone';

export interface MilestoneHit {
  kind: 'small' | 'big';
  /** The streak value that triggered it. */
  at: number;
}

/**
 * A milestone pays a share of the day's own payout, with a flat floor for the
 * first week when that share would round to pocket change. Paying a share is
 * what keeps a streak-100 chest feeling like a chest — a fixed 500 Lumen would
 * be invisible next to a city producing billions.
 */
export function milestoneBonus(
  kind: MilestoneHit['kind'],
  dayPayout: number,
  mods: Mods = NO_MODS,
): number {
  const [floor, share] =
    kind === 'big'
      ? [BIG_MILESTONE_BONUS_FLOOR, BIG_MILESTONE_BONUS_SHARE]
      : [SMALL_MILESTONE_BONUS_FLOOR, SMALL_MILESTONE_BONUS_SHARE];
  return Math.round(Math.max(floor, dayPayout * share) * mods.milestone);
}

export interface Reward {
  chest: ChestKind;
  /** Lumen from the review's points, after the streak multiplier and heat. */
  reviewLumen: number;
  /**
   * What the city itself is producing, after heat. **Not** part of `totalLumen`
   * — this income accrues into the vault around the clock now (see
   * `domain/vault.ts`). It is still what the milestone and contract shares are
   * calculated against, so a big city still opens big chests; it is reported
   * here only so the chest can show what the day is worth.
   */
  passiveLumen: number;
  /** The full-clear combo multiplier this payout was run through. */
  heat: number;
  /** Bonus attached to a milestone chest. */
  bonusLumen: number;
  /** Bonus for settling the day's contract, and which one it was. */
  contractLumen: number;
  contractId: string | null;
  /** Bonus for finishing the week's expedition, and which one it was. */
  weeklyLumen: number;
  weeklyId: string | null;
  totalLumen: number;
  cosmeticId: string | null;
  milestone: MilestoneHit | null;
}

/**
 * Checks whether reaching `streak` crosses a milestone threshold, and returns
 * the milestone bookkeeping advanced past it.
 *
 * A big milestone takes precedence when both land on the same day; the small
 * marker still moves forward so it doesn't fire late.
 */
export function checkMilestones(
  milestones: MilestoneState,
  streak: number,
): { hit: MilestoneHit | null; milestones: MilestoneState } {
  const next = { ...milestones };
  let hit: MilestoneHit | null = null;

  if (streak >= next.nextBigAt) {
    hit = { kind: 'big', at: next.nextBigAt };
    next.totalBigMilestonesHit += 1;
    while (streak >= next.nextBigAt) next.nextBigAt += next.bigInterval;
  }

  if (streak >= next.nextSmallAt) {
    if (!hit) {
      hit = { kind: 'small', at: next.nextSmallAt };
    }
    while (streak >= next.nextSmallAt) next.nextSmallAt += next.smallInterval;
  }

  return { hit, milestones: next };
}

/** Cosmetics not yet unlocked, i.e. the pool a chest can still draw from. */
export function lockedCosmetics(unlocked: readonly string[]): CosmeticDef[] {
  const owned = new Set(unlocked);
  return COSMETICS.filter((cosmetic) => !owned.has(cosmetic.id));
}

/** Weighted pick from the locked pool. Returns `null` once everything is owned. */
export function rollCosmetic(unlocked: readonly string[], rng: Rng): string | null {
  const pool = lockedCosmetics(unlocked);
  if (pool.length === 0) return null;

  const totalWeight = pool.reduce((sum, cosmetic) => sum + cosmetic.dropWeight, 0);
  let ticket = rng() * totalWeight;
  for (const cosmetic of pool) {
    ticket -= cosmetic.dropWeight;
    if (ticket <= 0) return cosmetic.id;
  }
  return pool[pool.length - 1]?.id ?? null;
}

export interface RewardInput {
  /** Before heat — this function applies it. */
  reviewLumen: number;
  passiveLumen: number;
  /** Full-clear combo multiplier. 1 when cold. */
  heat?: number;
  /** The day's contract, if this review is the one that settled it. */
  contract?: { id: string; bonus: number } | null;
  /** The week's expedition, if this review is the one that finished it. */
  weekly?: { id: string; bonus: number } | null;
  milestone: MilestoneHit | null;
  unlockedCosmetics: readonly string[];
  rng?: Rng;
  mods?: Mods;
}

/**
 * Assembles the full chest contents for a completed review.
 *
 * Order matters, and it is this: the base payout is multiplied by heat first,
 * and the milestone and contract bonuses are then shares of *that*. Bonuses
 * therefore ride the combo rather than being flat additions beside it, which
 * is what keeps a good run's chest feeling categorically different from an
 * ordinary one instead of just slightly larger.
 *
 * The city's own output is part of that basis but is *not* paid out here — it
 * goes to the vault. So a chest scales with how big the city has grown without
 * double-paying what the vault is already accruing.
 */
export function buildReward({
  reviewLumen,
  passiveLumen,
  heat = 1,
  contract = null,
  weekly = null,
  milestone,
  unlockedCosmetics,
  rng = defaultRng,
  mods = NO_MODS,
}: RewardInput): Reward {
  const chest: ChestKind = milestone
    ? milestone.kind === 'big'
      ? 'big-milestone'
      : 'small-milestone'
    : 'standard';

  const heatedReview = Math.round(reviewLumen * heat);
  const heatedPassive = Math.round(passiveLumen * heat);
  const base = heatedReview + heatedPassive;

  const dropChance = milestone
    ? MILESTONE_COSMETIC_DROP_CHANCE
    : COSMETIC_DROP_CHANCE + mods.drop;
  const cosmeticId = rng() < dropChance ? rollCosmetic(unlockedCosmetics, rng) : null;
  const bonusLumen = milestone ? milestoneBonus(milestone.kind, base, mods) : 0;
  const contractLumen = contract?.bonus ?? 0;
  const weeklyLumen = weekly?.bonus ?? 0;

  return {
    chest,
    reviewLumen: heatedReview,
    passiveLumen: heatedPassive,
    heat,
    bonusLumen,
    contractLumen,
    contractId: contract?.id ?? null,
    weeklyLumen,
    weeklyId: weekly?.id ?? null,
    totalLumen: heatedReview + bonusLumen + contractLumen + weeklyLumen,
    cosmeticId,
    milestone,
  };
}
