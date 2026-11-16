/**
 * Every tunable number in the game lives here so balancing never means
 * hunting through UI code.
 */

/** Lumen awarded per checklist point, before the streak multiplier. */
export const LUMEN_PER_POINT = 10;

/**
 * What a full clear pays as a share of the city's daily output, pro-rated by
 * points — half a review earns half of it.
 *
 * Every other Lumen source already scales with the city: a mote takes a share
 * of output, milestone and contract bonuses take a share of the day. The flat
 * per-point rate did not, so by the time the city produced tens of thousands a
 * day the checklist — the only part of this app that is actual work — was
 * paying rounding error beside its own bonuses.
 *
 * The larger of the two figures wins. The flat rate carries the opening days,
 * while the city makes less than a few hundred a day; the share carries
 * everything after.
 *
 * It was 0.4, which on top of the vault, motes and contracts made a good day
 * worth nearly ten days of output and let the ladder — priced for about one —
 * be climbed in a month. At this number two full clears are worth a third of
 * a day before streak and heat, and a little under a whole day with both at
 * their peak: still the largest thing you can do *today* to move the city,
 * without being the thing that breaks its pacing.
 */
export const REVIEW_SHARE_OF_OUTPUT = 0.15;

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
export const SMALL_MILESTONE_BONUS_SHARE = 0.4;
export const BIG_MILESTONE_BONUS_FLOOR = 500;
export const BIG_MILESTONE_BONUS_SHARE = 1.5;

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
 * A reviewed day accrues exactly one day's output (see
 * `NOMINAL_SECONDS_PER_DAY` in `domain/vault.ts`): about 0.6 of it between the
 * morning and afternoon windows, and 0.4 overnight. Missing one window
 * therefore just fills the vault to the brim — it costs nothing — but let a
 * whole day go by and the rest spills. That asymmetry is the mechanic.
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
 * A hard ceiling on levels — the last charter's ceiling. It exists so bulk-buy
 * maths always terminates, and so a building can't silently hit float limits.
 *
 * It was 200, which a long enough run of ascensions simply finished: every
 * tier at the cap, and nothing left to buy but the next ascension. The
 * charters past 8 are what reach above 200, and they ask for more kinds of
 * building than the home cluster has — so the upper half of the range is
 * climbed on the high islands, one altitude band at a time.
 */
export const BUILDING_MAX_LEVEL = 400;

/**
 * A building's output doubles every this many levels, all the way to the
 * ceiling — level 10, 20, 30, and so on.
 *
 * This interval is the single number that decides whether levelling a building
 * stays worth doing. Cost grows `BUILDING_COST_GROWTH ^ level`, so income has
 * to grow geometrically too or every tier dies at the same level and the only
 * real progress is unlocking the next one.
 *
 * The break-even interval is `ln 2 / ln 1.11 ≈ 6.6` — at that spacing a level
 * pays back in the same 2.5 days at level 200 as at level 1, and *what* you buy
 * stops mattering. At 10 the payback roughly doubles every 21 levels: a level-66
 * building is a 38-day buy rather than a 306-day one, so old tiers stay live for
 * a long while, but a freshly unlocked tier at 2.5 days is still a real event.
 *
 * The doublings used to sit at 10/25/50/100/150/200 — six of them across the
 * whole range, against a cost curve that grew a billionfold. That made every
 * building below the frontier a trap, which is exactly what it felt like.
 */
export const BUILDING_MILESTONE_INTERVAL = 10;

/** Output multiplier granted by each milestone level passed. */
export const BUILDING_MILESTONE_MULTIPLIER = 2;

/**
 * A building advances its **specialty** every this many levels — a much coarser
 * cadence than the output doublings, and deliberately so.
 *
 * Doublings answer "is this level worth buying". Specialties answer "why this
 * building rather than that one": each tier improves one thing no other tier
 * touches (see `specialty` in `config/shop.ts`), so the Greenhouse is worth
 * levelling for its Cinder even in the stretch where the Lighthouse pays more
 * Lumen. Five steps, at 40 / 80 / 120 / 160 / 200.
 */
export const SPECIALTY_INTERVAL = 40;

/**
 * Specialties stop at their fifth step even though levels go on to 400. They
 * are the reason to prefer one tier to another, not a second growth curve —
 * and several of them (Aether, prices, the streak cap) would be far too strong
 * doubled.
 */
export const SPECIALTY_MAX_STEPS = 5;

/** Every *distinct* building standing adds this to the city's whole output. */
export const DISTRICT_BONUS_PER_BUILDING = 0.02;

/**
 * A building stays hidden in the shop until lifetime earnings reach this share
 * of its base cost — so there is always exactly one tempting locked tier on
 * screen, and never a wall of unreachable ones.
 */
export const BUILDING_REVEAL_FRACTION = 0.4;

/* ------------------------------------------------------------------ */
/* The charter — what the Hearth Hall is for                           */
/* ------------------------------------------------------------------ */

/**
 * The Hearth Hall has stood at the centre of the city since the first day and
 * has never done anything. It is now the **charter**: the ceiling on how high
 * any building may be raised, and the one thing that cannot be bought with
 * Lumen alone.
 *
 * Doublings every ten levels make levelling worthwhile again, but on their own
 * they also make it optimal to pour everything into whichever building is
 * cheapest and ignore the rest. The charter is what stops that. Raising it does
 * not ask for money so much as for *breadth* — one more kind of building, at
 * the height the last charter allowed — and only then does the ceiling lift.
 *
 * So the loop is: level everything up to the ceiling, widen the city, raise the
 * charter, repeat. Nothing is ever revoked; a save that already stands above
 * its ceiling keeps every level it has (see `migrate`), it simply cannot add
 * more until the charter catches up.
 */

/** Charter 1 is free — the Hearth Hall is there from the first day. */
export const CHARTER_MIN_LEVEL = 1;

/**
 * The last charter. Its ceiling is `BUILDING_MAX_LEVEL` exactly.
 *
 * Charter `L` asks for `L + 1` kinds, and the home cluster has twelve — so
 * charters 12 and up can only be met with buildings on the high islands:
 * 12–13 once the city has reached Cirrus, 14–15 at the Stratosphere, and the
 * last at the Aurora.
 */
export const CHARTER_MAX_LEVEL = 16;

/** Each charter raises every building's ceiling by this many levels. */
export const CHARTER_LEVELS_PER_STEP = 25;

/**
 * Charter `L` needs `L + 1` distinct buildings standing at level
 * `CHARTER_LEVELS_PER_STEP * (L - 1)` or higher — one more kind than the last
 * charter asked for, at the height the last charter allowed.
 */
export const CHARTER_KINDS_OVER_LEVEL = 1;

/**
 * Price of a charter, as levels of the newest building its requirement names,
 * at the height it names — see `charterCost` in `domain/charter.ts`.
 *
 * Fixed per charter. It used to be three days of the city's *current* output,
 * which is a price that runs away from you: every Lumen you earned toward it
 * raised it, and meeting the requirement (by building) raised it again.
 */
export const CHARTER_COST_LEVELS = 5;

/** Floor under that, so the first charter is never trivially cheap. */
export const CHARTER_MIN_COST = 250;

/** Every charter past the first adds this to the whole city's output. */
export const CHARTER_OUTPUT_PER_LEVEL = 0.15;

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
 *
 * Tops out at ×2 rather than the ×3 it used to: heat multiplies the review,
 * the contract and the milestone chests all at once, and at ×3 a hot week was
 * worth more than the city itself.
 */
export const HEAT_PER_DAY = 0.05;
export const HEAT_CAP_DAYS = 20;

/* ------------------------------------------------------------------ */
/* Daily contract                                                      */
/* ------------------------------------------------------------------ */

/**
 * Contract bonuses are paid as a share of the city's daily output, at the
 * day's heat — see `bonusShare` on each contract. The share used to be struck
 * against review *plus* output, which let a Perfect Day on full heat pay out
 * eight days of city in one chest.
 */
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

/**
 * Each mote pays this share of the city's daily output, with a flat floor.
 * Six a day at a full chain come to about a third of a day — a treat, not a
 * second vault. (At 0.15 they were worth more than the vault was.)
 */
export const MOTE_SHARE_OF_OUTPUT = 0.05;
export const MOTE_FLOOR_LUMEN = 25;

/**
 * Motes flee the cursor, so catching one is a small chase. Catch the next
 * before this window closes and the chain holds, paying a step more each link.
 *
 * The chain is the only skill in the app, so it is upside only: a slow catch
 * still pays full base value. A perfect run of three is worth a little over
 * half again as much as three lazy ones — enough to be worth chasing, never
 * enough to make a missed chain feel like a loss.
 */
export const MOTE_CHAIN_WINDOW_MS = 2600;
export const MOTE_CHAIN_STEP = 0.75;
export const MOTE_CHAIN_MAX = 3;

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

/* ------------------------------------------------------------------ */
/* Streak wards and mending                                            */
/* ------------------------------------------------------------------ */

/**
 * A ward is insurance bought ahead of time: held wards are spent
 * automatically, one per missed weekday, the next time the app notices a gap.
 * It is for the day you forget to open the app at all — a day you *know* you
 * will miss is what the free "Take a day off" button is for.
 *
 * Priced in Cinder because Cinder is what a well-run routine earns: the
 * insurance is paid for by the good days. One can be held to start; perks and
 * research raise that.
 */
export const WARD_CINDER_COST = 25;
export const WARD_BASE_SLOTS = 1;

/**
 * A mend is the same cover bought after the fact. A broken run can be mended
 * on the day the break is noticed and for this many weekdays after it —
 * long enough to notice, short enough that it is a repair and not a pardon.
 */
export const MEND_WINDOW_WEEKDAYS = 3;

/**
 * Cinder price of a mend: a base, plus a price per weekday it has to cover,
 * plus a little per day of the run being saved — a long run is worth more, so
 * it costs more. A 20-day run broken by one missed day comes to 32.
 */
export const MEND_CINDER_BASE = 10;
export const MEND_CINDER_PER_DAY = 12;
export const MEND_CINDER_PER_STREAK_DAY = 0.5;

/**
 * A mend can be paid in Aether instead, at this many Cinder to one Aether —
 * dear on purpose, since Aether is the scarcer currency, but there when the
 * Cinder is not.
 */
export const MEND_CINDER_PER_AETHER = 8;

/* ------------------------------------------------------------------ */
/* Weekly expeditions                                                  */
/* ------------------------------------------------------------------ */

/** Floor under a weekly expedition's Lumen bonus, for the first weeks. */
export const WEEKLY_BONUS_FLOOR = 250;

/* ------------------------------------------------------------------ */
/* The kiln                                                            */
/* ------------------------------------------------------------------ */

/**
 * Cinder the Workshop kiln burns down into one Aether.
 *
 * Research is a finite list, and a routine that keeps running keeps earning
 * Cinder after it is all bought. The kiln is where that goes, so a good day is
 * never worth nothing. The rate is steep on purpose — a hot week of full clears
 * comes to an Aether or two — so it rounds out an ascension rather than
 * replacing one.
 */
export const KILN_CINDER_PER_AETHER = 100;
