/**
 * Streak lighting.
 *
 * The whole scene is lit from one number: how far the current streak has come
 * toward 20. At 0 the city sits in a cold blue pre-dawn; at 20 it's in full
 * golden hour. Everything — sky, clouds, rock, façades, window glow, stars —
 * moves together along that one axis, which is what makes it read as *light*
 * rather than as a recoloured UI.
 *
 * Colours are interpolated in linear-light space; mixing warm and cool sRGB
 * values directly goes grey and muddy through the middle of the ramp.
 */
import { MULTIPLIER_CAP_STREAK } from '@/config/tuning';

export interface ScenePalette {
  skyTop: string;
  skyBottom: string;
  skyHorizon: string;
  sunCore: string;
  sunGlow: string;
  /** Sun height as a fraction of the scene: 0 = below the cloud deck, 1 = high. */
  sunRise: number;
  sunOpacity: number;
  cloudFar: string;
  cloudNear: string;
  cloudHighlight: string;
  islandTop: string;
  islandRock: string;
  islandShadow: string;
  facadeLit: string;
  facadeShade: string;
  roof: string;
  windowGlow: string;
  windowOpacity: number;
  starOpacity: number;
  haze: string;
  /** Warm rim light along sunward edges. */
  rim: string;
  rimOpacity: number;
}

/**
 * Three stops rather than two: the midpoint is where a straight A→B blend
 * looks worst, so it gets its own hand-picked mauve dawn.
 */
const STOPS: { at: number; palette: ScenePalette }[] = [
  {
    at: 0,
    palette: {
      skyTop: '#040c1c',
      skyBottom: '#0d2340',
      skyHorizon: '#17314f',
      sunCore: '#3f6f9c',
      sunGlow: '#1d3b5e',
      sunRise: 0.02,
      sunOpacity: 0.25,
      cloudFar: '#12263f',
      cloudNear: '#1d3554',
      cloudHighlight: '#2c4a70',
      islandTop: '#24425f',
      islandRock: '#101f34',
      islandShadow: '#070f1e',
      facadeLit: '#2a4160',
      facadeShade: '#16263c',
      roof: '#1b3048',
      windowGlow: '#7fb2d6',
      windowOpacity: 0.28,
      starOpacity: 0.85,
      haze: '#0a1a30',
      rim: '#5b86ad',
      rimOpacity: 0.25,
    },
  },
  {
    at: 0.5,
    palette: {
      skyTop: '#0b1e3d',
      skyBottom: '#31406a',
      skyHorizon: '#7a5878',
      sunCore: '#e08f7a',
      sunGlow: '#8a5a76',
      sunRise: 0.42,
      sunOpacity: 0.7,
      cloudFar: '#39456c',
      cloudNear: '#5b5f83',
      cloudHighlight: '#9b7f96',
      islandTop: '#3c5570',
      islandRock: '#1e2b45',
      islandShadow: '#0c1425',
      facadeLit: '#4b5470',
      facadeShade: '#23304a',
      roof: '#3a3d5e',
      windowGlow: '#f3bd7d',
      windowOpacity: 0.62,
      starOpacity: 0.22,
      haze: '#2a3358',
      rim: '#d99a72',
      rimOpacity: 0.5,
    },
  },
  {
    at: 1,
    palette: {
      skyTop: '#14355f',
      skyBottom: '#7f6f8f',
      skyHorizon: '#f5a94e',
      sunCore: '#ffe0a8',
      sunGlow: '#f5a94e',
      sunRise: 0.78,
      sunOpacity: 1,
      cloudFar: '#7f7fa0',
      cloudNear: '#c79a86',
      cloudHighlight: '#ffd9a8',
      islandTop: '#6d7f7a',
      islandRock: '#33324a',
      islandShadow: '#151a2e',
      facadeLit: '#c78f63',
      facadeShade: '#4a3f57',
      roof: '#6b4a55',
      windowGlow: '#fff0cf',
      windowOpacity: 1,
      starOpacity: 0,
      haze: '#e0a978',
      rim: '#ffd9a0',
      rimOpacity: 0.85,
    },
  },
];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const srgbToLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const linearToSrgb = (channel: number): number => {
  const c = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return Math.round(clamp01(c) * 255);
};

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Blends two hex colours in linear-light space. */
export function mixColor(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const mixed = a.map((channel, index) => {
    const start = srgbToLinear(channel);
    const end = srgbToLinear(b[index] ?? channel);
    return linearToSrgb(start + (end - start) * t);
  }) as [number, number, number];
  return rgbToHex(mixed);
}

const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

function blendPalettes(from: ScenePalette, to: ScenePalette, t: number): ScenePalette {
  const out = {} as Record<string, string | number>;
  for (const key of Object.keys(from) as (keyof ScenePalette)[]) {
    const a = from[key];
    const b = to[key];
    out[key] =
      typeof a === 'number' && typeof b === 'number' ? lerp(a, b, t) : mixColor(String(a), String(b), t);
  }
  return out as unknown as ScenePalette;
}

/** How far along the lighting ramp a streak sits, 0–1. */
export function streakProgress(streak: number): number {
  return clamp01(streak / MULTIPLIER_CAP_STREAK);
}

/** The lit palette at progress `t` (0 = pre-dawn, 1 = golden hour). */
export function paletteForProgress(t: number): ScenePalette {
  const progress = clamp01(t);
  for (let i = 0; i < STOPS.length - 1; i += 1) {
    const lower = STOPS[i]!;
    const upper = STOPS[i + 1]!;
    if (progress <= upper.at) {
      const span = upper.at - lower.at;
      const local = span === 0 ? 0 : (progress - lower.at) / span;
      return blendPalettes(lower.palette, upper.palette, local);
    }
  }
  return STOPS[STOPS.length - 1]!.palette;
}

/**
 * Palette → CSS custom properties. The scene and the page background both read
 * these, so the whole app shifts with the streak, not just the artwork.
 */
export function paletteToCssVars(palette: ScenePalette): Record<string, string> {
  return {
    '--sky-top': palette.skyTop,
    '--sky-bottom': palette.skyBottom,
    '--sky-horizon': palette.skyHorizon,
    '--scene-sun-core': palette.sunCore,
    '--scene-sun-glow': palette.sunGlow,
    '--scene-sun-opacity': String(palette.sunOpacity),
    '--scene-cloud-far': palette.cloudFar,
    '--scene-cloud-near': palette.cloudNear,
    '--scene-cloud-highlight': palette.cloudHighlight,
    '--scene-island-top': palette.islandTop,
    '--scene-island-rock': palette.islandRock,
    '--scene-island-shadow': palette.islandShadow,
    '--scene-facade-lit': palette.facadeLit,
    '--scene-facade-shade': palette.facadeShade,
    '--scene-roof': palette.roof,
    '--scene-window': palette.windowGlow,
    '--scene-window-opacity': String(palette.windowOpacity),
    '--scene-star-opacity': String(palette.starOpacity),
    '--scene-haze': palette.haze,
    '--scene-rim': palette.rim,
    '--scene-rim-opacity': String(palette.rimOpacity),
  };
}
