/**
 * Ascension: the altitude the city climbs to, and the Aether it earns getting
 * there.
 *
 * Ascending resets Lumen and every building, and grants Aether to spend in the
 * perk tree. It deliberately does **not** touch the streak, the history, or
 * the real-world milestone count — those record actual behaviour, and a game
 * mechanic has no business resetting them.
 */

/**
 * Aether granted for a lifetime total is `(lifetime / SCALE) ^ EXPONENT`.
 *
 * A cube root, following the shape every prestige curve settles on: the first
 * ascension arrives after a couple of weeks with a handful of Aether, and a
 * thousand-fold richer city is worth ten times as much, not a thousand.
 */
export const ASCENSION_LUMEN_SCALE = 100_000;
export const ASCENSION_EXPONENT = 1 / 3;

/** Ascending is refused below this much Aether, so it can't be wasted early. */
export const MIN_ASCENSION_AETHER = 1;

export interface AltitudeBand {
  name: string;
  blurb: string;
  /** Colour the whole scene drifts toward at this altitude. */
  tint: string;
  /** How far toward `tint` the palette moves, 0–1. */
  strength: number;
  /** Added to star opacity — the air thins as the city climbs. */
  starBoost: number;
}

/**
 * One band per ascension, and the last one repeats forever. This is the
 * visible reward for prestiging: the sky the city sits in genuinely changes,
 * on top of whatever the streak lighting is doing.
 */
export const ALTITUDE_BANDS: AltitudeBand[] = [
  {
    name: 'Cloud Shelf',
    blurb: 'Where the city started. Warm, low, and busy.',
    tint: '#0b1e3d',
    strength: 0,
    starBoost: 0,
  },
  {
    name: 'Cirrus',
    blurb: 'Thin ice cloud, and a great deal more light.',
    tint: '#8fd8d2',
    strength: 0.16,
    starBoost: 0.05,
  },
  {
    name: 'Stratosphere',
    blurb: 'Above the weather entirely. Nothing up here moves but you.',
    tint: '#4f6fb5',
    strength: 0.26,
    starBoost: 0.14,
  },
  {
    name: 'Aurora',
    blurb: 'The sky picked up a colour it will not explain.',
    tint: '#63e0a8',
    strength: 0.32,
    starBoost: 0.24,
  },
  {
    name: 'The Quiet Dark',
    blurb: 'Far enough that the sun is just another star, and closer.',
    tint: '#2a1b4d',
    strength: 0.42,
    starBoost: 0.42,
  },
];

/** The band for an ascension count. The final band repeats past the last one. */
export function bandFor(ascensions: number): AltitudeBand {
  const index = Math.min(Math.max(ascensions, 0), ALTITUDE_BANDS.length - 1);
  return ALTITUDE_BANDS[index] ?? ALTITUDE_BANDS[0]!;
}
