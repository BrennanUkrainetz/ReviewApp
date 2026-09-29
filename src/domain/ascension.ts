/**
 * Ascension maths: how much Aether a run is worth, and what the perks bought
 * with it actually do.
 *
 * Every perk effect is collapsed here into one `Mods` object. Screens build it
 * once per render and pass it down; `state/actions.ts` builds its own from
 * state rather than trusting a caller, so a UI that forgets to pass mods shows
 * a stale preview but can never charge the wrong price.
 */
import {
  ASCENSION_EXPONENT,
  ASCENSION_LUMEN_SCALE,
  MIN_ASCENSION_AETHER,
} from '@/config/ascension';
import { getPerk, PERKS, type PerkDef } from '@/config/perks';
import { BUILDING_MAX_LEVEL } from '@/config/tuning';
import type { AerieState, AscensionState } from '@/state/types';
import { achievementMultiplier } from './achievements';
import { buildingCeiling, charterOutputMultiplier } from './charter';
import { NO_RESEARCH, researchModsFrom, type ResearchMods } from './research';
import { applySpecialties } from './specialties';

/** Everything the perk tree changes, collapsed into one object. */
export interface Mods {
  /** Multiplies the city's daily output. */
  output: number;
  /** Multiplies the Lumen a review pays. */
  review: number;
  /** Scales building prices. Below 1 is a discount. */
  cost: number;
  /** Added to `MULTIPLIER_CAP_STREAK`. */
  streakCap: number;
  /** Added to `MULTIPLIER_PER_DAY`. */
  streakRate: number;
  /** Added to the ordinary chest's cosmetic drop chance. */
  drop: number;
  /** Multiplies milestone chest bonuses. */
  milestone: number;
  /** Share of the Lumen balance that survives an ascension. */
  carryLumen: number;
  /** Multiplies the Aether an ascension grants. */
  aether: number;
  /** Extra mote charges granted per completed review. */
  moteCharges: number;
  /**
   * How high any building may be raised right now — the charter's ceiling.
   *
   * It rides on `Mods` rather than being threaded through the economy as its
   * own argument because every caller that prices or previews a purchase
   * already carries mods. `NO_MODS` leaves it at the hard cap, so pure economy
   * maths is unaffected by the charter unless a save is involved.
   */
  levelCeiling: number;
  /** Buildings rebuilt at the start of a run: the first `count` tiers, at `level`. */
  foothold: { count: number; level: number } | null;
  /** Everything the Cinder research tree changes. See `domain/research.ts`. */
  research: ResearchMods;
}

/** A city with no perks bought. Every field is the identity for its operation. */
export const NO_MODS: Mods = {
  output: 1,
  review: 1,
  cost: 1,
  streakCap: 0,
  streakRate: 0,
  drop: 0,
  milestone: 1,
  carryLumen: 0,
  aether: 1,
  moteCharges: 0,
  levelCeiling: BUILDING_MAX_LEVEL,
  foothold: null,
  research: NO_RESEARCH,
};

/**
 * Folds a set of owned perks into one `Mods`.
 *
 * Multipliers within a branch stack multiplicatively — three ×2 perks make ×8,
 * not ×6. That is what makes the deep end of a branch worth saving for.
 * Discounts take the *best* value rather than stacking, so the branch can't
 * drive building prices toward zero.
 */
export function modsFromPerks(owned: readonly string[]): Mods {
  const mods: Mods = { ...NO_MODS };

  for (const id of owned) {
    const perk = getPerk(id);
    if (!perk) continue;
    const effect = perk.effect;

    switch (effect.kind) {
      case 'output':
        mods.output *= effect.factor;
        break;
      case 'review':
        mods.review *= effect.factor;
        break;
      case 'cost':
        mods.cost = Math.min(mods.cost, effect.factor);
        break;
      case 'streak-cap':
        mods.streakCap += effect.extra;
        break;
      case 'streak-rate':
        mods.streakRate += effect.extra;
        break;
      case 'drop':
        mods.drop = Math.max(mods.drop, effect.bonus);
        break;
      case 'milestone':
        mods.milestone *= effect.factor;
        break;
      case 'carry-lumen':
        mods.carryLumen = Math.max(mods.carryLumen, effect.share);
        break;
      case 'foothold':
        mods.foothold = { count: effect.count, level: effect.level };
        break;
    }
  }

  return mods;
}

/**
 * The authoritative `Mods` for a save: perks, research, achievements, the
 * charter's ceiling and output bonus, and every standing building's specialty.
 *
 * All of it lands here rather than in separate multipliers because every caller
 * already threads `Mods` — one seam means a new modifier cannot be accidentally
 * left out of half the payouts. Specialties are folded in *last*, so they
 * multiply whatever the trees settled on rather than competing with it.
 */
export function modsFor(state: AerieState): Mods {
  const mods = modsFromPerks(state.ascension.perks);
  const collected = achievementMultiplier(state.achievements);
  const charter = charterOutputMultiplier(state.city.charter);

  return applySpecialties(
    {
      ...mods,
      output: mods.output * collected * charter,
      review: mods.review * collected,
      levelCeiling: buildingCeiling(state.city.charter),
      research: researchModsFrom(state.research),
    },
    state.city.buildings,
  );
}

/* ------------------------------------------------------------------ */
/* Aether                                                              */
/* ------------------------------------------------------------------ */

/**
 * Total Aether a lifetime Lumen figure is worth, ever.
 *
 * Calculated from the all-time total rather than the current run, so a grant
 * is always "this total, minus what you have already been paid". Splitting a
 * run in two can therefore never earn more than playing it out.
 */
export function totalAetherFor(lifetimeLumen: number): number {
  if (lifetimeLumen <= 0) return 0;
  return Math.floor((lifetimeLumen / ASCENSION_LUMEN_SCALE) ** ASCENSION_EXPONENT);
}

/**
 * Aether ascending right now would pay.
 *
 * The Aether Well and the Starwell multiply the grant (their specialty), and
 * that multiplier is applied to the *total ever owed* rather than to the
 * difference — otherwise levelling the Well would pay out again on Aether that
 * had already been granted, which is the same double-dip the lifetime-total
 * accounting exists to prevent.
 */
export function pendingAether(state: AerieState): number {
  const total = totalAetherFor(state.currency.lifetimeLumen) * modsFor(state).aether;
  return Math.max(0, Math.floor(total) - state.ascension.aetherEarned);
}

/** Whether there is enough on the table for ascending to be worth it. */
export function canAscend(state: AerieState): boolean {
  return pendingAether(state) >= MIN_ASCENSION_AETHER;
}

/**
 * Lifetime Lumen needed for the next whole point of Aether — the "you are
 * this far off" number on the ascension screen.
 */
export function lumenForNextAether(state: AerieState): number {
  const grant = modsFor(state).aether;
  const owed = (lifetime: number): number =>
    Math.floor(totalAetherFor(lifetime) * grant);

  const target = owed(state.currency.lifetimeLumen) + 1;
  let lumen = Math.ceil(
    (target / grant) ** (1 / ASCENSION_EXPONENT) * ASCENSION_LUMEN_SCALE,
  );
  // Inverting a floored power lands a hair under the threshold about as often
  // as it lands on it, and a target that does not actually pay out is worse
  // than useless. Walk up until it genuinely does.
  while (owed(lumen) < target) lumen += 1;
  return lumen;
}

/* ------------------------------------------------------------------ */
/* The perk tree                                                       */
/* ------------------------------------------------------------------ */

export type PerkStatus = 'owned' | 'available' | 'locked' | 'unaffordable';

/** Where a perk stands for a given save: owned, buyable, too dear, or gated. */
export function perkStatus(perk: PerkDef, ascension: AscensionState): PerkStatus {
  if (ascension.perks.includes(perk.id)) return 'owned';
  if (perk.requires && !ascension.perks.includes(perk.requires)) return 'locked';
  return ascension.aether >= perk.cost ? 'available' : 'unaffordable';
}

/** Perks whose prerequisite is met and which are not yet owned. */
export function purchasablePerks(ascension: AscensionState): PerkDef[] {
  return PERKS.filter((perk) => {
    const status = perkStatus(perk, ascension);
    return status === 'available' || status === 'unaffordable';
  });
}
