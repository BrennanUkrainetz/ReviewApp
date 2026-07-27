/**
 * Research maths: what owned Cinder purchases add up to, and where each node
 * stands for a given save.
 *
 * Research folds into the same `Mods` object the perk tree uses (see
 * `domain/ascension.ts`). One seam for every modifier is deliberate — a second
 * parallel mods object would be a second thing every payout could forget to
 * apply.
 */
import { getResearch, RESEARCH, type ResearchDef } from '@/config/research';
import {
  CINDER_HEAT_BONUSES,
  CINDER_PERFECT_DAY_BONUS,
  CINDER_PER_FULL_CLEAR,
  COLLECTION_WINDOWS,
  VAULT_IDLE_SHARE,
  VAULT_WORK_MULTIPLIER,
  type CollectionWindow,
} from '@/config/tuning';
import type { AerieState, Tier } from '@/state/types';

/** The research half of `Mods`. Defaults are the values with nothing bought. */
export interface ResearchMods {
  /** Multiplies the vault's ceiling. */
  vaultCap: number;
  /** Multiplies how fast the vault fills. */
  vaultRate: number;
  /** Replaces `VAULT_WORK_MULTIPLIER`. */
  workRate: number;
  /** Replaces `VAULT_IDLE_SHARE`. */
  idleShare: number;
  /** Extra minutes on every collection window. */
  windowMinutes: number;
  /** Windows added on top of the standard set. */
  extraWindows: CollectionWindow[];
  /** Multiplies Cinder earned. */
  cinder: number;
  /** Added to `HEAT_CAP_DAYS`. */
  heatCap: number;
  /** Multiplies what a mote pays. */
  mote: number;
}

export const NO_RESEARCH: ResearchMods = {
  vaultCap: 1,
  vaultRate: 1,
  workRate: VAULT_WORK_MULTIPLIER,
  idleShare: VAULT_IDLE_SHARE,
  windowMinutes: 0,
  extraWindows: [],
  cinder: 1,
  heatCap: 0,
  mote: 1,
};

/**
 * Folds owned research into one `ResearchMods`.
 *
 * Rate multipliers stack, because those branches are meant to compound. The
 * tiered upgrades — capacity, window length, the work and idle rates — take the
 * *best* value rather than stacking, because each tier is a replacement for the
 * one below it, not an addition to it. Buying "Cistern" after "Deeper Vault"
 * gets you 2.6×, not 4.2×.
 */
export function researchModsFrom(owned: readonly string[]): ResearchMods {
  const mods: ResearchMods = { ...NO_RESEARCH, extraWindows: [] };

  for (const id of owned) {
    const entry = getResearch(id);
    if (!entry) continue;
    const effect = entry.effect;

    switch (effect.kind) {
      case 'vault-cap':
        mods.vaultCap = Math.max(mods.vaultCap, effect.factor);
        break;
      case 'vault-rate':
        mods.vaultRate *= effect.factor;
        break;
      case 'work-rate':
        mods.workRate = Math.max(mods.workRate, effect.value);
        break;
      case 'idle-share':
        mods.idleShare = Math.max(mods.idleShare, effect.value);
        break;
      case 'window-minutes':
        mods.windowMinutes = Math.max(mods.windowMinutes, effect.extra);
        break;
      case 'window-extra':
        mods.extraWindows.push(effect.window);
        break;
      case 'cinder':
        mods.cinder *= effect.factor;
        break;
      case 'heat-cap':
        mods.heatCap = Math.max(mods.heatCap, effect.extra);
        break;
      case 'mote':
        mods.mote *= effect.factor;
        break;
    }
  }

  return mods;
}

/**
 * Every collection window the save actually has, in clock order and with any
 * bought minutes already applied.
 *
 * Sorted rather than assumed: a window bought from the tree can land anywhere
 * in the day, and `nextWindow` walks this list in order.
 */
export function windowsFor(mods: ResearchMods): CollectionWindow[] {
  const { windowMinutes, extraWindows } = mods;
  return [...COLLECTION_WINDOWS, ...extraWindows]
    .map((window) => ({ ...window, endMinutes: window.endMinutes + windowMinutes }))
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

/* ------------------------------------------------------------------ */
/* Cinder                                                              */
/* ------------------------------------------------------------------ */

/**
 * Cinder earned by a review.
 *
 * Only a full clear pays. A floor pass keeps the streak and earns nothing here,
 * for the same reason it earns no heat: the floor exists so a bad day is
 * survivable, not so it is profitable.
 */
export function cinderFor(
  tier: Tier,
  completesPerfectDay: boolean,
  heatDays: number,
  mods: ResearchMods = NO_RESEARCH,
): number {
  if (tier !== 'full') return 0;

  const heatBonus = CINDER_HEAT_BONUSES.filter((tierDef) => heatDays >= tierDef.days).at(
    -1,
  );
  const base =
    CINDER_PER_FULL_CLEAR +
    (completesPerfectDay ? CINDER_PERFECT_DAY_BONUS : 0) +
    (heatBonus?.bonus ?? 0);

  return Math.round(base * mods.cinder);
}

/* ------------------------------------------------------------------ */
/* The tree                                                            */
/* ------------------------------------------------------------------ */

export type ResearchStatus = 'owned' | 'available' | 'locked' | 'unaffordable';

/** Where a node stands for a save: owned, buyable, too dear, or gated. */
export function researchStatus(entry: ResearchDef, state: AerieState): ResearchStatus {
  const owned = state.research;
  if (owned.includes(entry.id)) return 'owned';
  if (entry.requires && !owned.includes(entry.requires)) return 'locked';
  return state.currency.cinder >= entry.cost ? 'available' : 'unaffordable';
}

/** The cheapest node the save could buy right now, for the "next up" line. */
export function nextResearch(state: AerieState): ResearchDef | null {
  return (
    RESEARCH.filter((entry) => researchStatus(entry, state) !== 'owned')
      .filter((entry) => !entry.requires || state.research.includes(entry.requires))
      .sort((a, b) => a.cost - b.cost)[0] ?? null
  );
}
