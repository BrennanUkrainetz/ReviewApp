/**
 * Joins the editable items in the save to the fixed wrapper copy in
 * `config/checklists.ts`, and keeps edited items within the bounds the rest of
 * the app assumes: unique ids, a real label, whole points in range.
 */
import { CHECKLIST_META, type Checklist } from '@/config/checklists';
import type { AerieState, ChecklistItem, ReviewId } from './types';

/** Highest points a single item may be worth. Keeps one line from dwarfing a routine. */
export const MAX_ITEM_POINTS = 10;

/** The routine as the app runs it: fixed copy from config, items from the save. */
export function checklistFor(state: AerieState, id: ReviewId): Checklist {
  return { ...CHECKLIST_META[id], items: state.checklists[id] };
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

/**
 * An id that isn't in `taken`, derived from the label so a save file stays
 * readable. Ids are what history records, so they never change once assigned.
 */
export function nextItemId(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(label) || 'item';
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * Normalises a list of edited items. Drops anything unlabelled, clamps points
 * to a whole number in range, and gives duplicate or missing ids a fresh one.
 */
export function sanitizeItems(items: readonly Partial<ChecklistItem>[]): ChecklistItem[] {
  const taken = new Set<string>();
  const clean: ChecklistItem[] = [];

  for (const item of items) {
    const label = (item.label ?? '').trim();
    if (!label) continue;

    const rawId = (item.id ?? '').trim();
    const id = rawId && !taken.has(rawId) ? rawId : nextItemId(label, taken);
    taken.add(id);

    const points = Number.isFinite(item.points)
      ? Math.min(Math.max(Math.round(item.points as number), 0), MAX_ITEM_POINTS)
      : 1;
    const hint = (item.hint ?? '').trim();

    clean.push({
      id,
      label,
      points,
      core: item.core === true,
      ...(hint ? { hint } : {}),
    });
  }

  return clean;
}
