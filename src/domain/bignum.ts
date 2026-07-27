/**
 * Formatting for numbers that outgrow a thousands separator.
 *
 * The economy is exponential by design, so Lumen totals pass through millions
 * and into the trillions over a couple of months of daily use. `1.24T` reads
 * instantly; `1,240,000,000,000` does not.
 *
 * Values stay ordinary JS numbers. Float64 holds integers exactly to ~9e15
 * (just past `Qa`), and only loses low-order digits above that — irrelevant
 * here, since nothing is ever displayed to more than three significant digits.
 */

/**
 * Short scale, starting at 10^3 and running to 10^63 (vigintillion). The
 * high-island ladder and a few ascensions of output multipliers climb well
 * into this range; past the end of it, `formatBig` falls back to scientific
 * notation, so the number stays readable however large the city gets.
 */
const SUFFIXES = [
  '',
  'K',
  'M',
  'B',
  'T',
  'Qa',
  'Qi',
  'Sx',
  'Sp',
  'Oc',
  'No',
  'Dc',
  'Ud',
  'Dd',
  'Td',
  'Qad',
  'Qid',
  'Sxd',
  'Spd',
  'Ocd',
  'Nod',
  'Vg',
] as const;

const STEP = 1000;

/** Digits after the point, chosen so every formatted value reads at 3 s.f. */
function precisionFor(scaled: number): number {
  if (scaled < 10) return 2;
  if (scaled < 100) return 1;
  return 0;
}

/**
 * `formatBig(1240)` → `1.24K`, `formatBig(38_000_000_000_000)` → `38.0T`.
 *
 * Anything under 1000 is written out in full — small numbers are exact numbers
 * in this game, and `0.94K` would be a strange way to say 940.
 */
export function formatBig(value: number): string {
  if (!Number.isFinite(value)) return '—';

  const sign = value < 0 ? '-' : '';
  const magnitude = Math.abs(value);

  if (magnitude < STEP) {
    return (
      sign + Math.floor(magnitude).toLocaleString(undefined, { maximumFractionDigits: 0 })
    );
  }

  const tier = Math.floor(Math.log10(magnitude) / 3);
  // Past the named scale, three significant figures in scientific notation
  // beat a suffix nobody can name — `1.23e69` reads; `1230000Vg` does not.
  if (tier >= SUFFIXES.length) return sign + magnitude.toExponential(2);

  const scaled = magnitude / STEP ** tier;

  // Rounding can push a value up a tier (999.7K → "1000K"); re-check once.
  const precision = precisionFor(scaled);
  const rounded = Number(scaled.toFixed(precision));
  if (rounded >= STEP && tier < SUFFIXES.length - 1) {
    return `${sign}1.00${SUFFIXES[tier + 1]}`;
  }

  return sign + rounded.toFixed(precision) + SUFFIXES[tier];
}

/**
 * A multiplier, written the way a player reads it: `×2`, `×1.5`, `×12.4K`.
 * Trailing zeroes are dropped below 1000 so `×2` doesn't render as `×2.00`.
 */
export function formatMultiplier(value: number): string {
  if (!Number.isFinite(value)) return '×—';
  if (value >= STEP) return `×${formatBig(value)}`;
  const rounded = Math.round(value * 100) / 100;
  return `×${rounded}`;
}

/** `+12.4K` — signed, for deltas in the chest and the shop preview. */
export function formatDelta(value: number): string {
  return (value >= 0 ? '+' : '') + formatBig(value);
}
