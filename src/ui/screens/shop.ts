/**
 * The shop: buildings on one tab, cosmetics on the other.
 *
 * Transactions are instant and there is nothing irreversible to confirm —
 * buying is the whole interaction, so it should cost one click.
 */
import { nextLockedPage } from '@/config/islands';
import {
  COSMETICS,
  type BuildingDef,
  type CosmeticDef,
  type SpecialtyDef,
} from '@/config/shop';
import { BUILDING_MAX_LEVEL } from '@/config/tuning';
import { achievementMultiplier } from '@/domain/achievements';
import { modsFor, modsFromPerks, type Mods } from '@/domain/ascension';
import { formatBig, formatMultiplier } from '@/domain/bignum';
import {
  charterOutputMultiplier,
  charterProgress,
  type CharterProgress,
} from '@/domain/charter';
import {
  affordableLevels,
  bestBuy,
  bulkCost,
  cityOutput,
  districtMultiplier,
  getBuilding,
  levelCeiling,
  marginalOutput,
  milestoneMultiplier,
  nextLockedBuilding,
  nextMilestone,
  paybackDays,
  revealedBuildings,
  synergyMultiplier,
  levelMap,
} from '@/domain/economy';
import {
  nextSpecialtyLevel,
  specialtyMultiplies,
  specialtySteps,
  specialtyValue,
} from '@/domain/specialties';
import {
  buyBuilding,
  buyCharter,
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
  const summary = el('div', { class: 'shop__summary' });

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
   * Payback, written the way a player weighs it.
   *
   * This is the figure that makes the board comparable. A raw `+196` beside a
   * `+22.0K` says nothing about which is the better buy until you know what
   * each cost — and since payback depends on a building's *level* far more than
   * on its tier, it is also the number that explains why the cheap old tier and
   * the shiny new one are not the same purchase.
   */
  function paybackLine(
    def: BuildingDef,
    state: AerieState,
    count: number,
    mods: Mods,
  ): HTMLElement | null {
    const days = paybackDays(def, state.city.buildings, count, mods);
    if (!Number.isFinite(days)) return null;

    const rounded = days < 10 ? Math.round(days * 10) / 10 : Math.round(days);
    return el(
      'p',
      { class: ['shop-card__payback', days <= 10 && 'shop-card__payback--good'] },
      el('span', { class: 'num' }, String(rounded)),
      ` review ${rounded === 1 ? 'day' : 'days'} to pay for itself`,
    );
  }

  /**
   * A specialty, stated as what it is worth now and what the next step costs.
   *
   * Always shown, even at zero steps — unlike the multiplier line, this one has
   * something to say about a building you have never touched, and it is the
   * whole reason to prefer one tier over another once payback has stopped
   * telling them apart.
   */
  function specialtyLine(def: BuildingDef, level: number): HTMLElement {
    const { specialty } = def;
    const steps = specialtySteps(level);
    const upcoming = nextSpecialtyLevel(level);

    const now =
      steps > 0
        ? `${formatSpecialty(specialty, specialtyValue(specialty, level))} ${specialty.label}`
        : specialty.label;

    return el(
      'p',
      { class: ['shop-card__specialty', steps > 0 && 'shop-card__specialty--live'] },
      steps > 0 ? now : `Levelling this improves ${now}`,
      upcoming
        ? el(
            'span',
            { class: 'shop-card__range' },
            steps > 0 ? ` · next at level ${upcoming}` : ` — first step at level ${upcoming}`,
          )
        : null,
    );
  }

  /**
   * The line under a building that explains where *its own* output comes from.
   * Only shown once a bonus is live — an untouched building has nothing to say
   * here, and a card that always shows "×1" teaches nothing.
   *
   * Led with "This building" on purpose: every multiplier named here applies to
   * this tier alone. The ones that lift the whole city are quoted once, above
   * the grid, so the two can never be read as the same number.
   */
  function bonusLine(
    def: BuildingDef,
    state: AerieState,
    level: number,
  ): HTMLElement | null {
    const levels = levelMap(state.city.buildings);
    const parts: string[] = [];

    const milestone = milestoneMultiplier(level);
    if (milestone > 1) {
      parts.push(`${formatMultiplier(milestone)} from its own milestone levels`);
    }

    const synergy = synergyMultiplier(def, levels);
    if (def.synergy && synergy > 1) {
      parts.push(`${formatMultiplier(synergy)} from the ${nameOf(def.synergy.from)}`);
    }

    const upcoming = nextMilestone(level);
    if (upcoming && level > 0) {
      parts.push(`doubles again at level ${upcoming}`);
    }

    return parts.length > 0
      ? el('p', { class: 'shop-card__bonus' }, `This building: ${parts.join(' · ')}`)
      : null;
  }

  /**
   * Exactly which levels the quoted figures cover. The old copy said "for the
   * next level" whatever the buy amount was selected, which was wrong for ×10
   * and meaningless for Max — the number beside it has always been the total
   * for the whole purchase.
   */
  function purchaseRange(level: number, count: number): string {
    if (level === 0) {
      return count === 1 ? 'for the first level' : `for the first ${count} levels`;
    }
    return count === 1
      ? `for level ${level} → ${level + 1}`
      : `for ${plural(count, 'level')} · ${level} → ${level + count}`;
  }

  function buildingCard(
    def: BuildingDef,
    state: AerieState,
    mods: Mods,
    best: BuildingDef | null,
  ): HTMLElement {
    const owned = state.city.buildings.find((entry) => entry.id === def.id);
    const level = owned?.level ?? 0;
    const ceiling = levelCeiling(mods);
    const maxed = level >= BUILDING_MAX_LEVEL;
    // Held at the charter's ceiling rather than the hard cap: a different state
    // with a different remedy, and one the card has to name or the player goes
    // looking for Lumen that will not help.
    const chartered = !maxed && level >= ceiling;

    // What this button would actually do right now, at the selected amount.
    // Unaffordable amounts still quote a price, so the card shows what it would
    // take — clamped to the levels the building actually has left.
    const headroom = Math.max(0, ceiling - level);
    const wanted = amount === 'max' ? undefined : Math.min(amount, headroom);
    const buyable = affordableLevels(def, level, state.currency.lumen, wanted, mods);
    const quoted = buyable > 0 ? buyable : Math.min(wanted ?? 1, headroom);
    const cost = bulkCost(def, level, quoted, mods);
    const affordable = buyable > 0;

    const action = maxed
      ? el('span', { class: 'shop-card__owned' }, 'Built as high as it goes')
      : chartered
        ? el(
            'span',
            { class: 'shop-card__owned shop-card__owned--held' },
            `Held at the charter's ceiling of ${ceiling}`,
          )
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

    // The total for the whole purchase, not one level times the count: a ×10
    // that crosses a milestone is worth more than ten single levels, and that
    // is exactly the moment the player wants to see it.
    const gain = marginalOutput(def, state.city.buildings, quoted, mods);

    return el(
      'article',
      { class: ['shop-card', level > 0 && 'shop-card--owned'] },
      el(
        'div',
        { class: 'shop-card__head' },
        el('h3', { class: 'shop-card__name' }, def.name),
        best?.id === def.id
          ? el('span', { class: 'badge badge--best' }, 'Best buy')
          : null,
        level > 0 ? el('span', { class: 'badge badge--floor' }, `Level ${level}`) : null,
      ),
      el('p', { class: 'shop-card__flavor' }, def.flavor),
      maxed || chartered
        ? null
        : el(
            'p',
            { class: 'shop-card__stat' },
            el('span', { class: 'num' }, `+${formatBig(gain)}`),
            // Deliberately "your city", not "this building": the figure includes
            // what these levels feed into their synergy partners, which is often
            // most of it and is the whole reason to spread purchases around.
            ' to your city per review day ',
            el('span', { class: 'shop-card__range' }, purchaseRange(level, quoted)),
          ),
      maxed || chartered ? null : paybackLine(def, state, quoted, mods),
      specialtyLine(def, level),
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

  /**
   * The Hearth Hall — the charter card, at the head of the grid.
   *
   * It sits above the ladder rather than in it because it is not a rung: it
   * pays no Lumen of its own, and what it sells is *permission*. The card leads
   * with the ceiling for that reason — the number a player is actually blocked
   * by — and states the breadth requirement in full whether or not it is met,
   * since watching `standing` climb toward `kinds` is what makes the next
   * charter feel like something to aim at rather than a wall.
   */
  function charterCard(progress: CharterProgress): HTMLElement {
    const { level, ceiling, output, next, requirement, standing, cost, met, affordable } =
      progress;

    const action =
      next === null || requirement === null
        ? el(
            'span',
            { class: 'shop-card__owned' },
            'Chartered as broadly as it goes',
          )
        : el(
            'button',
            {
              class: ['btn', affordable ? 'btn--buy' : 'btn--secondary', 'btn--block'],
              attrs: { type: 'button', disabled: !affordable },
              on: {
                click: () => {
                  const result = buyCharter(ctx.store);
                  ctx.toast(
                    result.ok
                      ? `Charter ${result.level}. Every building may now reach level ${result.ceiling}.`
                      : result.reason,
                  );
                },
              },
            },
            el(
              'span',
              { class: 'shop-card__price' },
              el('span', { class: 'num' }, formatBig(cost)),
            ),
            `Raise to charter ${next}`,
          );

    return el(
      'article',
      { class: ['shop-card', 'shop-card--charter', met && 'shop-card--charter-ready'] },
      el(
        'div',
        { class: 'shop-card__head' },
        el('h3', { class: 'shop-card__name' }, 'Hearth Hall'),
        el('span', { class: 'badge badge--floor' }, `Charter ${level}`),
      ),
      el(
        'p',
        { class: 'shop-card__flavor' },
        'The oldest roof on the island, and the one that decides how high the rest may go.',
      ),
      el(
        'p',
        { class: 'shop-card__stat' },
        'Every building may be raised to level ',
        el('span', { class: 'num' }, String(ceiling)),
        output > 1 ? ` · ${formatMultiplier(output)} to the whole city` : '',
      ),
      requirement
        ? el(
            'p',
            {
              class: [
                'shop-card__requirement',
                met && 'shop-card__requirement--met',
              ],
            },
            met ? 'Ready: ' : 'Needs ',
            el('span', { class: 'num' }, String(requirement.kinds)),
            ` kinds of building at level ${requirement.atLevel} `,
            el(
              'span',
              { class: 'shop-card__range' },
              `· ${standing} standing`,
            ),
          )
        : null,
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

  /**
   * The multipliers that lift *every* building at once, quoted in one place
   * above the grid. Without this the per-card "×4" reads as though it might be
   * city-wide; with it, the card line and this line divide the whole
   * calculation between them.
   */
  function cityMultipliers(state: AerieState): HTMLElement | null {
    const levels = levelMap(state.city.buildings);
    const parts: string[] = [];

    const standing = [...levels.values()].filter((level) => level > 0).length;
    const district = districtMultiplier(levels);
    if (district > 1) {
      parts.push(
        `${formatMultiplier(district)} for ${plural(standing, 'kind')} standing`,
      );
    }

    const charter = charterOutputMultiplier(state.city.charter);
    if (charter > 1) parts.push(`${formatMultiplier(charter)} from the city charter`);

    const perks = modsFromPerks(state.ascension.perks).output;
    if (perks > 1) parts.push(`${formatMultiplier(perks)} from ascension perks`);

    const achievements = achievementMultiplier(state.achievements);
    if (achievements > 1) {
      parts.push(`${formatMultiplier(achievements)} from achievements`);
    }

    if (parts.length === 0) return null;
    return el(
      'p',
      { class: 'shop__multipliers' },
      `Every building: ${parts.join(' · ')}`,
    );
  }

  function render(): void {
    const state = ctx.store.getState();
    const mods = modsFor(state);

    replaceChildren(
      tabs,
      tabButton('buildings', 'Buildings'),
      tabButton('cosmetics', 'Cosmetics'),
    );

    if (tab === 'buildings') {
      const output = cityOutput(state.city.buildings, mods);
      replaceChildren(
        summary,
        el(
          'p',
          {},
          output > 0
            ? `Your city pays ${formatBig(output)} Lumen on days you complete a review.`
            : 'Buildings pay out on days you complete a review — and only on those days.',
        ),
        cityMultipliers(state),
        // The single sentence that makes the grid legible. Without it the cheap
        // old tier quoting a hundred-day payback beside a new one quoting two
        // looks like a balance bug rather than the ladder working.
        el(
          'p',
          { class: 'shop__note' },
          'What a level costs depends on how high the building already is, not on which building it is — so a tier is only cheap while it is low.',
        ),
      );
      replaceChildren(amountRail, ...BUY_AMOUNTS.map(amountButton));
      amountRail.hidden = false;
      const shown = revealedBuildings(
        state.city.buildings,
        state.currency.lifetimeLumen,
        state.ascension.count,
      );
      const wanted = amount === 'max' ? BUILDING_MAX_LEVEL : amount;
      const best = bestBuy(
        shown,
        state.city.buildings,
        state.currency.lumen,
        wanted,
        mods,
      );
      const progress = charterProgress(
        state.city.buildings,
        state.city.charter,
        output,
        state.currency.lumen,
      );
      replaceChildren(
        grid,
        charterCard(progress),
        ...shown.map((def) => buildingCard(def, state, mods, best)),
        lockedLine(state),
      );
    } else {
      amountRail.hidden = true;
      const owned = state.city.cosmetics.unlocked.length;
      replaceChildren(
        summary,
        el(
          'p',
          {},
          `${owned} of ${COSMETICS.length} found. Purely visual — chests drop these too.`,
        ),
      );
      replaceChildren(grid, ...COSMETICS.map((def) => cosmeticCard(def, state)));
    }
  }

  render();
  const unsubscribe = ctx.store.subscribe(render);

  return { el: root, destroy: unsubscribe };
}

/**
 * A specialty's current worth, in the units a player reads it in.
 *
 * Three shapes, because three shapes is what the effects genuinely are: a
 * multiplier for the compounding kinds, a percentage for the two that are
 * chances or shares, and a plain count for the rest. Mote charges floor, since
 * half a mote is not a thing the field can hand you.
 */
function formatSpecialty(specialty: SpecialtyDef, value: number): string {
  if (specialtyMultiplies(specialty.kind)) return formatMultiplier(value);
  if (specialty.kind === 'drop' || specialty.kind === 'idle-share') {
    return `+${Math.round(value * 100)}%`;
  }
  if (specialty.kind === 'mote-charges') return `+${Math.floor(value)}`;
  return `+${formatBig(value)}`;
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
