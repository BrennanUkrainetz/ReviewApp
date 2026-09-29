/**
 * The city's economy: what a building costs, what it pays, and what the whole
 * cluster produces on a review day.
 *
 * Pure functions over `OwnedBuilding[]` — no state, no storage, no DOM. The
 * data these read lives in `config/shop.ts` and `config/tuning.ts`; the balance
 * rationale is written up at the top of `config/shop.ts`.
 */
import { islandUnlockAscension } from '@/config/islands';
import { BUILDINGS, getBuilding, type BuildingDef } from '@/config/shop';
import {
  BUILDING_COST_GROWTH,
  BUILDING_MAX_LEVEL,
  BUILDING_MILESTONE_INTERVAL,
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
 * How high this save may raise a building right now — the charter's ceiling,
 * never above the hard cap.
 *
 * Read from `Mods` rather than passed around separately, because every caller
 * that needs it already threads mods. `NO_MODS` leaves it at the hard cap, so
 * pure economy tests and previews are unaffected by the charter.
 */
export function levelCeiling(mods: Mods = NO_MODS): number {
  return Math.min(mods.levelCeiling, BUILDING_MAX_LEVEL);
}

/**
 * How many levels `lumen` can buy, capped by `limit` and by the charter's
 * ceiling. Solved directly from the series, then walked back one step if
 * rounding overshot — a "buy max" button that quotes a price you can't afford
 * is worse than one that leaves a Lumen on the table.
 */
export function affordableLevels(
  def: BuildingDef,
  currentLevel: number,
  lumen: number,
  limit = BUILDING_MAX_LEVEL,
  mods: Mods = NO_MODS,
): number {
  const headroom = Math.min(limit, levelCeiling(mods) - currentLevel);
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

/** How many milestone levels a building has passed. */
export function milestonesPassed(level: number): number {
  return Math.floor(Math.min(level, BUILDING_MAX_LEVEL) / BUILDING_MILESTONE_INTERVAL);
}

/** Output multiplier a building has earned from the milestone levels it passed. */
export function milestoneMultiplier(level: number): number {
  return BUILDING_MILESTONE_MULTIPLIER ** milestonesPassed(level);
}

/** The next milestone level a building is working toward, or `null` past the last. */
export function nextMilestone(level: number): number | null {
  const next = (milestonesPassed(level) + 1) * BUILDING_MILESTONE_INTERVAL;
  return next <= BUILDING_MAX_LEVEL ? next : null;
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

/**
 * What buying `levels` more of this building would add to the city's daily
 * output.
 *
 * Differenced against the whole city rather than the building alone, because
 * the answer includes what those levels feed into the building's synergy
 * partners and into the district bonus — which is often most of it, and is the
 * whole reason to spread purchases around. Any milestone doubling crossed on
 * the way is therefore priced in too, which is what makes a ×10 quote worth
 * showing instead of ten times the ×1 figure.
 */
export function marginalOutput(
  def: BuildingDef,
  buildings: readonly OwnedBuilding[],
  levels = 1,
  mods: Mods = NO_MODS,
): number {
  const owned = buildings.find((entry) => entry.id === def.id);
  const current = owned?.level ?? 0;
  const bought = Math.min(levels, levelCeiling(mods) - current);
  if (bought <= 0) return 0;

  const before = cityOutput(buildings, mods);
  const next: OwnedBuilding[] = owned
    ? buildings.map((entry) =>
        entry.id === def.id ? { ...entry, level: entry.level + bought } : entry,
      )
    : [...buildings, { id: def.id, level: bought }];
  return cityOutput(next, mods) - before;
}

/**
 * Review days for a purchase to pay for itself.
 *
 * The shop leads with this rather than with the raw Lumen gain, because the
 * gain alone cannot be compared across tiers — `+196` and `+22,000` say nothing
 * about which is the better buy until you know what each cost. Payback is the
 * one figure that ranks the whole board on the same scale, and it is very
 * nearly a function of level alone: two buildings at the same level pay back in
 * the same time whatever their tier.
 *
 * `Infinity` when a purchase adds nothing, which is what a building at its
 * ceiling quotes; callers show a dash rather than a number.
 */
export function paybackDays(
  def: BuildingDef,
  buildings: readonly OwnedBuilding[],
  levels = 1,
  mods: Mods = NO_MODS,
): number {
  const owned = buildings.find((entry) => entry.id === def.id);
  const current = owned?.level ?? 0;
  const bought = Math.min(levels, levelCeiling(mods) - current);
  if (bought <= 0) return Infinity;

  const gain = marginalOutput(def, buildings, bought, mods);
  if (gain <= 0) return Infinity;
  return bulkCost(def, current, bought, mods) / gain;
}

/**
 * The building the shop should mark as the best buy: the shortest payback among
 * everything on screen that can actually be bought right now.
 *
 * One marker, never several — its job is to answer "what should I click" for a
 * player who does not want to read twelve cards, not to rank the board.
 */
export function bestBuy(
  shown: readonly BuildingDef[],
  buildings: readonly OwnedBuilding[],
  lumen: number,
  levels = 1,
  mods: Mods = NO_MODS,
): BuildingDef | null {
  let best: BuildingDef | null = null;
  let bestDays = Infinity;

  for (const def of shown) {
    const current = ownedLevel(buildings, def.id);
    if (affordableLevels(def, current, lumen, levels, mods) <= 0) continue;
    const days = paybackDays(def, buildings, levels, mods);
    if (days < bestDays) {
      bestDays = days;
      best = def;
    }
  }
  return best;
}

/** Is a building's island reachable at this ascension count? */
function islandUnlocked(def: BuildingDef, ascensions: number): boolean {
  return ascensions >= islandUnlockAscension(def.island);
}

/**
 * Buildings the shop should show: everything already standing, plus every tier
 * that is both on a reachable island and within reach of `runLumen`. Always at
 * least the first one, so a brand new city has something to buy.
 *
 * Two gates, not one. Earnings reveal a tier the usual way — after an ascension
 * the ladder re-reveals as you climb it, so there is always exactly one tempting
 * locked tier instead of a wall of them. The high-island tiers add a second
 * gate on top: no amount of Lumen shows a tier standing on an island the city
 * has not yet ascended to, because there would be nowhere to put it.
 */
export function revealedBuildings(
  buildings: readonly OwnedBuilding[],
  runLumen: number,
  ascensions = 0,
): BuildingDef[] {
  const owned = new Set(
    buildings.filter((entry) => entry.level > 0).map((entry) => entry.id),
  );
  const revealed = BUILDINGS.filter(
    (def) =>
      owned.has(def.id) ||
      (islandUnlocked(def, ascensions) &&
        runLumen >= def.baseCost * BUILDING_REVEAL_FRACTION),
  );
  const first = BUILDINGS[0];
  return revealed.length > 0 || !first ? revealed : [first];
}

/**
 * The cheapest unrevealed tier that is *earnable* — on a reachable island but
 * not yet afforded — for the "next unlock" line under the grid. A tier locked
 * only by altitude is skipped: that carrot belongs to the Ascension screen and
 * the pager, not the shop's Lumen line.
 */
export function nextLockedBuilding(
  buildings: readonly OwnedBuilding[],
  runLumen: number,
  ascensions = 0,
): BuildingDef | null {
  const shown = new Set(
    revealedBuildings(buildings, runLumen, ascensions).map((def) => def.id),
  );
  return (
    BUILDINGS.find((def) => !shown.has(def.id) && islandUnlocked(def, ascensions)) ?? null
  );
}

/** Convenience for screens that only have an id to hand. */
export function ownedLevel(buildings: readonly OwnedBuilding[], id: string): number {
  return buildings.find((entry) => entry.id === id)?.level ?? 0;
}

export { getBuilding };
