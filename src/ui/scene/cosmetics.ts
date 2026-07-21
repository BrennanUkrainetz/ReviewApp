/**
 * Cosmetics as they appear in the city. Purely visual — nothing here touches
 * scoring, income, or streaks.
 *
 * Each slot returns a group drawn in scene coordinates (the 1200×660 view
 * box), so cosmetics can span islands the way lantern strings and a drifting
 * companion should.
 */
import type { CosmeticSlot } from '@/config/shop';
import { svg } from '../dom';

type CosmeticRenderer = () => SVGGElement;

/** Lantern string slung between the west island and the main island. */
function lanterns(color: string): CosmeticRenderer {
  return () => {
    const from = { x: 330, y: 318 };
    const to = { x: 780, y: 420 };
    const midX = (from.x + to.x) / 2;
    const midY = Math.max(from.y, to.y) + 78;

    const group = svg(
      'g',
      { class: 'scene-cosmetic scene-cosmetic--lanterns' },
      svg('path', {
        d: `M${from.x} ${from.y} Q${midX} ${midY} ${to.x} ${to.y}`,
        fill: 'none',
        stroke: 'var(--scene-facade-shade)',
        'stroke-width': 1.6,
      }),
    );

    const count = 9;
    for (let i = 1; i < count; i += 1) {
      const t = i / count;
      const x = (1 - t) ** 2 * from.x + 2 * (1 - t) * t * midX + t ** 2 * to.x;
      const y = (1 - t) ** 2 * from.y + 2 * (1 - t) * t * midY + t ** 2 * to.y;
      const lantern = svg(
        'g',
        { class: 'scene-lantern', style: `--lantern-index:${i}` },
        svg('line', { x1: x, y1: y, x2: x, y2: y + 7, stroke: color, 'stroke-width': 1 }),
        svg('circle', { cx: x, cy: y + 12, r: 4.5, fill: color, opacity: 0.9 }),
        svg('circle', { cx: x, cy: y + 12, r: 9, fill: color, opacity: 0.18 }),
      );
      group.appendChild(lantern);
    }
    return group;
  };
}

/** A tint wash over the cloud deck. */
function skyline(color: string): CosmeticRenderer {
  return () =>
    svg(
      'g',
      { class: 'scene-cosmetic scene-cosmetic--skyline' },
      svg('rect', {
        x: 0,
        y: 330,
        width: 1200,
        height: 330,
        fill: color,
        opacity: 0.16,
      }),
      svg('ellipse', { cx: 600, cy: 640, rx: 720, ry: 150, fill: color, opacity: 0.14 }),
    );
}

/** A sky whale drifting across behind the islands. */
function skyWhale(): SVGGElement {
  const body = svg(
    'g',
    {},
    svg('path', {
      d: 'M0 0 C 22 -30, 96 -34, 132 -12 C 150 -2, 148 12, 128 18 C 92 30, 24 24, 0 0 Z',
      fill: 'var(--scene-facade-shade)',
      opacity: 0.9,
    }),
    svg('path', {
      d: 'M132 -12 C 150 -30, 168 -32, 176 -22 C 168 -12, 152 -8, 138 -6 Z',
      fill: 'var(--scene-facade-shade)',
      opacity: 0.7,
    }),
    svg('path', {
      d: 'M18 8 C 50 22, 96 24, 124 14',
      fill: 'none',
      stroke: 'var(--scene-rim)',
      'stroke-width': 2,
      opacity: 'var(--scene-rim-opacity)',
    }),
    svg('circle', {
      cx: 26,
      cy: -8,
      r: 3,
      fill: 'var(--scene-window)',
      opacity: 'var(--scene-window-opacity)',
    }),
  );

  return svg(
    'g',
    { class: 'scene-cosmetic scene-cosmetic--companion scene-companion--whale' },
    svg('g', { class: 'scene-companion__drift' }, svg('g', { transform: 'scale(0.7)' }, body)),
  );
}

/** A stray paper kite that never came back down. */
function paperKite(): SVGGElement {
  const kite = svg(
    'g',
    {},
    svg('path', { d: 'M0 -18 L16 0 L0 22 L-16 0 Z', fill: 'var(--scene-roof)' }),
    svg('path', { d: 'M0 -18 L0 22 M-16 0 L16 0', stroke: 'var(--scene-facade-shade)', 'stroke-width': 1.2 }),
    svg('path', {
      d: 'M0 22 q 10 12 -4 20 q -10 8 2 18',
      fill: 'none',
      stroke: 'var(--scene-rim)',
      'stroke-width': 1.6,
      opacity: 'var(--scene-rim-opacity)',
    }),
  );

  return svg(
    'g',
    { class: 'scene-cosmetic scene-cosmetic--companion scene-companion--kite' },
    svg('g', { class: 'scene-companion__drift' }, kite),
  );
}

/** Banners flying from the hearth hall's mast. */
function banner(kind: 'harbour' | 'pennants'): CosmeticRenderer {
  return () => {
    const group = svg('g', { class: 'scene-cosmetic scene-cosmetic--banner' });
    const mast = svg('path', {
      d: 'M632 336 L632 400',
      stroke: 'var(--scene-facade-shade)',
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
    });
    group.appendChild(mast);

    if (kind === 'harbour') {
      group.appendChild(
        svg('path', {
          d: 'M632 340 L682 352 L662 360 L682 370 L632 366 Z',
          fill: 'var(--scene-roof)',
          class: 'scene-banner__flag',
        }),
      );
      group.appendChild(
        svg('path', {
          d: 'M632 340 L682 352',
          stroke: 'var(--scene-rim)',
          'stroke-width': 1.5,
          opacity: 'var(--scene-rim-opacity)',
          fill: 'none',
        }),
      );
    } else {
      for (let i = 0; i < 4; i += 1) {
        group.appendChild(
          svg('path', {
            d: `M632 ${342 + i * 13} L${656 + (i % 2) * 8} ${348 + i * 13} L632 ${354 + i * 13} Z`,
            fill: i % 2 === 0 ? 'var(--scene-roof)' : 'var(--scene-facade-lit)',
            class: 'scene-banner__flag',
            style: `--flag-index:${i}`,
          }),
        );
      }
    }
    return group;
  };
}

const RENDERERS: Record<string, CosmeticRenderer> = {
  'teal-lanterns': lanterns('#8fd8d2'),
  'amber-lanterns': lanterns('#f5a94e'),
  'rose-skyline': skyline('#e08a9a'),
  'violet-skyline': skyline('#8e7ad0'),
  'sky-whale': skyWhale,
  'paper-kite': paperKite,
  'harbour-banner': banner('harbour'),
  'signal-pennants': banner('pennants'),
};

/** Which layer a cosmetic belongs in — behind the islands, or in front. */
export const SLOT_DEPTH: Record<CosmeticSlot, 'back' | 'front'> = {
  skyline: 'back',
  companion: 'back',
  lanterns: 'front',
  banner: 'front',
};

export function renderCosmetic(id: string): SVGGElement | null {
  const renderer = RENDERERS[id];
  return renderer ? renderer() : null;
}
