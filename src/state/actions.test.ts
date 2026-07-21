import { beforeEach, describe, expect, it } from 'vitest';
import { CHECKLISTS } from '@/config/checklists';
import { addDays } from '@/domain/dates';
import type { Rng } from '@/domain/rewards';
import {
  buyBuilding,
  buyCosmetic,
  completeReview,
  equipCosmetic,
  takeDayOff,
} from './actions';
import { createInitialState } from './defaults';
import { setStorageBackend } from './storage';
import { createStore, type Store } from './store';
import type { AerieState } from './types';

const AT = (key: string) => new Date(`${key}T09:00:00`);
const TODAY = '2026-07-21';

/** RNG that never rolls a cosmetic drop, keeping payout assertions clean. */
const noDrops: Rng = () => 0.999;

function makeStore(patch: Partial<AerieState> = {}): Store {
  return createStore({ ...createInitialState(), ...patch });
}

beforeEach(() => {
  // Actions persist through the store; keep tests off the real localStorage.
  const map = new Map<string, string>();
  setStorageBackend({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  });
});

describe('completeReview', () => {
  it('records the day, pays Lumen, and starts the streak at 1', () => {
    const store = makeStore();
    const doneIds = CHECKLISTS.morning.items.map((item) => item.id);
    const outcome = completeReview(store, 'morning', doneIds, { now: AT(TODAY), rng: noDrops });

    const state = store.getState();
    expect(outcome.score.tier).toBe('full');
    expect(outcome.advancedStreak).toBe(true);
    expect(state.streak.current).toBe(1);
    expect(state.streak.longest).toBe(1);
    expect(state.currency.lumen).toBe(outcome.reward.totalLumen);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.morning?.tier).toBe('full');
    expect(state.history[0]?.daily).toBeNull();
  });

  it('pays for a second review the same day without moving the streak', () => {
    const store = makeStore();
    completeReview(store, 'morning', CHECKLISTS.morning.items.map((i) => i.id), {
      now: AT(TODAY),
      rng: noDrops,
    });
    const lumenAfterFirst = store.getState().currency.lumen;

    const second = completeReview(store, 'daily', CHECKLISTS.daily.items.map((i) => i.id), {
      now: AT(TODAY),
      rng: noDrops,
    });

    const state = store.getState();
    expect(second.advancedStreak).toBe(false);
    expect(state.streak.current).toBe(1);
    expect(state.currency.lumen).toBeGreaterThan(lumenAfterFirst);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.daily?.completed).toBe(true);
  });

  it('keeps the streak alive on a floor pass', () => {
    const store = makeStore();
    const coreIds = CHECKLISTS.daily.items.filter((i) => i.core).map((i) => i.id);
    const outcome = completeReview(store, 'daily', coreIds, { now: AT(TODAY), rng: noDrops });

    expect(outcome.score.tier).toBe('floor');
    expect(store.getState().streak.current).toBe(1);
  });

  it('pays out but does not advance the streak on a partial', () => {
    const store = makeStore();
    const nonCore = CHECKLISTS.daily.items.filter((i) => !i.core).map((i) => i.id);
    const outcome = completeReview(store, 'daily', nonCore, { now: AT(TODAY), rng: noDrops });

    const state = store.getState();
    expect(outcome.score.tier).toBe('none');
    expect(outcome.advancedStreak).toBe(false);
    expect(state.streak.current).toBe(0);
    expect(state.currency.lumen).toBeGreaterThan(0);
    expect(state.history[0]?.daily?.completed).toBe(true);
  });

  it('pays building income once per day, on the first review only', () => {
    const base = createInitialState();
    const store = makeStore({
      ...base,
      city: { ...base.city, buildings: [{ id: 'greenhouse', level: 1 }] },
    });

    const first = completeReview(store, 'morning', [], { now: AT(TODAY), rng: noDrops });
    const second = completeReview(store, 'daily', [], { now: AT(TODAY), rng: noDrops });

    expect(first.reward.passiveLumen).toBe(6);
    expect(second.reward.passiveLumen).toBe(0);
  });

  it('unlocks a dropped cosmetic', () => {
    const store = makeStore();
    const outcome = completeReview(store, 'morning', [], {
      now: AT(TODAY),
      rng: () => 0,
    });

    expect(outcome.reward.cosmeticId).not.toBeNull();
    expect(store.getState().city.cosmetics.unlocked).toContain(outcome.reward.cosmeticId);
  });

  it('fires the big milestone when the streak reaches 20', () => {
    const base = createInitialState();
    const store = makeStore({
      ...base,
      streak: {
        ...base.streak,
        current: 19,
        longest: 19,
        lastCompletedDate: addDays(TODAY, -1),
        lastActiveDate: addDays(TODAY, -1),
      },
      milestones: { ...base.milestones, nextBigAt: 20, nextSmallAt: 20 },
    });

    const coreIds = CHECKLISTS.morning.items.filter((i) => i.core).map((i) => i.id);
    const outcome = completeReview(store, 'morning', coreIds, {
      now: AT(TODAY),
      rng: noDrops,
    });

    expect(outcome.streakAfter).toBe(20);
    expect(outcome.reward.chest).toBe('big-milestone');
    expect(outcome.reward.milestone?.kind).toBe('big');
    expect(store.getState().milestones.totalBigMilestonesHit).toBe(1);
  });
});

describe('takeDayOff', () => {
  it('holds the streak, counts the day, and is not repeatable', () => {
    const base = createInitialState();
    const store = makeStore({
      ...base,
      streak: {
        ...base.streak,
        current: 6,
        lastCompletedDate: addDays(TODAY, -1),
        lastActiveDate: addDays(TODAY, -1),
      },
    });

    takeDayOff(store, AT(TODAY));
    takeDayOff(store, AT(TODAY));

    const state = store.getState();
    expect(state.streak.current).toBe(6);
    expect(state.streak.daysOffUsed).toBe(1);
    expect(state.history.filter((day) => day.dayOff)).toHaveLength(1);
  });
});

describe('shop actions', () => {
  it('refuses purchases that cannot be afforded', () => {
    const store = makeStore();
    const result = buyBuilding(store, 'greenhouse');
    expect(result).toEqual({ ok: false, reason: 'Not enough Lumen.' });
    expect(store.getState().city.buildings).toHaveLength(0);
  });

  it('buys, then upgrades at the escalating cost', () => {
    const store = makeStore({ currency: { lumen: 10_000 } });

    expect(buyBuilding(store, 'greenhouse').ok).toBe(true);
    expect(store.getState().city.buildings).toEqual([{ id: 'greenhouse', level: 1 }]);
    expect(store.getState().currency.lumen).toBe(10_000 - 240);

    expect(buyBuilding(store, 'greenhouse').ok).toBe(true);
    expect(store.getState().city.buildings).toEqual([{ id: 'greenhouse', level: 2 }]);
    expect(store.getState().currency.lumen).toBe(10_000 - 240 - 432);
  });

  it('stops upgrading at max level', () => {
    const store = makeStore({ currency: { lumen: 100_000 } });
    for (let i = 0; i < 3; i += 1) buyBuilding(store, 'greenhouse');
    expect(buyBuilding(store, 'greenhouse')).toEqual({
      ok: false,
      reason: 'Already at max level.',
    });
  });

  it('buys a cosmetic, equips it, and swaps out the one in its slot', () => {
    const store = makeStore({ currency: { lumen: 5_000 } });

    expect(buyCosmetic(store, 'teal-lanterns').ok).toBe(true);
    expect(store.getState().city.cosmetics.equipped).toEqual(['teal-lanterns']);

    expect(buyCosmetic(store, 'amber-lanterns').ok).toBe(true);
    expect(store.getState().city.cosmetics.equipped).toEqual(['amber-lanterns']);
    expect(store.getState().city.cosmetics.unlocked).toEqual([
      'teal-lanterns',
      'amber-lanterns',
    ]);

    expect(buyCosmetic(store, 'harbour-banner').ok).toBe(true);
    expect(store.getState().city.cosmetics.equipped).toEqual([
      'amber-lanterns',
      'harbour-banner',
    ]);
  });

  it('will not equip something that has not been unlocked', () => {
    const store = makeStore();
    equipCosmetic(store, 'sky-whale');
    expect(store.getState().city.cosmetics.equipped).toEqual([]);
  });
});
