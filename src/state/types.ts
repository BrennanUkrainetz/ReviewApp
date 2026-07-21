/**
 * Shape of everything Aerie persists. This is the single source of truth for
 * the save file; anything not in here is derived at runtime (see `src/domain`).
 */

/** The two review routines. Both behave identically, only content differs. */
export type ReviewId = 'morning' | 'daily';

/**
 * How completely a review was finished.
 * - `full`  — every item done.
 * - `floor` — every *core* item done. Keeps the streak alive on a bad day.
 * - `none`  — a core item was skipped. Still pays out, but doesn't count.
 */
export type Tier = 'none' | 'floor' | 'full';

/** One completed review within a day. */
export interface ReviewRecord {
  completed: boolean;
  tier: Tier;
  pointsEarned: number;
  lumenEarned: number;
  /** Ids of checklist items marked done, so history stays auditable. */
  doneItemIds: string[];
}

/** One calendar day of activity. `null` review = not done that day. */
export interface DayRecord {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  morning: ReviewRecord | null;
  daily: ReviewRecord | null;
  dayOff: boolean;
}

export interface StreakState {
  current: number;
  longest: number;
  /** Last day a review was completed at or above the floor tier. */
  lastCompletedDate: string | null;
  /** Last day that kept continuity — a qualifying completion *or* a day off. */
  lastActiveDate: string | null;
  daysOffUsed: number;
}

export interface MilestoneState {
  /** Streak value that triggers the next real-world reward. */
  nextBigAt: number;
  /** Streak value that triggers the next in-game bonus. */
  nextSmallAt: number;
  smallInterval: number;
  bigInterval: number;
  totalBigMilestonesHit: number;
}

export interface OwnedBuilding {
  id: string;
  level: number;
}

export interface CityState {
  buildings: OwnedBuilding[];
  cosmetics: {
    unlocked: string[];
    equipped: string[];
  };
}

export interface SettingsState {
  reduceMotion: boolean;
  muted: boolean;
}

export interface AerieState {
  version: number;
  streak: StreakState;
  currency: { lumen: number };
  history: DayRecord[];
  milestones: MilestoneState;
  city: CityState;
  settings: SettingsState;
}
