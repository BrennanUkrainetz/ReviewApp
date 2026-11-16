/**
 * Weekly expeditions — one objective per week, on top of the daily contract.
 *
 * The contract asks for a good day; an expedition asks for a good *week*, which
 * is the scale a habit is actually built at. Like contracts, every one is
 * satisfied just by doing the reviews well — there is no third routine — and
 * the pick is a pure function of the week, so nothing is stored and a reload
 * can never reroll it.
 *
 * The reward is the thing that makes it worth tracking: Cinder, which nothing
 * else pays in a lump, plus a share of the city's output. Plain data; the maths
 * is in `domain/weekly.ts`.
 */
import type { DayRecord } from '@/state/types';

export interface WeeklyDef {
  id: string;
  name: string;
  /** Stated as the thing to do, in the imperative. */
  goal: string;
  /** How many of `count` the week needs. */
  target: number;
  /** How far one day's record goes toward the target. */
  count(day: DayRecord): number;
  /** Cinder paid when it lands. */
  cinder: number;
  /** Share of the city's daily output (at the day's heat) paid when it lands. */
  bonusShare: number;
}

const completed = (day: DayRecord): number =>
  [day.morning, day.daily].filter((record) => record?.completed).length;

const fullCleared = (day: DayRecord): number =>
  [day.morning, day.daily].filter((record) => record?.tier === 'full').length;

export const WEEKLIES: WeeklyDef[] = [
  {
    id: 'steady-week',
    name: 'Steady Week',
    goal: 'Log a review on four different days.',
    target: 4,
    count: (day) => (completed(day) > 0 ? 1 : 0),
    cinder: 10,
    bonusShare: 0.8,
  },
  {
    id: 'clean-week',
    name: 'Clean Week',
    goal: 'Full-clear a review on four different days.',
    target: 4,
    count: (day) => (fullCleared(day) > 0 ? 1 : 0),
    cinder: 15,
    bonusShare: 1.2,
  },
  {
    id: 'perfect-pair',
    name: 'Perfect Pair',
    goal: 'Have two perfect days — both reviews full-cleared.',
    target: 2,
    count: (day) => (fullCleared(day) === 2 ? 1 : 0),
    cinder: 15,
    bonusShare: 1.2,
  },
  {
    id: 'early-riser',
    name: 'Early Riser',
    goal: 'Full-clear the Morning Review three times.',
    target: 3,
    count: (day) => (day.morning?.tier === 'full' ? 1 : 0),
    cinder: 12,
    bonusShare: 1,
  },
  {
    id: 'closing-time',
    name: 'Closing Time',
    goal: 'Full-clear the Daily Review three times.',
    target: 3,
    count: (day) => (day.daily?.tier === 'full' ? 1 : 0),
    cinder: 12,
    bonusShare: 1,
  },
  {
    id: 'full-ledger',
    name: 'Full Ledger',
    goal: 'Log eight reviews this week.',
    target: 8,
    count: completed,
    cinder: 12,
    bonusShare: 1,
  },
];

const WEEKLY_BY_ID = new Map(WEEKLIES.map((weekly) => [weekly.id, weekly]));

export function getWeekly(id: string): WeeklyDef | undefined {
  return WEEKLY_BY_ID.get(id);
}
