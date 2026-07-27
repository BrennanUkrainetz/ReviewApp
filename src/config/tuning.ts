/**
 * Every tunable number in the game lives here so balancing never means
 * hunting through UI code.
 */

/** Lumen awarded per checklist point, before the streak multiplier. */
export const LUMEN_PER_POINT = 10;

/** Bonus points added on top when a review is cleared completely. */
export const FULL_CLEAR_BONUS_POINTS = 2;

/** Streak length at which the multiplier stops growing. */
export const MULTIPLIER_CAP_STREAK = 20;

/** Multiplier gained per day of streak, up to `MULTIPLIER_CAP_STREAK`. */
export const MULTIPLIER_PER_DAY = 0.02;

/** Streak length that earns the real-world reward. Repeats forever. */
export const BIG_MILESTONE_INTERVAL = 20;

/** Streak length between the smaller in-game bonus rewards. */
export const SMALL_MILESTONE_INTERVAL = 5;

/**
 * Milestone bonuses are paid as a share of the day's own payout, so a chest at
 * streak 100 still feels like a windfall instead of rounding to nothing. The
 * flat values are floors, for the first week when the day's payout is tiny.
 */
export const SMALL_MILESTONE_BONUS_FLOOR = 150;
export const SMALL_MILESTONE_BONUS_SHARE = 0.5;
export const BIG_MILESTONE_BONUS_FLOOR = 500;
export const BIG_MILESTONE_BONUS_SHARE = 2;

/** Chance (0–1) that an ordinary chest also drops a cosmetic. */
export const COSMETIC_DROP_CHANCE = 0.18;

/** Milestone chests always drop a cosmetic if any are left to find. */
export const MILESTONE_COSMETIC_DROP_CHANCE = 1;

/* ------------------------------------------------------------------ */
/* The vault — where the city's output actually goes                   */
/* ------------------------------------------------------------------ */

/**
 * The city no longer pays its output in a lump at review time. It fills a
 * vault, continuously, around the clock — and that vault can only be emptied
 * inside a collection window.
 *
 * The whole point of the windows is that Aerie must not be a thing you check
 * during the day. It fills *fastest* while you're at work precisely so that
 * you have no reason to look at it: the reward for ignoring it is that it's
 * full when you clock off.
 */

/** Local minutes-of-day over which output accrues at `VAULT_WORK_MULTIPLIER`. */
export const WORK_START_MINUTES = 8 * 60;
export const WORK_END_MINUTES = 16 * 60 + 30;

/** How much faster the vault fills during work hours. */
export const VAULT_WORK_MULTIPLIER = 3;

/**
 * Share of the normal rate the vault fills at on a day with no review logged.
 * Not zero — a missed day shouldn't wipe the city out — but low enough that the
 * idle game never becomes a substitute for the routine.
 */
export const VAULT_IDLE_SHARE = 0.1;

/**
 * Vault ceiling, as a multiple of the city's nominal daily output.
 *
 * A full day of real accrual comes to ~1.7× nominal (8.5h at 3× plus 15.5h at
 * 1×). Between the two windows you bank ~0.9× in the day and ~0.7× overnight,
 * so ordinary twice-daily play never touches the cap — but sleep through a
 * whole day and roughly a third of it spills. That asymmetry is the mechanic:
 * missing a single window costs nothing, missing a day costs.
 */
export const VAULT_CAP_DAYS = 1;

/** Hard limit on how far back accrual will walk, in case of a bad clock. */
export const VAULT_MAX_ACCRUAL_DAYS = 30;

export interface CollectionWindow {
  id: string;
  label: string;
  /** Local minutes-of-day. */
  startMinutes: number;
  endMinutes: number;
}

/**
 * When the vault can be emptied. Bracketing the work day on both sides: one
 * before it starts, one as it ends.
 */
export const COLLECTION_WINDOWS: CollectionWindow[] = [
  { id: 'morning', label: 'Morning', startMinutes: 8 * 60, endMinutes: 9 * 60 },
  { id: 'afternoon', label: 'Afternoon', startMinutes: 16 * 60, endMinutes: 17 * 60 },
];

/** Days of history kept on the progress screen before older entries collapse. */
export const HISTORY_PAGE_SIZE = 30;

/* ------------------------------------------------------------------ */
/* The city economy — see the ladder note in `config/shop.ts`.         */
/* ------------------------------------------------------------------ */

/** Each level of a building costs this much more than the one before it. */
export const BUILDING_COST_GROWTH = 1.11;

/**
 * A hard ceiling on levels. Not meant to be reached — it exists so bulk-buy
 * maths always terminates, and so a building can't silently hit float limits.
 */
export const BUILDING_MAX_LEVEL = 200;

/**
 * Levels at which a building's output doubles. These are what stop a tier
 * going stale: the level right after a milestone is always the best buy on the
 * board, which is the whole "one more level" pull.
 */
export const BUILDING_MILESTONE_LEVELS = [10, 25, 50, 100, 150, 200];

/** Output multiplier granted by each milestone level passed. */
export const BUILDING_MILESTONE_MULTIPLIER = 2;

/** Every *distinct* building standing adds this to the city's whole output. */
export const DISTRICT_BONUS_PER_BUILDING = 0.02;

/**
 * A building stays hidden in the shop until lifetime earnings reach this share
 * of its base cost — so there is always exactly one tempting locked tier on
 * screen, and never a wall of unreachable ones.
 */
export const BUILDING_REVEAL_FRACTION = 0.4;

/* ------------------------------------------------------------------ */
/* Heat — the full-clear combo                                         */
/* ------------------------------------------------------------------ */

/**
 * Consecutive full-clear days multiply the day's payout. This is the one
 * mechanic that rewards *quality* rather than presence: the floor keeps the
 * streak, but only a full clear builds heat.
 *
 * Heat decays to nothing the moment a day passes without one, which is
 * deliberate — a combo you cannot lose is just a number that goes up.
 */
export const HEAT_PER_DAY = 0.1;
export const HEAT_CAP_DAYS = 20;

/* ------------------------------------------------------------------ */
/* Daily contract                                                      */
/* ------------------------------------------------------------------ */

/** Contract bonuses are paid as a share of the day's payout, like milestones. */
export const CONTRACT_BONUS_FLOOR = 100;

/* ------------------------------------------------------------------ */
/* Motes                                                               */
/* ------------------------------------------------------------------ */

/**
 * Motes only appear after a review is completed, and only that many times.
 * The app stays pulled rather than pushed: there is nothing to come back and
 * farm, just a short bright window on the far side of doing the work.
 */
export const MOTE_CHARGES_PER_REVIEW = 3;

/** Each mote pays this share of the city's daily output, with a flat floor. */
export const MOTE_SHARE_OF_OUTPUT = 0.15;
export const MOTE_FLOOR_LUMEN = 25;

/* ------------------------------------------------------------------ */
/* Achievements                                                        */
/* ------------------------------------------------------------------ */

/** Each earned achievement adds this to every Lumen source, forever. */
export const ACHIEVEMENT_BONUS = 0.01;

/* ------------------------------------------------------------------ */
/* Cinder — the quality currency                                       */
/* ------------------------------------------------------------------ */

/**
 * Cinder is earned only by full-cleared reviews and the heat riding on them,
 * and spent in the Workshop (`config/research.ts`). Unlike Lumen it measures
 * how *well* the routine was run rather than how big the city got, and unlike
 * Aether it is a per-review trickle rather than a per-ascension windfall.
 *
 * The numbers are deliberately small and flat — a full clear is worth a couple
 * of Cinder whether it is day three or day three hundred — because the research
 * it buys is priced in tens and hundreds. A month of good days should clear a
 * branch; a bad week should cost visibly.
 */
export const CINDER_PER_FULL_CLEAR = 2;

/** Extra Cinder when both reviews are full-cleared in a day, on the second. */
export const CINDER_PERFECT_DAY_BONUS = 1;

/**
 * Heat pays a flat Cinder bonus per full clear once it is running, stepped so a
 * long combo is worth chasing. Read as "at `days` of heat or more, add `bonus`"
 * — the highest matching step wins. Kept as steps rather than a rate so the
 * copy on the review screen can name a round number.
 */
export const CINDER_HEAT_BONUSES: { days: number; bonus: number }[] = [
  { days: 5, bonus: 1 },
  { days: 10, bonus: 2 },
  { days: 20, bonus: 4 },
];
