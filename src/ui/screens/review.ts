/**
 * The guided review flow: one item at a time, big targets, auto-advance.
 *
 * The slowness is the point — a wall of checkboxes is easy to skim past and
 * hard to start. One item on screen makes starting cheap and finishing likely.
 */
import { completeReview, type ReviewOutcome } from '@/state/actions';
import { checklistFor } from '@/state/checklists';
import type { ChecklistItem, ReviewId } from '@/state/types';
import { isWeekend, today } from '@/domain/dates';
import { tierLabel } from '@/domain/scoring';
import { confirmDialog } from '../components/confirm';
import type { AppContext, Screen } from '../context';
import { el, plural, replaceChildren } from '../dom';
import { iconBack, iconCheck, iconChest, iconSkip } from '../icons';
import { motionDuration, wait } from '../motion';

const CHECK_ANIMATION_MS = 380;

export function createReviewScreen(ctx: AppContext, reviewId: ReviewId): Screen {
  // Snapshotted on entry: editing the checklist mid-flow would renumber the
  // items under the person working through them.
  const checklist = checklistFor(ctx.store.getState(), reviewId);
  const done = new Set<string>();
  let index = 0;
  let advancing = false;
  let finished = false;

  const progress = el('div', { class: 'review__progress' });
  const body = el('div', { class: 'review__body' });

  const exitButton = el(
    'button',
    {
      class: 'btn btn--ghost review__exit',
      attrs: { type: 'button', 'aria-label': 'Leave review' },
      on: { click: () => void leave() },
    },
    el('span', { class: 'review__exit-icon', html: iconBack() }),
    'Leave',
  );

  const header = el(
    'header',
    { class: 'review__header' },
    exitButton,
    el(
      'div',
      { class: 'review__titles' },
      el('p', { class: 'section-label' }, checklist.expedition),
      el('h2', { class: 'review__title' }, checklist.name),
    ),
    el('div', { class: 'review__counter num' }),
  );

  const root = el('section', { class: 'review' }, header, progress, body);
  const counter = header.querySelector<HTMLElement>('.review__counter');

  async function leave(): Promise<void> {
    if (finished || done.size === 0) {
      ctx.navigate({ name: 'city' });
      return;
    }
    const confirmed = await confirmDialog({
      title: 'Leave this review?',
      body: `You've marked ${plural(done.size, 'item')} so far. Leaving now discards it — nothing is logged.`,
      confirmLabel: 'Leave',
      cancelLabel: 'Keep going',
    });
    if (confirmed) ctx.navigate({ name: 'city' });
  }

  function renderProgress(): void {
    replaceChildren(
      progress,
      ...checklist.items.map((item, position) =>
        el('span', {
          class: [
            'review__pip',
            position < index && done.has(item.id) && 'review__pip--done',
            position < index &&
              !done.has(item.id) &&
              (item.optional ? 'review__pip--set-aside' : 'review__pip--skipped'),
            position === index && !finished && 'review__pip--current',
          ],
          attrs: { 'aria-hidden': 'true' },
        }),
      ),
    );
    if (counter) {
      counter.textContent = finished
        ? `${checklist.items.length} / ${checklist.items.length}`
        : `${index + 1} / ${checklist.items.length}`;
    }
  }

  async function advance(item: ChecklistItem, markDone: boolean): Promise<void> {
    if (advancing) return;
    advancing = true;

    if (markDone) done.add(item.id);
    else done.delete(item.id);

    const card = body.querySelector<HTMLElement>('.review-card');
    card?.classList.add(markDone ? 'review-card--done' : 'review-card--skipped');
    await wait(motionDuration(ctx.store, markDone ? CHECK_ANIMATION_MS : 180));

    index += 1;
    advancing = false;

    if (index >= checklist.items.length) finish();
    else renderItem();
  }

  function renderItem(): void {
    const item = checklist.items[index];
    if (!item) return;

    const doneButton = el(
      'button',
      {
        class: 'btn btn--primary btn--large review-card__done',
        attrs: { type: 'button' },
        on: { click: () => void advance(item, true) },
      },
      el('span', { class: 'review-card__icon', html: iconCheck() }),
      'Done',
    );

    // An optional item is being *set aside*, not failed, and the button says
    // so — the word "skip" is what makes a step that doesn't apply feel like a
    // miss.
    const skipButton = el(
      'button',
      {
        class: 'btn btn--secondary btn--large review-card__skip',
        attrs: { type: 'button' },
        on: { click: () => void advance(item, false) },
      },
      el('span', { class: 'review-card__icon', html: iconSkip() }),
      item.optional ? "Doesn't apply today" : 'Skip',
    );

    const card = el(
      'article',
      { class: 'review-card', dataset: { itemId: item.id } },
      el(
        'div',
        { class: 'review-card__meta' },
        item.core && el('span', { class: 'badge badge--floor' }, 'Core'),
        item.optional && el('span', { class: 'badge badge--optional' }, 'Optional'),
        el('span', { class: 'review-card__points num' }, `${item.points} pt`),
      ),
      el('h3', { class: 'review-card__label' }, item.label),
      item.hint ? el('p', { class: 'review-card__hint' }, item.hint) : null,
      el('div', { class: 'review-card__actions' }, doneButton, skipButton),
      el(
        'p',
        { class: 'review-card__keys' },
        item.optional
          ? 'Enter marks it done · S sets it aside, at no cost'
          : 'Enter marks it done · S skips',
      ),
    );

    replaceChildren(body, card);
    renderProgress();
    focusPrimary();
  }

  /**
   * Puts focus on the item's main action so Enter advances the flow. No-op
   * until the screen is in the document — see `Screen.mounted`.
   */
  function focusPrimary(): void {
    body
      .querySelector<HTMLButtonElement>('.review-card__done, .review-summary .btn')
      ?.focus({ preventScroll: true });
  }

  function finish(): void {
    finished = true;
    const outcome = completeReview(ctx.store, reviewId, done);
    renderProgress();
    replaceChildren(body, buildSummary(outcome));
    focusPrimary();
  }

  function buildSummary(outcome: ReviewOutcome): HTMLElement {
    const { score } = outcome;
    // The run's own ceiling, not the checklist's: anything set aside left the
    // denominator with its points, so a clear still reads as N of N.
    const total = score.availablePoints;
    const skipped = checklist.items.filter((item) =>
      score.skippedItemIds.includes(item.id),
    );
    const setAside = checklist.items.filter((item) =>
      score.setAsideItemIds.includes(item.id),
    );

    const streakLine = outcome.advancedStreak
      ? `Streak now ${outcome.streakAfter} ${outcome.streakAfter === 1 ? 'day' : 'days'}.`
      : !score.countsForStreak
        ? `A core item was skipped, so this one doesn't count toward the streak. The Lumen is yours either way.`
        : isWeekend(today())
          ? `Weekends don't count toward the streak — this one is pure bonus. Still at ${outcome.streakAfter}.`
          : `Today was already counted — streak stays at ${outcome.streakAfter}.`;

    return el(
      'article',
      { class: 'review-summary', dataset: { tier: score.tier } },
      el('p', { class: 'section-label' }, 'Result'),
      el('h3', { class: 'review-summary__tier' }, tierLabel(score.tier)),
      el(
        'p',
        { class: 'review-summary__points' },
        el('span', { class: 'num' }, `${score.basePoints}`),
        ` of ${total} points`,
        score.bonusPoints > 0
          ? el(
              'span',
              { class: 'review-summary__bonus' },
              `+${score.bonusPoints} full-clear bonus`,
            )
          : null,
      ),
      el('p', { class: 'review-summary__streak' }, streakLine),
      skipped.length > 0
        ? el(
            'div',
            { class: 'review-summary__skipped' },
            el('p', { class: 'section-label' }, 'Skipped'),
            el(
              'ul',
              {},
              ...skipped.map((item) =>
                el('li', { class: 'review-summary__skipped-item' }, item.label),
              ),
            ),
          )
        : null,
      setAside.length > 0
        ? el(
            'div',
            { class: 'review-summary__skipped review-summary__set-aside' },
            el('p', { class: 'section-label' }, "Didn't apply today"),
            el(
              'ul',
              {},
              ...setAside.map((item) =>
                el('li', { class: 'review-summary__skipped-item' }, item.label),
              ),
            ),
            el(
              'p',
              { class: 'review-summary__set-aside-note' },
              `Set aside, not missed — ${plural(setAside.length, 'item')} left the day's total instead of counting against it.`,
            ),
          )
        : null,
      el(
        'button',
        {
          class: 'btn btn--primary btn--large btn--block',
          attrs: { type: 'button' },
          on: { click: () => ctx.presentReward(outcome) },
        },
        el('span', { class: 'review-card__icon', html: iconChest() }),
        'Collect your chest',
      ),
    );
  }

  function onKeydown(event: KeyboardEvent): void {
    if (finished || advancing) return;
    const item = checklist.items[index];
    if (!item) return;

    if (event.key === 's' || event.key === 'S') {
      event.preventDefault();
      void advance(item, false);
    }
  }

  document.addEventListener('keydown', onKeydown);
  renderItem();

  return {
    el: root,
    mounted: focusPrimary,
    destroy: () => document.removeEventListener('keydown', onKeydown),
  };
}
