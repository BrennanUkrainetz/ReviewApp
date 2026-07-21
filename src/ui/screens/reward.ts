/**
 * The post-review reward overlay: the chest, and — at a 20-day streak — the
 * real-world reward screen behind it.
 *
 * It sits over the City rather than replacing it, so the payoff lands in the
 * same place the city lives, and closing it drops you straight back into the
 * scene you just changed.
 */
import { BIG_MILESTONE_INTERVAL } from '@/config/tuning';
import type { ReviewOutcome } from '@/state/actions';
import type { Store } from '@/state/store';
import { createChestSequence } from '../components/chest';
import { el, replaceChildren } from '../dom';

export interface RewardOverlay {
  el: HTMLElement;
  destroy(): void;
}

export interface RewardOverlayOptions {
  store: Store;
  outcome: ReviewOutcome;
  onClose(): void;
}

export function createRewardOverlay({
  store,
  outcome,
  onClose,
}: RewardOverlayOptions): RewardOverlay {
  const panel = el('div', { class: 'reward__panel' });
  const root = el(
    'div',
    {
      class: 'reward',
      dataset: { kind: outcome.reward.chest },
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Review reward' },
    },
    panel,
  );

  const isBigMilestone = outcome.reward.milestone?.kind === 'big';

  const chest = createChestSequence({
    store,
    outcome,
    onDone: () => (isBigMilestone ? showMilestone() : close()),
  });

  function showMilestone(): void {
    const streak = outcome.streakAfter;
    const total = store.getState().milestones.totalBigMilestonesHit;

    replaceChildren(
      panel,
      el(
        'div',
        { class: 'milestone' },
        el('p', { class: 'section-label' }, 'Milestone'),
        el('h2', { class: 'milestone__headline' }, `${streak} days.`),
        el(
          'p',
          { class: 'milestone__body' },
          "You said a 20-day run earns a lunch out. This is that. Book it, take the hour, and don't work through it.",
        ),
        el(
          'p',
          { class: 'milestone__meta' },
          `Real reward number ${total} · the run keeps going — next one at ${
            streak + BIG_MILESTONE_INTERVAL
          } days.`,
        ),
        el(
          'button',
          {
            class: 'btn btn--primary btn--large btn--block',
            attrs: { type: 'button' },
            on: { click: close },
          },
          'Noted — back to the city',
        ),
      ),
    );

    panel.querySelector<HTMLButtonElement>('.btn')?.focus({ preventScroll: true });
  }

  function close(): void {
    onClose();
  }

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  panel.appendChild(chest.el);
  document.addEventListener('keydown', onKeydown);

  return {
    el: root,
    destroy: () => {
      chest.destroy();
      document.removeEventListener('keydown', onKeydown);
    },
  };
}
