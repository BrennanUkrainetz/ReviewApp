/**
 * The buildings, drawn as SVG.
 *
 * Every building is authored around a ground-contact origin at (0, 0) with
 * negative Y going up, so the scene can drop one onto any island slot without
 * knowing anything about its shape. Fills reference the lighting custom
 * properties rather than literal colours — that is what lets a purchased
 * building take part in the streak lighting for free.
 */
import { svg } from '../dom';

type Fill = 'lit' | 'shade' | 'roof' | 'rock';

const FILL_VAR: Record<Fill, string> = {
  lit: 'var(--scene-facade-lit)',
  shade: 'var(--scene-facade-shade)',
  roof: 'var(--scene-roof)',
  rock: 'var(--scene-island-rock)',
};

const shape = (d: string, fill: Fill): SVGPathElement => svg('path', { d, fill: FILL_VAR[fill] });

const box = (
  x: number,
  y: number,
  width: number,
  height: number,
  fill: Fill,
  rx = 1,
): SVGRectElement =>
  svg('rect', { x, y, width, height, rx, fill: FILL_VAR[fill] });

/** A lit window — the main carrier of the streak's warmth at building scale. */
const window_ = (x: number, y: number, w: number, h: number, rx = 1): SVGRectElement =>
  svg('rect', {
    x,
    y,
    width: w,
    height: h,
    rx,
    fill: 'var(--scene-window)',
    opacity: 'var(--scene-window-opacity)',
    class: 'scene__window',
  });

/** Warm edge catching the sun, fading out entirely in pre-dawn. */
const rim = (d: string, width = 2): SVGPathElement =>
  svg('path', {
    d,
    fill: 'none',
    stroke: 'var(--scene-rim)',
    'stroke-width': width,
    'stroke-linecap': 'round',
    opacity: 'var(--scene-rim-opacity)',
  });

function group(className: string, ...children: SVGElement[]): SVGGElement {
  return svg('g', { class: className }, ...children);
}

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

function greenhouse(level: number): SVGGElement {
  const node = group(
    'scene-building scene-building--greenhouse',
    shape('M-34 0 L-34 -20 L0 -46 L34 -20 L34 0 Z', 'shade'),
    svg('path', {
      d: 'M-30 0 L-30 -19 L0 -42 L30 -19 L30 0 Z',
      fill: 'var(--scene-window)',
      opacity: 'var(--scene-window-opacity)',
      class: 'scene__window',
    }),
    svg('path', {
      d: 'M0 -42 V0 M-30 -19 H30 M-15 -30 V0 M15 -30 V0',
      stroke: 'var(--scene-facade-shade)',
      'stroke-width': 1.6,
      fill: 'none',
    }),
    rim('M-30 -19 L0 -42 L30 -19'),
  );

  if (level >= 2) node.appendChild(shape('M34 0 L34 -14 L52 -14 L52 0 Z', 'lit'));
  if (level >= 3) {
    node.appendChild(box(-52, -12, 18, 12, 'lit', 2));
    node.appendChild(window_(-49, -9, 12, 6, 1));
  }
  return node;
}

function windmill(level: number): SVGGElement {
  const blades = svg(
    'g',
    { class: 'scene-windmill__blades' },
    svg('path', {
      d: 'M0 -62 L0 -100 M0 -62 L34 -50 M0 -62 L-34 -50 M0 -62 L0 -24',
      stroke: 'var(--scene-facade-lit)',
      'stroke-width': 3.5,
      'stroke-linecap': 'round',
      fill: 'none',
    }),
    svg('circle', { cx: 0, cy: -62, r: 4, fill: 'var(--scene-roof)' }),
  );

  const node = group(
    'scene-building scene-building--windmill',
    shape('M-19 0 L-13 -56 L13 -56 L19 0 Z', 'lit'),
    shape('M13 -56 L19 0 L7 0 L5 -56 Z', 'shade'),
    shape('M-17 -56 L0 -70 L17 -56 Z', 'roof'),
    window_(-7, -42, 12, 13, 2),
    window_(-5, -18, 9, 11, 2),
    rim('M-13 -56 L-19 0'),
    blades,
  );

  if (level >= 2) node.appendChild(box(19, -20, 16, 20, 'shade', 2));
  if (level >= 3) node.appendChild(window_(22, -15, 10, 9, 1));
  return node;
}

function marketStall(level: number): SVGGElement {
  const awning = svg('g', { class: 'scene-stall__awning' });
  for (let i = 0; i < 5; i += 1) {
    awning.appendChild(
      svg('path', {
        d: `M${-40 + i * 16} -34 L${-32 + i * 16} -34 L${-28 + i * 16} -22 L${-36 + i * 16} -22 Z`,
        fill: i % 2 === 0 ? 'var(--scene-roof)' : 'var(--scene-facade-lit)',
      }),
    );
  }

  const node = group(
    'scene-building scene-building--stall',
    shape('M-34 0 L-34 -22 L34 -22 L34 0 Z', 'shade'),
    window_(-26, -18, 52, 10, 2),
    awning,
    svg('path', {
      d: 'M-40 -34 H40',
      stroke: 'var(--scene-facade-lit)',
      'stroke-width': 3,
      'stroke-linecap': 'round',
    }),
    shape('M-40 -34 L-37 0 L-33 0 L-36 -34 Z', 'lit'),
    shape('M40 -34 L37 0 L33 0 L36 -34 Z', 'lit'),
    rim('M-40 -34 H40', 1.5),
  );

  if (level >= 2) {
    node.appendChild(box(38, -14, 14, 14, 'lit', 2));
    node.appendChild(box(42, -20, 6, 6, 'shade', 1));
  }
  if (level >= 3) node.appendChild(box(-54, -12, 14, 12, 'lit', 2));
  return node;
}

function lighthouse(level: number): SVGGElement {
  const node = group(
    'scene-building scene-building--lighthouse',
    shape('M-20 0 L-12 -84 L12 -84 L20 0 Z', 'lit'),
    shape('M12 -84 L20 0 L8 0 L6 -84 Z', 'shade'),
    svg('path', {
      d: 'M-16 -30 L16 -30 M-14 -56 L14 -56',
      stroke: 'var(--scene-facade-shade)',
      'stroke-width': 4,
    }),
    box(-14, -102, 28, 18, 'shade', 2),
    window_(-10, -99, 20, 12, 2),
    shape('M-17 -102 L0 -116 L17 -102 Z', 'roof'),
    svg('path', {
      d: 'M14 -95 L96 -122 L96 -68 Z',
      fill: 'var(--scene-window)',
      opacity: 'var(--scene-window-opacity)',
      class: 'scene__beam',
    }),
    rim('M-12 -84 L-20 0'),
  );

  if (level >= 2) node.appendChild(box(20, -22, 18, 22, 'shade', 2));
  if (level >= 3) node.appendChild(window_(24, -17, 10, 10, 1));
  return node;
}

function observatory(level: number): SVGGElement {
  const node = group(
    'scene-building scene-building--observatory',
    shape('M-30 0 L-24 -40 L24 -40 L30 0 Z', 'lit'),
    shape('M24 -40 L30 0 L14 0 L11 -40 Z', 'shade'),
    window_(-18, -30, 12, 14, 2),
    window_(2, -30, 12, 14, 2),
    svg('path', { d: 'M-28 -40 A28 28 0 0 1 28 -40 Z', fill: 'var(--scene-roof)' }),
    svg('path', {
      d: 'M-6 -40 A28 28 0 0 1 4 -66 L10 -60 A22 22 0 0 0 2 -40 Z',
      fill: 'var(--scene-facade-shade)',
    }),
    svg('path', {
      d: 'M2 -58 L34 -80',
      stroke: 'var(--scene-facade-lit)',
      'stroke-width': 6,
      'stroke-linecap': 'round',
    }),
    rim('M-28 -40 A28 28 0 0 1 28 -40'),
  );

  if (level >= 2) node.appendChild(box(30, -18, 16, 18, 'shade', 2));
  if (level >= 3) {
    node.appendChild(box(-48, -16, 18, 16, 'lit', 2));
    node.appendChild(window_(-44, -12, 10, 8, 1));
  }
  return node;
}

const BUILDERS: Record<string, (level: number) => SVGGElement> = {
  greenhouse,
  windmill,
  'market-stall': marketStall,
  lighthouse,
  observatory,
};

/** Draws an owned building at its current level, or `null` if unknown. */
export function renderBuilding(id: string, level: number): SVGGElement | null {
  const builder = BUILDERS[id];
  return builder ? builder(Math.max(1, level)) : null;
}
