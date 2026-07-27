import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from './migrations';
import {
  loadState,
  resetState,
  saveState,
  setStorageBackend,
  STORAGE_KEY,
} from './storage';
import { createInitialState, STATE_VERSION } from './defaults';
import type { AerieState } from './types';

let map: Map<string, string>;

beforeEach(() => {
  map = new Map();
  setStorageBackend({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  });
});

/**
 * A fresh state is stamped with the current clock (the vault's accrual start),
 * so two built a millisecond apart are not equal. Compare against one built at
 * the instant the state under test was.
 */
function expectFresh(state: AerieState): void {
  expect(state).toEqual(createInitialState(new Date(state.vault.accruedThrough)));
}

describe('storage', () => {
  it('returns a fresh state when nothing is saved', () => {
    expectFresh(loadState());
  });

  it('starts a fresh save accruing from now, not from the epoch', () => {
    const before = Date.now();
    const loaded = loadState();
    expect(loaded.vault.accruedThrough).toBeGreaterThanOrEqual(before);
    expect(loaded.vault.lumen).toBe(0);
  });

  it('round-trips a save', () => {
    const state = {
      ...createInitialState(),
      currency: { lumen: 1240, runLumen: 1240, lifetimeLumen: 1240 , cinder: 0},
    };
    saveState(state);
    expect(map.has(STORAGE_KEY)).toBe(true);
    expect(loadState().currency.lumen).toBe(1240);
  });

  it('falls back to a fresh state on corrupt JSON instead of throwing', () => {
    map.set(STORAGE_KEY, '{ not json');
    expectFresh(loadState());
  });

  it('clears the save on reset', () => {
    saveState({
      ...createInitialState(),
      currency: { lumen: 99, runLumen: 99, lifetimeLumen: 99 , cinder: 0},
    });
    expectFresh(resetState());
    expect(map.has(STORAGE_KEY)).toBe(false);
  });
});

describe('migrate', () => {
  it('fills in everything missing from a partial save', () => {
    const migrated = migrate({
      currency: { lumen: 40, runLumen: 40, lifetimeLumen: 40 , cinder: 0},
    });
    expect(migrated.version).toBe(STATE_VERSION);
    expect(migrated.currency.lumen).toBe(40);
    expect(migrated.streak).toEqual(createInitialState().streak);
    expect(migrated.history).toEqual([]);
  });

  it('rejects junk types without losing the rest of the save', () => {
    const migrated = migrate({
      currency: { lumen: 'lots' },
      streak: { current: null, longest: 4 },
      history: 'nope',
      city: { buildings: [{ id: 'greenhouse', level: 2 }, { level: 3 }, 'junk'] },
    });
    expect(migrated.currency.lumen).toBe(0);
    expect(migrated.streak.current).toBe(0);
    expect(migrated.streak.longest).toBe(4);
    expect(migrated.history).toEqual([]);
    expect(migrated.city.buildings).toEqual([{ id: 'greenhouse', level: 2 }]);
  });

  it('back-fills lastActiveDate from a pre-day-off save', () => {
    const migrated = migrate({ streak: { current: 3, lastCompletedDate: '2026-07-20' } });
    expect(migrated.streak.lastActiveDate).toBe('2026-07-20');
  });

  it('sorts history and drops entries with no date', () => {
    const migrated = migrate({
      history: [
        { date: '2026-07-20', dayOff: true },
        { dayOff: false },
        {
          date: '2026-07-18',
          morning: { completed: true, tier: 'full', pointsEarned: 12 },
        },
      ],
    });
    expect(migrated.history.map((day) => day.date)).toEqual(['2026-07-18', '2026-07-20']);
    expect(migrated.history[0]?.morning?.lumenEarned).toBe(0);
    expect(migrated.history[1]?.dayOff).toBe(true);
  });

  it('gives a save written before editable checklists the shipped defaults', () => {
    const migrated = migrate({
      version: 1,
      currency: { lumen: 40, runLumen: 40, lifetimeLumen: 40 , cinder: 0},
    });
    expect(migrated.checklists).toEqual(createInitialState().checklists);
  });

  it('keeps edited checklists, repairing anything unusable', () => {
    const migrated = migrate({
      checklists: {
        morning: [
          { id: 'stretch', label: '  Stretch  ', points: '3', core: true },
          { id: 'stretch', label: 'Second with a taken id', points: 99, core: false },
          { label: '   ', points: 2, core: true },
          'junk',
        ],
      },
    });

    expect(migrated.checklists.morning).toEqual([
      { id: 'stretch', label: 'Stretch', points: 1, core: true },
      {
        id: 'second-with-a-taken-id',
        label: 'Second with a taken id',
        points: 10,
        core: false,
      },
    ]);
    // Untouched routines keep their defaults.
    expect(migrated.checklists.daily).toEqual(createInitialState().checklists.daily);
  });

  it('falls back to defaults rather than leaving a routine with no items', () => {
    const defaults = createInitialState().checklists;
    expect(migrate({ checklists: { morning: [] } }).checklists.morning).toEqual(
      defaults.morning,
    );
    expect(migrate({ checklists: { daily: 'nope' } }).checklists.daily).toEqual(
      defaults.daily,
    );
  });

  it('survives being handed something that is not an object', () => {
    expectFresh(migrate(null));
    expectFresh(migrate('hello'));
    expectFresh(migrate([1, 2, 3]));
  });

  it('starts a pre-vault save accruing from now, not from whenever it was written', () => {
    const before = Date.now();
    const migrated = migrate({ version: 5, currency: { lumen: 40 } });
    expect(migrated.vault.accruedThrough).toBeGreaterThanOrEqual(before);
    expect(migrated.vault.lumen).toBe(0);
    expect(migrated.vault.lastCollectedAt).toBeNull();
  });
});
