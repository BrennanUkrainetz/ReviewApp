/**
 * Research: folding owned Cinder nodes into mods, the Cinder a review earns,
 * and where each node stands for a save.
 */
import { describe, expect, it } from 'vitest';
import { RESEARCH } from '@/config/research';
import {
  CINDER_HEAT_BONUSES,
  CINDER_PERFECT_DAY_BONUS,
  CINDER_PER_FULL_CLEAR,
  VAULT_IDLE_SHARE,
  VAULT_WORK_MULTIPLIER,
} from '@/config/tuning';
import { createInitialState } from '@/state/defaults';
import type { AerieState } from '@/state/types';
import {
  cinderFor,
  NO_RESEARCH,
  nextResearch,
  researchModsFrom,
  researchStatus,
  windowsFor,
} from './research';

const withResearch = (ids: string[], cinder = 9999): AerieState => ({
  ...createInitialState(),
  research: ids,
  currency: { ...createInitialState().currency, cinder },
});

describe('research config', () => {
  it('has unique ids', () => {
    expect(new Set(RESEARCH.map((r) => r.id)).size).toBe(RESEARCH.length);
  });

  it('only requires nodes that exist', () => {
    const ids = new Set(RESEARCH.map((r) => r.id));
    for (const entry of RESEARCH) {
      if (entry.requires) expect(ids.has(entry.requires)).toBe(true);
    }
  });
});

describe('researchModsFrom', () => {
  it('is the identity with nothing bought', () => {
    expect(researchModsFrom([])).toEqual(NO_RESEARCH);
  });

  it('takes the best tier for capacity, not the sum', () => {
    // deep-1 is 1.6×, deep-2 is 2.6×. Owning both gives 2.6×, not 4.2×.
    expect(researchModsFrom(['deep-1', 'deep-2']).vaultCap).toBe(2.6);
  });

  it('stacks rate multipliers', () => {
    // draught-1 (1.15×) and draught-2 (1.25×) compound.
    expect(researchModsFrom(['draught-1', 'draught-2']).vaultRate).toBeCloseTo(
      1.15 * 1.25,
    );
  });

  it('replaces the work and idle rates with the best owned', () => {
    expect(researchModsFrom(['shift-1']).workRate).toBe(3.5);
    expect(researchModsFrom(['shift-1', 'shift-2']).workRate).toBe(4);
    expect(researchModsFrom(['standing-1']).idleShare).toBe(0.25);
    expect(researchModsFrom(['standing-1', 'standing-2']).idleShare).toBe(0.4);
  });

  it('adds ward slots and takes the best mend discount', () => {
    expect(researchModsFrom(['watch-1', 'watch-2']).wardSlots).toBe(2);
    expect(researchModsFrom(['mending']).mendCost).toBe(0.5);
  });

  it('ignores ids that no longer exist', () => {
    expect(researchModsFrom(['a-node-that-was-renamed'])).toEqual(NO_RESEARCH);
  });
});

describe('windowsFor', () => {
  it('lengthens every window by the bought minutes', () => {
    const windows = windowsFor(researchModsFrom(['doors-1']));
    for (const window of windows) {
      expect(window.endMinutes - window.startMinutes).toBeGreaterThanOrEqual(60);
    }
  });

  it('adds the midday window in clock order', () => {
    const ids = windowsFor(researchModsFrom(['bell'])).map((w) => w.id);
    expect(ids).toContain('midday');
    expect(ids).toEqual(['morning', 'midday', 'afternoon']);
  });
});

describe('cinderFor', () => {
  it('pays nothing for a floor or partial pass', () => {
    expect(cinderFor('floor', false, 0)).toBe(0);
    expect(cinderFor('none', false, 0)).toBe(0);
  });

  it('pays the base for a lone full clear', () => {
    expect(cinderFor('full', false, 0)).toBe(CINDER_PER_FULL_CLEAR);
  });

  it('adds the perfect-day bonus on the second full clear', () => {
    expect(cinderFor('full', true, 0)).toBe(
      CINDER_PER_FULL_CLEAR + CINDER_PERFECT_DAY_BONUS,
    );
  });

  it('steps up with heat, taking the highest matching step', () => {
    const top = CINDER_HEAT_BONUSES.at(-1)!;
    expect(cinderFor('full', false, top.days)).toBe(CINDER_PER_FULL_CLEAR + top.bonus);
    expect(cinderFor('full', false, top.days + 100)).toBe(
      CINDER_PER_FULL_CLEAR + top.bonus,
    );
  });

  it('is multiplied by the Cinder research', () => {
    const mods = researchModsFrom(['hot-1']); // 1.5×
    expect(cinderFor('full', false, 0, mods)).toBe(
      Math.round(CINDER_PER_FULL_CLEAR * 1.5),
    );
  });
});

describe('researchStatus', () => {
  it('reports owned, available, unaffordable and locked', () => {
    expect(
      researchStatus(
        RESEARCH.find((r) => r.id === 'deep-1')!,
        withResearch(['deep-1']),
      ),
    ).toBe('owned');
    expect(
      researchStatus(
        RESEARCH.find((r) => r.id === 'deep-1')!,
        withResearch([], 10),
      ),
    ).toBe('available');
    expect(
      researchStatus(
        RESEARCH.find((r) => r.id === 'deep-1')!,
        withResearch([], 0),
      ),
    ).toBe('unaffordable');
    // deep-2 needs deep-1 first.
    expect(
      researchStatus(
        RESEARCH.find((r) => r.id === 'deep-2')!,
        withResearch([], 9999),
      ),
    ).toBe('locked');
  });

  it('offers the cheapest reachable node as next', () => {
    const next = nextResearch(withResearch([], 9999));
    expect(next).not.toBeNull();
    // Nothing gated should be offered.
    expect(next?.requires).toBeUndefined();
  });

  it('uses the default rates when nothing is owned', () => {
    expect(NO_RESEARCH.workRate).toBe(VAULT_WORK_MULTIPLIER);
    expect(NO_RESEARCH.idleShare).toBe(VAULT_IDLE_SHARE);
  });
});
