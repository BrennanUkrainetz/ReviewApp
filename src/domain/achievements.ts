/**
 * Checking achievements and turning them into a multiplier.
 *
 * Achievements are re-checked after every state change that could earn one and
 * only ever added to. The stored list is the record; the `earnedBy` predicates
 * are just how new entries get onto it.
 */
import { ACHIEVEMENTS, getAchievement, type AchievementDef } from '@/config/achievements';
import { ACHIEVEMENT_BONUS } from '@/config/tuning';
import type { AerieState } from '@/state/types';

/**
 * Ids the save qualifies for but has not been credited with yet.
 *
 * A predicate that throws on an odd save — a hand-edited file, a shape from a
 * future version — must not take the whole app down on boot, so each is run
 * defensively and a failure simply means "not yet".
 */
export function newlyEarned(state: AerieState): string[] {
  const held = new Set(state.achievements);
  return ACHIEVEMENTS.filter((entry) => {
    if (held.has(entry.id)) return false;
    try {
      return entry.earnedBy(state);
    } catch {
      return false;
    }
  }).map((entry) => entry.id);
}

/** Multiplier from everything earned: 1 + 1% each. */
export function achievementMultiplier(earned: readonly string[]): number {
  const known = earned.filter((id) => getAchievement(id));
  return 1 + known.length * ACHIEVEMENT_BONUS;
}

/** Earned definitions, in catalogue order. */
export function earnedAchievements(earned: readonly string[]): AchievementDef[] {
  const held = new Set(earned);
  return ACHIEVEMENTS.filter((entry) => held.has(entry.id));
}
