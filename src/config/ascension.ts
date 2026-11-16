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
 * Total Aether a lifetime Lumen figure is worth:
 * `AETHER_SCALE × (log10(lifetime) − AETHER_LOG_FLOOR) ^ AETHER_POWER`.
 *
 * Logarithmic, and it has to be. The Lumen curve is exponential in *time* —
 * that is the whole shape of the game — so any power of lifetime Lumen, however
 * small, comes out exponential in time too. The cube root this used to be paid
 * a first ascension of five hundred Aether after two months of ordinary play,
 * against a tree that cost two hundred. On the log instead, every order of
 * magnitude pays a little more than the last: a first ascension around the
 * seventh week is worth about ten, a trillion-Lumen city about twenty, and one
 * a million times richer than that about seventy — not two million.
 */
export const AETHER_SCALE = 2;
export const AETHER_LOG_FLOOR = 7;
export const AETHER_POWER = 1.5;

/**
 * Ascending is refused below this much Aether. A handful, not one: an ascension
 * resets the whole city, and doing it for a single point of Aether is a mistake
 * the game should not offer.
 */
export const MIN_ASCENSION_AETHER = 5;

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
