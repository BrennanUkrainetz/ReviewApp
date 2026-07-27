/**
 * Achievements.
 *
 * Each one earned adds a flat `ACHIEVEMENT_BONUS` to every Lumen source,
 * forever — so a collection that would otherwise be a list of badges turns
 * into a slow, broad multiplier that keeps paying across ascensions. (Cookie
 * Clicker calls the same idea milk; the effect is what matters, not the name.)
 *
 * Every condition is a pure function of the save, so achievements are checked
 * rather than tracked, and a save edited by hand still ends up with the right
 * set. They are stored once earned, because a condition that stops being true
 * — a building sold, a streak broken — must not take the badge back.
 *
 * Thresholds that mean "all of them" are read from the catalogue they refer to
 * rather than written out as a number, so adding a building or a perk doesn't
 * silently make a completionist badge earnable early.
 */
import { defaultItems, REVIEW_IDS } from '@/config/checklists';
import { perksInBranch, PERK_BRANCHES, PERKS, type PerkBranch } from '@/config/perks';
import { BUILDINGS, COSMETICS, getCosmetic } from '@/config/shop';
import {
  BUILDING_MAX_LEVEL,
  HEAT_CAP_DAYS,
  MOTE_CHARGES_PER_REVIEW,
} from '@/config/tuning';
import { addDays, daysBetween, fromDateKey } from '@/domain/dates';
import type { AerieState, DayRecord, ReviewRecord } from '@/state/types';

export type AchievementGroup = 'routine' | 'city' | 'fortune' | 'wealth' | 'ascension';

export interface AchievementDef {
  id: string;
  name: string;
  /** What earned it, in the past tense. Shown once unlocked. */
  detail: string;
  group: AchievementGroup;
  /** True once the save qualifies. Never un-earns — see the note above. */
  earnedBy(state: AerieState): boolean;
}

export const ACHIEVEMENT_GROUPS: { id: AchievementGroup; name: string }[] = [
  { id: 'routine', name: 'The Routine' },
  { id: 'city', name: 'The City' },
  { id: 'fortune', name: 'Fortune' },
  { id: 'wealth', name: 'Wealth' },
  { id: 'ascension', name: 'Altitude' },
];

/* ------------------------------------------------------------------ */
/* Reading a save                                                      */
/* ------------------------------------------------------------------ */

/** The reviews actually completed on a day, in routine order. */
const done = (day: DayRecord): ReviewRecord[] =>
  [day.morning, day.daily].filter((record): record is ReviewRecord =>
    Boolean(record?.completed),
  );

const fullClearsOn = (day: DayRecord): number =>
  done(day).filter((record) => record.tier === 'full').length;

/** Total reviews logged, both routines, every day of history. */
const reviewsLogged = (state: AerieState): number =>
  state.history.reduce((count, day) => count + done(day).length, 0);

/** Days on which at least one review was logged. */
const daysLogged = (state: AerieState): number =>
  state.history.filter((day) => done(day).length > 0).length;

const fullClearsLogged = (state: AerieState): number =>
  state.history.reduce((count, day) => count + fullClearsOn(day), 0);

/**
 * The longest run of consecutive calendar days matching `qualifies`, anywhere
 * in history.
 *
 * Deliberately *historical* rather than current: an achievement asks what you
 * once did, so a twenty-day heat run stays earned after it cools. Days off are
 * neutral, exactly as they are for the live heat streak — they hold the run
 * open without extending it.
 */
function longestRun(
  history: DayRecord[],
  qualifies: (day: DayRecord) => boolean,
): number {
  const days = [...history].sort((a, b) => a.date.localeCompare(b.date));
  let best = 0;
  let run = 0;
  let previous: string | null = null;

  for (const day of days) {
    const contiguous = previous !== null && daysBetween(previous, day.date) === 1;
    if (!contiguous) run = 0;
    if (qualifies(day)) {
      run += 1;
      best = Math.max(best, run);
    } else if (!day.dayOff) {
      run = 0;
    }
    previous = day.date;
  }

  return best;
}

/** Distinct weekdays (0–6) on which anything has ever been logged. */
const weekdaysCovered = (state: AerieState): number =>
  new Set(
    state.history
      .filter((day) => done(day).length > 0)
      .map((day) => fromDateKey(day.date).getDay()),
  ).size;

/**
 * True once a run has been broken and picked back up: two logged days with a
 * genuinely empty day between them — no review, no day off.
 */
function hasComeback(history: DayRecord[]): boolean {
  const active = new Set(
    history.filter((day) => day.dayOff || done(day).length > 0).map((day) => day.date),
  );
  const logged = history
    .filter((day) => done(day).length > 0)
    .map((day) => day.date)
    .sort();

  for (let i = 1; i < logged.length; i += 1) {
    const previous = logged[i - 1]!;
    const current = logged[i]!;
    if (daysBetween(previous, current) > 30) return true; // long gap; don't walk it
    for (let cursor = addDays(previous, 1); cursor < current; cursor = addDays(cursor, 1)) {
      if (!active.has(cursor)) return true;
    }
  }
  return false;
}

const levelOf = (state: AerieState, id: string): number =>
  state.city.buildings.find((entry) => entry.id === id)?.level ?? 0;

/** Total levels standing across the whole city. */
const totalLevels = (state: AerieState): number =>
  state.city.buildings.reduce((sum, entry) => sum + entry.level, 0);

const standing = (state: AerieState): number =>
  state.city.buildings.filter((entry) => entry.level > 0).length;

/** Cosmetic slots with something equipped in them. */
const slotsDressed = (state: AerieState): number =>
  new Set(
    state.city.cosmetics.equipped
      .map((id) => getCosmetic(id)?.slot)
      .filter((slot): slot is NonNullable<typeof slot> => Boolean(slot)),
  ).size;

const COSMETIC_SLOT_COUNT = new Set(COSMETICS.map((entry) => entry.slot)).size;

/** True once either routine has been edited away from what Aerie ships with. */
function hasEditedChecklist(state: AerieState): boolean {
  return REVIEW_IDS.some((id) => {
    const seed = new Set(defaultItems(id).map((item) => item.id));
    const items = state.checklists[id] ?? [];
    return items.length !== seed.size || items.some((item) => !seed.has(item.id));
  });
}

/* ------------------------------------------------------------------ */
/* Threshold shorthands                                                */
/* ------------------------------------------------------------------ */

const streakAt = (days: number) => (state: AerieState) => state.streak.longest >= days;
const lifetimeAt = (lumen: number) => (state: AerieState) =>
  state.currency.lifetimeLumen >= lumen;
const bankedAt = (lumen: number) => (state: AerieState) => state.currency.lumen >= lumen;
const levelsAt = (levels: number) => (state: AerieState) => totalLevels(state) >= levels;
const ascensionsAt = (count: number) => (state: AerieState) =>
  state.ascension.count >= count;
const reviewsAt = (count: number) => (state: AerieState) => reviewsLogged(state) >= count;
const daysAt = (count: number) => (state: AerieState) => daysLogged(state) >= count;
const heatRunAt = (days: number) => (state: AerieState) =>
  longestRun(state.history, (day) => fullClearsOn(day) >= 1) >= days;
const everyBuildingAt = (level: number) => (state: AerieState) =>
  BUILDINGS.every((def) => levelOf(state, def.id) >= level);
const aetherEarnedAt = (amount: number) => (state: AerieState) =>
  state.ascension.aetherEarned >= amount;

/** Every perk in a branch learned. */
const branchComplete = (branch: PerkBranch) => (state: AerieState) => {
  const held = new Set(state.ascension.perks);
  return perksInBranch(branch).every((perk) => held.has(perk.id));
};

export const ACHIEVEMENTS: AchievementDef[] = [
  /* The routine — the part that is actually the point. */
  {
    id: 'first-light',
    name: 'First Light',
    detail: 'Logged a review.',
    group: 'routine',
    earnedBy: (state) => state.history.some((day) => day.morning ?? day.daily),
  },
  {
    id: 'streak-3',
    name: 'Getting Going',
    detail: 'Held a three-day streak.',
    group: 'routine',
    earnedBy: streakAt(3),
  },
  {
    id: 'streak-7',
    name: 'A Full Week',
    detail: 'Held a seven-day streak.',
    group: 'routine',
    earnedBy: streakAt(7),
  },
  {
    id: 'streak-20',
    name: 'Golden Hour',
    detail: 'Held a twenty-day streak — the city in full light.',
    group: 'routine',
    earnedBy: streakAt(20),
  },
  {
    id: 'streak-50',
    name: 'Fixture',
    detail: 'Held a fifty-day streak.',
    group: 'routine',
    earnedBy: streakAt(50),
  },
  {
    id: 'streak-100',
    name: 'A Hundred Mornings',
    detail: 'Held a hundred-day streak.',
    group: 'routine',
    earnedBy: streakAt(100),
  },
  {
    id: 'streak-200',
    name: 'Two Hundred Up',
    detail: 'Held a two-hundred-day streak.',
    group: 'routine',
    earnedBy: streakAt(200),
  },
  {
    id: 'streak-365',
    name: 'All the Way Round',
    detail: 'Held the streak for a full year.',
    group: 'routine',
    earnedBy: streakAt(365),
  },
  {
    id: 'both-in-a-day',
    name: 'Round Trip',
    detail: 'Logged both reviews in one day.',
    group: 'routine',
    earnedBy: (state) =>
      state.history.some((day) => day.morning?.completed && day.daily?.completed),
  },
  {
    id: 'perfect-day',
    name: 'Perfect Day',
    detail: 'Full-cleared both reviews in one day.',
    group: 'routine',
    earnedBy: (state) =>
      state.history.some(
        (day) => day.morning?.tier === 'full' && day.daily?.tier === 'full',
      ),
  },
  {
    id: 'perfect-week',
    name: 'A Perfect Week',
    detail: 'Full-cleared both reviews, seven days running.',
    group: 'routine',
    earnedBy: (state) => longestRun(state.history, (day) => fullClearsOn(day) === 2) >= 7,
  },
  {
    id: 'took-a-day-off',
    name: 'Deliberately',
    detail: 'Took a day off on purpose, rather than by accident.',
    group: 'routine',
    earnedBy: (state) => state.streak.daysOffUsed >= 1,
  },
  {
    id: 'days-off-5',
    name: 'Rested',
    detail: 'Took five deliberate days off. The floor is there to be used.',
    group: 'routine',
    earnedBy: (state) => state.streak.daysOffUsed >= 5,
  },
  {
    id: 'comeback',
    name: 'Back at It',
    detail: 'Missed a day, and came back the next one anyway.',
    group: 'routine',
    earnedBy: (state) => hasComeback(state.history),
  },
  {
    id: 'every-weekday',
    name: 'Every Day of the Week',
    detail: 'Logged a review on all seven weekdays.',
    group: 'routine',
    earnedBy: (state) => weekdaysCovered(state) >= 7,
  },
  {
    id: 'reviews-10',
    name: 'Ten in the Book',
    detail: 'Logged ten reviews.',
    group: 'routine',
    earnedBy: reviewsAt(10),
  },
  {
    id: 'reviews-50',
    name: 'Habit-Shaped',
    detail: 'Logged fifty reviews.',
    group: 'routine',
    earnedBy: reviewsAt(50),
  },
  {
    id: 'reviews-250',
    name: 'The Long Ledger',
    detail: 'Logged two hundred and fifty reviews.',
    group: 'routine',
    earnedBy: reviewsAt(250),
  },
  {
    id: 'reviews-1000',
    name: 'A Thousand Times',
    detail: 'Logged a thousand reviews.',
    group: 'routine',
    earnedBy: reviewsAt(1000),
  },
  {
    id: 'days-30',
    name: 'A Month of Mornings',
    detail: 'Logged something on thirty separate days.',
    group: 'routine',
    earnedBy: daysAt(30),
  },
  {
    id: 'days-100',
    name: 'A Hundred Days',
    detail: 'Logged something on a hundred separate days.',
    group: 'routine',
    earnedBy: daysAt(100),
  },
  {
    id: 'days-365',
    name: 'A Year of It',
    detail: 'Logged something on three hundred and sixty-five separate days.',
    group: 'routine',
    earnedBy: daysAt(365),
  },
  {
    id: 'full-clears-100',
    name: 'Clean Hundred',
    detail: 'Full-cleared a hundred reviews.',
    group: 'routine',
    earnedBy: (state) => fullClearsLogged(state) >= 100,
  },
  {
    id: 'heat-5',
    name: 'Warming Up',
    detail: 'Kept heat for five days running.',
    group: 'routine',
    earnedBy: heatRunAt(5),
  },
  {
    id: 'heat-10',
    name: 'Running Hot',
    detail: 'Kept heat for ten days running.',
    group: 'routine',
    earnedBy: heatRunAt(10),
  },
  {
    id: 'heat-cap',
    name: 'White Hot',
    detail: 'Ran heat all the way to its cap.',
    group: 'routine',
    earnedBy: heatRunAt(HEAT_CAP_DAYS),
  },
  {
    id: 'edited-checklist',
    name: 'Made It Yours',
    detail: 'Rewrote a routine into something that actually fits.',
    group: 'routine',
    earnedBy: hasEditedChecklist,
  },
  {
    id: 'long-routine',
    name: 'Ambitious',
    detail: 'Ran a routine with ten items in it.',
    group: 'routine',
    earnedBy: (state) => REVIEW_IDS.some((id) => (state.checklists[id]?.length ?? 0) >= 10),
  },
  {
    id: 'milestone-1',
    name: 'Lunch Earned',
    detail: 'Reached a twenty-day milestone.',
    group: 'routine',
    earnedBy: (state) => state.milestones.totalBigMilestonesHit >= 1,
  },
  {
    id: 'milestone-5',
    name: 'Five Lunches',
    detail: 'Reached five twenty-day milestones.',
    group: 'routine',
    earnedBy: (state) => state.milestones.totalBigMilestonesHit >= 5,
  },
  {
    id: 'milestone-10',
    name: 'Standing Reservation',
    detail: 'Reached ten twenty-day milestones.',
    group: 'routine',
    earnedBy: (state) => state.milestones.totalBigMilestonesHit >= 10,
  },
  {
    id: 'milestone-25',
    name: 'They Know Your Order',
    detail: 'Reached twenty-five twenty-day milestones.',
    group: 'routine',
    earnedBy: (state) => state.milestones.totalBigMilestonesHit >= 25,
  },

  /* The city — building out the ladder. */
  {
    id: 'first-building',
    name: 'Groundbreaking',
    detail: 'Put up the first building.',
    group: 'city',
    earnedBy: (state) => state.city.buildings.length >= 1,
  },
  {
    id: 'five-kinds',
    name: 'A Proper Skyline',
    detail: 'Had five different buildings standing at once.',
    group: 'city',
    earnedBy: (state) => standing(state) >= 5,
  },
  {
    id: 'all-kinds',
    name: 'The Whole Cluster',
    detail: 'Had every building standing at once.',
    group: 'city',
    earnedBy: (state) => standing(state) >= BUILDINGS.length,
  },
  {
    id: 'three-islands',
    name: 'Spread Out',
    detail: 'Built on all three islands.',
    group: 'city',
    earnedBy: (state) =>
      new Set(
        state.city.buildings
          .filter((entry) => entry.level > 0)
          .map((entry) => BUILDINGS.find((def) => def.id === entry.id)?.island)
          .filter(Boolean),
      ).size >= 3,
  },
  {
    id: 'levels-25',
    name: 'Scaffolding',
    detail: 'Reached twenty-five building levels.',
    group: 'city',
    earnedBy: levelsAt(25),
  },
  {
    id: 'levels-100',
    name: 'Dense',
    detail: 'Reached a hundred building levels.',
    group: 'city',
    earnedBy: levelsAt(100),
  },
  {
    id: 'levels-500',
    name: 'Vertical',
    detail: 'Reached five hundred building levels.',
    group: 'city',
    earnedBy: levelsAt(500),
  },
  {
    id: 'levels-1000',
    name: 'A Thousand Storeys',
    detail: 'Reached a thousand building levels.',
    group: 'city',
    earnedBy: levelsAt(1000),
  },
  {
    id: 'levels-2000',
    name: 'No Room Left',
    detail: 'Reached two thousand building levels.',
    group: 'city',
    earnedBy: levelsAt(2000),
  },
  {
    id: 'first-milestone-level',
    name: 'Doubling Down',
    detail: 'Took a building to level 10 and doubled its output.',
    group: 'city',
    earnedBy: (state) => state.city.buildings.some((b) => b.level >= 10),
  },
  {
    id: 'level-50',
    name: 'Landmark',
    detail: 'Took a single building to level 50.',
    group: 'city',
    earnedBy: (state) => state.city.buildings.some((b) => b.level >= 50),
  },
  {
    id: 'level-100',
    name: 'Spire',
    detail: 'Took a single building to level 100.',
    group: 'city',
    earnedBy: (state) => state.city.buildings.some((b) => b.level >= 100),
  },
  {
    id: 'level-max',
    name: 'Topped Out',
    detail: 'Took a building as high as it will go.',
    group: 'city',
    earnedBy: (state) => state.city.buildings.some((b) => b.level >= BUILDING_MAX_LEVEL),
  },
  {
    id: 'all-at-10',
    name: 'Evenly Built',
    detail: 'Had every building standing at level 10 or better.',
    group: 'city',
    earnedBy: everyBuildingAt(10),
  },
  {
    id: 'all-at-25',
    name: 'No Weak Link',
    detail: 'Had every building standing at level 25 or better.',
    group: 'city',
    earnedBy: everyBuildingAt(25),
  },
  {
    id: 'good-neighbours',
    name: 'Good Neighbours',
    detail: 'Took a building and the one that feeds it to level 25 together.',
    group: 'city',
    earnedBy: (state) =>
      BUILDINGS.some(
        (def) =>
          def.synergy &&
          levelOf(state, def.id) >= 25 &&
          levelOf(state, def.synergy.from) >= 25,
      ),
  },

  /* Fortune — what turns up in chests, and what you do with it. */
  {
    id: 'first-cosmetic',
    name: 'Something Pretty',
    detail: 'Found a cosmetic.',
    group: 'fortune',
    earnedBy: (state) => state.city.cosmetics.unlocked.length >= 1,
  },
  {
    id: 'half-cosmetics',
    name: 'Half the Set',
    detail: 'Found half the cosmetics.',
    group: 'fortune',
    earnedBy: (state) =>
      state.city.cosmetics.unlocked.length >= Math.ceil(COSMETICS.length / 2),
  },
  {
    id: 'all-cosmetics',
    name: 'Collector',
    detail: 'Found every cosmetic.',
    group: 'fortune',
    earnedBy: (state) => state.city.cosmetics.unlocked.length >= COSMETICS.length,
  },
  {
    id: 'dressed-up',
    name: 'Dressed Up',
    detail: 'Had something equipped in every slot at once.',
    group: 'fortune',
    earnedBy: (state) => slotsDressed(state) >= COSMETIC_SLOT_COUNT,
  },
  {
    id: 'first-mote',
    name: 'Caught One',
    detail: 'Caught a mote before it drifted off.',
    group: 'fortune',
    earnedBy: (state) => state.motes.caught >= 1,
  },
  {
    id: 'full-catch',
    name: 'Full Catch',
    detail: 'Caught every mote a day had to offer.',
    group: 'fortune',
    earnedBy: (state) =>
      state.motes.caught >= MOTE_CHARGES_PER_REVIEW * 2 && state.motes.remaining === 0,
  },

  /* Wealth — the big numbers themselves. */
  {
    id: 'lumen-1k',
    name: 'Pocket Change',
    detail: 'Earned a thousand Lumen.',
    group: 'wealth',
    earnedBy: lifetimeAt(1e3),
  },
  {
    id: 'lumen-1m',
    name: 'Millionaire',
    detail: 'Earned a million Lumen.',
    group: 'wealth',
    earnedBy: lifetimeAt(1e6),
  },
  {
    id: 'lumen-1b',
    name: 'Billionaire',
    detail: 'Earned a billion Lumen.',
    group: 'wealth',
    earnedBy: lifetimeAt(1e9),
  },
  {
    id: 'lumen-1t',
    name: 'Trillionaire',
    detail: 'Earned a trillion Lumen.',
    group: 'wealth',
    earnedBy: lifetimeAt(1e12),
  },
  {
    id: 'lumen-1qa',
    name: 'Absurd',
    detail: 'Earned a quadrillion Lumen.',
    group: 'wealth',
    earnedBy: lifetimeAt(1e15),
  },
  {
    id: 'lumen-1qi',
    name: 'Past Counting',
    detail: 'Earned a quintillion Lumen.',
    group: 'wealth',
    earnedBy: lifetimeAt(1e18),
  },
  {
    id: 'lumen-1sx',
    name: 'Silly Numbers',
    detail: 'Earned a sextillion Lumen.',
    group: 'wealth',
    earnedBy: lifetimeAt(1e21),
  },
  {
    id: 'banked-1m',
    name: 'Sitting On It',
    detail: 'Held a million Lumen unspent.',
    group: 'wealth',
    earnedBy: bankedAt(1e6),
  },
  {
    id: 'banked-1b',
    name: 'Deep Treasury',
    detail: 'Held a billion Lumen unspent.',
    group: 'wealth',
    earnedBy: bankedAt(1e9),
  },
  {
    id: 'run-1t',
    name: 'One Good Run',
    detail: 'Earned a trillion Lumen in a single run.',
    group: 'wealth',
    earnedBy: (state) => state.currency.runLumen >= 1e12,
  },

  /* Altitude — the prestige loop. */
  {
    id: 'ascend-1',
    name: 'Cast Off',
    detail: 'Ascended for the first time.',
    group: 'ascension',
    earnedBy: ascensionsAt(1),
  },
  {
    id: 'ascend-3',
    name: 'Climbing',
    detail: 'Ascended three times.',
    group: 'ascension',
    earnedBy: ascensionsAt(3),
  },
  {
    id: 'ascend-5',
    name: 'The Quiet Dark',
    detail: 'Ascended five times, into the far dark.',
    group: 'ascension',
    earnedBy: ascensionsAt(5),
  },
  {
    id: 'ascend-10',
    name: 'Untethered',
    detail: 'Ascended ten times.',
    group: 'ascension',
    earnedBy: ascensionsAt(10),
  },
  {
    id: 'ascend-25',
    name: 'Thin Air',
    detail: 'Ascended twenty-five times.',
    group: 'ascension',
    earnedBy: ascensionsAt(25),
  },
  {
    id: 'ascend-50',
    name: 'Nothing Below',
    detail: 'Ascended fifty times.',
    group: 'ascension',
    earnedBy: ascensionsAt(50),
  },
  {
    id: 'first-perk',
    name: 'Something Permanent',
    detail: 'Learned a perk.',
    group: 'ascension',
    earnedBy: (state) => state.ascension.perks.length >= 1,
  },
  {
    id: 'ten-perks',
    name: 'Well Read',
    detail: 'Learned ten perks.',
    group: 'ascension',
    earnedBy: (state) => state.ascension.perks.length >= 10,
  },
  {
    id: 'all-perks',
    name: 'Nothing Left To Learn',
    detail: 'Learned every perk.',
    group: 'ascension',
    earnedBy: (state) => state.ascension.perks.length >= PERKS.length,
  },
  ...PERK_BRANCHES.map(
    (branch): AchievementDef => ({
      id: `branch-${branch.id}`,
      name: `${branch.name}, Complete`,
      detail: `Learned every perk in the ${branch.name} branch.`,
      group: 'ascension',
      earnedBy: branchComplete(branch.id),
    }),
  ),
  {
    id: 'aether-50',
    name: 'Well Supplied',
    detail: 'Banked fifty Aether across every ascension.',
    group: 'ascension',
    earnedBy: aetherEarnedAt(50),
  },
  {
    id: 'aether-250',
    name: 'The Deep Well',
    detail: 'Banked two hundred and fifty Aether across every ascension.',
    group: 'ascension',
    earnedBy: aetherEarnedAt(250),
  },
  {
    id: 'aether-saved',
    name: 'Patient',
    detail: 'Sat on fifty unspent Aether.',
    group: 'ascension',
    earnedBy: (state) => state.ascension.aether >= 50,
  },
  {
    id: 'kept-the-streak',
    name: 'The City Fell, You Didn’t',
    detail: 'Ascended without dropping the streak.',
    group: 'ascension',
    earnedBy: (state) => state.ascension.count >= 1 && state.streak.current >= 1,
  },
];

const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((entry) => [entry.id, entry]));

export function getAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_BY_ID.get(id);
}
