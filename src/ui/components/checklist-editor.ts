/**
 * The checklist editor used by Settings — one instance per routine.
 *
 * It edits a local draft and writes the whole list through `saveChecklist`
 * after every committed change, so there is no Save button to forget and no
 * half-saved state. Text fields commit on `change` (blur or Enter) rather than
 * on every keystroke: the store persists on write, and saving mid-word would
 * churn `localStorage` for no benefit.
 */
import { CHECKLIST_META, defaultItems } from '@/config/checklists';
import { resetChecklist, saveChecklist } from '@/state/actions';
import { MAX_ITEM_POINTS, nextItemId } from '@/state/checklists';
import type { ChecklistItem, ReviewId } from '@/state/types';
import type { AppContext } from '../context';
import { el, plural, replaceChildren } from '../dom';
import { iconArrowDown, iconArrowUp, iconPlus, iconTrash } from '../icons';
import { confirmDialog } from './confirm';

/** Where focus should land after a structural change re-renders the list. */
type FocusTarget = { index: number; selector: string } | null;

export function createChecklistEditor(ctx: AppContext, reviewId: ReviewId): HTMLElement {
  const meta = CHECKLIST_META[reviewId];
  const fromStore = (): ChecklistItem[] =>
    ctx.store.getState().checklists[reviewId].map((item) => ({ ...item }));

  let draft: ChecklistItem[] = fromStore();

  const summary = el('p', { class: 'panel__note checklist-editor__summary' });
  const list = el('ol', { class: 'checklist-editor__list' });

  const addButton = el(
    'button',
    {
      class: 'btn btn--secondary checklist-editor__add',
      attrs: { type: 'button' },
      on: { click: onAdd },
    },
    el('span', { class: 'review-card__icon', html: iconPlus() }),
    'Add item',
  );

  const resetButton = el(
    'button',
    {
      class: 'btn btn--ghost',
      attrs: { type: 'button' },
      on: { click: () => void onReset() },
    },
    'Reset to defaults',
  );

  const root = el(
    'section',
    { class: 'panel checklist-editor', dataset: { review: reviewId } },
    el(
      'header',
      { class: 'panel__head' },
      el('h3', { class: 'panel__title' }, meta.name),
      el('span', { class: 'section-label' }, meta.expedition),
    ),
    summary,
    list,
    el('div', { class: 'checklist-editor__actions' }, addButton, resetButton),
  );

  /**
   * Persists `next` and adopts it as the draft. Returns false — and says why —
   * if it wasn't accepted, leaving the draft untouched.
   *
   * A freshly added row has no label yet; it stays in the draft so it can be
   * typed into, but it isn't saved until it has one.
   */
  function commit(next: ChecklistItem[]): boolean {
    const result = saveChecklist(
      ctx.store,
      reviewId,
      next.filter((item) => item.label.trim() !== ''),
    );
    if (!result.ok) {
      ctx.toast(result.reason);
      return false;
    }
    draft = next;
    return true;
  }

  function renderSummary(): void {
    // Counts what is actually saved, so a half-typed new row doesn't inflate it.
    const saved = draft.filter((item) => item.label.trim() !== '');
    const points = saved.reduce((sum, item) => sum + item.points, 0);
    const core = saved.filter((item) => item.core).length;
    const optional = saved.filter((item) => item.optional).length;
    summary.textContent =
      `${plural(saved.length, 'item')} · ${points} points · ${plural(
        core,
        'core item',
      )} to hold the streak` +
      (optional > 0 ? ` · ${plural(optional, 'optional item')}.` : '.');
  }

  function moveFocus(target: FocusTarget): void {
    if (!target) return;
    const row = list.children[Math.min(target.index, list.children.length - 1)];
    row?.querySelector<HTMLElement>(target.selector)?.focus();
  }

  function rerender(focus: FocusTarget = null): void {
    replaceChildren(list, ...draft.map(itemRow));
    renderSummary();
    moveFocus(focus);
  }

  /**
   * A field edit. The row's own DOM already shows the new value, so only the
   * summary is refreshed — re-rendering here would pull focus out of the field
   * the person is still tabbing through.
   */
  function edit(index: number, patch: Partial<ChecklistItem>): void {
    const item = draft[index];
    if (!item) return;
    const next = [...draft];
    next[index] = { ...item, ...patch };
    if (commit(next)) renderSummary();
  }

  /**
   * Core and optional are opposites — one says the Floor needs this every day,
   * the other says some days it isn't there to do. Turning either on turns the
   * other off, and the row is redrawn so both boxes tell the truth.
   */
  function setFlag(index: number, flag: 'core' | 'optional', on: boolean): void {
    const item = draft[index];
    if (!item) return;
    const next = [...draft];
    next[index] = { ...item, core: false, optional: false, [flag]: on };
    if (commit(next)) rerender({ index, selector: `.js-${flag}` });
  }

  function move(index: number, delta: number): void {
    const target = index + delta;
    const item = draft[index];
    const other = draft[target];
    if (!item || !other) return;

    const next = [...draft];
    next[index] = other;
    next[target] = item;
    if (commit(next)) {
      rerender({ index: target, selector: delta < 0 ? '.js-move-up' : '.js-move-down' });
    }
  }

  function remove(index: number): void {
    const next = draft.filter((_, position) => position !== index);
    if (commit(next)) rerender({ index: Math.max(0, index - 1), selector: '.js-remove' });
  }

  function onAdd(): void {
    const id = nextItemId(
      'item',
      draft.map((item) => item.id),
    );
    draft = [...draft, { id, label: '', points: 1, core: false }];
    rerender({ index: draft.length - 1, selector: '.js-label' });
  }

  async function onReset(): Promise<void> {
    const confirmed = await confirmDialog({
      title: `Reset the ${meta.name}?`,
      body: `This puts the ${defaultItems(reviewId).length} original items back and discards your edits to this routine. History and streak are untouched.`,
      confirmLabel: 'Reset checklist',
      cancelLabel: 'Keep my edits',
      danger: true,
    });
    if (!confirmed) return;

    resetChecklist(ctx.store, reviewId);
    draft = fromStore();
    rerender();
    ctx.toast(`${meta.name} reset to defaults.`);
  }

  function textField(
    className: string,
    value: string,
    placeholder: string,
    label: string,
    onCommit: (next: string, input: HTMLInputElement) => void,
  ): HTMLElement {
    const input = el('input', {
      class: ['field', className],
      attrs: { type: 'text', value, placeholder, 'aria-label': label },
      on: {
        change: (event) => {
          const target = event.target as HTMLInputElement;
          onCommit(target.value.trim(), target);
        },
        // Enter commits without waiting for a blur.
        keydown: (event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
        },
      },
    });
    return input;
  }

  function iconButton(
    className: string,
    label: string,
    glyph: string,
    onClick: () => void,
    disabled = false,
  ): HTMLElement {
    return el(
      'button',
      {
        class: ['icon-btn', className],
        attrs: { type: 'button', 'aria-label': label, title: label, disabled },
        on: { click: onClick },
      },
      el('span', { class: 'icon-btn__glyph', html: glyph }),
    );
  }

  function itemRow(item: ChecklistItem, index: number): HTMLElement {
    const labelInput = textField(
      'js-label',
      item.label,
      'What to do',
      'Item',
      (next, input) => {
        if (!next) {
          // An item with no label can't be scored or shown; put the old one back.
          input.value = item.label;
          if (item.label) ctx.toast('An item needs a label.');
          return;
        }
        edit(index, { label: next });
      },
    );

    const hintInput = textField(
      'field--hint js-hint',
      item.hint ?? '',
      'Optional hint',
      'Hint',
      (next) => edit(index, { hint: next }),
    );

    const pointsInput = el('input', {
      class: 'field field--points num',
      attrs: {
        type: 'number',
        min: 0,
        max: MAX_ITEM_POINTS,
        step: 1,
        value: item.points,
        'aria-label': 'Points',
      },
      on: {
        change: (event) => {
          const input = event.target as HTMLInputElement;
          const parsed = Number.parseInt(input.value, 10);
          const points = Number.isFinite(parsed)
            ? Math.min(Math.max(parsed, 0), MAX_ITEM_POINTS)
            : item.points;
          input.value = String(points);
          edit(index, { points });
        },
      },
    });

    const flagToggle = (
      flag: 'core' | 'optional',
      label: string,
      title: string,
    ): HTMLElement => {
      const id = `${flag}-${reviewId}-${item.id}`;
      const input = el('input', {
        class: ['checklist-editor__toggle-input', `js-${flag}`],
        attrs: { type: 'checkbox', id, checked: item[flag] === true },
        on: {
          change: (event) =>
            setFlag(index, flag, (event.target as HTMLInputElement).checked),
        },
      });
      return el(
        'label',
        {
          class: ['checklist-editor__toggle', `checklist-editor__toggle--${flag}`],
          attrs: { for: id, title },
        },
        input,
        el('span', { class: 'checklist-editor__control-label' }, label),
      );
    };

    return el(
      'li',
      { class: 'checklist-editor__item', dataset: { itemId: item.id } },
      el('div', { class: 'checklist-editor__fields' }, labelInput, hintInput),
      el(
        'div',
        { class: 'checklist-editor__controls' },
        el(
          'label',
          { class: 'checklist-editor__points-field' },
          el('span', { class: 'checklist-editor__control-label' }, 'Points'),
          pointsInput,
        ),
        flagToggle(
          'core',
          'Core',
          'Part of the Floor — doing every core item holds the streak.',
        ),
        flagToggle(
          'optional',
          'Optional',
          "Doesn't apply every day. Skipping it costs no points and still allows a full clear.",
        ),
        el(
          'div',
          { class: 'checklist-editor__row-actions' },
          iconButton(
            'js-move-up',
            'Move up',
            iconArrowUp(),
            () => move(index, -1),
            index === 0,
          ),
          iconButton(
            'js-move-down',
            'Move down',
            iconArrowDown(),
            () => move(index, 1),
            index === draft.length - 1,
          ),
          iconButton('js-remove icon-btn--danger', 'Remove item', iconTrash(), () =>
            remove(index),
          ),
        ),
      ),
    );
  }

  rerender();
  return root;
}
