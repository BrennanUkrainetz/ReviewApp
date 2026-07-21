/**
 * The review content, as plain data. Edit the items here — labels, points,
 * ordering, or which items are `core` — without touching app logic.
 *
 * `core: true` marks an item as part of the Floor: doing all core items is
 * enough to keep the streak alive on a bad day.
 */
import type { ReviewId } from '@/state/types';

export interface ChecklistItem {
  id: string;
  label: string;
  /** Optional one-line nudge shown under the label during the flow. */
  hint?: string;
  points: number;
  core: boolean;
}

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

export const CHECKLISTS: Record<ReviewId, Checklist> = {
  morning: {
    id: 'morning',
    name: 'Morning Review',
    expedition: 'Ascend',
    blurb: 'Set the day up before it sets itself up for you.',
    items: [
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
  },
  daily: {
    id: 'daily',
    name: 'Daily Review',
    expedition: 'Descend',
    blurb: 'Close the loops so tomorrow starts clean.',
    items: [
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
  },
};

export const REVIEW_IDS: ReviewId[] = ['morning', 'daily'];

export function getChecklist(id: ReviewId): Checklist {
  return CHECKLISTS[id];
}

/** Total points available in a review, excluding the full-clear bonus. */
export function maxPoints(checklist: Checklist): number {
  return checklist.items.reduce((sum, item) => sum + item.points, 0);
}
