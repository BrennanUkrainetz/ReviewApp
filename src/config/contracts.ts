/**
 * Daily contracts — one rotating objective per calendar day.
 *
 * The contract is picked deterministically from the date, so it is the same
 * every time the app is opened that day, survives a reload, and needs nothing
 * stored to stay stable. Nothing here is *extra* work: every contract is
 * satisfied by doing the reviews, sometimes a particular way. It's a reason to
 * full-clear rather than floor, not a third routine.
 */
import type { DayRecord } from '@/state/types';

export interface ContractDef {
  id: string;
  name: string;
  /** Stated as the thing to do, in the imperative. */
  goal: string;
  /** Share of the day's payout paid when it lands. */
  bonusShare: number;
  /** Whether the day, as recorded, satisfies it. */
  satisfiedBy(day: DayRecord): boolean;
}

const fullCleared = (day: DayRecord): number =>
  [day.morning, day.daily].filter((record) => record?.tier === 'full').length;

const completed = (day: DayRecord): number =>
  [day.morning, day.daily].filter((record) => record?.completed).length;

export const CONTRACTS: ContractDef[] = [
  {
    id: 'both-logged',
    name: 'Round Trip',
    goal: 'Log both reviews today.',
    bonusShare: 1,
    satisfiedBy: (day) => completed(day) === 2,
  },
  {
    id: 'one-full',
    name: 'Clean Sweep',
    goal: 'Full-clear either review.',
    bonusShare: 0.75,
    satisfiedBy: (day) => fullCleared(day) >= 1,
  },
  {
    id: 'both-full',
    name: 'Perfect Day',
    goal: 'Full-clear both reviews.',
    bonusShare: 2,
    satisfiedBy: (day) => fullCleared(day) === 2,
  },
  {
    id: 'morning-full',
    name: 'Early Ascent',
    goal: 'Full-clear the Morning Review.',
    bonusShare: 1,
    satisfiedBy: (day) => day.morning?.tier === 'full',
  },
  {
    id: 'daily-full',
    name: 'Clean Descent',
    goal: 'Full-clear the Daily Review.',
    bonusShare: 1,
    satisfiedBy: (day) => day.daily?.tier === 'full',
  },
  {
    id: 'any-review',
    name: 'Signal Sent',
    goal: 'Log any review today.',
    bonusShare: 0.4,
    satisfiedBy: (day) => completed(day) >= 1,
  },
];

const CONTRACT_BY_ID = new Map(CONTRACTS.map((contract) => [contract.id, contract]));

export function getContract(id: string): ContractDef | undefined {
  return CONTRACT_BY_ID.get(id);
}
