import { describe, expect, it } from 'vitest';
import { BUILDINGS, getBuilding } from '@/config/shop';
import { BUILDING_MAX_LEVEL, BUILDING_MILESTONE_INTERVAL } from '@/config/tuning';
import type { OwnedBuilding } from '@/state/types';
import {
  affordableLevels,
  bestBuy,
  buildingCost,
  bulkCost,
  cityOutput,
  districtMultiplier,
  levelMap,
  marginalOutput,
  milestoneMultiplier,
  nextLockedBuilding,
  nextMilestone,
  paybackDays,
  revealedBuildings,
  synergyMultiplier,
} from './economy';

const greenhouse = getBuilding('greenhouse')!;
const windmill = getBuilding('windmill')!;

describe('the building ladder', () => {
  it('is ordered cheapest first', () => {
    const costs = BUILDINGS.map((def) => def.baseCost);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });

  it('keeps every tier on the same payback period, so none is a trap', () => {
    // The balance note in config/shop.ts promises ~2.5 review days to break
    // even. A tier that drifted far off that would either be an obvious skip
    // or an obvious dominant buy.
    for (const def of BUILDINGS) {
      const payback = def.baseCost / def.incomePerLevel;
      expect(payback).toBeGreaterThan(2);
      expect(payback).toBeLessThan(3.2);
    }
  });

  it('only names synergy partners that exist and sit lower on the ladder', () => {
    const index = new Map(BUILDINGS.map((def, i) => [def.id, i]));
    for (const [i, def] of BUILDINGS.entries()) {
      if (!def.synergy) continue;
      const partner = index.get(def.synergy.from);
      expect(partner).toBeDefined();
      expect(partner).toBeLessThan(i);
    }
  });
});

describe('buildingCost', () => {
  it('grows with each level already owned', () => {
    expect(buildingCost(greenhouse, 0)).toBe(greenhouse.baseCost);
    expect(buildingCost(greenhouse, 1)).toBeGreaterThan(buildingCost(greenhouse, 0));
    expect(buildingCost(greenhouse, 20)).toBeGreaterThan(buildingCost(greenhouse, 10));
  });
});

describe('bulkCost', () => {
  it('costs exactly what buying the same levels one at a time costs', () => {
    let oneByOne = 0;
    for (let level = 3; level < 3 + 12; level += 1) {
      oneByOne += buildingCost(greenhouse, level);
    }
    expect(bulkCost(greenhouse, 3, 12)).toBe(oneByOne);
  });

  it('is free to buy nothing', () => {
    expect(bulkCost(greenhouse, 0, 0)).toBe(0);
    expect(bulkCost(greenhouse, 0, -5)).toBe(0);
  });
});

describe('affordableLevels', () => {
  it('never quotes a price the balance cannot cover', () => {
    for (const lumen of [0, 19, 20, 21, 500, 12_345, 9_999_999]) {
      const count = affordableLevels(greenhouse, 0, lumen);
      expect(bulkCost(greenhouse, 0, count)).toBeLessThanOrEqual(lumen);
    }
  });

  it('buys as many levels as the balance genuinely allows', () => {
    for (const lumen of [20, 500, 12_345, 9_999_999]) {
      const count = affordableLevels(greenhouse, 0, lumen);
      expect(bulkCost(greenhouse, 0, count + 1)).toBeGreaterThan(lumen);
    }
  });

  it('respects an explicit limit', () => {
    expect(affordableLevels(greenhouse, 0, 9_999_999, 10)).toBe(10);
  });

  it('stops at the level ceiling', () => {
    expect(
      affordableLevels(greenhouse, BUILDING_MAX_LEVEL, Number.MAX_SAFE_INTEGER),
    ).toBe(0);
  });

  it('buys nothing when one level is out of reach', () => {
    expect(affordableLevels(greenhouse, 0, greenhouse.baseCost - 1)).toBe(0);
  });
});

describe('milestoneMultiplier', () => {
  it('doubles at every interval and holds between them', () => {
    expect(milestoneMultiplier(0)).toBe(1);
    expect(milestoneMultiplier(9)).toBe(1);
    expect(milestoneMultiplier(10)).toBe(2);
    expect(milestoneMultiplier(19)).toBe(2);
    expect(milestoneMultiplier(20)).toBe(4);
    expect(milestoneMultiplier(100)).toBe(2 ** 10);
  });

  it('points at the next threshold until there are none left', () => {
    expect(nextMilestone(0)).toBe(BUILDING_MILESTONE_INTERVAL);
    expect(nextMilestone(BUILDING_MAX_LEVEL)).toBeNull();
  });

  // The whole point of the interval. At the old six scattered thresholds a
  // level-66 building took three hundred review days to pay for itself, which
  // made every tier below the frontier a trap rather than a choice.
  it('keeps a deeply levelled building inside a sane payback', () => {
    const deep: OwnedBuilding[] = [{ id: 'greenhouse', level: 66 }];
    expect(paybackDays(greenhouse, deep)).toBeLessThan(60);
  });
});

describe('payback', () => {
  // Payback is a function of level, near enough identically for every tier —
  // this is what stops any building being dominated by another, and what the
  // shop's "only cheap while it is low" copy is claiming.
  it('is near enough the same for every tier at the same level', () => {
    for (const level of [0, 25, 50, 100]) {
      const days = BUILDINGS.map((def) =>
        paybackDays(def, [{ id: def.id, level }]),
      ).filter(Number.isFinite);
      expect(Math.max(...days) / Math.min(...days)).toBeLessThan(1.2);
    }
  });

  it('is infinite for a building that cannot be raised any further', () => {
    const capped: OwnedBuilding[] = [{ id: 'greenhouse', level: BUILDING_MAX_LEVEL }];
    expect(paybackDays(greenhouse, capped)).toBe(Infinity);
  });

  it('names the shortest payback the city can actually afford', () => {
    const buildings: OwnedBuilding[] = [
      { id: 'greenhouse', level: 60 },
      { id: 'windmill', level: 1 },
    ];
    // The Windmill is far younger, so its next level is the better buy — but
    // only while there is enough Lumen to take it.
    expect(bestBuy([greenhouse, windmill], buildings, 1_000_000)?.id).toBe('windmill');
    expect(bestBuy([greenhouse, windmill], buildings, 0)).toBeNull();
  });
});

describe('synergyMultiplier', () => {
  it('is neutral for a building with no partner', () => {
    expect(synergyMultiplier(greenhouse, levelMap([]))).toBe(1);
  });

  it('scales with the partner building, not with itself', () => {
    const withPartner = levelMap([{ id: 'greenhouse', level: 10 }]);
    expect(synergyMultiplier(windmill, withPartner)).toBeCloseTo(1.1);
    expect(synergyMultiplier(windmill, levelMap([{ id: 'windmill', level: 50 }]))).toBe(
      1,
    );
  });
});

describe('cityOutput', () => {
  it('is zero for an empty city', () => {
    expect(cityOutput([])).toBe(0);
  });

  it('ignores buildings that are no longer in the catalogue', () => {
    expect(cityOutput([{ id: 'ghost-tower', level: 4 }])).toBe(0);
  });

  it('rises with every level bought', () => {
    let previous = 0;
    for (let level = 1; level <= 30; level += 1) {
      const output = cityOutput([{ id: 'greenhouse', level }]);
      expect(output).toBeGreaterThan(previous);
      previous = output;
    }
  });

  it('jumps at a milestone level by more than the level itself is worth', () => {
    const before = cityOutput([{ id: 'greenhouse', level: 9 }]);
    const at = cityOutput([{ id: 'greenhouse', level: 10 }]);
    const ordinary = cityOutput([{ id: 'greenhouse', level: 8 }]);
    expect(at - before).toBeGreaterThan(before - ordinary);
  });

  it('pays a district bonus for variety', () => {
    const spread: OwnedBuilding[] = [
      { id: 'greenhouse', level: 1 },
      { id: 'windmill', level: 1 },
    ];
    expect(districtMultiplier(levelMap(spread))).toBeCloseTo(1.04);
    expect(districtMultiplier(levelMap([]))).toBe(1);
  });
});

describe('marginalOutput', () => {
  it('reports what the next level would actually add', () => {
    const buildings: OwnedBuilding[] = [{ id: 'greenhouse', level: 4 }];
    const gain = marginalOutput(greenhouse, buildings);
    expect(gain).toBe(
      cityOutput([{ id: 'greenhouse', level: 5 }]) - cityOutput(buildings),
    );
  });

  it('includes the district bonus a brand new building would unlock', () => {
    expect(marginalOutput(windmill, [{ id: 'greenhouse', level: 1 }])).toBeGreaterThan(
      windmill.incomePerLevel,
    );
  });

  it('quotes the whole purchase when asked for several levels', () => {
    const buildings: OwnedBuilding[] = [{ id: 'greenhouse', level: 4 }];
    expect(marginalOutput(greenhouse, buildings, 10)).toBe(
      cityOutput([{ id: 'greenhouse', level: 14 }]) - cityOutput(buildings),
    );
  });

  // The whole reason the shop quotes a bulk total rather than ten times the
  // single-level figure: a run that crosses a milestone is worth more.
  it('beats ten single levels when the run crosses a milestone', () => {
    const buildings: OwnedBuilding[] = [{ id: 'greenhouse', level: 20 }];
    expect(marginalOutput(greenhouse, buildings, 10)).toBeGreaterThan(
      marginalOutput(greenhouse, buildings) * 10,
    );
  });

  it('never quotes levels past the cap', () => {
    const capped: OwnedBuilding[] = [{ id: 'greenhouse', level: BUILDING_MAX_LEVEL }];
    expect(marginalOutput(greenhouse, capped, 10)).toBe(0);
    expect(marginalOutput(greenhouse, [{ id: 'greenhouse', level: 195 }], 10)).toBe(
      cityOutput([{ id: 'greenhouse', level: BUILDING_MAX_LEVEL }]) -
        cityOutput([{ id: 'greenhouse', level: 195 }]),
    );
  });
});

describe('shop reveals', () => {
  it('shows the first tier to a city that has earned nothing', () => {
    expect(revealedBuildings([], 0).map((def) => def.id)).toEqual(['greenhouse']);
  });

  it('opens a tier once lifetime earnings come within reach of it', () => {
    const ids = revealedBuildings([], windmill.baseCost).map((def) => def.id);
    expect(ids).toContain('windmill');
    expect(ids).not.toContain('lighthouse');
  });

  it('never hides something already standing', () => {
    const ids = revealedBuildings([{ id: 'anchor-spire', level: 1 }], 0).map(
      (def) => def.id,
    );
    expect(ids).toContain('anchor-spire');
  });

  it('names exactly one locked tier as the next carrot', () => {
    expect(nextLockedBuilding([], 0)?.id).toBe('windmill');
    expect(nextLockedBuilding([], Number.MAX_SAFE_INTEGER)).toBeNull();
  });

  it('hides a high-island tier until the city has ascended into its band', () => {
    // Ample Lumen — the only thing keeping Stormspire hidden is altitude.
    const rich = Number.MAX_SAFE_INTEGER;
    expect(revealedBuildings([], rich, 0).map((def) => def.id)).not.toContain(
      'stormspire',
    );

    const atCirrus = revealedBuildings([], rich, 1).map((def) => def.id);
    expect(atCirrus).toContain('stormspire'); // Cirrus unlocks at ascension 1
    expect(atCirrus).not.toContain('heliostat'); // Stratosphere is a band higher
  });

  it('still shows a high-island tier already standing, whatever the altitude', () => {
    const ids = revealedBuildings([{ id: 'stormspire', level: 1 }], 0, 0).map(
      (def) => def.id,
    );
    expect(ids).toContain('stormspire');
  });

  it('never aims the Lumen carrot at a tier locked only by altitude', () => {
    // Rich enough to reveal every home tier; the eight above need an ascension,
    // so the shop's Lumen line has nothing left to point at.
    expect(nextLockedBuilding([], Number.MAX_SAFE_INTEGER, 0)).toBeNull();
  });
});
