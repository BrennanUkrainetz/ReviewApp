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
 * costs `BUILDING_COST_GROWTH` more than the last, so a building eventually
 * prices itself out and the next tier becomes the better buy — that hand-off
 * is what keeps the whole ladder in play instead of one building soaking up
 * every purchase.
 *
 * `baseCost / incomePerLevel` is held near **2.5** across the ladder: a fresh
 * level pays for itself in about two and a half review days. Reinvesting each
 * day's Lumen therefore compounds at roughly 1.3–1.5× per day, which lands the
 * twelfth tier (tens of trillions) around two months of daily use. Those two
 * numbers — the 13× spacing and the 2.5 payback — are the whole balance; keep
 * them roughly true and new tiers slot in without retuning anything else.
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
    incomePerLevel: 8,
    baseCost: 20,
    island: 'main',
    slot: 0,
  },
  {
    id: 'windmill',
    name: 'Windmill',
    flavor: 'There is never a shortage of wind up here.',
    incomePerLevel: 100,
    baseCost: 260,
    island: 'west',
    slot: 0,
    synergy: { from: 'greenhouse', perLevel: 0.01 },
  },
  {
    id: 'market-stall',
    name: 'Market Stall',
    flavor: 'Trades with the ground twice a week, weather permitting.',
    incomePerLevel: 1_300,
    baseCost: 3_400,
    island: 'main',
    slot: 1,
    synergy: { from: 'greenhouse', perLevel: 0.01 },
  },
  {
    id: 'lighthouse',
    name: 'Lighthouse',
    flavor: 'Marks the edge of the cloud shelf. Visible for miles.',
    incomePerLevel: 17_000,
    baseCost: 45_000,
    island: 'east',
    slot: 0,
  },
  {
    id: 'observatory',
    name: 'Observatory',
    flavor: 'Points away from the ground, mostly.',
    incomePerLevel: 225_000,
    baseCost: 580_000,
    island: 'east',
    slot: 1,
    synergy: { from: 'lighthouse', perLevel: 0.01 },
  },
  {
    id: 'foundry',
    name: 'Foundry',
    flavor: 'Runs hot enough that the frost never settles on its roof.',
    incomePerLevel: 2_900_000,
    baseCost: 7_500_000,
    island: 'west',
    slot: 1,
  },
  {
    id: 'aviary',
    name: 'Aviary',
    flavor: 'Half the birds were born up here and have never landed.',
    incomePerLevel: 38_000_000,
    baseCost: 98_000_000,
    island: 'main',
    slot: 2,
    synergy: { from: 'greenhouse', perLevel: 0.02 },
  },
  {
    id: 'cloudloom',
    name: 'Cloudloom',
    flavor: 'Spins the cloud shelf into something you can fold and sell.',
    incomePerLevel: 500_000_000,
    baseCost: 1_300_000_000,
    island: 'west',
    slot: 2,
    synergy: { from: 'windmill', perLevel: 0.02 },
  },
  {
    id: 'skydock',
    name: 'Skydock',
    flavor: 'Everything that arrives, arrives here first.',
    incomePerLevel: 6_500_000_000,
    baseCost: 17_000_000_000,
    island: 'east',
    slot: 2,
    synergy: { from: 'market-stall', perLevel: 0.02 },
  },
  {
    id: 'aether-well',
    name: 'Aether Well',
    flavor: 'Drilled upward. Nobody has found the far end of it.',
    incomePerLevel: 85_000_000_000,
    baseCost: 220_000_000_000,
    island: 'main',
    slot: 3,
  },
  {
    id: 'starforge',
    name: 'Starforge',
    flavor: 'Makes light the hard way, and sells the surplus.',
    incomePerLevel: 1_100_000_000_000,
    baseCost: 2_900_000_000_000,
    island: 'west',
    slot: 3,
    synergy: { from: 'foundry', perLevel: 0.03 },
  },
  {
    id: 'anchor-spire',
    name: 'Anchor Spire',
    flavor: 'Holds the whole cluster in place. Or so the plaque claims.',
    incomePerLevel: 15_000_000_000_000,
    baseCost: 38_000_000_000_000,
    island: 'east',
    slot: 3,
    synergy: { from: 'aether-well', perLevel: 0.03 },
  },

  /* --- The high islands. Unlocked one band at a time by ascending. --- */
  {
    id: 'stormspire',
    name: 'Stormspire',
    flavor: 'Draws the weather up here to it, and keeps the change.',
    incomePerLevel: 2.0e14,
    baseCost: 5.0e14,
    island: 'cirrus',
    slot: 0,
    synergy: { from: 'anchor-spire', perLevel: 0.03 },
  },
  {
    id: 'frostworks',
    name: 'Frostworks',
    flavor: 'Cuts the cirrus into panes and ships them south.',
    incomePerLevel: 2.6e15,
    baseCost: 6.6e15,
    island: 'cirrus',
    slot: 1,
    synergy: { from: 'foundry', perLevel: 0.03 },
  },
  {
    id: 'heliostat',
    name: 'Heliostat Array',
    flavor: 'Follows a sun that never sets at this height.',
    incomePerLevel: 3.4e16,
    baseCost: 8.5e16,
    island: 'stratos',
    slot: 0,
    synergy: { from: 'observatory', perLevel: 0.03 },
  },
  {
    id: 'silent-vault',
    name: 'Silent Vault',
    flavor: 'Above the weather, nothing it stores ever spoils.',
    incomePerLevel: 4.4e17,
    baseCost: 1.1e18,
    island: 'stratos',
    slot: 1,
    synergy: { from: 'skydock', perLevel: 0.03 },
  },
  {
    id: 'aurora-font',
    name: 'Aurora Font',
    flavor: 'Taps the colour the sky refuses to account for.',
    incomePerLevel: 5.7e18,
    baseCost: 1.4e19,
    island: 'aurora',
    slot: 0,
    synergy: { from: 'aether-well', perLevel: 0.04 },
  },
  {
    id: 'prism-hall',
    name: 'Prism Hall',
    flavor: 'Splits the aurora into something you can weigh and sell.',
    incomePerLevel: 7.4e19,
    baseCost: 1.9e20,
    island: 'aurora',
    slot: 1,
    synergy: { from: 'cloudloom', perLevel: 0.04 },
  },
  {
    id: 'starwell',
    name: 'Starwell',
    flavor: 'Drops toward the dark until the stars are underfoot.',
    incomePerLevel: 9.6e20,
    baseCost: 2.4e21,
    island: 'deepdark',
    slot: 0,
    synergy: { from: 'starforge', perLevel: 0.04 },
  },
  {
    id: 'void-anchor',
    name: 'Void Anchor',
    flavor: 'Holds the whole climb steady against nothing at all.',
    incomePerLevel: 1.25e22,
    baseCost: 3.2e22,
    island: 'deepdark',
    slot: 1,
    synergy: { from: 'anchor-spire', perLevel: 0.04 },
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
