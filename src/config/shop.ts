/**
 * Shop catalogue: buildings (the city's Lumen output) and cosmetics (purely
 * visual). Plain data — add or retune entries without touching logic. The
 * maths that reads this data lives in `src/domain/economy.ts`, and which island
 * each building sits on — and so which ascension it unlocks at — is defined in
 * `src/config/islands.ts`.
 *
 * ## The ladder
 *
 * Buildings are listed cheapest first and form a geometric ladder: each tier
 * costs and pays roughly **13×** the one before it. Within a tier, every level
 * costs `BUILDING_COST_GROWTH` more than the last, and every tenth level
 * doubles what it pays.
 *
 * `baseCost / incomePerLevel` — raw payback, in days of the building's own
 * output — is **6** at the Greenhouse and grows **~1.3× per tier** (so each
 * tier pays ~10× the one below while costing ~13×). It used to be a flat 2.5
 * for every tier, which only held while nothing else in the city multiplied
 * output. Every city-wide multiplier — charter, district, achievements,
 * synergies, perks — shortens *every* tier's payback at once, so a flat ladder
 * accelerated as the game went on and a diligent player cleared it in a month.
 * The per-tier step absorbs those multipliers instead: the frontier always
 * pays back in days, never in hours. `npm run sim` is how this was tuned.
 *
 * Within a tier, payback is set by **level**: cost grows 1.11× a level while
 * output doubles every ten. That is why `BUILDING_MILESTONE_INTERVAL` still
 * matters most in this file's neighbourhood — at the old six scattered
 * thresholds, every building below the frontier was a trap.
 *
 * ## Why you would buy one tier over another
 *
 * Since payback only nudges between neighbouring tiers, something else has to. Each
 * tier carries a **specialty**: one thing it improves that no other tier on the
 * home cluster touches — the Greenhouse pays Cinder, the Windmill fills the
 * vault faster, the Foundry holds heat longer. Those advance every
 * `SPECIALTY_INTERVAL` levels, so a building is worth raising for a reason that
 * survives the arithmetic going flat.
 *
 * The ceiling on all of it is the charter (`domain/charter.ts`). Without it the
 * ten-level doublings would make it optimal to pour everything into whichever
 * building happened to be cheapest; the charter only lifts for a city that has
 * gone wide, so the ladder gets climbed rather than exploited.
 *
 * Output is no longer paid in a lump at review time — it accrues into the
 * vault around the clock (`domain/vault.ts`). The `incomePerLevel` figures are
 * still quoted per *day*, so the ladder arithmetic above is unchanged; what
 * changed is when you get to hold it. A day with no review logged accrues at a
 * trickle, so the curve is still one that can only be climbed by showing up.
 *
 * The first twelve tiers stand on the home cluster. The eight above them stand
 * on the high islands, two per altitude band, and are hidden until an ascension
 * has climbed the city into that band — so the ladder keeps going exactly where
 * the home islands run out of room. Their costs run past what float64 holds
 * exactly, which is fine: nothing here is ever shown to more than three
 * significant figures (see `domain/bignum.ts`).
 */
import type { IslandId } from './islands';

/**
 * What a building improves besides its own Lumen.
 *
 * Every kind here lands on a field that already exists in `Mods` or
 * `ResearchMods`, so a specialty reaches its system through the same seam a
 * perk or a research node does — see `domain/specialties.ts`. Adding a new one
 * means adding a case there, not a new path through the payouts.
 */
export type SpecialtyKind =
  /** Flat extra Cinder on every full clear. */
  | 'cinder-flat'
  /** Multiplies Cinder earned. */
  | 'cinder'
  /** Multiplies how fast the vault fills. */
  | 'vault-rate'
  /** Multiplies the vault's ceiling. */
  | 'vault-cap'
  /** Extra minutes on every collection window. */
  | 'window-minutes'
  /** Raises the share a review-less day accrues at. */
  | 'idle-share'
  /** Multiplies the Lumen a review pays. */
  | 'review'
  /** Multiplies the city's whole output. */
  | 'output'
  /** Multiplies what a mote is worth. */
  | 'mote'
  /** Extra mote charges per review. Fractional steps round down. */
  | 'mote-charges'
  /** Added to the ordinary chest's cosmetic drop chance. */
  | 'drop'
  /** Extra days before heat stops building. */
  | 'heat-cap'
  /** Multiplies the Aether an ascension grants. */
  | 'aether'
  /** Scales building prices. Below 1 is a discount. */
  | 'cost'
  /** Added to the streak multiplier's cap. */
  | 'streak-cap';

/**
 * A building's second job — the reason to level it that has nothing to do with
 * how much Lumen it pays.
 *
 * One step is earned per `SPECIALTY_INTERVAL` levels, five in all. `perStep` is
 * whatever one step is worth: a factor for the multiplying kinds, an addend for
 * the rest. `label` names the thing improved in two or three words, for the
 * shop card; the card computes the numbers itself.
 */
export interface SpecialtyDef {
  kind: SpecialtyKind;
  perStep: number;
  label: string;
}

export interface BuildingDef {
  id: string;
  name: string;
  flavor: string;
  /** Lumen per review day contributed by each level, before multipliers. */
  incomePerLevel: number;
  /** Price of the first level. Every level after costs `BUILDING_COST_GROWTH`× more. */
  baseCost: number;
  /** Which island the building sits on — see `config/islands.ts`. */
  island: IslandId;
  /** Position along that island's build slots (0 = leftmost). */
  slot: number;
  /**
   * Optional neighbour bonus: every level of `from` adds `perLevel` to this
   * building's output multiplier. Small numbers — these compound.
   */
  synergy?: { from: string; perLevel: number };
  /**
   * What levelling this building improves besides its own output. No two tiers
   * on the home cluster share one, which is what makes the ladder a set of
   * choices rather than one curve drawn twelve times.
   */
  specialty: SpecialtyDef;
}

export type CosmeticSlot = 'lanterns' | 'skyline' | 'companion' | 'banner';

export interface CosmeticDef {
  id: string;
  name: string;
  flavor: string;
  slot: CosmeticSlot;
  /** Lumen price in the shop. Chest drops unlock the same items for free. */
  cost: number;
  /** Relative likelihood of being the cosmetic a chest drops. */
  dropWeight: number;
}

/**
 * Ordered cheapest to dearest. The first five ids are the original set and
 * must keep their names — existing saves reference them.
 */
export const BUILDINGS: BuildingDef[] = [
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    flavor: 'Warm glass, cold altitude. Somehow the tomatoes manage.',
    incomePerLevel: 3.3,
    baseCost: 20,
    island: 'main',
    slot: 0,
    specialty: { kind: 'cinder-flat', perStep: 1, label: 'Cinder per full clear' },
  },
  {
    id: 'windmill',
    name: 'Windmill',
    flavor: 'There is never a shortage of wind up here.',
    incomePerLevel: 33,
    baseCost: 260,
    island: 'west',
    slot: 0,
    synergy: { from: 'greenhouse', perLevel: 0.01 },
    specialty: { kind: 'vault-rate', perStep: 1.06, label: 'vault fill rate' },
  },
  {
    id: 'market-stall',
    name: 'Market Stall',
    flavor: 'Trades with the ground twice a week, weather permitting.',
    incomePerLevel: 340,
    baseCost: 3_400,
    island: 'main',
    slot: 1,
    synergy: { from: 'greenhouse', perLevel: 0.01 },
    specialty: { kind: 'review', perStep: 1.08, label: 'Lumen from reviews' },
  },
  {
    id: 'lighthouse',
    name: 'Lighthouse',
    flavor: 'Marks the edge of the cloud shelf. Visible for miles.',
    incomePerLevel: 3400,
    baseCost: 45_000,
    island: 'east',
    slot: 0,
    specialty: { kind: 'mote', perStep: 1.15, label: 'mote value' },
  },
  {
    id: 'observatory',
    name: 'Observatory',
    flavor: 'Points away from the ground, mostly.',
    incomePerLevel: 34_000,
    baseCost: 580_000,
    island: 'east',
    slot: 1,
    synergy: { from: 'lighthouse', perLevel: 0.01 },
    specialty: { kind: 'drop', perStep: 0.04, label: 'cosmetic drop chance' },
  },
  {
    id: 'foundry',
    name: 'Foundry',
    flavor: 'Runs hot enough that the frost never settles on its roof.',
    incomePerLevel: 340_000,
    baseCost: 7_500_000,
    island: 'west',
    slot: 1,
    specialty: { kind: 'heat-cap', perStep: 3, label: 'days before heat caps' },
  },
  {
    id: 'aviary',
    name: 'Aviary',
    flavor: 'Half the birds were born up here and have never landed.',
    incomePerLevel: 3_400_000,
    baseCost: 98_000_000,
    island: 'main',
    slot: 2,
    synergy: { from: 'greenhouse', perLevel: 0.02 },
    specialty: { kind: 'mote-charges', perStep: 0.5, label: 'motes per review' },
  },
  {
    id: 'cloudloom',
    name: 'Cloudloom',
    flavor: 'Spins the cloud shelf into something you can fold and sell.',
    incomePerLevel: 35_000_000,
    baseCost: 1_300_000_000,
    island: 'west',
    slot: 2,
    synergy: { from: 'windmill', perLevel: 0.02 },
    specialty: { kind: 'vault-cap', perStep: 1.2, label: 'vault capacity' },
  },
  {
    id: 'skydock',
    name: 'Skydock',
    flavor: 'Everything that arrives, arrives here first.',
    incomePerLevel: 350_000_000,
    baseCost: 17_000_000_000,
    island: 'east',
    slot: 2,
    synergy: { from: 'market-stall', perLevel: 0.02 },
    specialty: {
      kind: 'window-minutes',
      perStep: 10,
      label: 'minutes per collection window',
    },
  },
  {
    id: 'aether-well',
    name: 'Aether Well',
    flavor: 'Drilled upward. Nobody has found the far end of it.',
    incomePerLevel: 3_500_000_000,
    baseCost: 220_000_000_000,
    island: 'main',
    slot: 3,
    specialty: { kind: 'aether', perStep: 1.06, label: 'Aether per ascension' },
  },
  {
    id: 'starforge',
    name: 'Starforge',
    flavor: 'Makes light the hard way, and sells the surplus.',
    incomePerLevel: 35_000_000_000,
    baseCost: 2_900_000_000_000,
    island: 'west',
    slot: 3,
    synergy: { from: 'foundry', perLevel: 0.03 },
    specialty: { kind: 'cost', perStep: 0.97, label: 'building prices' },
  },
  {
    id: 'anchor-spire',
    name: 'Anchor Spire',
    flavor: 'Holds the whole cluster in place. Or so the plaque claims.',
    incomePerLevel: 350_000_000_000,
    baseCost: 38_000_000_000_000,
    island: 'east',
    slot: 3,
    synergy: { from: 'aether-well', perLevel: 0.03 },
    specialty: { kind: 'idle-share', perStep: 0.03, label: 'accrual on a quiet day' },
  },

  /* --- The high islands. Unlocked one band at a time by ascending. --- */
  {
    id: 'stormspire',
    name: 'Stormspire',
    flavor: 'Draws the weather up here to it, and keeps the change.',
    incomePerLevel: 3_600_000_000_000,
    baseCost: 5.0e14,
    island: 'cirrus',
    slot: 0,
    synergy: { from: 'anchor-spire', perLevel: 0.03 },
    specialty: { kind: 'heat-cap', perStep: 4, label: 'days before heat caps' },
  },
  {
    id: 'frostworks',
    name: 'Frostworks',
    flavor: 'Cuts the cirrus into panes and ships them south.',
    incomePerLevel: 36_000_000_000_000,
    baseCost: 6.6e15,
    island: 'cirrus',
    slot: 1,
    synergy: { from: 'foundry', perLevel: 0.03 },
    specialty: { kind: 'cinder', perStep: 1.08, label: 'Cinder earned' },
  },
  {
    id: 'heliostat',
    name: 'Heliostat Array',
    flavor: 'Follows a sun that never sets at this height.',
    incomePerLevel: 3.6e14,
    baseCost: 8.5e16,
    island: 'stratos',
    slot: 0,
    synergy: { from: 'observatory', perLevel: 0.03 },
    specialty: { kind: 'output', perStep: 1.1, label: 'city output' },
  },
  {
    id: 'silent-vault',
    name: 'Silent Vault',
    flavor: 'Above the weather, nothing it stores ever spoils.',
    incomePerLevel: 3.6e15,
    baseCost: 1.1e18,
    island: 'stratos',
    slot: 1,
    synergy: { from: 'skydock', perLevel: 0.03 },
    specialty: { kind: 'vault-cap', perStep: 1.3, label: 'vault capacity' },
  },
  {
    id: 'aurora-font',
    name: 'Aurora Font',
    flavor: 'Taps the colour the sky refuses to account for.',
    incomePerLevel: 3.5e16,
    baseCost: 1.4e19,
    island: 'aurora',
    slot: 0,
    synergy: { from: 'aether-well', perLevel: 0.04 },
    specialty: { kind: 'mote', perStep: 1.25, label: 'mote value' },
  },
  {
    id: 'prism-hall',
    name: 'Prism Hall',
    flavor: 'Splits the aurora into something you can weigh and sell.',
    incomePerLevel: 3.7e17,
    baseCost: 1.9e20,
    island: 'aurora',
    slot: 1,
    synergy: { from: 'cloudloom', perLevel: 0.04 },
    specialty: { kind: 'drop', perStep: 0.05, label: 'cosmetic drop chance' },
  },
  {
    id: 'starwell',
    name: 'Starwell',
    flavor: 'Drops toward the dark until the stars are underfoot.',
    incomePerLevel: 3.6e18,
    baseCost: 2.4e21,
    island: 'deepdark',
    slot: 0,
    synergy: { from: 'starforge', perLevel: 0.04 },
    specialty: { kind: 'aether', perStep: 1.1, label: 'Aether per ascension' },
  },
  {
    id: 'void-anchor',
    name: 'Void Anchor',
    flavor: 'Holds the whole climb steady against nothing at all.',
    incomePerLevel: 3.6e19,
    baseCost: 3.2e22,
    island: 'deepdark',
    slot: 1,
    synergy: { from: 'anchor-spire', perLevel: 0.04 },
    specialty: { kind: 'streak-cap', perStep: 2, label: 'days of streak multiplier' },
  },
];

export const COSMETICS: CosmeticDef[] = [
  {
    id: 'teal-lanterns',
    name: 'Teal Lanterns',
    flavor: 'Strung between the rooftops. Pale green, always lit.',
    slot: 'lanterns',
    cost: 300,
    dropWeight: 3,
  },
  {
    id: 'amber-lanterns',
    name: 'Amber Lanterns',
    flavor: 'The colour of the hour just after sunrise.',
    slot: 'lanterns',
    cost: 300,
    dropWeight: 3,
  },
  {
    id: 'rose-skyline',
    name: 'Rose Cloudbank',
    flavor: 'Tints the whole cloud shelf a slow, unhurried pink.',
    slot: 'skyline',
    cost: 450,
    dropWeight: 2,
  },
  {
    id: 'violet-skyline',
    name: 'Violet Cloudbank',
    flavor: 'Deeper clouds, for cities that keep late hours.',
    slot: 'skyline',
    cost: 450,
    dropWeight: 2,
  },
  {
    id: 'sky-whale',
    name: 'Sky Whale',
    flavor: 'Drifts past on its own schedule. Nobody has named it.',
    slot: 'companion',
    cost: 900,
    dropWeight: 1,
  },
  {
    id: 'paper-kite',
    name: 'Paper Kite',
    flavor: 'Cut loose from somewhere below. It stayed.',
    slot: 'companion',
    cost: 600,
    dropWeight: 2,
  },
  {
    id: 'harbour-banner',
    name: 'Harbour Banner',
    flavor: 'Long, split-tailed, and permanently mid-snap.',
    slot: 'banner',
    cost: 350,
    dropWeight: 2,
  },
  {
    id: 'signal-pennants',
    name: 'Signal Pennants',
    flavor: 'Spells something in a code no one up here reads.',
    slot: 'banner',
    cost: 350,
    dropWeight: 2,
  },
];

const BUILDING_BY_ID = new Map(BUILDINGS.map((building) => [building.id, building]));
const COSMETIC_BY_ID = new Map(COSMETICS.map((cosmetic) => [cosmetic.id, cosmetic]));

export function getBuilding(id: string): BuildingDef | undefined {
  return BUILDING_BY_ID.get(id);
}

export function getCosmetic(id: string): CosmeticDef | undefined {
  return COSMETIC_BY_ID.get(id);
}
