/**
 * The vault panel. The rule worth a screen-level test is the one the whole
 * mechanic rests on: outside a window the number is visible and there is
 * nothing to press.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '@/state/defaults';
import { setStorageBackend } from '@/state/storage';
import { createStore, type Store } from '@/state/store';
import { createVaultPanel } from './vault';

const DAY = new Date(2026, 6, 22);

/** A city producing something, with the vault accruing since midnight. */
function setup(): { store: Store; collected: number[] } {
  const base = createInitialState(DAY);
  const store = createStore({
    ...base,
    city: { ...base.city, buildings: [{ id: 'greenhouse', level: 40 }] },
    vault: { ...base.vault, accruedThrough: DAY.getTime() },
  });
  return { store, collected: [] };
}

beforeEach(() => {
  const map = new Map<string, string>();
  setStorageBackend({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const button = (root: HTMLElement): HTMLButtonElement =>
  root.querySelector('.vault__collect')!;

describe('vault panel', () => {
  it('shows the amount but hides the button while the vault is shut', () => {
    vi.setSystemTime(new Date(2026, 6, 22, 11));
    const { store, collected } = setup();
    const panel = createVaultPanel(store, (lumen) => collected.push(lumen));

    expect(store.getState().vault.lumen).toBeGreaterThan(0);
    expect(panel.el.querySelector('.vault__amount')?.textContent).not.toBe('0');
    expect(button(panel.el).hidden).toBe(true);
    expect(panel.el.textContent).toContain('opens at');

    panel.destroy();
  });

  it('offers the button inside a window, and pays once', () => {
    vi.setSystemTime(new Date(2026, 6, 22, 16, 15));
    const { store, collected } = setup();
    const panel = createVaultPanel(store, (lumen) => collected.push(lumen));

    expect(button(panel.el).hidden).toBe(false);
    button(panel.el).click();

    expect(collected).toHaveLength(1);
    expect(collected[0]).toBeGreaterThan(0);
    expect(store.getState().currency.lumen).toBe(collected[0]);
    expect(store.getState().vault.lumen).toBe(0);

    // The window is spent; a second press does nothing.
    button(panel.el).click();
    expect(collected).toHaveLength(1);

    panel.destroy();
  });

  it('stops ticking once destroyed', () => {
    vi.setSystemTime(new Date(2026, 6, 22, 11));
    const { store, collected } = setup();
    const panel = createVaultPanel(store, (lumen) => collected.push(lumen));

    panel.destroy();
    const banked = store.getState().vault.lumen;
    vi.advanceTimersByTime(120_000);
    expect(store.getState().vault.lumen).toBe(banked);
  });
});
