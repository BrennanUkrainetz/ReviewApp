/**
 * Balance simulator: a diligent player, played forward day by day through the
 * real actions, so the numbers in `config/` can be tuned against what actually
 * happens rather than against arithmetic done in a comment.
 *
 *   npm run sim            # default: 365 days
 *   SIM_DAYS=120 npm run sim
 *
 * The player full-clears both reviews every weekday, collects the vault in
 * every window it can reach, catches every mote at full chain, buys whatever
 * the shop marks as the best buy, raises the charter the moment it can, and
 * ascends once a run would at least double the Aether earned so far.
 */
import { writeFileSync } from 'node:fs';
import { afterAll, test, vi } from 'vitest';
import { REVIEW_IDS } from '@/config/checklists';
import { canAscend, modsFor, pendingAether } from '@/domain/ascension';
import { formatBig } from '@/domain/bignum';
import { charterProgress } from '@/domain/charter';
import { bestBuy, cityOutput, paybackDays, revealedBuildings } from '@/domain/economy';
import { isWeekend, toDateKey } from '@/domain/dates';
import { windowsForState } from '@/domain/vault';
import {
  ascend,
  buyBuilding,
  buyCharter,
  catchMote,
  collectVault,
  completeReview,
} from '@/state/actions';
import { checklistFor } from '@/state/checklists';
import { createInitialState } from '@/state/defaults';
import { setStorageBackend } from '@/state/storage';
import { createStore, type Store } from '@/state/store';
import * as policy from './policy';

const DAYS = Number(process.env['SIM_DAYS'] ?? 365);
const START = new Date(2026, 0, 5, 7, 0); // a Monday

function at(day: Date, minutes: number): Date {
  const d = new Date(day);
  d.setHours(0, minutes, 0, 0);
  return d;
}

function spend(store: Store): void {
  for (let guard = 0; guard < 400; guard += 1) {
    const state = store.getState();
    if (buyCharter(store).ok) continue;
    const mods = modsFor(state);
    const shown = revealedBuildings(
      state.city.buildings,
      state.currency.lifetimeLumen,
      state.ascension.count,
    );
    const best =
      bestBuy(shown, state.city.buildings, state.currency.lumen, 10, mods) ??
      bestBuy(shown, state.city.buildings, state.currency.lumen, 1, mods);
    if (!best) return;
    if (process.env['SIM_TRACE']) {
      const days = paybackDays(best, state.city.buildings, 10, mods);
      const lvl = state.city.buildings.find((b) => b.id === best.id)?.level ?? 0;
      trace.push(`    buy ${best.id}@${lvl} payback ${days.toFixed(2)}d`);
    }
    const result = buyBuilding(store, best.id, 10);
    if (!result.ok && !buyBuilding(store, best.id, 1).ok) return;
  }
}

function review(
  store: Store,
  rid: (typeof REVIEW_IDS)[number],
  items: string[],
  now: Date,
): void {
  const outcome = completeReview(store, rid, items, { now, rng: () => 0.99 });
  income.review += outcome.reward.reviewLumen;
  income.bonus += outcome.reward.bonusLumen + outcome.reward.contractLumen;
}

function collect(store: Store, now: Date): void {
  vi.setSystemTime(now);
  track(store, 'vault', () => collectVault(store, now));
  spend(store);
}

const log: string[] = [];
const trace: string[] = [];

/** Lumen by source over the current week, as multiples of city output. */
const income = { vault: 0, review: 0, mote: 0, bonus: 0 };
let outputDays = 0;
function track(store: Store, key: keyof typeof income, fn: () => void): void {
  const before = store.getState().currency.lifetimeLumen;
  fn();
  income[key] += store.getState().currency.lifetimeLumen - before;
}

test('simulate', () => {
  setStorageBackend({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
  const store = createStore(createInitialState(START));

  for (let n = 0; n < DAYS; n += 1) {
    const day = new Date(START);
    day.setDate(day.getDate() + n);
    const key = toDateKey(day);
    const weekday = !isWeekend(key);

    for (const window of windowsForState(store.getState())) {
      const open = at(day, window.startMinutes + 1);
      if (weekday && window.startMinutes < 12 * 60) {
        vi.setSystemTime(open);
        const rid = REVIEW_IDS[0]!;
        const items = checklistFor(store.getState(), rid).items.map((i) => i.id);
        review(store, rid, items, open);
      }
      if (weekday && window.startMinutes >= 16 * 60) {
        vi.setSystemTime(open);
        const rid = REVIEW_IDS[1]!;
        const items = checklistFor(store.getState(), rid).items.map((i) => i.id);
        review(store, rid, items, open);
        for (let m = 0; m < 12; m += 1) {
          let ok = false;
          track(store, 'mote', () => {
            ok = catchMote(store, open, [1, 1.75, 2.5][m % 3]).ok;
          });
          if (!ok) break;
        }
      }
      collect(store, at(day, window.startMinutes + 2));
    }

    // Research and perks, whatever the current rules make of them.
    policy.research(store);
    policy.perks(store);

    outputDays += cityOutput(store.getState().city.buildings, modsFor(store.getState()));
    const state = store.getState();
    if (canAscend(state) && policy.shouldAscend(state)) {
      const before = pendingAether(state);
      const result = ascend(store, at(day, 17 * 60 + 30));
      if (result.ok) {
        log.push(`  ** day ${n + 1}: ascended (#${result.count}) for ${before} Aether`);
        policy.perks(store);
        spend(store);
      }
    }

    if ((n + 1) % 7 === 0) {
      const s = store.getState();
      const mods = modsFor(s);
      const out = cityOutput(s.city.buildings, mods);
      const top = [...s.city.buildings].sort((a, b) => b.level - a.level)[0];
      const charter = charterProgress(s.city.buildings, s.city.charter, s.currency.lumen);
      log.push(
        [
          `wk ${String((n + 1) / 7).padStart(3)}`,
          `asc ${s.ascension.count}`,
          `out ${formatBig(out).padStart(8)}`,
          `life ${formatBig(s.currency.lifetimeLumen).padStart(8)}`,
          `bank ${formatBig(s.currency.lumen).padStart(8)}`,
          `ch ${s.city.charter}${charter.met ? '*' : ' '}(${formatBig(charter.cost)})`,
          `kinds ${s.city.buildings.length} top ${top?.id ?? '-'}@${top?.level ?? 0}`,
          `pend ${pendingAether(s)}`,
          `aeth ${s.ascension.aether}/${s.ascension.aetherEarned}`,
          `cinder ${s.currency.cinder}`,
          `res ${s.research.length}`,
          policy.describe(s),
          `inc/out v${(income.vault / outputDays).toFixed(2)} r${(income.review / outputDays).toFixed(2)} m${(income.mote / outputDays).toFixed(2)} b${(income.bonus / outputDays).toFixed(2)}`,
        ].join(' | '),
      );
      if (process.env['SIM_TRACE'] && (n + 1) / 7 === Number(process.env['SIM_TRACE']))
        log.push(...trace);
      trace.length = 0;
      income.vault = income.review = income.mote = income.bonus = 0;
      outputDays = 0;
    }
  }
});

afterAll(() => {
  vi.useRealTimers();
  writeFileSync(process.env['SIM_OUT'] ?? 'sim-output.txt', log.join('\n') + '\n');
});
