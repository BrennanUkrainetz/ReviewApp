/**
 * Inline SVG glyphs. Drawn rather than pulled from an emoji font so the UI
 * keeps one visual voice and inherits `currentColor`.
 */

const wrap = (body: string, viewBox = '0 0 24 24'): string =>
  `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.6"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
     focusable="false" width="100%" height="100%">${body}</svg>`;

/** Sunrise over the cloud shelf — the streak mark. */
export const iconStreak = (): string =>
  wrap(`
    <path d="M12 4.5v2.2M5.6 7.1l1.5 1.5M18.4 7.1l-1.5 1.5" />
    <path d="M7.2 14.5a4.8 4.8 0 0 1 9.6 0" fill="currentColor" fill-opacity="0.18" />
    <path d="M3.5 14.5h17M5.5 18h5M13 18h5.5" />
  `);

/** Four-point spark — Lumen. */
export const iconLumen = (): string =>
  wrap(`
    <path d="M12 3.2c.7 4.5 2.6 6.4 7.1 7.1-4.5.7-6.4 2.6-7.1 7.1-.7-4.5-2.6-6.4-7.1-7.1 4.5-.7 6.4-2.6 7.1-7.1Z"
      fill="currentColor" fill-opacity="0.22" />
    <path d="M18.6 16.2c.3 1.7 1 2.4 2.7 2.7-1.7.3-2.4 1-2.7 2.7-.3-1.7-1-2.4-2.7-2.7 1.7-.3 2.4-1 2.7-2.7Z"
      fill="currentColor" fill-opacity="0.22" />
  `);

export const iconCheck = (): string => wrap('<path d="M4.5 12.5 9.5 17.5 19.5 6.5" stroke-width="2" />');

export const iconSkip = (): string => wrap('<path d="M7 12h10M13 8l4 4-4 4" />');

export const iconBack = (): string => wrap('<path d="M15 5l-7 7 7 7" />');

export const iconClose = (): string => wrap('<path d="M6 6l12 12M18 6L6 18" />');

export const iconShop = (): string =>
  wrap(`
    <path d="M4 9h16l-1.2 10.2a1.5 1.5 0 0 1-1.5 1.3H6.7a1.5 1.5 0 0 1-1.5-1.3L4 9Z" />
    <path d="M8.5 9V6.8a3.5 3.5 0 0 1 7 0V9" />
  `);

export const iconHistory = (): string =>
  wrap(`
    <path d="M4 19V6M4 19h16" />
    <path d="M8 16v-4M12.5 16V8M17 16v-6" />
  `);

export const iconSettings = (): string =>
  wrap(`
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
  `);

export const iconDayOff = (): string =>
  wrap(`
    <path d="M20 14.5a6 6 0 0 1-8.6-7.9 7 7 0 1 0 8.6 7.9Z" fill="currentColor" fill-opacity="0.15" />
  `);

export const iconLock = (): string =>
  wrap(`
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
  `);

export const iconChest = (): string =>
  wrap(`
    <path d="M3.5 10.5A5 5 0 0 1 8.5 5.5h7a5 5 0 0 1 5 5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19v-8.5Z" />
    <path d="M3.5 12.5h17M10.5 12.5v-2h3v2" />
  `);
