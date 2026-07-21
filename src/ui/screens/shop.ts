/**
 * The shop: buildings on one tab, cosmetics on the other.
 *
 * Transactions are instant and there is nothing irreversible to confirm —
 * buying is the whole interaction, so it should cost one click.
 */
import {
  BUILDINGS,
  buildingCost,
  COSMETICS,
  type BuildingDef,
  type CosmeticDef,
} from '@/config/shop';
import { passiveIncome } from '@/domain/rewards';
import { buyBuilding, buyCosmetic, equipCosmetic, unequipCosmetic } from '@/state/actions';
import type { AerieState } from '@/state/types';
import type { AppContext, Screen } from '../context';
import { el, formatNumber, replaceChildren } from '../dom';
import { iconBack, iconCheck } from '../icons';

type Tab = 'buildings' | 'cosmetics';

export function createShopScreen(ctx: AppContext): Screen {
  let tab: Tab = 'buildings';

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
    grid,
  );

  function buildingCard(def: BuildingDef, state: AerieState): HTMLElement {
    const owned = state.city.buildings.find((entry) => entry.id === def.id);
    const level = owned?.level ?? 0;
    const maxed = level >= def.maxLevel;
    const cost = buildingCost(def, level);
    const affordable = state.currency.lumen >= cost;

    const action = maxed
      ? el(
          'span',
          { class: 'shop-card__owned' },
          el('span', { class: 'review-card__icon', html: iconCheck() }),
          'Fully built',
        )
      : el(
          'button',
          {
            class: ['btn', affordable ? 'btn--buy' : 'btn--secondary', 'btn--block'],
            attrs: { type: 'button', disabled: !affordable },
            on: {
              click: () => {
                const result = buyBuilding(ctx.store, def.id);
                if (result.ok) {
                  ctx.toast(
                    level === 0 ? `${def.name} built.` : `${def.name} upgraded to level ${level + 1}.`,
                  );
                } else {
                  ctx.toast(result.reason);
                }
              },
            },
          },
          el('span', { class: 'shop-card__price' }, el('span', { class: 'num' }, formatNumber(cost))),
          level === 0 ? 'Build' : 'Upgrade',
        );

    return el(
      'article',
      { class: ['shop-card', level > 0 && 'shop-card--owned'] },
      el(
        'div',
        { class: 'shop-card__head' },
        el('h3', { class: 'shop-card__name' }, def.name),
        level > 0
          ? el('span', { class: 'badge badge--floor' }, `Level ${level}/${def.maxLevel}`)
          : null,
      ),
      el('p', { class: 'shop-card__flavor' }, def.flavor),
      el(
        'p',
        { class: 'shop-card__stat' },
        el('span', { class: 'num' }, `+${def.incomePerLevel * Math.max(level, 1)}`),
        level > 0 ? ' Lumen per review day' : ' Lumen per review day at level 1',
      ),
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
          el('span', { class: 'shop-card__price' }, el('span', { class: 'num' }, formatNumber(def.cost))),
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
      { class: ['shop-card', unlocked && 'shop-card--owned', equipped && 'shop-card--equipped'] },
      el(
        'div',
        { class: 'shop-card__head' },
        el('h3', { class: 'shop-card__name' }, def.name),
        el('span', { class: 'badge' }, SLOT_LABELS[def.slot]),
      ),
      el('p', { class: 'shop-card__flavor' }, def.flavor),
      el('p', { class: 'shop-card__stat shop-card__stat--muted' }, 'Visual only.'),
      action,
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
      const income = passiveIncome(state.city.buildings);
      summary.textContent =
        income > 0
          ? `Your city pays ${income} Lumen on days you complete a review.`
          : 'Buildings pay a small Lumen trickle on days you complete a review.';
      replaceChildren(grid, ...BUILDINGS.map((def) => buildingCard(def, state)));
    } else {
      const owned = state.city.cosmetics.unlocked.length;
      summary.textContent = `${owned} of ${COSMETICS.length} found. Chests drop these too.`;
      replaceChildren(grid, ...COSMETICS.map((def) => cosmeticCard(def, state)));
    }
  }

  render();
  const unsubscribe = ctx.store.subscribe(render);

  return { el: root, destroy: unsubscribe };
}

const SLOT_LABELS: Record<CosmeticDef['slot'], string> = {
  lanterns: 'Lanterns',
  skyline: 'Cloudbank',
  companion: 'Companion',
  banner: 'Banner',
};
