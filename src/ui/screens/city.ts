/**
 * The City — the app's home screen and its only persistent "world".
 *
 * Everything else is entered from here and returns here.
 */
import { CHECKLIST_META, REVIEW_IDS } from '@/config/checklists';
import { today } from '@/domain/dates';
import { canAscend } from '@/domain/ascension';
import { contractFor } from '@/domain/contracts';
import { describeHeat, heatDays } from '@/domain/heat';
import { findDay } from '@/domain/streak';
import { takeDayOff } from '@/state/actions';
import type { DayRecord, ReviewId } from '@/state/types';
import { confirmDialog } from '../components/confirm';
import { createLightingCaption } from '../components/lighting-caption';
import { createMoteField, moteCaughtMessage } from '../components/motes';
import { createVaultPanel, vaultCollectedMessage } from '../components/vault';
import type { AppContext, Screen } from '../context';
import { el, replaceChildren } from '../dom';
import {
  iconAether,
  iconCheck,
  iconDayOff,
  iconHistory,
  iconSettings,
  iconShop,
  iconWorkshop,
} from '../icons';
import { createCityScene } from '../scene/city-scene';

export function createCityScreen(ctx: AppContext): Screen {
  const scene = createCityScene(ctx.store);
  const caption = createLightingCaption(ctx.store);
  const motes = createMoteField(ctx.store, (lumen) =>
    ctx.toast(moteCaughtMessage(lumen)),
  );
  const vault = createVaultPanel(ctx.store, (lumen) =>
    ctx.toast(vaultCollectedMessage(lumen)),
  );
  const stage = el('figure', { class: 'city-stage' }, scene.el, motes.el, caption.el);
  const statusLine = el('p', { class: 'city-status' });
  const dayBar = el('div', { class: 'city-day' });
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
      vault.el,
      dayBar,
      primaryActions,
      secondaryActions,
    ),
  );

  /**
   * The day's contract and the heat riding on it. Both are shown whether or
   * not they are currently paying — a contract you have already settled and a
   * combo you are about to lose are both worth knowing about.
   */
  function renderDayBar(
    state: ReturnType<typeof ctx.store.getState>,
    day: DayRecord | undefined,
  ): void {
    const contract = contractFor(today());
    const settled = day ? contract.satisfiedBy(day) : false;
    const heat = heatDays(state.history, today());

    replaceChildren(
      dayBar,
      el(
        'div',
        { class: ['city-day__item', settled && 'city-day__item--done'] },
        el(
          'span',
          { class: 'city-day__label' },
          settled ? 'Contract settled' : "Today's contract",
        ),
        el('span', { class: 'city-day__value' }, `${contract.name} — ${contract.goal}`),
      ),
      el(
        'div',
        { class: ['city-day__item', heat > 0 && 'city-day__item--hot'] },
        el('span', { class: 'city-day__label' }, 'Heat'),
        el('span', { class: 'city-day__value' }, describeHeat(heat)),
      ),
    );
  }

  function reviewButton(reviewId: ReviewId, day: DayRecord | undefined): HTMLElement {
    const checklist = CHECKLIST_META[reviewId];
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
          title:
            completedToday.length > 0 ? 'You already logged a review today.' : undefined,
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

    // Ascension only appears once it is reachable, so a first-week city is
    // never shown a door it cannot open. The Workshop appears the same way —
    // once there is Cinder to spend or research already bought.
    const showAscension = canAscend(state) || state.ascension.aetherEarned > 0;
    const showWorkshop = state.currency.cinder > 0 || state.research.length > 0;

    replaceChildren(
      secondaryActions,
      dayOffButton,
      navButton('Shop', iconShop(), { name: 'shop' }),
      showWorkshop ? navButton('Workshop', iconWorkshop(), { name: 'research' }) : null,
      showAscension ? navButton('Ascension', iconAether(), { name: 'ascension' }) : null,
      navButton('Progress', iconHistory(), { name: 'history' }),
      navButton('Settings', iconSettings(), { name: 'settings' }),
    );

    statusLine.textContent = describeToday(
      completedToday,
      isDayOff,
      state.streak.current,
    );
    renderDayBar(state, day);
  }

  render();
  const unsubscribe = ctx.store.subscribe(render);

  return {
    el: root,
    destroy: () => {
      unsubscribe();
      vault.destroy();
      motes.destroy();
      caption.destroy();
      scene.destroy();
    },
  };
}

/** Plain, factual status copy — no nudging, no guilt. */
function describeToday(completed: ReviewId[], isDayOff: boolean, streak: number): string {
  if (isDayOff) return 'Today is a day off. Your streak is held.';
  if (completed.length === 2) return 'Both reviews logged today. Nothing left to do.';
  if (completed.length === 1) {
    const remaining = REVIEW_IDS.find((id) => !completed.includes(id));
    return `${CHECKLIST_META[completed[0]!].name} logged. ${
      remaining ? CHECKLIST_META[remaining].name : 'Nothing'
    } is still open.`;
  }
  return streak > 0
    ? 'Nothing logged today yet.'
    : 'No run going. Any review at floor tier starts one.';
}
