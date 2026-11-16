/**
 * The City — the app's home screen and its only persistent "world".
 *
 * Everything else is entered from here and returns here.
 */
import { CHECKLIST_META, REVIEW_IDS } from '@/config/checklists';
import { WARD_CINDER_COST } from '@/config/tuning';
import { formatShortDay, isWeekend, today } from '@/domain/dates';
import { canAscend, modsFor } from '@/domain/ascension';
import { contractFor } from '@/domain/contracts';
import { describeHeat, heatDays } from '@/domain/heat';
import { findDay } from '@/domain/streak';
import { mendQuote, wardCapacity } from '@/domain/wards';
import { weeklyFor, weeklyProgress } from '@/domain/weekly';
import { buyWard, mendStreak, takeDayOff } from '@/state/actions';
import type { AerieState, DayRecord, ReviewId } from '@/state/types';
import { confirmDialog } from '../components/confirm';
import { createLightingCaption } from '../components/lighting-caption';
import { createMoteField, moteCaughtMessage } from '../components/motes';
import { createVaultPanel, vaultCollectedMessage } from '../components/vault';
import type { AppContext, Screen } from '../context';
import { el, replaceChildren } from '../dom';
import {
  iconAether,
  iconCheck,
  iconCinder,
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
  const motes = createMoteField(ctx.store, (lumen, multiplier) =>
    ctx.toast(moteCaughtMessage(lumen, multiplier)),
  );
  const vault = createVaultPanel(ctx.store, (lumen) =>
    ctx.toast(vaultCollectedMessage(lumen)),
  );
  const stage = el('figure', { class: 'city-stage' }, scene.el, motes.el, caption.el);
  const statusLine = el('p', { class: 'city-status' });
  const mendBar = el('div', { class: 'city-mend' });
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
      mendBar,
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
  function renderDayBar(state: AerieState, day: DayRecord | undefined): void {
    const contract = contractFor(today());
    const settled = day ? contract.satisfiedBy(day) : false;
    const heat = heatDays(state.history, today());
    const weekly = weeklyFor(today());
    const progress = weeklyProgress(weekly, state.history, today());
    const weekDone = progress >= weekly.target;

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
      el(
        'div',
        { class: ['city-day__item', weekDone && 'city-day__item--done'] },
        el(
          'span',
          { class: 'city-day__label' },
          weekDone ? 'Expedition complete' : "This week's expedition",
        ),
        el('span', { class: 'city-day__value' }, `${weekly.name} — ${weekly.goal}`),
        el(
          'span',
          { class: 'city-day__meta' },
          weekDone
            ? `${weekly.target} / ${weekly.target} · paid`
            : `${progress} / ${weekly.target} · pays ${weekly.cinder} Cinder and a day of the city`,
        ),
      ),
      wardItem(state),
    );
  }

  /**
   * Streak wards: how many are held, and the button to buy another. Shown once
   * Cinder has turned up at all — the same point the Workshop appears — since
   * before that there is nothing to buy one with.
   */
  function wardItem(state: AerieState): HTMLElement | null {
    const { wards, wardsUsed } = state.streak;
    if (state.currency.cinder <= 0 && wards <= 0 && wardsUsed <= 0) return null;

    const capacity = wardCapacity(modsFor(state));
    const full = wards >= capacity;
    const affordable = state.currency.cinder >= WARD_CINDER_COST;

    return el(
      'div',
      { class: ['city-day__item', wards > 0 && 'city-day__item--done'] },
      el('span', { class: 'city-day__label' }, 'Streak wards'),
      el(
        'span',
        { class: 'city-day__value' },
        wards > 0
          ? `${wards} of ${capacity} held — a missed weekday is covered automatically.`
          : 'None held. A ward covers a weekday you forget, automatically.',
      ),
      el(
        'button',
        {
          class: [
            'btn',
            'btn--small',
            !full && affordable ? 'btn--buy' : 'btn--secondary',
          ],
          attrs: { type: 'button', disabled: full || !affordable },
          on: {
            click: () => {
              const result = buyWard(ctx.store);
              ctx.toast(
                result.ok ? 'Ward bought. Your streak has a net.' : result.reason,
              );
            },
          },
        },
        el('span', { class: 'city-day__icon', html: iconCinder() }),
        full ? 'Wards full' : `Buy a ward · ${WARD_CINDER_COST} Cinder`,
      ),
    );
  }

  /**
   * The mend offer. Only there while a broken run can still be saved, and put
   * above everything else on the screen — it is the one thing here with a
   * deadline, and missing it is the one mistake that cannot be undone.
   */
  function renderMend(state: AerieState): void {
    const quote = mendQuote(state, today(), modsFor(state));
    mendBar.hidden = quote === null;
    if (!quote) {
      replaceChildren(mendBar);
      return;
    }

    const payWith = (currency: 'cinder' | 'aether'): HTMLElement => {
      const price = currency === 'cinder' ? quote.cinder : quote.aether;
      const held = currency === 'cinder' ? state.currency.cinder : state.ascension.aether;
      const affordable = held >= price;
      return el(
        'button',
        {
          class: ['btn', 'btn--small', affordable ? 'btn--buy' : 'btn--secondary'],
          attrs: { type: 'button', disabled: !affordable },
          on: {
            click: () => {
              const result = mendStreak(ctx.store, currency);
              ctx.toast(
                result.ok
                  ? `Mended. Your streak is back at ${result.streak}.`
                  : result.reason,
              );
            },
          },
        },
        el('span', {
          class: 'city-day__icon',
          html: currency === 'cinder' ? iconCinder() : iconAether(),
        }),
        `${price} ${currency === 'cinder' ? 'Cinder' : 'Aether'}`,
      );
    };

    const missed = quote.days.length;
    replaceChildren(
      mendBar,
      el(
        'div',
        { class: 'city-mend__text' },
        el('p', { class: 'city-mend__title' }, `Your ${quote.length}-day run broke.`),
        el(
          'p',
          { class: 'city-mend__body' },
          `Mend it to cover the ${missed === 1 ? 'missed day' : `${missed} missed days`} and put your streak back at ${quote.restored}. The offer stands until ${formatShortDay(quote.deadline)}.`,
        ),
      ),
      el('div', { class: 'city-mend__actions' }, payWith('cinder'), payWith('aether')),
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
    const weekend = isWeekend(today());

    replaceChildren(primaryActions, ...REVIEW_IDS.map((id) => reviewButton(id, day)));

    // Nothing to hold open at the weekend, and a day off spent on a Saturday is
    // one spent on nothing — so the button steps aside and says why.
    const dayOffButton = el(
      'button',
      {
        class: 'btn btn--secondary',
        attrs: {
          type: 'button',
          disabled: weekend || isDayOff || completedToday.length > 0,
          title: weekend
            ? 'Weekends are already off.'
            : completedToday.length > 0
              ? 'You already logged a review today.'
              : undefined,
        },
        on: { click: () => void onDayOff() },
      },
      el('span', { class: 'review-card__icon', html: iconDayOff() }),
      weekend ? 'Weekend — off already' : isDayOff ? 'Day off taken' : 'Take a day off',
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
      weekend,
    );
    renderMend(state);
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
function describeToday(
  completed: ReviewId[],
  isDayOff: boolean,
  streak: number,
  weekend: boolean,
): string {
  if (isDayOff) return 'Today is a day off. Your streak is held.';
  if (completed.length === 2) {
    return weekend
      ? 'Both reviews logged on a weekend. Pure bonus.'
      : 'Both reviews logged today. Nothing left to do.';
  }
  if (completed.length === 1) {
    const remaining = REVIEW_IDS.find((id) => !completed.includes(id));
    return `${CHECKLIST_META[completed[0]!].name} logged. ${
      remaining ? CHECKLIST_META[remaining].name : 'Nothing'
    } is still open.`;
  }
  // The weekend is off by design, so it is stated as a fact rather than as
  // something outstanding.
  if (weekend) {
    return streak > 0
      ? 'Weekend. Nothing is due — your streak is held until Monday.'
      : 'Weekend. Nothing is due.';
  }
  return streak > 0
    ? 'Nothing logged today yet.'
    : 'No run going. Any review at floor tier starts one.';
}
