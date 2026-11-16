/**
 * The simulated player's choices for the trees — kept apart from the day loop
 * so they can be changed without touching it.
 */
import { perkRankCost, PERKS } from '@/config/perks';
import { RESEARCH } from '@/config/research';
import { pendingAether, perkStatus, rankOf, totalPerkRanks } from '@/domain/ascension';
import { buyPerk, buyResearch, fireKiln } from '@/state/actions';
import type { Store } from '@/state/store';
import type { AerieState } from '@/state/types';

/** Cheapest research first, as far as the Cinder goes. */
export function research(store: Store): void {
  for (const entry of [...RESEARCH].sort((a, b) => a.cost - b.cost)) {
    buyResearch(store, entry.id);
  }
  // Once the Workshop is bought out, the kiln takes the rest.
  const state = store.getState();
  if (state.research.length === RESEARCH.length) {
    const batches = Math.floor((state.currency.cinder - 50) / 100);
    if (batches > 0) fireKiln(store, batches);
  }
}

/** Cheapest available perk rank, repeatedly, until nothing is affordable. */
export function perks(store: Store): void {
  for (let guard = 0; guard < 500; guard += 1) {
    const { ascension } = store.getState();
    const next = PERKS.filter((perk) => perkStatus(perk, ascension) === 'available').sort(
      (a, b) =>
        perkRankCost(a, rankOf(ascension.perkRanks, a.id)) -
        perkRankCost(b, rankOf(ascension.perkRanks, b.id)),
    )[0];
    if (!next || !buyPerk(store, next.id).ok) return;
  }
}

/**
 * The rule of thumb every prestige game teaches: go when this run would at
 * least double what you have ever been paid. `SIM_ASCEND=0` never ascends.
 */
export function shouldAscend(state: AerieState): boolean {
  if (process.env['SIM_ASCEND'] === '0') return false;
  return pendingAether(state) >= Math.max(10, state.ascension.aetherEarned);
}

export function describe(state: AerieState): string {
  return `ranks ${totalPerkRanks(state.ascension)}`;
}
