/**
 * The vault — continuous city output, collected twice a day.
 *
 * The city produces around the clock and drops it into a vault. The vault can
 * only be emptied inside a collection window (see `COLLECTION_WINDOWS`), and it
 * fills three times as fast during work hours. Both of those exist for the same
 * reason: Aerie is not allowed to be a thing you check at 11am. Outside a
 * window the number is visible and inert, which is the whole design — you can
 * see it growing and there is nothing to do about it.
 *
 * Everything here is a pure function of `(state, now)`. Nothing is scheduled,
 * nothing ticks in the background: accrual is worked out from the elapsed time
 * since it was last folded in, so a closed tab, a sleeping laptop and a
 * fortnight away all come out the same.
 */
import {
  VAULT_CAP_DAYS,
  VAULT_MAX_ACCRUAL_DAYS,
  VAULT_WORK_MULTIPLIER,
  WORK_END_MINUTES,
  WORK_START_MINUTES,
  type CollectionWindow,
} from '@/config/tuning';
import type { AerieState, DayRecord, VaultState } from '@/state/types';
import { modsFor } from './ascension';
import { addDays, fromDateKey, toDateKey, type DateKey } from './dates';
import { cityOutput } from './economy';
import { NO_RESEARCH, windowsFor } from './research';

/** The collection windows a save actually has, research applied. */
export function windowsForState(state: AerieState): CollectionWindow[] {
  return windowsFor(modsFor(state).research);
}

const MS_PER_DAY = 86_400_000;

/**
 * Nominal seconds in one ordinary reviewed day: the off-hours at face value,
 * the work band counted `VAULT_WORK_MULTIPLIER` times over.
 *
 * The city's quoted output is spread over *this* rather than over 86,400
 * seconds, so a reviewed day fills the vault by exactly one day's output. It
 * used to be divided by the wall-clock day and then sped up threefold for work
 * hours on top, which quietly paid 1.7 days of output per day — and since
 * every building's payback is quoted in days of output, the whole ladder ran
 * seventy percent faster than it was priced for. Research that raises the
 * work rate (Shift Bonus) still pays extra, because it is measured against
 * this baseline rather than folded into it.
 */
export const NOMINAL_SECONDS_PER_DAY =
  (24 * 60 - (WORK_END_MINUTES - WORK_START_MINUTES)) * 60 +
  (WORK_END_MINUTES - WORK_START_MINUTES) * 60 * VAULT_WORK_MULTIPLIER;

/* ------------------------------------------------------------------ */
/* Windows                                                             */
/* ------------------------------------------------------------------ */

const minutesOfDay = (at: Date): number =>
  at.getHours() * 60 + at.getMinutes() + at.getSeconds() / 60;

/** Absolute ms for a local minutes-of-day on the calendar day `at` falls in. */
function atMinutes(at: Date, minutes: number): number {
  const midnight = fromDateKey(toDateKey(at)).getTime();
  return midnight + minutes * 60_000;
}

/**
 * The window set to reason about. The standard set by default; state-aware
 * callers pass `windowsForState(state)` so a window bought from the research
 * tree is honoured. Defaulting keeps the pure window helpers testable without a
 * whole save to hand.
 */
const STANDARD_WINDOWS: CollectionWindow[] = windowsFor(NO_RESEARCH);

/** The collection window `now` sits inside, or `null` when the vault is shut. */
export function openWindow(
  now: Date,
  windows: CollectionWindow[] = STANDARD_WINDOWS,
): CollectionWindow | null {
  const minutes = minutesOfDay(now);
  return (
    windows.find(
      (window) => minutes >= window.startMinutes && minutes < window.endMinutes,
    ) ?? null
  );
}

/** The next window to open, and when — tomorrow's first if today's are done. */
export function nextWindow(
  now: Date,
  windows: CollectionWindow[] = STANDARD_WINDOWS,
): { window: CollectionWindow; opensAt: Date } {
  const minutes = minutesOfDay(now);
  const ordered = [...windows].sort((a, b) => a.startMinutes - b.startMinutes);
  const later = ordered.find((window) => window.startMinutes > minutes);
  if (later)
    return { window: later, opensAt: new Date(atMinutes(now, later.startMinutes)) };

  const first = ordered[0]!;
  const tomorrow = fromDateKey(addDays(toDateKey(now), 1));
  return {
    window: first,
    opensAt: new Date(tomorrow.getTime() + first.startMinutes * 60_000),
  };
}

/**
 * True when the vault is open *and* this particular window hasn't already been
 * emptied. Tracked with a single timestamp rather than a per-window ledger: a
 * collection that landed inside the window now open is, by definition, this
 * window's collection.
 */
export function canCollect(
  vault: VaultState,
  now: Date,
  windows: CollectionWindow[] = STANDARD_WINDOWS,
): boolean {
  const window = openWindow(now, windows);
  if (!window) return false;
  if (vault.lastCollectedAt === null) return true;
  return vault.lastCollectedAt < atMinutes(now, window.startMinutes);
}

/** Why the collect button is disabled, in one line. */
export function describeWindow(
  vault: VaultState,
  now: Date,
  windows: CollectionWindow[] = STANDARD_WINDOWS,
): string {
  const window = openWindow(now, windows);
  if (window && canCollect(vault, now, windows)) {
    const closesAt = new Date(atMinutes(now, window.endMinutes));
    return `${window.label} window is open until ${formatClock(closesAt)}.`;
  }
  const { window: next, opensAt } = nextWindow(now, windows);
  const prefix = window ? 'Collected. ' : '';
  return `${prefix}${next.label} window opens at ${formatClock(opensAt)}.`;
}

function formatClock(at: Date): string {
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/* ------------------------------------------------------------------ */
/* Accrual                                                             */
/* ------------------------------------------------------------------ */

/** The most the vault will hold, past which output spills. */
export function vaultCapacity(state: AerieState): number {
  const mods = modsFor(state);
  return Math.round(
    cityOutput(state.city.buildings, mods) * VAULT_CAP_DAYS * mods.research.vaultCap,
  );
}

const loggedOn = (history: DayRecord[], date: DateKey): boolean =>
  history.some(
    (day) => day.date === date && Boolean(day.morning?.completed || day.daily?.completed),
  );

/**
 * Elapsed time between two instants, expressed as *nominal seconds* — seconds
 * inside work hours counting `VAULT_WORK_MULTIPLIER` times over, and every
 * second of a day with no review logged counting only `VAULT_IDLE_SHARE`.
 *
 * Walked one calendar day at a time rather than integrated in closed form,
 * because both the work band and the review guard are per-local-day and the
 * span can cross a DST boundary. Day boundaries come from `addDays`, which is
 * calendar-correct, instead of adding 24 hours.
 */
export function nominalSeconds(
  from: number,
  to: number,
  history: DayRecord[] = [],
  workRate: number = NO_RESEARCH.workRate,
  idleShare: number = NO_RESEARCH.idleShare,
): number {
  if (!(to > from)) return 0;

  const start = Math.max(from, to - VAULT_MAX_ACCRUAL_DAYS * MS_PER_DAY);
  const endKey = toDateKey(new Date(to));
  let key = toDateKey(new Date(start));
  let total = 0;

  for (let guard = 0; guard <= VAULT_MAX_ACCRUAL_DAYS + 1; guard += 1) {
    const midnight = fromDateKey(key).getTime();
    const nextMidnight = fromDateKey(addDays(key, 1)).getTime();

    const spanStart = Math.max(start, midnight);
    const spanEnd = Math.min(to, nextMidnight);

    if (spanEnd > spanStart) {
      const workStart = midnight + WORK_START_MINUTES * 60_000;
      const workEnd = midnight + WORK_END_MINUTES * 60_000;
      const work = Math.max(
        0,
        Math.min(spanEnd, workEnd) - Math.max(spanStart, workStart),
      );
      const off = spanEnd - spanStart - work;
      // The guard is judged per whole day. For a span the app slept through
      // that makes it properly retroactive — three days away with reviews
      // logged on two of them accrues correctly for each. Time already folded
      // in earlier today at the trickle rate stays folded in: reviewing at 9am
      // speeds the vault up from 9am, it doesn't refund the morning.
      const share = loggedOn(history, key) ? 1 : idleShare;
      total += (share * (off + work * workRate)) / 1000;
    }

    if (key === endKey) break;
    key = addDays(key, 1);
  }

  return total;
}

/**
 * The vault, brought up to date. Idempotent, and safe to call on a timer.
 *
 * Returns the *existing* vault — same reference, so the store short-circuits
 * and nothing is written to disk — whenever the elapsed time doesn't move the
 * number. That covers three cases that would otherwise write a save every few
 * seconds for ever: a city producing nothing, a city producing so little that a
 * tick is worth less than a Lumen, and a vault already at its ceiling.
 *
 * Crucially, `accruedThrough` is left behind in that case rather than advanced,
 * so the elapsed time isn't discarded — it keeps accumulating until it is worth
 * something. (The one place that must not carry over is a collection, which
 * resets the clock itself; see `collectVault`.)
 */
export function accrueVault(state: AerieState, now: Date = new Date()): VaultState {
  const to = now.getTime();
  const vault = state.vault;
  // A clock that has gone backwards — a device clock corrected, a save carried
  // across timezones — would otherwise freeze accrual until wall-clock time
  // caught back up, which for a year-long jump means a year of nothing. Give up
  // the unaccrued span instead and restart the clock from here.
  if (vault.accruedThrough > to) return { ...vault, accruedThrough: to };
  if (!(to > vault.accruedThrough)) return vault;

  const mods = modsFor(state);
  const research = mods.research;
  // The `vaultRate` research multiplies the whole fill; work and idle rates are
  // per-second modifiers passed into the nominal-seconds walk.
  const perSecond =
    (cityOutput(state.city.buildings, mods) / NOMINAL_SECONDS_PER_DAY) *
    research.vaultRate;
  // The remainder from last time rides along, and whatever this accrual doesn't
  // bank as a whole Lumen is carried on to the next. Neither rounding nor
  // flooring alone survives an arbitrary tick rate: rounding pays a whole Lumen
  // for the first half-Lumen a small city produces, so a tab left open fills at
  // twice the rate a shut one does; flooring throws away most of a Lumen every
  // tick, so a large city fills *slower* the more often it is looked at. Only
  // carrying the fraction makes ten-second ticks, one hourly check and a
  // fortnight away come to the same number.
  const gained =
    vault.carry +
    perSecond *
      nominalSeconds(
        vault.accruedThrough,
        to,
        state.history,
        research.workRate,
        research.idleShare,
      );
  const whole = Math.floor(gained);
  const lumen = Math.min(vault.lumen + whole, vaultCapacity(state));
  // Unchanged means the gain didn't reach a whole Lumen (or the vault is full).
  // `accruedThrough` and `carry` are both left behind, so the elapsed span is
  // simply recomputed next time rather than discarded.
  if (lumen === vault.lumen) return vault;

  return { ...vault, accruedThrough: to, lumen, carry: gained - whole };
}

/** How full the vault is, 0–1. Zero capacity reads as empty, not as full. */
export function vaultFill(state: AerieState): number {
  const capacity = vaultCapacity(state);
  if (capacity <= 0) return 0;
  return Math.min(1, state.vault.lumen / capacity);
}

/** Lumen per hour at this instant, for the "filling at…" line. */
export function currentRate(state: AerieState, now: Date = new Date()): number {
  const mods = modsFor(state);
  const research = mods.research;
  const perSecond =
    (cityOutput(state.city.buildings, mods) / NOMINAL_SECONDS_PER_DAY) *
    research.vaultRate;
  const minutes = minutesOfDay(now);
  const working = minutes >= WORK_START_MINUTES && minutes < WORK_END_MINUTES;
  const reviewed = loggedOn(state.history, toDateKey(now));
  const share = reviewed ? 1 : research.idleShare;
  return perSecond * 3600 * share * (working ? research.workRate : 1);
}

/** True when the vault is at its ceiling and output is being lost. */
export function isOverflowing(state: AerieState): boolean {
  const capacity = vaultCapacity(state);
  return capacity > 0 && state.vault.lumen >= capacity;
}
