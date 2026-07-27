/**
 * Settings: the review checklists, motion, sound, and the two data escape
 * hatches.
 *
 * Deliberately short otherwise. Anything that belongs in a config file lives
 * in `src/config/`, not behind a toggle here.
 */
import { REVIEW_IDS } from '@/config/checklists';
import { STORAGE_KEY, exportState, resetState } from '@/state/storage';
import { updateSettings } from '@/state/actions';
import { createChecklistEditor } from '../components/checklist-editor';
import { confirmDialog } from '../components/confirm';
import type { AppContext, Screen } from '../context';
import { el } from '../dom';
import { iconBack } from '../icons';
import { systemPrefersReducedMotion } from '../motion';

export function createSettingsScreen(ctx: AppContext): Screen {
  const state = () => ctx.store.getState();

  function toggleRow(
    id: string,
    label: string,
    description: string,
    checked: boolean,
    onChange: (next: boolean) => void,
  ): HTMLElement {
    const input = el('input', {
      class: 'switch__input',
      attrs: { type: 'checkbox', id, checked },
      on: { change: (event) => onChange((event.target as HTMLInputElement).checked) },
    });

    return el(
      'div',
      { class: 'setting' },
      el(
        'label',
        { class: 'setting__text', attrs: { for: id } },
        el('span', { class: 'setting__label' }, label),
        el('span', { class: 'setting__description' }, description),
      ),
      el('span', { class: 'switch' }, input, el('span', { class: 'switch__track' })),
    );
  }

  async function onReset(): Promise<void> {
    const confirmed = await confirmDialog({
      title: 'Reset everything?',
      body: 'This wipes your streak, Lumen, city, and full history from this browser. It cannot be undone.',
      confirmLabel: 'Erase everything',
      cancelLabel: 'Keep my save',
      danger: true,
    });
    if (!confirmed) return;
    ctx.store.replace(resetState());
    ctx.navigate({ name: 'city' });
    ctx.toast('Save erased. Starting over from day one.');
  }

  function onExport(): void {
    const blob = new Blob([exportState(state())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', {
      attrs: {
        href: url,
        download: `aerie-save-${new Date().toISOString().slice(0, 10)}.json`,
      },
    });
    link.click();
    URL.revokeObjectURL(url);
    ctx.toast('Save exported.');
  }

  const root = el(
    'section',
    { class: 'settings' },
    el(
      'header',
      { class: 'shop__header' },
      el(
        'button',
        {
          class: 'btn btn--ghost',
          attrs: { type: 'button' },
          on: { click: () => ctx.navigate({ name: 'city' }) },
        },
        el('span', { class: 'review__exit-icon', html: iconBack() }),
        'City',
      ),
      el('h2', { class: 'shop__title' }, 'Settings'),
      el('span', {}),
    ),
    el(
      'div',
      { class: 'settings__checklists' },
      el('p', { class: 'section-label' }, 'Review checklists'),
      el(
        'p',
        { class: 'settings__intro' },
        'Edit the items you work through each day. Core items are the Floor — doing all of them keeps the streak alive on a bad day. Changes save as you make them and apply to your next review.',
      ),
      ...REVIEW_IDS.map((reviewId) => createChecklistEditor(ctx, reviewId)),
    ),
    el(
      'div',
      { class: 'panel' },
      el('h3', { class: 'panel__title' }, 'Presentation'),
      el(
        'div',
        { class: 'settings__group' },
        toggleRow(
          'reduce-motion',
          'Reduce motion',
          systemPrefersReducedMotion()
            ? 'Your system already asks for reduced motion, which Aerie follows.'
            : 'Stops the drifting clouds, the chest animation, and the lighting fade.',
          state().settings.reduceMotion,
          (next) => {
            updateSettings(ctx.store, { reduceMotion: next });
            ctx.toast(next ? 'Motion reduced.' : 'Motion restored.');
          },
        ),
        toggleRow(
          'mute',
          'Mute sounds',
          'Aerie is silent today. This keeps it that way if sound is ever added.',
          state().settings.muted,
          (next) => updateSettings(ctx.store, { muted: next }),
        ),
      ),
    ),
    el(
      'div',
      { class: 'panel' },
      el('h3', { class: 'panel__title' }, 'Your data'),
      el(
        'p',
        { class: 'panel__note' },
        `Everything lives in this browser under the "${STORAGE_KEY}" key. Nothing is sent anywhere.`,
      ),
      el(
        'div',
        { class: 'settings__actions' },
        el(
          'button',
          {
            class: 'btn btn--secondary',
            attrs: { type: 'button' },
            on: { click: onExport },
          },
          'Export save file',
        ),
        el(
          'button',
          {
            class: 'btn btn--danger',
            attrs: { type: 'button' },
            on: { click: () => void onReset() },
          },
          'Reset everything',
        ),
      ),
    ),
  );

  return { el: root };
}
