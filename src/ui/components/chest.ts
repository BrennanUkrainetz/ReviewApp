/**
 * The reward chest — the payoff at the end of every review.
 *
 * Deliberately short and skill-free: shake, crack of light, burst, contents.
 * It runs twice a day, so anticipation is the whole design goal; anything
 * longer would become the chore it's meant to offset.
 */
import { getAchievement } from '@/config/achievements';
import { getContract } from '@/config/contracts';
import { getWeekly } from '@/config/weekly';
import { getCosmetic } from '@/config/shop';
import type { ReviewOutcome } from '@/state/actions';
import type { Store } from '@/state/store';
import { formatBig } from '@/domain/bignum';
import { append, el, svg } from '../dom';
import { iconCinder } from '../icons';
import { motionDuration, wait } from '../motion';

const SHAKE_MS = 900;
const BURST_MS = 620;

/**
 * Chest artwork.
 *
 * The lid hinges from the back-left corner, and the escaping light is a
 * gradient plume that fades to nothing — a flat shape here reads as a slab
 * rather than as light.
 */
function chestArt(): SVGSVGElement {
  const defs = svg(
    'defs',
    {},
    svg(
      'linearGradient',
      { id: 'chest-plume', x1: '0', y1: '1', x2: '0', y2: '0' },
      svg('stop', {
        offset: '0%',
        'stop-color': 'var(--chest-beam)',
        'stop-opacity': '0.95',
      }),
      svg('stop', {
        offset: '55%',
        'stop-color': 'var(--chest-beam)',
        'stop-opacity': '0.35',
      }),
      svg('stop', {
        offset: '100%',
        'stop-color': 'var(--chest-beam)',
        'stop-opacity': '0',
      }),
    ),
    svg(
      'radialGradient',
      { id: 'chest-mouth' },
      svg('stop', {
        offset: '0%',
        'stop-color': 'var(--chest-beam)',
        'stop-opacity': '0.95',
      }),
      svg('stop', {
        offset: '100%',
        'stop-color': 'var(--chest-beam)',
        'stop-opacity': '0',
      }),
    ),
    svg(
      'filter',
      { id: 'chest-soften', x: '-40%', y: '-40%', width: '180%', height: '180%' },
      svg('feGaussianBlur', { stdDeviation: '2.4' }),
    ),
  );

  const lid = svg(
    'g',
    { class: 'chest__lid' },
    svg('path', {
      d: 'M18 62 A54 54 0 0 1 126 62 Z',
      fill: 'var(--chest-body)',
      stroke: 'var(--chest-edge)',
      'stroke-width': 3,
    }),
    svg('path', {
      d: 'M18 62 A54 54 0 0 1 126 62',
      fill: 'none',
      stroke: 'var(--chest-trim)',
      'stroke-width': 4,
    }),
    svg('rect', {
      x: 64,
      y: 26,
      width: 16,
      height: 36,
      rx: 3,
      fill: 'var(--chest-trim)',
    }),
  );

  const light = svg(
    'g',
    { class: 'chest__light' },
    svg('path', {
      d: 'M28 66 L116 66 L98 -18 L46 -18 Z',
      fill: 'url(#chest-plume)',
      filter: 'url(#chest-soften)',
    }),
    svg('ellipse', { cx: 72, cy: 64, rx: 52, ry: 20, fill: 'url(#chest-mouth)' }),
  );

  // Sparks thrown out of the chest, each on its own delay.
  const sparks = svg('g', { class: 'chest__sparks' });
  const spread = [-46, -26, -4, 22, 44];
  spread.forEach((dx, index) => {
    sparks.appendChild(
      svg('circle', {
        cx: 72 + dx,
        cy: 62,
        r: index % 2 === 0 ? 3 : 2,
        fill: 'var(--chest-beam)',
        class: 'chest__spark',
        style: `--spark-index:${index}; --spark-dx:${dx * 0.5}px`,
      }),
    );
  });

  return svg(
    'svg',
    { viewBox: '0 0 144 132', class: 'chest__art', 'aria-hidden': 'true' },
    defs,
    svg('ellipse', { cx: 72, cy: 122, rx: 46, ry: 8, fill: 'rgb(4 12 28 / 45%)' }),
    light,
    svg('rect', {
      x: 18,
      y: 62,
      width: 108,
      height: 50,
      rx: 6,
      fill: 'var(--chest-body)',
      stroke: 'var(--chest-edge)',
      'stroke-width': 3,
    }),
    svg('rect', { x: 18, y: 70, width: 108, height: 7, fill: 'var(--chest-trim)' }),
    svg('rect', {
      x: 62,
      y: 74,
      width: 20,
      height: 20,
      rx: 4,
      fill: 'var(--chest-trim)',
    }),
    svg('circle', { cx: 72, cy: 84, r: 4, fill: 'var(--chest-body)' }),
    lid,
    sparks,
  );
}

/**
 * One payout line. A `crit` row is a bonus that landed on top of the ordinary
 * review payout — a milestone or a contract — and gets the emphasis to match:
 * the number pops and wears a "Critical" tag, so a rare payout reads as one.
 */
function lumenRow(
  label: string,
  amount: number,
  opts: { muted?: boolean; crit?: boolean } = {},
): HTMLElement {
  return el(
    'li',
    {
      class: [
        'chest-loot__row',
        opts.muted && 'chest-loot__row--muted',
        opts.crit && 'chest-loot__row--crit',
      ],
    },
    el(
      'span',
      { class: 'chest-loot__label' },
      label,
      opts.crit ? el('span', { class: 'chest-loot__crit-tag' }, 'Critical') : null,
    ),
    el('span', { class: 'num chest-loot__amount' }, `+${formatBig(amount)}`),
  );
}

export interface ChestSequence {
  el: HTMLElement;
  destroy(): void;
}

export interface ChestOptions {
  store: Store;
  outcome: ReviewOutcome;
  /** Called when the player dismisses the reward. */
  onDone(): void;
  /** Called after opening, when the reward is a real-world milestone. */
  onMilestone?(): void;
}

export function createChestSequence({
  store,
  outcome,
  onDone,
  onMilestone,
}: ChestOptions): ChestSequence {
  const { reward } = outcome;
  const art = chestArt();
  let opened = false;

  const hint = el('p', { class: 'chest__hint' }, 'Tap the chest to open it');

  const loot = el('div', { class: 'chest-loot', attrs: { hidden: true } });

  const openButton = el(
    'button',
    {
      class: 'chest__button',
      attrs: { type: 'button', 'aria-label': 'Open the reward chest' },
      on: { click: () => void open() },
    },
    art as unknown as HTMLElement,
  );

  const root = el(
    'div',
    { class: 'chest', dataset: { kind: reward.chest } },
    el('p', { class: 'section-label chest__eyebrow' }, chestName(reward.chest)),
    openButton,
    hint,
    loot,
  );

  async function open(): Promise<void> {
    if (opened) return;
    opened = true;
    openButton.disabled = true;
    hint.remove();

    root.classList.add('chest--shaking');
    await wait(motionDuration(store, SHAKE_MS));

    root.classList.remove('chest--shaking');
    root.classList.add('chest--open');
    await wait(motionDuration(store, BURST_MS));

    revealLoot();
    if (reward.milestone?.kind === 'big') onMilestone?.();
  }

  function revealLoot(): void {
    const cosmetic = reward.cosmeticId ? getCosmetic(reward.cosmeticId) : null;
    const earned = outcome.earnedAchievements
      .map((id) => getAchievement(id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const contract = reward.contractId ? getContract(reward.contractId) : null;

    const rows = el('ul', { class: 'chest-loot__rows' });
    rows.appendChild(lumenRow('Review payout', reward.reviewLumen));
    if (reward.bonusLumen > 0) {
      rows.appendChild(
        lumenRow(
          reward.milestone?.kind === 'big' ? 'Milestone bonus' : 'Streak bonus',
          reward.bonusLumen,
          { crit: true },
        ),
      );
    }
    if (contract && reward.contractLumen > 0) {
      rows.appendChild(
        lumenRow(`Contract · ${contract.name}`, reward.contractLumen, { crit: true }),
      );
    }
    const weekly = reward.weeklyId ? getWeekly(reward.weeklyId) : null;
    if (weekly && reward.weeklyLumen > 0) {
      rows.appendChild(
        lumenRow(`Expedition · ${weekly.name}`, reward.weeklyLumen, { crit: true }),
      );
    }

    loot.removeAttribute('hidden');
    append(loot, [
      el('p', { class: 'chest-loot__total num' }, `+${formatBig(reward.totalLumen)}`),
      el('p', { class: 'chest-loot__total-label' }, 'Lumen'),
      // Heat multiplies the payout rows, so it is stated above them rather than
      // listed as if it were another additive line.
      reward.heat > 1
        ? el(
            'p',
            { class: 'chest-loot__heat' },
            `Heat ×${reward.heat.toFixed(1)} applied`,
          )
        : null,
      rows,
      // The city's own output is not in this chest — it is accruing in the
      // vault. Said plainly, because a big city with a small chest otherwise
      // looks like something has gone wrong.
      reward.passiveLumen > 0
        ? el(
            'p',
            { class: 'chest-loot__aside' },
            `The city is producing ${formatBig(reward.passiveLumen)} a day, into the vault.`,
          )
        : null,
      // Cinder is a separate currency, so it gets its own line rather than a
      // Lumen row — a full clear is what earns it, which is worth calling out.
      outcome.cinderEarned > 0
        ? el(
            'p',
            { class: 'chest-loot__cinder' },
            el('span', { class: 'chest-loot__cinder-icon', html: iconCinder() }),
            `+${outcome.cinderEarned} Cinder for the full clear`,
          )
        : null,
      outcome.weeklyCinder > 0
        ? el(
            'p',
            { class: 'chest-loot__cinder' },
            el('span', { class: 'chest-loot__cinder-icon', html: iconCinder() }),
            `+${outcome.weeklyCinder} Cinder for the week's expedition`,
          )
        : null,
      earned.length > 0
        ? el(
            'div',
            { class: 'chest-loot__cosmetic' },
            el(
              'p',
              { class: 'section-label' },
              earned.length === 1 ? 'Achievement' : 'Achievements',
            ),
            ...earned.map((entry) =>
              el('p', { class: 'chest-loot__cosmetic-name' }, entry.name),
            ),
          )
        : null,
      cosmetic
        ? el(
            'div',
            { class: 'chest-loot__cosmetic' },
            el('p', { class: 'section-label' }, 'Also found'),
            el('p', { class: 'chest-loot__cosmetic-name' }, cosmetic.name),
            el('p', { class: 'chest-loot__cosmetic-flavor' }, cosmetic.flavor),
            el('p', { class: 'chest-loot__cosmetic-note' }, 'Equipped from the shop.'),
          )
        : null,
      el(
        'button',
        {
          class: 'btn btn--primary btn--block',
          attrs: { type: 'button' },
          on: { click: onDone },
        },
        'Back to the city',
      ),
    ]);

    loot.querySelector<HTMLButtonElement>('.btn')?.focus({ preventScroll: true });
  }

  // Space/Enter opens the chest without needing to hit the target.
  const onKeydown = (event: KeyboardEvent): void => {
    if (!opened && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      void open();
    }
  };
  document.addEventListener('keydown', onKeydown);
  window.requestAnimationFrame(() => openButton.focus({ preventScroll: true }));

  return {
    el: root,
    destroy: () => document.removeEventListener('keydown', onKeydown),
  };
}

function chestName(kind: ReviewOutcome['reward']['chest']): string {
  switch (kind) {
    case 'big-milestone':
      return 'Beacon chest';
    case 'small-milestone':
      return 'Gilded chest';
    default:
      return 'Expedition chest';
  }
}
