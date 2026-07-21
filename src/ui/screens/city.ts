/**
 * The City — the app's home screen and its only persistent "world".
 *
 * Everything else is entered from here and returns here.
 */
import { CHECKLISTS, REVIEW_IDS } from '@/config/checklists';
import { today } from '@/domain/dates';
import { findDay } from '@/domain/streak';
import { takeDayOff } from '@/state/actions';
import type { DayRecord, ReviewId } from '@/state/types';
import { confirmDialog } from '../components/confirm';
import type { AppContext, Screen } from '../context';
import { el, replaceChildren } from '../dom';
import { iconCheck, iconDayOff, iconHistory, iconSettings, iconShop } from '../icons';

export function createCityScreen(ctx: AppContext): Screen {
  const stage = el(
    'div',
    { class: 'city-stage' },
    el(
      'div',
      { class: 'city-stage__placeholder' },
      el('p', { class: 'section-label' }, 'Aerie'),
      el('p', {}, 'The city scene is built in phase 2.'),
    ),
  );
  const statusLine = el('p', { class: 'city-status' });
  const primaryActions = el('div', { class: 'action-rail' });
  const secondaryActions = el('div', { class: 'action-rail__secondary' });

  const root = el(
    'section',
    { class: 'city' },
    stage,
    el(
      'div',
      { class: 'city-controls' },
      statusLine,
      primaryActions,
      secondaryActions,
    ),
  );

  function reviewButton(reviewId: ReviewId, day: DayRecord | undefined): HTMLElement {
    const checklist = CHECKLISTS[reviewId];
    const record = day?.[reviewId];
    const alreadyDone = Boolean(record?.completed);

    return el(
      'button',
      {
        class: ['btn', alreadyDone ? 'btn--secondary' : 'btn--primary', 'btn--large'],
        attrs: {
          type: 'button',
          disabled: alreadyDone,
          title: alreadyDone ? `Logged today as a ${record?.tier} result.` : undefined,
        },
        on: { click: () => ctx.navigate({ name: 'review', reviewId }) },
      },
      alreadyDone ? el('span', { class: 'review-card__icon', html: iconCheck() }) : null,
      alreadyDone ? `${checklist.name} · done` : `Start ${checklist.name}`,
    );
  }

  async function onDayOff(): Promise<void> {
    const confirmed = await confirmDialog({
      title: 'Mark today as a day off?',
      body: 'Your streak stays safe. It counts as a day off in your history, not as a review.',
      confirmLabel: 'Mark day off',
      cancelLabel: 'Not yet',
    });
    if (!confirmed) return;
    takeDayOff(ctx.store);
    ctx.toast('Today is marked as a day off. Streak held.');
  }

  function render(): void {
    const state = ctx.store.getState();
    const day = findDay(state.history, today());
    const completedToday = REVIEW_IDS.filter((id) => day?.[id]?.completed);
    const isDayOff = Boolean(day?.dayOff);

    replaceChildren(primaryActions, ...REVIEW_IDS.map((id) => reviewButton(id, day)));

    const dayOffButton = el(
      'button',
      {
        class: 'btn btn--secondary',
        attrs: {
          type: 'button',
          disabled: isDayOff || completedToday.length > 0,
          title: completedToday.length > 0 ? 'You already logged a review today.' : undefined,
        },
        on: { click: () => void onDayOff() },
      },
      el('span', { class: 'review-card__icon', html: iconDayOff() }),
      isDayOff ? 'Day off taken' : 'Take a day off',
    );

    const navButton = (
      label: string,
      icon: string,
      route: Parameters<AppContext['navigate']>[0],
    ): HTMLElement =>
      el(
        'button',
        {
          class: 'btn btn--secondary',
          attrs: { type: 'button' },
          on: { click: () => ctx.navigate(route) },
        },
        el('span', { class: 'review-card__icon', html: icon }),
        label,
      );

    replaceChildren(
      secondaryActions,
      dayOffButton,
      navButton('Shop', iconShop(), { name: 'shop' }),
      navButton('Progress', iconHistory(), { name: 'history' }),
      navButton('Settings', iconSettings(), { name: 'settings' }),
    );

    statusLine.textContent = describeToday(completedToday, isDayOff, state.streak.current);
  }

  render();
  const unsubscribe = ctx.store.subscribe(render);

  return { el: root, destroy: unsubscribe };
}

/** Plain, factual status copy — no nudging, no guilt. */
function describeToday(
  completed: ReviewId[],
  isDayOff: boolean,
  streak: number,
): string {
  if (isDayOff) return 'Today is a day off. Your streak is held.';
  if (completed.length === 2) return 'Both reviews logged today. Nothing left to do.';
  if (completed.length === 1) {
    const remaining = REVIEW_IDS.find((id) => !completed.includes(id));
    return `${CHECKLISTS[completed[0]!].name} logged. ${
      remaining ? CHECKLISTS[remaining].name : 'Nothing'
    } is still open.`;
  }
  return streak > 0
    ? 'Nothing logged today yet.'
    : 'No run going. Any review at floor tier starts one.';
}
