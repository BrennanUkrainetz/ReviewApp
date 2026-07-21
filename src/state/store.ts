/**
 * A minimal observable store. Every mutation goes through `update`, which
 * persists and then notifies subscribers — so the UI never has to remember to
 * save, and nothing can hold a stale copy of state.
 */
import { today } from '@/domain/dates';
import { reconcileStreak } from '@/domain/streak';
import { loadState, saveState } from './storage';
import type { AerieState } from './types';

export type Listener = (state: AerieState) => void;
export type Mutator = (state: AerieState) => AerieState;

export interface Store {
  getState(): AerieState;
  /** Applies `mutator`, persists the result, and notifies subscribers. */
  update(mutator: Mutator): AerieState;
  /** Replaces state wholesale — used by reset and import. */
  replace(next: AerieState): AerieState;
  subscribe(listener: Listener): () => void;
}

export function createStore(initial: AerieState): Store {
  let state = initial;
  const listeners = new Set<Listener>();

  const commit = (next: AerieState): AerieState => {
    if (next === state) return state;
    state = next;
    saveState(state);
    for (const listener of [...listeners]) listener(state);
    return state;
  };

  return {
    getState: () => state,
    update: (mutator) => commit(mutator(state)),
    replace: (next) => commit(next),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/**
 * Loads the save and applies any day-boundary rules (a missed day breaking the
 * streak) before the first render.
 */
export function createStoreFromStorage(now: Date = new Date()): Store {
  const loaded = loadState();
  const reconciled = reconcileStreak(loaded, today(now));
  const store = createStore(loaded);
  if (reconciled !== loaded) store.replace(reconciled);
  return store;
}
