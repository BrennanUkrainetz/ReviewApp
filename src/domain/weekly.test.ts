import { describe, expect, it } from 'vitest';
import { getWeekly, WEEKLIES } from '@/config/weekly';
import type { DayRecord, ReviewRecord } from '@/state/types';
import { addDays, weekStart } from './dates';
import {
  weekliesCompleted,
  weeklyBonus,
  weeklyFor,
  weeklyJustSettled,
  weeklyProgress,
} from './weekly';

const MON = '2026-07-20';
const record = (tier: ReviewRecord['tier']): ReviewRecord => ({
  completed: true,
  tier,
  pointsEarned: 10,
  lumenEarned: 0,
  doneItemIds: [],
});
const day = (
  date: string,
  morning: ReviewRecord | null,
  daily: ReviewRecord | null = null,
): DayRecord => ({
  date,
  morning,
  daily,
  dayOff: false,
});

describe('weekStart', () => {
  it('lands on the Monday for every day of the week, Sunday included', () => {
    for (let offset = 0; offset < 7; offset += 1) {
      expect(weekStart(addDays(MON, offset))).toBe(MON);
    }
    expect(weekStart(addDays(MON, 7))).toBe(addDays(MON, 7));
  });
});

describe('weeklyFor', () => {
  it('is the same expedition all week', () => {
    const pick = weeklyFor(MON).id;
    for (let offset = 1; offset < 7; offset += 1) {
      expect(weeklyFor(addDays(MON, offset)).id).toBe(pick);
    }
  });

  it('actually rotates across weeks', () => {
    const picks = new Set(
      Array.from({ length: 30 }, (_, week) => weeklyFor(addDays(MON, week * 7)).id),
    );
    expect(picks.size).toBeGreaterThan(2);
  });
});

describe('progress', () => {
  const clean = getWeekly('clean-week')!;

  it('counts only days inside the week', () => {
    const history = [
      day(addDays(MON, -1), record('full')), // the Sunday before
      day(MON, record('full')),
      day(addDays(MON, 1), record('floor')),
      day(addDays(MON, 2), null, record('full')),
    ];
    expect(weeklyProgress(clean, history, addDays(MON, 3))).toBe(2);
  });

  it('settles on the review that reaches the target, and only that one', () => {
    const three = [0, 1, 2].map((offset) => day(addDays(MON, offset), record('full')));
    const four = [...three, day(addDays(MON, 3), record('full'))];
    const five = [...four, day(addDays(MON, 4), record('full'))];
    expect(weeklyJustSettled(clean, three, four, addDays(MON, 3))).toBe(true);
    expect(weeklyJustSettled(clean, four, five, addDays(MON, 4))).toBe(false);
  });

  it('counts completed weeks across history', () => {
    const weekly = weeklyFor(MON);
    // Build a week that satisfies whatever this week's expedition is.
    const history = [0, 1, 2, 3, 4].map((offset) =>
      day(addDays(MON, offset), record('full'), record('full')),
    );
    expect(weeklyProgress(weekly, history, MON)).toBe(weekly.target);
    expect(weekliesCompleted(history)).toBe(1);
  });
});

describe('the catalogue', () => {
  it('can be finished in a five-day week', () => {
    // Every expedition must be reachable Monday to Friday with both reviews
    // full-cleared — nothing may ask for the weekend.
    const week = [0, 1, 2, 3, 4].map((offset) =>
      day(addDays(MON, offset), record('full'), record('full')),
    );
    for (const weekly of WEEKLIES) {
      expect(weeklyProgress(weekly, week, MON), weekly.id).toBe(weekly.target);
    }
  });

  it('pays a floor while the city is small', () => {
    expect(weeklyBonus(WEEKLIES[0]!, 0)).toBeGreaterThan(0);
    expect(weeklyBonus(WEEKLIES[0]!, 1e9)).toBeGreaterThan(
      weeklyBonus(WEEKLIES[0]!, 1e6),
    );
  });
});
