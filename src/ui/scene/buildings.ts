/**
 * The buildings — one spec each, drawn by the kit.
 *
 * There are twelve tiers and two hundred levels per tier, so these are
 * composed from the primitives in `kit.ts` rather than drawn one at a time.
 * What distinguishes a building is its proportions, its roof, and its one
 * `feature`: the Windmill's blades, the Lighthouse's beam, the Greenhouse's
 * glass. Everything else — storeys, window grid, the wings that appear at
 * milestone levels — falls out of the level.
 *
 * The Hearth Hall stays hand-drawn. It is the one building that is always
 * there, is never bought, and never levels, so a spec would only obscure it.
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

export function hearthHall(): SVGGElement {
  return group(
    'scene-building scene-building--hearth',
    shape('M-46 0 L-38 -34 L38 -34 L46 0 Z', 'lit'),
    shape('M38 -34 L46 0 L26 0 L22 -34 Z', 'shade'),
    shape('M-44 -34 L0 -62 L44 -34 Z', 'roof'),
    rim('M-44 -34 L0 -62'),
    window_(-30, -26, 11, 14, 2),
    window_(-10, -26, 11, 14, 2),
    window_(10, -26, 11, 14, 2),
    box(28, -78, 9, 46, 'shade', 2),
    svg('circle', {
      cx: 32.5,
      cy: -82,
      r: 6,
      fill: 'var(--scene-window)',
      opacity: 'var(--scene-window-opacity)',
      class: 'scene__beacon',
    }),
  );
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
