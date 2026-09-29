/**
 * Icon set — GENERATED, do not edit by hand.
 *
 * Drawings come from Lucide v1.31.0 (ISC, https://lucide.dev), the
 * community fork of Feather Icons. They are vendored here so the app keeps no
 * runtime dependency and every glyph still inherits `currentColor`.
 *
 * Run `npm run icons` to regenerate; the icon-to-name mapping lives in
 * `scripts/build-icons.mjs`.
 */

/**
 * Lucide draws on a 24×24 grid at stroke width 2, and the geometry is tuned for
 * exactly that — scaling the stroke down to match the old hand-drawn set makes
 * the joins look frail at 16–18px, which is where nearly every glyph here is
 * rendered.
 */
const wrap = (body: string, name: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
     focusable="false" width="100%" height="100%" class="lucide lucide-${name}">${body}</svg>`;

/** Sunrise over the horizon — the streak mark. */
export const iconStreak = (): string =>
  wrap(
    `
    <path d="M12 2v8" />
    <path d="m4.93 10.93 1.41 1.41" />
    <path d="M2 18h2" />
    <path d="M20 18h2" />
    <path d="m19.07 10.93-1.41 1.41" />
    <path d="M22 22H2" />
    <path d="m8 6 4-4 4 4" />
    <path d="M16 18a4 4 0 0 0-8 0" />
  `,
    'sunrise',
  );

/** Sparkles — Lumen, the day-to-day currency. */
export const iconLumen = (): string =>
  wrap(
    `
    <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
    <path d="M20 2v4" />
    <path d="M22 4h-4" />
    <circle cx="4" cy="20" r="2" />
  `,
    'sparkles',
  );

/** A cut gem — Aether, and the Ascension screen. */
export const iconAether = (): string =>
  wrap(
    `
    <path d="M10.5 3 8 9l4 13 4-13-2.5-6" />
    <path d="M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z" />
    <path d="M2 9h20" />
  `,
    'gem',
  );

/** A flame — Cinder, the quality currency. */
export const iconCinder = (): string =>
  wrap(
    `
    <path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4" />
  `,
    'flame',
  );

export const iconCheck = (): string =>
  wrap(
    `
    <path d="M20 6 9 17l-5-5" />
  `,
    'check',
  );

export const iconSkip = (): string =>
  wrap(
    `
    <path d="M21 4v16" />
    <path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z" />
  `,
    'skip-forward',
  );

export const iconBack = (): string =>
  wrap(
    `
    <path d="m15 18-6-6 6-6" />
  `,
    'chevron-left',
  );

export const iconClose = (): string =>
  wrap(
    `
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  `,
    'x',
  );

export const iconArrowUp = (): string =>
  wrap(
    `
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  `,
    'arrow-up',
  );

export const iconArrowDown = (): string =>
  wrap(
    `
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  `,
    'arrow-down',
  );

export const iconPlus = (): string =>
  wrap(
    `
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  `,
    'plus',
  );

export const iconTrash = (): string =>
  wrap(
    `
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  `,
    'trash-2',
  );

export const iconShop = (): string =>
  wrap(
    `
    <path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5" />
    <path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244" />
    <path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05" />
  `,
    'store',
  );

/** A bar chart — the Progress screen. */
export const iconHistory = (): string =>
  wrap(
    `
    <path d="M3 3v16a2 2 0 0 0 2 2h16" />
    <path d="M18 17V9" />
    <path d="M13 17V5" />
    <path d="M8 17v-3" />
  `,
    'chart-column',
  );

export const iconSettings = (): string =>
  wrap(
    `
    <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
    <circle cx="12" cy="12" r="3" />
  `,
    'settings',
  );

/** A crescent moon — the day-off button. */
export const iconDayOff = (): string =>
  wrap(
    `
    <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
  `,
    'moon',
  );

export const iconLock = (): string =>
  wrap(
    `
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  `,
    'lock',
  );

/** A wrapped box — the reward chest. */
export const iconChest = (): string =>
  wrap(
    `
    <path d="M12 7v14" />
    <path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" />
    <path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5" />
    <rect x="3" y="7" width="18" height="4" rx="1" />
  `,
    'gift',
  );

/** A vault door — where the city banks its output. */
export const iconVault = (): string =>
  wrap(
    `
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    <path d="m7.9 7.9 2.7 2.7" />
    <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
    <path d="m13.4 10.6 2.7-2.7" />
    <circle cx="7.5" cy="16.5" r=".5" fill="currentColor" />
    <path d="m7.9 16.1 2.7-2.7" />
    <circle cx="16.5" cy="16.5" r=".5" fill="currentColor" />
    <path d="m13.4 13.4 2.7 2.7" />
    <circle cx="12" cy="12" r="2" />
  `,
    'vault',
  );

/** A hammer — the Workshop, where Cinder is spent. */
export const iconWorkshop = (): string =>
  wrap(
    `
    <path d="m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9" />
    <path d="m18 15 4-4" />
    <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5" />
  `,
    'hammer',
  );
