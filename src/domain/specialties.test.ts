import { describe, expect, it } from 'vitest';
import { BUILDINGS, getBuilding } from '@/config/shop';
import { BUILDING_MAX_LEVEL, SPECIALTY_INTERVAL } from '@/config/tuning';
import type { OwnedBuilding } from '@/state/types';
import { NO_MODS } from './ascension';
import {
  applySpecialties,
  nextSpecialtyLevel,
  specialtyMultiplies,
  specialtySteps,
  specialtyValue,
} from './specialties';

const greenhouse = getBuilding('greenhouse')!;
const windmill = getBuilding('windmill')!;

const home = BUILDINGS.filter((def) => ['main', 'west', 'east'].includes(def.island));

describe('the catalogue of specialties', () => {
  // The whole reason specialties exist: payback cannot tell the tiers apart, so
  // something else has to. Two home tiers improving the same thing would put
  // that back where it started.
  it('gives every building on the home cluster a distinct one', () => {
    const kinds = home.map((def) => def.specialty.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('gives every building in the catalogue one at all', () => {
    for (const def of BUILDINGS) {
      expect(def.specialty, def.id).toBeDefined();
      expect(def.specialty.label.length, def.id).toBeGreaterThan(0);
    }
  });

  // A multiplying specialty below 1 is a discount, above 1 a gain; either way a
  // perStep of exactly 1 would be a specialty that silently does nothing.
  it('never ships a step that does nothing', () => {
    for (const def of BUILDINGS) {
      const { kind, perStep } = def.specialty;
      if (specialtyMultiplies(kind)) expect(perStep, def.id).not.toBe(1);
      else expect(perStep, def.id).toBeGreaterThan(0);
    }
  });
});

describe('steps', () => {
  it('earns one per interval, and none before the first', () => {
    expect(specialtySteps(0)).toBe(0);
    expect(specialtySteps(SPECIALTY_INTERVAL - 1)).toBe(0);
    expect(specialtySteps(SPECIALTY_INTERVAL)).toBe(1);
    expect(specialtySteps(BUILDING_MAX_LEVEL)).toBe(
      BUILDING_MAX_LEVEL / SPECIALTY_INTERVAL,
    );
  });

  it('points at the next step until the last one is passed', () => {
    expect(nextSpecialtyLevel(0)).toBe(SPECIALTY_INTERVAL);
    expect(nextSpecialtyLevel(SPECIALTY_INTERVAL)).toBe(SPECIALTY_INTERVAL * 2);
    expect(nextSpecialtyLevel(BUILDING_MAX_LEVEL)).toBeNull();
  });

  it('reads the identity for its kind at zero steps, so a card can show it', () => {
    expect(specialtyValue(greenhouse.specialty, 0)).toBe(0);
    expect(specialtyValue(windmill.specialty, 0)).toBe(1);
  });

  it('compounds factors and accumulates addends', () => {
    // The Greenhouse pays a flat Cinder per step; the Windmill multiplies.
    expect(specialtyValue(greenhouse.specialty, SPECIALTY_INTERVAL * 2)).toBe(2);
    expect(specialtyValue(windmill.specialty, SPECIALTY_INTERVAL * 2)).toBeCloseTo(
      windmill.specialty.perStep ** 2,
    );
  });
});

describe('applySpecialties', () => {
  it('leaves mods untouched when nothing has reached its first step', () => {
    const levels: OwnedBuilding[] = [{ id: 'greenhouse', level: SPECIALTY_INTERVAL - 1 }];
    expect(applySpecialties(NO_MODS, levels)).toEqual(NO_MODS);
  });

  it('does not mutate the mods it was handed', () => {
    const before = JSON.stringify(NO_MODS);
    applySpecialties(NO_MODS, [{ id: 'greenhouse', level: BUILDING_MAX_LEVEL }]);
    expect(JSON.stringify(NO_MODS)).toBe(before);
  });

  it('pays the Greenhouse its Cinder — the reason to level it at all', () => {
    const mods = applySpecialties(NO_MODS, [
      { id: 'greenhouse', level: SPECIALTY_INTERVAL * 2 },
    ]);
    expect(mods.research.cinderFlat).toBe(2);
  });

  it('reaches the vault, the chest and the streak through the same seam', () => {
    const mods = applySpecialties(NO_MODS, [
      { id: 'windmill', level: 200 }, // vault rate
      { id: 'observatory', level: 200 }, // drop chance
      { id: 'void-anchor', level: 200 }, // streak cap
      { id: 'starforge', level: 200 }, // building cost
      { id: 'aether-well', level: 200 }, // Aether grant
      { id: 'aviary', level: 200 }, // mote charges
    ]);
    expect(mods.research.vaultRate).toBeGreaterThan(1);
    expect(mods.drop).toBeGreaterThan(0);
    expect(mods.streakCap).toBeGreaterThan(0);
    expect(mods.cost).toBeLessThan(1);
    expect(mods.aether).toBeGreaterThan(1);
    expect(mods.moteCharges).toBeGreaterThan(0);
  });

  it('ignores a building that is no longer in the catalogue', () => {
    expect(applySpecialties(NO_MODS, [{ id: 'ghost-tower', level: 200 }])).toEqual(
      NO_MODS,
    );
  });
});
