/**
 * The buildings — one spec each, drawn by the kit.
 *
 * There are twenty tiers and two hundred levels per tier, so these are
 * composed from the primitives in `kit.ts` rather than drawn one at a time.
 * What distinguishes a building is its proportions, its roof, and its one
 * `feature`: the Windmill's blades, the Lighthouse's beam, the Greenhouse's
 * glass. Everything else — storeys, window grid, the wings that appear at
 * milestone levels — falls out of the level.
 *
 * The Hearth Hall stays hand-drawn. It is the one building that is always
 * there and is never bought a tier at a time, so a spec would only obscure it —
 * but it does now grow, with the city's charter rather than with a level.
 */
import { svg } from '../dom';
import {
  box,
  composeBuilding,
  group,
  rim,
  shape,
  window_,
  type BuildingSpec,
} from './kit';

/* ------------------------------------------------------------------ */
/* The permanent heart of the city — present from the very first day.  */
/* ------------------------------------------------------------------ */

/**
 * The heart of the city, drawn at its charter.
 *
 * The charter is the city's permission to build higher (`domain/charter.ts`),
 * so the hall that holds it has to visibly hold more as it rises — otherwise
 * the one purchase that governs everything else is the only one you cannot see.
 * It grows the way a civic building would: the hall broadens a little, the
 * tower gains a stage per charter, and the beacon climbs with it.
 *
 * Deliberately modest per step. At charter 8 it should still read as the oldest
 * roof on the island rather than as another tier of the ladder.
 */
export function hearthHall(charter = 1): SVGGElement {
  const steps = Math.max(0, Math.floor(charter) - 1);
  const spread = 1 + steps * 0.05;
  const half = 46 * spread;
  const eaves = 38 * spread;
  const wall = -34 - steps * 2;
  const ridge = wall - 28 * spread;
  const tower = 46 + steps * 9;
  const towerTop = wall - tower;

  const node = group(
    'scene-building scene-building--hearth',
    shape(`M${-half} 0 L${-eaves} ${wall} L${eaves} ${wall} L${half} 0 Z`, 'lit'),
    shape(`M${eaves} ${wall} L${half} 0 L${half * 0.57} 0 L${eaves * 0.58} ${wall} Z`, 'shade'),
    shape(`M${-half + 2} ${wall} L0 ${ridge} L${half - 2} ${wall} Z`, 'roof'),
    rim(`M${-half + 2} ${wall} L0 ${ridge}`),
    window_(-30, wall + 8, 11, 14, 2),
    window_(-10, wall + 8, 11, 14, 2),
    window_(10, wall + 8, 11, 14, 2),
    box(28, towerTop, 9, tower, 'shade', 2),
    svg('circle', {
      cx: 32.5,
      cy: towerTop - 4,
      r: 6,
      fill: 'var(--scene-window)',
      opacity: 'var(--scene-window-opacity)',
      class: 'scene__beacon',
    }),
  );

  // One lit stage per charter earned, climbing the tower.
  for (let i = 0; i < steps; i += 1) {
    node.appendChild(window_(29.5, towerTop + 14 + i * 16, 6, 9, 1.5));
  }
  return node;
}

/* ------------------------------------------------------------------ */
/* Shop buildings                                                      */
/* ------------------------------------------------------------------ */

/**
 * Keyed by the ids in `config/shop.ts`. Roughly ordered by how much presence a
 * tier should have: the Greenhouse is a wide low shed, the Anchor Spire is a
 * narrow tower, and the ladder between them reads as a skyline.
 */
const SPECS: Record<string, BuildingSpec> = {
  greenhouse: { width: 34, height: 46, taper: 0.42, roof: 'peak', feature: 'glass' },
  windmill: {
    width: 19,
    height: 58,
    taper: 0.32,
    roof: 'peak',
    feature: 'blades',
    columns: 1,
  },
  'market-stall': {
    width: 34,
    height: 26,
    taper: 0.05,
    roof: 'flat',
    feature: 'awning',
    columns: 4,
  },
  lighthouse: {
    width: 20,
    height: 86,
    taper: 0.4,
    roof: 'flat',
    feature: 'beam',
    columns: 1,
  },
  observatory: {
    width: 30,
    height: 42,
    taper: 0.2,
    roof: 'dome',
    feature: 'telescope',
    columns: 2,
  },
  foundry: {
    width: 32,
    height: 50,
    taper: 0.1,
    roof: 'shed',
    feature: 'furnace',
    columns: 3,
  },
  aviary: { width: 28, height: 40, taper: 0.15, roof: 'flat', feature: 'aviary' },
  cloudloom: {
    width: 30,
    height: 54,
    taper: 0.18,
    roof: 'flat',
    feature: 'loom',
    columns: 3,
  },
  skydock: {
    width: 26,
    height: 62,
    taper: 0.22,
    roof: 'stepped',
    feature: 'gantry',
    columns: 2,
  },
  'aether-well': {
    width: 26,
    height: 44,
    taper: 0.12,
    roof: 'flat',
    feature: 'well',
    columns: 2,
  },
  starforge: {
    width: 30,
    height: 66,
    taper: 0.28,
    roof: 'stepped',
    feature: 'forge',
    columns: 3,
  },
  'anchor-spire': {
    width: 22,
    height: 96,
    taper: 0.45,
    roof: 'stepped',
    feature: 'anchor',
    columns: 2,
  },

  // The high islands: taller, narrower, more austere the further the city
  // climbs — the skyline keeps rising as the ladder does.
  stormspire: {
    width: 20,
    height: 88,
    taper: 0.44,
    roof: 'stepped',
    feature: 'beam',
    columns: 1,
  },
  frostworks: { width: 28, height: 56, taper: 0.2, roof: 'peak', feature: 'glass', columns: 2 },
  heliostat: {
    width: 26,
    height: 52,
    taper: 0.18,
    roof: 'dome',
    feature: 'telescope',
    columns: 2,
  },
  'silent-vault': {
    width: 30,
    height: 48,
    taper: 0.12,
    roof: 'flat',
    feature: 'well',
    columns: 3,
  },
  'aurora-font': {
    width: 28,
    height: 60,
    taper: 0.22,
    roof: 'stepped',
    feature: 'loom',
    columns: 3,
  },
  'prism-hall': { width: 30, height: 50, taper: 0.16, roof: 'peak', feature: 'glass', columns: 3 },
  starwell: { width: 24, height: 58, taper: 0.14, roof: 'flat', feature: 'well', columns: 2 },
  'void-anchor': {
    width: 22,
    height: 100,
    taper: 0.46,
    roof: 'stepped',
    feature: 'anchor',
    columns: 2,
  },
};

/** Draws an owned building at its current level, or `null` if unknown. */
export function renderBuilding(id: string, level: number): SVGGElement | null {
  const spec = SPECS[id];
  if (!spec) return null;
  return composeBuilding(`scene-building--${id}`, spec, Math.max(1, level));
}

/** Exposed for tests: every catalogue id should have a spec here. */
export function buildingSpec(id: string): BuildingSpec | undefined {
  return SPECS[id];
}
