/**
 * Every state transition the UI is allowed to make. Screens call these; they
 * never build a new `AerieState` themselves.
 */
import { getChecklist } from '@/config/checklists';
import { buildingCost, getBuilding, getCosmetic } from '@/config/shop';
import { PASSIVE_INCOME_REQUIRES_REVIEW } from '@/config/tuning';
import { today as todayKey, type DateKey } from '@/domain/dates';
import {
  buildReward,
  checkMilestones,
  defaultRng,
  passiveIncome,
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
import type { Store } from './store';
import type { AerieState, DayRecord, ReviewId } from './types';

export interface ReviewOutcome {
  reviewId: ReviewId;
  score: ScoreResult;
  reward: Reward;
  streakBefore: number;
  streakAfter: number;
  /** False when the streak didn't move — a second review, or a partial. */
  advancedStreak: boolean;
}

function upsertDay(history: DayRecord[], day: DayRecord): DayRecord[] {
  const index = history.findIndex((entry) => entry.date === day.date);
  if (index === -1) return [...history, day].sort((a, b) => a.date.localeCompare(b.date));
  const next = [...history];
  next[index] = day;
  return next;
}

/** True once any review has been completed on `date`. */
function hasCompletionOn(state: AerieState, date: DateKey): boolean {
  const day = findDay(state.history, date);
  return Boolean(day?.morning?.completed ?? day?.daily?.completed);
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
  const before = store.getState();

  const score = scoreReview(getChecklist(reviewId), doneItemIds);
  const advancedStreak = score.countsForStreak && shouldAdvanceStreak(before, date);
  const streakBefore = before.streak.current;
  const streakAfter = advancedStreak ? streakBefore + 1 : streakBefore;

  const reviewLumen = lumenFor(score.points, streakAfter);
  const firstOfDay = !hasCompletionOn(before, date);
  const passiveLumen =
    firstOfDay || !PASSIVE_INCOME_REQUIRES_REVIEW ? passiveIncome(before.city.buildings) : 0;

  // Milestones only fire on the day the streak actually moves.
  const { hit, milestones } = advancedStreak
    ? checkMilestones(before.milestones, streakAfter)
    : { hit: null, milestones: before.milestones };

  const reward = buildReward({
    reviewLumen,
    passiveLumen,
    milestone: hit,
    unlockedCosmetics: before.city.cosmetics.unlocked,
    rng,
  });

  store.update((state) => {
    const day = findDay(state.history, date) ?? emptyDay(date);
    const updatedDay: DayRecord = {
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
      history: upsertDay(state.history, updatedDay),
      currency: { lumen: state.currency.lumen + reward.totalLumen },
      milestones,
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

    return score.countsForStreak ? advanceStreak(withHistory, date) : withHistory;
  });

  return { reviewId, score, reward, streakBefore, streakAfter, advancedStreak };
}

/** Marks today as a deliberate day off. No-op if already marked. */
export function takeDayOff(store: Store, now: Date = new Date()): void {
  const date = todayKey(now);
  store.update((state) => {
    const day = findDay(state.history, date) ?? emptyDay(date);
    if (day.dayOff) return state;
    const withHistory: AerieState = {
      ...state,
      history: upsertDay(state.history, { ...day, dayOff: true }),
    };
    return markDayOff(withHistory, date);
  });
}

export type PurchaseResult = { ok: true } | { ok: false; reason: string };

/** Buys a building, or upgrades one already standing. */
export function buyBuilding(store: Store, buildingId: string): PurchaseResult {
  const def = getBuilding(buildingId);
  if (!def) return { ok: false, reason: 'Unknown building.' };

  const state = store.getState();
  const owned = state.city.buildings.find((entry) => entry.id === buildingId);
  const level = owned?.level ?? 0;
  if (level >= def.maxLevel) return { ok: false, reason: 'Already at max level.' };

  const cost = buildingCost(def, level);
  if (state.currency.lumen < cost) return { ok: false, reason: 'Not enough Lumen.' };

  store.update((current) => ({
    ...current,
    currency: { lumen: current.currency.lumen - cost },
    city: {
      ...current.city,
      buildings: owned
        ? current.city.buildings.map((entry) =>
            entry.id === buildingId ? { ...entry, level: entry.level + 1 } : entry,
          )
        : [...current.city.buildings, { id: buildingId, level: 1 }],
    },
  }));

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
    currency: { lumen: current.currency.lumen - def.cost },
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

export function updateSettings(
  store: Store,
  patch: Partial<AerieState['settings']>,
): void {
  store.update((state) => ({ ...state, settings: { ...state.settings, ...patch } }));
}
