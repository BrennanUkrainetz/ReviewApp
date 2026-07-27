import { describe, expect, it } from 'vitest';
import { ALTITUDE_BANDS, bandFor } from '@/config/ascension';
import { getPerk, PERKS } from '@/config/perks';
import { createInitialState } from '@/state/defaults';
import type { AerieState } from '@/state/types';
import {
  canAscend,
  lumenForNextAether,
  modsFromPerks,
  NO_MODS,
  pendingAether,
  perkStatus,
  totalAetherFor,
} from './ascension';

function stateWith(patch: {
  lifetimeLumen?: number;
  aetherEarned?: number;
  aether?: number;
  perks?: string[];
}): AerieState {
  const base = createInitialState();
  return {
    ...base,
    currency: { ...base.currency, lifetimeLumen: patch.lifetimeLumen ?? 0 },
    ascension: {
      count: 0,
      aether: patch.aether ?? 0,
      aetherEarned: patch.aetherEarned ?? 0,
      perks: patch.perks ?? [],
    },
  };
}

describe('the perk tree', () => {
  it('only names prerequisites that exist', () => {
    for (const perk of PERKS) {
      if (perk.requires) expect(getPerk(perk.requires)).toBeDefined();
    }
  });

  it('never makes a perk cheaper than the one it depends on', () => {
    for (const perk of PERKS) {
      const parent = perk.requires ? getPerk(perk.requires) : null;
      if (parent) expect(perk.cost).toBeGreaterThanOrEqual(parent.cost);
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(PERKS.map((p) => p.id)).size).toBe(PERKS.length);
  });
});

describe('modsFromPerks', () => {
  it('is the identity with nothing bought', () => {
    expect(modsFromPerks([])).toEqual(NO_MODS);
  });

  it('stacks multipliers within a branch multiplicatively', () => {
    // ×1.5 then ×2 is ×3, not ×2.5 — the deep end of a branch has to be worth
    // saving for, and additive stacking would flatten it.
    expect(modsFromPerks(['updraft-1', 'updraft-2']).output).toBe(3);
  });

  it('takes the best discount rather than stacking them toward zero', () => {
    const mods = modsFromPerks(['craft-1', 'craft-2', 'craft-3']);
    expect(mods.cost).toBe(0.6);
  });

  it('adds streak-cap perks together', () => {
    expect(modsFromPerks(['discipline-1', 'discipline-2']).streakCap).toBe(30);
  });

  it('ignores perks that no longer exist', () => {
    expect(modsFromPerks(['a-perk-that-was-renamed'])).toEqual(NO_MODS);
  });
});

describe('totalAetherFor', () => {
  it('pays nothing for nothing', () => {
    expect(totalAetherFor(0)).toBe(0);
    expect(totalAetherFor(-100)).toBe(0);
  });

  it('rises with lifetime earnings, but far more slowly', () => {
    const at = (lumen: number) => totalAetherFor(lumen);
    expect(at(1e8)).toBeGreaterThan(at(1e7));
    // A thousand times richer is worth ten times the Aether, not a thousand.
    // Measured up the curve, where the floor is no longer a big share of it.
    expect(at(1e13) / at(1e10)).toBeCloseTo(10, 0);
  });

  it('never goes backwards', () => {
    let previous = 0;
    for (let exp = 5; exp <= 15; exp += 0.5) {
      const value = totalAetherFor(10 ** exp);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('pendingAether', () => {
  it('pays only the difference from what has already been granted', () => {
    const lifetime = 1e9;
    const total = totalAetherFor(lifetime);
    expect(pendingAether(stateWith({ lifetimeLumen: lifetime }))).toBe(total);
    expect(
      pendingAether(stateWith({ lifetimeLumen: lifetime, aetherEarned: total })),
    ).toBe(0);
  });

  it('cannot be farmed by ascending twice over the same earnings', () => {
    // Ascend at 1e9, then again immediately with nothing new earned.
    const lifetime = 1e9;
    const first = pendingAether(stateWith({ lifetimeLumen: lifetime }));
    const second = pendingAether(
      stateWith({ lifetimeLumen: lifetime, aetherEarned: first }),
    );
    expect(second).toBe(0);
  });

  it('never goes negative if the formula is later retuned downward', () => {
    expect(pendingAether(stateWith({ lifetimeLumen: 100, aetherEarned: 500 }))).toBe(0);
  });
});

describe('canAscend', () => {
  it('refuses a run that has not earned a whole point of Aether', () => {
    expect(canAscend(stateWith({ lifetimeLumen: 0 }))).toBe(false);
    expect(canAscend(stateWith({ lifetimeLumen: 1e9 }))).toBe(true);
  });
});

describe('lumenForNextAether', () => {
  it('names a target above where the save currently stands', () => {
    const state = stateWith({ lifetimeLumen: 5e8 });
    const target = lumenForNextAether(state);
    expect(target).toBeGreaterThan(state.currency.lifetimeLumen);
    expect(totalAetherFor(target)).toBe(totalAetherFor(5e8) + 1);
  });
});

describe('perkStatus', () => {
  const ascension = (patch: Partial<AerieState['ascension']>) => ({
    count: 0,
    aether: 0,
    aetherEarned: 0,
    perks: [],
    ...patch,
  });

  it('gates a perk behind its prerequisite', () => {
    expect(perkStatus(getPerk('updraft-2')!, ascension({ aether: 999 }))).toBe('locked');
  });

  it('opens once the prerequisite is owned and the Aether is there', () => {
    const owned = ascension({ aether: 999, perks: ['updraft-1'] });
    expect(perkStatus(getPerk('updraft-2')!, owned)).toBe('available');
  });

  it('separates too-dear from not-yet-unlocked', () => {
    expect(perkStatus(getPerk('updraft-1')!, ascension({ aether: 0 }))).toBe(
      'unaffordable',
    );
  });

  it('reports what is already learned', () => {
    expect(perkStatus(getPerk('updraft-1')!, ascension({ perks: ['updraft-1'] }))).toBe(
      'owned',
    );
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
