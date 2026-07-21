/** Transient, non-blocking messages. Purely informational — never a prompt. */
import { el } from '../dom';

const VISIBLE_MS = 2600;

export interface ToastRail {
  el: HTMLElement;
  show(message: string): void;
}

export function createToastRail(): ToastRail {
  const rail = el('div', {
    class: 'toast-rail',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });

  return {
    el: rail,
    show(message) {
      const toast = el('div', { class: 'toast' }, message);
      rail.appendChild(toast);
      window.setTimeout(() => {
        toast.classList.add('toast--leaving');
        window.setTimeout(() => toast.remove(), 300);
      }, VISIBLE_MS);
    },
  };
}
