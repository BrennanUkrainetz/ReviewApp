/**
 * Local-calendar-day helpers. Aerie's streak is defined in *local* days:
 * a review done at 00:05 or 23:55 both count for that calendar day.
 *
 * Dates are passed around as `YYYY-MM-DD` strings (`DateKey`) so they compare,
 * sort, and serialise without timezone surprises.
 *
 * Aerie runs on the working week. Saturday and Sunday are not days you can miss
 * — they are not days at all as far as the routine is concerned — so anything
 * that asks "was a day skipped?" counts weekdays, not calendar days. That rule
 * lives here, in `isWeekend`/`missedWeekdays`/`addWeekdays`, so the streak, heat
 * and achievements all read it from the same place.
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

/** Saturday or Sunday — a day Aerie does not expect anything on. */
export function isWeekend(key: DateKey): boolean {
  const weekday = fromDateKey(key).getDay();
  return weekday === 0 || weekday === 6;
}

/** Monday through Friday — the days the routine actually runs on. */
export function isWeekday(key: DateKey): boolean {
  return !isWeekend(key);
}

/** A Monday, so `weekdaysBefore` can count in whole weeks from a known start. */
const WEEKDAY_ORIGIN: DateKey = '2000-01-03';

/** How many weekdays fall strictly before `key`, counted from a fixed Monday. */
function weekdaysBefore(key: DateKey): number {
  const days = daysBetween(WEEKDAY_ORIGIN, key);
  const weeks = Math.floor(days / 7);
  const rest = days - weeks * 7; // 0 = Monday … 6 = Sunday
  return weeks * 5 + Math.min(rest, 5);
}

/**
 * Weekdays strictly between two keys — the days that were genuinely skipped.
 *
 * This is the whole weekday rule in one number. Friday to Monday is 0 (nothing
 * was missed over the weekend); Friday to Tuesday is 1 (Monday was). Neither
 * endpoint counts: `from` was accounted for, and `to` is usually today, which
 * is still open.
 */
export function missedWeekdays(from: DateKey, to: DateKey): number {
  const between = weekdaysBefore(to) - weekdaysBefore(from) - (isWeekday(from) ? 1 : 0);
  return Math.max(0, between);
}

/** The key `offset` *weekdays* away from `key`, stepping over weekends. */
export function addWeekdays(key: DateKey, offset: number): DateKey {
  const step = offset < 0 ? -1 : 1;
  let cursor = key;
  for (let i = 0; i < Math.abs(offset); i += 1) {
    do {
      cursor = addDays(cursor, step);
    } while (isWeekend(cursor));
  }
  return cursor;
}

/**
 * Every weekday strictly between two keys, oldest first — the days
 * `missedWeekdays` counts, by name. Empty when nothing was skipped.
 */
export function weekdaysBetween(from: DateKey, to: DateKey): DateKey[] {
  const days: DateKey[] = [];
  const count = missedWeekdays(from, to);
  let cursor = from;
  for (let i = 0; i < count; i += 1) {
    cursor = addWeekdays(cursor, 1);
    days.push(cursor);
  }
  return days;
}

/** The Monday of the week `key` falls in. Weeks run Monday to Sunday. */
export function weekStart(key: DateKey): DateKey {
  const weekday = fromDateKey(key).getDay(); // 0 = Sunday
  return addDays(key, weekday === 0 ? -6 : 1 - weekday);
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
