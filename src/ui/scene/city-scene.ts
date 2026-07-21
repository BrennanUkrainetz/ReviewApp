/**
 * The city scene: a fixed-angle SVG view of Aerie, lit entirely by the current
 * streak (see `palette.ts`).
 *
 * The scene is drawn once and then only *re-lit* on state changes — colours
 * live in CSS custom properties, so a streak change is a single variable write
 * that the browser transitions across the whole picture. Buildings are the one
 * part that gets re-rendered, and only when the owned set actually changes.
 */
import { getBuilding, getCosmetic } from '@/config/shop';
import type { AerieState } from '@/state/types';
import type { Store } from '@/state/store';
import { el, svg } from '../dom';
import { hearthHall, renderBuilding } from './buildings';
import { renderCosmetic, SLOT_DEPTH } from './cosmetics';
import { paletteForProgress, paletteToCssVars, streakProgress } from './palette';

const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 660;

interface IslandSpec {
  id: 'main' | 'west' | 'east';
  cx: number;
  cy: number;
  rx: number;
  /** Ground points for shop buildings, in scene coordinates. */
  slots: { x: number; y: number }[];
  /** Seconds per bob cycle — deliberately different so they never sync up. */
  driftDuration: number;
}

const ISLANDS: IslandSpec[] = [
  {
    id: 'west',
    cx: 235,
    cy: 322,
    rx: 118,
    slots: [{ x: 235, y: 316 }],
    driftDuration: 19,
  },
  {
    id: 'main',
    cx: 600,
    cy: 430,
    rx: 192,
    slots: [
      { x: 492, y: 424 },
      { x: 712, y: 436 },
    ],
    driftDuration: 23,
  },
  {
    id: 'east',
    cx: 958,
    cy: 486,
    rx: 138,
    slots: [
      { x: 908, y: 478 },
      { x: 1012, y: 490 },
    ],
    driftDuration: 27,
  },
];

/** Small deterministic PRNG so the starfield is identical on every load. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStars(): SVGGElement {
  const random = mulberry32(20260721);
  const group = svg('g', { class: 'scene__stars' });
  for (let i = 0; i < 90; i += 1) {
    const x = random() * VIEW_WIDTH;
    const y = random() * (VIEW_HEIGHT * 0.62);
    const r = 0.6 + random() * 1.3;
    group.appendChild(
      svg('circle', {
        cx: Math.round(x),
        cy: Math.round(y),
        r: r.toFixed(2),
        fill: '#ffefd6',
        opacity: (0.35 + random() * 0.65).toFixed(2),
      }),
    );
  }
  return group;
}

/** One puffy cloud built from overlapping ellipses. */
function cloud(x: number, y: number, scale: number, fill: string, opacity: number): SVGGElement {
  const puffs: [number, number, number, number][] = [
    [0, 0, 62, 26],
    [-46, 8, 40, 20],
    [44, 7, 44, 21],
    [-18, -12, 40, 22],
    [22, -14, 36, 20],
  ];
  return svg(
    'g',
    { transform: `translate(${x} ${y}) scale(${scale})`, opacity: String(opacity) },
    ...puffs.map(([cx, cy, rx, ry]) => svg('ellipse', { cx, cy, rx, ry, fill })),
  );
}

/**
 * A horizontally looping band of clouds. The band is drawn twice, side by
 * side, and translated by exactly one width — so the loop has no seam.
 */
function cloudBand(
  className: string,
  clouds: { x: number; y: number; scale: number }[],
  fill: string,
  opacity: number,
  durationSeconds: number,
): SVGGElement {
  const band = svg('g', {});
  for (const spec of clouds) {
    band.appendChild(cloud(spec.x, spec.y, spec.scale, fill, opacity));
    band.appendChild(cloud(spec.x + VIEW_WIDTH, spec.y, spec.scale, fill, opacity));
  }
  return svg(
    'g',
    { class: `scene__cloud-band ${className}`, style: `--drift-duration:${durationSeconds}s` },
    band,
  );
}

function island(spec: IslandSpec): SVGGElement {
  const { cx, cy, rx } = spec;
  const ry = rx * 0.3;
  const keel = rx * 1.05;

  const roots = svg('path', {
    d: `M${cx - rx * 0.55} ${cy + ry * 0.9}
        q ${rx * 0.1} ${keel * 0.5} ${-rx * 0.06} ${keel * 0.72}
        M${cx + rx * 0.42} ${cy + ry * 0.95}
        q ${rx * 0.08} ${keel * 0.38} ${rx * 0.02} ${keel * 0.55}`,
    fill: 'none',
    stroke: 'var(--scene-island-rock)',
    'stroke-width': 3,
    'stroke-linecap': 'round',
    opacity: 0.85,
  });

  return svg(
    'g',
    {
      class: `scene__island scene__island--${spec.id}`,
      style: `--drift-duration:${spec.driftDuration}s`,
    },
    // Rock underside, tapering to a keel.
    svg('path', {
      d: `M${cx - rx} ${cy}
          C ${cx - rx * 0.86} ${cy + keel * 0.62}, ${cx - rx * 0.28} ${cy + keel * 0.88}, ${cx} ${cy + keel}
          C ${cx + rx * 0.34} ${cy + keel * 0.84}, ${cx + rx * 0.9} ${cy + keel * 0.55}, ${cx + rx} ${cy}
          Z`,
      fill: 'var(--scene-island-rock)',
    }),
    // Crease shadow where rock meets the plateau.
    svg('ellipse', {
      cx,
      cy: cy + ry * 0.32,
      rx: rx * 0.94,
      ry: ry * 0.8,
      fill: 'var(--scene-island-shadow)',
      opacity: 0.55,
    }),
    // Plateau.
    svg('ellipse', { cx, cy, rx, ry, fill: 'var(--scene-island-top)' }),
    // Sunward rim on the plateau edge.
    svg('path', {
      d: `M${cx - rx} ${cy} A${rx} ${ry} 0 0 1 ${cx} ${cy - ry}`,
      fill: 'none',
      stroke: 'var(--scene-rim)',
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
      opacity: 'var(--scene-rim-opacity)',
    }),
    roots,
  );
}

/** A rope bridge slung between two islands. */
function bridge(from: { x: number; y: number }, to: { x: number; y: number }): SVGGElement {
  const midX = (from.x + to.x) / 2;
  const sag = Math.abs(to.x - from.x) * 0.18;
  const midY = Math.max(from.y, to.y) + sag;
  const path = `M${from.x} ${from.y} Q${midX} ${midY} ${to.x} ${to.y}`;

  const planks = svg('g', { opacity: 0.75 });
  const steps = 9;
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    // Quadratic Bézier point.
    const x = (1 - t) ** 2 * from.x + 2 * (1 - t) * t * midX + t ** 2 * to.x;
    const y = (1 - t) ** 2 * from.y + 2 * (1 - t) * t * midY + t ** 2 * to.y;
    planks.appendChild(
      svg('rect', {
        x: x - 5,
        y: y - 1.5,
        width: 10,
        height: 3,
        rx: 1,
        fill: 'var(--scene-facade-shade)',
      }),
    );
  }

  return svg(
    'g',
    { class: 'scene__bridge' },
    svg('path', {
      d: path,
      fill: 'none',
      stroke: 'var(--scene-island-rock)',
      'stroke-width': 2,
    }),
    planks,
  );
}

/**
 * Radial falloffs for the sun. A flat circle reads as a disc pasted on the
 * sky; the glow has to fade to nothing to look like light.
 */
function sceneDefs(): SVGDefsElement {
  const halo = svg(
    'radialGradient',
    { id: 'aerie-sun-halo' },
    svg('stop', { offset: '0%', 'stop-color': 'var(--scene-sun-glow)', 'stop-opacity': '0.55' }),
    svg('stop', { offset: '45%', 'stop-color': 'var(--scene-sun-glow)', 'stop-opacity': '0.22' }),
    svg('stop', { offset: '100%', 'stop-color': 'var(--scene-sun-glow)', 'stop-opacity': '0' }),
  );
  const core = svg(
    'radialGradient',
    { id: 'aerie-sun-core' },
    svg('stop', { offset: '60%', 'stop-color': 'var(--scene-sun-core)', 'stop-opacity': '1' }),
    svg('stop', { offset: '100%', 'stop-color': 'var(--scene-sun-core)', 'stop-opacity': '0' }),
  );
  return svg('defs', {}, halo, core);
}

function sun(): SVGGElement {
  return svg(
    'g',
    { class: 'scene__sun' },
    svg('circle', {
      cx: 0,
      cy: 0,
      r: 260,
      fill: 'url(#aerie-sun-halo)',
      class: 'scene__sun-halo',
    }),
    svg('circle', { cx: 0, cy: 0, r: 62, fill: 'url(#aerie-sun-core)' }),
    svg('circle', { cx: 0, cy: 0, r: 40, fill: 'var(--scene-sun-core)' }),
  );
}

/**
 * Wraps a drawing in a positioning group.
 *
 * Position has to live on an outer <g> because a CSS animation on the drawing
 * itself (the arrival transition) would otherwise override its `transform`
 * attribute and drop the building at the scene origin.
 */
function placeAt(x: number, y: number, node: SVGGElement): SVGGElement {
  return svg('g', { transform: `translate(${x} ${y})` }, node);
}

export interface CityScene {
  el: HTMLElement;
  destroy(): void;
}

/** Text description of the scene for screen readers, updated with state. */
function describeScene(state: AerieState, progress: number): string {
  const light =
    progress < 0.2
      ? 'lit by a cold pre-dawn'
      : progress < 0.5
        ? 'catching the first warm light'
        : progress < 0.85
          ? 'well into a warm sunrise'
          : 'in full golden-hour light';
  const count = state.city.buildings.length;
  const built =
    count === 0
      ? 'Only the hearth hall stands so far.'
      : `${count} ${count === 1 ? 'building stands' : 'buildings stand'} on the islands.`;
  return `The floating city of Aerie, ${light} at a ${state.streak.current}-day streak. ${built}`;
}

export function createCityScene(store: Store): CityScene {
  const buildingLayer = svg('g', { class: 'scene__buildings' });
  const backCosmetics = svg('g', { class: 'scene__cosmetics scene__cosmetics--back' });
  const frontCosmetics = svg('g', { class: 'scene__cosmetics scene__cosmetics--front' });
  const sunGroup = sun();

  const canvas = svg(
    'svg',
    {
      class: 'scene__canvas',
      viewBox: `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`,
      preserveAspectRatio: 'xMidYMid slice',
      role: 'img',
    },
    sceneDefs(),
    buildStars(),
    sunGroup,
    cloudBand(
      'scene__cloud-band--far',
      [
        { x: 120, y: 250, scale: 1.1 },
        { x: 520, y: 200, scale: 0.85 },
        { x: 880, y: 268, scale: 1.25 },
      ],
      'var(--scene-cloud-far)',
      0.55,
      210,
    ),
    cloudBand(
      'scene__cloud-band--mid',
      [
        { x: 260, y: 470, scale: 1.35 },
        { x: 760, y: 520, scale: 1.1 },
        { x: 1080, y: 440, scale: 0.9 },
      ],
      'var(--scene-cloud-near)',
      0.5,
      140,
    ),
    backCosmetics,
    ...ISLANDS.map(island),
    bridge({ x: 325, y: 330 }, { x: 445, y: 425 }),
    bridge({ x: 760, y: 440 }, { x: 852, y: 486 }),
    buildingLayer,
    frontCosmetics,
    cloudBand(
      'scene__cloud-band--near',
      [
        { x: 60, y: 620, scale: 1.7 },
        { x: 640, y: 646, scale: 2.1 },
      ],
      'var(--scene-cloud-highlight)',
      0.32,
      95,
    ),
  );

  const title = svg('title', {});
  canvas.insertBefore(title, canvas.firstChild);

  const root = el('div', { class: 'scene' }, canvas as unknown as HTMLElement);

  // `null` rather than '' so the first pass runs even with nothing built yet —
  // the hearth hall still has to be placed.
  let renderedBuildings: string | null = null;

  function renderBuildings(state: AerieState): void {
    const signature = state.city.buildings
      .map((entry) => `${entry.id}:${entry.level}`)
      .sort()
      .join(',');
    if (signature === renderedBuildings) return;
    renderedBuildings = signature;

    while (buildingLayer.firstChild) buildingLayer.removeChild(buildingLayer.firstChild);

    // The hearth is always there — the city is never empty.
    buildingLayer.appendChild(placeAt(600, 418, hearthHall()));

    // Sort by depth so nearer islands overlap farther ones correctly.
    const owned = [...state.city.buildings].sort((a, b) => {
      const islandOf = (id: string): number =>
        ISLANDS.findIndex((spec) => spec.id === (getBuilding(id)?.island ?? 'main'));
      return islandOf(a.id) - islandOf(b.id);
    });

    for (const entry of owned) {
      const def = getBuilding(entry.id);
      if (!def) continue;
      const spec = ISLANDS.find((candidate) => candidate.id === def.island);
      const slot = spec?.slots[def.slot] ?? spec?.slots[0];
      if (!slot) continue;

      const node = renderBuilding(entry.id, entry.level);
      if (!node) continue;
      buildingLayer.appendChild(placeAt(slot.x, slot.y, node));
    }
  }

  let renderedCosmetics: string | null = null;

  function renderCosmetics(state: AerieState): void {
    const equipped = state.city.cosmetics.equipped;
    const signature = [...equipped].sort().join(',');
    if (signature === renderedCosmetics) return;
    renderedCosmetics = signature;

    for (const layer of [backCosmetics, frontCosmetics]) {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }

    for (const id of equipped) {
      const def = getCosmetic(id);
      const node = renderCosmetic(id);
      if (!def || !node) continue;
      (SLOT_DEPTH[def.slot] === 'back' ? backCosmetics : frontCosmetics).appendChild(node);
    }
  }

  function render(): void {
    const state = store.getState();
    const progress = streakProgress(state.streak.current);
    const palette = paletteForProgress(progress);

    for (const [name, value] of Object.entries(paletteToCssVars(palette))) {
      root.style.setProperty(name, value);
      // The page background shares the sky variables.
      if (name.startsWith('--sky-')) document.documentElement.style.setProperty(name, value);
    }

    const sunX = 268;
    const sunY = VIEW_HEIGHT * (1.02 - palette.sunRise * 0.86);
    sunGroup.setAttribute('transform', `translate(${sunX} ${sunY.toFixed(1)})`);
    sunGroup.setAttribute('opacity', palette.sunOpacity.toFixed(3));

    renderBuildings(state);
    renderCosmetics(state);
    title.textContent = describeScene(state, progress);
    canvas.setAttribute('aria-label', title.textContent);
  }

  render();
  const unsubscribe = store.subscribe(render);

  return { el: root, destroy: unsubscribe };
}
