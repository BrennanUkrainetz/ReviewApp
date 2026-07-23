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
import type { AerieState, AscensionState } from '@/state/types';
import { achievementMultiplier } from './achievements';
import { NO_RESEARCH, researchModsFrom, type ResearchMods } from './research';

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
 * The authoritative `Mods` for a save: perks, plus the broad achievement
 * bonus folded into both Lumen sources.
 *
 * Achievements land here rather than in their own multiplier because every
 * caller already threads `Mods` — one seam means a new modifier cannot be
 * accidentally left out of half the payouts.
 */
export function modsFor(state: AerieState): Mods {
  const mods = modsFromPerks(state.ascension.perks);
  const collected = achievementMultiplier(state.achievements);
  return {
    ...mods,
    output: mods.output * collected,
    review: mods.review * collected,
    research: researchModsFrom(state.research),
  };
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

/** Aether ascending right now would pay. */
export function pendingAether(state: AerieState): number {
  return Math.max(
    0,
    totalAetherFor(state.currency.lifetimeLumen) - state.ascension.aetherEarned,
  );
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
  const target = totalAetherFor(state.currency.lifetimeLumen) + 1;
  let lumen = Math.ceil(target ** (1 / ASCENSION_EXPONENT) * ASCENSION_LUMEN_SCALE);
  // Inverting a floored power lands a hair under the threshold about as often
  // as it lands on it, and a target that does not actually pay out is worse
  // than useless. Walk up until it genuinely does.
  while (totalAetherFor(lumen) < target) lumen += 1;
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
