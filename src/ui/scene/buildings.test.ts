/**
 * The sprite kit is parametric, so the failure mode is not "this looks wrong"
 * — it's a `NaN` in a path, a building that grows off the top of the scene, or
 * a catalogue tier with no spec at all. Those are all checkable.
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '@/config/shop';
import { BUILDING_MAX_LEVEL } from '@/config/tuning';
import { buildingSpec, hearthHall, renderBuilding } from './buildings';
import { annexCount, heightAt, widthAt } from './kit';

const LEVELS = [1, 2, 5, 9, 10, 24, 25, 49, 50, 99, 100, 150, BUILDING_MAX_LEVEL];

/** Every numeric attribute anywhere in the tree, including inside path data. */
function numbersIn(node: Element): number[] {
  const found: number[] = [];
  for (const element of [node, ...node.querySelectorAll('*')]) {
    for (const attr of Array.from(element.attributes)) {
      // Path data and plain numeric attributes both end up here.
      for (const match of attr.value.matchAll(/-?\d+(\.\d+)?(e-?\d+)?/gi)) {
        found.push(Number(match[0]));
      }
      if (/NaN|Infinity|undefined/i.test(attr.value)) found.push(Number.NaN);
    }
  }
  return found;
}

describe('the catalogue and the kit agree', () => {
  it('has a spec for every building that can be bought', () => {
    for (const def of BUILDINGS) {
      expect(buildingSpec(def.id), `no spec for ${def.id}`).toBeDefined();
    }
  });

  it('draws something for every building, at every level', () => {
    for (const def of BUILDINGS) {
      for (const level of LEVELS) {
        expect(renderBuilding(def.id, level), `${def.id} @ ${level}`).not.toBeNull();
      }
    }
  });

  it('returns null for an id that is not in the kit', () => {
    expect(renderBuilding('ghost-tower', 4)).toBeNull();
  });
});

describe('geometry stays finite', () => {
  it('never emits NaN, Infinity, or undefined into an attribute', () => {
    for (const def of BUILDINGS) {
      for (const level of LEVELS) {
        const node = renderBuilding(def.id, level)!;
        const bad = numbersIn(node).filter((value) => !Number.isFinite(value));
        expect(bad, `${def.id} @ level ${level}`).toEqual([]);
      }
    }
  });

  it('draws the hearth without a level at all', () => {
    expect(numbersIn(hearthHall()).every(Number.isFinite)).toBe(true);
  });

  it('handles a level below 1 rather than producing a degenerate shape', () => {
    for (const def of BUILDINGS) {
      const node = renderBuilding(def.id, 0)!;
      expect(numbersIn(node).every(Number.isFinite)).toBe(true);
    }
  });
});

describe('growth', () => {
  it('gets taller with every level', () => {
    const spec = buildingSpec('lighthouse')!;
    let previous = 0;
    for (const level of LEVELS) {
      const height = heightAt(spec, level);
      expect(height).toBeGreaterThan(previous);
      previous = height;
    }
  });

  it('stays inside the scene at the level ceiling', () => {
    // The scene viewport is 1200×640 and islands sit around y=300–500, so a
    // building taller than ~260 would run off the top of the picture.
    for (const def of BUILDINGS) {
      const spec = buildingSpec(def.id)!;
      expect(heightAt(spec, BUILDING_MAX_LEVEL), def.id).toBeLessThan(260);
    }
  });

  it('widens far more slowly than it grows, so towers stay towers', () => {
    const spec = buildingSpec('anchor-spire')!;
    // Compare how much each *grew*, not the raw ratios — both start at 1, so
    // the ratios flatter width and the comparison would be meaningless.
    const heightGain = heightAt(spec, 200) / heightAt(spec, 1) - 1;
    const widthGain = widthAt(spec, 200) / widthAt(spec, 1) - 1;
    expect(heightGain).toBeGreaterThan(widthGain * 2);
  });

  it('adds a wing at each milestone level, matching the output doublings', () => {
    expect(annexCount(1)).toBe(0);
    expect(annexCount(9)).toBe(0);
    expect(annexCount(10)).toBe(1);
    expect(annexCount(25)).toBe(2);
    expect(annexCount(BUILDING_MAX_LEVEL)).toBe(6);
  });
});
