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
  AETHER_LOG_FLOOR,
  AETHER_POWER,
  AETHER_SCALE,
  MIN_ASCENSION_AETHER,
} from '@/config/ascension';
import { perkMaxed, perkRankCost, PERKS, type PerkDef } from '@/config/perks';
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
  /** Multiplies contract and weekly-expedition bonuses. */
  contract: number;
  /** Extra streak wards that can be held at once. */
  wardSlots: number;
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
  contract: 1,
  wardSlots: 0,
  carryLumen: 0,
  aether: 1,
  moteCharges: 0,
  levelCeiling: BUILDING_MAX_LEVEL,
  foothold: null,
  research: NO_RESEARCH,
};

/** A perk's owned rank in a save's rank map. */
export function rankOf(ranks: Readonly<Record<string, number>>, id: string): number {
  const rank = ranks[id];
  return typeof rank === 'number' && rank > 0 ? Math.floor(rank) : 0;
}

/**
 * Folds owned perk ranks into one `Mods`.
 *
 * Each rank applies its effect once: a ×1.2 perk at rank 3 is ×1.728, a +5-day
 * perk at rank 3 is +15. Multipliers from different perks stack
 * multiplicatively, which is what makes the deep end of a branch worth saving
 * for. A rank above a perk's cap (a hand-edited save) counts as the cap.
 */
export function modsFromPerks(ranks: Readonly<Record<string, number>>): Mods {
  const mods: Mods = { ...NO_MODS, research: { ...NO_RESEARCH } };

  for (const perk of PERKS) {
    const owned = rankOf(ranks, perk.id);
    const rank = perk.maxRank === null ? owned : Math.min(owned, perk.maxRank);
    if (rank <= 0) continue;
    const effect = perk.effect;

    switch (effect.kind) {
      case 'output':
        mods.output *= effect.factor ** rank;
        break;
      case 'review':
        mods.review *= effect.factor ** rank;
        break;
      case 'contract':
        mods.contract *= effect.factor ** rank;
        break;
      case 'cost':
        mods.cost *= effect.factor ** rank;
        break;
      case 'streak-cap':
        mods.streakCap += effect.extra * rank;
        break;
      case 'streak-rate':
        mods.streakRate += effect.extra * rank;
        break;
      case 'drop':
        mods.drop += effect.bonus * rank;
        break;
      case 'milestone':
        mods.milestone *= effect.factor ** rank;
        break;
      case 'mote':
        mods.research.mote *= effect.factor ** rank;
        break;
      case 'aether':
        mods.aether *= effect.factor ** rank;
        break;
      case 'carry-lumen':
        mods.carryLumen += effect.share * rank;
        break;
      case 'ward-slots':
        mods.wardSlots += effect.extra * rank;
        break;
      case 'foothold': {
        const step = effect.steps[Math.min(rank, effect.steps.length) - 1];
        if (step) mods.foothold = { count: step.count, level: step.level };
        break;
      }
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
  const mods = modsFromPerks(state.ascension.perkRanks);
  const collected = achievementMultiplier(state.achievements);
  const charter = charterOutputMultiplier(state.city.charter);
  const research = researchModsFrom(state.research);

  return applySpecialties(
    {
      ...mods,
      output: mods.output * collected * charter,
      review: mods.review * collected,
      levelCeiling: buildingCeiling(state.city.charter),
      // Perks and research both reach the mote multiplier; they stack.
      research: { ...research, mote: research.mote * mods.research.mote },
    },
    state.city.buildings,
  );
}

/* ------------------------------------------------------------------ */
/* Aether                                                              */
/* ------------------------------------------------------------------ */

/**
 * Total Aether a lifetime Lumen figure is worth, ever — before any multiplier.
 *
 * Calculated from the all-time total rather than the current run, so a grant
 * is always "this total, minus what you have already been paid". Splitting a
 * run in two can therefore never earn more than playing it out. The curve is
 * explained beside its constants in `config/ascension.ts`.
 */
export function totalAetherFor(lifetimeLumen: number): number {
  return Math.floor(rawAetherFor(lifetimeLumen));
}

/** The unrounded curve, for multiplying and inverting. */
function rawAetherFor(lifetimeLumen: number): number {
  if (!(lifetimeLumen > 0)) return 0;
  const orders = Math.log10(lifetimeLumen) - AETHER_LOG_FLOOR;
  return orders > 0 ? AETHER_SCALE * orders ** AETHER_POWER : 0;
}

/** Lifetime Lumen at which the unrounded curve reaches `aether`. */
function lumenForRawAether(aether: number): number {
  if (aether <= 0) return 10 ** AETHER_LOG_FLOOR;
  return 10 ** (AETHER_LOG_FLOOR + (aether / AETHER_SCALE) ** (1 / AETHER_POWER));
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
  const total = rawAetherFor(state.currency.lifetimeLumen) * modsFor(state).aether;
  return Math.max(0, Math.floor(total) - state.ascension.aetherEarned);
}

/** Whether there is enough on the table for ascending to be allowed. */
export function canAscend(state: AerieState): boolean {
  return pendingAether(state) >= MIN_ASCENSION_AETHER;
}

/**
 * Lifetime Lumen at which ascending would pay `target` Aether — the "you are
 * this far off" number on the ascension screen. Defaults to the minimum an
 * ascension may pay, or one more than is pending once that is met.
 */
export function lumenForNextAether(state: AerieState, target?: number): number {
  const grant = modsFor(state).aether;
  const want = target ?? Math.max(MIN_ASCENSION_AETHER, pendingAether(state) + 1);
  const pays = (lumen: number): number =>
    Math.floor(rawAetherFor(lumen) * grant) - state.ascension.aetherEarned;

  let lumen = Math.ceil(lumenForRawAether((state.ascension.aetherEarned + want) / grant));
  // Inverting a floored curve lands a hair under the threshold about as often
  // as it lands on it, and a target that does not actually pay out is worse
  // than useless. Nudge up until it genuinely does.
  for (let guard = 0; guard < 64 && pays(lumen) < want; guard += 1) {
    lumen = Math.ceil(lumen * 1.000_001) + 1;
  }
  return lumen;
}

/* ------------------------------------------------------------------ */
/* The perk tree                                                       */
/* ------------------------------------------------------------------ */

export type PerkStatus = 'maxed' | 'available' | 'locked' | 'unaffordable';

/**
 * Where a perk's next rank stands for a given save: bought out, buyable, too
 * dear, or gated behind another perk's rank.
 */
export function perkStatus(perk: PerkDef, ascension: AscensionState): PerkStatus {
  const rank = rankOf(ascension.perkRanks, perk.id);
  if (perkMaxed(perk, rank)) return 'maxed';
  if (
    perk.requires &&
    rankOf(ascension.perkRanks, perk.requires.id) < perk.requires.rank
  ) {
    return 'locked';
  }
  return ascension.aether >= perkRankCost(perk, rank) ? 'available' : 'unaffordable';
}

/** Perks whose prerequisite is met and which still have a rank to buy. */
export function purchasablePerks(ascension: AscensionState): PerkDef[] {
  return PERKS.filter((perk) => {
    const status = perkStatus(perk, ascension);
    return status === 'available' || status === 'unaffordable';
  });
}

/** Total perk ranks owned, across the whole tree. */
export function totalPerkRanks(ascension: AscensionState): number {
  return PERKS.reduce((sum, perk) => sum + rankOf(ascension.perkRanks, perk.id), 0);
}
