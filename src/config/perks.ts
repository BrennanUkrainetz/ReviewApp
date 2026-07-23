/**
 * The Ascension perk tree — what Aether buys.
 *
 * Perks are the only thing that survives an ascension, so they are the
 * long-game progression: a run's buildings are temporary, a perk is forever.
 * Every one of them is a *multiplier* rather than a flat grant, because a flat
 * grant is worth less every run while a multiplier keeps its value.
 *
 * Costs run 1 · 2 · 3 · 5 · 8 · 13 · 21 · 55 — roughly Fibonacci, which spaces
 * the tree so an early run buys one or two nodes and a late one clears a
 * branch. Plain data; the maths that reads it is in `domain/ascension.ts`.
 */

export type PerkBranch = 'updraft' | 'ledger' | 'discipline' | 'craft';

export type PerkEffect =
  /** Multiplies the city's daily output. */
  | { kind: 'output'; factor: number }
  /** Multiplies the Lumen a review itself pays. */
  | { kind: 'review'; factor: number }
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
  /** Share of the Lumen balance that survives an ascension. */
  | { kind: 'carry-lumen'; share: number }
  /** Rebuilds the first `count` tiers to `level` at the start of each run. */
  | { kind: 'foothold'; count: number; level: number };

export interface PerkDef {
  id: string;
  name: string;
  branch: PerkBranch;
  flavor: string;
  /** Aether price. */
  cost: number;
  /** Perk that must be owned first, if any. */
  requires?: string;
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
    cost: 1,
    effect: { kind: 'output', factor: 1.5 },
  },
  {
    id: 'updraft-2',
    name: 'Trade Winds',
    branch: 'updraft',
    flavor: 'The same route every day, and it never gets old.',
    cost: 3,
    requires: 'updraft-1',
    effect: { kind: 'output', factor: 2 },
  },
  {
    id: 'updraft-3',
    name: 'Jetstream',
    branch: 'updraft',
    flavor: 'Faster than anything has a right to be up here.',
    cost: 8,
    requires: 'updraft-2',
    effect: { kind: 'output', factor: 3 },
  },
  {
    id: 'updraft-4',
    name: 'Standing Wave',
    branch: 'updraft',
    flavor: 'The cluster stopped drifting. Nobody is sure why.',
    cost: 21,
    requires: 'updraft-3',
    effect: { kind: 'output', factor: 5 },
  },
  {
    id: 'updraft-5',
    name: 'The High Current',
    branch: 'updraft',
    flavor: 'You can hear it through the floor on a quiet morning.',
    cost: 55,
    requires: 'updraft-4',
    effect: { kind: 'output', factor: 10 },
  },

  /* Ledger — the review payout, so the routine keeps pace with the city. */
  {
    id: 'ledger-1',
    name: 'Honest Books',
    branch: 'ledger',
    flavor: 'Written up the same evening, every evening.',
    cost: 1,
    effect: { kind: 'review', factor: 1.5 },
  },
  {
    id: 'ledger-2',
    name: 'Double Entry',
    branch: 'ledger',
    flavor: 'Twice the writing, a tenth of the arguments.',
    cost: 3,
    requires: 'ledger-1',
    effect: { kind: 'review', factor: 2 },
  },
  {
    id: 'ledger-3',
    name: 'Compound Interest',
    branch: 'ledger',
    flavor: 'The quiet miracle. Turns up uninvited and stays.',
    cost: 8,
    requires: 'ledger-2',
    effect: { kind: 'review', factor: 3 },
  },
  {
    id: 'ledger-4',
    name: 'The Long Account',
    branch: 'ledger',
    flavor: 'Opened a long time ago. Still open.',
    cost: 21,
    requires: 'ledger-3',
    effect: { kind: 'review', factor: 5 },
  },

  /* Discipline — everything that makes the streak itself worth more. */
  {
    id: 'discipline-1',
    name: 'Steady Hand',
    branch: 'discipline',
    flavor: 'The streak keeps paying past the twentieth day.',
    cost: 2,
    effect: { kind: 'streak-cap', extra: 10 },
  },
  {
    id: 'discipline-2',
    name: 'Long Rope',
    branch: 'discipline',
    flavor: 'Enough slack to reach the far island without unclipping.',
    cost: 5,
    requires: 'discipline-1',
    effect: { kind: 'streak-cap', extra: 20 },
  },
  {
    id: 'discipline-3',
    name: 'True North',
    branch: 'discipline',
    flavor: 'Each day of the run is worth more than the last.',
    cost: 13,
    requires: 'discipline-2',
    effect: { kind: 'streak-rate', extra: 0.02 },
  },
  {
    id: 'discipline-4',
    name: 'Unbroken',
    branch: 'discipline',
    flavor: 'A tenth of the treasury comes up with you.',
    cost: 8,
    effect: { kind: 'carry-lumen', share: 0.1 },
  },

  /* Craft — prices, luck, and the head start on a fresh run. */
  {
    id: 'craft-1',
    name: 'Salvaged Frames',
    branch: 'craft',
    flavor: 'Everything up here was something else first.',
    cost: 2,
    effect: { kind: 'cost', factor: 0.9 },
  },
  {
    id: 'craft-2',
    name: 'Prefab Yards',
    branch: 'craft',
    flavor: 'Built on the ground, flown up in pieces.',
    cost: 6,
    requires: 'craft-1',
    effect: { kind: 'cost', factor: 0.75 },
  },
  {
    id: 'craft-3',
    name: 'Deep Foundations',
    branch: 'craft',
    flavor: 'Anchored into rock that has no business being this high.',
    cost: 18,
    requires: 'craft-2',
    effect: { kind: 'cost', factor: 0.6 },
  },
  {
    id: 'craft-4',
    name: 'Foothold',
    branch: 'craft',
    flavor: 'The first three tiers are standing before you arrive.',
    cost: 8,
    effect: { kind: 'foothold', count: 3, level: 5 },
  },
  {
    id: 'fortune-1',
    name: 'Lucky Draft',
    branch: 'craft',
    flavor: 'Things blow in. Some of them are worth keeping.',
    cost: 2,
    effect: { kind: 'drop', bonus: 0.1 },
  },
  {
    id: 'fortune-2',
    name: 'Sky Salvage',
    branch: 'craft',
    flavor: 'A standing arrangement with whatever falls past.',
    cost: 5,
    requires: 'fortune-1',
    effect: { kind: 'drop', bonus: 0.25 },
  },
  {
    id: 'fortune-3',
    name: 'Windfall',
    branch: 'craft',
    flavor: 'Milestone chests pay twice over.',
    cost: 12,
    effect: { kind: 'milestone', factor: 2 },
  },
];

const PERK_BY_ID = new Map(PERKS.map((perk) => [perk.id, perk]));

export function getPerk(id: string): PerkDef | undefined {
  return PERK_BY_ID.get(id);
}

export function perksInBranch(branch: PerkBranch): PerkDef[] {
  return PERKS.filter((perk) => perk.branch === branch);
}
