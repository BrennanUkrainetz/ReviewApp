import { beforeEach, describe, expect, it } from 'vitest';
import { defaultItems } from '@/config/checklists';
import { getBuilding } from '@/config/shop';
import {
  BUILDING_MAX_LEVEL,
  CHARTER_MAX_LEVEL,
  HEAT_PER_DAY,
  MOTE_CHARGES_PER_REVIEW,
  MOTE_FLOOR_LUMEN,
  KILN_CINDER_PER_AETHER,
  WARD_CINDER_COST,
} from '@/config/tuning';
import { getWeekly } from '@/config/weekly';
import { weeklyFor } from '@/domain/weekly';
import { addDays, addWeekdays, toDateKey } from '@/domain/dates';
import { buildingCeiling } from '@/domain/charter';
import { buildingCost, cityOutput } from '@/domain/economy';
import type { Rng } from '@/domain/rewards';
import { pendingAether } from '@/domain/ascension';
import { contractFor } from '@/domain/contracts';
import {
  ascend,
  buyBuilding,
  buyCharter,
  buyCosmetic,
  buyPerk,
  catchMote,
  completeReview,
  equipCosmetic,
  resetChecklist,
  saveChecklist,
  collectVault,
  syncVault,
  takeDayOff,
  buyResearch,
  buyWard,
  fireKiln,
  mendStreak,
} from './actions';
import { createInitialState } from './defaults';
import { setStorageBackend } from './storage';
import { createStore, type Store } from './store';
import type { AerieState } from './types';

const greenhouse = getBuilding('greenhouse')!;

const AT = (key: string) => new Date(`${key}T09:00:00`);
const TODAY = '2026-07-21'; // a Tuesday
const SATURDAY = '2026-07-18';

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
    const doneIds = defaultItems('morning').map((item) => item.id);
    const outcome = completeReview(store, 'morning', doneIds, {
      now: AT(TODAY),
      rng: noDrops,
    });

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
    completeReview(
      store,
      'morning',
      defaultItems('morning').map((i) => i.id),
      {
        now: AT(TODAY),
        rng: noDrops,
      },
    );
    const lumenAfterFirst = store.getState().currency.lumen;

    const second = completeReview(
      store,
      'daily',
      defaultItems('daily').map((i) => i.id),
      {
        now: AT(TODAY),
        rng: noDrops,
      },
    );

    const state = store.getState();
    expect(second.advancedStreak).toBe(false);
    expect(state.streak.current).toBe(1);
    expect(state.currency.lumen).toBeGreaterThan(lumenAfterFirst);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.daily?.completed).toBe(true);
  });

  it('keeps the streak alive on a floor pass', () => {
    const store = makeStore();
    const coreIds = defaultItems('daily')
      .filter((i) => i.core)
      .map((i) => i.id);
    const outcome = completeReview(store, 'daily', coreIds, {
      now: AT(TODAY),
      rng: noDrops,
    });

    expect(outcome.score.tier).toBe('floor');
    expect(store.getState().streak.current).toBe(1);
  });

  it('pays a weekend review without moving the streak', () => {
    const base = createInitialState();
    const store = makeStore({
      ...base,
      streak: {
        ...base.streak,
        current: 5,
        longest: 5,
        lastCompletedDate: '2026-07-17', // the Friday before
        lastActiveDate: '2026-07-17',
      },
    });

    const outcome = completeReview(
      store,
      'morning',
      defaultItems('morning').map((i) => i.id),
      { now: AT(SATURDAY), rng: noDrops },
    );

    const state = store.getState();
    expect(outcome.score.tier).toBe('full');
    expect(outcome.advancedStreak).toBe(false);
    expect(outcome.reward.totalLumen).toBeGreaterThan(0);
    expect(state.streak.current).toBe(5);
    // ...and it is still on the record, because it happened.
    expect(state.history[0]?.date).toBe(SATURDAY);
  });

  it('pays out but does not advance the streak on a partial', () => {
    const store = makeStore();
    const nonCore = defaultItems('daily')
      .filter((i) => !i.core)
      .map((i) => i.id);
    const outcome = completeReview(store, 'daily', nonCore, {
      now: AT(TODAY),
      rng: noDrops,
    });

    const state = store.getState();
    expect(outcome.score.tier).toBe('none');
    expect(outcome.advancedStreak).toBe(false);
    expect(state.streak.current).toBe(0);
    expect(state.currency.lumen).toBeGreaterThan(0);
    expect(state.history[0]?.daily?.completed).toBe(true);
  });

  it('reports the city output without paying it — that is the vault’s job now', () => {
    const base = createInitialState();
    const store = makeStore({
      ...base,
      city: { ...base.city, buildings: [{ id: 'greenhouse', level: 1 }] },
    });

    const output = cityOutput([{ id: 'greenhouse', level: 1 }]);
    const first = completeReview(store, 'morning', [], { now: AT(TODAY), rng: noDrops });
    const second = completeReview(store, 'daily', [], { now: AT(TODAY), rng: noDrops });

    // Reported on both reviews — it is a rate, not a once-a-day windfall.
    expect(first.reward.passiveLumen).toBe(output);
    expect(second.reward.passiveLumen).toBe(output);
    // ...and neither chest actually contained it.
    expect(first.reward.totalLumen).toBe(
      first.reward.reviewLumen + first.reward.bonusLumen + first.reward.contractLumen,
    );
  });

  it('scales the review payout with the city instead of leaving it flat', () => {
    const base = createInitialState();
    const doneIds = defaultItems('morning').map((item) => item.id);
    const payoutWith = (level: number) => {
      const store = createStore({
        ...base,
        city: { ...base.city, buildings: [{ id: 'greenhouse', level }] },
      });
      return completeReview(store, 'morning', doneIds, { now: AT(TODAY), rng: noDrops })
        .reward.reviewLumen;
    };

    // The point of the change: past the flat floor, a city worth ten times
    // more opens a chest worth ten times more, rather than the same handful of
    // Lumen it paid on day one.
    const modest = payoutWith(40);
    const large = payoutWith(80);
    const outputRatio =
      cityOutput([{ id: 'greenhouse', level: 80 }]) /
      cityOutput([{ id: 'greenhouse', level: 40 }]);
    expect(large / modest / outputRatio).toBeCloseTo(1, 2);
    // ...and it is a real share of what the city makes in a day, not a rounding
    // error beside it.
    expect(large).toBeGreaterThan(cityOutput([{ id: 'greenhouse', level: 80 }]) / 8);
    // A brand new city still gets the flat rate as a floor.
    expect(payoutWith(0)).toBeGreaterThan(0);
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

    const coreIds = defaultItems('morning')
      .filter((i) => i.core)
      .map((i) => i.id);
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

  it('spends nothing on a weekend — those are off already', () => {
    const store = makeStore();
    takeDayOff(store, AT(SATURDAY));

    const state = store.getState();
    expect(state.streak.daysOffUsed).toBe(0);
    expect(state.history).toHaveLength(0);
  });
});

describe('motes', () => {
  it('has none to catch before a review is done', () => {
    const store = makeStore();
    expect(catchMote(store, AT(TODAY))).toEqual({ ok: false });
  });

  it('opens a window of charges when a review is completed', () => {
    const store = makeStore();
    completeReview(store, 'morning', [], { now: AT(TODAY), rng: noDrops });
    expect(store.getState().motes).toMatchObject({
      date: TODAY,
      remaining: MOTE_CHARGES_PER_REVIEW,
    });
  });

  it('pays out and spends a charge, and runs dry', () => {
    const store = makeStore();
    completeReview(store, 'morning', [], { now: AT(TODAY), rng: noDrops });
    const before = store.getState().currency.lumen;

    for (let i = 0; i < MOTE_CHARGES_PER_REVIEW; i += 1) {
      expect(catchMote(store, AT(TODAY)).ok).toBe(true);
    }

    expect(catchMote(store, AT(TODAY))).toEqual({ ok: false });
    expect(store.getState().currency.lumen).toBeGreaterThan(before);
    expect(store.getState().motes.caught).toBe(MOTE_CHARGES_PER_REVIEW);
  });

  it('scales with the city rather than staying pocket change', () => {
    const base = createInitialState();
    const big = makeStore({
      ...base,
      city: { ...base.city, buildings: [{ id: 'observatory', level: 20 }] },
    });
    completeReview(big, 'morning', [], { now: AT(TODAY), rng: noDrops });
    const result = catchMote(big, AT(TODAY));
    expect(result.ok && result.lumen).toBeGreaterThan(MOTE_FLOOR_LUMEN);
  });

  it("does not let yesterday's charges carry into today", () => {
    const store = makeStore();
    completeReview(store, 'morning', [], { now: AT(TODAY), rng: noDrops });
    // Same charges, a day later: the window has closed.
    expect(catchMote(store, AT(addDays(TODAY, 1)))).toEqual({ ok: false });
  });
});

describe('heat and contracts reach the payout', () => {
  /** History of `days` consecutive full-clear weekdays, ending yesterday. */
  function fullClearHistory(days: number): AerieState['history'] {
    return Array.from({ length: days }, (_, i) => ({
      date: addWeekdays(TODAY, -(days - i)),
      morning: {
        completed: true,
        tier: 'full' as const,
        pointsEarned: 10,
        lumenEarned: 100,
        doneItemIds: [],
      },
      daily: null,
      dayOff: false,
    }));
  }

  it('multiplies the payout by heat built on previous full clears', () => {
    const base = createInitialState();
    const doneIds = defaultItems('morning').map((i) => i.id);

    const cold = makeStore(base);
    const hot = makeStore({
      ...base,
      history: fullClearHistory(5),
      streak: {
        ...base.streak,
        current: 5,
        longest: 5,
        lastCompletedDate: addDays(TODAY, -1),
        lastActiveDate: addDays(TODAY, -1),
      },
    });

    const a = completeReview(cold, 'morning', doneIds, { now: AT(TODAY), rng: noDrops });
    const b = completeReview(hot, 'morning', doneIds, { now: AT(TODAY), rng: noDrops });

    // Today's own full clear already counts for one day of heat, so the cold
    // city is not at 1× either — it is simply five days behind.
    expect(a.reward.heat).toBeCloseTo(1 + HEAT_PER_DAY);
    expect(b.reward.heat).toBeCloseTo(1 + 6 * HEAT_PER_DAY);
    expect(b.reward.reviewLumen).toBeGreaterThan(a.reward.reviewLumen);
  });

  it('drops heat back to a single day after a floor-only day breaks the run', () => {
    const base = createInitialState();
    const broken = [
      ...fullClearHistory(5),
      {
        date: addDays(TODAY, -1),
        morning: {
          completed: true,
          tier: 'floor' as const,
          pointsEarned: 4,
          lumenEarned: 40,
          doneItemIds: [],
        },
        daily: null,
        dayOff: false,
      },
    ];

    const store = makeStore({
      ...base,
      history: broken,
      streak: {
        ...base.streak,
        current: 6,
        longest: 6,
        lastCompletedDate: addDays(TODAY, -1),
        lastActiveDate: addDays(TODAY, -1),
      },
    });

    const outcome = completeReview(
      store,
      'morning',
      defaultItems('morning').map((i) => i.id),
      { now: AT(TODAY), rng: noDrops },
    );

    expect(outcome.reward.heat).toBeCloseTo(1 + HEAT_PER_DAY);
  });

  it('pays the contract once, on the review that settles it', () => {
    const store = makeStore();
    const contract = contractFor(TODAY);
    const morningIds = defaultItems('morning').map((i) => i.id);
    const dailyIds = defaultItems('daily').map((i) => i.id);

    const first = completeReview(store, 'morning', morningIds, {
      now: AT(TODAY),
      rng: noDrops,
    });
    const second = completeReview(store, 'daily', dailyIds, {
      now: AT(TODAY),
      rng: noDrops,
    });

    const paid = [first, second].filter((outcome) => outcome.reward.contractLumen > 0);
    expect(paid).toHaveLength(1);
    expect(paid[0]?.reward.contractId).toBe(contract.id);
  });

  it('credits achievements as they are earned, and reports them', () => {
    const store = makeStore();
    const outcome = completeReview(store, 'morning', [], {
      now: AT(TODAY),
      rng: noDrops,
    });

    expect(outcome.earnedAchievements).toContain('first-light');
    expect(store.getState().achievements).toContain('first-light');
  });

  it('does not credit the same achievement twice', () => {
    const store = makeStore();
    completeReview(store, 'morning', [], { now: AT(TODAY), rng: noDrops });
    const second = completeReview(store, 'daily', [], { now: AT(TODAY), rng: noDrops });

    expect(second.earnedAchievements).not.toContain('first-light');
    const ids = store.getState().achievements;
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ascend', () => {
  /** A save rich enough to ascend, mid-streak, with a city and history. */
  function readyToAscend(patch: Partial<AerieState> = {}): Store {
    const base = createInitialState();
    return makeStore({
      ...base,
      currency: { lumen: 50_000, runLumen: 2e9, lifetimeLumen: 2e9, cinder: 0 },
      // Active today, so the day check that now rides along with every action
      // finds nothing missed and leaves the run alone.
      streak: {
        ...base.streak,
        current: 14,
        longest: 14,
        daysOffUsed: 3,
        lastActiveDate: toDateKey(new Date()),
      },
      milestones: { ...base.milestones, totalBigMilestonesHit: 2 },
      city: {
        buildings: [
          { id: 'greenhouse', level: 12 },
          { id: 'windmill', level: 8 },
        ],
        charter: 8,
        cosmetics: { unlocked: ['teal-lanterns'], equipped: ['teal-lanterns'] },
      },
      history: [{ date: TODAY, morning: null, daily: null, dayOff: true }],
      ...patch,
    });
  }

  it('refuses while the run has not earned a whole point of Aether', () => {
    const store = makeStore();
    expect(ascend(store)).toEqual({
      ok: false,
      reason: 'Not enough lifetime Lumen to ascend yet.',
    });
  });

  it('banks Aether, climbs a band, and clears the run', () => {
    const store = readyToAscend();
    const expected = pendingAether(store.getState());

    const result = ascend(store);
    const state = store.getState();

    expect(result).toMatchObject({ ok: true, aether: expected, count: 1 });
    expect(state.ascension.aether).toBe(expected);
    expect(state.ascension.count).toBe(1);
    expect(state.city.buildings).toEqual([]);
    expect(state.currency.lumen).toBe(0);
    expect(state.currency.runLumen).toBe(0);
  });

  it('leaves everything that records real behaviour alone', () => {
    const store = readyToAscend();
    const before = store.getState();
    ascend(store);
    const after = store.getState();

    expect(after.streak).toEqual(before.streak);
    expect(after.history).toEqual(before.history);
    expect(after.milestones).toEqual(before.milestones);
    expect(after.checklists).toEqual(before.checklists);
    // Cosmetics are found, not bought back.
    expect(after.city.cosmetics).toEqual(before.city.cosmetics);
    // Lifetime earnings are the basis of every future grant, so they persist.
    expect(after.currency.lifetimeLumen).toBe(before.currency.lifetimeLumen);
  });

  it('pays nothing for ascending twice over the same earnings', () => {
    const store = readyToAscend();
    const first = ascend(store);
    expect(first.ok).toBe(true);
    expect(ascend(store).ok).toBe(false);
  });

  it('carries Lumen through with Unbroken, and rebuilds with Foothold', () => {
    const base = createInitialState();
    const store = readyToAscend({
      ascension: {
        count: 0,
        aether: 0,
        aetherEarned: 0,
        perkRanks: { 'discipline-3': 2, 'craft-4': 1 },
      },
      ...{ city: { ...base.city, buildings: [{ id: 'greenhouse', level: 12 }] } },
    });

    ascend(store);
    const state = store.getState();

    expect(state.currency.lumen).toBe(5_000); // 2 ranks × 5% of 50,000
    expect(state.city.buildings).toEqual([
      { id: 'greenhouse', level: 10 },
      { id: 'windmill', level: 10 },
      { id: 'market-stall', level: 10 },
    ]);
  });

  it('keeps perks, and their effects, across the reset', () => {
    const store = readyToAscend({
      ascension: { count: 0, aether: 0, aetherEarned: 0, perkRanks: { 'updraft-1': 2 } },
    });
    ascend(store);
    expect(store.getState().ascension.perkRanks).toEqual({ 'updraft-1': 2 });
  });
});

describe('buyPerk', () => {
  const withAether = (aether: number, perkRanks: Record<string, number> = {}): Store =>
    makeStore({ ascension: { count: 1, aether, aetherEarned: aether, perkRanks } });

  it('spends the Aether and raises the perk a rank', () => {
    const store = withAether(5);
    expect(buyPerk(store, 'updraft-1')).toEqual({ ok: true });
    expect(store.getState().ascension).toMatchObject({
      aether: 4,
      perkRanks: { 'updraft-1': 1 },
    });
  });

  it('charges more for each rank than the last', () => {
    const store = withAether(100);
    buyPerk(store, 'updraft-1');
    const afterFirst = store.getState().ascension.aether;
    buyPerk(store, 'updraft-1');
    buyPerk(store, 'updraft-1');
    const afterThird = store.getState().ascension.aether;
    expect(100 - afterFirst).toBeLessThan((afterFirst - afterThird) / 2 + 1);
    expect(store.getState().ascension.perkRanks['updraft-1']).toBe(3);
  });

  it('refuses without the prerequisite rank', () => {
    const store = withAether(99, { 'updraft-1': 1 });
    expect(buyPerk(store, 'updraft-2')).toEqual({
      ok: false,
      reason: 'Rising Thermals needs rank 3 first.',
    });
  });

  it('refuses without the Aether, and never half-buys', () => {
    const store = withAether(0);
    expect(buyPerk(store, 'updraft-1')).toEqual({
      ok: false,
      reason: 'Not enough Aether.',
    });
    expect(store.getState().ascension.perkRanks).toEqual({});
  });

  it('will not raise a perk past its highest rank', () => {
    const store = withAether(9999, { 'ledger-1': 5 });
    expect(buyPerk(store, 'ledger-1')).toEqual({
      ok: false,
      reason: 'Already at its highest rank.',
    });
    expect(store.getState().ascension.aether).toBe(9999);
  });
});

describe('perk effects reach the payout', () => {
  it('pays more for the same review with an output perk bought', () => {
    const base = createInitialState();
    const city = { ...base.city, buildings: [{ id: 'greenhouse', level: 10 }] };
    const doneIds = defaultItems('morning').map((i) => i.id);

    const plain = makeStore({ ...base, city });
    const perked = makeStore({
      ...base,
      city,
      ascension: {
        count: 1,
        aether: 0,
        aetherEarned: 4,
        perkRanks: { 'updraft-1': 1, 'ledger-1': 1 },
      },
    });

    const a = completeReview(plain, 'morning', doneIds, { now: AT(TODAY), rng: noDrops });
    const b = completeReview(perked, 'morning', doneIds, {
      now: AT(TODAY),
      rng: noDrops,
    });

    // Within a Lumen: both sides round once, at different points in the sum.
    expect(b.reward.passiveLumen).toBeCloseTo(a.reward.passiveLumen * 1.15, -0.5);
    expect(b.reward.reviewLumen).toBeGreaterThan(a.reward.reviewLumen);
  });

  it('discounts buildings with a Craft perk', () => {
    const full = makeStore({
      currency: { lumen: 1e9, runLumen: 0, lifetimeLumen: 0, cinder: 0 },
    });
    const discounted = makeStore({
      currency: { lumen: 1e9, runLumen: 0, lifetimeLumen: 0, cinder: 0 },
      ascension: { count: 1, aether: 0, aetherEarned: 2, perkRanks: { 'craft-1': 1 } },
    });

    const a = buyBuilding(full, 'greenhouse');
    const b = buyBuilding(discounted, 'greenhouse');

    expect(a.ok && b.ok && b.spent).toBeLessThan(a.ok ? a.spent : 0);
  });
});

describe('checklist editing', () => {
  it('saves an edited list, trimming and clamping what it is given', () => {
    const store = makeStore();
    const result = saveChecklist(store, 'morning', [
      {
        id: 'stretch',
        label: '  Stretch  ',
        hint: '  Two minutes  ',
        points: 40,
        core: true,
      },
      { label: 'Water the plants', points: 1.6, core: false },
      { label: '   ', points: 3, core: true },
    ]);

    expect(result.ok).toBe(true);
    expect(store.getState().checklists.morning).toEqual([
      { id: 'stretch', label: 'Stretch', points: 10, core: true, hint: 'Two minutes' },
      { id: 'water-the-plants', label: 'Water the plants', points: 2, core: false },
    ]);
    // The other routine is left alone.
    expect(store.getState().checklists.daily).toEqual(defaultItems('daily'));
  });

  it('refuses to leave a routine with nothing in it', () => {
    const store = makeStore();
    expect(saveChecklist(store, 'daily', [])).toEqual({
      ok: false,
      reason: 'A review needs at least one item.',
    });
    expect(store.getState().checklists.daily).toEqual(defaultItems('daily'));
  });

  it('scores the next review against the edited list', () => {
    const store = makeStore();
    saveChecklist(store, 'morning', [
      { label: 'Stretch', points: 2, core: true },
      { label: 'Read', points: 3, core: false },
    ]);

    const floor = completeReview(store, 'morning', ['stretch'], {
      now: AT(TODAY),
      rng: noDrops,
    });
    expect(floor.score.tier).toBe('floor');
    expect(floor.score.basePoints).toBe(2);
    expect(floor.score.skippedItemIds).toEqual(['read']);
  });

  it('puts the shipped list back on reset', () => {
    const store = makeStore();
    saveChecklist(store, 'morning', [{ label: 'Only this', points: 1, core: true }]);
    resetChecklist(store, 'morning');
    expect(store.getState().checklists.morning).toEqual(defaultItems('morning'));
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
    const store = makeStore({
      currency: { lumen: 10_000, runLumen: 10_000, lifetimeLumen: 10_000, cinder: 0 },
    });
    const first = buildingCost(greenhouse, 0);
    const second = buildingCost(greenhouse, 1);

    expect(buyBuilding(store, 'greenhouse').ok).toBe(true);
    expect(store.getState().city.buildings).toEqual([{ id: 'greenhouse', level: 1 }]);
    expect(store.getState().currency.lumen).toBe(10_000 - first);

    expect(buyBuilding(store, 'greenhouse').ok).toBe(true);
    expect(store.getState().city.buildings).toEqual([{ id: 'greenhouse', level: 2 }]);
    expect(store.getState().currency.lumen).toBe(10_000 - first - second);
    expect(second).toBeGreaterThan(first);
  });

  it('buys ten levels for the same price as ten single purchases', () => {
    const bulk = makeStore({
      currency: { lumen: 10_000, runLumen: 10_000, lifetimeLumen: 10_000, cinder: 0 },
    });
    const single = makeStore({
      currency: { lumen: 10_000, runLumen: 10_000, lifetimeLumen: 10_000, cinder: 0 },
    });

    const result = buyBuilding(bulk, 'greenhouse', 10);
    for (let i = 0; i < 10; i += 1) buyBuilding(single, 'greenhouse');

    expect(result).toMatchObject({ ok: true, levels: 10, newLevel: 10 });
    expect(bulk.getState().currency.lumen).toBe(single.getState().currency.lumen);
  });

  it('a max buy spends what it can and leaves the rest', () => {
    const store = makeStore({
      currency: { lumen: 1_000, runLumen: 1_000, lifetimeLumen: 1_000, cinder: 0 },
    });
    const result = buyBuilding(store, 'greenhouse', 'max');

    expect(result.ok).toBe(true);
    expect(store.getState().currency.lumen).toBeGreaterThanOrEqual(0);
    // Whatever it bought, it could not have afforded one more level.
    expect(buyBuilding(store, 'greenhouse')).toEqual({
      ok: false,
      reason: 'Not enough Lumen.',
    });
  });

  it('stops upgrading at the level ceiling', () => {
    const store = makeStore({
      currency: {
        lumen: Number.MAX_SAFE_INTEGER,
        runLumen: 0,
        lifetimeLumen: 0,
        cinder: 0,
      },
      city: {
        buildings: [{ id: 'greenhouse', level: BUILDING_MAX_LEVEL }],
        charter: 8,
        cosmetics: { unlocked: [], equipped: [] },
      },
    });
    expect(buyBuilding(store, 'greenhouse')).toEqual({
      ok: false,
      reason: 'Built as high as it goes.',
    });
  });

  it('refuses a level the charter has not chartered, and says so', () => {
    const store = makeStore({
      currency: {
        lumen: Number.MAX_SAFE_INTEGER,
        runLumen: 0,
        lifetimeLumen: 0,
        cinder: 0,
      },
      city: {
        buildings: [{ id: 'greenhouse', level: buildingCeiling(1) }],
        charter: 1,
        cosmetics: { unlocked: [], equipped: [] },
      },
    });
    const result = buyBuilding(store, 'greenhouse');
    expect(result.ok).toBe(false);
    // Not "not enough Lumen" — the city is rich. Saying so would send a player
    // off to earn money that changes nothing.
    expect(result.ok === false && result.reason).toContain('charter');
  });

  it('buys every level up to the ceiling and then stops', () => {
    const store = makeStore({
      currency: {
        lumen: Number.MAX_SAFE_INTEGER,
        runLumen: 0,
        lifetimeLumen: 0,
        cinder: 0,
      },
      city: { buildings: [], charter: 1, cosmetics: { unlocked: [], equipped: [] } },
    });
    buyBuilding(store, 'greenhouse', 'max');
    expect(store.getState().city.buildings[0]?.level).toBe(buildingCeiling(1));
  });
});

describe('the charter', () => {
  const wide = (level: number) =>
    ['greenhouse', 'windmill', 'market-stall', 'lighthouse'].map((id) => ({ id, level }));

  it('refuses a charter the city is not broad enough for', () => {
    const store = makeStore({
      currency: {
        lumen: Number.MAX_SAFE_INTEGER,
        runLumen: 0,
        lifetimeLumen: 0,
        cinder: 0,
      },
      city: {
        buildings: [{ id: 'greenhouse', level: 25 }],
        charter: 1,
        cosmetics: { unlocked: [], equipped: [] },
      },
    });
    const result = buyCharter(store);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('kinds of building');
    expect(store.getState().city.charter).toBe(1);
  });

  it('raises the ceiling once the city has gone wide enough', () => {
    const store = makeStore({
      currency: {
        lumen: Number.MAX_SAFE_INTEGER,
        runLumen: 0,
        lifetimeLumen: 0,
        cinder: 0,
      },
      city: {
        buildings: wide(25),
        charter: 1,
        cosmetics: { unlocked: [], equipped: [] },
      },
    });
    const result = buyCharter(store);
    expect(result.ok).toBe(true);
    expect(store.getState().city.charter).toBe(2);
    expect(result.ok && result.ceiling).toBe(buildingCeiling(2));

    // And the building that was stuck a moment ago can move again.
    expect(buyBuilding(store, 'greenhouse').ok).toBe(true);
  });

  it('charges for it', () => {
    const store = makeStore({
      currency: { lumen: 100_000_000, runLumen: 0, lifetimeLumen: 0, cinder: 0 },
      city: {
        buildings: wide(25),
        charter: 1,
        cosmetics: { unlocked: [], equipped: [] },
      },
    });
    const before = store.getState().currency.lumen;
    const result = buyCharter(store);
    expect(result.ok).toBe(true);
    expect(store.getState().currency.lumen).toBe(before - (result.ok ? result.spent : 0));
  });

  it('refuses when the breadth is there but the Lumen is not', () => {
    const store = makeStore({
      currency: { lumen: 0, runLumen: 0, lifetimeLumen: 0, cinder: 0 },
      city: {
        buildings: wide(25),
        charter: 1,
        cosmetics: { unlocked: [], equipped: [] },
      },
    });
    expect(buyCharter(store)).toEqual({ ok: false, reason: 'Not enough Lumen.' });
  });

  it('has nothing left to sell at the last charter', () => {
    const store = makeStore({
      currency: {
        lumen: Number.MAX_SAFE_INTEGER,
        runLumen: 0,
        lifetimeLumen: 0,
        cinder: 0,
      },
      city: {
        buildings: wide(200),
        charter: CHARTER_MAX_LEVEL,
        cosmetics: { unlocked: [], equipped: [] },
      },
    });
    expect(buyCharter(store).ok).toBe(false);
  });

  // The charter is what the run earned, not something that survives it — that
  // is what perks are for.
  it('resets with the city when it ascends', () => {
    const store = makeStore({
      currency: { lumen: 0, runLumen: 0, lifetimeLumen: 1e12, cinder: 0 },
      city: {
        buildings: wide(120),
        charter: 6,
        cosmetics: { unlocked: [], equipped: [] },
      },
    });
    expect(ascend(store).ok).toBe(true);
    expect(store.getState().city.charter).toBe(1);
  });
});

describe('cosmetics', () => {
  it('buys a cosmetic, equips it, and swaps out the one in its slot', () => {
    const store = makeStore({
      currency: { lumen: 5_000, runLumen: 5_000, lifetimeLumen: 5_000, cinder: 0 },
    });

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

describe('collectVault', () => {
  const IN_WINDOW = new Date(2026, 6, 21, 8, 15);
  const SHUT = new Date(2026, 6, 21, 11, 0);

  /** A city with something in it, accruing from midnight. */
  function vaultStore(): Store {
    const base = createInitialState(new Date(2026, 6, 21));
    return createStore({
      ...base,
      city: { ...base.city, buildings: [{ id: 'greenhouse', level: 40 }] },
      vault: { ...base.vault, accruedThrough: new Date(2026, 6, 21).getTime() },
    });
  }

  it('refuses outside a window, however full the vault is', () => {
    const store = vaultStore();
    syncVault(store, SHUT);
    expect(store.getState().vault.lumen).toBeGreaterThan(0);

    const result = collectVault(store, SHUT);
    expect(result.ok).toBe(false);
    expect(store.getState().currency.lumen).toBe(0);
    // ...and nothing was quietly drained on the way past.
    expect(store.getState().vault.lumen).toBeGreaterThan(0);
  });

  it('pays out inside a window and empties the vault exactly once', () => {
    const store = vaultStore();
    const collected = collectVault(store, IN_WINDOW);
    expect(collected.ok).toBe(true);

    const paid = collected.ok ? collected.lumen : 0;
    expect(paid).toBeGreaterThan(0);
    expect(store.getState().currency.lumen).toBe(paid);
    expect(store.getState().currency.lifetimeLumen).toBe(paid);
    expect(store.getState().vault.lumen).toBe(0);
    expect(store.getState().vault.lifetimeCollected).toBe(paid);

    // Second attempt in the same window pays nothing.
    const again = collectVault(store, new Date(2026, 6, 21, 8, 45));
    expect(again.ok).toBe(false);
    expect(store.getState().currency.lumen).toBe(paid);
  });

  it('opens again at the afternoon window', () => {
    const store = vaultStore();
    expect(collectVault(store, IN_WINDOW).ok).toBe(true);
    const afternoon = collectVault(store, new Date(2026, 6, 21, 16, 30));
    expect(afternoon.ok).toBe(true);
  });

  it('does not pay the city output twice — the chest no longer contains it', () => {
    const store = vaultStore();
    const outcome = completeReview(store, 'morning', [], {
      now: new Date(2026, 6, 21, 8, 5),
      rng: noDrops,
    });
    const output = cityOutput([{ id: 'greenhouse', level: 40 }]);
    expect(outcome.reward.passiveLumen).toBe(output);
    expect(outcome.reward.totalLumen).toBeLessThan(output);
  });
});

describe('cinder and research', () => {
  const fullMorning = () => defaultItems('morning').map((i) => i.id);
  const fullDaily = () => defaultItems('daily').map((i) => i.id);
  const coreDaily = () =>
    defaultItems('daily')
      .filter((i) => i.core)
      .map((i) => i.id);

  it('pays Cinder for a full clear and nothing for a floor pass', () => {
    const full = makeStore();
    completeReview(full, 'morning', fullMorning(), { now: AT(TODAY), rng: noDrops });
    expect(full.getState().currency.cinder).toBeGreaterThan(0);

    const floor = makeStore();
    completeReview(floor, 'daily', coreDaily(), { now: AT(TODAY), rng: noDrops });
    expect(floor.getState().currency.cinder).toBe(0);
  });

  it('adds the perfect-day bonus on the second full clear of a day', () => {
    const store = makeStore();
    const first = completeReview(store, 'morning', fullMorning(), {
      now: AT(TODAY),
      rng: noDrops,
    });
    const afterFirst = store.getState().currency.cinder;
    const second = completeReview(store, 'daily', fullDaily(), {
      now: AT(TODAY),
      rng: noDrops,
    });
    // The second clear is worth more than the first, by the perfect-day bonus.
    expect(second.cinderEarned).toBeGreaterThan(first.cinderEarned);
    expect(store.getState().currency.cinder).toBe(afterFirst + second.cinderEarned);
  });

  it('spends Cinder on research, honouring prerequisites and price', () => {
    const store = makeStore({
      currency: { lumen: 0, runLumen: 0, lifetimeLumen: 0, cinder: 12 },
    });

    // deep-2 is gated behind deep-1.
    expect(buyResearch(store, 'deep-2')).toEqual({
      ok: false,
      reason: 'Deeper Vault comes first.',
    });

    expect(buyResearch(store, 'deep-1').ok).toBe(true);
    expect(store.getState().research).toContain('deep-1');
    expect(store.getState().currency.cinder).toBe(2);

    // Now too poor for deep-2 (45).
    expect(buyResearch(store, 'deep-2')).toEqual({
      ok: false,
      reason: 'Not enough Cinder.',
    });
    // ...and can't re-buy what's owned.
    expect(buyResearch(store, 'deep-1')).toEqual({
      ok: false,
      reason: 'Already researched.',
    });
  });

  it('keeps research and Cinder through an ascension', () => {
    const base = createInitialState();
    const store = makeStore({
      ...base,
      currency: { ...base.currency, lumen: 5, lifetimeLumen: 1e9, cinder: 30 },
      research: ['deep-1'],
    });
    expect(ascend(store).ok).toBe(true);
    expect(store.getState().research).toEqual(['deep-1']);
    expect(store.getState().currency.cinder).toBe(30);
  });

  it('lets Vault research widen the collection window', () => {
    // Wider Doors (doors-1) adds 30 minutes, so 09:15 is still inside the
    // morning window where it would otherwise be shut.
    const base = createInitialState(new Date(2026, 6, 21));
    const store = createStore({
      ...base,
      research: ['doors-1'],
      city: { ...base.city, buildings: [{ id: 'greenhouse', level: 40 }] },
      vault: { ...base.vault, accruedThrough: new Date(2026, 6, 21).getTime() },
    });
    expect(collectVault(store, new Date(2026, 6, 21, 9, 15)).ok).toBe(true);
  });
});

describe('streak wards', () => {
  it('sells a ward for Cinder, up to the number that can be held', () => {
    const store = makeStore({
      currency: { lumen: 0, runLumen: 0, lifetimeLumen: 0, cinder: 100 },
    });
    expect(buyWard(store, AT(TODAY))).toEqual({ ok: true });
    expect(store.getState().streak.wards).toBe(1);
    expect(store.getState().currency.cinder).toBe(100 - WARD_CINDER_COST);
    expect(buyWard(store, AT(TODAY))).toEqual({
      ok: false,
      reason: 'You already hold a ward.',
    });
  });

  it('refuses without the Cinder', () => {
    const store = makeStore();
    expect(buyWard(store, AT(TODAY))).toEqual({
      ok: false,
      reason: 'Not enough Cinder.',
    });
  });

  it('is spent by the day check that runs on the vault timer', () => {
    // Last active the Friday before; Monday was missed; the tab is still open
    // on Tuesday. The timer's sync must notice and spend the ward.
    const friday = addDays(TODAY, -4);
    const base = createInitialState();
    const store = makeStore({
      streak: {
        ...base.streak,
        current: 8,
        longest: 8,
        lastActiveDate: friday,
        wards: 1,
      },
    });
    syncVault(store, AT(TODAY));
    expect(store.getState().streak).toMatchObject({ current: 8, wards: 0, wardsUsed: 1 });
  });
});

describe('mendStreak', () => {
  /** A 12-day run, broken this morning by a missed Monday. */
  function brokenStore(currency: { cinder?: number; aether?: number } = {}): Store {
    const friday = addDays(TODAY, -4);
    const base = createInitialState();
    const store = makeStore({
      currency: { ...base.currency, cinder: currency.cinder ?? 0 },
      ascension: { ...base.ascension, aether: currency.aether ?? 0 },
      streak: { ...base.streak, current: 12, longest: 12, lastActiveDate: friday },
    });
    syncVault(store, AT(TODAY));
    return store;
  }

  it('restores the run for Cinder', () => {
    const store = brokenStore({ cinder: 500 });
    expect(store.getState().streak.current).toBe(0);

    const result = mendStreak(store, 'cinder', AT(TODAY));
    expect(result).toEqual({ ok: true, streak: 12 });
    const state = store.getState();
    expect(state.streak.current).toBe(12);
    expect(state.streak.broken).toBeNull();
    expect(state.currency.cinder).toBeLessThan(500);
    expect(state.achievements).toContain('mended');
  });

  it('can be paid in Aether instead', () => {
    const store = brokenStore({ aether: 50 });
    expect(mendStreak(store, 'aether', AT(TODAY)).ok).toBe(true);
    expect(store.getState().ascension.aether).toBeLessThan(50);
  });

  it('refuses without the currency, and without a broken run', () => {
    expect(mendStreak(brokenStore(), 'cinder', AT(TODAY))).toEqual({
      ok: false,
      reason: 'Not enough Cinder.',
    });
    expect(mendStreak(makeStore(), 'cinder', AT(TODAY))).toEqual({
      ok: false,
      reason: 'There is no broken run to mend.',
    });
  });

  it('lets a review made before noticing still count toward the mended run', () => {
    const store = brokenStore({ cinder: 500 });
    const doneIds = defaultItems('morning').map((item) => item.id);
    completeReview(store, 'morning', doneIds, { now: AT(TODAY), rng: noDrops });
    expect(store.getState().streak.current).toBe(1);

    expect(mendStreak(store, 'cinder', AT(TODAY))).toEqual({ ok: true, streak: 13 });
  });
});

describe('fireKiln', () => {
  it('burns Cinder into Aether without touching what ascension has paid', () => {
    const store = makeStore({
      currency: {
        lumen: 0,
        runLumen: 0,
        lifetimeLumen: 0,
        cinder: KILN_CINDER_PER_AETHER * 3,
      },
    });
    expect(fireKiln(store, 2)).toEqual({ ok: true });
    const state = store.getState();
    expect(state.ascension.aether).toBe(2);
    expect(state.ascension.aetherEarned).toBe(0);
    expect(state.currency.cinder).toBe(KILN_CINDER_PER_AETHER);
  });

  it('refuses a batch it cannot pay for', () => {
    const store = makeStore();
    expect(fireKiln(store)).toEqual({ ok: false, reason: 'Not enough Cinder.' });
  });
});

describe('weekly expeditions', () => {
  it('pays Cinder and Lumen on the review that finishes the week', () => {
    // Full-clear both reviews every weekday until the week's expedition lands,
    // and check it is paid once, on exactly that review.
    const monday = addDays(TODAY, -1);
    const weekly = weeklyFor(monday);
    const store = makeStore();
    const morning = defaultItems('morning').map((item) => item.id);
    const daily = defaultItems('daily').map((item) => item.id);

    let paidOn: number | null = null;
    let paidCinder = 0;
    let review = 0;
    for (let offset = 0; offset < 5; offset += 1) {
      const date = addDays(monday, offset);
      for (const [id, items] of [
        ['morning', morning],
        ['daily', daily],
      ] as const) {
        const outcome = completeReview(store, id, items, { now: AT(date), rng: noDrops });
        if (outcome.reward.weeklyId) {
          expect(paidOn).toBeNull();
          paidOn = review;
          paidCinder = outcome.weeklyCinder;
          expect(outcome.reward.weeklyLumen).toBeGreaterThan(0);
          expect(outcome.reward.totalLumen).toBeGreaterThanOrEqual(
            outcome.reward.weeklyLumen,
          );
        }
        review += 1;
      }
    }

    expect(paidOn).not.toBeNull();
    expect(paidCinder).toBe(getWeekly(weekly.id)!.cinder);
  });
});
