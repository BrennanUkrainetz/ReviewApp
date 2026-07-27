/**
 * Golden motes — the drifting, clickable payout that opens after a review.
 *
 * Rendered as buttons layered over the city rather than inside the SVG. The
 * scene's own note warns that a CSS animation on an SVG node overrides its
 * `transform` attribute; keeping the motes in ordinary DOM sidesteps that
 * entirely, and it makes them focusable and keyboard-activatable for free.
 *
 * There are never more motes on screen than the save has charges, and charges
 * only come from completing a review — so this can't become something to farm
 * instead of doing the work.
 */
import { formatBig } from '@/domain/bignum';
import { today } from '@/domain/dates';
import { catchMote } from '@/state/actions';
import type { Store } from '@/state/store';
import { el, replaceChildren } from '../dom';

export interface MoteFieldHandle {
  el: HTMLElement;
  destroy(): void;
}

/**
 * Where the motes sit, as a share of the stage.
 *
 * Kept in the band the islands occupy rather than spread over the whole frame:
 * a glowing disc alone in open sky reads as a second sun, not as something to
 * click. Near the rooftops it reads as belonging to the city.
 */
const POSITIONS = [
  { left: '26%', top: '46%', delay: '0s' },
  { left: '57%', top: '60%', delay: '1.4s' },
  { left: '76%', top: '52%', delay: '2.6s' },
  { left: '41%', top: '42%', delay: '0.7s' },
  { left: '16%', top: '58%', delay: '2s' },
];

export function createMoteField(
  store: Store,
  onCatch: (lumen: number) => void,
): MoteFieldHandle {
  const node = el('div', {
    class: 'mote-field',
    attrs: { 'aria-label': 'Motes drifting over the city' },
  });

  function render(): void {
    const state = store.getState();
    const active = state.motes.date === today() ? state.motes.remaining : 0;

    node.hidden = active === 0;
    if (active === 0) {
      replaceChildren(node);
      return;
    }

    const motes = Array.from(
      { length: Math.min(active, POSITIONS.length) },
      (_, index) => {
        const spot = POSITIONS[index]!;
        return el('button', {
          class: 'mote',
          attrs: {
            type: 'button',
            'aria-label': 'Catch the mote',
            title: 'Catch the mote',
          },
          style: {
            left: spot.left,
            top: spot.top,
            'animation-delay': spot.delay,
          },
          on: {
            click: (event) => {
              const target = event.currentTarget as HTMLElement;
              const result = catchMote(store);
              if (!result.ok) return;
              // Let the pop finish before the re-render pulls the node; the
              // store update below re-renders the field either way.
              target.classList.add('mote--caught');
              onCatch(result.lumen);
            },
          },
        });
      },
    );

    replaceChildren(node, ...motes);
  }

  render();
  const unsubscribe = store.subscribe(render);

  return { el: node, destroy: unsubscribe };
}

/** Toast copy for a caught mote. */
export function moteCaughtMessage(lumen: number): string {
  return `Caught a mote. +${formatBig(lumen)} Lumen.`;
}
