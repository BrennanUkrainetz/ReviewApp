/**
 * Streak wards and mending — two ways to keep a run alive through a day you
 * missed, each paid for by the routine going well on the other days.
 *
 * - A **ward** is bought ahead of time with Cinder and held. The next time the
 *   app notices a missed weekday, held wards are spent automatically to cover
 *   it, one ward per day. If there are not enough to cover the whole gap, none
 *   are spent — a partial cover saves nothing.
 * - A **mend** is the same cover bought after the fact. When a run breaks it is
 *   remembered for `MEND_WINDOW_WEEKDAYS`, and in that time it can be restored
 *   for Cinder or Aether. A run restarted in the meantime is folded into the
 *   mended one, so reviewing before noticing the break never costs anything.
 *
 * Both work the same way underneath: every weekday they cover is written into
 * history as a day off flagged `warded`. That is the whole trick. The streak,
 * heat and achievements already treat a day off as neutral, so a covered day
 * holds heat as well as the streak, and not one of those rules needed a second
 * path to learn about wards.
 *
 * Pure functions over state. The actions that charge for them are in
 * `state/actions.ts`.
 */
import {
  MEND_CINDER_BASE,
  MEND_CINDER_PER_AETHER,
  MEND_CINDER_PER_DAY,
  MEND_CINDER_PER_STREAK_DAY,
  MEND_WINDOW_WEEKDAYS,
  WARD_BASE_SLOTS,
} from '@/config/tuning';
import type { AerieState, DayRecord, MilestoneState } from '@/state/types';
import type { Mods } from './ascension';
import { addWeekdays, weekdaysBetween, type DateKey } from './dates';

/** How many wards this save may hold at once. */
export function wardCapacity(mods: Mods): number {
  return WARD_BASE_SLOTS + mods.wardSlots + mods.research.wardSlots;
}

/** Whether a day kept the streak going: a floor-or-better review, or a day off. */
export function keptContinuity(day: DayRecord | undefined): boolean {
  if (!day) return false;
  if (day.dayOff) return true;
  return [day.morning, day.daily].some(
    (record) => record?.completed && (record.tier === 'floor' || record.tier === 'full'),
  );
}

/** Writes a covered day into history, keeping anything already logged on it. */
function coverDay(history: DayRecord[], date: DateKey): DayRecord[] {
  const existing = history.find((day) => day.date === date);
  const covered: DayRecord = {
    ...(existing ?? { date, morning: null, daily: null, dayOff: false }),
    dayOff: true,
    warded: true,
  };
  const next = existing
    ? history.map((day) => (day.date === date ? covered : day))
    : [...history, covered];
  return next.sort((a, b) => a.date.localeCompare(b.date));
}

/** Covers each of `dates` in history. */
export function coverDays(history: DayRecord[], dates: readonly DateKey[]): DayRecord[] {
  return dates.reduce(coverDay, history);
}

/* ------------------------------------------------------------------ */
/* Breaking a run                                                      */
/* ------------------------------------------------------------------ */

/**
 * Milestone bookkeeping for a run starting from nothing: the next chest at the
 * first interval again. Without this a run that broke at 23 would not see
 * another chest until it passed 25, and no big milestone until 40.
 */
export function freshMilestones(milestones: MilestoneState): MilestoneState {
  return {
    ...milestones,
    nextSmallAt: milestones.smallInterval,
    nextBigAt: milestones.bigInterval,
  };
}

/**
 * Called when a gap is found. Spends wards if they cover the whole gap;
 * otherwise breaks the run and remembers it so it can be mended.
 */
export function coverOrBreak(state: AerieState, today: DateKey): AerieState {
  const { lastActiveDate, current } = state.streak;
  if (current === 0 || lastActiveDate === null) {
    return { ...state, streak: { ...state.streak, current: 0 } };
  }

  const gap = weekdaysBetween(lastActiveDate, today);
  if (gap.length === 0) return state;

  if (state.streak.wards >= gap.length) {
    return {
      ...state,
      history: coverDays(state.history, gap),
      streak: {
        ...state.streak,
        wards: state.streak.wards - gap.length,
        wardsUsed: state.streak.wardsUsed + gap.length,
        lastActiveDate: gap[gap.length - 1]!,
      },
    };
  }

  return {
    ...state,
    streak: {
      ...state.streak,
      current: 0,
      broken: {
        length: current,
        lastActiveDate,
        brokenOn: today,
        milestones: state.milestones,
      },
    },
    milestones: freshMilestones(state.milestones),
  };
}

/* ------------------------------------------------------------------ */
/* Mending                                                             */
/* ------------------------------------------------------------------ */

/** The last day a broken run can still be mended. */
export function mendDeadline(brokenOn: DateKey): DateKey {
  return addWeekdays(brokenOn, MEND_WINDOW_WEEKDAYS - 1);
}

/** Forgets a broken run once its mend window has closed. */
export function expireBroken(state: AerieState, today: DateKey): AerieState {
  const broken = state.streak.broken;
  if (!broken || today <= mendDeadline(broken.brokenOn)) return state;
  return { ...state, streak: { ...state.streak, broken: null } };
}

/**
 * The weekdays a mend would have to cover: every weekday since the broken run
 * last kept going, up to (not including) today, that nothing else kept — days
 * already covered by a restarted run's reviews are not charged for twice.
 */
export function mendGap(state: AerieState, today: DateKey): DateKey[] {
  const broken = state.streak.broken;
  if (!broken) return [];
  const byDate = new Map(state.history.map((day) => [day.date, day]));
  return weekdaysBetween(broken.lastActiveDate, today).filter(
    (date) => !keptContinuity(byDate.get(date)),
  );
}

export interface MendQuote {
  /** The run that would be restored, before anything restarted since. */
  length: number;
  /** What the streak would read afterwards. */
  restored: number;
  /** Weekdays the mend covers. */
  days: DateKey[];
  cinder: number;
  aether: number;
  /** Last day the offer stands. */
  deadline: DateKey;
}

/** What mending the broken run would cost today, or `null` if there is none. */
export function mendQuote(
  state: AerieState,
  today: DateKey,
  mods: Mods,
): MendQuote | null {
  const broken = state.streak.broken;
  if (!broken || today > mendDeadline(broken.brokenOn)) return null;
  const days = mendGap(state, today);
  if (days.length === 0) return null;

  const raw =
    MEND_CINDER_BASE +
    MEND_CINDER_PER_DAY * days.length +
    MEND_CINDER_PER_STREAK_DAY * broken.length;
  const cinder = Math.ceil(raw * mods.research.mendCost);

  return {
    length: broken.length,
    restored: broken.length + state.streak.current,
    days,
    cinder,
    aether: Math.max(1, Math.ceil(cinder / MEND_CINDER_PER_AETHER)),
    deadline: mendDeadline(broken.brokenOn),
  };
}

/**
 * Restores the broken run, folding in whatever has been built since. Charging
 * is the caller's job; this only rewrites the streak and history.
 *
 * Milestones pick up from where the broken run left them, stepped silently
 * past the restored length — a mend restores a run, it does not replay the
 * chests on the way back up.
 */
export function applyMend(state: AerieState, quote: MendQuote): AerieState {
  const broken = state.streak.broken;
  if (!broken) return state;

  const restored = quote.restored;
  const milestones = { ...broken.milestones };
  while (milestones.nextSmallAt <= restored)
    milestones.nextSmallAt += milestones.smallInterval;
  while (milestones.nextBigAt <= restored) milestones.nextBigAt += milestones.bigInterval;

  const lastCovered = quote.days[quote.days.length - 1]!;
  const lastActive = state.streak.lastActiveDate;

  return {
    ...state,
    history: coverDays(state.history, quote.days),
    milestones,
    streak: {
      ...state.streak,
      current: restored,
      longest: Math.max(state.streak.longest, restored),
      lastActiveDate:
        lastActive !== null && lastActive > lastCovered ? lastActive : lastCovered,
      mendsUsed: state.streak.mendsUsed + 1,
      broken: null,
    },
  };
}
