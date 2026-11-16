/**
 * Progress: a factual log of what happened, and the headline stats.
 *
 * No streak-saving prompts, no "you missed a day" copy. A missed day is
 * reported the same way as any other fact, because this screen exists for
 * Brennan to see his own patterns, not to be managed by.
 */
import { CHECKLIST_META, REVIEW_IDS } from '@/config/checklists';
import { HISTORY_PAGE_SIZE } from '@/config/tuning';
import {
  addDays,
  daysBetween,
  formatShortDay,
  isWeekend,
  today,
  type DateKey,
} from '@/domain/dates';
import { tierLabel } from '@/domain/scoring';
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS } from '@/config/achievements';
import { achievementMultiplier } from '@/domain/achievements';
import { fullClearStreak, totalReviewsCompleted } from '@/domain/streak';
import type { AerieState, DayRecord } from '@/state/types';
import type { AppContext, Screen } from '../context';
import { formatBig } from '@/domain/bignum';
import { el, plural, replaceChildren } from '../dom';
import { iconBack } from '../icons';

export function createHistoryScreen(ctx: AppContext): Screen {
  let showAll = false;

  const stats = el('div', { class: 'history__stats' });
  const badges = el('div', { class: 'badges' });
  const list = el('ol', { class: 'history__list' });
  const footer = el('div', { class: 'history__footer' });

  const root = el(
    'section',
    { class: 'history' },
    el(
      'header',
      { class: 'shop__header' },
      el(
        'button',
        {
          class: 'btn btn--ghost',
          attrs: { type: 'button' },
          on: { click: () => ctx.navigate({ name: 'city' }) },
        },
        el('span', { class: 'review__exit-icon', html: iconBack() }),
        'City',
      ),
      el('h2', { class: 'shop__title' }, 'Progress'),
      el('span', {}),
    ),
    stats,
    el('p', { class: 'section-label' }, 'Achievements'),
    badges,
    el('p', { class: 'section-label' }, 'Day by day'),
    list,
    footer,
  );

  function statTile(label: string, value: string, note?: string): HTMLElement {
    return el(
      'div',
      { class: 'history-stat' },
      el('p', { class: 'history-stat__value num' }, value),
      el('p', { class: 'history-stat__label' }, label),
      note ? el('p', { class: 'history-stat__note' }, note) : null,
    );
  }

  /**
   * Every weekday from the first record to today, so gaps are visible as gaps.
   *
   * Weekends are left out — a Saturday with nothing on it is not a gap, and a
   * row saying so twice a week would bury the ones that mean something. A
   * weekend that *was* worked still appears; it happened, so it is on the log.
   */
  function timeline(state: AerieState): { date: DateKey; day: DayRecord | undefined }[] {
    const end = today();
    const first = state.history[0]?.date;
    if (!first) return [];

    const byDate = new Map(state.history.map((day) => [day.date, day]));
    const span = Math.max(0, daysBetween(first, end));
    const days: { date: DateKey; day: DayRecord | undefined }[] = [];
    for (let offset = span; offset >= 0; offset -= 1) {
      const date = addDays(first, offset);
      if (isWeekend(date) && !byDate.has(date)) continue;
      days.push({ date, day: byDate.get(date) });
    }
    return days;
  }

  function dayRow(date: DateKey, day: DayRecord | undefined): HTMLElement {
    const isToday = date === today();
    const badges: HTMLElement[] = [];

    if (day?.dayOff) {
      badges.push(
        el('span', { class: 'badge badge--dayoff' }, day.warded ? 'Warded' : 'Day off'),
      );
    }
    for (const id of REVIEW_IDS) {
      const record = day?.[id];
      if (!record?.completed) continue;
      badges.push(
        el(
          'span',
          { class: `badge badge--${record.tier}` },
          `${CHECKLIST_META[id].name.replace(' Review', '')} · ${tierLabel(record.tier)}`,
        ),
      );
    }

    const earned = (day?.morning?.lumenEarned ?? 0) + (day?.daily?.lumenEarned ?? 0);

    return el(
      'li',
      { class: ['history-row', badges.length === 0 && 'history-row--empty'] },
      el(
        'span',
        { class: 'history-row__date' },
        formatShortDay(date),
        isToday ? el('span', { class: 'history-row__today' }, 'today') : null,
      ),
      el(
        'span',
        { class: 'history-row__badges' },
        ...(badges.length > 0
          ? badges
          : [el('span', { class: 'history-row__none' }, 'No review logged')]),
      ),
      el(
        'span',
        { class: 'history-row__lumen num' },
        earned > 0 ? `+${formatBig(earned)}` : '',
      ),
    );
  }

  function render(): void {
    const state = ctx.store.getState();
    const days = timeline(state);
    const visible = showAll ? days : days.slice(0, HISTORY_PAGE_SIZE);
    const fullClears = fullClearStreak(state.history, today());

    replaceChildren(
      stats,
      statTile('Current streak', String(state.streak.current), 'weekdays in a row'),
      statTile('Longest streak', String(state.streak.longest), 'weekdays'),
      statTile('Full-clear streak', String(fullClears), 'weekdays every item done'),
      statTile(
        'Real rewards earned',
        String(state.milestones.totalBigMilestonesHit),
        `next at ${state.milestones.nextBigAt} days`,
      ),
      statTile('Reviews completed', String(totalReviewsCompleted(state.history))),
      statTile('Days off taken', String(state.streak.daysOffUsed)),
    );

    renderBadges(state);

    if (days.length === 0) {
      replaceChildren(
        list,
        el(
          'li',
          { class: 'empty' },
          'Nothing logged yet. Your first review starts the record.',
        ),
      );
      replaceChildren(footer);
      return;
    }

    replaceChildren(list, ...visible.map(({ date, day }) => dayRow(date, day)));

    replaceChildren(
      footer,
      days.length > visible.length
        ? el(
            'button',
            {
              class: 'btn btn--secondary',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  showAll = true;
                  render();
                },
              },
            },
            `Show all ${plural(days.length, 'day')}`,
          )
        : null,
    );
  }

  /**
   * Every achievement, earned or not, grouped. Locked ones read the same as
   * earned ones, only unhighlighted: a badge you can see the shape of is
   * something to aim at, and a hidden one is just a surprise you can't plan for.
   */
  function renderBadges(state: AerieState): void {
    const earned = new Set(state.achievements);
    const multiplier = achievementMultiplier(state.achievements);

    replaceChildren(
      badges,
      el(
        'p',
        { class: 'badges__summary' },
        `${earned.size} of ${ACHIEVEMENTS.length} earned · `,
        el('span', { class: 'num' }, `×${multiplier.toFixed(2)}`),
        ' on every Lumen you earn.',
      ),
      ...ACHIEVEMENT_GROUPS.map((group) =>
        el(
          'div',
          { class: 'badges__group' },
          el('h3', { class: 'badges__group-name' }, group.name),
          el(
            'ul',
            { class: 'badges__grid' },
            ...ACHIEVEMENTS.filter((entry) => entry.group === group.id).map((entry) => {
              const has = earned.has(entry.id);
              return el(
                'li',
                {
                  class: ['badge-card', has && 'badge-card--earned'],
                  attrs: {
                    title: has ? entry.detail : `Not earned yet — ${entry.detail}`,
                  },
                },
                el('span', { class: 'badge-card__name' }, entry.name),
                el('span', { class: 'badge-card__detail' }, entry.detail),
              );
            }),
          ),
        ),
      ),
    );
  }

  render();
  const unsubscribe = ctx.store.subscribe(render);

  return { el: root, destroy: unsubscribe };
}
