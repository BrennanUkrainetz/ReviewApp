import { describe, expect, it } from 'vitest';
import { ALTITUDE_BANDS, bandFor, MIN_ASCENSION_AETHER } from '@/config/ascension';
import { getPerk, perkRankCost, PERKS } from '@/config/perks';
import { createInitialState } from '@/state/defaults';
import type { AerieState } from '@/state/types';
import {
  canAscend,
  lumenForNextAether,
  modsFor,
  modsFromPerks,
  NO_MODS,
  pendingAether,
  perkStatus,
  totalAetherFor,
  totalPerkRanks,
} from './ascension';

function stateWith(patch: {
  lifetimeLumen?: number;
  aetherEarned?: number;
  aether?: number;
  perkRanks?: Record<string, number>;
}): AerieState {
  const base = createInitialState();
  return {
    ...base,
    currency: { ...base.currency, lifetimeLumen: patch.lifetimeLumen ?? 0 },
    ascension: {
      count: 0,
      aether: patch.aether ?? 0,
      aetherEarned: patch.aetherEarned ?? 0,
      perkRanks: patch.perkRanks ?? {},
    },
  };
}

describe('the perk tree', () => {
  it('only names prerequisites that exist, at ranks they can reach', () => {
    for (const perk of PERKS) {
      if (!perk.requires) continue;
      const parent = getPerk(perk.requires.id);
      expect(parent, perk.id).toBeDefined();
      if (parent?.maxRank != null) {
        expect(perk.requires.rank).toBeLessThanOrEqual(parent.maxRank);
      }
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(PERKS.map((p) => p.id)).size).toBe(PERKS.length);
  });

  it('prices every rank above the last', () => {
    for (const perk of PERKS) {
      for (let rank = 1; rank < (perk.maxRank ?? 20); rank += 1) {
        expect(perkRankCost(perk, rank), `${perk.id} r${rank}`).toBeGreaterThanOrEqual(
          perkRankCost(perk, rank - 1),
        );
      }
    }
  });

  it('keeps one perk uncapped, so Aether always has somewhere to go', () => {
    expect(PERKS.some((perk) => perk.maxRank === null)).toBe(true);
  });

  it('costs far more to finish than a single ascension pays', () => {
    // The reason for the rebalance: one long run used to clear the whole tree.
    const finite = PERKS.filter((perk) => perk.maxRank !== null).reduce((sum, perk) => {
      let total = 0;
      for (let rank = 0; rank < perk.maxRank!; rank += 1)
        total += perkRankCost(perk, rank);
      return sum + total;
    }, 0);
    expect(finite).toBeGreaterThan(totalAetherFor(1e20) * 5);
  });
});

describe('modsFromPerks', () => {
  it('is the identity with nothing bought', () => {
    expect(modsFromPerks({})).toEqual(NO_MODS);
  });

  it('applies a perk once per rank', () => {
    const factor = (getPerk('updraft-1')!.effect as { factor: number }).factor;
    expect(modsFromPerks({ 'updraft-1': 3 }).output).toBeCloseTo(factor ** 3, 10);
  });

  it('stacks different perks multiplicatively', () => {
    const one = modsFromPerks({ 'updraft-1': 2 }).output;
    const two = modsFromPerks({ 'updraft-2': 1 }).output;
    expect(modsFromPerks({ 'updraft-1': 2, 'updraft-2': 1 }).output).toBeCloseTo(
      one * two,
      10,
    );
  });

  it('adds streak-cap ranks together', () => {
    expect(modsFromPerks({ 'discipline-1': 3 }).streakCap).toBe(15);
  });

  it('counts a rank past the cap as the cap', () => {
    const cap = getPerk('ledger-1')!.maxRank!;
    expect(modsFromPerks({ 'ledger-1': cap + 5 }).review).toBeCloseTo(
      modsFromPerks({ 'ledger-1': cap }).review,
      10,
    );
  });

  it('picks the foothold step for the rank owned', () => {
    expect(modsFromPerks({ 'craft-4': 1 }).foothold).toEqual({ count: 3, level: 10 });
    expect(modsFromPerks({ 'craft-4': 3 }).foothold).toEqual({ count: 5, level: 25 });
  });

  it('reaches the mote multiplier through the full save mods too', () => {
    const state = stateWith({ perkRanks: { 'keen-eye': 2 } });
    expect(modsFor(state).research.mote).toBeGreaterThan(1);
  });

  it('ignores perks that no longer exist', () => {
    expect(modsFromPerks({ 'a-perk-that-was-renamed': 4 })).toEqual(NO_MODS);
  });
});

describe('totalAetherFor', () => {
  it('pays nothing for nothing', () => {
    expect(totalAetherFor(0)).toBe(0);
    expect(totalAetherFor(-100)).toBe(0);
    expect(totalAetherFor(1e6)).toBe(0);
  });

  it('grows with the order of magnitude, not with the Lumen itself', () => {
    // The whole point of the log: a million times richer is a few times more
    // Aether, never a million times — or even a hundred.
    const at = (lumen: number) => totalAetherFor(lumen);
    expect(at(1e10)).toBeGreaterThan(5);
    expect(at(1e16) / at(1e10)).toBeLessThan(10);
    expect(at(1e30)).toBeLessThan(500);
  });

  it('pays a little more for each order than for the one before', () => {
    const step = (exp: number) =>
      totalAetherFor(10 ** (exp + 1)) - totalAetherFor(10 ** exp);
    expect(step(20)).toBeGreaterThan(step(10));
  });

  it('never goes backwards', () => {
    let previous = 0;
    for (let exp = 5; exp <= 40; exp += 0.5) {
      const value = totalAetherFor(10 ** exp);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('pendingAether', () => {
  it('pays only the difference from what has already been granted', () => {
    const lifetime = 1e12;
    const total = totalAetherFor(lifetime);
    expect(pendingAether(stateWith({ lifetimeLumen: lifetime }))).toBe(total);
    expect(
      pendingAether(stateWith({ lifetimeLumen: lifetime, aetherEarned: total })),
    ).toBe(0);
  });

  it('cannot be farmed by ascending twice over the same earnings', () => {
    const lifetime = 1e12;
    const first = pendingAether(stateWith({ lifetimeLumen: lifetime }));
    const second = pendingAether(
      stateWith({ lifetimeLumen: lifetime, aetherEarned: first }),
    );
    expect(second).toBe(0);
  });

  it('is raised by the Distillation perk', () => {
    const plain = pendingAether(stateWith({ lifetimeLumen: 1e15 }));
    const distilled = pendingAether(
      stateWith({ lifetimeLumen: 1e15, perkRanks: { distillation: 2 } }),
    );
    expect(distilled).toBeGreaterThan(plain);
  });

  it('never goes negative if the formula is later retuned downward', () => {
    expect(pendingAether(stateWith({ lifetimeLumen: 100, aetherEarned: 500 }))).toBe(0);
  });
});

describe('canAscend', () => {
  it(`refuses a run worth fewer than ${MIN_ASCENSION_AETHER} Aether`, () => {
    expect(canAscend(stateWith({ lifetimeLumen: 0 }))).toBe(false);
    expect(canAscend(stateWith({ lifetimeLumen: 2e8 }))).toBe(false);
    expect(canAscend(stateWith({ lifetimeLumen: 1e11 }))).toBe(true);
  });
});

describe('lumenForNextAether', () => {
  it('names the lifetime at which ascending is first allowed', () => {
    const state = stateWith({ lifetimeLumen: 5e7 });
    const target = lumenForNextAether(state);
    expect(target).toBeGreaterThan(state.currency.lifetimeLumen);
    expect(canAscend(stateWith({ lifetimeLumen: target }))).toBe(true);
    expect(canAscend(stateWith({ lifetimeLumen: target * 0.98 }))).toBe(false);
  });

  it('names one more Aether once ascending is already allowed', () => {
    const state = stateWith({ lifetimeLumen: 1e13 });
    const pending = pendingAether(state);
    const target = lumenForNextAether(state);
    expect(pendingAether(stateWith({ lifetimeLumen: target }))).toBe(pending + 1);
  });
});

describe('perkStatus', () => {
  const ascension = (patch: Partial<AerieState['ascension']>) => ({
    count: 0,
    aether: 0,
    aetherEarned: 0,
    perkRanks: {},
    ...patch,
  });

  it('gates a perk behind its prerequisite rank', () => {
    const need = getPerk('updraft-2')!.requires!.rank;
    expect(
      perkStatus(
        getPerk('updraft-2')!,
        ascension({ aether: 999, perkRanks: { 'updraft-1': need - 1 } }),
      ),
    ).toBe('locked');
  });

  it('opens once the prerequisite rank is reached and the Aether is there', () => {
    const need = getPerk('updraft-2')!.requires!.rank;
    const owned = ascension({ aether: 999, perkRanks: { 'updraft-1': need } });
    expect(perkStatus(getPerk('updraft-2')!, owned)).toBe('available');
  });

  it('separates too-dear from not-yet-unlocked', () => {
    expect(perkStatus(getPerk('updraft-1')!, ascension({ aether: 0 }))).toBe(
      'unaffordable',
    );
  });

  it('prices by rank, so a perk that was affordable can become too dear', () => {
    const perk = getPerk('updraft-1')!;
    const aether = perkRankCost(perk, 0);
    expect(perkStatus(perk, ascension({ aether }))).toBe('available');
    expect(perkStatus(perk, ascension({ aether, perkRanks: { 'updraft-1': 6 } }))).toBe(
      'unaffordable',
    );
  });

  it('reports a perk at its cap as maxed', () => {
    const perk = getPerk('updraft-1')!;
    expect(
      perkStatus(
        perk,
        ascension({ aether: 1e9, perkRanks: { 'updraft-1': perk.maxRank! } }),
      ),
    ).toBe('maxed');
  });

  it('never reports an uncapped perk as maxed', () => {
    const perk = PERKS.find((entry) => entry.maxRank === null)!;
    const prereq = perk.requires ? { [perk.requires.id]: perk.requires.rank } : {};
    expect(
      perkStatus(
        perk,
        ascension({ aether: 0, perkRanks: { ...prereq, [perk.id]: 500 } }),
      ),
    ).not.toBe('maxed');
  });

  it('counts ranks across the tree', () => {
    expect(
      totalPerkRanks(ascension({ perkRanks: { 'updraft-1': 3, 'ledger-1': 2 } })),
    ).toBe(5);
  });
});

describe('altitude bands', () => {
  it('starts on the ground band with no tint', () => {
    expect(bandFor(0).strength).toBe(0);
  });

  it('holds at the last band rather than running off the end', () => {
    const last = ALTITUDE_BANDS[ALTITUDE_BANDS.length - 1];
    expect(bandFor(999)).toBe(last);
    expect(bandFor(-5)).toBe(ALTITUDE_BANDS[0]);
  });
});
