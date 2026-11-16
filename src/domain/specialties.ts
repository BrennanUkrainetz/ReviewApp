/**
 * Specialties: what a building improves besides its own Lumen.
 *
 * Payback on a building level is very nearly a function of that level alone —
 * two buildings at level 50 pay for themselves in the same number of review
 * days whether they are the Greenhouse or the Anchor Spire (the note at the top
 * of `config/shop.ts` works this through). So Lumen cannot be the reason to
 * prefer one tier over another, and without a second reason the ladder is one
 * curve drawn twenty times.
 *
 * A specialty is that second reason. Each tier improves exactly one thing no
 * other tier on the home cluster touches, advancing a step every
 * `SPECIALTY_INTERVAL` levels. The Greenhouse pays Cinder, the Windmill fills
 * the vault faster, the Foundry holds heat longer — so "which should I level"
 * becomes a question about what your routine currently needs rather than about
 * arithmetic that has gone flat.
 *
 * Everything here folds into the same `Mods` object perks and research use.
 * That is the whole reason the effects were chosen from fields that already
 * existed: a specialty reaches the vault, the chest or the streak through the
 * seam those systems already read, so none of them needed a second code path.
 */
import { BUILDINGS, type SpecialtyDef } from '@/config/shop';
import { SPECIALTY_INTERVAL, SPECIALTY_MAX_STEPS } from '@/config/tuning';
import type { OwnedBuilding } from '@/state/types';
import type { Mods } from './ascension';

/** How many specialty steps a level has earned — at most five. */
export function specialtySteps(level: number): number {
  return Math.min(
    SPECIALTY_MAX_STEPS,
    Math.floor(Math.max(0, level) / SPECIALTY_INTERVAL),
  );
}

/** The level at which a specialty next improves, or `null` past the last step. */
export function nextSpecialtyLevel(level: number): number | null {
  const steps = specialtySteps(level);
  return steps < SPECIALTY_MAX_STEPS ? (steps + 1) * SPECIALTY_INTERVAL : null;
}

/** Kinds whose `perStep` is a factor rather than an addend. */
const MULTIPLYING = new Set<SpecialtyDef['kind']>([
  'cinder',
  'vault-rate',
  'vault-cap',
  'review',
  'output',
  'mote',
  'aether',
  'cost',
]);

/** Whether a kind's `perStep` compounds (a factor) or accumulates (an addend). */
export function specialtyMultiplies(kind: SpecialtyDef['kind']): boolean {
  return MULTIPLYING.has(kind);
}

/**
 * What a specialty is worth at a given level.
 *
 * Multiplying kinds compound over the steps earned; adding kinds scale with
 * them. Returns the identity for its kind at zero steps — 1 for a factor, 0 for
 * an addend — so a caller can show it without special-casing an unlevelled
 * building.
 */
export function specialtyValue(specialty: SpecialtyDef, level: number): number {
  const steps = specialtySteps(level);
  return specialtyMultiplies(specialty.kind)
    ? specialty.perStep ** steps
    : specialty.perStep * steps;
}

/**
 * Folds every standing building's specialty into `mods`.
 *
 * Called once from `modsFor`, which is the only place a save's authoritative
 * mods are built — so every payout in the app picks these up without knowing
 * they exist.
 *
 * Note two deliberate interactions with the trees. A specialty *discount* on
 * building cost multiplies the best perk discount rather than competing with it
 * (perks take the best of their own; this is a separate lever). A specialty
 * vault capacity likewise multiplies the best research tier. Both are meant to
 * stack: the point of levelling the Starforge is that it does something your
 * perks cannot.
 */
export function applySpecialties(mods: Mods, buildings: readonly OwnedBuilding[]): Mods {
  const levels = new Map(buildings.map((owned) => [owned.id, owned.level]));
  const next: Mods = { ...mods, research: { ...mods.research } };

  for (const def of BUILDINGS) {
    const level = levels.get(def.id) ?? 0;
    const steps = specialtySteps(level);
    if (steps <= 0) continue;

    const { kind, perStep } = def.specialty;
    const factor = perStep ** steps;
    const addend = perStep * steps;

    switch (kind) {
      case 'cinder-flat':
        next.research.cinderFlat += addend;
        break;
      case 'cinder':
        next.research.cinder *= factor;
        break;
      case 'vault-rate':
        next.research.vaultRate *= factor;
        break;
      case 'vault-cap':
        next.research.vaultCap *= factor;
        break;
      case 'window-minutes':
        next.research.windowMinutes += addend;
        break;
      case 'idle-share':
        next.research.idleShare += addend;
        break;
      case 'heat-cap':
        next.research.heatCap += addend;
        break;
      case 'mote':
        next.research.mote *= factor;
        break;
      case 'review':
        next.review *= factor;
        break;
      case 'output':
        next.output *= factor;
        break;
      case 'mote-charges':
        next.moteCharges += addend;
        break;
      case 'drop':
        next.drop += addend;
        break;
      case 'aether':
        next.aether *= factor;
        break;
      case 'cost':
        next.cost *= factor;
        break;
      case 'streak-cap':
        next.streakCap += addend;
        break;
    }
  }

  return next;
}
