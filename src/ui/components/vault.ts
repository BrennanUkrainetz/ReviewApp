/**
 * The vault panel — what the city has produced, and whether you may have it.
 *
 * Deliberately shows the number growing while refusing to hand it over outside
 * a window. That gap is the entire mechanic: there is something to look at and
 * nothing to do, which is what makes it safe to open at 11am and pointless to.
 *
 * Ticks on a timer rather than only on state changes, because the thing it
 * displays changes with the clock and nothing else. The tick writes to the
 * store, so the accrual is genuinely banked rather than merely drawn — closing
 * the tab mid-tick loses at most one interval.
 */
import { WORK_END_MINUTES, WORK_START_MINUTES } from '@/config/tuning';
import { modsFor } from '@/domain/ascension';
import { formatBig } from '@/domain/bignum';
import { today } from '@/domain/dates';
import { findDay } from '@/domain/streak';
import {
  canCollect,
  currentRate,
  describeWindow,
  isOverflowing,
  vaultCapacity,
  vaultFill,
  windowsForState,
} from '@/domain/vault';
import { collectVault, syncVault } from '@/state/actions';
import type { Store } from '@/state/store';
import type { AerieState } from '@/state/types';
import { el } from '../dom';

/**
 * How often the vault re-accrues while the screen is open. A tick that moves
 * the number writes a save, so this is not free — but `accrueVault` no-ops
 * when the gain rounds to nothing, so a small city stays silent regardless.
 */
const TICK_MS = 10_000;

export interface VaultPanelHandle {
  el: HTMLElement;
  destroy(): void;
}

export function createVaultPanel(
  store: Store,
  onCollect: (lumen: number) => void,
): VaultPanelHandle {
  const amount = el('span', { class: 'vault__amount' });
  const rate = el('span', { class: 'vault__rate' });
  const meterFill = el('div', { class: 'vault__meter-fill' });
  const meter = el(
    'div',
    {
      class: 'vault__meter',
      attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' },
    },
    meterFill,
  );
  const status = el('p', { class: 'vault__status' });

  const button = el(
    'button',
    {
      class: 'btn btn--primary vault__collect',
      attrs: { type: 'button' },
      on: {
        click: () => {
          const result = collectVault(store);
          if (!result.ok) return;
          onCollect(result.lumen);
        },
      },
    },
    'Collect',
  );

  const root = el(
    'section',
    { class: 'vault', attrs: { 'aria-label': 'The vault' } },
    el(
      'div',
      { class: 'vault__head' },
      el('span', { class: 'vault__label' }, 'Vault'),
      amount,
    ),
    meter,
    el('div', { class: 'vault__foot' }, status, button),
    rate,
  );

  function render(): void {
    const now = new Date();
    const state = store.getState();
    const { vault } = state;
    const windows = windowsForState(state);
    const capacity = vaultCapacity(state);
    const open = canCollect(vault, now, windows);
    const full = isOverflowing(state);
    const fill = vaultFill(state);

    amount.textContent = formatBig(vault.lumen);
    meterFill.style.width = `${(fill * 100).toFixed(1)}%`;
    meter.setAttribute('aria-valuenow', String(Math.round(fill * 100)));
    meter.setAttribute(
      'aria-label',
      capacity > 0
        ? `Vault ${Math.round(fill * 100)}% full: ${formatBig(vault.lumen)} of ${formatBig(capacity)} Lumen`
        : 'Vault empty — the city produces nothing yet',
    );

    root.classList.toggle('vault--open', open);
    root.classList.toggle('vault--full', full);

    button.hidden = !open;
    (button as HTMLButtonElement).disabled = !open || vault.lumen <= 0;
    button.textContent = `Collect ${formatBig(vault.lumen)}`;

    // An overflowing vault is the one case worth saying twice — output is
    // being thrown away, and the fix is to turn up at the next window.
    status.textContent = full
      ? `Vault is full. ${describeWindow(vault, now, windows)}`
      : describeWindow(vault, now, windows);

    rate.textContent = describeRate(state, now);
  }

  // Bank first, then draw, so the number on screen is one the save agrees with.
  function tick(): void {
    syncVault(store);
    render();
  }

  tick();
  const timer = window.setInterval(tick, TICK_MS);
  const unsubscribe = store.subscribe(render);

  return {
    el: root,
    destroy: () => {
      window.clearInterval(timer);
      unsubscribe();
    },
  };
}

/**
 * The rate line — the number, and the one reason it isn't the other number.
 *
 * Only ever names a single modifier. Both can be true at once, and "trickling
 * at a third of a tripled rate" is a sentence nobody should have to parse; the
 * missing review is the one worth acting on, so it wins.
 */
function describeRate(state: AerieState, now: Date): string {
  const perHour = currentRate(state, now);
  if (perHour <= 0) return 'Nothing built yet — the vault fills once the city does.';

  const per = `Filling at ${formatBig(Math.round(perHour))} an hour`;
  if (!loggedToday(state, now)) return `${per} — a trickle, until today's review.`;
  if (inWorkHours(now)) {
    const workRate = modsFor(state).research.workRate;
    return `${per} — ×${workRate} while you're at work.`;
  }
  return `${per}.`;
}

const loggedToday = (state: AerieState, now: Date): boolean => {
  const day = findDay(state.history, today(now));
  return Boolean(day?.morning?.completed || day?.daily?.completed);
};

const inWorkHours = (now: Date): boolean => {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= WORK_START_MINUTES && minutes < WORK_END_MINUTES;
};

/** Toast copy for a collection. */
export function vaultCollectedMessage(lumen: number): string {
  return `Vault collected. +${formatBig(lumen)} Lumen.`;
}
