/** Stand-in for a screen that a later build phase fills in. */
import type { AppContext, Screen } from '../context';
import { el } from '../dom';

export function createPlaceholderScreen(
  ctx: AppContext,
  title: string,
  note: string,
): Screen {
  return {
    el: el(
      'section',
      { class: 'panel' },
      el('div', { class: 'panel__head' }, el('h2', { class: 'panel__title' }, title)),
      el('p', { class: 'panel__note' }, note),
      el(
        'button',
        {
          class: 'btn btn--secondary',
          attrs: { type: 'button' },
          style: { 'margin-top': 'var(--space-4)' },
          on: { click: () => ctx.navigate({ name: 'city' }) },
        },
        'Back to the city',
      ),
    ),
  };
}
