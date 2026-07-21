/**
 * Forward-migrations for saved state.
 *
 * `migrate` takes whatever was in storage and returns something the current
 * app can run on. It is deliberately forgiving: a local single-user save is
 * never worth throwing away over a missing field.
 */
import { createInitialState, STATE_VERSION } from './defaults';
import type { AerieState, DayRecord, ReviewRecord } from './types';

type Unknown = Record<string, unknown>;

const isObject = (value: unknown): value is Unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const strList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function coerceReview(value: unknown): ReviewRecord | null {
  if (!isObject(value)) return null;
  if (!bool(value['completed'], false)) return null;
  const tier = value['tier'];
  return {
    completed: true,
    tier: tier === 'full' || tier === 'floor' ? tier : 'none',
    pointsEarned: num(value['pointsEarned'], 0),
    lumenEarned: num(value['lumenEarned'], 0),
    doneItemIds: strList(value['doneItemIds']),
  };
}

function coerceDay(value: unknown): DayRecord | null {
  if (!isObject(value)) return null;
  const date = str(value['date']);
  if (!date) return null;
  return {
    date,
    morning: coerceReview(value['morning']),
    daily: coerceReview(value['daily']),
    dayOff: bool(value['dayOff'], false),
  };
}

/** Normalises unknown persisted data into a valid, current-version state. */
export function migrate(raw: unknown): AerieState {
  const base = createInitialState();
  if (!isObject(raw)) return base;

  const streak = isObject(raw['streak']) ? raw['streak'] : {};
  const currency = isObject(raw['currency']) ? raw['currency'] : {};
  const milestones = isObject(raw['milestones']) ? raw['milestones'] : {};
  const city = isObject(raw['city']) ? raw['city'] : {};
  const cosmetics = isObject(city['cosmetics']) ? city['cosmetics'] : {};
  const settings = isObject(raw['settings']) ? raw['settings'] : {};

  const history = Array.isArray(raw['history'])
    ? raw['history']
        .map(coerceDay)
        .filter((day): day is DayRecord => day !== null)
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const lastCompletedDate = str(streak['lastCompletedDate']);

  return {
    version: STATE_VERSION,
    streak: {
      current: num(streak['current'], 0),
      longest: num(streak['longest'], 0),
      lastCompletedDate,
      // v0 saves had no `lastActiveDate`; the completion date is the best guess.
      lastActiveDate: str(streak['lastActiveDate']) ?? lastCompletedDate,
      daysOffUsed: num(streak['daysOffUsed'], 0),
    },
    currency: { lumen: num(currency['lumen'], 0) },
    history,
    milestones: {
      nextBigAt: num(milestones['nextBigAt'], base.milestones.nextBigAt),
      nextSmallAt: num(milestones['nextSmallAt'], base.milestones.nextSmallAt),
      smallInterval: num(milestones['smallInterval'], base.milestones.smallInterval),
      bigInterval: num(milestones['bigInterval'], base.milestones.bigInterval),
      totalBigMilestonesHit: num(milestones['totalBigMilestonesHit'], 0),
    },
    city: {
      buildings: Array.isArray(city['buildings'])
        ? city['buildings'].flatMap((entry) => {
            if (!isObject(entry)) return [];
            const id = str(entry['id']);
            return id ? [{ id, level: Math.max(1, num(entry['level'], 1)) }] : [];
          })
        : [],
      cosmetics: {
        unlocked: strList(cosmetics['unlocked']),
        equipped: strList(cosmetics['equipped']),
      },
    },
    settings: {
      reduceMotion: bool(settings['reduceMotion'], false),
      muted: bool(settings['muted'], true),
    },
  };
}
