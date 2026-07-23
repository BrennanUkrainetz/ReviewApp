/**
 * The world map: the islands Aerie is built on, grouped into the pages you pan
 * between, and the altitude each page unlocks at.
 *
 * The scene used to hold this geometry inline. It moved here because two places
 * now need it: `scene/city-scene.ts` draws the islands, and `domain/economy.ts`
 * has to know which ascension a building's island unlocks at — a tier on an
 * island you cannot reach yet must not appear in the shop.
 *
 * ## Pages and altitude
 *
 * Page 0 is the home cluster the city started on — the three islands with the
 * bridges between them — and is always visible. Every page after it is a new
 * island that only appears once the city has ascended into the matching
 * altitude band (`config/ascension.ts`): page N unlocks at ascension N. So the
 * left/right arrows pan across exactly the islands you have actually climbed
 * to, and each ascension adds one more panel of sky to the right.
 *
 * Pages after the home cluster are deliberately sparse — a single island each.
 * The bands they belong to are described as thinning out ("Nothing up here
 * moves but you"), and an emptier panel reads as higher, not unfinished.
 */
import { ALTITUDE_BANDS } from './ascension';

export type IslandId =
  | 'west'
  | 'main'
  | 'east'
  | 'cirrus'
  | 'stratos'
  | 'aurora'
  | 'deepdark';

export interface IslandSpec {
  id: IslandId;
  cx: number;
  cy: number;
  rx: number;
  /** Ground points for shop buildings, in absolute scene coordinates. */
  slots: { x: number; y: number }[];
  /** Seconds per bob cycle — deliberately different so they never sync up. */
  driftDuration: number;
}

export interface BridgeSpec {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface IslandPage {
  index: number;
  /** Altitude band this page belongs to — the name shown on the pager. */
  name: string;
  blurb: string;
  /** Ascension count at or above which this page is reachable. */
  unlockAtAscension: number;
  islands: IslandSpec[];
  bridges: BridgeSpec[];
}

/**
 * One page is one scene-width wide. Page N is authored in absolute coordinates
 * offset by `N * PAGE_WIDTH`, so the whole strip lives in one coordinate system
 * and paging is a single horizontal translate of the world.
 */
export const PAGE_WIDTH = 1200;

/** Band name/blurb for a page, falling back gracefully past the last band. */
function band(index: number): { name: string; blurb: string } {
  const entry = ALTITUDE_BANDS[Math.min(index, ALTITUDE_BANDS.length - 1)];
  return { name: entry?.name ?? 'Aerie', blurb: entry?.blurb ?? '' };
}

/**
 * The home cluster: the three original islands and the rope bridges between
 * them. Coordinates are unchanged from when this lived in the scene, so the
 * opening view is pixel-for-pixel what it always was.
 */
const HOME: IslandPage = {
  index: 0,
  ...band(0),
  unlockAtAscension: 0,
  islands: [
    {
      id: 'west',
      cx: 235,
      cy: 322,
      rx: 118,
      // Pulled in from the island's true edges — a heavily-levelled building
      // grows side wings, and those must not hang out over open sky.
      slots: [
        { x: 208, y: 300 },
        { x: 270, y: 308 },
        { x: 178, y: 322 },
        { x: 246, y: 330 },
      ],
      driftDuration: 19,
    },
    {
      id: 'main',
      cx: 600,
      cy: 430,
      rx: 192,
      slots: [
        { x: 540, y: 404 },
        { x: 664, y: 412 },
        { x: 468, y: 430 },
        { x: 716, y: 442 },
      ],
      driftDuration: 23,
    },
    {
      id: 'east',
      cx: 958,
      cy: 486,
      rx: 138,
      slots: [
        { x: 934, y: 460 },
        { x: 1000, y: 470 },
        { x: 902, y: 484 },
        { x: 982, y: 496 },
      ],
      driftDuration: 27,
    },
  ],
  bridges: [
    { from: { x: 325, y: 330 }, to: { x: 445, y: 425 } },
    { from: { x: 760, y: 440 }, to: { x: 852, y: 486 } },
  ],
};

/**
 * A high-altitude page: one island centred in its own panel, carrying two
 * build slots. `offset` places it in the strip; everything else is authored
 * relative to that so the four of them can share one shape.
 */
function reach(
  index: number,
  id: IslandId,
  opts: { cy: number; rx: number; driftDuration: number },
): IslandPage {
  const cx = index * PAGE_WIDTH + PAGE_WIDTH / 2;
  const { cy, rx, driftDuration } = opts;
  return {
    index,
    ...band(index),
    unlockAtAscension: index,
    islands: [
      {
        id,
        cx,
        cy,
        rx,
        slots: [
          { x: cx - rx * 0.34, y: cy - 8 },
          { x: cx + rx * 0.3, y: cy + 4 },
        ],
        driftDuration,
      },
    ],
    bridges: [],
  };
}

/**
 * All island pages, home first, in the order you pan through them. The four
 * high pages map one-to-one onto altitude bands 1–4.
 */
export const ISLAND_PAGES: IslandPage[] = [
  HOME,
  reach(1, 'cirrus', { cy: 372, rx: 150, driftDuration: 21 }),
  reach(2, 'stratos', { cy: 402, rx: 138, driftDuration: 25 }),
  reach(3, 'aurora', { cy: 366, rx: 146, driftDuration: 18 }),
  reach(4, 'deepdark', { cy: 408, rx: 132, driftDuration: 29 }),
];

const ISLAND_BY_ID = new Map<IslandId, IslandSpec>();
const PAGE_BY_ISLAND = new Map<IslandId, IslandPage>();
for (const page of ISLAND_PAGES) {
  for (const spec of page.islands) {
    ISLAND_BY_ID.set(spec.id, spec);
    PAGE_BY_ISLAND.set(spec.id, page);
  }
}

export function islandById(id: IslandId): IslandSpec | undefined {
  return ISLAND_BY_ID.get(id);
}

/** The pages reachable at a given ascension count — home always included. */
export function unlockedPages(ascensionCount: number): IslandPage[] {
  return ISLAND_PAGES.filter((page) => page.unlockAtAscension <= ascensionCount);
}

/** The next page still locked at this ascension count, for the pager's hint. */
export function nextLockedPage(ascensionCount: number): IslandPage | null {
  return ISLAND_PAGES.find((page) => page.unlockAtAscension > ascensionCount) ?? null;
}

/**
 * The ascension count at which a building's island becomes reachable.
 * `Infinity` for an unknown island, so an orphaned tier stays hidden rather
 * than leaking onto the home page.
 */
export function islandUnlockAscension(islandId: string): number {
  return PAGE_BY_ISLAND.get(islandId as IslandId)?.unlockAtAscension ?? Infinity;
}
