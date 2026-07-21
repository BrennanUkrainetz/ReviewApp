import { describe, expect, it } from 'vitest';
import { CHECKLISTS, maxPoints } from '@/config/checklists';
import { FULL_CLEAR_BONUS_POINTS, LUMEN_PER_POINT } from '@/config/tuning';
import { lumenFor, scoreReview, streakMultiplier } from './scoring';

const morning = CHECKLISTS.morning;
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
    expect(result.skippedItemIds.length).toBe(morning.items.length - coreMorningIds.length);
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
