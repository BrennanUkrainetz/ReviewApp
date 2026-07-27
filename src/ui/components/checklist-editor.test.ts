/**
 * The editor writes straight to the save on every change, so these cover the
 * paths where a bug would quietly damage a checklist: renaming, reordering,
 * removing, and the guard that stops the last item being deleted.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultItems } from '@/config/checklists';
import { createInitialState } from '@/state/defaults';
import { setStorageBackend } from '@/state/storage';
import { createStore, type Store } from '@/state/store';
import type { AppContext } from '../context';
import { createChecklistEditor } from './checklist-editor';

function setup(): { ctx: AppContext; store: Store; toasts: string[] } {
  const store = createStore(createInitialState());
  const toasts: string[] = [];
  const ctx: AppContext = {
    store,
    navigate: () => {},
    presentReward: () => {},
    toast: (message) => void toasts.push(message),
  };

  document.body.appendChild(createChecklistEditor(ctx, 'morning'));
  return { ctx, store, toasts };
}

const rows = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('.checklist-editor__item'),
];

const labels = (): string[] =>
  rows().map((row) => row.querySelector<HTMLInputElement>('.js-label')?.value ?? '');

/** Types into a field and fires the `change` the editor commits on. */
function type(input: HTMLInputElement | null | undefined, value: string): void {
  if (!input) throw new Error('no such field');
  input.value = value;
  input.dispatchEvent(new Event('change'));
}

const click = (selector: string, index = 0): void =>
  rows()[index]?.querySelector<HTMLButtonElement>(selector)?.click();

const morningLabels = (store: Store): string[] =>
  store.getState().checklists.morning.map((item) => item.label);

beforeEach(() => {
  document.body.innerHTML = '';
  const map = new Map<string, string>();
  setStorageBackend({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  });
});

describe('checklist editor', () => {
  it('renders the saved checklist', () => {
    const { store } = setup();
    expect(labels()).toEqual(morningLabels(store));
  });

  it('saves a renamed item without disturbing the others', () => {
    const { store } = setup();
    type(rows()[1]?.querySelector<HTMLInputElement>('.js-label'), '  Make tea  ');

    const saved = store.getState().checklists.morning;
    expect(saved[1]?.label).toBe('Make tea');
    // The id is what history records, so it survives the rename.
    expect(saved[1]?.id).toBe(defaultItems('morning')[1]?.id);
    expect(saved).toHaveLength(defaultItems('morning').length);
  });

  it('puts the old label back rather than saving a blank one', () => {
    const { store, toasts } = setup();
    const first = rows()[0]?.querySelector<HTMLInputElement>('.js-label');
    type(first, '   ');

    expect(first?.value).toBe(defaultItems('morning')[0]?.label);
    expect(morningLabels(store)).toEqual(
      defaultItems('morning').map((item) => item.label),
    );
    expect(toasts).toContain('An item needs a label.');
  });

  it('clamps points to the allowed range', () => {
    const { store } = setup();
    type(rows()[0]?.querySelector<HTMLInputElement>('.field--points'), '99');
    expect(store.getState().checklists.morning[0]?.points).toBe(10);
  });

  it('toggles an item into the floor', () => {
    const { store } = setup();
    const core = rows()[0]?.querySelector<HTMLInputElement>(
      '.checklist-editor__core-input',
    );
    if (!core) throw new Error('no core toggle');
    core.checked = true;
    core.dispatchEvent(new Event('change'));

    expect(store.getState().checklists.morning[0]?.core).toBe(true);
  });

  it('reorders items and keeps the rendered list in step', () => {
    const { store } = setup();
    const [first, second] = morningLabels(store);

    click('.js-move-down');
    expect(morningLabels(store).slice(0, 2)).toEqual([second, first]);
    expect(labels().slice(0, 2)).toEqual([second, first]);
  });

  it('removes an item', () => {
    const { store } = setup();
    const removed = morningLabels(store)[0];

    click('.js-remove');
    expect(morningLabels(store)).not.toContain(removed);
    expect(rows()).toHaveLength(defaultItems('morning').length - 1);
  });

  it('will not remove the last item', () => {
    const { store, toasts } = setup();
    for (let i = defaultItems('morning').length; i > 0; i -= 1) click('.js-remove');

    expect(store.getState().checklists.morning).toHaveLength(1);
    expect(rows()).toHaveLength(1);
    expect(toasts).toContain('A review needs at least one item.');
  });

  it('only saves a new item once it has a label', () => {
    const { store } = setup();
    const before = morningLabels(store);

    document.querySelector<HTMLButtonElement>('.checklist-editor__add')?.click();
    expect(rows()).toHaveLength(before.length + 1);
    expect(morningLabels(store)).toEqual(before);

    type(rows().at(-1)?.querySelector<HTMLInputElement>('.js-label'), 'Water the plants');
    expect(morningLabels(store)).toEqual([...before, 'Water the plants']);
  });
});
