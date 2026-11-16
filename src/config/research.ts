/**
 * The Workshop — what Cinder buys.
 *
 * Cinder comes only from full-cleared reviews and the heat riding on them: it
 * cannot be earned by waiting, by building, or by ascending. That is the whole
 * design of this currency. Lumen measures how big the city got; Cinder measures
 * how well the routine was actually run, and it is the only thing the vault's
 * rules will bend for.
 *
 * Research is permanent — it survives an ascension, exactly as perks do. The
 * split between the two trees is what they act on: perks change what the *city*
 * is worth (`config/perks.ts`), research changes what the *vault* will do for
 * you. Most of it buys flexibility rather than numbers, because the thing worth
 * wanting after a month of this is not a bigger multiplier, it's a wider door.
 *
 * Plain data. The maths that reads it is in `domain/research.ts`.
 */
import type { CollectionWindow } from './tuning';

export type ResearchBranch = 'vault' | 'furnace' | 'ember' | 'watch';

export type ResearchEffect =
  /** Multiplies the vault's ceiling. Tiers supersede: the best is used. */
  | { kind: 'vault-cap'; factor: number }
  /** Multiplies how fast the vault fills. Stacks. */
  | { kind: 'vault-rate'; factor: number }
  /** Replaces `VAULT_WORK_MULTIPLIER` outright. Best wins. */
  | { kind: 'work-rate'; value: number }
  /** Replaces `VAULT_IDLE_SHARE` outright. Best wins. */
  | { kind: 'idle-share'; value: number }
  /** Extra minutes on every collection window. Best wins. */
  | { kind: 'window-minutes'; extra: number }
  /** An entirely new window in the day. */
  | { kind: 'window-extra'; window: CollectionWindow }
  /** Multiplies Cinder earned. Stacks. */
  | { kind: 'cinder'; factor: number }
  /** Added to `HEAT_CAP_DAYS`. Best wins. */
  | { kind: 'heat-cap'; extra: number }
  /** Multiplies what a mote is worth. Stacks. */
  | { kind: 'mote'; factor: number }
  /** Extra streak wards that can be held at once. Stacks. */
  | { kind: 'ward-slots'; extra: number }
  /** Scales what mending a broken run costs. Best wins. */
  | { kind: 'mend-cost'; factor: number };

export interface ResearchDef {
  id: string;
  name: string;
  branch: ResearchBranch;
  /** What it does, stated plainly. Shown on the card. */
  detail: string;
  flavor: string;
  /** Cinder price. */
  cost: number;
  /** Research that must be owned first, if any. */
  requires?: string;
  effect: ResearchEffect;
}

export const RESEARCH_BRANCHES: {
  id: ResearchBranch;
  name: string;
  blurb: string;
}[] = [
  { id: 'vault', name: 'The Vault', blurb: 'How much it holds, and when it opens.' },
  { id: 'furnace', name: 'The Furnace', blurb: 'How fast it fills.' },
  { id: 'ember', name: 'Embers', blurb: 'What a well-run day is worth.' },
  {
    id: 'watch',
    name: 'The Watch',
    blurb: 'Keeping the run alive on the days you cannot.',
  },
];

export const RESEARCH: ResearchDef[] = [
  /* The Vault — capacity and doors. The flexibility branch. */
  {
    id: 'deep-1',
    name: 'Deeper Vault',
    branch: 'vault',
    detail: 'The vault holds 1.6× as much before it spills.',
    flavor: 'Dug down through the rock, since there is nowhere else to go.',
    cost: 10,
    effect: { kind: 'vault-cap', factor: 1.6 },
  },
  {
    id: 'deep-2',
    name: 'Cistern',
    branch: 'vault',
    detail: 'The vault holds 2.6× as much.',
    flavor: 'Sealed, cold, and much larger inside than the door suggests.',
    cost: 45,
    requires: 'deep-1',
    effect: { kind: 'vault-cap', factor: 2.6 },
  },
  {
    id: 'deep-3',
    name: 'The Long Hold',
    branch: 'vault',
    detail: 'The vault holds 4.2× as much — most of a weekend.',
    flavor: 'Nobody has filled it yet. It is early days.',
    cost: 130,
    requires: 'deep-2',
    effect: { kind: 'vault-cap', factor: 4.2 },
  },
  {
    id: 'doors-1',
    name: 'Wider Doors',
    branch: 'vault',
    detail: 'Every collection window stays open half an hour longer.',
    flavor: 'The hinges were the problem all along.',
    cost: 24,
    effect: { kind: 'window-minutes', extra: 30 },
  },
  {
    id: 'doors-2',
    name: 'Open Doors',
    branch: 'vault',
    detail: 'Every collection window stays open an hour and a quarter longer.',
    flavor: 'Propped, most days. Nobody objects.',
    cost: 110,
    requires: 'doors-1',
    effect: { kind: 'window-minutes', extra: 75 },
  },
  {
    id: 'bell',
    name: 'Midday Bell',
    branch: 'vault',
    detail: 'Adds a third window over lunch, 12:00 to 12:30.',
    flavor: 'Rung by hand. It has never once been late.',
    cost: 140,
    effect: {
      kind: 'window-extra',
      window: {
        id: 'midday',
        label: 'Midday',
        startMinutes: 12 * 60,
        endMinutes: 12 * 60 + 30,
      },
    },
  },
  {
    id: 'standing-1',
    name: 'Standing Orders',
    branch: 'vault',
    detail: 'A day with no review logged fills the vault at a quarter rate, not a tenth.',
    flavor: 'The city keeps working. It just works slower without you.',
    cost: 60,
    effect: { kind: 'idle-share', value: 0.25 },
  },
  {
    id: 'standing-2',
    name: 'Autopilot',
    branch: 'vault',
    detail: 'A day with no review logged fills the vault at two fifths rate.',
    flavor: 'For the weeks that get away from everyone.',
    cost: 160,
    requires: 'standing-1',
    effect: { kind: 'idle-share', value: 0.4 },
  },

  /* The Furnace — raw rate. The expensive, uncomplicated branch. */
  {
    id: 'draught-1',
    name: 'Banked Coals',
    branch: 'furnace',
    detail: 'The vault fills 1.15× faster, around the clock.',
    flavor: 'Never quite out, never quite roaring.',
    cost: 18,
    effect: { kind: 'vault-rate', factor: 1.15 },
  },
  {
    id: 'draught-2',
    name: 'Forced Draught',
    branch: 'furnace',
    detail: 'The vault fills 1.25× faster again.',
    flavor: 'The wind up here was always going to be useful for something.',
    cost: 80,
    requires: 'draught-1',
    effect: { kind: 'vault-rate', factor: 1.25 },
  },
  {
    id: 'draught-3',
    name: 'Blast Furnace',
    branch: 'furnace',
    detail: 'The vault fills 1.4× faster again.',
    flavor: 'You can read by it from the east island.',
    cost: 220,
    requires: 'draught-2',
    effect: { kind: 'vault-rate', factor: 1.4 },
  },
  {
    id: 'shift-1',
    name: 'Shift Bonus',
    branch: 'furnace',
    detail: 'Work hours fill the vault ×3.5 instead of ×3.',
    flavor: 'Paid properly for the hours you are not here.',
    cost: 120,
    effect: { kind: 'work-rate', value: 3.5 },
  },
  {
    id: 'shift-2',
    name: 'Double Shift',
    branch: 'furnace',
    detail: 'Work hours fill the vault ×4.',
    flavor: 'The city does its best work while you are doing yours.',
    cost: 280,
    requires: 'shift-1',
    effect: { kind: 'work-rate', value: 4 },
  },

  /* Embers — the routine feeding itself. */
  {
    id: 'hot-1',
    name: 'Hot Work',
    branch: 'ember',
    detail: 'Full clears earn 1.25× Cinder.',
    flavor: 'Do it properly and it burns hotter. That is all there is to it.',
    cost: 35,
    effect: { kind: 'cinder', factor: 1.25 },
  },
  {
    id: 'hot-2',
    name: 'Crucible',
    branch: 'ember',
    detail: 'Full clears earn 1.5× Cinder again.',
    flavor: 'What comes out is worth more than what went in.',
    cost: 160,
    requires: 'hot-1',
    effect: { kind: 'cinder', factor: 1.5 },
  },
  {
    id: 'slow-burn',
    name: 'Slow Burn',
    branch: 'ember',
    detail: 'Heat keeps building for ten days past its usual cap.',
    flavor: 'Turns out it was never the fuel that ran out.',
    cost: 90,
    effect: { kind: 'heat-cap', extra: 10 },
  },
  {
    id: 'bright-motes',
    name: 'Bright Motes',
    branch: 'ember',
    detail: 'Motes are worth double.',
    flavor: 'Same motes. They just seem to matter more lately.',
    cost: 30,
    effect: { kind: 'mote', factor: 2 },
  },

  /* The Watch — streak insurance. See `domain/wards.ts`. */
  {
    id: 'watch-1',
    name: 'Night Watch',
    branch: 'watch',
    detail: 'Hold one more streak ward at a time.',
    flavor: 'Somebody is always awake up here. Now it is on purpose.',
    cost: 60,
    effect: { kind: 'ward-slots', extra: 1 },
  },
  {
    id: 'watch-2',
    name: 'Standing Watch',
    branch: 'watch',
    detail: 'Hold one more streak ward again.',
    flavor: 'Shifts, a rota, and a kettle that is never cold.',
    cost: 180,
    requires: 'watch-1',
    effect: { kind: 'ward-slots', extra: 1 },
  },
  {
    id: 'mending',
    name: "Mender's Kit",
    branch: 'watch',
    detail: 'Mending a broken run costs half as much.',
    flavor: 'Rope, pitch, and the patience to use them.',
    cost: 120,
    effect: { kind: 'mend-cost', factor: 0.5 },
  },
];

const RESEARCH_BY_ID = new Map(RESEARCH.map((entry) => [entry.id, entry]));

export function getResearch(id: string): ResearchDef | undefined {
  return RESEARCH_BY_ID.get(id);
}

export function researchInBranch(branch: ResearchBranch): ResearchDef[] {
  return RESEARCH.filter((entry) => entry.branch === branch);
}
