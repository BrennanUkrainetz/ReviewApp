/**
 * Forward-migrations for saved state.
 *
 * `migrate` takes whatever was in storage and returns something the current
 * app can run on. It is deliberately forgiving: a local single-user save is
 * never worth throwing away over a missing field.
 */
import { defaultItems, REVIEW_IDS } from '@/config/checklists';
import { getAchievement } from '@/config/achievements';
import { getPerk } from '@/config/perks';
import { getResearch } from '@/config/research';
import { CHARTER_MIN_LEVEL } from '@/config/tuning';
import { charterEarnedBy, clampCharter } from '@/domain/charter';
import { isDateKey } from '@/domain/dates';
import { sanitizeItems } from './checklists';
import { createInitialState, STATE_VERSION } from './defaults';
import type {
  AerieState,
  ChecklistItem,
  DayRecord,
  ReviewId,
  ReviewRecord,
} from './types';

type Unknown = Record<string, unknown>;

const isObject = (value: unknown): value is Unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const strList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

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

/**
 * One routine's edited items. Falls back to the shipped defaults rather than
 * to nothing: a save with an unreadable — or emptied — checklist should come
 * back with a working review, not a routine with no items in it.
 */
function coerceChecklist(value: unknown, id: ReviewId): ChecklistItem[] {
  if (!Array.isArray(value)) return defaultItems(id);

  const items = sanitizeItems(
    value.flatMap((entry): Partial<ChecklistItem>[] => {
      if (!isObject(entry)) return [];
      const hint = str(entry['hint']);
      return [
        {
          id: str(entry['id']) ?? '',
          label: str(entry['label']) ?? '',
          points: num(entry['points'], 1),
          core: bool(entry['core'], false),
          // Absent before v9. A save that never knew about optional items has
          // none, which is exactly how they scored before.
          optional: bool(entry['optional'], false),
          ...(hint ? { hint } : {}),
        },
      ];
    }),
  );

  return items.length > 0 ? items : defaultItems(id);
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

  // v2 saves predate lifetime tracking. Recovering it from history beats
  // starting from zero, since both shop reveals and the Aether grant key off
  // it — and the balance on hand is a floor, for a save whose history was
  // trimmed.
  const lifetimeLumen = Math.max(
    num(currency['lifetimeLumen'], 0),
    num(currency['lumen'], 0),
    history.reduce(
      (sum, day) => sum + (day.morning?.lumenEarned ?? 0) + (day.daily?.lumenEarned ?? 0),
      0,
    ),
  );

  const buildings = Array.isArray(city['buildings'])
    ? city['buildings'].flatMap((entry) => {
        if (!isObject(entry)) return [];
        const id = str(entry['id']);
        return id ? [{ id, level: Math.max(1, num(entry['level'], 1)) }] : [];
      })
    : [];

  const ascension = isObject(raw['ascension']) ? raw['ascension'] : {};
  const motes = isObject(raw['motes']) ? raw['motes'] : {};
  const vault = isObject(raw['vault']) ? raw['vault'] : {};
  // Only perks that still exist, so a renamed perk can't leave a save holding
  // an effect nothing in the code knows how to apply.
  const perks = strList(ascension['perks']).filter((id) => getPerk(id));

  // v1 saves had no `checklists`; the items lived in config, so the defaults
  // *are* that save's checklists.
  const savedChecklists = isObject(raw['checklists']) ? raw['checklists'] : {};
  const checklists = Object.fromEntries(
    REVIEW_IDS.map((id) => [id, coerceChecklist(savedChecklists[id], id)]),
  ) as AerieState['checklists'];

  return {
    version: STATE_VERSION,
    checklists,
    streak: {
      current: num(streak['current'], 0),
      longest: num(streak['longest'], 0),
      lastCompletedDate,
      // v0 saves had no `lastActiveDate`; the completion date is the best guess.
      lastActiveDate: str(streak['lastActiveDate']) ?? lastCompletedDate,
      daysOffUsed: num(streak['daysOffUsed'], 0),
    },
    currency: {
      lumen: num(currency['lumen'], 0),
      // v3 saves predate the run/lifetime split, and never ascended — so the
      // run total and the lifetime total are the same number.
      runLumen: num(currency['runLumen'], lifetimeLumen),
      lifetimeLumen,
      // Cinder arrived in v7; earlier saves simply had none.
      cinder: Math.max(0, num(currency['cinder'], 0)),
    },
    history,
    milestones: {
      nextBigAt: num(milestones['nextBigAt'], base.milestones.nextBigAt),
      nextSmallAt: num(milestones['nextSmallAt'], base.milestones.nextSmallAt),
      smallInterval: num(milestones['smallInterval'], base.milestones.smallInterval),
      bigInterval: num(milestones['bigInterval'], base.milestones.bigInterval),
      totalBigMilestonesHit: num(milestones['totalBigMilestonesHit'], 0),
    },
    ascension: {
      count: Math.max(0, num(ascension['count'], 0)),
      aether: Math.max(0, num(ascension['aether'], 0)),
      // Total ever granted is at least what is unspent plus what perks cost.
      // Anything lower would let a save re-earn Aether it has already spent.
      aetherEarned: Math.max(
        num(ascension['aetherEarned'], 0),
        num(ascension['aether'], 0) +
          perks.reduce((sum, id) => sum + (getPerk(id)?.cost ?? 0), 0),
      ),
      perks,
    },
    achievements: strList(raw['achievements']).filter((id) => getAchievement(id)),
    // Only research that still exists, for the same reason perks are filtered:
    // a renamed node must not leave a save holding an effect nothing applies.
    research: strList(raw['research']).filter((id) => getResearch(id)),
    motes: {
      date: isDateKey(motes['date']) ? motes['date'] : null,
      remaining: Math.max(0, num(motes['remaining'], 0)),
      caught: Math.max(0, num(motes['caught'], 0)),
    },
    // v5 and earlier paid the city's output in a lump at review time and had no
    // vault. Those saves start accruing from *now* rather than from whenever
    // they were last opened: backdating would hand a returning player a month
    // of output they never had a mechanic for.
    vault: {
      accruedThrough: num(vault['accruedThrough'], base.vault.accruedThrough),
      lumen: Math.max(0, num(vault['lumen'], 0)),
      // Absent before v7, and meaningless outside [0, 1) — a bad value would
      // otherwise be a free Lumen on the next accrual.
      carry: Math.min(0.999_999_999, Math.max(0, num(vault['carry'], 0))),
      lastCollectedAt:
        typeof vault['lastCollectedAt'] === 'number' &&
        Number.isFinite(vault['lastCollectedAt'])
          ? vault['lastCollectedAt']
          : null,
      lifetimeCollected: Math.max(0, num(vault['lifetimeCollected'], 0)),
    },
    city: {
      buildings,
      // The charter arrived in v8, and it caps every building's level — so a
      // save from before it must be granted the charter its city had already
      // earned. Anything less would freeze a city that was legal yesterday
      // behind a rule it never had the chance to satisfy.
      charter: Math.max(
        clampCharter(num(city['charter'], CHARTER_MIN_LEVEL)),
        charterEarnedBy(buildings),
      ),
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
