/**
 * The city's economy: what a building costs, what it pays, and what the whole
 * cluster produces on a review day.
 *
 * Pure functions over `OwnedBuilding[]` — no state, no storage, no DOM. The
 * data these read lives in `config/shop.ts` and `config/tuning.ts`; the balance
 * rationale is written up at the top of `config/shop.ts`.
 */
import { BUILDINGS, getBuilding, type BuildingDef } from '@/config/shop';
import {
  BUILDING_COST_GROWTH,
  BUILDING_MAX_LEVEL,
  BUILDING_MILESTONE_LEVELS,
  BUILDING_MILESTONE_MULTIPLIER,
  BUILDING_REVEAL_FRACTION,
  DISTRICT_BONUS_PER_BUILDING,
} from '@/config/tuning';
import type { OwnedBuilding } from '@/state/types';
import { NO_MODS, type Mods } from './ascension';

/** Levels, keyed by building id. The shape every calculation here works from. */
export type LevelMap = ReadonlyMap<string, number>;

export function levelMap(buildings: readonly OwnedBuilding[]): LevelMap {
  return new Map(buildings.map((owned) => [owned.id, owned.level]));
}

/* ------------------------------------------------------------------ */
/* Cost                                                                */
/* ------------------------------------------------------------------ */

/** Cost of taking a building from `currentLevel` to the next level. */
export function buildingCost(
  def: BuildingDef,
  currentLevel: number,
  mods: Mods = NO_MODS,
): number {
  return Math.ceil(def.baseCost * BUILDING_COST_GROWTH ** currentLevel * mods.cost);
}

/**
 * Cost of buying `count` levels in one go, starting from `currentLevel`.
 *
 * Summed level by level rather than in closed form. The geometric series is
 * tempting and slightly cheaper, but each individual level rounds up, so the
 * series answer drifts a few Lumen under the sum — enough that buying ×10
 * would cost less than ten ×1s and a player could notice. `count` never
 * exceeds `BUILDING_MAX_LEVEL`, so the loop costs nothing worth saving.
 */
export function bulkCost(
  def: BuildingDef,
  currentLevel: number,
  count: number,
  mods: Mods = NO_MODS,
): number {
  let total = 0;
  const levels = Math.min(count, BUILDING_MAX_LEVEL);
  for (let i = 0; i < levels; i += 1) total += buildingCost(def, currentLevel + i, mods);
  return total;
}

/**
 * How many levels `lumen` can buy, capped by `limit` and by
 * `BUILDING_MAX_LEVEL`. Solved directly from the series, then walked back one
 * step if rounding overshot — a "buy max" button that quotes a price you can't
 * afford is worse than one that leaves a Lumen on the table.
 */
export function affordableLevels(
  def: BuildingDef,
  currentLevel: number,
  lumen: number,
  limit = BUILDING_MAX_LEVEL,
  mods: Mods = NO_MODS,
): number {
  const headroom = Math.min(limit, BUILDING_MAX_LEVEL - currentLevel);
  if (headroom <= 0 || lumen < buildingCost(def, currentLevel, mods)) return 0;

  const first = def.baseCost * BUILDING_COST_GROWTH ** currentLevel * mods.cost;
  const ratio = (lumen * (BUILDING_COST_GROWTH - 1)) / first + 1;
  const solved = Math.floor(Math.log(ratio) / Math.log(BUILDING_COST_GROWTH));

  let count = Math.min(solved, headroom);
  while (count > 0 && bulkCost(def, currentLevel, count, mods) > lumen) count -= 1;
  return count;
}

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

/** Output multiplier a building has earned from the milestone levels it passed. */
export function milestoneMultiplier(level: number): number {
  const passed = BUILDING_MILESTONE_LEVELS.filter(
    (threshold) => level >= threshold,
  ).length;
  return BUILDING_MILESTONE_MULTIPLIER ** passed;
}

/** The next milestone level a building is working toward, or `null` past the last. */
export function nextMilestone(level: number): number | null {
  return BUILDING_MILESTONE_LEVELS.find((threshold) => level < threshold) ?? null;
}

/** Neighbour bonus from this building's synergy partner, as a multiplier. */
export function synergyMultiplier(def: BuildingDef, levels: LevelMap): number {
  if (!def.synergy) return 1;
  return 1 + def.synergy.perLevel * (levels.get(def.synergy.from) ?? 0);
}

/** Lumen per review day from one building, before any city-wide multiplier. */
export function buildingOutput(def: BuildingDef, levels: LevelMap): number {
  const level = levels.get(def.id) ?? 0;
  if (level <= 0) return 0;
  return (
    def.incomePerLevel *
    level *
    milestoneMultiplier(level) *
    synergyMultiplier(def, levels)
  );
}

/**
 * City-wide multiplier from having a varied skyline. Deliberately a broad,
 * shallow bonus — it rewards spreading across the ladder without ever beating
 * the milestone doublings, which are where the real growth lives.
 */
export function districtMultiplier(levels: LevelMap): number {
  let standing = 0;
  for (const level of levels.values()) if (level > 0) standing += 1;
  return 1 + DISTRICT_BONUS_PER_BUILDING * standing;
}

/** Total Lumen the city pays on a day a review is completed. */
export function cityOutput(
  buildings: readonly OwnedBuilding[],
  mods: Mods = NO_MODS,
): number {
  const levels = levelMap(buildings);
  const raw = BUILDINGS.reduce((sum, def) => sum + buildingOutput(def, levels), 0);
  return Math.round(raw * districtMultiplier(levels) * mods.output);
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

/** What one more level would add to the city's daily output. */
export function marginalOutput(
  def: BuildingDef,
  buildings: readonly OwnedBuilding[],
  mods: Mods = NO_MODS,
): number {
  const current = cityOutput(buildings, mods);
  const owned = buildings.find((entry) => entry.id === def.id);
  const next: OwnedBuilding[] = owned
    ? buildings.map((entry) =>
        entry.id === def.id ? { ...entry, level: entry.level + 1 } : entry,
      )
    : [...buildings, { id: def.id, level: 1 }];
  return cityOutput(next, mods) - current;
}

/**
 * Buildings the shop should show: everything already standing, plus every tier
 * *this run's* earnings have brought within reach. Always at least the first
 * one, so a brand new city has something to buy.
 *
 * Keyed off the run rather than the all-time total on purpose — after an
 * ascension the ladder re-reveals as you climb it, so there is always exactly
 * one tempting locked tier instead of twelve unlocked ones and no shape.
 */
export function revealedBuildings(
  buildings: readonly OwnedBuilding[],
  runLumen: number,
): BuildingDef[] {
  const owned = new Set(
    buildings.filter((entry) => entry.level > 0).map((entry) => entry.id),
  );
  const revealed = BUILDINGS.filter(
    (def) => owned.has(def.id) || runLumen >= def.baseCost * BUILDING_REVEAL_FRACTION,
  );
  const first = BUILDINGS[0];
  return revealed.length > 0 || !first ? revealed : [first];
}

/** The cheapest unrevealed tier, for the "next unlock" line under the grid. */
export function nextLockedBuilding(
  buildings: readonly OwnedBuilding[],
  runLumen: number,
): BuildingDef | null {
  const shown = new Set(revealedBuildings(buildings, runLumen).map((def) => def.id));
  return BUILDINGS.find((def) => !shown.has(def.id)) ?? null;
}

/** Convenience for screens that only have an id to hand. */
export function ownedLevel(buildings: readonly OwnedBuilding[], id: string): number {
  return buildings.find((entry) => entry.id === id)?.level ?? 0;
}

export { getBuilding };
