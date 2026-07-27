import { describe, expect, it } from 'vitest';
import { COSMETICS } from '@/config/shop';
import {
  BIG_MILESTONE_BONUS_FLOOR,
  SMALL_MILESTONE_BONUS_FLOOR,
  SMALL_MILESTONE_BONUS_SHARE,
} from '@/config/tuning';
import { createInitialState } from '@/state/defaults';
import {
  buildReward,
  checkMilestones,
  lockedCosmetics,
  milestoneBonus,
  rollCosmetic,
  type Rng,
} from './rewards';

const baseMilestones = createInitialState().milestones;

/** Deterministic RNG that walks a fixed list of values. */
function seq(...values: number[]): Rng {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

describe('checkMilestones', () => {
  it('fires the small milestone every interval and moves the marker', () => {
    const { hit, milestones } = checkMilestones(baseMilestones, 5);
    expect(hit).toEqual({ kind: 'small', at: 5 });
    expect(milestones.nextSmallAt).toBe(10);
    expect(milestones.nextBigAt).toBe(20);
  });

  it('fires nothing between milestones', () => {
    expect(checkMilestones(baseMilestones, 3).hit).toBeNull();
  });

  it('fires the big milestone at 20 and keeps repeating at 40', () => {
    const first = checkMilestones({ ...baseMilestones, nextSmallAt: 20 }, 20);
    expect(first.hit).toEqual({ kind: 'big', at: 20 });
    expect(first.milestones.totalBigMilestonesHit).toBe(1);
    expect(first.milestones.nextBigAt).toBe(40);
    // The small marker still moves past 20 so it doesn't fire late.
    expect(first.milestones.nextSmallAt).toBe(25);

    const second = checkMilestones(first.milestones, 40);
    expect(second.hit?.kind).toBe('big');
    expect(second.milestones.totalBigMilestonesHit).toBe(2);
    expect(second.milestones.nextBigAt).toBe(60);
  });

  it('does not reset the streak-based markers when nothing is hit', () => {
    const { milestones } = checkMilestones(baseMilestones, 1);
    expect(milestones).toEqual(baseMilestones);
  });
});

describe('milestoneBonus', () => {
  it('pays a share of the day, so late milestones stay meaningful', () => {
    expect(milestoneBonus('small', 1_000_000)).toBe(
      1_000_000 * SMALL_MILESTONE_BONUS_SHARE,
    );
  });

  it('falls back to the flat floor while the day is still small', () => {
    expect(milestoneBonus('small', 10)).toBe(SMALL_MILESTONE_BONUS_FLOOR);
    expect(milestoneBonus('big', 10)).toBe(BIG_MILESTONE_BONUS_FLOOR);
  });
});

describe('rollCosmetic', () => {
  it('only ever draws from the locked pool', () => {
    const unlocked = COSMETICS.slice(0, COSMETICS.length - 1).map((c) => c.id);
    const last = COSMETICS[COSMETICS.length - 1]!;
    expect(lockedCosmetics(unlocked)).toHaveLength(1);
    expect(rollCosmetic(unlocked, seq(0.99))).toBe(last.id);
  });

  it('returns null once everything is unlocked', () => {
    const all = COSMETICS.map((c) => c.id);
    expect(rollCosmetic(all, seq(0.5))).toBeNull();
  });

  it('respects drop weights at the low end of the range', () => {
    const first = COSMETICS[0]!;
    expect(rollCosmetic([], seq(0))).toBe(first.id);
  });
});

describe('buildReward', () => {
  it('pays the review and the milestone, but leaves the city output to the vault', () => {
    const reward = buildReward({
      reviewLumen: 120,
      passiveLumen: 18,
      milestone: { kind: 'small', at: 5 },
      unlockedCosmetics: COSMETICS.map((c) => c.id),
      rng: seq(0.99),
    });
    expect(reward.totalLumen).toBe(120 + SMALL_MILESTONE_BONUS_FLOOR);
    expect(reward.passiveLumen).toBe(18);
    expect(reward.chest).toBe('small-milestone');
  });

  it('strikes the milestone share against the city output all the same', () => {
    // A big city opens a big chest even though its output is not in the chest.
    const rich = buildReward({
      reviewLumen: 100,
      passiveLumen: 1_000_000,
      milestone: { kind: 'small', at: 5 },
      unlockedCosmetics: COSMETICS.map((c) => c.id),
      rng: seq(0.99),
    });
    const poor = buildReward({
      reviewLumen: 100,
      passiveLumen: 0,
      milestone: { kind: 'small', at: 5 },
      unlockedCosmetics: COSMETICS.map((c) => c.id),
      rng: seq(0.99),
    });
    expect(rich.bonusLumen).toBeGreaterThan(poor.bonusLumen);
    expect(rich.totalLumen - rich.bonusLumen).toBe(poor.totalLumen - poor.bonusLumen);
  });

  it('uses the standard chest with no milestone, and can drop nothing', () => {
    const reward = buildReward({
      reviewLumen: 100,
      passiveLumen: 0,
      milestone: null,
      unlockedCosmetics: [],
      rng: seq(0.99),
    });
    expect(reward.chest).toBe('standard');
    expect(reward.cosmeticId).toBeNull();
    expect(reward.totalLumen).toBe(100);
  });

  it('always drops a cosmetic from a milestone chest while any remain', () => {
    const reward = buildReward({
      reviewLumen: 100,
      passiveLumen: 0,
      milestone: { kind: 'big', at: 20 },
      unlockedCosmetics: [],
      rng: seq(0.99, 0),
    });
    expect(reward.chest).toBe('big-milestone');
    expect(reward.cosmeticId).not.toBeNull();
  });
});
