import { describe, expect, it } from 'vitest';
import { ALTITUDE_BANDS } from './ascension';
import {
  ISLAND_PAGES,
  islandById,
  islandUnlockAscension,
  nextLockedPage,
  PAGE_WIDTH,
  unlockedPages,
} from './islands';
import { BUILDINGS } from './shop';

describe('island pages', () => {
  it('starts on the home cluster, always reachable', () => {
    expect(ISLAND_PAGES[0]!.unlockAtAscension).toBe(0);
    expect(unlockedPages(0).map((p) => p.index)).toEqual([0]);
  });

  it('unlocks one page per ascension, in order', () => {
    ISLAND_PAGES.forEach((page, index) => {
      expect(page.unlockAtAscension).toBe(index);
    });
    expect(unlockedPages(2).map((p) => p.index)).toEqual([0, 1, 2]);
    // Past the last page it stops growing — the final band repeats forever.
    expect(unlockedPages(99).length).toBe(ISLAND_PAGES.length);
  });

  it('names each page after its altitude band', () => {
    ISLAND_PAGES.forEach((page, index) => {
      expect(page.name).toBe(ALTITUDE_BANDS[index]!.name);
    });
  });

  it('points at the next locked page as the pager hint, and null past the end', () => {
    expect(nextLockedPage(0)?.index).toBe(1);
    expect(nextLockedPage(ISLAND_PAGES.length - 1)).toBeNull();
  });

  it('maps island ids to the ascension that unlocks them', () => {
    expect(islandUnlockAscension('main')).toBe(0);
    expect(islandUnlockAscension('cirrus')).toBe(1);
    expect(islandUnlockAscension('deepdark')).toBe(4);
    // An unknown island stays unreachable rather than leaking onto page 0.
    expect(islandUnlockAscension('nowhere')).toBe(Infinity);
  });
});

describe('the catalogue fits on the islands', () => {
  it('gives every building a real island and a slot that exists on it', () => {
    for (const def of BUILDINGS) {
      const spec = islandById(def.island);
      expect(spec, `no island for ${def.id}`).toBeDefined();
      expect(def.slot, `${def.id} slot out of range`).toBeLessThan(spec!.slots.length);
      expect(Number.isFinite(islandUnlockAscension(def.island))).toBe(true);
    }
  });

  it('never puts two buildings on the same slot', () => {
    const seen = new Set<string>();
    for (const def of BUILDINGS) {
      const key = `${def.island}:${def.slot}`;
      expect(seen.has(key), `${key} used twice`).toBe(false);
      seen.add(key);
    }
  });

  it('keeps every island and its slots inside their own page panel', () => {
    for (const page of ISLAND_PAGES) {
      const lo = page.index * PAGE_WIDTH;
      const hi = lo + PAGE_WIDTH;
      for (const spec of page.islands) {
        expect(spec.cx, `${spec.id} centre`).toBeGreaterThanOrEqual(lo);
        expect(spec.cx, `${spec.id} centre`).toBeLessThanOrEqual(hi);
        for (const slot of spec.slots) {
          expect(slot.x, `${spec.id} slot`).toBeGreaterThanOrEqual(lo);
          expect(slot.x, `${spec.id} slot`).toBeLessThanOrEqual(hi);
        }
      }
    }
  });
});
