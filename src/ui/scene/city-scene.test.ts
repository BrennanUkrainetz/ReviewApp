/**
 * The paged scene. The visual polish can't be asserted, but the navigation can:
 * the pager only appears once there's more than one island, and pressing an
 * arrow pans the world one page-width and renames the island you're looking at.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { today } from '@/domain/dates';
import { createInitialState } from '@/state/defaults';
import { setStorageBackend } from '@/state/storage';
import { createStore, type Store } from '@/state/store';
import type { DayRecord } from '@/state/types';
import { createCityScene } from './city-scene';

/** A store whose city has ascended `count` times, unlocking `count` high pages. */
function storeAt(count: number): Store {
  const base = createInitialState(new Date(2026, 6, 22));
  return createStore({ ...base, ascension: { ...base.ascension, count } });
}

/** A day, today, on which a review was full-cleared — one day of heat. */
function fullClearToday(): DayRecord {
  return {
    date: today(),
    morning: {
      completed: true,
      tier: 'full',
      pointsEarned: 12,
      lumenEarned: 120,
      doneItemIds: [],
    },
    daily: null,
    dayOff: false,
  };
}

const q = <T extends Element>(root: HTMLElement, sel: string): T =>
  root.querySelector<T>(sel)!;

beforeEach(() => {
  const map = new Map<string, string>();
  setStorageBackend({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  });
});

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

describe('the city pager', () => {
  it('stays hidden while only the home cluster is reachable', () => {
    const scene = createCityScene(storeAt(0));
    expect(q<HTMLElement>(scene.el, '.scene-pager').hidden).toBe(true);
    // The home page is still shown, at rest.
    expect(q<SVGGElement>(scene.el, '.scene__world').style.transform).toBe(
      'translateX(0px)',
    );
    scene.destroy();
  });

  it('appears once an ascension has opened a second island', () => {
    const scene = createCityScene(storeAt(2));
    expect(q<HTMLElement>(scene.el, '.scene-pager').hidden).toBe(false);
    expect(q<HTMLButtonElement>(scene.el, '.scene-pager__arrow--prev').disabled).toBe(
      true,
    );
    expect(q<HTMLButtonElement>(scene.el, '.scene-pager__arrow--next').disabled).toBe(
      false,
    );
    expect(q<HTMLElement>(scene.el, '.scene-pager__label').textContent).toBe(
      'Cloud Shelf',
    );
    scene.destroy();
  });

  it('pans the world and renames the island when an arrow is pressed', () => {
    const scene = createCityScene(storeAt(2));
    const world = q<SVGGElement>(scene.el, '.scene__world');
    const prev = q<HTMLButtonElement>(scene.el, '.scene-pager__arrow--prev');
    const next = q<HTMLButtonElement>(scene.el, '.scene-pager__arrow--next');
    const label = q<HTMLElement>(scene.el, '.scene-pager__label');

    next.click();
    expect(world.style.transform).toBe('translateX(-1200px)');
    expect(label.textContent).toBe('Cirrus');
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(false);

    next.click();
    expect(world.style.transform).toBe('translateX(-2400px)');
    expect(label.textContent).toBe('Stratosphere');
    // Page 2 is the last one unlocked at two ascensions.
    expect(next.disabled).toBe(true);

    prev.click();
    expect(world.style.transform).toBe('translateX(-1200px)');
    expect(next.disabled).toBe(false);
    scene.destroy();
  });
});

describe('the heat layer', () => {
  it('is present but cold with no full-clear combo running', () => {
    const scene = createCityScene(storeAt(0));
    expect(scene.el.querySelector('.scene__heat')).not.toBeNull();
    expect(scene.el.querySelectorAll('.scene__ember').length).toBeGreaterThan(0);
    expect(scene.el.style.getPropertyValue('--heat')).toBe('0.000');
    scene.destroy();
  });

  it('lights up when a combo is running today', () => {
    const base = createInitialState(new Date(2026, 6, 22));
    const store = createStore({ ...base, history: [fullClearToday()] });
    const scene = createCityScene(store);
    expect(Number(scene.el.style.getPropertyValue('--heat'))).toBeGreaterThan(0);
    scene.destroy();
  });
});
