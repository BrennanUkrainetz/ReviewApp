/**
 * Screen-level test for the review flow — the one interaction that has to work
 * every single day. Runs against jsdom through the real store and actions.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultItems } from '@/config/checklists';
import { createInitialState } from '@/state/defaults';
import { setStorageBackend } from '@/state/storage';
import { createStore, type Store } from '@/state/store';
import type { AppContext } from '../context';
import { createReviewScreen } from './review';

/** Lets the click handler's async advance settle. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function setup(): {
  ctx: AppContext;
  store: Store;
  navigations: unknown[];
  rewards: unknown[];
} {
  const state = createInitialState();
  // Motion off, so the card transitions resolve immediately.
  const store = createStore({
    ...state,
    settings: { ...state.settings, reduceMotion: true },
  });
  const navigations: unknown[] = [];
  const rewards: unknown[] = [];

  const ctx: AppContext = {
    store,
    navigate: (route) => void navigations.push(route),
    presentReward: (outcome) => void rewards.push(outcome),
    toast: () => {},
  };

  return { ctx, store, navigations, rewards };
}

function mount(ctx: AppContext, reviewId: 'morning' | 'daily' = 'morning') {
  const screen = createReviewScreen(ctx, reviewId);
  document.body.appendChild(screen.el);
  screen.mounted?.();
  return screen;
}

const currentLabel = (): string =>
  document.querySelector('.review-card__label')?.textContent ?? '';

const clickDone = async (): Promise<void> => {
  document.querySelector<HTMLButtonElement>('.review-card__done')?.click();
  await flush();
};

const clickSkip = async (): Promise<void> => {
  document.querySelector<HTMLButtonElement>('.review-card__skip')?.click();
  await flush();
};

beforeEach(() => {
  document.body.innerHTML = '';
  const map = new Map<string, string>();
  setStorageBackend({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  });
});

describe('review screen', () => {
  it('shows one item at a time, in order', async () => {
    const { ctx } = setup();
    mount(ctx);

    expect(document.querySelectorAll('.review-card')).toHaveLength(1);
    expect(currentLabel()).toBe(defaultItems('morning')[0]!.label);

    await clickDone();
    expect(currentLabel()).toBe(defaultItems('morning')[1]!.label);
    expect(document.querySelectorAll('.review-card')).toHaveLength(1);
  });

  it('focuses the primary action on mount so Enter advances the flow', () => {
    const { ctx } = setup();
    mount(ctx);
    expect(document.activeElement?.classList.contains('review-card__done')).toBe(true);
  });

  it('logs a full clear once every item is done, and offers the chest', async () => {
    const { ctx, store } = setup();
    mount(ctx);

    for (let i = 0; i < defaultItems('morning').length; i += 1) await clickDone();

    expect(document.querySelector('.review-summary')?.getAttribute('data-tier')).toBe(
      'full',
    );
    expect(store.getState().streak.current).toBe(1);
    expect(store.getState().currency.lumen).toBeGreaterThan(0);
    expect(document.activeElement?.textContent).toContain('Collect your chest');
  });

  it('grades a core-only run as a floor pass and names what was skipped', async () => {
    const { ctx, store } = setup();
    mount(ctx);

    for (const item of defaultItems('morning')) {
      if (item.core) await clickDone();
      else await clickSkip();
    }

    const summary = document.querySelector('.review-summary');
    expect(summary?.getAttribute('data-tier')).toBe('floor');
    // Skipped and set aside are listed apart; between them they name every
    // non-core item.
    expect(
      document.querySelectorAll(
        '.review-summary__skipped:not(.review-summary__set-aside) .review-summary__skipped-item',
      ),
    ).toHaveLength(
      defaultItems('morning').filter((item) => !item.core && !item.optional).length,
    );
    expect(
      document.querySelectorAll(
        '.review-summary__set-aside .review-summary__skipped-item',
      ),
    ).toHaveLength(defaultItems('morning').filter((item) => item.optional).length);
    expect(store.getState().streak.current).toBe(1);
  });

  it('still grades a full clear when the only skip was an optional item', async () => {
    const { ctx, store } = setup();
    mount(ctx);

    const items = defaultItems('morning');
    const optional = items.filter((item) => item.optional);
    expect(optional.length).toBeGreaterThan(0);

    for (const item of items) {
      if (item.optional) await clickSkip();
      else await clickDone();
    }

    const summary = document.querySelector('.review-summary');
    expect(summary?.getAttribute('data-tier')).toBe('full');
    // Named as set aside, and nowhere near the list of things that were missed.
    expect(document.querySelector('.review-summary__set-aside')?.textContent).toContain(
      optional[0]!.label,
    );
    expect(
      document.querySelector('.review-summary__skipped:not(.review-summary__set-aside)'),
    ).toBeNull();
    expect(store.getState().streak.current).toBe(1);
  });

  it('calls the skip button something kinder on an optional item', () => {
    const { ctx } = setup();
    mount(ctx);

    // The default morning routine opens on the optional lunch item.
    expect(defaultItems('morning')[0]?.optional).toBe(true);
    expect(document.querySelector('.review-card__skip')?.textContent).toContain(
      "Doesn't apply today",
    );
    expect(document.querySelector('.review-card .badge--optional')).not.toBeNull();
  });

  it('hands the outcome to the chest when the summary is confirmed', async () => {
    const { ctx, rewards } = setup();
    mount(ctx);

    for (let i = 0; i < defaultItems('morning').length; i += 1) await clickDone();
    document.querySelector<HTMLButtonElement>('.review-summary .btn')?.click();

    expect(rewards).toHaveLength(1);
  });

  it('leaves without logging anything when nothing has been marked yet', async () => {
    const { ctx, store, navigations } = setup();
    mount(ctx);

    document.querySelector<HTMLButtonElement>('.review__exit')?.click();
    await flush();

    expect(navigations).toEqual([{ name: 'city' }]);
    expect(store.getState().history).toEqual([]);
  });

  it('stops listening for keys once destroyed', async () => {
    const { ctx } = setup();
    const screen = mount(ctx);
    const first = currentLabel();

    screen.destroy?.();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    await flush();

    expect(currentLabel()).toBe(first);
  });
});
