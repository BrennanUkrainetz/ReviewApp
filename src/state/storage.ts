/**
 * The only module in the app that touches `localStorage`.
 *
 * Everything else reads and writes through `loadState` / `saveState` /
 * `resetState`, so swapping this for a file-backed store later is a one-file
 * change.
 */
import { createInitialState } from './defaults';
import { migrate } from './migrations';
import type { AerieState } from './types';

export const STORAGE_KEY = 'aerie-state';

/** Swappable backend — the browser's `localStorage` in production. */
export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Used when `localStorage` is unavailable (private mode, file:// quirks). */
function createMemoryBackend(): StorageBackend {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function detectBackend(): StorageBackend {
  try {
    const probe = '__aerie_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    console.warn('[aerie] localStorage unavailable — progress will not persist.');
    return createMemoryBackend();
  }
}

let backend: StorageBackend | null = null;

function getBackend(): StorageBackend {
  backend ??= detectBackend();
  return backend;
}

/** Point storage at a different backend. Used by tests. */
export function setStorageBackend(next: StorageBackend | null): void {
  backend = next;
}

/** Reads and normalises the save. Never throws; falls back to a fresh state. */
export function loadState(): AerieState {
  const raw = getBackend().getItem(STORAGE_KEY);
  if (raw === null) return createInitialState();

  try {
    return migrate(JSON.parse(raw));
  } catch (error) {
    console.error('[aerie] Could not parse saved state, starting fresh.', error);
    return createInitialState();
  }
}

export function saveState(state: AerieState): void {
  try {
    getBackend().setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('[aerie] Could not save state.', error);
  }
}

/** Wipes the save and returns a fresh state. */
export function resetState(): AerieState {
  getBackend().removeItem(STORAGE_KEY);
  return createInitialState();
}

/** The raw save, pretty-printed — used by the export button in Settings. */
export function exportState(state: AerieState): string {
  return JSON.stringify(state, null, 2);
}
