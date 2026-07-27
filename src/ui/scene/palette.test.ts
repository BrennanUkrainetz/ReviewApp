import { describe, expect, it } from 'vitest';
import { MULTIPLIER_CAP_STREAK } from '@/config/tuning';
import {
  mixColor,
  paletteForProgress,
  paletteToCssVars,
  streakProgress,
} from './palette';

/** Rough perceived brightness of a hex colour, 0–255. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((offset) =>
    parseInt(value.slice(offset, offset + 2), 16),
  );
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** Warmth = how far red runs ahead of blue. */
function warmth(hex: string): number {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return r - b;
}

describe('streakProgress', () => {
  it('runs 0 → 1 across the streak that reaches golden hour', () => {
    expect(streakProgress(0)).toBe(0);
    expect(streakProgress(MULTIPLIER_CAP_STREAK / 2)).toBeCloseTo(0.5);
    expect(streakProgress(MULTIPLIER_CAP_STREAK)).toBe(1);
  });

  it('clamps rather than overshooting past the cap', () => {
    expect(streakProgress(500)).toBe(1);
    expect(streakProgress(-3)).toBe(0);
  });
});

describe('mixColor', () => {
  it('returns the endpoints exactly', () => {
    expect(mixColor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixColor('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('mixes in linear light, so mid-grey lands above the naive average', () => {
    // A straight sRGB average would give #808080 (128); linear-light is ~188.
    expect(luminance(mixColor('#000000', '#ffffff', 0.5))).toBeGreaterThan(170);
  });
});

describe('paletteForProgress', () => {
  it('gets brighter and warmer as the streak climbs', () => {
    const dawn = paletteForProgress(0);
    const middle = paletteForProgress(0.5);
    const gold = paletteForProgress(1);

    expect(luminance(dawn.skyHorizon)).toBeLessThan(luminance(middle.skyHorizon));
    expect(luminance(middle.skyHorizon)).toBeLessThan(luminance(gold.skyHorizon));

    expect(warmth(dawn.skyHorizon)).toBeLessThan(warmth(gold.skyHorizon));
    expect(warmth(dawn.windowGlow)).toBeLessThan(warmth(gold.windowGlow));
  });

  it('raises the sun and fades the stars out', () => {
    expect(paletteForProgress(0).sunRise).toBeLessThan(paletteForProgress(1).sunRise);
    expect(paletteForProgress(0).starOpacity).toBeGreaterThan(0.5);
    expect(paletteForProgress(1).starOpacity).toBe(0);
  });

  it('moves monotonically — no dip halfway through the ramp', () => {
    const samples = Array.from({ length: 21 }, (_, i) => paletteForProgress(i / 20));
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]!.windowOpacity).toBeGreaterThanOrEqual(
        samples[i - 1]!.windowOpacity,
      );
      expect(samples[i]!.sunRise).toBeGreaterThanOrEqual(samples[i - 1]!.sunRise);
      expect(samples[i]!.starOpacity).toBeLessThanOrEqual(samples[i - 1]!.starOpacity);
    }
  });

  it('clamps outside 0–1 instead of extrapolating', () => {
    expect(paletteForProgress(-1)).toEqual(paletteForProgress(0));
    expect(paletteForProgress(9)).toEqual(paletteForProgress(1));
  });
});

describe('paletteToCssVars', () => {
  it('emits every variable the stylesheet reads, as strings', () => {
    const vars = paletteToCssVars(paletteForProgress(0.5));
    expect(vars['--sky-top']).toMatch(/^#[0-9a-f]{6}$/);
    expect(vars['--scene-window-opacity']).toBe(
      String(paletteForProgress(0.5).windowOpacity),
    );
    expect(Object.keys(vars)).toContain('--scene-star-opacity');
    expect(Object.values(vars).every((value) => typeof value === 'string')).toBe(true);
  });
});
