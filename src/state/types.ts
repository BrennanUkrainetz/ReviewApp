/**
 * Shape of everything Aerie persists. This is the single source of truth for
 * the save file; anything not in here is derived at runtime (see `src/domain`).
 */

/** The two review routines. Both behave identically, only content differs. */
export type ReviewId = 'morning' | 'daily';

/**
 * One line of a review. Persisted, because the checklists are editable from
 * Settings; `src/config/checklists.ts` only seeds the starting set.
 *
 * `core: true` marks an item as part of the Floor: doing all core items is
 * enough to keep the streak alive on a bad day.
 */
export interface ChecklistItem {
  id: string;
  label: string;
  /** Optional one-line nudge shown under the label during the flow. */
  hint?: string;
  points: number;
  core: boolean;
  /**
   * Marks a step that doesn't apply every day — taking lunch to the fridge is
   * nothing to do on a day worked from home. Skipping one *sets it aside*
   * rather than missing it: it leaves the day's ceiling along with its score,
   * so the review can still be a full clear without it. Never core; the Floor
   * is exactly the set of things that always apply.
   */
  optional?: boolean;
}

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

export interface CurrencyState {
  lumen: number;
  /** Earned since the last ascension. Drives which shop tiers are revealed. */
  runLumen: number;
  /**
   * Cinder on hand. Earned only from full clears (see `domain/research.ts`),
   * spent only in the Workshop, and — like Aether — never touched by an
   * ascension. There is no lifetime Cinder counter because nothing keys off a
   * total the way the Aether grant keys off lifetime Lumen.
   */
  cinder: number;
  /**
   * Every Lumen ever earned, across every run — never reset, never spent down.
   * The Ascension payout is calculated from this, which is what stops a run
   * split in two from paying more than the same run played out.
   */
  lifetimeLumen: number;
}

export interface AscensionState {
  /** How many times the city has ascended. Also its altitude band. */
  count: number;
  /** Aether on hand, unspent. */
  aether: number;
  /** Aether ever granted, so the next grant is a difference, not a repeat. */
  aetherEarned: number;
  /** Ids of purchased perks. Permanent — these are what survive a reset. */
  perks: string[];
}

export interface OwnedBuilding {
  id: string;
  level: number;
}

export interface CityState {
  buildings: OwnedBuilding[];
  /**
   * The Hearth Hall's charter level — the ceiling on every building's level,
   * and the only thing Lumen alone cannot buy. See `domain/charter.ts`.
   *
   * Always at least 1: the Hearth Hall stands from the first day.
   */
  charter: number;
  cosmetics: {
    unlocked: string[];
    equipped: string[];
  };
}

/**
 * Motes: the short bright window that opens on the far side of a completed
 * review. Charges are granted per review and expire with the day, so there is
 * never anything to come back and farm.
 */
export interface MoteState {
  /** The day these charges belong to. Anything older is spent. */
  date: string | null;
  remaining: number;
  /** Motes caught today, for the city screen's line of copy. */
  caught: number;
}

/**
 * The vault: city output accrues here continuously and is only collectable
 * inside a window. See `domain/vault.ts` for the accrual and window rules.
 */
export interface VaultState {
  /** Epoch ms through which output has already been folded in. */
  accruedThrough: number;
  /** Lumen waiting to be collected. Capped — see `vaultCapacity`. */
  lumen: number;
  /**
   * Sub-Lumen production carried between accruals, always in [0, 1).
   *
   * `lumen` is a whole number, so every accrual has a remainder. Dropping it
   * would make the vault fill at a rate that depended on how often the app
   * happened to be open — a fraction lost per tick is nothing once a day and
   * ruinous every ten seconds. Kept here instead, so cadence cannot matter.
   */
  carry: number;
  /**
   * Epoch ms of the last collection. A window is spent once a collection lands
   * inside it, which is why one timestamp is enough to track every window.
   */
  lastCollectedAt: number | null;
  /** Everything ever taken out of the vault, for the progress screen. */
  lifetimeCollected: number;
}

export interface SettingsState {
  reduceMotion: boolean;
  muted: boolean;
}

export interface AerieState {
  version: number;
  /** The editable items of each routine, in the order they're worked through. */
  checklists: Record<ReviewId, ChecklistItem[]>;
  streak: StreakState;
  currency: CurrencyState;
  history: DayRecord[];
  milestones: MilestoneState;
  ascension: AscensionState;
  /** Ids of earned achievements. Only ever appended to. */
  achievements: string[];
  /** Ids of purchased research. Permanent — survives an ascension, like perks. */
  research: string[];
  motes: MoteState;
  vault: VaultState;
  city: CityState;
  settings: SettingsState;
}
