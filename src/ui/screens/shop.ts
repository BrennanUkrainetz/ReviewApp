/**
 * The shop: buildings on one tab, cosmetics on the other.
 *
 * Transactions are instant and there is nothing irreversible to confirm —
 * buying is the whole interaction, so it should cost one click.
 */
import { nextLockedPage } from '@/config/islands';
import { COSMETICS, type BuildingDef, type CosmeticDef } from '@/config/shop';
import { BUILDING_MAX_LEVEL } from '@/config/tuning';
import { formatBig, formatMultiplier } from '@/domain/bignum';
import {
  affordableLevels,
  bulkCost,
  cityOutput,
  getBuilding,
  marginalOutput,
  milestoneMultiplier,
  nextLockedBuilding,
  nextMilestone,
  revealedBuildings,
  synergyMultiplier,
  levelMap,
} from '@/domain/economy';
import {
  buyBuilding,
  buyCosmetic,
  equipCosmetic,
  unequipCosmetic,
} from '@/state/actions';
import type { AerieState } from '@/state/types';
import type { AppContext, Screen } from '../context';
import { el, plural, replaceChildren } from '../dom';
import { iconBack } from '../icons';

type Tab = 'buildings' | 'cosmetics';

/** How many levels the buy buttons offer. `'max'` spends everything it can. */
type BuyAmount = 1 | 10 | 'max';

const BUY_AMOUNTS: BuyAmount[] = [1, 10, 'max'];

export function createShopScreen(ctx: AppContext): Screen {
  let tab: Tab = 'buildings';
  let amount: BuyAmount = 1;

  const grid = el('div', { class: 'shop__grid' });
  const summary = el('p', { class: 'shop__summary' });

  const tabButton = (id: Tab, label: string): HTMLElement =>
    el(
      'button',
      {
        class: 'tab',
        attrs: { type: 'button', role: 'tab', 'aria-selected': String(tab === id) },
        on: {
          click: () => {
            tab = id;
            render();
          },
        },
      },
      label,
    );

  const tabs = el('div', { class: 'tabs', attrs: { role: 'tablist' } });
  const amountRail = el('div', { class: 'shop__amounts', attrs: { role: 'group' } });

  const root = el(
    'section',
    { class: 'shop' },
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
      el('h2', { class: 'shop__title' }, 'Shop'),
      tabs,
    ),
    summary,
    amountRail,
    grid,
  );

  /**
   * The line under a building that explains where its output actually comes
   * from. Only shown once a bonus is live — an untouched building has nothing
   * to say here, and a card that always shows "×1" teaches nothing.
   */
  function bonusLine(
    def: BuildingDef,
    state: AerieState,
    level: number,
  ): HTMLElement | null {
    const levels = levelMap(state.city.buildings);
    const parts: string[] = [];

    const milestone = milestoneMultiplier(level);
    if (milestone > 1) parts.push(`${formatMultiplier(milestone)} from levels reached`);

    const synergy = synergyMultiplier(def, levels);
    if (def.synergy && synergy > 1) {
      parts.push(`${formatMultiplier(synergy)} from the ${nameOf(def.synergy.from)}`);
    }

    const upcoming = nextMilestone(level);
    if (upcoming && level > 0) {
      parts.push(`doubles again at level ${upcoming}`);
    }

    return parts.length > 0
      ? el('p', { class: 'shop-card__bonus' }, parts.join(' · '))
      : null;
  }

  function buildingCard(def: BuildingDef, state: AerieState): HTMLElement {
    const owned = state.city.buildings.find((entry) => entry.id === def.id);
    const level = owned?.level ?? 0;
    const maxed = level >= BUILDING_MAX_LEVEL;

    // What this button would actually do right now, at the selected amount.
    const wanted = amount === 'max' ? undefined : amount;
    const buyable = affordableLevels(def, level, state.currency.lumen, wanted);
    const quoted = buyable > 0 ? buyable : (wanted ?? 1);
    const cost = bulkCost(def, level, quoted);
    const affordable = buyable > 0;

    const action = maxed
      ? el('span', { class: 'shop-card__owned' }, 'Built as high as it goes')
      : el(
          'button',
          {
            class: ['btn', affordable ? 'btn--buy' : 'btn--secondary', 'btn--block'],
            attrs: { type: 'button', disabled: !affordable },
            on: {
              click: () => {
                const result = buyBuilding(ctx.store, def.id, amount);
                if (!result.ok) {
                  ctx.toast(result.reason);
                } else if (level === 0) {
                  ctx.toast(
                    result.levels === 1
                      ? `${def.name} built.`
                      : `${def.name} built to level ${result.newLevel}.`,
                  );
                } else {
                  ctx.toast(
                    `${def.name} · ${plural(result.levels, 'level')} → ${result.newLevel}.`,
                  );
                }
              },
            },
          },
          el(
            'span',
            { class: 'shop-card__price' },
            el('span', { class: 'num' }, formatBig(cost)),
          ),
          level === 0 ? 'Build' : `Upgrade ×${quoted}`,
        );

    const gain = marginalOutput(def, state.city.buildings);

    return el(
      'article',
      { class: ['shop-card', level > 0 && 'shop-card--owned'] },
      el(
        'div',
        { class: 'shop-card__head' },
        el('h3', { class: 'shop-card__name' }, def.name),
        level > 0 ? el('span', { class: 'badge badge--floor' }, `Level ${level}`) : null,
      ),
      el('p', { class: 'shop-card__flavor' }, def.flavor),
      el(
        'p',
        { class: 'shop-card__stat' },
        el('span', { class: 'num' }, `+${formatBig(gain)}`),
        // Deliberately "your city", not "this building": the figure includes
        // what the next level feeds into its synergy partners, which is often
        // most of it and is the whole reason to spread purchases around.
        ' to your city per review day, for the next level',
      ),
      bonusLine(def, state, level),
      action,
    );
  }

  function cosmeticCard(def: CosmeticDef, state: AerieState): HTMLElement {
    const unlocked = state.city.cosmetics.unlocked.includes(def.id);
    const equipped = state.city.cosmetics.equipped.includes(def.id);
    const affordable = state.currency.lumen >= def.cost;

    const action = !unlocked
      ? el(
          'button',
          {
            class: ['btn', affordable ? 'btn--buy' : 'btn--secondary', 'btn--block'],
            attrs: { type: 'button', disabled: !affordable },
            on: {
              click: () => {
                const result = buyCosmetic(ctx.store, def.id);
                ctx.toast(result.ok ? `${def.name} equipped.` : result.reason);
              },
            },
          },
          el(
            'span',
            { class: 'shop-card__price' },
            el('span', { class: 'num' }, formatBig(def.cost)),
          ),
          'Buy',
        )
      : el(
          'button',
          {
            class: ['btn', equipped ? 'btn--secondary' : 'btn--buy', 'btn--block'],
            attrs: { type: 'button' },
            on: {
              click: () => {
                if (equipped) {
                  unequipCosmetic(ctx.store, def.id);
                  ctx.toast(`${def.name} put away.`);
                } else {
                  equipCosmetic(ctx.store, def.id);
                  ctx.toast(`${def.name} equipped.`);
                }
              },
            },
          },
          equipped ? 'Equipped · remove' : 'Equip',
        );

    return el(
      'article',
      {
        class: [
          'shop-card',
          unlocked && 'shop-card--owned',
          equipped && 'shop-card--equipped',
        ],
      },
      el(
        'div',
        { class: 'shop-card__head' },
        el('h3', { class: 'shop-card__name' }, def.name),
        el('span', { class: 'badge' }, SLOT_LABELS[def.slot]),
      ),
      el('p', { class: 'shop-card__flavor' }, def.flavor),
      action,
    );
  }

  const amountButton = (value: BuyAmount): HTMLElement =>
    el(
      'button',
      {
        class: ['chip', amount === value && 'chip--active'],
        attrs: { type: 'button', 'aria-pressed': String(amount === value) },
        on: {
          click: () => {
            amount = value;
            render();
          },
        },
      },
      value === 'max' ? 'Max' : `×${value}`,
    );

  /**
   * One carrot under the grid, never a wall of them. An earnable tier is quoted
   * by its Lumen price; when those run out but higher islands remain, the carrot
   * becomes the next altitude to ascend to instead.
   */
  function lockedLine(state: AerieState): HTMLElement | null {
    const next = nextLockedBuilding(
      state.city.buildings,
      state.currency.lifetimeLumen,
      state.ascension.count,
    );
    if (next) {
      return el(
        'p',
        { class: 'shop__locked' },
        'Next to unlock: ',
        el('strong', {}, next.name),
        ', once you have earned ',
        el('span', { class: 'num' }, formatBig(next.baseCost * 0.4)),
        ' Lumen in total.',
      );
    }

    const higher = nextLockedPage(state.ascension.count);
    if (!higher) return null;
    return el(
      'p',
      { class: 'shop__locked' },
      'Higher tiers wait above the cloud shelf — ascend into ',
      el('strong', {}, higher.name),
      ' to build there.',
    );
  }

  function render(): void {
    const state = ctx.store.getState();

    replaceChildren(
      tabs,
      tabButton('buildings', 'Buildings'),
      tabButton('cosmetics', 'Cosmetics'),
    );

    if (tab === 'buildings') {
      const output = cityOutput(state.city.buildings);
      summary.textContent =
        output > 0
          ? `Your city pays ${formatBig(output)} Lumen on days you complete a review.`
          : 'Buildings pay out on days you complete a review — and only on those days.';
      replaceChildren(amountRail, ...BUY_AMOUNTS.map(amountButton));
      amountRail.hidden = false;
      const shown = revealedBuildings(
        state.city.buildings,
        state.currency.lifetimeLumen,
        state.ascension.count,
      );
      replaceChildren(
        grid,
        ...shown.map((def) => buildingCard(def, state)),
        lockedLine(state),
      );
    } else {
      amountRail.hidden = true;
      const owned = state.city.cosmetics.unlocked.length;
      summary.textContent = `${owned} of ${COSMETICS.length} found. Purely visual — chests drop these too.`;
      replaceChildren(grid, ...COSMETICS.map((def) => cosmeticCard(def, state)));
    }
  }

  render();
  const unsubscribe = ctx.store.subscribe(render);

  return { el: root, destroy: unsubscribe };
}

/** Building name for a synergy reference, falling back to the raw id. */
function nameOf(id: string): string {
  return getBuilding(id)?.name ?? id;
}

const SLOT_LABELS: Record<CosmeticDef['slot'], string> = {
  lanterns: 'Lanterns',
  skyline: 'Cloudbank',
  companion: 'Companion',
  banner: 'Banner',
};
