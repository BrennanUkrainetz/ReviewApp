/**
 * Local-calendar-day helpers. Aerie's streak is defined in *local* days:
 * a review done at 00:05 or 23:55 both count for that calendar day.
 *
 * Dates are passed around as `YYYY-MM-DD` strings (`DateKey`) so they compare,
 * sort, and serialise without timezone surprises.
 */

export type DateKey = string;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` for a `Date`, in the machine's local timezone. */
export function toDateKey(date: Date): DateKey {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today's local calendar day. */
export function today(now: Date = new Date()): DateKey {
  return toDateKey(now);
}

export function isDateKey(value: unknown): value is DateKey {
  return typeof value === 'string' && DATE_KEY_PATTERN.test(value);
}

/** Parses a `DateKey` into a local-midnight `Date`. */
export function fromDateKey(key: DateKey): Date {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Whole local days between two keys — positive when `b` is later than `a`. */
export function daysBetween(a: DateKey, b: DateKey): number {
  const msPerDay = 86_400_000;
  const start = fromDateKey(a).getTime();
  const end = fromDateKey(b).getTime();
  return Math.round((end - start) / msPerDay);
}

/** The key `offset` days away from `key` (negative for the past). */
export function addDays(key: DateKey, offset: number): DateKey {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

/** Long human form, e.g. `July 21`. Used in plain, factual history copy. */
export function formatDayLabel(key: DateKey): string {
  return fromDateKey(key).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });
}

/** Short human form with weekday, e.g. `Tue, Jul 21`. */
export function formatShortDay(key: DateKey): string {
  return fromDateKey(key).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
