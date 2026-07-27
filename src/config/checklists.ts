/**
 * The review content Aerie *starts* with, as plain data.
 *
 * The items themselves are editable from Settings and live in the save file
 * (`state.checklists`), so this file seeds a fresh save and backs the
 * "Reset to defaults" button. The wrapper copy — names, expedition flavour,
 * blurbs — is not editable and is read from here at runtime.
 */
import type { ChecklistItem, ReviewId } from '@/state/types';

export type { ChecklistItem };

export interface Checklist {
  id: ReviewId;
  /** Literal name used on buttons and in history. */
  name: string;
  /** Sky-city flavour name, used only in the game layer. */
  expedition: string;
  /** One line of context shown at the start of the flow. */
  blurb: string;
  items: ChecklistItem[];
}

/** Everything about a routine except its items — the parts you can't edit. */
export type ChecklistMeta = Omit<Checklist, 'items'>;

export const CHECKLIST_META: Record<ReviewId, ChecklistMeta> = {
  morning: {
    id: 'morning',
    name: 'Morning Review',
    expedition: 'Ascend',
    blurb: 'Set the day up before it sets itself up for you.',
  },
  daily: {
    id: 'daily',
    name: 'Daily Review',
    expedition: 'Descend',
    blurb: 'Close the loops so tomorrow starts clean.',
  },
};

const DEFAULT_ITEMS: Record<ReviewId, ChecklistItem[]> = {
  morning: [
    { id: 'lunch', label: 'Take lunch to fridge', points: 1, core: false },
    { id: 'drink', label: 'Make a drink', points: 1, core: false },
    { id: 'calendar', label: 'Review calendar', points: 1, core: false },
    { id: 'email', label: 'Look at emails', points: 1, core: false },
    { id: 'todoist', label: 'Look at Todoist for any tasks', points: 1, core: false },
    {
      id: 'priorities',
      label: 'Review priorities for the day',
      hint: 'What actually has to move today?',
      points: 2,
      core: true,
    },
    {
      id: 'goals',
      label: 'Look at 2026 goals and mentally rehearse them',
      hint: 'Read them, then picture the year they add up to.',
      points: 3,
      core: true,
    },
  ],
  daily: [
    {
      id: 'hubspot',
      label: 'Look at HubSpot and update deal stages if needed',
      points: 2,
      core: false,
    },
    { id: 'inboxes', label: 'Clear email and Todoist inboxes', points: 2, core: false },
    {
      id: 'journal',
      label: 'Clear bullet journal from today, plan for tomorrow',
      hint: 'Kindle Scribe — today out, tomorrow in.',
      points: 3,
      core: true,
    },
    { id: 'dishes', label: 'Clean dishes, clear mugs from desk', points: 1, core: false },
  ],
};

export const REVIEW_IDS: ReviewId[] = ['morning', 'daily'];

/** A fresh copy of one routine's starting items — never the shared originals. */
export function defaultItems(id: ReviewId): ChecklistItem[] {
  return DEFAULT_ITEMS[id].map((item) => ({ ...item }));
}

/** A fresh copy of both routines' starting items, for a new save. */
export function defaultChecklists(): Record<ReviewId, ChecklistItem[]> {
  return { morning: defaultItems('morning'), daily: defaultItems('daily') };
}

/** Total points available in a review, excluding the full-clear bonus. */
export function maxPoints(checklist: Checklist): number {
  return checklist.items.reduce((sum, item) => sum + item.points, 0);
}
