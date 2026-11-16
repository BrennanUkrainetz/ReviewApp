import { describe, expect, it } from 'vitest';
import {
  MEND_CINDER_BASE,
  MEND_CINDER_PER_DAY,
  MEND_CINDER_PER_STREAK_DAY,
  SMALL_MILESTONE_INTERVAL,
  WARD_BASE_SLOTS,
} from '@/config/tuning';
import { createInitialState } from '@/state/defaults';
import type { AerieState } from '@/state/types';
import { modsFor, NO_MODS } from './ascension';
import { heatDays } from './heat';
import { reconcileStreak } from './streak';
import { applyMend, mendDeadline, mendQuote, wardCapacity } from './wards';

// 2026-07-20 is a Monday.
const THU = '2026-07-16';
const FRI = '2026-07-17';
const MON = '2026-07-20';
const TUE = '2026-07-21';
const WED = '2026-07-22';
const THU2 = '2026-07-23';
const FRI2 = '2026-07-24';

const full = {
  completed: true,
  tier: 'full' as const,
  pointsEarned: 12,
  lumenEarned: 0,
  doneItemIds: [],
};

/** A 23-day run whose last active day was `lastActive`. */
function running(
  lastActive: string,
  patch: Partial<AerieState['streak']> = {},
): AerieState {
  const base = createInitialState();
  return {
    ...base,
    history: [{ date: lastActive, morning: full, daily: null, dayOff: false }],
    streak: {
      ...base.streak,
      current: 23,
      longest: 23,
      lastCompletedDate: lastActive,
      lastActiveDate: lastActive,
      ...patch,
    },
    milestones: {
      ...base.milestones,
      nextSmallAt: 25,
      nextBigAt: 40,
      totalBigMilestonesHit: 1,
    },
  };
}

describe('wardCapacity', () => {
  it('starts at the base and grows with perks and research', () => {
    expect(wardCapacity(NO_MODS)).toBe(WARD_BASE_SLOTS);
    const state = {
      ...createInitialState(),
      research: ['watch-1'],
      ascension: {
        count: 1,
        aether: 0,
        aetherEarned: 0,
        perkRanks: { 'discipline-4': 1 },
      },
    };
    expect(wardCapacity(modsFor(state))).toBe(WARD_BASE_SLOTS + 2);
  });
});

describe('a missed weekday', () => {
  it('is covered by a held ward, which is spent', () => {
    // Last active Friday; Monday missed; opened Tuesday.
    const next = reconcileStreak(running(FRI, { wards: 1 }), TUE);
    expect(next.streak.current).toBe(23);
    expect(next.streak.wards).toBe(0);
    expect(next.streak.wardsUsed).toBe(1);
    expect(next.streak.lastActiveDate).toBe(MON);
    expect(next.history.find((day) => day.date === MON)).toMatchObject({
      dayOff: true,
      warded: true,
    });
  });

  it('holds heat through the covered day too', () => {
    const next = reconcileStreak(running(FRI, { wards: 1 }), TUE);
    expect(heatDays(next.history, TUE)).toBe(1);
  });

  it('spends nothing when there are too few wards for the whole gap', () => {
    // Monday and Tuesday both missed, one ward: the run breaks, the ward stays.
    const next = reconcileStreak(running(FRI, { wards: 1 }), WED);
    expect(next.streak.current).toBe(0);
    expect(next.streak.wards).toBe(1);
  });

  it('breaks the run and remembers it when nothing covers it', () => {
    const next = reconcileStreak(running(FRI), TUE);
    expect(next.streak.current).toBe(0);
    expect(next.streak.broken).toMatchObject({
      length: 23,
      lastActiveDate: FRI,
      brokenOn: TUE,
    });
  });

  // The milestone bug: a run that broke at 23 used to have to pass 25 before
  // it saw another chest, and 40 before another real-world reward.
  it('starts the milestones over for the next run', () => {
    const next = reconcileStreak(running(FRI), TUE);
    expect(next.milestones.nextSmallAt).toBe(SMALL_MILESTONE_INTERVAL);
    expect(next.milestones.nextBigAt).toBe(next.milestones.bigInterval);
    expect(next.milestones.totalBigMilestonesHit).toBe(1);
  });

  it('is left alone over a weekend', () => {
    const state = running(FRI);
    expect(reconcileStreak(state, MON)).toBe(state);
  });
});

describe('mending', () => {
  const broken = () => reconcileStreak(running(FRI), TUE);

  it('quotes a price from the days missed and the length of the run', () => {
    const quote = mendQuote(broken(), TUE, NO_MODS)!;
    expect(quote.days).toEqual([MON]);
    expect(quote.cinder).toBe(
      Math.ceil(MEND_CINDER_BASE + MEND_CINDER_PER_DAY + MEND_CINDER_PER_STREAK_DAY * 23),
    );
    expect(quote.aether).toBeGreaterThanOrEqual(1);
    expect(quote.restored).toBe(23);
  });

  it('halves with the Mender’s Kit', () => {
    const kit = { ...NO_MODS, research: { ...NO_MODS.research, mendCost: 0.5 } };
    const plain = mendQuote(broken(), TUE, NO_MODS)!;
    expect(mendQuote(broken(), TUE, kit)!.cinder).toBe(Math.ceil(plain.cinder * 0.5));
  });

  it('restores the run and covers the gap', () => {
    const state = broken();
    const mended = applyMend(state, mendQuote(state, TUE, NO_MODS)!);
    expect(mended.streak.current).toBe(23);
    expect(mended.streak.broken).toBeNull();
    expect(mended.streak.mendsUsed).toBe(1);
    expect(mended.history.find((day) => day.date === MON)?.warded).toBe(true);
    // And it holds: opening the app again the same day finds nothing missed.
    expect(reconcileStreak(mended, TUE).streak.current).toBe(23);
  });

  it('picks the milestones up where the broken run left them', () => {
    const state = broken();
    const mended = applyMend(state, mendQuote(state, TUE, NO_MODS)!);
    expect(mended.milestones.nextSmallAt).toBe(25);
    expect(mended.milestones.nextBigAt).toBe(40);
  });

  it('folds in a run restarted before the mend, without charging for its days', () => {
    // Broke on Tuesday, reviewed Tuesday (a new run of 1), mended Wednesday.
    const state = broken();
    const restarted: AerieState = {
      ...state,
      history: [
        ...state.history,
        { date: TUE, morning: full, daily: null, dayOff: false },
      ],
      streak: {
        ...state.streak,
        current: 1,
        lastActiveDate: TUE,
        lastCompletedDate: TUE,
      },
    };
    const quote = mendQuote(restarted, WED, NO_MODS)!;
    expect(quote.days).toEqual([MON]);
    expect(quote.restored).toBe(24);

    const mended = applyMend(restarted, quote);
    expect(mended.streak.current).toBe(24);
    expect(mended.streak.lastActiveDate).toBe(TUE);
  });

  it('is offered only until the window closes, then forgotten', () => {
    const state = broken();
    const deadline = mendDeadline(TUE);
    expect(deadline).toBe(THU2);
    expect(mendQuote(state, deadline, NO_MODS)).not.toBeNull();
    expect(mendQuote(state, FRI2, NO_MODS)).toBeNull();
    expect(reconcileStreak(state, FRI2).streak.broken).toBeNull();
  });

  it('has nothing to offer when no run has broken', () => {
    expect(mendQuote(running(THU), FRI, NO_MODS)).toBeNull();
  });
});
