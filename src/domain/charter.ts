/**
 * The charter — the Hearth Hall's job, and the ceiling on the whole city.
 *
 * The Hearth Hall has stood at the centre of the home island since the first
 * day and has never done anything. It is now the one building that cannot be
 * bought up a tier at a time: it holds the city's **charter**, and a charter is
 * the highest level any building may be raised to.
 *
 * ## Why there is a ceiling at all
 *
 * With a doubling every ten levels (`BUILDING_MILESTONE_INTERVAL`), levelling a
 * building stays worth doing for a very long time — which was the point, but it
 * also makes it optimal to pick whichever building is cheapest and pour
 * everything into that one forever. Payback barely distinguishes the tiers, so
 * nothing in the arithmetic would ever tell you to stop.
 *
 * The charter is what tells you to stop. It does not lift for money so much as
 * for **breadth**: charter `L` wants one more kind of building than the last
 * one did, standing at the height the last charter allowed. So the loop is
 * level everything to the ceiling, widen the city, raise the charter, repeat —
 * and the ladder gets climbed rather than exploited.
 *
 * ## What it never does
 *
 * It never takes a level away. A save that already stands above its ceiling —
 * every save that existed before the charter did — keeps everything it has and
 * is simply told what the Hearth Hall needs before it can add more. `migrate`
 * goes further and grants whatever charter that city had already earned, so
 * nobody opens the app to a city frozen by a rule that did not exist yesterday.
 *
 * ## What it costs
 *
 * Each charter has one fixed price, set by the building its requirement is
 * about: a few levels of the newest tier it asks for, at the height it asks for
 * it. It used to be a few days of the city's *current* output, which meant it
 * could never be caught — every Lumen earned toward it raised it, and every
 * building bought to meet the requirement raised it again. A fixed price is
 * something you save toward; a moving one is a treadmill.
 *
 * Pure functions over levels. Nothing here reads the city's output.
 */
import { BUILDINGS } from '@/config/shop';
import {
  BUILDING_COST_GROWTH,
  BUILDING_MAX_LEVEL,
  CHARTER_COST_LEVELS,
  CHARTER_KINDS_OVER_LEVEL,
  CHARTER_LEVELS_PER_STEP,
  CHARTER_MAX_LEVEL,
  CHARTER_MIN_COST,
  CHARTER_MIN_LEVEL,
  CHARTER_OUTPUT_PER_LEVEL,
} from '@/config/tuning';
import type { OwnedBuilding } from '@/state/types';

/** A charter level clamped to the range that actually exists. */
export function clampCharter(level: number): number {
  if (!Number.isFinite(level)) return CHARTER_MIN_LEVEL;
  return Math.min(CHARTER_MAX_LEVEL, Math.max(CHARTER_MIN_LEVEL, Math.floor(level)));
}

/** How high any building may be raised under a given charter. */
export function buildingCeiling(charter: number): number {
  return Math.min(BUILDING_MAX_LEVEL, clampCharter(charter) * CHARTER_LEVELS_PER_STEP);
}

/** The city-wide output bonus a charter carries. Charter 1 is neutral. */
export function charterOutputMultiplier(charter: number): number {
  return 1 + CHARTER_OUTPUT_PER_LEVEL * (clampCharter(charter) - CHARTER_MIN_LEVEL);
}

/** What charter `level` asks for, or `null` for a level that cannot be reached. */
export function charterRequirement(
  level: number,
): { kinds: number; atLevel: number } | null {
  if (level <= CHARTER_MIN_LEVEL || level > CHARTER_MAX_LEVEL) return null;
  return {
    kinds: level + CHARTER_KINDS_OVER_LEVEL,
    atLevel: (level - 1) * CHARTER_LEVELS_PER_STEP,
  };
}

/**
 * Lumen price of charter `level` — fixed, whatever the city is producing.
 *
 * `CHARTER_COST_LEVELS` levels of the newest tier the requirement names (the
 * `kinds`-th building on the ladder), priced at the height it names. So the
 * charter always costs about as much as a handful of the purchases that met
 * its requirement, and grows with the ladder rather than with the balance.
 * Zero for a level that cannot be bought.
 */
export function charterCost(level: number): number {
  const requirement = charterRequirement(level);
  if (!requirement) return 0;
  const anchor = BUILDINGS[Math.min(requirement.kinds, BUILDINGS.length) - 1];
  if (!anchor) return CHARTER_MIN_COST;
  const price =
    anchor.baseCost * BUILDING_COST_GROWTH ** requirement.atLevel * CHARTER_COST_LEVELS;
  return Math.ceil(Math.max(CHARTER_MIN_COST, price));
}

/** How many distinct buildings stand at `atLevel` or higher. */
export function kindsAtLevel(
  buildings: readonly OwnedBuilding[],
  atLevel: number,
): number {
  const known = new Set(BUILDINGS.map((def) => def.id));
  return buildings.filter((owned) => known.has(owned.id) && owned.level >= atLevel)
    .length;
}

/**
 * Everything the Hearth Hall's card needs, in one object.
 *
 * `next` is `null` at the last charter. `standing` is quoted even when the
 * requirement is met, because watching it climb toward `kinds` is most of what
 * makes the next charter feel reachable.
 */
export interface CharterProgress {
  level: number;
  /** Highest level any building may be raised to right now. */
  ceiling: number;
  /** Output multiplier this charter grants the whole city. */
  output: number;
  /** The charter being worked toward, or `null` at the last one. */
  next: number | null;
  /** What that charter asks for, or `null` at the last one. */
  requirement: { kinds: number; atLevel: number } | null;
  /** Kinds currently standing at `requirement.atLevel` or higher. */
  standing: number;
  /** Lumen price of the next charter. */
  cost: number;
  /** Whether the breadth requirement is satisfied. */
  met: boolean;
  /** Whether it is satisfied *and* affordable right now. */
  affordable: boolean;
}

export function charterProgress(
  buildings: readonly OwnedBuilding[],
  charter: number,
  lumen = 0,
): CharterProgress {
  const level = clampCharter(charter);
  const next = level < CHARTER_MAX_LEVEL ? level + 1 : null;
  const requirement = next === null ? null : charterRequirement(next);
  const standing = requirement ? kindsAtLevel(buildings, requirement.atLevel) : 0;
  const cost = next === null ? 0 : charterCost(next);
  const met = requirement !== null && standing >= requirement.kinds;

  return {
    level,
    ceiling: buildingCeiling(level),
    output: charterOutputMultiplier(level),
    next,
    requirement,
    standing,
    cost,
    met,
    affordable: met && lumen >= cost,
  };
}

/**
 * The lowest charter that would leave every standing building legal.
 *
 * Used by `migrate` to hand an existing save the charter its city had already
 * earned, and as a floor everywhere else — a charter is never allowed to sit
 * below the city it is supposed to be governing.
 */
export function charterEarnedBy(buildings: readonly OwnedBuilding[]): number {
  const highest = buildings.reduce((top, owned) => Math.max(top, owned.level), 0);
  return clampCharter(Math.ceil(highest / CHARTER_LEVELS_PER_STEP));
}
