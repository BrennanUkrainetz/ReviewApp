/**
 * What a finished review actually pays out: Lumen, the odd cosmetic, and the
 * milestone that turns an ordinary chest into a rare one.
 *
 * All randomness comes in through an injectable `Rng`, so the whole payout is
 * reproducible under test.
 */
import { COSMETICS, getBuilding, type CosmeticDef } from '@/config/shop';
import {
  BIG_MILESTONE_BONUS_LUMEN,
  COSMETIC_DROP_CHANCE,
  MILESTONE_COSMETIC_DROP_CHANCE,
  SMALL_MILESTONE_BONUS_LUMEN,
} from '@/config/tuning';
import type { MilestoneState, OwnedBuilding } from '@/state/types';

/** Returns a float in [0, 1). `Math.random` in production. */
export type Rng = () => number;

export const defaultRng: Rng = Math.random;

export type ChestKind = 'standard' | 'small-milestone' | 'big-milestone';

export interface MilestoneHit {
  kind: 'small' | 'big';
  /** The streak value that triggered it. */
  at: number;
  bonusLumen: number;
}

export interface Reward {
  chest: ChestKind;
  /** Lumen from the review's points, after the streak multiplier. */
  reviewLumen: number;
  /** Lumen trickled in by owned buildings — paid once per day. */
  passiveLumen: number;
  /** Flat bonus attached to a milestone chest. */
  bonusLumen: number;
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
    hit = { kind: 'big', at: next.nextBigAt, bonusLumen: BIG_MILESTONE_BONUS_LUMEN };
    next.totalBigMilestonesHit += 1;
    while (streak >= next.nextBigAt) next.nextBigAt += next.bigInterval;
  }

  if (streak >= next.nextSmallAt) {
    if (!hit) {
      hit = { kind: 'small', at: next.nextSmallAt, bonusLumen: SMALL_MILESTONE_BONUS_LUMEN };
    }
    while (streak >= next.nextSmallAt) next.nextSmallAt += next.smallInterval;
  }

  return { hit, milestones: next };
}

/** Total daily Lumen trickle from every owned building at its current level. */
export function passiveIncome(buildings: OwnedBuilding[]): number {
  return buildings.reduce((sum, owned) => {
    const def = getBuilding(owned.id);
    return def ? sum + def.incomePerLevel * owned.level : sum;
  }, 0);
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
  reviewLumen: number;
  passiveLumen: number;
  milestone: MilestoneHit | null;
  unlockedCosmetics: readonly string[];
  rng?: Rng;
}

/** Assembles the full chest contents for a completed review. */
export function buildReward({
  reviewLumen,
  passiveLumen,
  milestone,
  unlockedCosmetics,
  rng = defaultRng,
}: RewardInput): Reward {
  const chest: ChestKind = milestone
    ? milestone.kind === 'big'
      ? 'big-milestone'
      : 'small-milestone'
    : 'standard';

  const dropChance = milestone ? MILESTONE_COSMETIC_DROP_CHANCE : COSMETIC_DROP_CHANCE;
  const cosmeticId = rng() < dropChance ? rollCosmetic(unlockedCosmetics, rng) : null;
  const bonusLumen = milestone?.bonusLumen ?? 0;

  return {
    chest,
    reviewLumen,
    passiveLumen,
    bonusLumen,
    totalLumen: reviewLumen + passiveLumen + bonusLumen,
    cosmeticId,
    milestone,
  };
}
