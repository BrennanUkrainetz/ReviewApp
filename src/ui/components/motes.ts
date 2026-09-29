/**
 * Golden motes — the drifting payout that opens after a review, and the small
 * chase you have to win to collect it.
 *
 * Rendered as buttons layered over the city rather than inside the SVG. The
 * scene's own note warns that a CSS animation on an SVG node overrides its
 * `transform` attribute; keeping the motes in ordinary DOM sidesteps that
 * entirely, and it makes them focusable and keyboard-activatable for free.
 *
 * There are never more motes on screen than the save has charges, and charges
 * only come from completing a review — so this can't become something to farm
 * instead of doing the work.
 *
 * The game, such as it is:
 *
 *   - Motes drift on their own and bolt away from the cursor as it closes in,
 *     so they have to be cornered or cut off rather than clicked where they sit.
 *   - Catching one scatters the survivors — the field gets harder as it empties.
 *   - Catches inside MOTE_CHAIN_WINDOW_MS chain, and each link pays a step more.
 *     Upside only: letting the chain lapse still pays full base value.
 *
 * Every sprite owns its DOM node for its whole life. A catch removes exactly
 * one node and leaves the rest mid-flight — the field is a simulation the store
 * tops up, not a list re-rendered from state on every change.
 */
import {
  MOTE_CHAIN_MAX,
  MOTE_CHAIN_STEP,
  MOTE_CHAIN_WINDOW_MS,
} from '@/config/tuning';
import { formatBig } from '@/domain/bignum';
import { today } from '@/domain/dates';
import { catchMote } from '@/state/actions';
import type { Store } from '@/state/store';
import { el, replaceChildren } from '../dom';
import { prefersReducedMotion } from '../motion';

export interface MoteFieldHandle {
  el: HTMLElement;
  destroy(): void;
}

/** Never more than this on screen at once, however many charges are banked. */
const MAX_ON_SCREEN = 5;

/**
 * Where a mote may go, as a share of the stage.
 *
 * Kept in the band the islands occupy rather than the whole frame: a glowing
 * disc alone in open sky reads as a second sun, not as something to chase.
 * Near the rooftops it reads as belonging to the city.
 */
const BOUNDS = { left: 0.06, right: 0.94, top: 0.16, bottom: 0.84 };

/** Fallback stage size, for before layout settles (and for jsdom, which has none). */
const FALLBACK = { width: 720, height: 380 };

const CRUISE = 26; // px/s of idle drift
const BURST = 210; // px/s added at the heart of a scare
const FLEE_RADIUS = 132; // px at which a mote notices the cursor
const FLEE_ACCEL = 900; // px/s² pushing it away, at point blank
const SPOOK_FADE = 1.1; // seconds for a startled mote to settle again
const WANDER = 2.4; // radians/s of idle course change
const MAX_STEP = 0.05; // seconds; a backgrounded tab must not teleport them

interface Sprite {
  node: HTMLButtonElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 0–1, how startled: drives both the speed cap and the glow. */
  spook: number;
  /** Phase of the idle wander, so no two drift alike. */
  phase: number;
}

export function createMoteField(
  store: Store,
  onCatch: (lumen: number, multiplier: number) => void,
): MoteFieldHandle {
  const node = el('div', {
    class: 'mote-field',
    attrs: { 'aria-label': 'Motes drifting over the city' },
  });
  // Decorative: the toast is what actually announces a catch.
  const chainTag = el('div', { class: 'mote-chain', attrs: { 'aria-hidden': 'true' } });
  const chainLabel = el('span', { class: 'mote-chain__label' });
  const chainBar = el('span', { class: 'mote-chain__bar' });
  replaceChildren(chainTag, chainLabel, chainBar);
  node.appendChild(chainTag);

  const sprites: Sprite[] = [];
  const pointer = { x: -9999, y: -9999, seen: false };
  let size = { ...FALLBACK };
  let chain = 0;
  let chainUntil = 0;
  let frame = 0;
  let last = 0;

  const still = (): boolean => prefersReducedMotion(store);

  function measure(): void {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) size = { width: rect.width, height: rect.height };
  }

  const box = () => ({
    minX: size.width * BOUNDS.left,
    maxX: size.width * BOUNDS.right,
    minY: size.height * BOUNDS.top,
    maxY: size.height * BOUNDS.bottom,
  });

  /* --------------------------------------------------------------- */
  /* Sprites                                                          */
  /* --------------------------------------------------------------- */

  function spawn(): void {
    const b = box();
    const angle = Math.random() * Math.PI * 2;
    const sprite: Sprite = {
      node: el('button', {
        class: 'mote',
        attrs: {
          type: 'button',
          'aria-label': 'Catch the mote',
          title: 'Catch the mote',
        },
      }),
      // Spawn away from wherever the cursor is resting, so nothing is caught
      // by accident the instant it appears.
      x: pickAway(b.minX, b.maxX, pointer.seen ? pointer.x : null),
      y: pickAway(b.minY, b.maxY, pointer.seen ? pointer.y : null),
      vx: Math.cos(angle) * CRUISE,
      vy: Math.sin(angle) * CRUISE,
      spook: 0,
      phase: Math.random() * Math.PI * 2,
    };
    sprite.node.addEventListener('click', () => catchSprite(sprite));
    place(sprite);
    sprites.push(sprite);
    node.appendChild(sprite.node);
  }

  function catchSprite(sprite: Sprite): void {
    const index = sprites.indexOf(sprite);
    if (index === -1) return; // already caught; a stray second click

    const now = Date.now();
    const links = now < chainUntil ? chain + 1 : 1;
    const multiplier = multiplierFor(links);

    // Off the roster before the store update, so the re-sync below sees a
    // sprite count that already agrees with the charges left.
    sprites.splice(index, 1);
    const result = catchMote(store, new Date(now), multiplier);
    if (!result.ok) {
      sprites.splice(index, 0, sprite);
      return;
    }

    chain = links;
    chainUntil = now + MOTE_CHAIN_WINDOW_MS;
    scatter(sprite.x, sprite.y);

    // Let the pop play out on a node nothing else is looking at any more.
    sprite.node.classList.add('mote--caught');
    sprite.node.disabled = true;
    window.setTimeout(() => sprite.node.remove(), 260);

    onCatch(result.lumen, result.multiplier);
  }

  /** A caught mote startles the rest — the field gets twitchier as it empties. */
  function scatter(fromX: number, fromY: number): void {
    for (const sprite of sprites) {
      const dx = sprite.x - fromX;
      const dy = sprite.y - fromY;
      const distance = Math.hypot(dx, dy) || 1;
      sprite.vx += (dx / distance) * BURST * 0.6;
      sprite.vy += (dy / distance) * BURST * 0.6;
      sprite.spook = 1;
    }
  }

  function place(sprite: Sprite): void {
    sprite.node.style.left = `${sprite.x}px`;
    sprite.node.style.top = `${sprite.y}px`;
    sprite.node.style.setProperty('--mote-spook', sprite.spook.toFixed(2));
  }

  /* --------------------------------------------------------------- */
  /* Simulation                                                       */
  /* --------------------------------------------------------------- */

  function move(sprite: Sprite, dt: number): void {
    const b = box();

    // A focused mote holds position: keyboard play is Tab then Enter, and a
    // target that runs from a cursor it can't see would just be unwinnable.
    if (document.activeElement === sprite.node) {
      sprite.spook = Math.max(0, sprite.spook - dt / SPOOK_FADE);
      place(sprite);
      return;
    }

    sprite.phase += dt * 1.7;
    const drift = Math.sin(sprite.phase) * WANDER * dt;
    const cos = Math.cos(drift);
    const sin = Math.sin(drift);
    ({ vx: sprite.vx, vy: sprite.vy } = {
      vx: sprite.vx * cos - sprite.vy * sin,
      vy: sprite.vx * sin + sprite.vy * cos,
    });

    if (pointer.seen) {
      const dx = sprite.x - pointer.x;
      const dy = sprite.y - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance < FLEE_RADIUS) {
        const urgency = 1 - distance / FLEE_RADIUS;
        const away = distance || 1;
        sprite.vx += (dx / away) * FLEE_ACCEL * urgency * dt;
        sprite.vy += (dy / away) * FLEE_ACCEL * urgency * dt;
        sprite.spook = Math.max(sprite.spook, urgency);
      }
    }

    // Speed rides on the scare and bleeds off with it, so a mote that got away
    // coasts back down to a catchable drift instead of pinballing forever.
    const speed = Math.hypot(sprite.vx, sprite.vy);
    const cap = CRUISE + BURST * sprite.spook;
    if (speed > cap) {
      sprite.vx *= cap / speed;
      sprite.vy *= cap / speed;
    } else if (speed < CRUISE) {
      const lift = CRUISE / (speed || 1);
      sprite.vx *= lift;
      sprite.vy *= lift;
    }

    sprite.x += sprite.vx * dt;
    sprite.y += sprite.vy * dt;

    // Walls are hard: cornering a mote is the skill the chase is made of.
    if (sprite.x < b.minX) {
      sprite.x = b.minX;
      sprite.vx = Math.abs(sprite.vx);
    } else if (sprite.x > b.maxX) {
      sprite.x = b.maxX;
      sprite.vx = -Math.abs(sprite.vx);
    }
    if (sprite.y < b.minY) {
      sprite.y = b.minY;
      sprite.vy = Math.abs(sprite.vy);
    } else if (sprite.y > b.maxY) {
      sprite.y = b.maxY;
      sprite.vy = -Math.abs(sprite.vy);
    }

    sprite.spook = Math.max(0, sprite.spook - dt / SPOOK_FADE);
    place(sprite);
  }

  function tick(stamp: number): void {
    const dt = last === 0 ? 0 : Math.min((stamp - last) / 1000, MAX_STEP);
    last = stamp;

    if (!still()) {
      for (const sprite of sprites) move(sprite, dt);
    }
    drawChain();

    frame = window.requestAnimationFrame(tick);
  }

  function drawChain(): void {
    const left = chainUntil - Date.now();
    if (chain === 0 || left <= 0) {
      if (chain !== 0 && left <= 0) chain = 0;
      chainTag.classList.remove('mote-chain--live');
      return;
    }
    chainTag.classList.add('mote-chain--live');
    chainLabel.textContent = `Chain ×${formatMultiplier(multiplierFor(chain + 1))}`;
    chainBar.style.width = `${((left / MOTE_CHAIN_WINDOW_MS) * 100).toFixed(1)}%`;
  }

  /* --------------------------------------------------------------- */
  /* Store, input, lifecycle                                          */
  /* --------------------------------------------------------------- */

  /**
   * Tops the field up to the charges on hand. Only ever adds or trims — an
   * existing mote is never rebuilt, so catching one leaves the others flying.
   */
  function sync(): void {
    const state = store.getState();
    const active = Math.min(
      state.motes.date === today() ? state.motes.remaining : 0,
      MAX_ON_SCREEN,
    );

    node.hidden = active === 0 && sprites.length === 0;
    while (sprites.length > active) sprites.pop()?.node.remove();
    if (sprites.length < active) measure();
    while (sprites.length < active) spawn();
  }

  const onPointerMove = (event: PointerEvent): void => {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) size = { width: rect.width, height: rect.height };
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.seen = true;
  };

  const onPointerLeave = (): void => {
    pointer.seen = false;
  };

  const onResize = (): void => {
    measure();
    const b = box();
    for (const sprite of sprites) {
      sprite.x = Math.min(b.maxX, Math.max(b.minX, sprite.x));
      sprite.y = Math.min(b.maxY, Math.max(b.minY, sprite.y));
      place(sprite);
    }
  };

  measure();
  sync();
  const unsubscribe = store.subscribe(sync);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('resize', onResize);
  frame = window.requestAnimationFrame(tick);

  return {
    el: node,
    destroy: () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('resize', onResize);
      unsubscribe();
    },
  };
}

/** Value of the nth catch in a chain — the first link is always plain. */
export function multiplierFor(links: number): number {
  return Math.min(MOTE_CHAIN_MAX, 1 + MOTE_CHAIN_STEP * Math.max(0, links - 1));
}

/** `2` / `1.75` — no trailing zeroes on a round multiplier. */
function formatMultiplier(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** A coordinate in the range, biased away from `avoid` if the cursor is in it. */
function pickAway(min: number, max: number, avoid: number | null): number {
  let best = min + Math.random() * (max - min);
  if (avoid === null) return best;
  for (let i = 0; i < 4; i += 1) {
    if (Math.abs(best - avoid) > FLEE_RADIUS) break;
    best = min + Math.random() * (max - min);
  }
  return best;
}

/** Toast copy for a caught mote. */
export function moteCaughtMessage(lumen: number, multiplier = 1): string {
  const gain = `+${formatBig(lumen)} Lumen`;
  return multiplier > 1
    ? `Chain ×${formatMultiplier(multiplier)} — ${gain}.`
    : `Caught a mote. ${gain}.`;
}
