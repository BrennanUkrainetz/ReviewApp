import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from './migrations';
import { loadState, resetState, saveState, setStorageBackend, STORAGE_KEY } from './storage';
import { createInitialState, STATE_VERSION } from './defaults';

let map: Map<string, string>;

beforeEach(() => {
  map = new Map();
  setStorageBackend({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  });
});

describe('storage', () => {
  it('returns a fresh state when nothing is saved', () => {
    expect(loadState()).toEqual(createInitialState());
  });

  it('round-trips a save', () => {
    const state = { ...createInitialState(), currency: { lumen: 1240 } };
    saveState(state);
    expect(map.has(STORAGE_KEY)).toBe(true);
    expect(loadState().currency.lumen).toBe(1240);
  });

  it('falls back to a fresh state on corrupt JSON instead of throwing', () => {
    map.set(STORAGE_KEY, '{ not json');
    expect(loadState()).toEqual(createInitialState());
  });

  it('clears the save on reset', () => {
    saveState({ ...createInitialState(), currency: { lumen: 99 } });
    expect(resetState()).toEqual(createInitialState());
    expect(map.has(STORAGE_KEY)).toBe(false);
  });
});

describe('migrate', () => {
  it('fills in everything missing from a partial save', () => {
    const migrated = migrate({ currency: { lumen: 40 } });
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
        { date: '2026-07-18', morning: { completed: true, tier: 'full', pointsEarned: 12 } },
      ],
    });
    expect(migrated.history.map((day) => day.date)).toEqual(['2026-07-18', '2026-07-20']);
    expect(migrated.history[0]?.morning?.lumenEarned).toBe(0);
    expect(migrated.history[1]?.dayOff).toBe(true);
  });

  it('survives being handed something that is not an object', () => {
    expect(migrate(null)).toEqual(createInitialState());
    expect(migrate('hello')).toEqual(createInitialState());
    expect(migrate([1, 2, 3])).toEqual(createInitialState());
  });
});
