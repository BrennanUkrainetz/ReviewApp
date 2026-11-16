/**
 * Ascension — the prestige screen.
 *
 * Two halves: what ascending right now would cost and pay, and the perk tree
 * the Aether goes into. The cost side is stated in full and confirmed, because
 * it is the only genuinely destructive action in the game.
 */
import { ALTITUDE_BANDS, bandFor } from '@/config/ascension';
import {
  getPerk,
  PERK_BRANCHES,
  perkRankCost,
  perksInBranch,
  type PerkDef,
  type PerkEffect,
} from '@/config/perks';
import {
  canAscend,
  lumenForNextAether,
  modsFor,
  pendingAether,
  perkStatus,
  rankOf,
} from '@/domain/ascension';
import { formatBig, formatMultiplier } from '@/domain/bignum';
import { ascend, buyPerk } from '@/state/actions';
import type { AerieState } from '@/state/types';
import { confirmDialog } from '../components/confirm';
import type { AppContext, Screen } from '../context';
import { el, plural, replaceChildren } from '../dom';
import { iconAether, iconBack, iconLock } from '../icons';

/**
 * Plain-English description of what `rank` ranks of a perk add up to, from its
 * effect data. Used twice on each card: once for a single rank (what the next
 * one buys) and once for the ranks owned (what it is doing now).
 */
function perkEffectLabel(effect: PerkEffect, rank: number): string {
  switch (effect.kind) {
    case 'output':
      return `${formatMultiplier(effect.factor ** rank)} city output`;
    case 'review':
      return `${formatMultiplier(effect.factor ** rank)} Lumen from reviews`;
    case 'contract':
      return `${formatMultiplier(effect.factor ** rank)} contract and expedition bonuses`;
    case 'cost':
      return `Buildings cost ${Math.round((1 - effect.factor ** rank) * 100)}% less`;
    case 'streak-cap':
      return `Streak bonus keeps growing for ${plural(effect.extra * rank, 'more day')}`;
    case 'streak-rate':
      return `+${(effect.extra * rank * 100).toFixed(1).replace(/\.0$/, '')}% streak bonus per day`;
    case 'drop':
      return `+${Math.round(effect.bonus * rank * 100)}% cosmetic drop chance`;
    case 'milestone':
      return `${formatMultiplier(effect.factor ** rank)} milestone chest bonus`;
    case 'mote':
      return `${formatMultiplier(effect.factor ** rank)} mote value`;
    case 'aether':
      return `${formatMultiplier(effect.factor ** rank)} Aether from ascending`;
    case 'carry-lumen':
      return `Keep ${Math.round(effect.share * rank * 100)}% of your Lumen when you ascend`;
    case 'ward-slots':
      return `Hold ${plural(effect.extra * rank, 'more streak ward')}`;
    case 'foothold': {
      const step = effect.steps[Math.min(rank, effect.steps.length) - 1];
      return step
        ? `Start each run with the first ${step.count} buildings at level ${step.level}`
        : 'Start each run with a head start';
    }
  }
}

/** The rank badge: "Rank 3 / 10", or just "Rank 3" for an uncapped perk. */
function rankLabel(perk: PerkDef, rank: number): string {
  return perk.maxRank === null ? `Rank ${rank}` : `Rank ${rank} / ${perk.maxRank}`;
}

export function createAscensionScreen(ctx: AppContext): Screen {
  const summary = el('div', { class: 'ascend__summary' });
  const tree = el('div', { class: 'ascend__tree' });

  const root = el(
    'section',
    { class: 'ascend' },
    el(
      'header',
      { class: 'shop__header' },
      el(
        'button',
        {
          class: 'btn btn--ghost',
          attrs: { type: 'button' },
          on: { click: () => ctx.navigate({ name: 'city' }) },
        },
        el('span', { class: 'review__exit-icon', html: iconBack() }),
        'City',
      ),
      el('h2', { class: 'shop__title' }, 'Ascension'),
      el('span', {}),
    ),
    summary,
    tree,
  );

  async function onAscend(): Promise<void> {
    const state = ctx.store.getState();
    const granted = pendingAether(state);
    const next = bandFor(state.ascension.count + 1);
    const carried = Math.floor(state.currency.lumen * modsFor(state).carryLumen);

    const confirmed = await confirmDialog({
      title: `Ascend to the ${next.name}?`,
      body:
        `Your buildings come down and your Lumen resets${
          carried > 0 ? `, bar the ${formatBig(carried)} you keep` : ''
        }. ` +
        `You gain ${plural(granted, 'Aether')}, and your streak, history, and ` +
        `cosmetics are untouched.`,
      confirmLabel: 'Ascend',
    });
    if (!confirmed) return;

    const result = ascend(ctx.store);
    ctx.toast(
      result.ok
        ? `The city rises to the ${next.name}. +${plural(result.aether, 'Aether')}.`
        : result.reason,
    );
  }

  function summaryContent(state: AerieState): HTMLElement[] {
    const granted = pendingAether(state);
    const ready = canAscend(state);
    const band = bandFor(state.ascension.count);
    const nextBand = bandFor(state.ascension.count + 1);
    const shortfall = lumenForNextAether(state) - state.currency.lifetimeLumen;

    return [
      el(
        'div',
        { class: 'ascend__band' },
        el('p', { class: 'ascend__band-label' }, 'Currently at'),
        el('h3', { class: 'ascend__band-name' }, band.name),
        el('p', { class: 'ascend__band-blurb' }, band.blurb),
        state.ascension.count > 0
          ? el(
              'p',
              { class: 'ascend__band-count' },
              `${plural(state.ascension.count, 'ascension')} so far.`,
            )
          : null,
      ),
      el(
        'div',
        { class: 'ascend__offer' },
        el(
          'p',
          { class: 'ascend__offer-lead' },
          ready
            ? 'Ascending now would earn'
            : 'Keep earning Lumen. Ascending will be worth it at',
        ),
        el(
          'p',
          { class: 'ascend__offer-amount num' },
          ready ? `${formatBig(granted)} Aether` : `${formatBig(shortfall)} more Lumen`,
        ),
        el(
          'p',
          { class: 'ascend__offer-note' },
          ready
            ? `The city would rise to the ${nextBand.name}.`
            : 'Aether is worked out from every Lumen you have ever earned, so nothing is ever wasted.',
        ),
        // The one piece of prestige-game wisdom worth stating: a grant smaller
        // than what you already have barely moves your perks, and costs a run.
        ready && state.ascension.aetherEarned > 0
          ? el(
              'p',
              { class: 'ascend__offer-note' },
              granted >= state.ascension.aetherEarned
                ? 'That at least doubles every Aether you have earned — a strong time to go.'
                : `Rule of thumb: ascending pays best once it at least doubles what you have earned (${formatBig(state.ascension.aetherEarned)}).`,
            )
          : null,
        el(
          'button',
          {
            class: ['btn', ready ? 'btn--primary' : 'btn--secondary', 'btn--large'],
            attrs: { type: 'button', disabled: !ready },
            on: { click: () => void onAscend() },
          },
          ready ? 'Ascend' : 'Not yet',
        ),
      ),
    ];
  }

  function perkCard(perk: PerkDef, state: AerieState): HTMLElement {
    const status = perkStatus(perk, state.ascension);
    const locked = status === 'locked';
    const maxed = status === 'maxed';
    const rank = rankOf(state.ascension.perkRanks, perk.id);
    const cost = perkRankCost(perk, rank);
    const needs = perk.requires ? getPerk(perk.requires.id) : undefined;

    return el(
      'article',
      { class: ['perk', `perk--${status}`, rank > 0 && 'perk--owned'] },
      el(
        'div',
        { class: 'perk__head' },
        el('h4', { class: 'perk__name' }, perk.name),
        maxed
          ? el('span', { class: 'badge badge--floor' }, 'Mastered')
          : el(
              'span',
              { class: 'perk__cost num' },
              locked ? el('span', { class: 'perk__lock', html: iconLock() }) : null,
              formatBig(cost),
            ),
      ),
      el('p', { class: 'perk__rank num' }, rankLabel(perk, rank)),
      el(
        'p',
        { class: 'perk__effect' },
        rank > 0
          ? `Now: ${perkEffectLabel(perk.effect, rank)}`
          : `Each rank: ${perkEffectLabel(perk.effect, 1)}`,
      ),
      rank > 0 && !maxed
        ? el(
            'p',
            { class: 'perk__next' },
            `Next rank: ${perkEffectLabel(perk.effect, rank + 1)}`,
          )
        : null,
      el('p', { class: 'perk__flavor' }, perk.flavor),
      maxed
        ? null
        : el(
            'button',
            {
              class: [
                'btn',
                status === 'available' ? 'btn--buy' : 'btn--secondary',
                'btn--block',
              ],
              attrs: { type: 'button', disabled: status !== 'available' },
              on: {
                click: () => {
                  const result = buyPerk(ctx.store, perk.id);
                  ctx.toast(
                    result.ok ? `${perk.name} — rank ${rank + 1}.` : result.reason,
                  );
                },
              },
            },
            locked
              ? `Needs ${needs?.name ?? 'an earlier perk'} rank ${perk.requires?.rank ?? 1}`
              : rank === 0
                ? 'Learn'
                : `Raise to rank ${rank + 1}`,
          ),
    );
  }

  function render(): void {
    const state = ctx.store.getState();
    replaceChildren(summary, ...summaryContent(state));

    replaceChildren(
      tree,
      el(
        'div',
        { class: 'ascend__wallet' },
        el('span', { class: 'stat__icon', html: iconAether() }),
        el('span', { class: 'num' }, formatBig(state.ascension.aether)),
        ' Aether to spend',
      ),
      ...PERK_BRANCHES.map((branch) =>
        el(
          'section',
          { class: 'perk-branch' },
          el(
            'header',
            { class: 'perk-branch__head' },
            el('h3', { class: 'perk-branch__name' }, branch.name),
            el('p', { class: 'perk-branch__blurb' }, branch.blurb),
          ),
          el(
            'div',
            { class: 'perk-branch__grid' },
            ...perksInBranch(branch.id).map((perk) => perkCard(perk, state)),
          ),
        ),
      ),
    );
  }

  render();
  const unsubscribe = ctx.store.subscribe(render);

  return { el: root, destroy: unsubscribe };
}

export { ALTITUDE_BANDS };
