/**
 * The vault: accrual around the clock, and the two windows it can be emptied
 * in. Every test pins an explicit local time — nothing here may depend on when
 * the suite happens to run.
 */
import { describe, expect, it } from 'vitest';
import {
  COLLECTION_WINDOWS,
  VAULT_IDLE_SHARE,
  VAULT_WORK_MULTIPLIER,
} from '@/config/tuning';
import { createInitialState } from '@/state/defaults';
import type { AerieState, DayRecord } from '@/state/types';
import { cityOutput } from './economy';
import {
  accrueVault,
  canCollect,
  currentRate,
  isOverflowing,
  nextWindow,
  nominalSeconds,
  openWindow,
  vaultCapacity,
  vaultFill,
} from './vault';

const DAY = '2026-07-22';

/** Local time on the test day. */
const at = (hours: number, minutes = 0): Date =>
  new Date(2026, 6, 22, hours, minutes, 0, 0);

const logged = (date: string): DayRecord => ({
  date,
  morning: {
    completed: true,
    tier: 'full',
    pointsEarned: 5,
    lumenEarned: 50,
    doneItemIds: [],
  },
  daily: null,
  dayOff: false,
});

/** A city with one greenhouse, and a review logged today unless told otherwise. */
function city(reviewed = true, level = 100): AerieState {
  const base = createInitialState(at(0));
  return {
    ...base,
    history: reviewed ? [logged(DAY)] : [],
    city: { ...base.city, buildings: [{ id: 'greenhouse', level }] },
    vault: { ...base.vault, accruedThrough: at(0).getTime() },
  };
}

describe('collection windows', () => {
  it('is shut outside a window', () => {
    expect(openWindow(at(7, 59))).toBeNull();
    expect(openWindow(at(12))).toBeNull();
    expect(openWindow(at(23))).toBeNull();
  });

  it('is open inside one, right up to the closing minute', () => {
    expect(openWindow(at(8))?.id).toBe('morning');
    expect(openWindow(at(8, 59))?.id).toBe('morning');
    expect(openWindow(at(9))).toBeNull();
    expect(openWindow(at(16, 30))?.id).toBe('afternoon');
    expect(openWindow(at(17))).toBeNull();
  });

  it('points at the next window, rolling over to tomorrow after the last one', () => {
    expect(nextWindow(at(7)).window.id).toBe('morning');
    expect(nextWindow(at(10)).window.id).toBe('afternoon');

    const overnight = nextWindow(at(20));
    expect(overnight.window.id).toBe('morning');
    expect(overnight.opensAt.getDate()).toBe(23);
    expect(overnight.opensAt.getHours()).toBe(8);
  });

  it('refuses a second collection in the same window, and allows the next one', () => {
    const vault = { ...city().vault, lumen: 500 };
    expect(canCollect(vault, at(8, 15))).toBe(true);

    const collected = { ...vault, lastCollectedAt: at(8, 15).getTime() };
    expect(canCollect(collected, at(8, 45))).toBe(false);
    expect(canCollect(collected, at(16, 5))).toBe(true);
  });

  it('reopens the same window the next day', () => {
    const collected = { ...city().vault, lastCollectedAt: at(8, 15).getTime() };
    expect(canCollect(collected, new Date(2026, 6, 23, 8, 15))).toBe(true);
  });

  it('never opens outside a window, however long it has been', () => {
    const stale = { ...city().vault, lastCollectedAt: null };
    expect(canCollect(stale, at(11))).toBe(false);
  });
});

describe('accrual', () => {
  it('counts work-hour seconds several times over', () => {
    // 08:00–09:00 is entirely inside the work band.
    const work = nominalSeconds(at(8).getTime(), at(9).getTime(), [logged(DAY)]);
    expect(work).toBeCloseTo(3600 * VAULT_WORK_MULTIPLIER);

    // 20:00–21:00 is entirely outside it.
    const evening = nominalSeconds(at(20).getTime(), at(21).getTime(), [logged(DAY)]);
    expect(evening).toBeCloseTo(3600);
  });

  it('splits an hour that straddles the end of the work day', () => {
    // 16:00–17:00 is half work (to 16:30) and half not.
    const straddle = nominalSeconds(at(16).getTime(), at(17).getTime(), [logged(DAY)]);
    expect(straddle).toBeCloseTo(1800 * VAULT_WORK_MULTIPLIER + 1800);
  });

  it('trickles on a day with nothing logged', () => {
    const idle = nominalSeconds(at(20).getTime(), at(21).getTime(), []);
    expect(idle).toBeCloseTo(3600 * VAULT_IDLE_SHARE);
  });

  it('judges the guard per day across a span the app slept through', () => {
    // Two nights away; a review logged on the first day only.
    const from = new Date(2026, 6, 22, 20).getTime();
    const to = new Date(2026, 6, 24, 20).getTime();
    const both = nominalSeconds(from, to, [logged('2026-07-22'), logged('2026-07-23')]);
    const one = nominalSeconds(from, to, [logged('2026-07-22')]);
    expect(one).toBeLessThan(both);
    expect(one).toBeGreaterThan(both * VAULT_IDLE_SHARE);
  });

  it('adds nothing for time that runs backwards or stands still', () => {
    expect(nominalSeconds(at(9).getTime(), at(9).getTime(), [])).toBe(0);
    expect(nominalSeconds(at(9).getTime(), at(8).getTime(), [])).toBe(0);
  });

  it('refuses to walk back further than the accrual limit', () => {
    const to = at(12).getTime();
    const ancient = nominalSeconds(0, to, []);
    const aYear = nominalSeconds(to - 365 * 86_400_000, to, []);
    expect(ancient).toBe(aYear);
  });
});

describe('accrueVault', () => {
  it('would bank a full day at ~1.7× nominal, which is why the cap bites', () => {
    // 8.5h at 3× plus 15.5h at 1× = 41 hour-equivalents over 24. Stated on
    // `nominalSeconds` because `accrueVault` can never show it — a full
    // uncollected day always hits the ceiling, and that is the design.
    const full = nominalSeconds(at(0).getTime(), new Date(2026, 6, 23).getTime(), [
      logged(DAY),
    ]);
    expect(full / 86_400).toBeCloseTo(41 / 24, 2);

    const state = city();
    const banked = accrueVault(state, new Date(2026, 6, 23));
    expect(banked.lumen).toBe(vaultCapacity(state));
    expect(banked.lumen).toBeLessThan((cityOutput(state.city.buildings) * 41) / 24);
  });

  it('pays a half-day at the rate the clock says, well under the cap', () => {
    const state = city();
    const perSecond = cityOutput(state.city.buildings) / 86_400;
    // 20:00 to midnight: four hours, none of it work time.
    const evening = accrueVault(
      { ...state, vault: { ...state.vault, accruedThrough: at(20).getTime() } },
      new Date(2026, 6, 23),
    );
    expect(evening.lumen).toBeCloseTo(perSecond * 4 * 3600, -1);
  });

  it('is idempotent — running it twice adds nothing', () => {
    const state = city();
    const once = accrueVault(state, at(6));
    const twice = accrueVault({ ...state, vault: once }, at(6));
    expect(twice.lumen).toBe(once.lumen);
    expect(twice).toBe(once);
  });

  it('caps rather than filling for ever', () => {
    const state = city();
    const capacity = vaultCapacity(state);
    const gone = accrueVault(state, new Date(2026, 7, 22));
    expect(gone.lumen).toBe(capacity);
    expect(isOverflowing({ ...state, vault: gone })).toBe(true);
  });

  it('never touches the cap over an ordinary day of two collections', () => {
    const state = city();
    // Overnight and the morning: 16:00 the day before through 08:00.
    const overnight = accrueVault(
      { ...state, vault: { ...state.vault, accruedThrough: new Date(2026, 6, 21, 16).getTime() } },
      at(8),
    );
    expect(overnight.lumen).toBeLessThan(vaultCapacity(state));

    // And the working day: 09:00 through 16:00.
    const working = accrueVault(
      { ...state, vault: { ...state.vault, accruedThrough: at(9).getTime() } },
      at(16),
    );
    expect(working.lumen).toBeLessThan(vaultCapacity(state));
  });

  it('accrues almost nothing for a city with nothing in it', () => {
    const empty = createInitialState(at(0));
    expect(accrueVault(empty, at(23)).lumen).toBe(0);
    expect(vaultFill(empty)).toBe(0);
  });

  it('writes nothing when a tick is not worth a whole Lumen', () => {
    // Same reference back means the store short-circuits and skips the save.
    const empty = createInitialState(at(0));
    expect(accrueVault(empty, at(1))).toBe(empty.vault);

    const tiny = { ...city(true, 1), vault: { ...city().vault } };
    const oneSecondOn = new Date(at(3).getTime() + 1000);
    const ticked = accrueVault({ ...tiny, vault: { ...tiny.vault, accruedThrough: at(3).getTime() } }, oneSecondOn);
    expect(ticked.lumen).toBe(0);
  });

  it('holds on to the elapsed time it declined to bank', () => {
    // A second at a time is worth nothing; an hour of those seconds is not.
    const state = city(true, 1);
    const perHour = (cityOutput(state.city.buildings) / 24) * 1; // 03:00 is off-peak
    const start = at(3).getTime();

    let vault = { ...state.vault, accruedThrough: start };
    for (let second = 1; second <= 3600; second += 1) {
      vault = accrueVault({ ...state, vault }, new Date(start + second * 1000));
    }
    // Ticking every second must come to the same as one hour-long step, not
    // to zero — which is what a naive "advance the clock anyway" would give.
    expect(vault.lumen).toBeCloseTo(perHour, -1);
  });

  it('fills at the same rate whatever the tick cadence — open tab or shut', () => {
    // The whole promise of the vault: you can start and stop the app freely.
    // A per-tick round would let a small city bank a Lumen for half a Lumen
    // and a large one lose most of a Lumen every tick, so the number would
    // depend on how often the screen happened to be open. It must not.
    for (const level of [1, 7, 100]) {
      const state = city(true, level);
      const start = at(2).getTime();
      const end = at(14).getTime(); // spans the work-hours band

      const offline = accrueVault(
        { ...state, vault: { ...state.vault, accruedThrough: start } },
        new Date(end),
      ).lumen;

      for (const cadence of [1_000, 10_000, 300_000]) {
        let vault = { ...state.vault, accruedThrough: start };
        for (let t = start + cadence; t <= end; t += cadence) {
          vault = accrueVault({ ...state, vault }, new Date(t));
        }
        // Within a single Lumen: the carry makes this exact in arithmetic, and
        // all that is left is float noise from summing thousands of segments —
        // bounded, not accumulating. A per-tick round or floor misses by 2× to
        // hundreds here, so this still fails loudly if the carry is dropped.
        expect(Math.abs(vault.lumen - offline)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('does not freeze when the clock jumps backwards', () => {
    // A device clock corrected, or a save opened west of where it was written,
    // leaves `accruedThrough` in the future. Accrual must resume from the new
    // now rather than wait — possibly a year — for wall-clock to catch up.
    const state = city();
    const future = { ...state.vault, accruedThrough: at(20).getTime() };
    const rewound = accrueVault({ ...state, vault: future }, at(9));
    expect(rewound.accruedThrough).toBe(at(9).getTime());

    // And from there it accrues normally again.
    const later = accrueVault({ ...state, vault: rewound }, at(10));
    expect(later.lumen).toBeGreaterThan(0);
  });

  it('does not refill the instant a full vault is emptied', () => {
    // The full-vault case is where the held-back time is most dangerous: it
    // would otherwise pour straight back in. `collectVault` resets the clock.
    const state = city();
    const full = accrueVault(state, new Date(2026, 7, 22));
    expect(full.lumen).toBe(vaultCapacity(state));

    const collected = { ...full, lumen: 0, accruedThrough: new Date(2026, 7, 22).getTime() };
    const after = accrueVault(
      { ...state, vault: collected },
      new Date(2026, 7, 22, 0, 0, 30),
    );
    expect(after.lumen).toBeLessThan(vaultCapacity(state) / 100);
  });
});

describe('currentRate', () => {
  it('is three times higher mid-morning than late at night', () => {
    const state = city();
    expect(currentRate(state, at(10))).toBeCloseTo(
      currentRate(state, at(22)) * VAULT_WORK_MULTIPLIER,
    );
  });

  it('drops to a trickle with no review logged', () => {
    expect(currentRate(city(false), at(10))).toBeCloseTo(
      currentRate(city(true), at(10)) * VAULT_IDLE_SHARE,
    );
  });
});

describe('configuration', () => {
  it('has windows that do not overlap and are listed in order', () => {
    for (let i = 1; i < COLLECTION_WINDOWS.length; i += 1) {
      expect(COLLECTION_WINDOWS[i]!.startMinutes).toBeGreaterThanOrEqual(
        COLLECTION_WINDOWS[i - 1]!.endMinutes,
      );
    }
  });
});
