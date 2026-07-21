/**
 * Shop catalogue: buildings (a modest passive Lumen trickle) and cosmetics
 * (purely visual). Plain data — add or retune entries without touching logic.
 *
 * Passive income is deliberately small. The reviews are meant to stay the
 * dominant Lumen source; the city is momentum, not an idle game.
 */

export interface BuildingDef {
  id: string;
  name: string;
  flavor: string;
  /** Lumen per day with a completed review, at level 1. */
  incomePerLevel: number;
  baseCost: number;
  /** Each level costs `baseCost * costGrowth^(level)`. */
  costGrowth: number;
  maxLevel: number;
  /** Which island the building sits on in the city scene. */
  island: 'main' | 'east' | 'west';
  /** Position along that island's build slots (0 = leftmost). */
  slot: number;
}

export type CosmeticSlot = 'lanterns' | 'skyline' | 'companion' | 'banner';

export interface CosmeticDef {
  id: string;
  name: string;
  flavor: string;
  slot: CosmeticSlot;
  /** Lumen price in the shop. Chest drops unlock the same items for free. */
  cost: number;
  /** Relative likelihood of being the cosmetic a chest drops. */
  dropWeight: number;
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    flavor: 'Warm glass, cold altitude. Somehow the tomatoes manage.',
    incomePerLevel: 6,
    baseCost: 240,
    costGrowth: 1.8,
    maxLevel: 3,
    island: 'main',
    slot: 0,
  },
  {
    id: 'windmill',
    name: 'Windmill',
    flavor: 'There is never a shortage of wind up here.',
    incomePerLevel: 9,
    baseCost: 420,
    costGrowth: 1.8,
    maxLevel: 3,
    island: 'west',
    slot: 0,
  },
  {
    id: 'market-stall',
    name: 'Market Stall',
    flavor: 'Trades with the ground twice a week, weather permitting.',
    incomePerLevel: 12,
    baseCost: 700,
    costGrowth: 1.8,
    maxLevel: 3,
    island: 'main',
    slot: 1,
  },
  {
    id: 'lighthouse',
    name: 'Lighthouse',
    flavor: 'Marks the edge of the cloud shelf. Visible for miles.',
    incomePerLevel: 16,
    baseCost: 1100,
    costGrowth: 1.8,
    maxLevel: 3,
    island: 'east',
    slot: 0,
  },
  {
    id: 'observatory',
    name: 'Observatory',
    flavor: 'Points away from the ground, mostly.',
    incomePerLevel: 22,
    baseCost: 1800,
    costGrowth: 1.8,
    maxLevel: 3,
    island: 'east',
    slot: 1,
  },
];

export const COSMETICS: CosmeticDef[] = [
  {
    id: 'teal-lanterns',
    name: 'Teal Lanterns',
    flavor: 'Strung between the rooftops. Pale green, always lit.',
    slot: 'lanterns',
    cost: 300,
    dropWeight: 3,
  },
  {
    id: 'amber-lanterns',
    name: 'Amber Lanterns',
    flavor: 'The colour of the hour just after sunrise.',
    slot: 'lanterns',
    cost: 300,
    dropWeight: 3,
  },
  {
    id: 'rose-skyline',
    name: 'Rose Cloudbank',
    flavor: 'Tints the whole cloud shelf a slow, unhurried pink.',
    slot: 'skyline',
    cost: 450,
    dropWeight: 2,
  },
  {
    id: 'violet-skyline',
    name: 'Violet Cloudbank',
    flavor: 'Deeper clouds, for cities that keep late hours.',
    slot: 'skyline',
    cost: 450,
    dropWeight: 2,
  },
  {
    id: 'sky-whale',
    name: 'Sky Whale',
    flavor: 'Drifts past on its own schedule. Nobody has named it.',
    slot: 'companion',
    cost: 900,
    dropWeight: 1,
  },
  {
    id: 'paper-kite',
    name: 'Paper Kite',
    flavor: 'Cut loose from somewhere below. It stayed.',
    slot: 'companion',
    cost: 600,
    dropWeight: 2,
  },
  {
    id: 'harbour-banner',
    name: 'Harbour Banner',
    flavor: 'Long, split-tailed, and permanently mid-snap.',
    slot: 'banner',
    cost: 350,
    dropWeight: 2,
  },
  {
    id: 'signal-pennants',
    name: 'Signal Pennants',
    flavor: 'Spells something in a code no one up here reads.',
    slot: 'banner',
    cost: 350,
    dropWeight: 2,
  },
];

const BUILDING_BY_ID = new Map(BUILDINGS.map((building) => [building.id, building]));
const COSMETIC_BY_ID = new Map(COSMETICS.map((cosmetic) => [cosmetic.id, cosmetic]));

export function getBuilding(id: string): BuildingDef | undefined {
  return BUILDING_BY_ID.get(id);
}

export function getCosmetic(id: string): CosmeticDef | undefined {
  return COSMETIC_BY_ID.get(id);
}

/** Cost of taking a building from `currentLevel` to the next level. */
export function buildingCost(building: BuildingDef, currentLevel: number): number {
  return Math.round(building.baseCost * building.costGrowth ** currentLevel);
}
