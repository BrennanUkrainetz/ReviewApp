/**
 * A promise-based confirmation dialog on top of `<dialog>`, so Escape,
 * focus trapping, and the backdrop come from the platform.
 *
 * Used only where an action is deliberate by design (taking a day off) or
 * destructive (resetting the save).
 */
import { el } from '../dom';

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function confirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
}: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;

    const cancelButton = el(
      'button',
      { class: 'btn btn--ghost', attrs: { type: 'button' }, on: { click: () => dialog.close() } },
      cancelLabel,
    );

    const confirmButton = el(
      'button',
      {
        class: danger ? 'btn btn--danger' : 'btn btn--primary',
        attrs: { type: 'button' },
        on: {
          click: () => {
            answer = true;
            dialog.close();
          },
        },
      },
      confirmLabel,
    );

    const dialog = el(
      'dialog',
      { class: 'dialog' },
      el('h2', { class: 'dialog__title' }, title),
      el('p', { class: 'dialog__body' }, body),
      el('div', { class: 'dialog__actions' }, cancelButton, confirmButton),
    ) as HTMLDialogElement;

    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(answer);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    confirmButton.focus();
  });
}
