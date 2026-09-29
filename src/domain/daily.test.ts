/**
 * Heat, contracts, and achievements — the three things that make one day
 * different from the next.
 */
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '@/config/achievements';
import { CONTRACTS } from '@/config/contracts';
import { HEAT_CAP_DAYS, HEAT_PER_DAY } from '@/config/tuning';
import { createInitialState } from '@/state/defaults';
import type { AerieState, DayRecord, Tier } from '@/state/types';
import { achievementMultiplier, newlyEarned } from './achievements';
import { contractBonus, contractFor, contractJustSettled } from './contracts';
import { addDays, addWeekdays } from './dates';
import { describeHeat, heatDays, heatMultiplier } from './heat';

const TODAY = '2026-07-21'; // a Tuesday

function day(date: string, morning: Tier | null, daily: Tier | null = null): DayRecord {
  const record = (tier: Tier | null) =>
    tier === null
      ? null
      : { completed: true, tier, pointsEarned: 5, lumenEarned: 50, doneItemIds: [] };
  return { date, morning: record(morning), daily: record(daily), dayOff: false };
}

/** `n` consecutive full-clear weekdays ending today. */
function fullClearRun(days: number): DayRecord[] {
  return Array.from({ length: days }, (_, i) =>
    day(addWeekdays(TODAY, -(days - 1 - i)), 'full'),
  );
}

describe('heat', () => {
  it('is cold with nothing logged', () => {
    expect(heatDays([], TODAY)).toBe(0);
    expect(heatMultiplier([], TODAY)).toBe(1);
  });

  it('counts consecutive full-clear days', () => {
    expect(heatDays(fullClearRun(4), TODAY)).toBe(4);
    expect(heatMultiplier(fullClearRun(4), TODAY)).toBeCloseTo(1 + 4 * HEAT_PER_DAY);
  });

  it('does not build on a floor pass — showing up is the streak, not heat', () => {
    const history = [day(addWeekdays(TODAY, -1), 'full'), day(TODAY, 'floor')];
    expect(heatDays(history, TODAY)).toBe(0);
  });

  it('holds over a weekend rather than cooling', () => {
    // Full clears Thursday and Friday, read on the Monday morning after.
    const history = [day('2026-07-16', 'full'), day('2026-07-17', 'full')];
    expect(heatDays(history, '2026-07-20')).toBe(2);
  });

  it('caps rather than growing without limit', () => {
    const long = heatMultiplier(fullClearRun(HEAT_CAP_DAYS + 30), TODAY);
    expect(long).toBeCloseTo(1 + HEAT_CAP_DAYS * HEAT_PER_DAY);
  });

  it('describes itself without claiming a combo that is not there', () => {
    expect(describeHeat(0)).toMatch(/No heat/);
    expect(describeHeat(3)).toMatch(/3 full-clear days running/);
    expect(describeHeat(HEAT_CAP_DAYS)).toMatch(/peak/);
  });
});

describe('daily contracts', () => {
  it('gives the same contract for the same day, every time', () => {
    expect(contractFor(TODAY).id).toBe(contractFor(TODAY).id);
  });

  it('varies across consecutive days rather than walking the list in order', () => {
    const week = Array.from({ length: 14 }, (_, i) => contractFor(addDays(TODAY, i)).id);
    expect(new Set(week).size).toBeGreaterThan(1);
  });

  it('only ever names a contract from the catalogue', () => {
    const ids = new Set(CONTRACTS.map((c) => c.id));
    for (let i = 0; i < 400; i += 1) {
      expect(ids.has(contractFor(addDays(TODAY, i)).id)).toBe(true);
    }
  });

  it('settles on the review that completes it, and not again after', () => {
    const bothLogged = CONTRACTS.find((c) => c.id === 'both-logged')!;
    const empty = day(TODAY, null);
    const one = day(TODAY, 'full');
    const two = day(TODAY, 'full', 'floor');

    expect(contractJustSettled(bothLogged, empty, one)).toBe(false);
    expect(contractJustSettled(bothLogged, one, two)).toBe(true);
    // Already settled before this review: pays nothing more.
    expect(contractJustSettled(bothLogged, two, two)).toBe(false);
  });

  it('settles on the first review of the day when that is the whole goal', () => {
    const any = CONTRACTS.find((c) => c.id === 'any-review')!;
    expect(contractJustSettled(any, undefined, day(TODAY, 'floor'))).toBe(true);
  });

  it('pays a share of the day, with a floor for the first week', () => {
    const contract = CONTRACTS.find((c) => c.id === 'both-full')!;
    expect(contractBonus(contract, 1_000_000)).toBe(1_000_000 * contract.bonusShare);
    expect(contractBonus(contract, 1)).toBeGreaterThan(1);
  });
});

describe('achievements', () => {
  const withState = (patch: Partial<AerieState>): AerieState => ({
    ...createInitialState(),
    ...patch,
  });

  it('has no duplicate ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('earns nothing on a brand new save', () => {
    expect(newlyEarned(createInitialState())).toEqual([]);
  });

  it('earns the first-review badge once anything is logged', () => {
    const state = withState({ history: [day(TODAY, 'floor')] });
    expect(newlyEarned(state)).toContain('first-light');
  });

  it('never re-earns what is already held', () => {
    const state = withState({
      history: [day(TODAY, 'floor')],
      achievements: ['first-light'],
    });
    expect(newlyEarned(state)).not.toContain('first-light');
  });

  it('keeps a badge whose condition has since stopped being true', () => {
    // The streak broke, but the record of having held it did not.
    const state = withState({
      streak: { ...createInitialState().streak, current: 0, longest: 7 },
      achievements: ['streak-7'],
    });
    expect(newlyEarned(state)).not.toContain('streak-7');
    expect(achievementMultiplier(state.achievements)).toBeGreaterThan(1);
  });

  it('survives a predicate that throws on an odd save', () => {
    const broken = { ...createInitialState(), city: null } as unknown as AerieState;
    expect(() => newlyEarned(broken)).not.toThrow();
  });

  it('ignores ids that are no longer in the catalogue', () => {
    expect(achievementMultiplier(['a-badge-that-was-renamed'])).toBe(1);
  });

  it('compounds one percent at a time', () => {
    const three = ACHIEVEMENTS.slice(0, 3).map((a) => a.id);
    expect(achievementMultiplier(three)).toBeCloseTo(1.03);
  });

  it('keeps a heat badge after the run it was earned on has cooled', () => {
    // Ten full-clear weekdays, then two cold ones. The live heat is 0.
    const history = [
      ...Array.from({ length: 10 }, (_, i) => day(addWeekdays(TODAY, i - 11), 'full')),
      day(addWeekdays(TODAY, -1), 'floor'),
      day(TODAY, 'floor'),
    ];
    const earned = newlyEarned(withState({ history }));
    expect(earned).toContain('heat-10');
    expect(earned).not.toContain('heat-cap');
    expect(heatDays(history, TODAY)).toBe(0);
  });

  it('does not let a gap in history pass for a run', () => {
    const history = [
      ...Array.from({ length: 5 }, (_, i) => day(addWeekdays(TODAY, i - 12), 'full')),
      // A missed week, then five more.
      ...Array.from({ length: 5 }, (_, i) => day(addWeekdays(TODAY, i - 4), 'full')),
    ];
    expect(newlyEarned(withState({ history }))).not.toContain('heat-10');
  });

  it('treats a day off as neutral rather than as a break', () => {
    const history = [
      ...Array.from({ length: 5 }, (_, i) => day(addWeekdays(TODAY, i - 6), 'full')),
      { ...day(addWeekdays(TODAY, -1), null), dayOff: true },
      day(TODAY, 'full'),
    ];
    // Six full clears either side of a deliberate rest day.
    expect(newlyEarned(withState({ history }))).toContain('heat-5');
    expect(newlyEarned(withState({ history }))).not.toContain('comeback');
  });

  it('treats the weekend as neutral too, rather than as two missed days', () => {
    // Thursday and Friday, then Monday and Tuesday: one unbroken run of four,
    // with nothing to come back from.
    const history = [
      day('2026-07-16', 'full'),
      day('2026-07-17', 'full'),
      day('2026-07-20', 'full'),
      day(TODAY, 'full'),
    ];
    const earned = newlyEarned(withState({ history }));
    expect(earned).not.toContain('comeback');
    expect(heatDays(history, TODAY)).toBe(4);
  });

  it('earns the comeback badge only for a genuinely missed day', () => {
    const unbroken = [day(addWeekdays(TODAY, -1), 'floor'), day(TODAY, 'floor')];
    expect(newlyEarned(withState({ history: unbroken }))).not.toContain('comeback');

    const broken = [day(addWeekdays(TODAY, -3), 'floor'), day(TODAY, 'floor')];
    expect(newlyEarned(withState({ history: broken }))).toContain('comeback');
  });

  it('earns the weekday sweep once every weekday is covered', () => {
    const four = Array.from({ length: 4 }, (_, i) =>
      day(addWeekdays(TODAY, -i), 'floor'),
    );
    expect(newlyEarned(withState({ history: four }))).not.toContain('every-weekday');

    // The fifth distinct weekday completes Monday through Friday.
    const five = [...four, day(addWeekdays(TODAY, -4), 'floor')];
    expect(newlyEarned(withState({ history: five }))).toContain('every-weekday');
  });

  it('notices a routine that has been rewritten', () => {
    const base = createInitialState();
    const edited = withState({
      checklists: {
        ...base.checklists,
        morning: [
          ...base.checklists.morning,
          { id: 'walk', label: 'Walk the long way', points: 1, core: false },
        ],
      },
    });
    expect(newlyEarned(edited)).toContain('edited-checklist');
    expect(newlyEarned(base)).not.toContain('edited-checklist');
  });
});
