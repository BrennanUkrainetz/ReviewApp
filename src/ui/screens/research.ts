/**
 * The Workshop — where Cinder is spent.
 *
 * The mirror of Ascension: same shape, different currency. Aether buys what the
 * city is worth; Cinder buys what the vault will do for you. Most nodes change
 * a rule rather than a number, so each card states the rule in plain words from
 * its effect data — there is no separate copy to drift out of sync.
 */
import { RESEARCH_BRANCHES, researchInBranch, type ResearchDef } from '@/config/research';
import { KILN_CINDER_PER_AETHER } from '@/config/tuning';
import { formatBig } from '@/domain/bignum';
import { nextResearch, researchStatus, type ResearchStatus } from '@/domain/research';
import { buyResearch, fireKiln } from '@/state/actions';
import type { AerieState } from '@/state/types';
import type { AppContext, Screen } from '../context';
import { el, plural, replaceChildren } from '../dom';
import { iconAether, iconBack, iconCinder, iconLock } from '../icons';

/** How the day earns Cinder, stated once at the top so the tree has a source. */
const CINDER_SOURCE =
  'Cinder comes from full-cleared reviews — more when both land in a day, more again on a long heat streak. A floor pass earns none.';

const STATUS_LABEL: Record<ResearchStatus, string> = {
  owned: 'Done',
  available: 'Research',
  unaffordable: 'Research',
  locked: 'Needs an earlier one',
};

export function createResearchScreen(ctx: AppContext): Screen {
  const wallet = el('div', { class: 'ascend__wallet' });
  const source = el('p', { class: 'workshop__source' }, CINDER_SOURCE);
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
      el('h2', { class: 'shop__title' }, 'Workshop'),
      el('span', {}),
    ),
    wallet,
    source,
    tree,
  );

  function researchCard(entry: ResearchDef, state: AerieState): HTMLElement {
    const status = researchStatus(entry, state);
    const locked = status === 'locked';

    return el(
      'article',
      { class: ['perk', `perk--${status}`] },
      el(
        'div',
        { class: 'perk__head' },
        el('h4', { class: 'perk__name' }, entry.name),
        status === 'owned'
          ? el('span', { class: 'badge badge--floor' }, STATUS_LABEL.owned)
          : el(
              'span',
              { class: 'perk__cost num' },
              locked ? el('span', { class: 'perk__lock', html: iconLock() }) : null,
              `${entry.cost}`,
            ),
      ),
      el('p', { class: 'perk__effect' }, entry.detail),
      el('p', { class: 'perk__flavor' }, entry.flavor),
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
                  const result = buyResearch(ctx.store, entry.id);
                  ctx.toast(result.ok ? `${entry.name} researched.` : result.reason);
                },
              },
            },
            STATUS_LABEL[status],
          ),
    );
  }

  /**
   * The kiln: where Cinder goes once there is nothing left to research, or
   * whenever an Aether is worth more to you than the next node. Always shown,
   * so the rate is known long before it matters.
   */
  function kiln(state: AerieState): HTMLElement {
    const batches = Math.floor(state.currency.cinder / KILN_CINDER_PER_AETHER);
    const burn = (count: number): void => {
      const result = fireKiln(ctx.store, count);
      ctx.toast(
        result.ok ? `The kiln gives up ${plural(count, 'Aether')}.` : result.reason,
      );
    };

    return el(
      'section',
      { class: 'perk-branch' },
      el(
        'header',
        { class: 'perk-branch__head' },
        el('h3', { class: 'perk-branch__name' }, 'The Kiln'),
        el(
          'p',
          { class: 'perk-branch__blurb' },
          `Burns ${KILN_CINDER_PER_AETHER} Cinder down into one Aether, to spend on perks. Aether from the kiln never reduces what an ascension pays.`,
        ),
      ),
      el(
        'div',
        { class: 'workshop__kiln' },
        el(
          'button',
          {
            class: ['btn', batches > 0 ? 'btn--buy' : 'btn--secondary'],
            attrs: { type: 'button', disabled: batches <= 0 },
            on: { click: () => burn(1) },
          },
          el('span', { class: 'stat__icon', html: iconAether() }),
          `Fire once · ${KILN_CINDER_PER_AETHER} Cinder`,
        ),
        batches > 1
          ? el(
              'button',
              {
                class: 'btn btn--secondary',
                attrs: { type: 'button' },
                on: { click: () => burn(batches) },
              },
              `Fire ${batches}× · ${formatBig(batches * KILN_CINDER_PER_AETHER)} Cinder`,
            )
          : null,
      ),
    );
  }

  function render(): void {
    const state = ctx.store.getState();
    const next = nextResearch(state);

    replaceChildren(
      wallet,
      el('span', { class: 'stat__icon', html: iconCinder() }),
      el('span', { class: 'num' }, formatBig(state.currency.cinder)),
      ' Cinder to spend',
    );

    replaceChildren(
      tree,
      ...RESEARCH_BRANCHES.map((branch) =>
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
            ...researchInBranch(branch.id).map((entry) => researchCard(entry, state)),
          ),
        ),
      ),
      next
        ? el(
            'p',
            { class: 'workshop__next' },
            `Next within reach: ${next.name}, ${next.cost} Cinder.`,
          )
        : el(
            'p',
            { class: 'workshop__next' },
            'Everything is researched. The kiln takes what you earn from here.',
          ),
      kiln(state),
    );
  }

  render();
  const unsubscribe = ctx.store.subscribe(render);

  return { el: root, destroy: unsubscribe };
}
