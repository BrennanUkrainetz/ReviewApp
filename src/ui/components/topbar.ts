/**
 * The persistent header: streak on the left, Lumen on the right. Both numbers
 * pulse once when they change, which is the only motion in here.
 */
import { fullClearStreak } from '@/domain/streak';
import { today } from '@/domain/dates';
import type { Store } from '@/state/store';
import { el, formatNumber } from '../dom';
import { iconLumen, iconStreak } from '../icons';

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
    { class: 'stat stat--lumen', attrs: { title: 'Lumen — earned by completing reviews' } },
    el('span', { class: 'stat__icon', html: iconLumen() }),
    lumenValue,
    el('span', { class: 'stat__label' }, 'Lumen'),
  );

  const node = el(
    'header',
    { class: 'topbar' },
    el('div', { class: 'topbar__brand' }, el('h1', { class: 'topbar__name' }, 'Aerie')),
    el('div', { class: 'topbar__stats' }, streakChip, lumenChip),
  );

  let lastStreak: number | null = null;
  let lastLumen: number | null = null;

  const render = (): void => {
    const state = store.getState();
    const streak = state.streak.current;
    const lumen = state.currency.lumen;
    const fullClears = fullClearStreak(state.history, today());

    streakValue.textContent = String(streak);
    streakLabel.textContent = streak === 1 ? 'day' : 'day streak';
    lumenValue.textContent = formatNumber(lumen);
    streakChip.title =
      fullClears > 0
        ? `Consecutive days with a review or a day off · ${fullClears} full-clear ${
            fullClears === 1 ? 'day' : 'days'
          } running`
        : 'Consecutive days with a review or a day off';

    if (lastStreak !== null && streak !== lastStreak) bump(streakValue);
    if (lastLumen !== null && lumen !== lastLumen) bump(lumenValue);
    lastStreak = streak;
    lastLumen = lumen;
  };

  render();
  const unsubscribe = store.subscribe(render);

  return { el: node, destroy: unsubscribe };
}
