/**
 * The Workshop screen. Enough to prove it wires the buy action to the store
 * and reflects prerequisites — the maths itself is covered in research.test.ts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '@/state/defaults';
import { setStorageBackend } from '@/state/storage';
import { createStore, type Store } from '@/state/store';
import type { AppContext } from '../context';
import { createResearchScreen } from './research';

function setup(cinder = 0, research: string[] = []): {
  ctx: AppContext;
  store: Store;
  toasts: string[];
} {
  const base = createInitialState();
  const store = createStore({
    ...base,
    currency: { ...base.currency, cinder },
    research,
  });
  const toasts: string[] = [];
  const ctx: AppContext = {
    store,
    navigate: () => {},
    presentReward: () => {},
    toast: (message) => void toasts.push(message),
  };
  return { ctx, store, toasts };
}

beforeEach(() => {
  document.body.innerHTML = '';
  const map = new Map<string, string>();
  setStorageBackend({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  });
});

const mount = (ctx: AppContext) => {
  const screen = createResearchScreen(ctx);
  document.body.appendChild(screen.el);
  return screen;
};

describe('workshop screen', () => {
  it('shows the Cinder on hand', () => {
    const { ctx } = setup(42);
    mount(ctx);
    expect(document.querySelector('.ascend__wallet')?.textContent).toContain('42');
  });

  it('buys a node the save can afford and reflects it in the store', () => {
    const { ctx, store } = setup(20);
    mount(ctx);

    // deep-1 costs 10 — find its Research button by card.
    const card = [...document.querySelectorAll('.perk')].find((el) =>
      el.textContent?.includes('Deeper Vault'),
    );
    const button = card?.querySelector<HTMLButtonElement>('button');
    expect(button?.disabled).toBe(false);
    button?.click();

    expect(store.getState().research).toContain('deep-1');
    expect(store.getState().currency.cinder).toBe(10);
  });

  it('disables a node that is too dear or gated', () => {
    const { ctx } = setup(0);
    mount(ctx);
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.perk button')];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });
});
