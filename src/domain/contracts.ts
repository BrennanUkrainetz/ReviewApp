/**
 * Picking and settling the day's contract.
 *
 * The pick is a pure function of the date. No randomness, nothing persisted:
 * the same day always yields the same contract, so reloading the app can never
 * reroll an objective into an easier one.
 */
import { CONTRACTS, type ContractDef } from '@/config/contracts';
import { CONTRACT_BONUS_FLOOR } from '@/config/tuning';
import type { DayRecord } from '@/state/types';
import type { DateKey } from './dates';

/**
 * FNV-1a over the date string. Any stable hash would do; this one is four
 * lines and spreads consecutive dates across the list instead of walking them
 * in order, which a simple day-number modulo would do.
 */
function hashDate(date: DateKey): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < date.length; i += 1) {
    hash ^= date.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The contract for a calendar day. Always the same one for the same day. */
export function contractFor(date: DateKey): ContractDef {
  const index = hashDate(date) % CONTRACTS.length;
  return CONTRACTS[index] ?? CONTRACTS[0]!;
}

/** What settling today's contract pays, given the day's payout so far. */
export function contractBonus(contract: ContractDef, dayPayout: number): number {
  return Math.max(CONTRACT_BONUS_FLOOR, Math.round(dayPayout * contract.bonusShare));
}

/**
 * Whether *this* review is the one that completes the contract — satisfied
 * now, but not before. Contracts pay once, on the review that lands them.
 */
export function contractJustSettled(
  contract: ContractDef,
  before: DayRecord | undefined,
  after: DayRecord,
): boolean {
  const wasDone = before ? contract.satisfiedBy(before) : false;
  return !wasDone && contract.satisfiedBy(after);
}
