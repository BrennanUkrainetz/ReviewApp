/**
 * The persistent header: streak on the left, Lumen on the right. Both numbers
 * pulse once when they change, which is the only motion in here.
 */
import { fullClearStreak } from '@/domain/streak';
import { today } from '@/domain/dates';
import type { Store } from '@/state/store';
import { formatBig } from '@/domain/bignum';
import { el } from '../dom';
import { iconAether, iconCinder, iconLumen, iconStreak } from '../icons';

function bump(node: HTMLElement): void {
  node.classList.remove('stat__value--bump');
  // Force a reflow so the animation can restart on consecutive changes.
  void node.offsetWidth;
  node.classList.add('stat__value--bump');
}

export interface TopbarHandle {
  el: HTMLElement;
  destroy(): void;
}

export function createTopbar(store: Store): TopbarHandle {
  const streakValue = el('span', { class: 'stat__value num' });
  const streakLabel = el('span', { class: 'stat__label' });
  const lumenValue = el('span', { class: 'stat__value num' });
  const cinderValue = el('span', { class: 'stat__value num' });
  const aetherValue = el('span', { class: 'stat__value num' });

  const streakChip = el(
    'div',
    {
      class: 'stat stat--streak',
      attrs: { title: 'Consecutive days with a review or a day off' },
    },
    el('span', { class: 'stat__icon', html: iconStreak() }),
    streakValue,
    streakLabel,
  );

  const lumenChip = el(
    'div',
    {
      class: 'stat stat--lumen',
      attrs: { title: 'Lumen — earned by completing reviews' },
    },
    el('span', { class: 'stat__icon', html: iconLumen() }),
    lumenValue,
    el('span', { class: 'stat__label' }, 'Lumen'),
  );

  // Same rule as Aether: no empty chip before the currency exists.
  const cinderChip = el(
    'div',
    {
      class: 'stat stat--cinder',
      attrs: { title: 'Cinder — earned by full clears, spent in the Workshop' },
    },
    el('span', { class: 'stat__icon', html: iconCinder() }),
    cinderValue,
    el('span', { class: 'stat__label' }, 'Cinder'),
  );

  // Hidden until the first Aether is earned — an empty currency chip is just
  // a question the player has no way to answer yet.
  const aetherChip = el(
    'div',
    { class: 'stat stat--aether', attrs: { title: 'Aether — spent on permanent perks' } },
    el('span', { class: 'stat__icon', html: iconAether() }),
    aetherValue,
    el('span', { class: 'stat__label' }, 'Aether'),
  );

  const node = el(
    'header',
    { class: 'topbar' },
    el('div', { class: 'topbar__brand' }, el('h1', { class: 'topbar__name' }, 'Aerie')),
    el(
      'div',
      { class: 'topbar__stats' },
      streakChip,
      lumenChip,
      cinderChip,
      aetherChip,
    ),
  );

  let lastStreak: number | null = null;
  let lastLumen: number | null = null;
  let lastCinder: number | null = null;

  const render = (): void => {
    const state = store.getState();
    const streak = state.streak.current;
    const lumen = state.currency.lumen;
    const fullClears = fullClearStreak(state.history, today());

    streakValue.textContent = String(streak);
    streakLabel.textContent = streak === 1 ? 'day' : 'day streak';
    lumenValue.textContent = formatBig(lumen);
    const { aether, aetherEarned } = state.ascension;
    aetherChip.hidden = aetherEarned === 0;
    aetherValue.textContent = formatBig(aether);
    const cinder = state.currency.cinder;
    // Appears once there's any Cinder, or any research bought with it.
    cinderChip.hidden = cinder === 0 && state.research.length === 0;
    cinderValue.textContent = formatBig(cinder);
    streakChip.title =
      fullClears > 0
        ? `Consecutive days with a review or a day off · ${fullClears} full-clear ${
            fullClears === 1 ? 'day' : 'days'
          } running`
        : 'Consecutive days with a review or a day off';

    if (lastStreak !== null && streak !== lastStreak) bump(streakValue);
    if (lastLumen !== null && lumen !== lastLumen) bump(lumenValue);
    if (lastCinder !== null && cinder !== lastCinder) bump(cinderValue);
    lastStreak = streak;
    lastLumen = lumen;
    lastCinder = cinder;
  };

  render();
  const unsubscribe = store.subscribe(render);

  return { el: node, destroy: unsubscribe };
}
