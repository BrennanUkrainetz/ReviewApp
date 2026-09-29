/**
 * Every state transition the UI is allowed to make. Screens call these; they
 * never build a new `AerieState` themselves.
 */
import { defaultItems } from '@/config/checklists';
import { getPerk } from '@/config/perks';
import { getResearch } from '@/config/research';
import { BUILDINGS, getBuilding, getCosmetic } from '@/config/shop';
import {
  BUILDING_MAX_LEVEL,
  CHARTER_MIN_LEVEL,
  MOTE_CHAIN_MAX,
  MOTE_CHARGES_PER_REVIEW,
  MOTE_FLOOR_LUMEN,
  MOTE_SHARE_OF_OUTPUT,
} from '@/config/tuning';
import { isWeekend, today as todayKey } from '@/domain/dates';
import { newlyEarned } from '@/domain/achievements';
import { canAscend, modsFor, pendingAether } from '@/domain/ascension';
import {
  buildingCeiling,
  charterEarnedBy,
  charterProgress,
} from '@/domain/charter';
import { contractBonus, contractFor, contractJustSettled } from '@/domain/contracts';
import { heatDays, heatMultiplier } from '@/domain/heat';
import { cinderFor } from '@/domain/research';
import { affordableLevels, bulkCost, cityOutput } from '@/domain/economy';
import { accrueVault, canCollect, windowsForState } from '@/domain/vault';
import {
  buildReward,
  checkMilestones,
  defaultRng,
  type Reward,
  type Rng,
} from '@/domain/rewards';
import { lumenFor, scoreReview, type ScoreResult } from '@/domain/scoring';
import {
  advanceStreak,
  emptyDay,
  findDay,
  markDayOff,
  shouldAdvanceStreak,
} from '@/domain/streak';
import { checklistFor, sanitizeItems } from './checklists';
import type { Store } from './store';
import type { AerieState, ChecklistItem, DayRecord, ReviewId } from './types';

export interface ReviewOutcome {
  reviewId: ReviewId;
  score: ScoreResult;
  reward: Reward;
  streakBefore: number;
  streakAfter: number;
  /** False when the streak didn't move — a second review, or a partial. */
  advancedStreak: boolean;
  /** Achievement ids this review earned, for the chest to announce. */
  earnedAchievements: string[];
  /** Cinder this review earned. Zero unless it was a full clear. */
  cinderEarned: number;
}

function upsertDay(history: DayRecord[], day: DayRecord): DayRecord[] {
  const index = history.findIndex((entry) => entry.date === day.date);
  if (index === -1) return [...history, day].sort((a, b) => a.date.localeCompare(b.date));
  const next = [...history];
  next[index] = day;
  return next;
}

/* ------------------------------------------------------------------ */
/* The vault                                                           */
/* ------------------------------------------------------------------ */

/**
 * Folds elapsed city output into the vault. Idempotent and cheap, so screens
 * call it on a timer and every other action calls it before doing anything that
 * changes the city — accrual has to be banked at the *old* output rate before a
 * new building starts paying.
 */
export function syncVault(store: Store, now: Date = new Date()): void {
  store.update((state) => {
    const vault = accrueVault(state, now);
    return vault === state.vault ? state : { ...state, vault };
  });
}

export interface CollectResult {
  ok: true;
  lumen: number;
}

/**
 * Empties the vault into the balance. Refused outside a collection window, and
 * refused twice in the same window — see `domain/vault.ts` for why that needs
 * only one timestamp.
 */
export function collectVault(
  store: Store,
  now: Date = new Date(),
): CollectResult | { ok: false; reason: string } {
  syncVault(store, now);

  const state = store.getState();
  if (!canCollect(state.vault, now, windowsForState(state))) {
    return { ok: false, reason: 'The vault is shut. Come back at the next window.' };
  }

  const lumen = state.vault.lumen;
  if (lumen <= 0) return { ok: false, reason: 'Nothing in the vault yet.' };

  store.update((current) => ({
    ...current,
    currency: {
      ...current.currency,
      lumen: current.currency.lumen + lumen,
      runLumen: current.currency.runLumen + lumen,
      lifetimeLumen: current.currency.lifetimeLumen + lumen,
    },
    vault: {
      ...current.vault,
      lumen: 0,
      // The accrual clock restarts here. `accrueVault` deliberately leaves
      // `accruedThrough` behind when a tick is worth nothing — including while
      // the vault sits full — and without this reset that banked-up time would
      // pour straight back in the instant the vault was emptied.
      accruedThrough: now.getTime(),
      carry: 0,
      lastCollectedAt: now.getTime(),
      lifetimeCollected: current.vault.lifetimeCollected + lumen,
    },
  }));

  creditAchievements(store);
  return { ok: true, lumen };
}

export interface CompleteReviewOptions {
  now?: Date;
  rng?: Rng;
}

/**
 * Logs a finished review: scores it, advances the streak if it qualifies,
 * pays out the chest, and records the day.
 */
export function completeReview(
  store: Store,
  reviewId: ReviewId,
  doneItemIds: Iterable<string>,
  { now = new Date(), rng = defaultRng }: CompleteReviewOptions = {},
): ReviewOutcome {
  const date = todayKey(now);
  // Bank what the city has produced so far before the review changes the rate
  // it produces at.
  syncVault(store, now);
  const before = store.getState();

  const mods = modsFor(before);
  const score = scoreReview(checklistFor(before, reviewId), doneItemIds);
  const advancedStreak = score.countsForStreak && shouldAdvanceStreak(before, date);
  const streakBefore = before.streak.current;
  const streakAfter = advancedStreak ? streakBefore + 1 : streakBefore;

  // What the city is worth per day. It is not paid here — the vault accrues it
  // around the clock — but every share in the chest is struck against it, so a
  // large city still opens a large chest.
  const passiveLumen = cityOutput(before.city.buildings, mods);
  // The review's own payout is one of those shares now, pro-rated by points.
  // A flat per-point rate stopped being a reward the moment the city outgrew
  // it, and the checklist is the one thing here that is real work.
  const reviewLumen = lumenFor(score.points, streakAfter, mods, {
    cityOutput: passiveLumen,
    fullClearPoints: score.fullClearPoints,
  });

  // Milestones only fire on the day the streak actually moves.
  const { hit, milestones } = advancedStreak
    ? checkMilestones(before.milestones, streakAfter)
    : { hit: null, milestones: before.milestones };

  // Heat is read from the history *including* today's result, since a full
  // clear logged right now is what extends the combo.
  const dayBefore = findDay(before.history, date);
  const updatedDay: DayRecord = {
    ...(dayBefore ?? emptyDay(date)),
    [reviewId]: {
      completed: true,
      tier: score.tier,
      pointsEarned: score.points,
      lumenEarned: 0, // filled in below, once the reward is known
      doneItemIds: score.doneItemIds,
    },
  };
  const historyWithToday = upsertDay(before.history, updatedDay);
  const heat = heatMultiplier(historyWithToday, date);

  // Cinder — the quality currency. Only a full clear pays, and the second
  // full clear of a day pays the perfect-day bonus. Struck against the heat as
  // whole days (not the multiplier), so a long combo is worth more per clear.
  const completesPerfectDay =
    score.tier === 'full' &&
    (reviewId === 'morning' ? dayBefore?.daily?.tier : dayBefore?.morning?.tier) === 'full';
  const cinderEarned = cinderFor(
    score.tier,
    completesPerfectDay,
    heatDays(historyWithToday, date),
    mods.research,
  );

  // The contract pays on the review that settles it, and only that one.
  const contract = contractFor(date);
  const settled = contractJustSettled(contract, dayBefore, updatedDay);
  const heatedBase = Math.round(reviewLumen * heat) + Math.round(passiveLumen * heat);

  const reward = buildReward({
    reviewLumen,
    passiveLumen,
    heat,
    contract: settled
      ? { id: contract.id, bonus: contractBonus(contract, heatedBase) }
      : null,
    milestone: hit,
    unlockedCosmetics: before.city.cosmetics.unlocked,
    rng,
    mods,
  });

  let earnedAchievements: string[] = [];

  store.update((state) => {
    const day = findDay(state.history, date) ?? emptyDay(date);
    const recordedDay: DayRecord = {
      ...day,
      [reviewId]: {
        completed: true,
        tier: score.tier,
        pointsEarned: score.points,
        lumenEarned: reward.totalLumen,
        doneItemIds: score.doneItemIds,
      },
    };

    const withHistory: AerieState = {
      ...state,
      history: upsertDay(state.history, recordedDay),
      currency: {
        ...state.currency,
        lumen: state.currency.lumen + reward.totalLumen,
        runLumen: state.currency.runLumen + reward.totalLumen,
        lifetimeLumen: state.currency.lifetimeLumen + reward.totalLumen,
        cinder: state.currency.cinder + cinderEarned,
      },
      milestones,
      // Finishing a review is what opens the mote window. Charges are stamped
      // with the day so yesterday's never carry over.
      motes: {
        date,
        remaining:
          (state.motes.date === date ? state.motes.remaining : 0) +
          MOTE_CHARGES_PER_REVIEW +
          Math.floor(mods.moteCharges),
        caught: state.motes.date === date ? state.motes.caught : 0,
      },
      city: reward.cosmeticId
        ? {
            ...state.city,
            cosmetics: {
              ...state.city.cosmetics,
              unlocked: [...state.city.cosmetics.unlocked, reward.cosmeticId],
            },
          }
        : state.city,
    };

    const advanced = score.countsForStreak
      ? advanceStreak(withHistory, date)
      : withHistory;
    earnedAchievements = newlyEarned(advanced);
    return earnedAchievements.length > 0
      ? { ...advanced, achievements: [...advanced.achievements, ...earnedAchievements] }
      : advanced;
  });

  return {
    reviewId,
    score,
    reward,
    streakBefore,
    streakAfter,
    advancedStreak,
    earnedAchievements,
    cinderEarned,
  };
}

export interface MoteCatch {
  ok: true;
  lumen: number;
  remaining: number;
  /** What the chain was worth, after clamping. 1 for an unchained catch. */
  multiplier: number;
}

/**
 * Catches a drifting mote for a burst of Lumen.
 *
 * Worth a share of the city's daily output, so it stays meaningful at every
 * scale without ever rivalling a review — three motes come to roughly half a
 * day's city output, on a day that already paid a full one.
 *
 * `multiplier` is the chain the field has going (see MOTE_CHAIN_STEP). It is
 * clamped here rather than trusted, so the ceiling is one the economy owns and
 * not something a caller can talk its way past.
 */
export function catchMote(
  store: Store,
  now: Date = new Date(),
  multiplier = 1,
): MoteCatch | { ok: false } {
  const date = todayKey(now);
  const state = store.getState();
  if (state.motes.date !== date || state.motes.remaining <= 0) return { ok: false };

  const chain = Math.min(MOTE_CHAIN_MAX, Math.max(1, multiplier));
  const mods = modsFor(state);
  // Chain multiplies the value after the floor, so a small city's motes still
  // reward the chase rather than flatlining at the floor.
  const base = Math.max(
    MOTE_FLOOR_LUMEN,
    Math.round(cityOutput(state.city.buildings, mods) * MOTE_SHARE_OF_OUTPUT),
  );
  const lumen = Math.round(base * chain);

  store.update((current) => ({
    ...current,
    currency: {
      ...current.currency,
      lumen: current.currency.lumen + lumen,
      runLumen: current.currency.runLumen + lumen,
      lifetimeLumen: current.currency.lifetimeLumen + lumen,
    },
    motes: {
      date,
      remaining: current.motes.remaining - 1,
      caught: current.motes.caught + 1,
    },
  }));

  creditAchievements(store);
  return { ok: true, lumen, remaining: state.motes.remaining - 1, multiplier: chain };
}

/**
 * Marks today as a deliberate day off. No-op if already marked, and on a
 * weekend — those are off already, and there is no run to hold open.
 */
export function takeDayOff(store: Store, now: Date = new Date()): void {
  const date = todayKey(now);
  if (isWeekend(date)) return;
  store.update((state) => {
    const day = findDay(state.history, date) ?? emptyDay(date);
    if (day.dayOff) return state;
    const withHistory: AerieState = {
      ...state,
      history: upsertDay(state.history, { ...day, dayOff: true }),
    };
    return markDayOff(withHistory, date);
  });
  creditAchievements(store);
}

/** Either it happened, or it didn't and there's a line to show the user. */
export type ActionResult = { ok: true } | { ok: false; reason: string };
export type PurchaseResult = ActionResult;

export interface BuildResult {
  ok: true;
  /** Levels actually bought — a `max` buy asks for more than it can afford. */
  levels: number;
  spent: number;
  newLevel: number;
}

export type BuildOutcome = BuildResult | { ok: false; reason: string };

/**
 * Buys `count` levels of a building, or as many as the balance covers when
 * `count` is `'max'`.
 *
 * Bulk buying is not a convenience here, it's load-bearing: past the first
 * couple of tiers a day's Lumen is worth dozens of levels, and clicking
 * "Upgrade" forty times is not a game.
 */
export function buyBuilding(
  store: Store,
  buildingId: string,
  count: number | 'max' = 1,
): BuildOutcome {
  const def = getBuilding(buildingId);
  if (!def) return { ok: false, reason: 'Unknown building.' };

  // Bank output at the old rate before the new level starts paying.
  syncVault(store);
  const state = store.getState();
  const mods = modsFor(state);
  const owned = state.city.buildings.find((entry) => entry.id === buildingId);
  const level = owned?.level ?? 0;

  const wanted = count === 'max' ? undefined : Math.max(1, Math.floor(count));
  const levels = affordableLevels(def, level, state.currency.lumen, wanted, mods);
  if (levels <= 0) {
    return { ok: false, reason: refusalFor(level, state.city.charter) };
  }

  const spent = bulkCost(def, level, levels, mods);

  store.update((current) => ({
    ...current,
    currency: { ...current.currency, lumen: current.currency.lumen - spent },
    city: {
      ...current.city,
      buildings: owned
        ? current.city.buildings.map((entry) =>
            entry.id === buildingId ? { ...entry, level: entry.level + levels } : entry,
          )
        : [...current.city.buildings, { id: buildingId, level: levels }],
    },
  }));

  creditAchievements(store);
  return { ok: true, levels, spent, newLevel: level + levels };
}

/**
 * Why a purchase was refused, in the words the shop will show.
 *
 * The charter case is the one worth spelling out: a player who has just been
 * told "not enough Lumen" when the truth is "your city is not chartered that
 * high" would go and earn Lumen that changes nothing.
 */
function refusalFor(level: number, charter: number): string {
  if (level >= BUILDING_MAX_LEVEL) return 'Built as high as it goes.';
  if (level >= buildingCeiling(charter)) {
    return `The city charter caps every building at level ${buildingCeiling(charter)}. Raise the Hearth Hall.`;
  }
  return 'Not enough Lumen.';
}

export interface CharterResult {
  ok: true;
  level: number;
  spent: number;
  /** The ceiling every building may now be raised to. */
  ceiling: number;
}

export type CharterOutcome = CharterResult | { ok: false; reason: string };

/**
 * Raises the city's charter — the Hearth Hall's one interaction.
 *
 * Two gates, and the order matters for the message the shop shows. Breadth
 * first, because that is the one a player has to plan around; the Lumen price
 * is a share of the city's own output and is rarely what is missing.
 *
 * Banks the vault first: a charter lifts the whole city's output the moment it
 * lands, and accrual that happened at the old rate must not be paid at the new
 * one.
 */
export function buyCharter(store: Store): CharterOutcome {
  syncVault(store);
  const state = store.getState();
  const mods = modsFor(state);
  const output = cityOutput(state.city.buildings, mods);
  const progress = charterProgress(
    state.city.buildings,
    state.city.charter,
    output,
    state.currency.lumen,
  );

  if (progress.next === null || progress.requirement === null) {
    return { ok: false, reason: 'The charter is as broad as it goes.' };
  }
  if (!progress.met) {
    const { kinds, atLevel } = progress.requirement;
    return {
      ok: false,
      reason: `Charter ${progress.next} needs ${kinds} kinds of building at level ${atLevel} — you have ${progress.standing}.`,
    };
  }
  if (state.currency.lumen < progress.cost) {
    return { ok: false, reason: 'Not enough Lumen.' };
  }

  const level = progress.next;
  store.update((current) => ({
    ...current,
    currency: {
      ...current.currency,
      lumen: current.currency.lumen - progress.cost,
    },
    city: { ...current.city, charter: level },
  }));

  creditAchievements(store);
  return { ok: true, level, spent: progress.cost, ceiling: buildingCeiling(level) };
}

export interface AscendResult {
  ok: true;
  /** Aether granted by the run just ended. */
  aether: number;
  /** The new ascension count, which is also the new altitude band. */
  count: number;
  /** Lumen carried through by the Unbroken perk, if any. */
  carried: number;
}

export type AscendOutcome = AscendResult | { ok: false; reason: string };

/**
 * Ascends: the city climbs a band, the run resets, and the Aether it was worth
 * is banked.
 *
 * What survives is the point of the whole mechanic, so it is spelled out
 * rather than implied by what the reset happens to miss:
 *
 * - **Kept:** the streak, the whole history, days-off, milestone progress,
 *   every unlocked cosmetic, and of course Aether and perks. The streak and
 *   history are records of what actually happened; no in-game reset gets to
 *   touch them.
 * - **Reset:** Lumen (bar the Unbroken share), every building, the run total
 *   that drives shop reveals, and whatever was sitting in the vault — it was
 *   produced by buildings that no longer exist.
 */
export function ascend(store: Store, now: Date = new Date()): AscendOutcome {
  // Anything already produced is banked (and then wiped with the rest) rather
  // than left to accrue against a city that has gone.
  syncVault(store, now);
  const state = store.getState();
  if (!canAscend(state)) {
    return { ok: false, reason: 'Not enough lifetime Lumen to ascend yet.' };
  }

  const mods = modsFor(state);
  const granted = pendingAether(state);
  const carried = Math.floor(state.currency.lumen * mods.carryLumen);
  const foothold = mods.foothold;

  store.update((current) => ({
    ...current,
    currency: {
      lumen: carried,
      runLumen: 0,
      lifetimeLumen: current.currency.lifetimeLumen,
      // Cinder survives an ascension untouched, exactly as perks and Aether do.
      cinder: current.currency.cinder,
    },
    ascension: {
      count: current.ascension.count + 1,
      aether: current.ascension.aether + granted,
      aetherEarned: current.ascension.aetherEarned + granted,
      perks: current.ascension.perks,
    },
    vault: { ...current.vault, accruedThrough: now.getTime(), lumen: 0, carry: 0 },
    city: (() => {
      // Cosmetics are found, not bought back — they stay unlocked and equipped.
      const buildings = foothold
        ? BUILDINGS.slice(0, foothold.count).map((def) => ({
            id: def.id,
            level: foothold.level,
          }))
        : [];
      return {
        ...current.city,
        buildings,
        // The charter goes with the city that earned it. Keeping it would hand
        // every later run a free ceiling and a free output multiplier, which is
        // what perks are for — but it must still cover whatever a foothold
        // rebuilt, or the run would open unable to touch its own buildings.
        charter: Math.max(CHARTER_MIN_LEVEL, charterEarnedBy(buildings)),
      };
    })(),
  }));

  creditAchievements(store);
  return { ok: true, aether: granted, count: state.ascension.count + 1, carried };
}

/**
 * Re-checks achievements and credits anything newly earned.
 *
 * Called after every action that can earn one outside a review — building,
 * ascending, learning a perk, catching a mote, dressing the city, editing a
 * routine, taking a day off. `completeReview` does its own check inside its
 * update so the chest can announce what it earned.
 */
export function creditAchievements(store: Store): string[] {
  const earned = newlyEarned(store.getState());
  if (earned.length === 0) return [];
  store.update((state) => ({
    ...state,
    achievements: [...state.achievements, ...earned],
  }));
  return earned;
}

/** Spends Aether on a perk. Permanent — perks are never refunded or lost. */
export function buyPerk(store: Store, perkId: string): PurchaseResult {
  const def = getPerk(perkId);
  if (!def) return { ok: false, reason: 'Unknown perk.' };

  const state = store.getState();
  const { perks, aether } = state.ascension;

  if (perks.includes(perkId)) return { ok: false, reason: 'Already learned.' };
  if (def.requires && !perks.includes(def.requires)) {
    return {
      ok: false,
      reason: `${getPerk(def.requires)?.name ?? 'Something else'} comes first.`,
    };
  }
  if (aether < def.cost) return { ok: false, reason: 'Not enough Aether.' };

  store.update((current) => ({
    ...current,
    ascension: {
      ...current.ascension,
      aether: current.ascension.aether - def.cost,
      perks: [...current.ascension.perks, perkId],
    },
  }));

  creditAchievements(store);
  return { ok: true };
}

/**
 * Spends Cinder on a research node. Permanent — research is never refunded or
 * lost, and survives an ascension. Buying it can change the vault's rules, so
 * accrual is banked at the old rules first.
 */
export function buyResearch(store: Store, researchId: string): PurchaseResult {
  const def = getResearch(researchId);
  if (!def) return { ok: false, reason: 'Unknown research.' };

  syncVault(store);
  const state = store.getState();
  const owned = state.research;

  if (owned.includes(researchId)) return { ok: false, reason: 'Already researched.' };
  if (def.requires && !owned.includes(def.requires)) {
    return {
      ok: false,
      reason: `${getResearch(def.requires)?.name ?? 'Something else'} comes first.`,
    };
  }
  if (state.currency.cinder < def.cost) {
    return { ok: false, reason: 'Not enough Cinder.' };
  }

  store.update((current) => ({
    ...current,
    currency: {
      ...current.currency,
      cinder: current.currency.cinder - def.cost,
    },
    research: [...current.research, researchId],
  }));

  creditAchievements(store);
  return { ok: true };
}

/** Buys a cosmetic and equips it immediately — there's no reason not to. */
export function buyCosmetic(store: Store, cosmeticId: string): PurchaseResult {
  const def = getCosmetic(cosmeticId);
  if (!def) return { ok: false, reason: 'Unknown cosmetic.' };

  const state = store.getState();
  if (state.city.cosmetics.unlocked.includes(cosmeticId)) {
    return { ok: false, reason: 'Already unlocked.' };
  }
  if (state.currency.lumen < def.cost) return { ok: false, reason: 'Not enough Lumen.' };

  store.update((current) => ({
    ...current,
    currency: { ...current.currency, lumen: current.currency.lumen - def.cost },
    city: {
      ...current.city,
      cosmetics: {
        ...current.city.cosmetics,
        unlocked: [...current.city.cosmetics.unlocked, cosmeticId],
      },
    },
  }));

  equipCosmetic(store, cosmeticId);
  return { ok: true };
}

/** Equips an unlocked cosmetic, replacing whatever occupied its slot. */
export function equipCosmetic(store: Store, cosmeticId: string): void {
  const def = getCosmetic(cosmeticId);
  if (!def) return;

  store.update((state) => {
    if (!state.city.cosmetics.unlocked.includes(cosmeticId)) return state;
    const equipped = state.city.cosmetics.equipped.filter((id) => {
      const other = getCosmetic(id);
      return other ? other.slot !== def.slot : false;
    });
    return {
      ...state,
      city: {
        ...state.city,
        cosmetics: { ...state.city.cosmetics, equipped: [...equipped, cosmeticId] },
      },
    };
  });

  creditAchievements(store);
}

/** Unequips a cosmetic, leaving its slot empty. */
export function unequipCosmetic(store: Store, cosmeticId: string): void {
  store.update((state) => ({
    ...state,
    city: {
      ...state.city,
      cosmetics: {
        ...state.city.cosmetics,
        equipped: state.city.cosmetics.equipped.filter((id) => id !== cosmeticId),
      },
    },
  }));
}

/**
 * Replaces one routine's checklist with an edited list.
 *
 * The items are sanitised here rather than trusted from the editor, so a bad
 * edit can't put a save into a state the review flow or scoring can't handle.
 * Rejects an empty result: a routine with no items can't be reviewed.
 */
export function saveChecklist(
  store: Store,
  reviewId: ReviewId,
  items: readonly Partial<ChecklistItem>[],
): ActionResult {
  const clean = sanitizeItems(items);
  if (clean.length === 0)
    return { ok: false, reason: 'A review needs at least one item.' };

  store.update((state) => ({
    ...state,
    checklists: { ...state.checklists, [reviewId]: clean },
  }));
  creditAchievements(store);
  return { ok: true };
}

/** Puts one routine back to the checklist Aerie ships with. */
export function resetChecklist(store: Store, reviewId: ReviewId): void {
  store.update((state) => ({
    ...state,
    checklists: { ...state.checklists, [reviewId]: defaultItems(reviewId) },
  }));
}

export function updateSettings(
  store: Store,
  patch: Partial<AerieState['settings']>,
): void {
  store.update((state) => ({ ...state, settings: { ...state.settings, ...patch } }));
}
