import { describe, expect, it } from 'vitest';
import {
  CHECKLIST_META,
  defaultItems,
  maxPoints,
  type Checklist,
} from '@/config/checklists';
import {
  FULL_CLEAR_BONUS_POINTS,
  LUMEN_PER_POINT,
  REVIEW_SHARE_OF_OUTPUT,
} from '@/config/tuning';
import { lumenFor, scoreReview, streakMultiplier } from './scoring';

const morning: Checklist = { ...CHECKLIST_META.morning, items: defaultItems('morning') };
const allMorningIds = morning.items.map((item) => item.id);
const coreMorningIds = morning.items.filter((item) => item.core).map((item) => item.id);

describe('scoreReview', () => {
  it('grades every item done as a full clear and adds the bonus', () => {
    const result = scoreReview(morning, allMorningIds);
    expect(result.tier).toBe('full');
    expect(result.basePoints).toBe(maxPoints(morning));
    expect(result.bonusPoints).toBe(FULL_CLEAR_BONUS_POINTS);
    expect(result.points).toBe(maxPoints(morning) + FULL_CLEAR_BONUS_POINTS);
    expect(result.skippedItemIds).toEqual([]);
    expect(result.countsForStreak).toBe(true);
  });

  it('grades core-items-only as a floor pass that keeps the streak', () => {
    const result = scoreReview(morning, coreMorningIds);
    expect(result.tier).toBe('floor');
    expect(result.bonusPoints).toBe(0);
    expect(result.countsForStreak).toBe(true);
    // Everything not done and not optional; the optional one is set aside.
    expect(result.skippedItemIds.length + result.setAsideItemIds.length).toBe(
      morning.items.length - coreMorningIds.length,
    );
  });

  it('grades a skipped core item as partial, which does not count', () => {
    const withoutOneCore = allMorningIds.filter((id) => id !== coreMorningIds[0]);
    const result = scoreReview(morning, withoutOneCore);
    expect(result.tier).toBe('none');
    expect(result.countsForStreak).toBe(false);
    expect(result.basePoints).toBeGreaterThan(0);
  });

  it('scores an abandoned review as zero points', () => {
    const result = scoreReview(morning, []);
    expect(result.tier).toBe('none');
    expect(result.points).toBe(0);
  });

  it('ignores item ids that are not on the checklist', () => {
    const result = scoreReview(morning, [...allMorningIds, 'not-a-real-item']);
    expect(result.tier).toBe('full');
    expect(result.doneItemIds).toEqual(allMorningIds);
  });
});

describe('scoreReview with optional items', () => {
  const optionalId = 'lunch';
  const optionalItem = morning.items.find((item) => item.id === optionalId);
  const withoutOptional = allMorningIds.filter((id) => id !== optionalId);

  it('is set up against a checklist that actually has one', () => {
    expect(optionalItem?.optional).toBe(true);
  });

  it('still grades a full clear when an optional item is skipped', () => {
    const result = scoreReview(morning, withoutOptional);
    expect(result.tier).toBe('full');
    expect(result.bonusPoints).toBe(FULL_CLEAR_BONUS_POINTS);
    expect(result.countsForStreak).toBe(true);
    expect(result.skippedItemIds).toEqual([]);
    expect(result.setAsideItemIds).toEqual([optionalId]);
  });

  it('takes the set-aside item out of the ceiling as well as the score', () => {
    const skippedPoints = optionalItem?.points ?? 0;
    const result = scoreReview(morning, withoutOptional);
    expect(result.availablePoints).toBe(maxPoints(morning) - skippedPoints);
    expect(result.basePoints).toBe(result.availablePoints);
  });

  it('pays the same city share as a clear with nothing set aside', () => {
    const scale = { cityOutput: 4000, fullClearPoints: 0 };
    const whole = scoreReview(morning, allMorningIds);
    const partial = scoreReview(morning, withoutOptional);

    const lumen = (result: typeof whole): number =>
      lumenFor(result.points, 5, undefined, {
        ...scale,
        fullClearPoints: result.fullClearPoints,
      });

    expect(lumen(partial)).toBe(lumen(whole));
  });

  it('counts an optional item that was done, like any other', () => {
    const result = scoreReview(morning, allMorningIds);
    expect(result.setAsideItemIds).toEqual([]);
    expect(result.availablePoints).toBe(maxPoints(morning));
  });

  it('does not turn skipping everything on an all-optional routine into a clear', () => {
    const allOptional: Checklist = {
      ...CHECKLIST_META.morning,
      items: morning.items.map((item) => ({ ...item, core: false, optional: true })),
    };
    const result = scoreReview(allOptional, []);
    expect(result.tier).toBe('none');
    expect(result.points).toBe(0);
    expect(result.countsForStreak).toBe(false);
  });

  it('still fails a run that skips a required item alongside an optional one', () => {
    const coreOnly = coreMorningIds;
    const result = scoreReview(morning, coreOnly);
    expect(result.tier).toBe('floor');
    expect(result.setAsideItemIds).toEqual([optionalId]);
    expect(result.skippedItemIds).not.toContain(optionalId);
  });
});

describe('streakMultiplier', () => {
  it('is 1x at streak zero and 1.4x at the cap', () => {
    expect(streakMultiplier(0)).toBeCloseTo(1);
    expect(streakMultiplier(20)).toBeCloseTo(1.4);
  });

  it('stops growing past the cap and never goes below 1x', () => {
    expect(streakMultiplier(200)).toBeCloseTo(streakMultiplier(20));
    expect(streakMultiplier(-5)).toBeCloseTo(1);
  });
});

describe('lumenFor', () => {
  it('converts points at the configured rate before the multiplier', () => {
    expect(lumenFor(10, 0)).toBe(10 * LUMEN_PER_POINT);
  });

  it('applies the streak bonus and returns whole Lumen', () => {
    expect(lumenFor(10, 20)).toBe(Math.round(10 * LUMEN_PER_POINT * 1.4));
    expect(Number.isInteger(lumenFor(7, 13))).toBe(true);
  });

  it('pays a full clear more than a floor pass at the same streak', () => {
    const full = scoreReview(morning, allMorningIds);
    const floor = scoreReview(morning, coreMorningIds);
    expect(lumenFor(full.points, 5)).toBeGreaterThan(lumenFor(floor.points, 5));
  });
});

describe('lumenFor, against a city', () => {
  const full = scoreReview(morning, allMorningIds);
  const floor = scoreReview(morning, coreMorningIds);
  const scaleFor = (cityOutput: number) => ({
    cityOutput,
    fullClearPoints: full.fullClearPoints,
  });

  it('pays a full clear the configured share of the city’s daily output', () => {
    const output = 100_000;
    expect(lumenFor(full.points, 0, undefined, scaleFor(output))).toBe(
      Math.round(output * REVIEW_SHARE_OF_OUTPUT),
    );
  });

  it('pro-rates the share by points, so quality still decides the payout', () => {
    const scale = scaleFor(100_000);
    const paid = lumenFor(floor.points, 0, undefined, scale);
    expect(paid).toBe(
      Math.round(
        (100_000 * REVIEW_SHARE_OF_OUTPUT * floor.points) / full.fullClearPoints,
      ),
    );
    expect(paid).toBeLessThan(lumenFor(full.points, 0, undefined, scale));
  });

  it('keeps the flat rate while the city is too small to beat it', () => {
    expect(lumenFor(full.points, 0, undefined, scaleFor(0))).toBe(
      full.points * LUMEN_PER_POINT,
    );
    expect(lumenFor(full.points, 0, undefined, scaleFor(50))).toBe(
      full.points * LUMEN_PER_POINT,
    );
  });

  it('grows with the city instead of flatlining beside it', () => {
    const small = lumenFor(full.points, 0, undefined, scaleFor(10_000));
    const large = lumenFor(full.points, 0, undefined, scaleFor(10_000_000));
    expect(large).toBe(small * 1000);
  });

  it('is not inflated by adding items to a checklist', () => {
    const longer: Checklist = {
      ...morning,
      items: [
        ...morning.items,
        { id: 'extra', label: 'Water the plant', points: 5, core: false },
      ],
    };
    const longFull = scoreReview(
      longer,
      longer.items.map((item) => item.id),
    );
    expect(
      lumenFor(longFull.points, 0, undefined, {
        cityOutput: 100_000,
        fullClearPoints: longFull.fullClearPoints,
      }),
    ).toBe(lumenFor(full.points, 0, undefined, scaleFor(100_000)));
  });
});
