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

/** Flat Lumen bonus paid by a small milestone chest. */
export const SMALL_MILESTONE_BONUS_LUMEN = 150;

/** Flat Lumen bonus paid by a big (20-streak) milestone chest. */
export const BIG_MILESTONE_BONUS_LUMEN = 500;

/** Chance (0–1) that an ordinary chest also drops a cosmetic. */
export const COSMETIC_DROP_CHANCE = 0.18;

/** Milestone chests always drop a cosmetic if any are left to find. */
export const MILESTONE_COSMETIC_DROP_CHANCE = 1;

/** Passive Lumen from buildings is only paid on days a review was completed. */
export const PASSIVE_INCOME_REQUIRES_REVIEW = true;

/** Days of history kept on the progress screen before older entries collapse. */
export const HISTORY_PAGE_SIZE = 30;
