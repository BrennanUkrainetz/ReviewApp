/**
 * Ascension — the prestige screen.
 *
 * Two halves: what ascending right now would cost and pay, and the perk tree
 * the Aether goes into. The cost side is stated in full and confirmed, because
 * it is the only genuinely destructive action in the game.
 */
import { ALTITUDE_BANDS, bandFor } from '@/config/ascension';
import { PERK_BRANCHES, perksInBranch, type PerkDef } from '@/config/perks';
import {
  canAscend,
  lumenForNextAether,
  modsFor,
  pendingAether,
  perkStatus,
  type PerkStatus,
} from '@/domain/ascension';
import { formatBig, formatMultiplier } from '@/domain/bignum';
import { ascend, buyPerk } from '@/state/actions';
import type { AerieState } from '@/state/types';
import { confirmDialog } from '../components/confirm';
import type { AppContext, Screen } from '../context';
import { el, plural, replaceChildren } from '../dom';
import { iconAether, iconBack, iconLock } from '../icons';

/** Plain-English description of what a perk does, from its effect data. */
function perkEffectLabel(perk: PerkDef): string {
  const effect = perk.effect;
  switch (effect.kind) {
    case 'output':
      return `${formatMultiplier(effect.factor)} city output`;
    case 'review':
      return `${formatMultiplier(effect.factor)} Lumen from reviews`;
    case 'cost':
      return `Buildings cost ${Math.round((1 - effect.factor) * 100)}% less`;
    case 'streak-cap':
      return `Streak bonus keeps growing for ${plural(effect.extra, 'more day')}`;
    case 'streak-rate':
      return `+${Math.round(effect.extra * 100)}% streak bonus per day`;
    case 'drop':
      return `+${Math.round(effect.bonus * 100)}% cosmetic drop chance`;
    case 'milestone':
      return `${formatMultiplier(effect.factor)} milestone chest bonus`;
    case 'carry-lumen':
      return `Keep ${Math.round(effect.share * 100)}% of your Lumen when you ascend`;
    case 'foothold':
      return `Start each run with the first ${effect.count} buildings at level ${effect.level}`;
  }
}

const STATUS_NOTE: Record<PerkStatus, string> = {
  owned: 'Learned',
  available: '',
  unaffordable: '',
  locked: '',
};

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

    return el(
      'article',
      { class: ['perk', `perk--${status}`] },
      el(
        'div',
        { class: 'perk__head' },
        el('h4', { class: 'perk__name' }, perk.name),
        status === 'owned'
          ? el('span', { class: 'badge badge--floor' }, STATUS_NOTE.owned)
          : el(
              'span',
              { class: 'perk__cost num' },
              locked ? el('span', { class: 'perk__lock', html: iconLock() }) : null,
              `${perk.cost}`,
            ),
      ),
      el('p', { class: 'perk__effect' }, perkEffectLabel(perk)),
      el('p', { class: 'perk__flavor' }, perk.flavor),
      status === 'owned'
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
                  ctx.toast(result.ok ? `${perk.name} learned.` : result.reason);
                },
              },
            },
            locked ? 'Needs an earlier perk' : 'Learn',
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
