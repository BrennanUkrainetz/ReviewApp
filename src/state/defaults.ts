import { defaultChecklists } from '@/config/checklists';
import {
  BIG_MILESTONE_INTERVAL,
  CHARTER_MIN_LEVEL,
  SMALL_MILESTONE_INTERVAL,
} from '@/config/tuning';
import type { AerieState } from './types';

/** Bumped whenever the persisted shape changes; see `migrations.ts`. */
export const STATE_VERSION = 10;

export function createInitialState(now: Date = new Date()): AerieState {
  return {
    version: STATE_VERSION,
    checklists: defaultChecklists(),
    streak: {
      current: 0,
      longest: 0,
      lastCompletedDate: null,
      lastActiveDate: null,
      daysOffUsed: 0,
      wards: 0,
      wardsUsed: 0,
      mendsUsed: 0,
      broken: null,
    },
    currency: { lumen: 0, runLumen: 0, lifetimeLumen: 0, cinder: 0 },
    history: [],
    milestones: {
      nextBigAt: BIG_MILESTONE_INTERVAL,
      nextSmallAt: SMALL_MILESTONE_INTERVAL,
      smallInterval: SMALL_MILESTONE_INTERVAL,
      bigInterval: BIG_MILESTONE_INTERVAL,
      totalBigMilestonesHit: 0,
    },
    ascension: { count: 0, aether: 0, aetherEarned: 0, perkRanks: {} },
    achievements: [],
    research: [],
    motes: { date: null, remaining: 0, caught: 0 },
    // Accrual starts now, not at the epoch — a fresh save must not open with
    // thirty days of backdated output already in the vault.
    vault: {
      accruedThrough: now.getTime(),
      lumen: 0,
      carry: 0,
      lastCollectedAt: null,
      lifetimeCollected: 0,
    },
    city: {
      buildings: [],
      charter: CHARTER_MIN_LEVEL,
      cosmetics: { unlocked: [], equipped: [] },
    },
    settings: {
      reduceMotion: false,
      muted: true,
    },
  };
}
