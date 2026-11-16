/**
 * The chest reveal. The animation can't be asserted, but the payout structure
 * can: a milestone bonus and a settled contract are crits stacked on the plain
 * review payout, and an ordinary chest has no crits at all.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Reward } from '@/domain/rewards';
import type { ScoreResult } from '@/domain/scoring';
import type { ReviewOutcome } from '@/state/actions';
import { createInitialState } from '@/state/defaults';
import { setStorageBackend } from '@/state/storage';
import { createStore, type Store } from '@/state/store';
import { createChestSequence } from './chest';

/** Motion reduced, so the open sequence's waits collapse to microtasks. */
function reducedStore(): Store {
  const base = createInitialState(new Date(2026, 6, 22));
  return createStore({ ...base, settings: { ...base.settings, reduceMotion: true } });
}

const SCORE: ScoreResult = {
  tier: 'full',
  points: 12,
  basePoints: 10,
  bonusPoints: 2,
  availablePoints: 10,
  fullClearPoints: 12,
  doneItemIds: [],
  skippedItemIds: [],
  setAsideItemIds: [],
  countsForStreak: true,
};

function outcomeOf(reward: Reward): ReviewOutcome {
  return {
    reviewId: 'morning',
    score: SCORE,
    reward,
    streakBefore: 19,
    streakAfter: 20,
    advancedStreak: true,
    earnedAchievements: [],
    cinderEarned: 0,
    weeklyCinder: 0,
  };
}

/** Open the chest and let the (motion-free) reveal settle. */
async function reveal(el: HTMLElement): Promise<void> {
  el.querySelector<HTMLButtonElement>('.chest__button')!.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  const map = new Map<string, string>();
  setStorageBackend({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  });
});

afterEach(() => {
  document.documentElement.removeAttribute('data-reduce-motion');
});

describe('chest payout rows', () => {
  it('marks the milestone bonus and the contract as crits', async () => {
    const reward: Reward = {
      chest: 'big-milestone',
      reviewLumen: 100,
      passiveLumen: 0,
      heat: 1,
      bonusLumen: 500,
      contractLumen: 80,
      contractId: 'both-logged',
      weeklyLumen: 0,
      weeklyId: null,
      totalLumen: 680,
      cosmeticId: null,
      milestone: { kind: 'big', at: 20 },
    };
    const seq = createChestSequence({
      store: reducedStore(),
      outcome: outcomeOf(reward),
      onDone: () => {},
    });
    await reveal(seq.el);

    expect(seq.el.querySelectorAll('.chest-loot__row--crit')).toHaveLength(2);
    expect(seq.el.querySelectorAll('.chest-loot__crit-tag')).toHaveLength(2);
    // The plain review payout is still there, and is not a crit.
    expect(
      seq.el.querySelectorAll('.chest-loot__row:not(.chest-loot__row--crit)').length,
    ).toBeGreaterThanOrEqual(1);
    seq.destroy();
  });

  it('gives an ordinary chest no crit rows', async () => {
    const reward: Reward = {
      chest: 'standard',
      reviewLumen: 100,
      passiveLumen: 0,
      heat: 1,
      bonusLumen: 0,
      contractLumen: 0,
      contractId: null,
      weeklyLumen: 0,
      weeklyId: null,
      totalLumen: 100,
      cosmeticId: null,
      milestone: null,
    };
    const seq = createChestSequence({
      store: reducedStore(),
      outcome: outcomeOf(reward),
      onDone: () => {},
    });
    await reveal(seq.el);

    expect(seq.el.querySelectorAll('.chest-loot__row--crit')).toHaveLength(0);
    seq.destroy();
  });
});
