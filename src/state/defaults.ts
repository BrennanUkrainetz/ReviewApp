import { BIG_MILESTONE_INTERVAL, SMALL_MILESTONE_INTERVAL } from '@/config/tuning';
import type { AerieState } from './types';

/** Bumped whenever the persisted shape changes; see `migrations.ts`. */
export const STATE_VERSION = 1;

export function createInitialState(): AerieState {
  return {
    version: STATE_VERSION,
    streak: {
      current: 0,
      longest: 0,
      lastCompletedDate: null,
      lastActiveDate: null,
      daysOffUsed: 0,
    },
    currency: { lumen: 0 },
    history: [],
    milestones: {
      nextBigAt: BIG_MILESTONE_INTERVAL,
      nextSmallAt: SMALL_MILESTONE_INTERVAL,
      smallInterval: SMALL_MILESTONE_INTERVAL,
      bigInterval: BIG_MILESTONE_INTERVAL,
      totalBigMilestonesHit: 0,
    },
    city: {
      buildings: [],
      cosmetics: { unlocked: [], equipped: [] },
    },
    settings: {
      reduceMotion: false,
      muted: true,
    },
  };
}
