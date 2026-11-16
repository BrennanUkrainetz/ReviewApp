/**
 * The Ascension perk tree — what Aether buys.
 *
 * Perks are the only thing that survives an ascension besides research, so they
 * are the long-game progression: a run's buildings are temporary, a perk is
 * forever.
 *
 * ## Ranks
 *
 * Every perk is bought a **rank** at a time, and each rank costs more than the
 * last (`baseCost × costGrowth ^ rank`, rounded up). The tree used to be twenty
 * one-off nodes costing about two hundred Aether between them, which a single
 * long run could clear outright — after which Aether had nothing left to be
 * for. Ranks fix that from both ends: an early ascension still buys three or
 * four real upgrades, and the dear ranks at the top of each perk are a goal that
 * lasts months. One perk, High Current, has no cap at all, so there is always
 * something to spend on.
 *
 * Every effect is a *multiplier* or a rule change rather than a flat grant,
 * because a flat grant is worth less every run while a multiplier keeps its
 * value. Plain data; the maths that reads it is in `domain/ascension.ts`.
 */

export type PerkBranch = 'updraft' | 'ledger' | 'discipline' | 'craft';

/**
 * What one rank of a perk does. Effects apply once per rank owned: a factor is
 * raised to the rank, an addend is multiplied by it.
 */
export type PerkEffect =
  /** Multiplies the city's daily output. */
  | { kind: 'output'; factor: number }
  /** Multiplies the Lumen a review itself pays. */
  | { kind: 'review'; factor: number }
  /** Multiplies contract and weekly-expedition bonuses. */
  | { kind: 'contract'; factor: number }
  /** Scales every building price. Below 1 — these are discounts. */
  | { kind: 'cost'; factor: number }
  /** Raises the streak length at which the multiplier stops growing. */
  | { kind: 'streak-cap'; extra: number }
  /** Adds to the multiplier gained per day of streak. */
  | { kind: 'streak-rate'; extra: number }
  /** Adds to the chance an ordinary chest drops a cosmetic. */
  | { kind: 'drop'; bonus: number }
  /** Multiplies milestone chest bonuses. */
  | { kind: 'milestone'; factor: number }
  /** Multiplies what a mote pays. */
  | { kind: 'mote'; factor: number }
  /** Multiplies the Aether an ascension grants. */
  | { kind: 'aether'; factor: number }
  /** Share of the Lumen balance that survives an ascension. */
  | { kind: 'carry-lumen'; share: number }
  /** Extra streak wards that can be held at once. */
  | { kind: 'ward-slots'; extra: number }
  /**
   * Rebuilds the first tiers at the start of each run. Indexed by rank — rank 1
   * is `steps[0]` — because a foothold grows in two directions at once.
   */
  | { kind: 'foothold'; steps: { count: number; level: number }[] };

export interface PerkDef {
  id: string;
  name: string;
  branch: PerkBranch;
  flavor: string;
  /** Aether price of the first rank. */
  baseCost: number;
  /** Each rank costs this much more than the one before it. */
  costGrowth: number;
  /** Highest rank, or `null` for a perk with no cap. */
  maxRank: number | null;
  /** A perk that must reach `rank` before this one can be started. */
  requires?: { id: string; rank: number };
  effect: PerkEffect;
}

export const PERK_BRANCHES: { id: PerkBranch; name: string; blurb: string }[] = [
  { id: 'updraft', name: 'Updraft', blurb: 'What the city produces.' },
  { id: 'ledger', name: 'Ledger', blurb: 'What the reviews themselves pay.' },
  { id: 'discipline', name: 'Discipline', blurb: 'What the streak is worth.' },
  { id: 'craft', name: 'Craft', blurb: 'What it costs, and what you find.' },
];

export const PERKS: PerkDef[] = [
  /* Updraft — the city's output. The widest branch, and the dearest. */
  {
    id: 'updraft-1',
    name: 'Rising Thermals',
    branch: 'updraft',
    flavor: 'Warm air off the cloud shelf, put to work.',
    baseCost: 1,
    costGrowth: 1.5,
    maxRank: 10,
    effect: { kind: 'output', factor: 1.15 },
  },
  {
    id: 'updraft-2',
    name: 'Trade Winds',
    branch: 'updraft',
    flavor: 'The same route every day, and it never gets old.',
    baseCost: 5,
    costGrowth: 1.7,
    maxRank: 5,
    requires: { id: 'updraft-1', rank: 3 },
    effect: { kind: 'output', factor: 1.3 },
  },
  {
    id: 'updraft-3',
    name: 'Jetstream',
    branch: 'updraft',
    flavor: 'Faster than anything has a right to be up here.',
    baseCost: 25,
    costGrowth: 1.8,
    maxRank: 5,
    requires: { id: 'updraft-2', rank: 3 },
    effect: { kind: 'output', factor: 1.6 },
  },
  {
    id: 'updraft-4',
    name: 'The High Current',
    branch: 'updraft',
    flavor: 'You can hear it through the floor on a quiet morning.',
    baseCost: 60,
    costGrowth: 1.25,
    maxRank: null,
    requires: { id: 'updraft-3', rank: 1 },
    effect: { kind: 'output', factor: 1.05 },
  },

  /* Ledger — the review payout, so the routine keeps pace with the city. */
  {
    id: 'ledger-1',
    name: 'Honest Books',
    branch: 'ledger',
    flavor: 'Written up the same evening, every evening.',
    baseCost: 1,
    costGrowth: 1.5,
    maxRank: 5,
    effect: { kind: 'review', factor: 1.1 },
  },
  {
    id: 'ledger-2',
    name: 'Double Entry',
    branch: 'ledger',
    flavor: 'Twice the writing, a tenth of the arguments.',
    baseCost: 6,
    costGrowth: 1.7,
    maxRank: 4,
    requires: { id: 'ledger-1', rank: 3 },
    effect: { kind: 'review', factor: 1.15 },
  },
  {
    id: 'ledger-3',
    name: 'Compound Interest',
    branch: 'ledger',
    flavor: 'The quiet miracle. Turns up uninvited and stays.',
    baseCost: 8,
    costGrowth: 1.7,
    maxRank: 4,
    requires: { id: 'ledger-2', rank: 1 },
    effect: { kind: 'contract', factor: 1.15 },
  },

  /* Discipline — everything that makes the streak itself worth more. */
  {
    id: 'discipline-1',
    name: 'Steady Hand',
    branch: 'discipline',
    flavor: 'The streak keeps paying past the twentieth day.',
    baseCost: 2,
    costGrowth: 1.5,
    maxRank: 6,
    effect: { kind: 'streak-cap', extra: 5 },
  },
  {
    id: 'discipline-2',
    name: 'True North',
    branch: 'discipline',
    flavor: 'Each day of the run is worth more than the last.',
    baseCost: 8,
    costGrowth: 1.7,
    maxRank: 4,
    requires: { id: 'discipline-1', rank: 2 },
    effect: { kind: 'streak-rate', extra: 0.0025 },
  },
  {
    id: 'discipline-3',
    name: 'Unbroken',
    branch: 'discipline',
    flavor: 'Some of the treasury comes up with you.',
    baseCost: 4,
    costGrowth: 1.8,
    maxRank: 4,
    effect: { kind: 'carry-lumen', share: 0.05 },
  },
  {
    id: 'discipline-4',
    name: 'Warden',
    branch: 'discipline',
    flavor: 'Someone keeps the lamps lit on the days you cannot.',
    baseCost: 10,
    costGrowth: 2,
    maxRank: 2,
    effect: { kind: 'ward-slots', extra: 1 },
  },

  /* Craft — prices, luck, and the head start on a fresh run. */
  {
    id: 'craft-1',
    name: 'Salvaged Frames',
    branch: 'craft',
    flavor: 'Everything up here was something else first.',
    baseCost: 2,
    costGrowth: 1.6,
    maxRank: 6,
    effect: { kind: 'cost', factor: 0.93 },
  },
  {
    id: 'craft-4',
    name: 'Foothold',
    branch: 'craft',
    flavor: 'The first tiers are standing before you arrive.',
    baseCost: 5,
    costGrowth: 2,
    maxRank: 3,
    effect: {
      kind: 'foothold',
      steps: [
        { count: 3, level: 10 },
        { count: 4, level: 20 },
        { count: 5, level: 25 },
      ],
    },
  },
  {
    id: 'fortune-1',
    name: 'Lucky Draft',
    branch: 'craft',
    flavor: 'Things blow in. Some of them are worth keeping.',
    baseCost: 1,
    costGrowth: 1.5,
    maxRank: 4,
    effect: { kind: 'drop', bonus: 0.05 },
  },
  {
    id: 'fortune-3',
    name: 'Windfall',
    branch: 'craft',
    flavor: 'Milestone chests pay more with every run.',
    baseCost: 4,
    costGrowth: 1.6,
    maxRank: 4,
    effect: { kind: 'milestone', factor: 1.25 },
  },
  {
    id: 'keen-eye',
    name: 'Keen Eye',
    branch: 'craft',
    flavor: 'You learn where the bright ones like to drift.',
    baseCost: 3,
    costGrowth: 1.6,
    maxRank: 4,
    effect: { kind: 'mote', factor: 1.15 },
  },
  {
    id: 'distillation',
    name: 'Distillation',
    branch: 'craft',
    flavor: 'The same climb, boiled down to something denser.',
    baseCost: 15,
    costGrowth: 2,
    maxRank: 5,
    effect: { kind: 'aether', factor: 1.1 },
  },
];

const PERK_BY_ID = new Map(PERKS.map((perk) => [perk.id, perk]));

export function getPerk(id: string): PerkDef | undefined {
  return PERK_BY_ID.get(id);
}

export function perksInBranch(branch: PerkBranch): PerkDef[] {
  return PERKS.filter((perk) => perk.branch === branch);
}

/** Aether price of taking a perk from `rank` to `rank + 1`. */
export function perkRankCost(perk: PerkDef, rank: number): number {
  return Math.ceil(perk.baseCost * perk.costGrowth ** Math.max(0, rank));
}

/** Whether a perk can go no higher. Uncapped perks never are. */
export function perkMaxed(perk: PerkDef, rank: number): boolean {
  return perk.maxRank !== null && rank >= perk.maxRank;
}

/**
 * Aether every perk cost under the tree as it stood before ranks (save v9 and
 * earlier). Kept only so `migrate` can refund them exactly — see there.
 */
export const LEGACY_PERK_COSTS: Record<string, number> = {
  'updraft-1': 1,
  'updraft-2': 3,
  'updraft-3': 8,
  'updraft-4': 21,
  'updraft-5': 55,
  'ledger-1': 1,
  'ledger-2': 3,
  'ledger-3': 8,
  'ledger-4': 21,
  'discipline-1': 2,
  'discipline-2': 5,
  'discipline-3': 13,
  'discipline-4': 8,
  'craft-1': 2,
  'craft-2': 6,
  'craft-3': 18,
  'craft-4': 8,
  'fortune-1': 2,
  'fortune-2': 5,
  'fortune-3': 12,
};
