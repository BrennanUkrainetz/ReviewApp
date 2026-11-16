/**
 * The building kit — shape primitives the twelve buildings are composed from.
 *
 * Twelve bespoke drawings would be twelve things to keep in visual agreement,
 * and levels that go to 200 cannot each be drawn by hand anyway. So a building
 * is a small **spec** — a mass, a roof, and one distinctive feature — and this
 * module turns that plus a level into SVG.
 *
 * Two rules carried over from the hand-drawn set, both load-bearing:
 *
 * - Every shape is authored around a ground-contact origin at (0, 0), with
 *   negative Y going up, so the scene can drop one onto any slot without
 *   knowing its shape.
 * - Nothing holds a literal colour. Fills reference the lighting custom
 *   properties, which is what lets a building drawn today take part in the
 *   streak lighting and the altitude bands for free.
 */
import { BUILDING_MILESTONE_INTERVAL } from '@/config/tuning';
import { svg } from '../dom';

export type Fill = 'lit' | 'shade' | 'roof' | 'rock';

const FILL_VAR: Record<Fill, string> = {
  lit: 'var(--scene-facade-lit)',
  shade: 'var(--scene-facade-shade)',
  roof: 'var(--scene-roof)',
  rock: 'var(--scene-island-rock)',
};

export const shape = (d: string, fill: Fill): SVGPathElement =>
  svg('path', { d, fill: FILL_VAR[fill] });

export const box = (
  x: number,
  y: number,
  width: number,
  height: number,
  fill: Fill,
  rx = 1,
): SVGRectElement => svg('rect', { x, y, width, height, rx, fill: FILL_VAR[fill] });

/** A lit window — the main carrier of the streak's warmth at building scale. */
export const window_ = (
  x: number,
  y: number,
  w: number,
  h: number,
  rx = 1,
): SVGRectElement =>
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
export const rim = (d: string, width = 2): SVGPathElement =>
  svg('path', {
    d,
    fill: 'none',
    stroke: 'var(--scene-rim)',
    'stroke-width': width,
    'stroke-linecap': 'round',
    opacity: 'var(--scene-rim-opacity)',
  });

export function group(
  className: string,
  ...children: (SVGElement | null)[]
): SVGGElement {
  return svg(
    'g',
    { class: className },
    ...children.filter((child): child is SVGElement => !!child),
  );
}

/* ------------------------------------------------------------------ */
/* The spec                                                            */
/* ------------------------------------------------------------------ */

export type RoofKind = 'flat' | 'peak' | 'dome' | 'shed' | 'stepped';

export type FeatureKind =
  | 'glass'
  | 'blades'
  | 'awning'
  | 'beam'
  | 'telescope'
  | 'furnace'
  | 'aviary'
  | 'loom'
  | 'gantry'
  | 'well'
  | 'forge'
  | 'anchor';

export interface BuildingSpec {
  /** Half-width at the base. */
  width: number;
  /** Height at level 1. */
  height: number;
  /** How much narrower the top is than the base, 0–0.6. */
  taper: number;
  roof: RoofKind;
  feature?: FeatureKind;
  /** Window columns across the façade. */
  columns?: number;
}

/* ------------------------------------------------------------------ */
/* Level → size                                                        */
/* ------------------------------------------------------------------ */

/**
 * How tall a building stands at a given level.
 *
 * Logarithmic, and deliberately so: levels run to 200, and anything linear
 * would have a level-50 Greenhouse taller than the sky. This grows fast where
 * it is felt — the first ten levels add half the building's height again — and
 * then flattens into something the scene can still frame.
 */
export function heightAt(spec: BuildingSpec, level: number): number {
  const steps = Math.log2(visualLevel(level) + 1) - 1;
  return spec.height * (1 + HEIGHT_PER_STEP * steps);
}

/**
 * The level a building is *drawn* at. Levels go to 400 now, but the scene was
 * framed for 200 and a skyline has only so much sky — past 200 a building has
 * already made its point, and the charter badge in the shop says the rest.
 */
const VISUAL_LEVEL_CAP = 200;

function visualLevel(level: number): number {
  return Math.min(Math.max(level, 1), VISUAL_LEVEL_CAP);
}

/**
 * Tuned against the tallest spec: at the level ceiling the Anchor Spire has to
 * still fit above an island sitting around y=300 in a 640-tall viewport.
 * `buildings.test.ts` holds that line.
 */
const HEIGHT_PER_STEP = 0.22;

/** Half-width, growing far more slowly than height so towers stay towers. */
export function widthAt(spec: BuildingSpec, level: number): number {
  const steps = Math.log2(visualLevel(level) + 1) - 1;
  return spec.width * (1 + 0.07 * steps);
}

/**
 * Side wings, one per output doubling — the level that doubles a building's
 * Lumen is the level you can see it grow.
 *
 * Capped well below the twenty doublings a building can now earn: the wings
 * step outward as they multiply, and past six they walk off the island. So a
 * heavily-levelled building keeps growing taller and the sprawl stops, which is
 * the right way round for a skyline.
 */
const MAX_ANNEXES = 6;

export function annexCount(level: number): number {
  return Math.min(MAX_ANNEXES, Math.floor(level / BUILDING_MILESTONE_INTERVAL));
}

/* ------------------------------------------------------------------ */
/* Parts                                                               */
/* ------------------------------------------------------------------ */

/** The main mass: a tapered block, lit on the left and shaded on the right. */
function mass(halfWidth: number, height: number, taper: number): SVGGElement {
  const top = halfWidth * (1 - taper);
  const shadeAt = top * 0.35;

  return group(
    'scene-building__mass',
    shape(
      `M${-halfWidth} 0 L${-top} ${-height} L${top} ${-height} L${halfWidth} 0 Z`,
      'lit',
    ),
    shape(
      `M${shadeAt} ${-height} L${top} ${-height} L${halfWidth} 0 L${halfWidth * 0.35} 0 Z`,
      'shade',
    ),
    rim(`M${-top} ${-height} L${-halfWidth} 0`),
  );
}

/** Window grid, sized to the mass so a taller building gains storeys. */
function windows(
  halfWidth: number,
  height: number,
  taper: number,
  columns: number,
): SVGGElement {
  const node = group('scene-building__windows');
  const rows = Math.max(1, Math.min(Math.floor((height - 14) / 20), 9));
  const cols = Math.max(1, columns);

  for (let row = 0; row < rows; row += 1) {
    // Narrow the row to match the taper at this height.
    const t = (row + 0.5) / rows;
    const rowHalf = halfWidth * (1 - taper * t) * 0.72;
    const cellWidth = (rowHalf * 2) / cols;
    const w = Math.min(cellWidth * 0.55, 11);
    const y = -height + 12 + row * 20;

    for (let col = 0; col < cols; col += 1) {
      const x = -rowHalf + cellWidth * col + (cellWidth - w) / 2;
      node.appendChild(window_(x, y, w, Math.min(13, w * 1.3), 1.5));
    }
  }
  return node;
}

function roofOf(
  kind: RoofKind,
  halfWidth: number,
  height: number,
  taper: number,
): SVGGElement {
  const top = halfWidth * (1 - taper);

  switch (kind) {
    case 'peak':
      return group(
        'scene-building__roof',
        shape(
          `M${-top - 3} ${-height} L0 ${-height - top * 0.75} L${top + 3} ${-height} Z`,
          'roof',
        ),
        rim(`M${-top - 3} ${-height} L0 ${-height - top * 0.75}`),
      );
    case 'dome':
      return group(
        'scene-building__roof',
        svg('path', {
          d: `M${-top} ${-height} A${top} ${top} 0 0 1 ${top} ${-height} Z`,
          fill: FILL_VAR.roof,
        }),
        rim(`M${-top} ${-height} A${top} ${top} 0 0 1 ${top} ${-height}`),
      );
    case 'shed':
      return group(
        'scene-building__roof',
        shape(
          `M${-top - 4} ${-height} L${top + 2} ${-height - top * 0.5} L${top + 2} ${-height + 4} L${-top - 4} ${-height + 4} Z`,
          'roof',
        ),
      );
    case 'stepped':
      return group(
        'scene-building__roof',
        box(-top, -height - 6, top * 2, 7, 'roof', 1),
        box(-top * 0.6, -height - 13, top * 1.2, 8, 'roof', 1),
        rim(`M${-top} ${-height - 6} H${top}`, 1.5),
      );
    case 'flat':
    default:
      return group(
        'scene-building__roof',
        box(-top - 3, -height - 5, (top + 3) * 2, 6, 'roof', 1.5),
        rim(`M${-top - 3} ${-height - 5} H${top + 3}`, 1.5),
      );
  }
}

/**
 * Side wings, one per milestone level passed. They alternate sides and step
 * outward, so a heavily-levelled building sprawls rather than just stretching.
 */
function annexes(halfWidth: number, count: number): SVGGElement {
  const node = group('scene-building__annexes');

  for (let i = 0; i < count; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const depth = Math.floor(i / 2);
    const width = 20 - depth * 3;
    const height = 24 + depth * 8;
    const x =
      side === 1
        ? halfWidth - 3 + depth * (width + 2)
        : -halfWidth + 3 - (depth + 1) * (width + 2);

    node.appendChild(box(x, -height, width, height, side === 1 ? 'shade' : 'lit', 2));
    node.appendChild(
      window_(x + 4, -height + 7, width - 8, Math.min(10, height - 14), 1.5),
    );
  }
  return node;
}

/* ------------------------------------------------------------------ */
/* Features — the one thing that makes each building recognisable      */
/* ------------------------------------------------------------------ */

function featureOf(
  kind: FeatureKind,
  halfWidth: number,
  height: number,
): SVGGElement | null {
  const top = -height;

  switch (kind) {
    // A glass roof and glazed front, rather than a solid façade.
    case 'glass':
      return group(
        'scene-building__feature',
        svg('path', {
          d: `M${-halfWidth * 0.85} 0 L${-halfWidth * 0.85} ${top + 12} L0 ${top - 8} L${halfWidth * 0.85} ${top + 12} L${halfWidth * 0.85} 0 Z`,
          fill: 'var(--scene-window)',
          opacity: 'var(--scene-window-opacity)',
          class: 'scene__window',
        }),
        svg('path', {
          d: `M0 ${top - 8} V0 M${-halfWidth * 0.85} ${top + 12} H${halfWidth * 0.85} M${-halfWidth * 0.42} ${top + 2} V0 M${halfWidth * 0.42} ${top + 2} V0`,
          stroke: FILL_VAR.shade,
          'stroke-width': 1.6,
          fill: 'none',
        }),
        rim(
          `M${-halfWidth * 0.85} ${top + 12} L0 ${top - 8} L${halfWidth * 0.85} ${top + 12}`,
        ),
      );

    // Turning blades. The animated node sits inside a plain positioning group
    // upstream — a CSS animation would otherwise override its transform.
    case 'blades':
      return group(
        'scene-building__feature',
        svg(
          'g',
          { class: 'scene-windmill__blades' },
          svg('path', {
            d: `M0 ${top} L0 ${top - 38} M0 ${top} L34 ${top + 12} M0 ${top} L-34 ${top + 12} M0 ${top} L0 ${top + 38}`,
            stroke: FILL_VAR.lit,
            'stroke-width': 3.5,
            'stroke-linecap': 'round',
            fill: 'none',
          }),
          svg('circle', { cx: 0, cy: top, r: 4, fill: FILL_VAR.roof }),
        ),
      );

    // Striped awning over an open front.
    case 'awning': {
      const node = group('scene-building__feature');
      const span = halfWidth + 6;
      for (let i = 0; i < 6; i += 1) {
        const x = -span + (i * span * 2) / 6;
        node.appendChild(
          svg('path', {
            d: `M${x} ${top + 4} L${x + (span * 2) / 6} ${top + 4} L${x + (span * 2) / 6 - 4} ${top + 16} L${x - 4} ${top + 16} Z`,
            fill: i % 2 === 0 ? FILL_VAR.roof : FILL_VAR.lit,
          }),
        );
      }
      node.appendChild(rim(`M${-span} ${top + 4} H${span}`, 1.5));
      return node;
    }

    // Lantern room and the beam it throws.
    case 'beam':
      return group(
        'scene-building__feature',
        box(-halfWidth * 0.8, top - 18, halfWidth * 1.6, 18, 'shade', 2),
        window_(-halfWidth * 0.55, top - 15, halfWidth * 1.1, 12, 2),
        svg('path', {
          d: `M${halfWidth * 0.6} ${top - 11} L${halfWidth * 0.6 + 84} ${top - 38} L${halfWidth * 0.6 + 84} ${top + 16} Z`,
          fill: 'var(--scene-window)',
          opacity: 'var(--scene-window-opacity)',
          class: 'scene__beam',
        }),
      );

    case 'telescope':
      return group(
        'scene-building__feature',
        svg('path', {
          d: `M-6 ${top - 4} A${halfWidth} ${halfWidth} 0 0 1 4 ${top - halfWidth * 0.9} L10 ${top - halfWidth * 0.8} A${halfWidth * 0.8} ${halfWidth * 0.8} 0 0 0 2 ${top - 4} Z`,
          fill: FILL_VAR.shade,
        }),
        svg('path', {
          d: `M2 ${top - halfWidth * 0.6} L${halfWidth + 12} ${top - halfWidth * 1.1}`,
          stroke: FILL_VAR.lit,
          'stroke-width': 6,
          'stroke-linecap': 'round',
        }),
      );

    // Twin stacks with a glow at the mouth.
    case 'furnace':
      return group(
        'scene-building__feature',
        box(-halfWidth * 0.6, top - 30, 10, 32, 'shade', 2),
        box(halfWidth * 0.25, top - 42, 10, 44, 'shade', 2),
        svg('circle', {
          cx: -halfWidth * 0.6 + 5,
          cy: top - 30,
          r: 5,
          fill: 'var(--scene-window)',
          opacity: 'var(--scene-window-opacity)',
          class: 'scene__beacon',
        }),
        svg('circle', {
          cx: halfWidth * 0.25 + 5,
          cy: top - 42,
          r: 5,
          fill: 'var(--scene-window)',
          opacity: 'var(--scene-window-opacity)',
          class: 'scene__beacon',
        }),
      );

    // An open cage, drawn as ribs rather than a solid roof.
    case 'aviary':
      return group(
        'scene-building__feature',
        svg('path', {
          d: `M${-halfWidth} ${top} A${halfWidth} ${halfWidth * 1.1} 0 0 1 ${halfWidth} ${top}`,
          fill: 'var(--scene-window)',
          opacity: 'var(--scene-window-opacity)',
          class: 'scene__window',
        }),
        svg('path', {
          d: `M${-halfWidth * 0.5} ${top} V${top - halfWidth * 0.95} M0 ${top} V${top - halfWidth * 1.1} M${halfWidth * 0.5} ${top} V${top - halfWidth * 0.95}`,
          stroke: FILL_VAR.shade,
          'stroke-width': 2,
          fill: 'none',
        }),
        rim(
          `M${-halfWidth} ${top} A${halfWidth} ${halfWidth * 1.1} 0 0 1 ${halfWidth} ${top}`,
        ),
      );

    // Cloth on a frame, caught mid-weave.
    case 'loom':
      return group(
        'scene-building__feature',
        box(-halfWidth - 8, top - 26, 6, 28, 'shade', 1),
        box(halfWidth + 2, top - 26, 6, 28, 'shade', 1),
        svg('path', {
          d: `M${-halfWidth - 2} ${top - 20} Q0 ${top - 6} ${halfWidth + 2} ${top - 20} L${halfWidth + 2} ${top - 8} Q0 ${top + 6} ${-halfWidth - 2} ${top - 8} Z`,
          fill: 'var(--scene-window)',
          opacity: 'var(--scene-window-opacity)',
          class: 'scene__window',
        }),
      );

    // Docking arm reaching out over the island edge.
    case 'gantry':
      return group(
        'scene-building__feature',
        box(-4, top - 34, 8, 36, 'shade', 1),
        svg('path', {
          d: `M0 ${top - 30} H${halfWidth + 44}`,
          stroke: FILL_VAR.lit,
          'stroke-width': 5,
          'stroke-linecap': 'round',
        }),
        svg('path', {
          d: `M${halfWidth + 40} ${top - 30} V${top - 12}`,
          stroke: FILL_VAR.shade,
          'stroke-width': 3,
        }),
        rim(`M0 ${top - 30} H${halfWidth + 44}`, 1.5),
      );

    // A shaft of light coming up out of the ground, not down onto it.
    case 'well':
      return group(
        'scene-building__feature',
        svg('path', {
          d: `M${-halfWidth * 0.5} ${top} L${-halfWidth * 0.75} ${top - 70} L${halfWidth * 0.75} ${top - 70} L${halfWidth * 0.5} ${top} Z`,
          fill: 'var(--scene-window)',
          opacity: 'var(--scene-window-opacity)',
          // Its own class, not `scene__beam` — the lighthouse beam sweeps, and
          // a shaft coming straight up out of the ground must not.
          class: 'scene__shaft',
        }),
        box(-halfWidth * 0.62, top - 6, halfWidth * 1.24, 8, 'roof', 2),
      );

    // Concentric rings around a bright core.
    case 'forge':
      return group(
        'scene-building__feature',
        svg('circle', {
          cx: 0,
          cy: top - 26,
          r: 16,
          fill: 'var(--scene-window)',
          opacity: 'var(--scene-window-opacity)',
          class: 'scene__beacon',
        }),
        svg('ellipse', {
          cx: 0,
          cy: top - 26,
          rx: 30,
          ry: 9,
          fill: 'none',
          stroke: FILL_VAR.lit,
          'stroke-width': 3,
        }),
        svg('ellipse', {
          cx: 0,
          cy: top - 26,
          rx: 22,
          ry: 26,
          fill: 'none',
          stroke: FILL_VAR.shade,
          'stroke-width': 2.5,
        }),
      );

    // Chains running down past the island, holding the cluster in place.
    case 'anchor':
      return group(
        'scene-building__feature',
        shape(`M-8 ${top} L0 ${top - 46} L8 ${top} Z`, 'roof'),
        svg('circle', {
          cx: 0,
          cy: top - 46,
          r: 5,
          fill: 'var(--scene-window)',
          opacity: 'var(--scene-window-opacity)',
          class: 'scene__beacon',
        }),
        svg('path', {
          d: `M${-halfWidth * 0.7} 0 L${-halfWidth * 0.9} 34 M${halfWidth * 0.7} 0 L${halfWidth * 0.9} 34`,
          stroke: FILL_VAR.rock,
          'stroke-width': 3,
          'stroke-linecap': 'round',
        }),
      );

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Composition                                                         */
/* ------------------------------------------------------------------ */

/**
 * Builds one building at one level.
 *
 * Order is back to front: annexes, then the mass, then windows, then the roof
 * and the feature on top — so a wing never draws over the building it is
 * attached to.
 */
export function composeBuilding(
  className: string,
  spec: BuildingSpec,
  level: number,
): SVGGElement {
  const height = heightAt(spec, level);
  const halfWidth = widthAt(spec, level);
  const glazed = spec.feature === 'glass' || spec.feature === 'aviary';

  return group(
    `scene-building ${className}`,
    annexes(halfWidth, annexCount(level)),
    mass(halfWidth, height, spec.taper),
    // A glass or caged building carries its own glow; a window grid on top of
    // it reads as a mistake rather than as detail.
    glazed ? null : windows(halfWidth, height, spec.taper, spec.columns ?? 3),
    roofOf(spec.roof, halfWidth, height, spec.taper),
    spec.feature ? featureOf(spec.feature, halfWidth, height) : null,
  );
}
