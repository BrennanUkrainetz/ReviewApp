import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '@/config/shop';
import {
  BUILDING_MAX_LEVEL,
  CHARTER_LEVELS_PER_STEP,
  CHARTER_MAX_LEVEL,
  CHARTER_MIN_LEVEL,
} from '@/config/tuning';
import type { OwnedBuilding } from '@/state/types';
import {
  buildingCeiling,
  charterCost,
  charterEarnedBy,
  charterOutputMultiplier,
  charterProgress,
  charterRequirement,
  clampCharter,
  kindsAtLevel,
} from './charter';

/** `count` distinct buildings, all at `level`. */
const spread = (count: number, level: number): OwnedBuilding[] =>
  BUILDINGS.slice(0, count).map((def) => ({ id: def.id, level }));

describe('the ceiling', () => {
  it('rises a fixed step per charter and stops at the hard cap', () => {
    expect(buildingCeiling(1)).toBe(CHARTER_LEVELS_PER_STEP);
    expect(buildingCeiling(2)).toBe(CHARTER_LEVELS_PER_STEP * 2);
    expect(buildingCeiling(CHARTER_MAX_LEVEL)).toBe(BUILDING_MAX_LEVEL);
  });

  // The last charter has to reach the hard cap exactly, or there would be levels
  // the game shows on a card and no charter can ever unlock.
  it('reaches every level the game allows by the last charter', () => {
    expect(CHARTER_MAX_LEVEL * CHARTER_LEVELS_PER_STEP).toBe(BUILDING_MAX_LEVEL);
  });

  it('clamps a nonsense charter rather than trusting it', () => {
    expect(clampCharter(0)).toBe(CHARTER_MIN_LEVEL);
    expect(clampCharter(-4)).toBe(CHARTER_MIN_LEVEL);
    expect(clampCharter(99)).toBe(CHARTER_MAX_LEVEL);
    expect(clampCharter(Number.NaN)).toBe(CHARTER_MIN_LEVEL);
  });
});

describe('the output bonus', () => {
  it('is neutral at the first charter and grows after it', () => {
    expect(charterOutputMultiplier(1)).toBe(1);
    expect(charterOutputMultiplier(3)).toBeGreaterThan(charterOutputMultiplier(2));
  });
});

describe('the requirement', () => {
  it('asks for one more kind each time, at the height the last charter allowed', () => {
    expect(charterRequirement(2)).toEqual({ kinds: 3, atLevel: 25 });
    expect(charterRequirement(3)).toEqual({ kinds: 4, atLevel: 50 });
    expect(charterRequirement(CHARTER_MAX_LEVEL)).toEqual({ kinds: 9, atLevel: 175 });
  });

  it('has nothing to ask for outside the range of charters', () => {
    expect(charterRequirement(1)).toBeNull();
    expect(charterRequirement(CHARTER_MAX_LEVEL + 1)).toBeNull();
  });

  // Every charter must be satisfiable by buildings that actually exist, or the
  // ladder dead-ends at a rule nothing can meet.
  it('never asks for more kinds than the catalogue has', () => {
    for (let level = 2; level <= CHARTER_MAX_LEVEL; level += 1) {
      expect(charterRequirement(level)!.kinds).toBeLessThanOrEqual(BUILDINGS.length);
    }
  });

  it('counts only distinct buildings that are genuinely tall enough', () => {
    expect(kindsAtLevel(spread(4, 30), 25)).toBe(4);
    expect(kindsAtLevel(spread(4, 24), 25)).toBe(0);
    expect(kindsAtLevel([{ id: 'ghost-tower', level: 200 }], 25)).toBe(0);
  });
});

describe('charterProgress', () => {
  it('is not ready until the breadth is there, however much Lumen is on hand', () => {
    const thin = charterProgress(spread(2, 40), 1, 1000, Number.MAX_SAFE_INTEGER);
    expect(thin.met).toBe(false);
    expect(thin.affordable).toBe(false);
    expect(thin.standing).toBe(2);
  });

  it('is ready once the kinds are standing and the Lumen is there', () => {
    const wide = charterProgress(spread(3, 25), 1, 1000, Number.MAX_SAFE_INTEGER);
    expect(wide.met).toBe(true);
    expect(wide.affordable).toBe(true);
  });

  it('is met but unaffordable when the city is broke', () => {
    const broke = charterProgress(spread(3, 25), 1, 1_000_000, 0);
    expect(broke.met).toBe(true);
    expect(broke.affordable).toBe(false);
  });

  it('has nothing left to offer at the last charter', () => {
    const done = charterProgress(spread(20, 200), CHARTER_MAX_LEVEL, 1000);
    expect(done.next).toBeNull();
    expect(done.requirement).toBeNull();
    expect(done.met).toBe(false);
  });
});

describe('charterCost', () => {
  it('scales with the city, with a floor for the opening days', () => {
    expect(charterCost(0)).toBeGreaterThan(0);
    expect(charterCost(1e9)).toBeGreaterThan(charterCost(1e6));
  });
});

describe('charterEarnedBy', () => {
  // The rule that keeps an existing save playable: a city is never handed a
  // charter that would make its own buildings illegal.
  it('covers the tallest building standing', () => {
    expect(charterEarnedBy([])).toBe(CHARTER_MIN_LEVEL);
    expect(charterEarnedBy([{ id: 'greenhouse', level: 66 }])).toBe(3);
    expect(buildingCeiling(charterEarnedBy([{ id: 'greenhouse', level: 66 }]))).toBe(75);
    expect(charterEarnedBy([{ id: 'greenhouse', level: 200 }])).toBe(CHARTER_MAX_LEVEL);
  });

  it('is exact when a building sits right on a step', () => {
    expect(charterEarnedBy([{ id: 'greenhouse', level: 50 }])).toBe(2);
    expect(charterEarnedBy([{ id: 'greenhouse', level: 51 }])).toBe(3);
  });
});
